import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Map stored upload paths to a same-origin URL so Konva can export PNG/PDF (avoids tainted canvas). */
export function proxiedUploadUrl(url: string): string | null {
  const match = url.match(/\/uploads\/(.+)$/);
  if (!match) return null;
  return `/media-uploads/${match[1]}`;
}

/** Resolve API-relative upload paths (e.g. /uploads/templates/...) to a full URL. */
export function resolveMediaUrl(url?: string | null): string {
  if (!url) return '';
  if (url.startsWith('data:') || url.startsWith('blob:')) return url;

  const proxied = proxiedUploadUrl(url);
  if (proxied) return proxied;

  if (url.startsWith('http')) return url;

  const base = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1').replace(/\/$/, '');
  const absolute = `${base}${url.startsWith('/') ? url : `/${url}`}`;
  return proxiedUploadUrl(absolute) ?? absolute;
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
