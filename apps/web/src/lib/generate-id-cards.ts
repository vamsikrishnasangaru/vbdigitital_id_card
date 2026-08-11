import api from '@/lib/api';
import { downloadBlob, parseFilenameFromDisposition } from '@/lib/download-blob';

export type GenerateDestination = 'download' | 'drive';

export type DriveStatus = {
  configured: boolean;
  canUpload: boolean;
};

async function readApiErrorMessage(data: unknown, fallback: string): Promise<string> {
  if (!data) return fallback;
  if (typeof data === 'string') return data || fallback;
  if (data instanceof Blob) {
    try {
      const text = await data.text();
      if (!text.trim()) return fallback;
      try {
        const json = JSON.parse(text) as { message?: string | string[] };
        if (Array.isArray(json.message)) return json.message.join(' · ');
        if (json.message) return json.message;
      } catch {
        return text.slice(0, 500);
      }
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
    const axiosErr = err as { response?: { data?: unknown }; message?: string };
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
