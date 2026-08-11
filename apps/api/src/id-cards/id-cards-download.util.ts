import { writeFileSync } from 'fs';
import { zipSync } from 'fflate';

export type IdCardDownloadFile = { name: string; buffer: Buffer };

type StudentFolderSource = {
  school?: { name?: string | null } | null;
  class?: { name?: string | null } | null;
  section?: {
    name?: string | null;
    class?: { name?: string | null; school?: { name?: string | null } | null } | null;
  } | null;
};

/** Safe folder/file segment for ZIP paths and download names. */
export function sanitizeDownloadSegment(value: string): string {
  const cleaned = value
    .trim()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '-')
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/\.+$/g, '');
  return cleaned || 'Unknown';
}

export function studentFolderParts(student: StudentFolderSource): {
  school: string;
  className: string;
  section: string;
} {
  const school =
    student.school?.name ||
    student.section?.class?.school?.name ||
    'School';
  const className =
    student.class?.name ||
    student.section?.class?.name ||
    'Class';
  const section = student.section?.name || 'Section';
  return {
    school: sanitizeDownloadSegment(school),
    className: sanitizeDownloadSegment(className),
    section: sanitizeDownloadSegment(section),
  };
}

export function idCardZipEntryPath(
  student: StudentFolderSource,
  fileName: string,
): string {
  const { school, className, section } = studentFolderParts(student);
  return `${school}/${className}/${section}/${fileName}`;
}

export function idCardFileBaseName(student: {
  admissionNumber?: string | null;
  rollNumber?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}): string {
  const id = student.rollNumber || student.admissionNumber || 'student';
  const name = `${student.firstName ?? ''}_${student.lastName ?? ''}`.replace(/\s+/g, '_');
  return `${id}_${name}`.replace(/[^a-zA-Z0-9._-]/g, '_');
}

/** ZIP download name: School_Class_Section.zip when paths share one combo. */
export function buildIdCardsZipFilename(files: IdCardDownloadFile[]): string {
  const parts = files.map((f) => f.name.split('/').filter(Boolean));
  if (parts.length === 0) return 'id-cards.zip';

  const schools = new Set(parts.map((p) => p[0]));
  const classes = new Set(parts.map((p) => p[1]));
  const sections = new Set(parts.map((p) => p[2]));

  const join = (...segments: string[]) =>
    segments.map((s) => s.replace(/\s+/g, '_')).join('_');

  if (schools.size === 1 && classes.size === 1 && sections.size === 1) {
    return `${join(parts[0][0], parts[0][1], parts[0][2])}.zip`;
  }
  if (schools.size === 1 && classes.size === 1) {
    return `${join(parts[0][0], parts[0][1])}.zip`;
  }
  if (schools.size === 1) {
    return `${join(parts[0][0])}_id-cards.zip`;
  }

  const stamp = new Date().toISOString().slice(0, 10);
  return `id-cards_${stamp}.zip`;
}

function zipEntriesFromFiles(files: IdCardDownloadFile[]): Record<string, Uint8Array> {
  const entries: Record<string, Uint8Array> = {};
  for (const file of files) {
    entries[file.name] = new Uint8Array(file.buffer);
  }
  return entries;
}

/** Fast store-only ZIP — PNGs are already compressed; no quality change. */
export function buildIdCardsZip(files: IdCardDownloadFile[]): Buffer {
  return Buffer.from(zipSync(zipEntriesFromFiles(files), { level: 0 }));
}

/** Write ZIP to disk so async jobs avoid holding PNG + ZIP buffers in RAM. */
export function buildIdCardsZipToFile(files: IdCardDownloadFile[], destPath: string): void {
  writeFileSync(destPath, zipSync(zipEntriesFromFiles(files), { level: 0 }));
}
