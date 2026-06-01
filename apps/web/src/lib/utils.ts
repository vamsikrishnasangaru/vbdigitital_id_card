import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Same-origin URL for files under apps/api/uploads (nginx or Next → Nest). */
export function uploadPublicUrl(relativePath: string): string {
  const clean = relativePath.replace(/^\/+/, '').replace(/^uploads\//, '').replace(/\/+$/, '');
  if (!clean) return '';
  return `/api/v1/uploads/${clean}`;
}

/** Extract path under uploads/ from stored values (several legacy formats). */
export function extractUploadRelativePath(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  const withoutOrigin = trimmed.replace(/^https?:\/\/[^/]+/i, '');

  const fromApi = withoutOrigin.match(/\/api\/v1\/uploads\/(.+)$/i);
  if (fromApi) return fromApi[1];

  const fromUploads = withoutOrigin.match(/\/uploads\/(.+)$/i);
  if (fromUploads) return fromUploads[1];

  const fromMedia = withoutOrigin.match(/\/media-uploads\/(.+)$/i);
  if (fromMedia) return fromMedia[1];

  if (withoutOrigin.startsWith('uploads/')) {
    return withoutOrigin.slice('uploads/'.length);
  }

  // Bare filename (e.g. 1780298562990-iy37do.jpeg) — served via by-name lookup
  if (/^[^/]+\.(jpe?g|png|gif|webp)$/i.test(withoutOrigin)) {
    return `by-name/${withoutOrigin}`;
  }

  return null;
}

/** Map stored upload paths to a same-origin URL so Konva can export PNG/PDF (avoids tainted canvas). */
export function proxiedUploadUrl(url: string): string | null {
  const relative = extractUploadRelativePath(url);
  if (!relative) return null;
  return uploadPublicUrl(relative);
}

/** Resolve API-relative upload paths (e.g. /uploads/templates/...) to a full URL. */
export function resolveMediaUrl(url?: string | null): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) return trimmed;
  if (trimmed.startsWith('color:') || trimmed.startsWith('gradient:')) return trimmed;

  const proxied = proxiedUploadUrl(trimmed);
  if (proxied) return proxied;

  if (trimmed.startsWith('http')) {
    const fromRemote = proxiedUploadUrl(trimmed);
    if (fromRemote) return fromRemote;
    try {
      const parsed = new URL(trimmed);
      const pathProxied = proxiedUploadUrl(`${parsed.pathname}${parsed.search}`);
      if (pathProxied) return pathProxied;
    } catch {
      /* ignore malformed URLs */
    }
    return trimmed;
  }

  const base = (process.env.NEXT_PUBLIC_API_URL || '/api/v1').replace(/\/$/, '');
  const absolute = `${base}${trimmed.startsWith('/') ? trimmed : `/${trimmed}`}`;
  const resolved = proxiedUploadUrl(absolute) ?? absolute;
  if (/\/api\/v1\/uploads\/?$/.test(resolved)) return '';
  return resolved;
}

export function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  }).format(new Date(date));
}

export function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

export function getStatusColor(status: string) {
  const map: Record<string, string> = {
    DRAFT: 'status-draft', SUBMITTED: 'status-submitted',
    APPROVED: 'status-approved', REJECTED: 'status-rejected',
    PENDING: 'status-submitted', PRINTING: 'status-printing',
    PRINTED: 'status-approved', DISPATCHED: 'status-submitted',
    DELIVERED: 'status-delivered', QUEUED: 'status-draft',
    COMPLETED: 'status-approved', FAILED: 'status-rejected',
    PACKED: 'status-draft', IN_TRANSIT: 'status-printing',
    PROCESSING: 'status-printing', CANCELLED: 'status-rejected',
    active: 'status-approved', inactive: 'status-rejected',
  };
  return map[status] || 'status-draft';
}
