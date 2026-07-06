/**
 * Node HTTP headers only allow visible ASCII in header values (ERR_INVALID_CHAR otherwise).
 * Use for Content-Disposition and similar response headers.
 */
export function toAsciiFilename(value: string, fallback = 'download'): string {
  const ascii = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/["\\]/g, '_')
    .replace(/[\r\n]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[._-]+|[._-]+$/g, '');
  return ascii || fallback;
}

/** Safe Content-Disposition for downloads; supports UTF-8 names via RFC 5987. */
export function contentDispositionAttachment(filename: string): string {
  const ascii = toAsciiFilename(filename);
  const encoded = encodeURIComponent(filename);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
