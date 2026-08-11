import api from '@/lib/api';
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

export async function fetchDriveStatus(): Promise<DriveStatus> {
  const { data } = await api.get<DriveStatus>('/id-cards/drive-status');
  return data;
}

export async function generateIdCards(params: {
  templateId: string;
  studentIds: string[];
  destination: GenerateDestination;
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
    const response = await api.post('/id-cards/generate', {
      templateId: params.templateId,
      studentIds: params.studentIds,
      destination: 'download',
    }, {
      responseType: 'blob',
      timeout: 600_000,
    });

    const blob = response.data as Blob;
    const contentType = String(response.headers['content-type'] || blob.type || '');

    if (contentType.includes('application/json') || (blob.type && blob.type.includes('json'))) {
      const message = await readApiErrorMessage(blob, 'Failed to generate ID cards');
      throw new Error(message);
    }

    const filename =
      parseFilenameFromDisposition(response.headers['content-disposition']) ||
      (params.studentIds.length === 1 ? 'id-card.png' : 'id-cards.zip');

    const successCount = Number(response.headers['x-cards-success'] ?? params.studentIds.length);
    const failCount = Number(response.headers['x-cards-failed'] ?? 0);

    return { kind: 'file', blob, filename, successCount, failCount };
  } catch (err: unknown) {
    const axiosErr = err as { response?: { data?: unknown; status?: number }; message?: string };
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
