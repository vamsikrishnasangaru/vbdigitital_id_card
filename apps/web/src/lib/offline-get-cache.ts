/**
 * Generic GET response cache — any API read cached while online is available offline.
 */

const CACHE_KEY = 'vb_offline_get_cache';
const MAX_ENTRIES = 250;

type CacheEntry = {
  data: unknown;
  timestamp: number;
};

type CacheStore = Record<string, CacheEntry>;

function stableSerialize(value: unknown): string {
  if (value == null) return '';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableSerialize(obj[k])}`).join(',')}}`;
}

export function normalizeApiPath(url: string): string {
  const path = (url || '').split('?')[0] || '';
  if (!path) return '/';
  return path.startsWith('/') ? path : `/${path}`;
}

export function buildGetCacheKey(url: string, params?: unknown): string {
  return `${normalizeApiPath(url)}::${stableSerialize(params)}`;
}

function readStore(): CacheStore {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as CacheStore;
  } catch {
    return {};
  }
}

function writeStore(store: CacheStore) {
  if (typeof window === 'undefined') return;
  try {
    const keys = Object.keys(store);
    if (keys.length > MAX_ENTRIES) {
      const sorted = keys.sort((a, b) => store[a].timestamp - store[b].timestamp);
      const toRemove = sorted.slice(0, keys.length - MAX_ENTRIES);
      for (const k of toRemove) delete store[k];
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(store));
  } catch (e) {
    console.warn('offline-get-cache: write failed', e);
  }
}

export const offlineGetCache = {
  set(url: string, params: unknown, data: unknown) {
    const key = buildGetCacheKey(url, params);
    const store = readStore();
    store[key] = { data, timestamp: Date.now() };
    writeStore(store);
  },

  get(url: string, params?: unknown): unknown | null {
    const key = buildGetCacheKey(url, params);
    const entry = readStore()[key];
    return entry?.data ?? null;
  },

  /** Match templates list with or without schoolId param. */
  getTemplatesList(schoolId?: string): unknown | null {
    if (schoolId) {
      const hit = this.get('/templates', { schoolId });
      if (hit) return hit;
    }
    return this.get('/templates', schoolId ? { schoolId } : undefined) ?? this.get('/templates', {});
  },

  clear() {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(CACHE_KEY);
  },
};
