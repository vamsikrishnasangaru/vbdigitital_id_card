/**
 * Generic GET response cache — any API read cached while online is available offline.
 * Size-capped so localStorage QuotaExceededError cannot slow the app.
 */

const CACHE_KEY = 'vb_offline_get_cache';
/** Fewer entries — large student/template lists fill quota quickly. */
const MAX_ENTRIES = 64;
/** Skip caching single responses larger than ~400KB (student lists need room). */
const MAX_ENTRY_BYTES = 400_000;
/** Hard cap for the whole cache (~3MB). */
const MAX_STORE_BYTES = 3_000_000;

type CacheEntry = {
  data: unknown;
  timestamp: number;
  bytes: number;
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

function estimateBytes(data: unknown): number {
  try {
    return JSON.stringify(data).length;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

function storeByteSize(store: CacheStore): number {
  let total = 2;
  for (const key of Object.keys(store)) {
    total += key.length + (store[key].bytes || 0) + 24;
  }
  return total;
}

function readStore(): CacheStore {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    if (raw.length > MAX_STORE_BYTES) {
      localStorage.removeItem(CACHE_KEY);
      return {};
    }
    return JSON.parse(raw) as CacheStore;
  } catch {
    try {
      localStorage.removeItem(CACHE_KEY);
    } catch {
      // ignore
    }
    return {};
  }
}

function trimStore(store: CacheStore): CacheStore {
  let keys = Object.keys(store);
  if (!keys.length) return store;

  keys.sort((a, b) => store[a].timestamp - store[b].timestamp);

  while (keys.length > MAX_ENTRIES || storeByteSize(store) > MAX_STORE_BYTES) {
    const oldest = keys.shift();
    if (!oldest) break;
    delete store[oldest];
  }

  return store;
}

function writeStore(store: CacheStore) {
  if (typeof window === 'undefined') return;

  const trimmed = trimStore(store);

  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(trimmed));
    return;
  } catch (e) {
    const isQuota =
      e instanceof DOMException &&
      (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014);
    if (!isQuota) {
      console.warn('offline-get-cache: write failed', e);
      return;
    }
  }

  try {
    localStorage.removeItem(CACHE_KEY);
    const keys = Object.keys(trimmed).sort((a, b) => trimmed[b].timestamp - trimmed[a].timestamp);
    const minimal: CacheStore = {};
    for (const key of keys.slice(0, 12)) {
      minimal[key] = trimmed[key];
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(minimal));
  } catch {
    try {
      localStorage.removeItem(CACHE_KEY);
    } catch {
      // ignore
    }
  }
}

/** Drop bloated cache from older builds on startup. */
function purgeOversizedCacheOnLoad() {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw && raw.length > MAX_STORE_BYTES) {
      localStorage.removeItem(CACHE_KEY);
    }
  } catch {
    // ignore
  }
}

purgeOversizedCacheOnLoad();

export const offlineGetCache = {
  set(url: string, params: unknown, data: unknown) {
    const bytes = estimateBytes(data);
    if (bytes > MAX_ENTRY_BYTES) return;

    const key = buildGetCacheKey(url, params);
    const store = readStore();
    store[key] = { data, timestamp: Date.now(), bytes };
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
      return null;
    }
    const allHit = this.get('/templates', { allSchools: 'true' });
    if (allHit) return allHit;
    return this.get('/templates', { allSchools: 'true' });
  },

  clear() {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(CACHE_KEY);
  },
};
