import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

export type GenerateJobStatus = 'running' | 'done' | 'failed';

export type GenerateJobDownloadResult = {
  kind: 'single' | 'zip';
  filename: string;
  buffer?: Buffer;
  /** Large ZIP jobs write to disk to avoid holding PNG + ZIP in RAM. */
  filePath?: string;
  successCount: number;
  failCount: number;
};

type GenerateJobRecord = {
  status: GenerateJobStatus;
  completed: number;
  total: number;
  successCount: number;
  failCount: number;
  pollToken: string;
  error?: string;
  result?: GenerateJobDownloadResult;
  expiresAt: number;
};

/** Keep jobs alive through long batches, packaging, and slow downloads. */
const JOB_TTL_MS = 2 * 60 * 60 * 1000;
const JOB_DIR = join(tmpdir(), 'id-card-generate-jobs');

@Injectable()
export class IdCardsGenerateJobsService {
  private readonly jobs = new Map<string, GenerateJobRecord>();

  createJob(total: number): { jobId: string; pollToken: string } {
    this.pruneExpired();
    const jobId = randomUUID();
    const pollToken = randomUUID();
    const job: GenerateJobRecord = {
      status: 'running',
      completed: 0,
      total,
      successCount: 0,
      failCount: 0,
      pollToken,
      expiresAt: Date.now() + JOB_TTL_MS,
    };
    this.jobs.set(jobId, job);
    this.persistJob(jobId, job);
    return { jobId, pollToken };
  }

  validatePollToken(jobId: string, pollToken: string): boolean {
    const job = this.resolveJob(jobId);
    if (!job) return false;
    return job.pollToken === pollToken;
  }

  updateProgress(jobId: string, completed: number, total?: number) {
    const job = this.resolveJob(jobId);
    if (!job || job.status !== 'running') return;
    job.completed = completed;
    if (total !== undefined) job.total = total;
    this.touchJobRecord(jobId, job);
  }

  /** Extend TTL during packaging or while the client is polling. */
  touchJob(jobId: string) {
    const job = this.resolveJob(jobId);
    if (!job) return;
    this.touchJobRecord(jobId, job);
  }

  complete(jobId: string, result: GenerateJobDownloadResult) {
    const job = this.resolveJob(jobId);
    if (!job) return;
    job.status = 'done';
    job.completed = job.total;
    job.successCount = result.successCount;
    job.failCount = result.failCount;
    job.result = result;
    this.touchJobRecord(jobId, job);
  }

  fail(jobId: string, error: string) {
    const job = this.resolveJob(jobId);
    if (!job) return;
    job.status = 'failed';
    job.error = error;
    this.touchJobRecord(jobId, job);
  }

  getJob(jobId: string) {
    this.pruneExpired();
    const job = this.resolveJob(jobId);
    if (!job) return null;
    this.touchJobRecord(jobId, job);
    return {
      status: job.status,
      completed: job.completed,
      total: job.total,
      successCount: job.successCount,
      failCount: job.failCount,
      error: job.error,
    };
  }

  consumeDownload(jobId: string): GenerateJobDownloadResult {
    this.pruneExpired();
    const job = this.resolveJob(jobId);
    if (!job || job.status !== 'done' || !job.result) {
      throw new NotFoundException('Generate job not ready for download');
    }
    const result = job.result;
    this.removeJob(jobId, job);
    return result;
  }

  private resolveJob(jobId: string): GenerateJobRecord | null {
    let job = this.jobs.get(jobId);
    if (!job) {
      const loaded = this.loadJob(jobId);
      if (loaded) {
        job = loaded;
        this.jobs.set(jobId, job);
      }
    }
    if (!job || job.expiresAt <= Date.now()) {
      if (job) this.removeJob(jobId, job);
      return null;
    }
    return job;
  }

  private touchJobRecord(jobId: string, job: GenerateJobRecord) {
    job.expiresAt = Date.now() + JOB_TTL_MS;
    this.persistJob(jobId, job);
  }

  private ensureJobDir() {
    if (!existsSync(JOB_DIR)) mkdirSync(JOB_DIR, { recursive: true });
  }

  private jobFilePath(jobId: string) {
    return join(JOB_DIR, `${jobId}.json`);
  }

  private persistJob(jobId: string, job: GenerateJobRecord) {
    this.ensureJobDir();
    const payload = {
      status: job.status,
      completed: job.completed,
      total: job.total,
      successCount: job.successCount,
      failCount: job.failCount,
      pollToken: job.pollToken,
      error: job.error,
      expiresAt: job.expiresAt,
      result: job.result
        ? {
            kind: job.result.kind,
            filename: job.result.filename,
            filePath: job.result.filePath,
            successCount: job.result.successCount,
            failCount: job.result.failCount,
          }
        : undefined,
    };
    writeFileSync(this.jobFilePath(jobId), JSON.stringify(payload));
  }

  private loadJob(jobId: string): GenerateJobRecord | null {
    try {
      const raw = readFileSync(this.jobFilePath(jobId), 'utf8');
      return JSON.parse(raw) as GenerateJobRecord;
    } catch {
      return null;
    }
  }

  private deleteJobFile(jobId: string) {
    try {
      unlinkSync(this.jobFilePath(jobId));
    } catch {
      // File may already be gone.
    }
  }

  private removeJob(jobId: string, job: GenerateJobRecord) {
    if (job.result?.filePath) {
      try {
        unlinkSync(job.result.filePath);
      } catch {
        // Temp ZIP may already be gone.
      }
    }
    this.jobs.delete(jobId);
    this.deleteJobFile(jobId);
  }

  private pruneExpired() {
    const now = Date.now();
    for (const [jobId, job] of [...this.jobs.entries()]) {
      if (job.expiresAt <= now) this.removeJob(jobId, job);
    }

    if (!existsSync(JOB_DIR)) return;
    try {
      for (const file of readdirSync(JOB_DIR)) {
        if (!file.endsWith('.json')) continue;
        const jobId = file.slice(0, -'.json'.length);
        if (this.jobs.has(jobId)) continue;
        const job = this.loadJob(jobId);
        if (!job || job.expiresAt <= now) {
          if (job) this.removeJob(jobId, job);
          else this.deleteJobFile(jobId);
        } else {
          this.jobs.set(jobId, job);
        }
      }
    } catch {
      // Ignore directory read errors.
    }
  }
}
