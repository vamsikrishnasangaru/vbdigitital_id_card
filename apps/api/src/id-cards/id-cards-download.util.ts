import archiver from 'archiver';
import { PassThrough } from 'stream';

export type IdCardDownloadFile = { name: string; buffer: Buffer };

export async function buildIdCardsZip(files: IdCardDownloadFile[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 9 } });
    const stream = new PassThrough();
    const chunks: Buffer[] = [];

    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
    archive.on('error', reject);

    archive.pipe(stream);
    for (const file of files) {
      archive.append(file.buffer, { name: `id-cards/${file.name}` });
    }
    void archive.finalize();
  });
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
