import api from '@/lib/api';
import { downloadBlob, parseFilenameFromDisposition } from '@/lib/download-blob';

export type GenerateDestination = 'download' | 'drive';

export type DriveStatus = {
  configured: boolean;
  canUpload: boolean;
};

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

  const response = await api.post('/id-cards/generate', {
    templateId: params.templateId,
    studentIds: params.studentIds,
    destination: 'download',
  }, {
    responseType: 'blob',
  });

  const blob = response.data as Blob;
  const filename =
    parseFilenameFromDisposition(response.headers['content-disposition']) ||
    (params.studentIds.length === 1 ? 'id-card.png' : 'id-cards.zip');

  const successCount = Number(response.headers['x-cards-success'] ?? params.studentIds.length);
  const failCount = Number(response.headers['x-cards-failed'] ?? 0);

  return { kind: 'file', blob, filename, successCount, failCount };
}

export function triggerIdCardDownload(blob: Blob, filename: string) {
  downloadBlob(blob, filename);
}
