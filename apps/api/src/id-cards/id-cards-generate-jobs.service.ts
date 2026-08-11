import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

export type GenerateJobStatus = 'running' | 'done' | 'failed';
export type GenerateJobPhase = 'rendering' | 'packaging' | 'uploading';
export type GenerateJobDestination = 'download' | 'drive';

export type GenerateJobDownloadResult = {
  kind: 'single' | 'zip';
  filename: string;
  buffer?: Buffer;
  /** Large ZIP jobs write to disk to avoid holding PNG + ZIP in RAM. */
  filePath?: string;
  successCount: number;
  failCount: number;
};

export type GenerateJobDriveResult = {
  kind: 'drive';
  message: string;
  successCount: number;
  failCount: number;
};

export type GenerateJobResult = GenerateJobDownloadResult | GenerateJobDriveResult;

type GenerateJobRecord = {
  status: GenerateJobStatus;
  phase: GenerateJobPhase;
  destination: GenerateJobDestination;
  completed: number;
  total: number;
  successCount: number;
  failCount: number;
  pollToken: string;
  error?: string;
  result?: GenerateJobResult;
  packagingCompleted?: number;
  uploadCompleted?: number;
  expiresAt: number;
};

/** Keep jobs alive through long batches, packaging, and slow downloads. */
const JOB_TTL_MS = 2 * 60 * 60 * 1000;
const JOB_DIR = join(tmpdir(), 'id-card-generate-jobs');
/** Avoid syncing job JSON to disk on every 300ms poll — that blocked the API. */
const JOB_PERSIST_INTERVAL_MS = 10_000;

@Injectable()
export class IdCardsGenerateJobsService {
  private readonly logger = new Logger(IdCardsGenerateJobsService.name);
  private readonly jobs = new Map<string, GenerateJobRecord>();
  private readonly lastPersistMs = new Map<string, number>();

  createJob(total: number, destination: GenerateJobDestination = 'download'): { jobId: string; pollToken: string } {
    this.pruneExpired();
    const jobId = randomUUID();
    const pollToken = randomUUID();
    const job: GenerateJobRecord = {
      status: 'running',
      phase: 'rendering',
      destination,
      completed: 0,
      total,
      successCount: 0,
      failCount: 0,
      pollToken,
      expiresAt: Date.now() + JOB_TTL_MS,
    };
    this.jobs.set(jobId, job);
    this.persistJob(jobId, job, true);
    return { jobId, pollToken };
  }

  validatePollToken(jobId: string, pollToken: string): boolean {
    const job = this.getOrLoadJob(jobId);
    if (!job) return false;
    return job.pollToken === pollToken;
  }

  updateProgress(jobId: string, completed: number, total?: number) {
    const job = this.getOrLoadJob(jobId);
    if (!job || job.status !== 'running') return;
    job.phase = 'rendering';
    job.completed = completed;
    if (total !== undefined) job.total = total;
    this.touchJobRecord(jobId, job);
  }

  setPackaging(jobId: string) {
    const job = this.getOrLoadJob(jobId);
    if (!job || job.status !== 'running') return;
    job.phase = 'packaging';
    job.completed = job.total;
    job.packagingCompleted = 0;
    this.touchJobRecord(jobId, job, true);
  }

  updatePackagingProgress(jobId: string, packagingCompleted: number, total?: number) {
    const job = this.getOrLoadJob(jobId);
    if (!job || job.status !== 'running' || job.phase !== 'packaging') return;
    job.packagingCompleted = packagingCompleted;
    if (total !== undefined) job.total = total;
    job.completed = job.total;
    this.touchJobRecord(jobId, job);
  }

  setUploading(jobId: string, total?: number) {
    const job = this.getOrLoadJob(jobId);
    if (!job || job.status !== 'running') return;
    job.phase = 'uploading';
    job.completed = 0;
    job.uploadCompleted = 0;
    if (total !== undefined) job.total = total;
    this.touchJobRecord(jobId, job, true);
  }

  updateUploadProgress(jobId: string, uploadCompleted: number, total?: number) {
    const job = this.getOrLoadJob(jobId);
    if (!job || job.status !== 'running' || job.phase !== 'uploading') return;
    job.uploadCompleted = uploadCompleted;
    job.completed = uploadCompleted;
    if (total !== undefined) job.total = total;
    this.touchJobRecord(jobId, job);
  }

  /** Extend TTL during packaging or while the client is polling. */
  touchJob(jobId: string) {
    const job = this.getOrLoadJob(jobId);
    if (!job) return;
    this.touchJobRecord(jobId, job);
  }

  complete(jobId: string, result: GenerateJobResult) {
    const job = this.getOrLoadJob(jobId) ?? this.loadJob(jobId);
    if (!job) {
      this.logger.warn(`Generate job ${jobId} missing at complete — result was ready`);
      return;
    }
    if (!this.jobs.has(jobId)) this.jobs.set(jobId, job);
    job.status = 'done';
    job.phase = result.kind === 'drive' ? 'uploading' : 'packaging';
    job.completed = job.total;
    job.successCount = result.successCount;
    job.failCount = result.failCount;
    job.result = result;
    this.touchJobRecord(jobId, job, true);
  }

  fail(jobId: string, error: string) {
    const job = this.getOrLoadJob(jobId);
    if (!job) {
      this.logger.warn(`Generate job ${jobId} missing at fail: ${error}`);
      return;
    }
    job.status = 'failed';
    job.error = error;
    this.touchJobRecord(jobId, job, true);
  }

  getJob(jobId: string) {
    this.pruneExpired();
    const job = this.getOrLoadJob(jobId);
    if (!job) return null;
    this.touchJobRecord(jobId, job);

    const response = {
      status: job.status,
      destination: job.destination,
      phase: job.phase,
      completed: job.completed,
      total: job.total,
      packagingCompleted: job.packagingCompleted,
      uploadCompleted: job.uploadCompleted,
      successCount: job.successCount,
      failCount: job.failCount,
      error: job.error,
      message: job.result?.kind === 'drive' ? job.result.message : undefined,
    };

    if (job.status === 'done' && job.destination === 'drive' && job.result?.kind === 'drive') {
      this.removeJob(jobId, job);
    }

    return response;
  }

  consumeDownload(jobId: string): GenerateJobDownloadResult {
    this.pruneExpired();
    const job = this.getOrLoadJob(jobId);
    if (!job || job.status !== 'done' || !job.result || job.result.kind === 'drive') {
      throw new NotFoundException('Generate job not ready for download');
    }
    const result = job.result;
    // Keep temp ZIP on disk until the HTTP response finishes streaming.
    this.removeJob(jobId, job, { keepResultFile: true });
    return result;
  }

  private getOrLoadJob(jobId: string): GenerateJobRecord | null {
    let job = this.jobs.get(jobId);
    if (!job) {
      const loaded = this.loadJob(jobId);
      if (loaded) {
        job = loaded;
        this.jobs.set(jobId, job);
      }
    }
    if (!job || job.expiresAt <= Date.now()) return null;
    if (!job.phase) job.phase = 'rendering';
    return job;
  }

  private touchJobRecord(jobId: string, job: GenerateJobRecord, forceDisk = false) {
    job.expiresAt = Date.now() + JOB_TTL_MS;
    const now = Date.now();
    const last = this.lastPersistMs.get(jobId) ?? 0;
    if (forceDisk || job.status !== 'running' || now - last >= JOB_PERSIST_INTERVAL_MS) {
      this.persistJob(jobId, job, forceDisk);
      this.lastPersistMs.set(jobId, now);
    }
  }

  private ensureJobDir() {
    if (!existsSync(JOB_DIR)) mkdirSync(JOB_DIR, { recursive: true });
  }

  private jobFilePath(jobId: string) {
    return join(JOB_DIR, `${jobId}.json`);
  }

  private persistJob(jobId: string, job: GenerateJobRecord, sync = false) {
    this.ensureJobDir();
    const payload = {
      status: job.status,
      destination: job.destination,
      phase: job.phase,
      completed: job.completed,
      total: job.total,
      packagingCompleted: job.packagingCompleted,
      uploadCompleted: job.uploadCompleted,
      successCount: job.successCount,
      failCount: job.failCount,
      pollToken: job.pollToken,
      error: job.error,
      expiresAt: job.expiresAt,
      result: job.result
        ? job.result.kind === 'drive'
          ? {
              kind: job.result.kind,
              message: job.result.message,
              successCount: job.result.successCount,
              failCount: job.result.failCount,
            }
          : {
              kind: job.result.kind,
              filename: job.result.filename,
              filePath: job.result.filePath,
              successCount: job.result.successCount,
              failCount: job.result.failCount,
            }
        : undefined,
    };
    const body = JSON.stringify(payload);
    if (sync) {
      writeFileSync(this.jobFilePath(jobId), body);
      return;
    }
    setImmediate(() => {
      try {
        writeFileSync(this.jobFilePath(jobId), body);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Failed to persist generate job ${jobId}: ${message}`);
      }
    });
  }

  private loadJob(jobId: string): GenerateJobRecord | null {
    try {
      const raw = readFileSync(this.jobFilePath(jobId), 'utf8');
      const job = JSON.parse(raw) as GenerateJobRecord;
      if (!job.phase) job.phase = job.status === 'done' ? 'packaging' : 'rendering';
      if (!job.destination) job.destination = 'download';
      return job;
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

  private removeJob(jobId: string, job: GenerateJobRecord, options?: { keepResultFile?: boolean }) {
    if (job.result?.kind !== 'drive' && job.result?.filePath && !options?.keepResultFile) {
      try {
        unlinkSync(job.result.filePath);
      } catch {
        // Temp ZIP may already be gone.
      }
    }
    this.jobs.delete(jobId);
    this.lastPersistMs.delete(jobId);
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
