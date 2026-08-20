import { createStore, entries, get, set } from 'idb-keyval';

const DATA_DB = createStore('vb-offline-data', 'kv');
const SYNC_DB = createStore('vb-offline-sync', 'kv');
const META_PREFIX = '__meta__::';

type StoredEnvelope = {
  value: unknown;
  updatedAt: number;
};

function nowTs(): number {
  return Date.now();
}

function metaKey(key: string): string {
  return `${META_PREFIX}${key}`;
}

function readLocalUpdatedAt(key: string): number {
  if (typeof localStorage === 'undefined') return 0;
  const raw = localStorage.getItem(metaKey(key));
  const n = Number(raw || '0');
  return Number.isFinite(n) ? n : 0;
}

function writeLocalUpdatedAt(key: string, updatedAt: number): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(metaKey(key), String(updatedAt));
}

export async function mirrorOfflineKeyToIndexedDb(key: string, value: unknown): Promise<void> {
  const updatedAt = nowTs();
  writeLocalUpdatedAt(key, updatedAt);
  await set(key, { value, updatedAt } satisfies StoredEnvelope, DATA_DB);
}

export async function bootstrapOfflineStorage(keys: string[]): Promise<void> {
  if (typeof window === 'undefined') return;
  for (const key of keys) {
    const localRaw = localStorage.getItem(key);
    const localUpdatedAt = readLocalUpdatedAt(key);
    const remote = (await get<StoredEnvelope>(key, DATA_DB)) || null;

    if (!remote && localRaw != null) {
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(localRaw);
      } catch {
        parsed = null;
      }
      await set(
        key,
        { value: parsed, updatedAt: localUpdatedAt || nowTs() } satisfies StoredEnvelope,
        DATA_DB,
      );
      continue;
    }

    if (!remote) continue;
    if (localRaw == null || remote.updatedAt > localUpdatedAt) {
      localStorage.setItem(key, JSON.stringify(remote.value));
      writeLocalUpdatedAt(key, remote.updatedAt);
    }
  }
}

export async function listOfflineIndexedKeys(): Promise<string[]> {
  const all = await entries(DATA_DB);
  return all
    .map(([key]) => String(key))
    .filter((k) => !k.startsWith(META_PREFIX));
}

export async function getSyncQueueFromIndexedDb<T>(): Promise<T[]> {
  return ((await get<T[]>('sync_queue_v2', SYNC_DB)) || []) as T[];
}

export async function setSyncQueueInIndexedDb<T>(queue: T[]): Promise<void> {
  await set('sync_queue_v2', queue, SYNC_DB);
}

