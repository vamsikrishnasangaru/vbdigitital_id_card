export function downloadBlob(blob: Blob, filename: string) {
  if (!(blob instanceof Blob)) {
    throw new Error('Download failed — invalid file data.');
  }
  if (blob.size === 0) {
    throw new Error('Download failed — empty file.');
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function parseFilenameFromDisposition(header?: string | null): string | null {
  if (!header) return null;
  const utf8 = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8?.[1]) return decodeURIComponent(utf8[1]);
  const plain = header.match(/filename="?([^";\n]+)"?/i);
  return plain?.[1]?.trim() ?? null;
}
