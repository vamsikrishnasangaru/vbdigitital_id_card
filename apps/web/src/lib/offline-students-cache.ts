/**
 * Durable per-school student lists for offline Super Admin school switching.
 * Generic GET cache (64 entries / 400KB) drops large school lists — this store does not.
 */
import { get } from 'idb-keyval';
import { createStore } from 'idb-keyval';
import { mirrorOfflineKeyToIndexedDb } from '@/lib/offline-indexeddb';

const DATA_DB = createStore('vb-offline-data', 'kv');
const KEY_PREFIX = 'vb_school_students::';
const META_KEY = 'vb_school_students_meta';

export type SchoolStudentsCache = {
  data: unknown[];
  total: number;
  cachedAt: number;
};

function storageKey(schoolId: string): string {
  return `${KEY_PREFIX}${schoolId}`;
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

function slimStudentsPayload(data: unknown[]): unknown[] {
  return data.map((row) => {
    if (!row || typeof row !== 'object') return row;
    const s = { ...(row as Record<string, unknown>) };
    // Never persist huge data-URLs in the school list cache.
    if (typeof s.photoUrl === 'string' && s.photoUrl.startsWith('data:')) {
      s.photoUrl = null;
    }
    return s;
  });
}

/** Sync read (localStorage). */
export function getCachedStudentsForSchool(schoolId: string): SchoolStudentsCache | null {
  if (!schoolId || typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(storageKey(schoolId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SchoolStudentsCache;
    if (!parsed || !Array.isArray(parsed.data)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Async read — falls back to IndexedDB when localStorage was evicted. */
export async function getCachedStudentsForSchoolAsync(
  schoolId: string,
): Promise<SchoolStudentsCache | null> {
  const local = getCachedStudentsForSchool(schoolId);
  if (local) return local;
  if (!schoolId) return null;
  try {
    const envelope = await get<{ value: SchoolStudentsCache; updatedAt: number }>(
      storageKey(schoolId),
      DATA_DB,
    );
    const value = envelope?.value;
    if (!value || !Array.isArray(value.data)) return null;
    // Rehydrate localStorage for sync path next time.
    try {
      localStorage.setItem(storageKey(schoolId), JSON.stringify(value));
      writeMeta([...listMeta(), schoolId]);
    } catch {
      // ignore quota
    }
    return value;
  } catch {
    return null;
  }
}

export function cacheStudentsForSchool(
  schoolId: string,
  payload: { data?: unknown[]; total?: number } | unknown[],
): void {
  if (!schoolId || typeof window === 'undefined') return;
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray(payload.data)
      ? payload.data
      : null;
  if (!list) return;

  const entry: SchoolStudentsCache = {
    data: slimStudentsPayload(list),
    total: Array.isArray(payload)
      ? list.length
      : typeof payload.total === 'number'
        ? payload.total
        : list.length,
    cachedAt: Date.now(),
  };

  const key = storageKey(schoolId);
  try {
    localStorage.setItem(key, JSON.stringify(entry));
    writeMeta([...listMeta(), schoolId]);
  } catch {
    // Quota — drop oldest school caches then retry once.
    const ids = listMeta().filter((id) => id !== schoolId);
    for (const id of ids.slice(0, Math.max(1, Math.floor(ids.length / 2)))) {
      try {
        localStorage.removeItem(storageKey(id));
      } catch {
        // ignore
      }
    }
    writeMeta(ids.slice(Math.floor(ids.length / 2)));
    try {
      localStorage.setItem(key, JSON.stringify(entry));
      writeMeta([...listMeta(), schoolId]);
    } catch {
      // IndexedDB still gets a copy below
    }
  }

  void mirrorOfflineKeyToIndexedDb(key, entry);
}

/** All school ids that have a durable students cache. */
export function listCachedStudentSchoolIds(): string[] {
  return listMeta();
}

/** Collect photo / media URLs from durable per-school student lists. */
export function collectPhotoUrlsFromStudentCaches(): string[] {
  if (typeof window === 'undefined') return [];
  const urls = new Set<string>();
  const ids = listMeta();
  // Also scan keys in case meta is incomplete.
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key?.startsWith(KEY_PREFIX)) continue;
    const schoolId = key.slice(KEY_PREFIX.length);
    if (schoolId && !ids.includes(schoolId)) ids.push(schoolId);
  }

  for (const schoolId of ids) {
    const cached = getCachedStudentsForSchool(schoolId);
    if (!cached?.data?.length) continue;
    for (const row of cached.data) {
      if (!row || typeof row !== 'object') continue;
      const s = row as Record<string, unknown>;
      for (const field of ['photoUrl', 'originalPhotoUrl', 'logoUrl'] as const) {
        const raw = s[field];
        if (typeof raw !== 'string' || !raw || raw.startsWith('data:')) continue;
        urls.add(raw);
      }
    }
  }
  return [...urls];
}
