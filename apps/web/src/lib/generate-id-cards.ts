import api, { type VbAxiosConfig } from '@/lib/api';
import { downloadBlob, parseFilenameFromDisposition } from '@/lib/download-blob';

export type GenerateDestination = 'download' | 'drive';

export type DriveStatus = {
  configured: boolean;
  canUpload: boolean;
};

async function readApiErrorMessage(data: unknown, fallback: string): Promise<string> {
  if (!data) return fallback;
  if (typeof data === 'string') return normalizeApiErrorText(data, fallback);
  if (data instanceof Blob) {
    try {
      const text = await data.text();
      return normalizeApiErrorText(text, fallback);
    } catch {
      return fallback;
    }
  }
  if (typeof data === 'object' && data !== null && 'message' in data) {
    const message = (data as { message?: string | string[] }).message;
    if (Array.isArray(message)) return message.join(' · ');
    if (typeof message === 'string') return message;
  }
  return fallback;
}

function normalizeApiErrorText(text: string, fallback: string): string {
  const trimmed = text.trim();
  if (!trimmed) return fallback;

  if (trimmed.startsWith('<') || /<html[\s>]/i.test(trimmed)) {
    if (/504|Gateway Time-out|Gateway Timeout/i.test(trimmed)) {
      return 'Generation timed out. Try fewer students at once, or ask your admin to increase the server timeout (scripts/vps-nginx-generate-timeout.sh).';
    }
    if (/502|Bad Gateway/i.test(trimmed)) {
      return 'Server temporarily unavailable. Please try again in a moment.';
    }
    if (/503|Service Unavailable/i.test(trimmed)) {
      return 'Server is busy. Please try again shortly.';
    }
    return fallback;
  }

  try {
    const json = JSON.parse(trimmed) as { message?: string | string[] };
    if (Array.isArray(json.message)) return json.message.join(' · ');
    if (json.message) return json.message;
  } catch {
    if (trimmed.length > 200 && trimmed.includes('<')) return fallback;
    return trimmed.slice(0, 500);
  }

  return fallback;
}

function coerceDownloadBlob(data: unknown): Blob {
  if (data instanceof Blob) return data;
  if (data instanceof ArrayBuffer) {
    return new Blob([data], { type: 'application/octet-stream' });
  }
  if (
    typeof data === 'object' &&
    data !== null &&
    '_offline' in data
  ) {
    throw new Error(
      (data as { message?: string }).message ||
        'ID card download requires an internet connection.',
    );
  }
  throw new Error('Download failed — server returned invalid file data.');
}

async function ensureBinaryDownloadBlob(blob: Blob): Promise<Blob> {
  const type = blob.type.toLowerCase();
  if (type.includes('json') || type.includes('text/html') || type.includes('text/plain')) {
    const message = await readApiErrorMessage(blob, 'Failed to generate ID cards');
    throw new Error(message);
  }
  if (blob.size === 0) {
    throw new Error('Download failed — server returned an empty file.');
  }
  return blob;
}

export async function fetchDriveStatus(): Promise<DriveStatus> {
  const { data } = await api.get<DriveStatus>('/id-cards/drive-status');
  return data;
}

export function formatGenerateProgressMessage(
  completed: number,
  total: number,
  options?: { phase?: 'rendering' | 'packaging'; status?: 'running' | 'done' | 'failed' },
): string {
  if (total <= 1) return 'Generating ID card…';
  if (completed <= 0) return `Starting generation of ${total} ID cards…`;
  if (options?.status === 'done') return `Downloading ${total} ID cards…`;
  if (options?.phase === 'packaging' || completed >= total) {
    return `Packaging ${total} ID cards for download…`;
  }
  return `Generated ${completed} of ${total} ID cards…`;
}

type GenerateJobStatus = {
  status: 'running' | 'done' | 'failed';
  phase?: 'rendering' | 'packaging';
  completed: number;
  total: number;
  successCount: number;
  failCount: number;
  error?: string;
};

export type GenerateProgressMeta = {
  phase?: 'rendering' | 'packaging';
  status?: 'running' | 'done' | 'failed';
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Slightly under server job TTL (2h) so polling does not quit while the job is still running. */
const GENERATE_JOB_POLL_DEADLINE_MS = 115 * 60 * 1000;
const GENERATE_JOB_POLL_TIMEOUT_MS = 120_000;

const TRANSIENT_HTTP_STATUSES = new Set([502, 503, 504]);

function isTransientPollError(err: unknown): boolean {
  const status = (err as { response?: { status?: number } }).response?.status;
  if (status !== undefined && !TRANSIENT_HTTP_STATUSES.has(status)) return false;
  if (status !== undefined) return true;
  const code = (err as { code?: string }).code;
  if (code === 'ECONNABORTED' || code === 'ERR_NETWORK' || code === 'ETIMEDOUT') return true;
  const message = err instanceof Error ? err.message : String(err ?? '');
  return /network error|timeout|socket hang up|ECONNRESET/i.test(message);
}

async function withTransientRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxAttempts = 8,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err;
      if (!isTransientPollError(err) || attempt >= maxAttempts - 1) break;
      await sleep(1500 * (attempt + 1));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`${label} failed`);
}

async function generateIdCardsDownloadAsync(
  params: { templateId: string; studentIds: string[] },
  onProgress?: (completed: number, total: number, meta?: GenerateProgressMeta) => void,
): Promise<{ kind: 'file'; blob: Blob; filename: string; successCount: number; failCount: number }> {
  const total = params.studentIds.length;
  onProgress?.(0, total);

  const { data: start } = await api.post<{ jobId: string; pollToken: string; total: number }>(
    '/id-cards/generate/async',
    {
      templateId: params.templateId,
      studentIds: params.studentIds,
    },
    {
      timeout: 60_000,
      _skipOfflineQueue: true,
    } as VbAxiosConfig,
  );

  const jobHeaders = { 'X-Generate-Job-Token': start.pollToken };
  const deadline = Date.now() + GENERATE_JOB_POLL_DEADLINE_MS;

  while (Date.now() < deadline) {
    await sleep(300);
    const { data: job } = await withTransientRetry(
      () =>
        api.get<GenerateJobStatus>(`/id-cards/generate/jobs/${start.jobId}`, {
          headers: jobHeaders,
          timeout: GENERATE_JOB_POLL_TIMEOUT_MS,
          _skipOfflineQueue: true,
        } as unknown as VbAxiosConfig),
      'Progress check',
    );
    onProgress?.(job.completed, job.total, { phase: job.phase, status: job.status });

    if (job.status === 'failed') {
      throw new Error(job.error || 'Failed to generate ID cards');
    }

    if (job.status === 'done') {
      onProgress?.(job.total, job.total, { phase: 'packaging', status: 'done' });
      const response = await withTransientRetry(
        () =>
          api.get(`/id-cards/generate/jobs/${start.jobId}/download`, {
            responseType: 'blob',
            timeout: 600_000,
            headers: jobHeaders,
            _skipOfflineQueue: true,
          } as unknown as VbAxiosConfig),
        'Download',
      );

      let blob = coerceDownloadBlob(response.data);
      blob = await ensureBinaryDownloadBlob(blob);

      const filename =
        parseFilenameFromDisposition(response.headers['content-disposition']) ||
        (total === 1 ? 'id-card.png' : 'id-cards.zip');

      return {
        kind: 'file',
        blob,
        filename,
        successCount: job.successCount || Number(response.headers['x-cards-success'] ?? total),
        failCount: job.failCount || Number(response.headers['x-cards-failed'] ?? 0),
      };
    }
  }

  throw new Error(
    'Generation is taking longer than expected. Wait a minute and try again with the same selection, or ask your admin to run scripts/vps-nginx-generate-timeout.sh on the server and redeploy the API.',
  );
}

export async function generateIdCards(params: {
  templateId: string;
  studentIds: string[];
  destination: GenerateDestination;
  onProgress?: (completed: number, total: number, meta?: GenerateProgressMeta) => void;
}): Promise<{ kind: 'json'; data: unknown } | { kind: 'file'; blob: Blob; filename: string; successCount: number; failCount: number }> {
  if (params.destination === 'drive') {
    const { data } = await api.post('/id-cards/generate', {
      templateId: params.templateId,
      studentIds: params.studentIds,
      destination: 'drive',
    }, {
      timeout: 600_000,
    });
    return { kind: 'json', data };
  }

  try {
    return await generateIdCardsDownloadAsync(params, params.onProgress);
  } catch (err: unknown) {
    const axiosErr = err as { response?: { data?: unknown; status?: number }; message?: string };
    if (axiosErr.response?.status === 401) {
      throw new Error('Session expired during generation. Please sign in and try again.');
    }
    if (axiosErr.response?.status === 400 || axiosErr.response?.status === 404) {
      const message = axiosErr.response?.data
        ? await readApiErrorMessage(axiosErr.response.data, '')
        : '';
      if (/not found or expired/i.test(message)) {
        throw new Error(
          'Generation job was lost — the server may have restarted during your batch. Please try again (avoid redeploying while a batch is running).',
        );
      }
    }
    if (axiosErr.response?.status === 504) {
      throw new Error(
        'Generation timed out. Try fewer students at once, or ask your admin to run scripts/vps-nginx-generate-timeout.sh on the server.',
      );
    }
    if (axiosErr.response?.data) {
      const message = await readApiErrorMessage(
        axiosErr.response.data,
        'Failed to generate ID cards',
      );
      throw new Error(message);
    }
    throw err instanceof Error ? err : new Error('Failed to generate ID cards');
  }
}

export function triggerIdCardDownload(blob: Blob, filename: string) {
  downloadBlob(blob, filename);
}
