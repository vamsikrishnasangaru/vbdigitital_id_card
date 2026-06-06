import { OFFLINE_STORAGE_KEYS } from './offline-store-keys';

const QUERY_CACHE_KEY = 'vb-id-cards-query-cache';
const OFFLINE_GET_CACHE_KEY = 'vb_offline_get_cache';

/** Drop persisted API/offline data so a new deploy does not show stale dashboard counts. */
export function clearPersistedAppData(): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.removeItem(QUERY_CACHE_KEY);
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

/** Full client reset after a deploy — used automatically when APP_REVISION changes. */
export async function clearAllAppCaches(): Promise<void> {
  clearPersistedAppData();
  await Promise.all([clearServiceWorkerCaches(), unregisterServiceWorkers()]);
}
