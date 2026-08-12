import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeSync,
} from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { crc32 } from 'node:zlib';

const execFileAsync = promisify(execFile);

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
export function buildIdCardsZipFilename(files: Pick<IdCardDownloadFile, 'name'>[]): string {
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

export type IdCardsZipStaging = {
  readonly entries: string[];
  writeEntry: (relativePath: string, data: Buffer) => Promise<void>;
  finalizeToFile: (destPath: string) => Promise<void>;
  dispose: () => void;
};

/** Write PNGs to disk during render, then one fast store-only zip at the end. */
export function createIdCardsZipStaging(): IdCardsZipStaging {
  const stagingDir = join(tmpdir(), `id-cards-stage-${randomUUID()}`);
  mkdirSync(stagingDir, { recursive: true });
  const entries: string[] = [];

  return {
    get entries() {
      return entries;
    },
    async writeEntry(relativePath: string, data: Buffer) {
      const fullPath = join(stagingDir, relativePath);
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, data);
      entries.push(relativePath);
    },
    async finalizeToFile(destPath: string) {
      const usedNative = await zipDirectoryStoreOnly(stagingDir, destPath);
      if (usedNative) return;
      await buildZipFromStagingJs(stagingDir, entries, destPath);
    },
    dispose() {
      try {
        rmSync(stagingDir, { recursive: true, force: true });
      } catch {
        // Staging dir may already be gone.
      }
    },
  };
}

type ZipCentralEntry = {
  name: Buffer;
  crc: number;
  size: number;
  offset: number;
};

/** Native zlib CRC32 — much faster than a JS loop on multi-MB PNGs. */
function crc32Buffer(data: Buffer): number {
  return crc32(data) >>> 0;
}

function writeLocalFileHeader(
  fd: number,
  name: Buffer,
  data: Buffer,
): { crc: number; size: number; written: number } {
  const crc = crc32Buffer(data);
  const size = data.length;
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(0, 12);
  header.writeUInt32LE(crc, 14);
  header.writeUInt32LE(size, 18);
  header.writeUInt32LE(size, 22);
  header.writeUInt16LE(name.length, 26);
  header.writeUInt16LE(0, 28);
  writeSync(fd, header);
  writeSync(fd, name);
  writeSync(fd, data);
  return { crc, size, written: 30 + name.length + size };
}

function writeCentralDirectory(fd: number, entries: ZipCentralEntry[], cdOffset: number) {
  for (const entry of entries) {
    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(0, 8);
    header.writeUInt16LE(0, 10);
    header.writeUInt16LE(0, 12);
    header.writeUInt16LE(0, 14);
    header.writeUInt32LE(entry.crc, 16);
    header.writeUInt32LE(entry.size, 20);
    header.writeUInt32LE(entry.size, 24);
    header.writeUInt16LE(entry.name.length, 28);
    header.writeUInt16LE(0, 30);
    header.writeUInt16LE(0, 32);
    header.writeUInt16LE(0, 34);
    header.writeUInt16LE(0, 36);
    header.writeUInt16LE(0, 38);
    header.writeUInt32LE(0, 40);
    header.writeUInt32LE(entry.offset, 42);
    writeSync(fd, header);
    writeSync(fd, entry.name);
  }

  const cdSize = entries.reduce((sum, e) => sum + 46 + e.name.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(cdOffset, 16);
  eocd.writeUInt16LE(0, 20);
  writeSync(fd, eocd);
}

async function buildIdCardsZipToFileJs(
  files: IdCardDownloadFile[],
  destPath: string,
  onFile?: (index: number, total: number) => void,
): Promise<void> {
  const fd = openSync(destPath, 'w');
  const central: ZipCentralEntry[] = [];
  let offset = 0;

  try {
    for (let i = 0; i < files.length; i += 1) {
      onFile?.(i + 1, files.length);

      const file = files[i];
      const name = Buffer.from(file.name, 'utf8');
      const data = file.buffer;
      const localOffset = offset;
      const { crc, size, written } = writeLocalFileHeader(fd, name, data);
      central.push({ name, crc, size, offset: localOffset });
      offset += written;
    }

    const cdOffset = offset;
    writeCentralDirectory(fd, central, cdOffset);
  } finally {
    closeSync(fd);
  }
}

async function buildZipFromStagingJs(
  stagingDir: string,
  entryPaths: string[],
  destPath: string,
): Promise<void> {
  const files: IdCardDownloadFile[] = entryPaths.map((name) => ({
    name,
    buffer: readFileSync(join(stagingDir, name)),
  }));
  await buildIdCardsZipToFileJs(files, destPath);
}

/** Store-only zip via system `zip -0` — fastest path when PNGs are already on disk. */
async function zipDirectoryStoreOnly(stagingDir: string, destPath: string): Promise<boolean> {
  if (process.platform === 'win32') return false;

  try {
    await execFileAsync('zip', ['-0', '-q', '-X', destPath, '.'], { cwd: stagingDir });
    return existsSync(destPath);
  } catch {
    try {
      unlinkSync(destPath);
    } catch {
      // Ignore cleanup errors.
    }
    return false;
  }
}

/**
 * Store-only ZIP to disk — no re-compression, no quality change.
 * Uses native zip on Linux when available; fast zlib CRC32 fallback.
 */
export async function buildIdCardsZipToFile(
  files: IdCardDownloadFile[],
  destPath: string,
  onFile?: (index: number, total: number) => void,
): Promise<void> {
  const staging = createIdCardsZipStaging();
  try {
    for (let i = 0; i < files.length; i += 1) {
      await staging.writeEntry(files[i].name, files[i].buffer);
      onFile?.(i + 1, files.length);
    }
    await staging.finalizeToFile(destPath);
  } finally {
    staging.dispose();
  }
}

/** Small in-memory ZIP for direct (non-async) download responses. */
export async function buildIdCardsZip(files: IdCardDownloadFile[]): Promise<Buffer> {
  const tempPath = join(tmpdir(), `id-cards-mem-${randomUUID()}.zip`);
  try {
    await buildIdCardsZipToFile(files, tempPath);
    return readFileSync(tempPath);
  } finally {
    try {
      unlinkSync(tempPath);
    } catch {
      // Temp file may already be gone.
    }
  }
}
