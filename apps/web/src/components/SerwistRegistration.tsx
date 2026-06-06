'use client';

import { useEffect } from 'react';
import { clearAllAppCaches } from '@/lib/clear-app-caches';

const swDisabled = process.env.NEXT_PUBLIC_DISABLE_SW === 'true';
const isDev = process.env.NODE_ENV === 'development';
const SW_MIGRATION_KEY = 'vb-sw-migration-v5';
const APP_UPGRADE_FLAG = 'vb-app-upgrade-pending';
const SW_RELOAD_FLAG = 'vb-sw-reloading';
const SERWIST_SW_PATH = '/sw.js';

/** Serwist dev bundles are classic scripts; module registration fails silently. */
function serviceWorkerUrl(): string {
  return isDev ? '/vb-offline-sw.js' : '/sw.js';
}

function scriptName(scriptUrl: string | undefined): string {
  if (!scriptUrl) return '';
  try {
    return new URL(scriptUrl).pathname;
  } catch {
    return scriptUrl;
  }
}

function isSerwistWorkerPath(path: string): boolean {
  return path === SERWIST_SW_PATH;
}

async function unregisterOtherWorkers(keepPath: string): Promise<boolean> {
  const registrations = await navigator.serviceWorker.getRegistrations();
  let removed = false;

  for (const registration of registrations) {
    const scriptUrl =
      registration.active?.scriptURL ??
      registration.waiting?.scriptURL ??
      registration.installing?.scriptURL;
    const path = scriptName(scriptUrl);

    if (path && path !== keepPath) {
      removed = true;
      await registration.unregister();
    }
  }

  return removed;
}

/** In dev, remove every registration when Serwist or a stale controller is still present. */
async function purgeDevSerwistWorkers(controllerPath: string): Promise<'reload' | 'continue'> {
  const registrations = await navigator.serviceWorker.getRegistrations();
  const hasSerwist =
    isSerwistWorkerPath(controllerPath) ||
    registrations.some((registration) => {
      const scriptUrl =
        registration.active?.scriptURL ??
        registration.waiting?.scriptURL ??
        registration.installing?.scriptURL;
      return isSerwistWorkerPath(scriptName(scriptUrl));
    });

  if (!hasSerwist) return 'continue';

  await Promise.all(registrations.map((registration) => registration.unregister()));

  if (sessionStorage.getItem('vb-sw-purged-serwist')) return 'continue';

  sessionStorage.setItem('vb-sw-purged-serwist', '1');
  if (!sessionStorage.getItem(SW_MIGRATION_KEY)) {
    sessionStorage.setItem(SW_MIGRATION_KEY, '1');
  }

  return 'reload';
}

async function finishDeployUpgrade(): Promise<'reload' | 'continue'> {
  if (!sessionStorage.getItem(APP_UPGRADE_FLAG)) return 'continue';
  sessionStorage.removeItem(APP_UPGRADE_FLAG);
  await clearAllAppCaches();
  if (sessionStorage.getItem(SW_RELOAD_FLAG)) return 'continue';
  sessionStorage.setItem(SW_RELOAD_FLAG, '1');
  window.location.reload();
  return 'reload';
}

export function SerwistRegistration({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (swDisabled || !('serviceWorker' in navigator)) return;

    const swUrl = serviceWorkerUrl();
    const swPath = new URL(swUrl, window.location.origin).pathname;
    let cancelled = false;
    let onVisible: (() => void) | null = null;

    const pushState = history.pushState.bind(history);
    const replaceState = history.replaceState.bind(history);
    let warmPath: (() => void) | null = null;

    const onControllerChange = () => {
      if (isDev || sessionStorage.getItem(SW_RELOAD_FLAG)) return;
      sessionStorage.setItem(SW_RELOAD_FLAG, '1');
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    void (async () => {
      const upgrade = await finishDeployUpgrade();
      if (upgrade === 'reload' || cancelled) return;

      const controllerPath = scriptName(navigator.serviceWorker.controller?.scriptURL);
      const staleController =
        controllerPath.length > 0 && controllerPath !== swPath;

      if (!cancelled && isDev) {
        const purge = await purgeDevSerwistWorkers(controllerPath);
        if (purge === 'reload') {
          window.location.reload();
          return;
        }
      }

      const removed = await unregisterOtherWorkers(swPath);

      if (
        !cancelled &&
        isDev &&
        (staleController || removed) &&
        !sessionStorage.getItem(SW_MIGRATION_KEY)
      ) {
        sessionStorage.setItem(SW_MIGRATION_KEY, '1');
        window.location.reload();
        return;
      }

      if (cancelled) return;

      const registration = await navigator.serviceWorker.register(swUrl, {
        scope: '/',
        type: 'classic',
        updateViaCache: 'none',
      });

      if (cancelled) return;

      void registration.update();

      onVisible = () => {
        if (document.visibilityState === 'visible') {
          void registration.update();
        }
      };
      document.addEventListener('visibilitychange', onVisible);

      // Dev-only: warming every navigation duplicates requests and slows the app.
      if (isDev) {
        let warmTimer: ReturnType<typeof setTimeout> | null = null;
        warmPath = () => {
          if (!navigator.onLine) return;
          const path = window.location.pathname;
          if (warmTimer) clearTimeout(warmTimer);
          warmTimer = setTimeout(() => {
            void fetch(path, {
              credentials: 'include',
              headers: { Accept: 'text/html,application/xhtml+xml' },
            }).catch(() => undefined);
          }, 800);
        };

        warmPath();

        history.pushState = (...args) => {
          pushState(...args);
          warmPath?.();
        };
        history.replaceState = (...args) => {
          replaceState(...args);
          warmPath?.();
        };
        window.addEventListener('popstate', warmPath);
      }

      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            worker.postMessage({ type: 'SKIP_WAITING' });
          }
        });
      });
    })().catch((err) => {
      console.error('[PWA] Service worker registration failed:', err);
    });

    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      if (onVisible) document.removeEventListener('visibilitychange', onVisible);
      history.pushState = pushState;
      history.replaceState = replaceState;
      if (warmPath) window.removeEventListener('popstate', warmPath);
    };
  }, []);

  return <>{children}</>;
}
