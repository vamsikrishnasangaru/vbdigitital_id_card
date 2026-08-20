/**
 * Durable template detail cache (includes frontConfig / backgrounds for offline preview).
 */
import { get, set } from 'idb-keyval';
import { createStore } from 'idb-keyval';
import { mirrorOfflineKeyToIndexedDb } from '@/lib/offline-indexeddb';

const DATA_DB = createStore('vb-offline-data', 'kv');
const KEY_PREFIX = 'vb_template_detail::';
const META_KEY = 'vb_template_detail_meta';

function storageKey(id: string): string {
  return `${KEY_PREFIX}${id}`;
}

function listMeta(): string[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeMeta(ids: string[]) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(META_KEY, JSON.stringify([...new Set(ids)]));
  } catch {
    // ignore
  }
}

export function cacheTemplateDetail(template: Record<string, unknown> & { id?: string }): void {
  const id = typeof template?.id === 'string' ? template.id : '';
  if (!id || typeof window === 'undefined') return;
  const key = storageKey(id);
  try {
    localStorage.setItem(key, JSON.stringify(template));
    writeMeta([...listMeta(), id]);
  } catch {
    // Quota — keep IndexedDB copy
  }
  void mirrorOfflineKeyToIndexedDb(key, template);
  void set(key, { value: template, updatedAt: Date.now() }, DATA_DB);
}

export function getCachedTemplateDetail(id: string): Record<string, unknown> | null {
  if (!id || typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(storageKey(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return parsed?.id ? parsed : null;
  } catch {
    return null;
  }
}

export async function getCachedTemplateDetailAsync(
  id: string,
): Promise<Record<string, unknown> | null> {
  const local = getCachedTemplateDetail(id);
  if (local) return local;
  if (!id) return null;
  try {
    const envelope = await get<{ value: Record<string, unknown>; updatedAt: number }>(
      storageKey(id),
      DATA_DB,
    );
    const value = envelope?.value;
    if (!value?.id) return null;
    try {
      localStorage.setItem(storageKey(id), JSON.stringify(value));
      writeMeta([...listMeta(), id]);
    } catch {
      // ignore
    }
    return value;
  } catch {
    return null;
  }
}

/** Media URLs needed to render a template offline (backgrounds + config assets). */
export function collectTemplateMediaUrls(template: Record<string, unknown> | null | undefined): string[] {
  if (!template) return [];
  const urls: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === 'string' && v && !v.startsWith('data:') && !v.startsWith('color:') && !v.startsWith('gradient:')) {
      urls.push(v);
    }
  };
  push(template.frontBgUrl);
  push(template.backBgUrl);
  push(template.logoUrl);
  push(template.signatureUrl);

  const walk = (node: unknown) => {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (typeof node !== 'object') return;
    const obj = node as Record<string, unknown>;
    for (const key of ['src', 'url', 'imageUrl', 'photoUrl', 'backgroundUrl', 'fill']) {
      push(obj[key]);
    }
    for (const value of Object.values(obj)) walk(value);
  };
  walk(template.frontConfig);
  walk(template.backConfig);
  return [...new Set(urls)];
}
