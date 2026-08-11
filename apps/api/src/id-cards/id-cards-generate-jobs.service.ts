import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';

export type GenerateJobStatus = 'running' | 'done' | 'failed';

export type GenerateJobDownloadResult = {
  kind: 'single' | 'zip';
  filename: string;
  buffer: Buffer;
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

/** Keep finished jobs long enough for slow downloads and large batches. */
const JOB_TTL_MS = 60 * 60 * 1000;

@Injectable()
export class IdCardsGenerateJobsService {
  private readonly jobs = new Map<string, GenerateJobRecord>();

  createJob(total: number): { jobId: string; pollToken: string } {
    this.pruneExpired();
    const jobId = randomUUID();
    const pollToken = randomUUID();
    this.jobs.set(jobId, {
      status: 'running',
      completed: 0,
      total,
      successCount: 0,
      failCount: 0,
      pollToken,
      expiresAt: Date.now() + JOB_TTL_MS,
    });
    return { jobId, pollToken };
  }

  validatePollToken(jobId: string, pollToken: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job || job.expiresAt <= Date.now()) return false;
    return job.pollToken === pollToken;
  }

  updateProgress(jobId: string, completed: number, total?: number) {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== 'running') return;
    job.completed = completed;
    if (total !== undefined) job.total = total;
    job.expiresAt = Date.now() + JOB_TTL_MS;
  }

  complete(jobId: string, result: GenerateJobDownloadResult) {
    const job = this.jobs.get(jobId);
    if (!job) return;
    job.status = 'done';
    job.completed = job.total;
    job.successCount = result.successCount;
    job.failCount = result.failCount;
    job.result = result;
    job.expiresAt = Date.now() + JOB_TTL_MS;
  }

  fail(jobId: string, error: string) {
    const job = this.jobs.get(jobId);
    if (!job) return;
    job.status = 'failed';
    job.error = error;
    job.expiresAt = Date.now() + JOB_TTL_MS;
  }

  getJob(jobId: string) {
    this.pruneExpired();
    const job = this.jobs.get(jobId);
    if (!job) return null;
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
    const job = this.jobs.get(jobId);
    if (!job || job.status !== 'done' || !job.result) {
      throw new NotFoundException('Generate job not ready for download');
    }
    const result = job.result;
    this.jobs.delete(jobId);
    return result;
  }

  private pruneExpired() {
    const now = Date.now();
    for (const [jobId, job] of this.jobs.entries()) {
      if (job.expiresAt <= now) this.jobs.delete(jobId);
    }
  }
}
