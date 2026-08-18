import { getOriginalStudentPhotoUrl } from '@/lib/designer-utils';
import { downloadBlob } from '@/lib/download-blob';
import { formatStudentFullName } from '@/lib/utils';

function extensionFromUrlOrType(url: string, mime: string): string {
  const fromUrl = url.match(/\.(jpe?g|png|gif|webp|bmp)(?:\?|$)/i);
  if (fromUrl) {
    const ext = fromUrl[1].toLowerCase();
    return ext === 'jpeg' ? 'jpg' : ext;
  }
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('gif')) return 'gif';
  if (mime.includes('bmp')) return 'bmp';
  return 'jpg';
}

function photoDownloadName(student: Record<string, unknown>, ext: string): string {
  const name = formatStudentFullName(
    typeof student.firstName === 'string' ? student.firstName : '',
    typeof student.lastName === 'string' ? student.lastName : '',
  );
  const admission = typeof student.admissionNumber === 'string' ? student.admissionNumber.trim() : '';
  const raw = [name, admission].filter(Boolean).join('_') || 'student';
  const safe = raw.replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '').replace(/\s+/g, '_').slice(0, 80);
  return `${safe || 'student'}_original.${ext}`;
}

export function hasOriginalStudentPhoto(student: Record<string, unknown> | null | undefined): boolean {
  return Boolean(getOriginalStudentPhotoUrl(student));
}

/** Downloads the stored original upload/capture (not the cropped ID-card PNG). */
export async function downloadOriginalStudentPhoto(
  student: Record<string, unknown> | null | undefined,
): Promise<void> {
  const url = getOriginalStudentPhotoUrl(student);
  if (!url || !student) {
    throw new Error('This student has no original photo');
  }

  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) {
    throw new Error('Could not download the original photo');
  }

  const blob = await response.blob();
  if (!blob.size) {
    throw new Error('Original photo file is empty');
  }

  downloadBlob(blob, photoDownloadName(student, extensionFromUrlOrType(url, blob.type)));
}
