import { OFFLINE_STORAGE_KEYS } from './offline-store-keys';

const QUERY_CACHE_PREFIX = 'vb-id-cards-query-cache';
const OFFLINE_GET_CACHE_KEY = 'vb_offline_get_cache';

/** Drop React Query persist keys (with or without revision suffix). */
function clearQueryPersistKeys(): void {
  try {
    localStorage.removeItem(QUERY_CACHE_PREFIX);
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const key = localStorage.key(i);
      if (key?.startsWith(`${QUERY_CACHE_PREFIX}-`) || key === QUERY_CACHE_PREFIX) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    /* ignore */
  }
}

/**
 * Soft clear after a deploy: refresh API GET cache + RQ persist, keep queued
 * offline students/classes/teachers so unsynced work is not wiped.
 */
export function clearStaleApiCaches(): void {
  if (typeof window === 'undefined') return;
  try {
    clearQueryPersistKeys();
    localStorage.removeItem(OFFLINE_GET_CACHE_KEY);
  } catch {
    /* ignore quota / private mode */
  }
}

/** Drop all persisted API/offline data (Settings → Clear cache only). */
export function clearPersistedAppData(): void {
  if (typeof window === 'undefined') return;

  try {
    clearQueryPersistKeys();
    localStorage.removeItem(OFFLINE_GET_CACHE_KEY);

    const offlineValues = new Set<string>(Object.values(OFFLINE_STORAGE_KEYS));
    for (const key of offlineValues) {
      localStorage.removeItem(key);
    }

    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const key = localStorage.key(i);
      if (key?.startsWith('vb_offline_')) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    /* ignore quota / private mode */
  }
}

/** Remove Serwist/runtime Cache Storage entries. */
export async function clearServiceWorkerCaches(): Promise<void> {
  if (typeof caches === 'undefined') return;
  const keys = await caches.keys();
  await Promise.all(keys.map((key) => caches.delete(key)));
}

/** Unregister all service workers (fresh SW registers on next load). */
export async function unregisterServiceWorkers(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.unregister()));
}

/**
 * After APP_REVISION changes: refresh SW shell + stale GET/RQ caches.
 * Does not delete offline entity rows or the sync queue.
 */
export async function clearDeployCaches(): Promise<void> {
  clearStaleApiCaches();
  await Promise.all([clearServiceWorkerCaches(), unregisterServiceWorkers()]);
}

/** Full client reset — Settings "Clear cache" only. */
export async function clearAllAppCaches(): Promise<void> {
  clearPersistedAppData();
  await Promise.all([clearServiceWorkerCaches(), unregisterServiceWorkers()]);
}
