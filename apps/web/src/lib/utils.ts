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

/** Same as resolveMediaUrl but absolute (needed for headless Konva render). */
export function resolveMediaUrlAbsolute(url?: string | null): string {
  const resolved = resolveMediaUrl(url);
  if (!resolved) return '';
  if (resolved.startsWith('data:') || resolved.startsWith('blob:') || resolved.startsWith('http')) {
    return resolved;
  }
  if (typeof window !== 'undefined') {
    return `${window.location.origin}${resolved.startsWith('/') ? resolved : `/${resolved}`}`;
  }
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

/** Keep digits only, max 10 — for Indian mobile input fields. */
export function sanitizeIndianMobileInput(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 10);
}

export function isTenDigitMobile(value: string): boolean {
  return /^\d{10}$/.test(value.trim());
}

/** True when last name is empty or the legacy "-" placeholder. */
export function isPlaceholderLastName(lastName?: string | null): boolean {
  const t = lastName?.trim();
  return !t || t === '-';
}

export function formatStudentLastName(lastName?: string | null): string {
  return isPlaceholderLastName(lastName) ? '' : lastName!.trim();
}

export function formatStudentFullName(firstName?: string | null, lastName?: string | null): string {
  return `${firstName?.trim() || ''} ${formatStudentLastName(lastName)}`.trim();
}

/** True when section is empty or an internal placeholder (not shown on cards/lists). */
export function isPlaceholderSectionName(name?: string | null): boolean {
  const t = name?.trim();
  if (!t) return true;
  const lower = t.toLowerCase();
  return lower === 'n/a' || t === '—' || t === '-';
}

/** Internal section name stored when a student has a class but no section selected. */
export const INTERNAL_NO_SECTION_NAME = '—';

export function formatSectionName(name?: string | null): string {
  return isPlaceholderSectionName(name) ? '' : name!.trim();
}

export function formatClassSectionLabel(
  className?: string | null,
  sectionName?: string | null,
  separator = ' · ',
): string {
  const cls = className?.trim();
  const clsDisplay = cls && cls.toLowerCase() !== 'unassigned' ? cls : '';
  const sec = formatSectionName(sectionName);
  if (clsDisplay && sec) return `${clsDisplay}${separator}${sec}`;
  return clsDisplay || sec;
}
