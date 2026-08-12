import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
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
  failures?: { studentId: string; error: string }[];
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
  progressMessage?: string;
  result?: GenerateJobResult;
  packagingCompleted?: number;
  uploadCompleted?: number;
  startedAt: number;
  lastProgressAt: number;
  expiresAt: number;
};

/** Keep jobs alive through long batches, packaging, and slow downloads. */
const JOB_TTL_MS = 2 * 60 * 60 * 1000;
const JOB_DIR = join(tmpdir(), 'id-card-generate-jobs');
/** Avoid syncing job JSON to disk on every 300ms poll — that blocked the API. */
const JOB_PERSIST_INTERVAL_MS = 10_000;
/** Fail jobs that never advance (e.g. API OOM restart left them orphaned on disk). */
const STALE_JOB_MS_BEFORE_FIRST_CARD = 20 * 60 * 1000;
const STALE_JOB_MS_AFTER_PROGRESS = Math.max(
  8 * 60 * 1000,
  Math.min(45 * 60 * 1000, Number(process.env.ID_CARD_JOB_STALE_AFTER_PROGRESS_MS) || 25 * 60 * 1000),
);

@Injectable()
export class IdCardsGenerateJobsService implements OnModuleInit {
  private readonly logger = new Logger(IdCardsGenerateJobsService.name);
  private readonly jobs = new Map<string, GenerateJobRecord>();
  private readonly lastPersistMs = new Map<string, number>();

  onModuleInit() {
    this.failOrphanedRunningJobs();
  }

  createJob(total: number, destination: GenerateJobDestination = 'download'): { jobId: string; pollToken: string } {
    this.pruneExpired();
    const jobId = randomUUID();
    const pollToken = randomUUID();
    const now = Date.now();
    const job: GenerateJobRecord = {
      status: 'running',
      phase: 'rendering',
      destination,
      completed: 0,
      total,
      successCount: 0,
      failCount: 0,
      pollToken,
      progressMessage: 'Queued — waiting for renderer…',
      startedAt: now,
      lastProgressAt: now,
      expiresAt: now + JOB_TTL_MS,
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

  setPreparing(jobId: string, message: string) {
    const job = this.getOrLoadJob(jobId);
    if (!job || job.status !== 'running') return;
    job.phase = 'rendering';
    job.progressMessage = message;
    this.touchJobRecord(jobId, job);
  }

  updateProgress(jobId: string, completed: number, total?: number) {
    const job = this.getOrLoadJob(jobId);
    if (!job || job.status !== 'running') return;
    job.phase = 'rendering';
    job.completed = completed;
    if (total !== undefined) job.total = total;
    if (completed > 0) job.progressMessage = undefined;
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
    if (!job || job.status !== 'running') return;
    job.packagingCompleted = packagingCompleted;
    if (total !== undefined) job.total = total;
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

  /** Extend TTL during packaging or while the client is polling — does not reset progress heartbeat. */
  touchJob(jobId: string) {
    const job = this.getOrLoadJob(jobId);
    if (!job) return;
    this.touchJobExpiry(jobId, job);
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
    let job = this.getOrLoadJob(jobId);
    if (!job) return null;

    if (job.status === 'running' && this.isJobStale(job)) {
      this.fail(
        jobId,
        'Generation stalled — the server may have restarted or run out of memory. Try again with fewer students, or ask your admin to increase vb-api memory (ecosystem.config.cjs).',
      );
      job = this.getOrLoadJob(jobId);
      if (!job) return null;
    }

    if (job.status === 'running') {
      job.lastProgressAt = Date.now();
    }
    this.touchJobExpiry(jobId, job);

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
      progressMessage: job.status === 'running' ? job.progressMessage : undefined,
      failures:
        job.status === 'done' && job.result && job.result.kind !== 'drive'
          ? job.result.failures
          : undefined,
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

  private isJobStale(job: GenerateJobRecord): boolean {
    const last = job.lastProgressAt ?? job.startedAt ?? 0;
    const limit =
      job.completed > 0 ? STALE_JOB_MS_AFTER_PROGRESS : STALE_JOB_MS_BEFORE_FIRST_CARD;
    return Date.now() - last > limit;
  }

  private failOrphanedRunningJobs() {
    if (!existsSync(JOB_DIR)) return;
    try {
      for (const file of readdirSync(JOB_DIR)) {
        if (!file.endsWith('.json')) continue;
        const jobId = file.slice(0, -'.json'.length);
        const job = this.loadJob(jobId);
        if (!job || job.status !== 'running' || job.expiresAt <= Date.now()) continue;
        this.jobs.set(jobId, job);
        this.fail(
          jobId,
          'Generation was interrupted when the server restarted. Please try again (avoid redeploying during a batch).',
        );
        this.logger.warn(`Marked orphaned generate job ${jobId} as failed after API restart`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to clean orphaned generate jobs: ${message}`);
    }
  }

  private touchJobExpiry(jobId: string, job: GenerateJobRecord, forceDisk = false) {
    job.expiresAt = Date.now() + JOB_TTL_MS;
    const now = Date.now();
    const last = this.lastPersistMs.get(jobId) ?? 0;
    if (forceDisk || job.status !== 'running' || now - last >= JOB_PERSIST_INTERVAL_MS) {
      this.persistJob(jobId, job, forceDisk);
      this.lastPersistMs.set(jobId, now);
    }
  }

  private touchJobRecord(jobId: string, job: GenerateJobRecord, forceDisk = false) {
    job.lastProgressAt = Date.now();
    this.touchJobExpiry(jobId, job, forceDisk);
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
      progressMessage: job.progressMessage,
      startedAt: job.startedAt,
      lastProgressAt: job.lastProgressAt,
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
              failures: job.result.failures,
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
      const now = Date.now();
      if (!job.startedAt) job.startedAt = now;
      if (!job.lastProgressAt) job.lastProgressAt = job.startedAt;
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
