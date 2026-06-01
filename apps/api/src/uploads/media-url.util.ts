import * as fs from 'fs';
import * as path from 'path';

/** Extract path under uploads/ from stored DB values (legacy formats). */
export function extractUploadRelativePath(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  const withoutOrigin = trimmed.replace(/^https?:\/\/[^/]+/i, '');

  const fromApi = withoutOrigin.match(/\/api\/v1\/uploads\/(.+)$/i);
  if (fromApi?.[1]) return fromApi[1].replace(/\/+$/, '') || null;

  const fromUploads = withoutOrigin.match(/\/uploads\/(.+)$/i);
  if (fromUploads?.[1]) return fromUploads[1].replace(/\/+$/, '') || null;

  if (withoutOrigin.startsWith('uploads/')) {
    const rel = withoutOrigin.slice('uploads/'.length).replace(/\/+$/, '');
    return rel || null;
  }

  if (/^[^/]+\.(jpe?g|png|gif|webp)$/i.test(withoutOrigin)) {
    return withoutOrigin;
  }

  return null;
}

export function uploadsFileExists(uploadDir: string, relative: string): boolean {
  const abs = path.join(uploadDir, relative);
  try {
    return fs.existsSync(abs) && fs.statSync(abs).isFile();
  } catch {
    return false;
  }
}

/** Normalize stored upload paths to /uploads/... when the file exists on disk. */
export function normalizeStoredUploadUrl(
  url: string | null | undefined,
  uploadDir: string,
  findByBasename: (name: string) => string | null,
): string {
  if (!url?.trim()) return '';
  const trimmed = url.trim();
  if (trimmed.startsWith('color:') || trimmed.startsWith('gradient:')) return trimmed;

  const relative = extractUploadRelativePath(trimmed);
  if (relative && uploadsFileExists(uploadDir, relative)) {
    return `/uploads/${relative}`;
  }

  const basename = path.basename(relative ?? trimmed);
  if (/^[^/]+\.(jpe?g|png|gif|webp)$/i.test(basename)) {
    const found = findByBasename(basename);
    if (found) return `/uploads/${found}`;
  }

  if (relative) return `/uploads/${relative}`;
  return trimmed;
}

export function normalizeConfigMediaUrls(
  config: unknown,
  uploadDir: string,
  findByBasename: (name: string) => string | null,
): unknown {
  if (!config) return config;
  if (Array.isArray(config)) {
    return config.map((el) => normalizeElementMediaUrls(el, uploadDir, findByBasename));
  }
  if (typeof config === 'object' && config !== null && Array.isArray((config as { elements?: unknown }).elements)) {
    const obj = config as { elements: unknown[] };
    return {
      ...obj,
      elements: obj.elements.map((el) => normalizeElementMediaUrls(el, uploadDir, findByBasename)),
    };
  }
  return config;
}

function normalizeElementMediaUrls(
  el: unknown,
  uploadDir: string,
  findByBasename: (name: string) => string | null,
): unknown {
  if (!el || typeof el !== 'object') return el;
  const item = el as Record<string, unknown>;
  if (typeof item.imageUrl === 'string' && item.imageUrl.trim()) {
    return {
      ...item,
      imageUrl: normalizeStoredUploadUrl(item.imageUrl, uploadDir, findByBasename),
    };
  }
  return el;
}
