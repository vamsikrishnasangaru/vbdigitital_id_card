'use client';

import { useEffect } from 'react';
import { clearDeployCaches } from '@/lib/clear-app-caches';
import {
  setOfflineReadyComplete,
  setOfflineReadyPreparing,
  setOfflineReadyProgress,
} from '@/lib/offline-ready';
import { verifyOfflineCacheReady, warmOfflineCachesFromClient, warmOfflineMediaFromClient, collectOfflineMediaUrls } from '@/lib/offline-ready-verify';
import { warmAllSchoolsDirectoryData } from '@/lib/warm-schools-offline';

const swDisabled = process.env.NEXT_PUBLIC_DISABLE_SW === 'true';
const isDev = process.env.NODE_ENV === 'development';
const SW_MIGRATION_KEY = 'vb-sw-migration-v8';
const APP_UPGRADE_FLAG = 'vb-app-upgrade-pending';
const SW_RELOAD_FLAG = 'vb-sw-reloading';
const SERWIST_SW_PATH = '/sw.js';
const OFFLINE_WARM_KEY = 'vb-offline-routes-warmed-v2';
const OFFLINE_READY_KEY = 'vb-offline-ready-complete-v3';
const CRITICAL_OFFLINE_ROUTES = ['/dashboard', '/students', '/schools', '/teachers', '/classes'];
const WARM_SECONDS = isDev ? 12 : 8;

/** Bumped on effect cleanup so a superseded Strict Mode warm cannot regress toast state. */
let offlineWarmGeneration = 0;

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

function isRecoverableServiceWorkerError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /not found|404|failed to update a serviceworker|networkerror|load failed/i.test(message);
}

async function safeServiceWorkerUpdate(
  registration: ServiceWorkerRegistration,
): Promise<'ok' | 'unregistered'> {
  try {
    await registration.update();
    return 'ok';
  } catch (error) {
    if (isRecoverableServiceWorkerError(error)) {
      console.info('[PWA] Clearing stale service worker after deploy — will re-register.');
      await registration.unregister().catch(() => undefined);
      return 'unregistered';
    }
    console.warn('[PWA] Service worker update check failed:', error);
    return 'ok';
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
  await clearDeployCaches();
  if (sessionStorage.getItem(SW_RELOAD_FLAG)) return 'continue';
  sessionStorage.setItem(SW_RELOAD_FLAG, '1');
  window.location.reload();
  return 'reload';
}

async function clearAllServiceWorkers(): Promise<void> {
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.unregister()));
}

export function SerwistRegistration({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (swDisabled || !('serviceWorker' in navigator)) return;

    const swUrl = serviceWorkerUrl();
    const swPath = new URL(swUrl, window.location.origin).pathname;
    let cancelled = false;
    const warmGeneration = ++offlineWarmGeneration;
    const isWarmActive = () => !cancelled && warmGeneration === offlineWarmGeneration;
    let onVisible: (() => void) | null = null;
    let countdownTimer: ReturnType<typeof setInterval> | null = null;

    const pushState = history.pushState.bind(history);
    const replaceState = history.replaceState.bind(history);
    let warmPath: (() => void) | null = null;

    const onControllerChange = () => {
      // Never reload mid-warm — that kills the offline-ready UI mid-flight.
      if (isDev || sessionStorage.getItem(SW_RELOAD_FLAG)) return;
      if (sessionStorage.getItem('vb-offline-warming') === '1') return;
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

      if (!isDev && navigator.onLine) {
        try {
          const probe = await fetch(swUrl, { cache: 'no-store', credentials: 'same-origin' });
          if (!probe.ok && probe.status !== 503 && probe.status !== 504) {
            console.warn(`[PWA] ${swUrl} returned ${probe.status} — clearing stale service worker.`);
            await clearAllServiceWorkers();
            return;
          }
        } catch {
          // Offline or transient network error — keep the existing worker so cached pages still load.
        }
      }

      const registration = await navigator.serviceWorker.register(swUrl, {
        scope: '/',
        type: 'classic',
        updateViaCache: 'none',
      });

      if (cancelled) return;

      await navigator.serviceWorker.ready.catch(() => undefined);

      // First install: claim needs a reload before this tab is controlled (required for offline).
      if (
        navigator.onLine &&
        !navigator.serviceWorker.controller &&
        !sessionStorage.getItem('vb-sw-claim-reload')
      ) {
        sessionStorage.setItem('vb-sw-claim-reload', '1');
        window.location.reload();
        return;
      }

      const updateResult = await safeServiceWorkerUpdate(registration);
      if (cancelled) return;

      if (updateResult === 'unregistered') {
        try {
          const retry = await navigator.serviceWorker.register(swUrl, {
            scope: '/',
            type: 'classic',
            updateViaCache: 'none',
          });
          if (!cancelled) await safeServiceWorkerUpdate(retry);
        } catch {
          // Next page load will register fresh.
        }
        if (cancelled) return;
      }

      onVisible = () => {
        if (document.visibilityState === 'visible') {
          void safeServiceWorkerUpdate(registration);
        }
      };
      document.addEventListener('visibilitychange', onVisible);

      // Warm HTML + script/CSS into the SW cache so routes boot offline after one online visit.
      if (navigator.onLine) {
        let warmTimer: ReturnType<typeof setTimeout> | null = null;
        let secondsLeft = WARM_SECONDS;

        const swWorker = () =>
          navigator.serviceWorker.controller || registration.active || registration.waiting;

        const collectPageAssetUrls = (): string[] => {
          const urls = new Set<string>();
          document.querySelectorAll('script[src]').forEach((el) => {
            const src = (el as HTMLScriptElement).src;
            if (src.startsWith(window.location.origin)) urls.add(src);
          });
          document.querySelectorAll('link[rel="stylesheet"][href]').forEach((el) => {
            const href = (el as HTMLLinkElement).href;
            if (href.startsWith(window.location.origin)) urls.add(href);
          });
          collectOfflineMediaUrls().forEach((url) => urls.add(url));
          return [...urls];
        };

        const warmAssets = async () => {
          if (!navigator.onLine) return;
          const urls = collectPageAssetUrls();
          await Promise.allSettled(
            urls.map((url) =>
              fetch(url, { credentials: 'same-origin', cache: 'force-cache' }).catch(() => undefined),
            ),
          );
          await warmOfflineMediaFromClient(urls);
          const worker = swWorker();
          if (worker && urls.length > 0) {
            worker.postMessage({ type: 'WARM_ASSETS', urls });
          }
        };

        const markReady = async (force = false) => {
          if (!isWarmActive()) return false;
          const result = force
            ? { ok: true }
            : await verifyOfflineCacheReady(CRITICAL_OFFLINE_ROUTES);
          if (!result.ok || !isWarmActive()) return false;

          if (countdownTimer) {
            clearInterval(countdownTimer);
            countdownTimer = null;
          }
          try {
            sessionStorage.removeItem('vb-offline-warming');
          } catch {
            // ignore
          }
          sessionStorage.setItem(OFFLINE_READY_KEY, '1');
          sessionStorage.setItem(OFFLINE_WARM_KEY, '1');
          setOfflineReadyComplete();
          return true;
        };

        const startCountdown = () => {
          if (!isWarmActive()) return;
          try {
            sessionStorage.setItem('vb-offline-warming', '1');
          } catch {
            // ignore
          }
          setOfflineReadyPreparing(WARM_SECONDS);
          secondsLeft = WARM_SECONDS;
          if (countdownTimer) clearInterval(countdownTimer);
          countdownTimer = setInterval(() => {
            if (!isWarmActive()) {
              if (countdownTimer) clearInterval(countdownTimer);
              countdownTimer = null;
              return;
            }
            secondsLeft = Math.max(0, secondsLeft - 1);
            const progress = Math.min(
              95,
              Math.round(((WARM_SECONDS - secondsLeft) / WARM_SECONDS) * 100),
            );
            setOfflineReadyProgress(progress, Math.max(1, secondsLeft || 1));
            if (secondsLeft <= 0) {
              void markReady().then((ok) => {
                if (!ok && isWarmActive()) {
                  secondsLeft = Math.min(6, WARM_SECONDS);
                  setOfflineReadyProgress(90, secondsLeft);
                }
              });
            }
          }, 1000);
        };

        const warmCriticalRoutes = async () => {
          if (!navigator.onLine || !isWarmActive()) return;

          // Already warmed this tab — confirm ready without restarting the preparing UI.
          if (sessionStorage.getItem(OFFLINE_READY_KEY) === '1') {
            const existing = await verifyOfflineCacheReady(CRITICAL_OFFLINE_ROUTES);
            if (!isWarmActive()) return;
            if (existing.ok) {
              setOfflineReadyComplete();
              return;
            }
            sessionStorage.removeItem(OFFLINE_READY_KEY);
          }

          startCountdown();

          try {
            try {
              await navigator.serviceWorker.ready;
            } catch {
              // continue
            }

            if (!isWarmActive()) return;

            if (!navigator.serviceWorker.controller && registration.active) {
              // Avoid controllerchange reload wiping the offline-ready banner.
              try {
                sessionStorage.setItem(SW_RELOAD_FLAG, '1');
              } catch {
                // ignore
              }
              registration.active.postMessage({ type: 'SKIP_WAITING' });
            }

            const routeUrls = CRITICAL_OFFLINE_ROUTES.map(
              (route) => new URL(route, window.location.origin).href,
            );
            const worker = swWorker();
            if (worker) {
              worker.postMessage({ type: 'WARM_ROUTES', routes: routeUrls });
            }

            await warmOfflineCachesFromClient(CRITICAL_OFFLINE_ROUTES);
            await warmAssets();
            if (!isWarmActive()) return;

            const total = CRITICAL_OFFLINE_ROUTES.length;
            for (let i = 0; i < total; i += 1) {
              if (!navigator.onLine || !isWarmActive()) return;
              const route = CRITICAL_OFFLINE_ROUTES[i];
              try {
                await fetch(route, {
                  credentials: 'include',
                  headers: { Accept: 'text/html,application/xhtml+xml' },
                });
                await warmAssets();
              } catch {
                // keep going
              }
              const routeProgress = Math.round(((i + 1) / total) * 90);
              setOfflineReadyProgress(routeProgress, Math.max(1, secondsLeft));
            }

            await warmOfflineCachesFromClient(CRITICAL_OFFLINE_ROUTES);
            await warmAssets();
            if (!isWarmActive()) return;

            // Super Admin: cache every school's students/templates while online.
            await warmAllSchoolsDirectoryData().catch(() => 0);
            if (!isWarmActive()) return;

            for (let attempt = 0; attempt < 8 && isWarmActive(); attempt += 1) {
              if (await markReady()) return;
              await warmOfflineCachesFromClient([
                window.location.pathname,
                ...CRITICAL_OFFLINE_ROUTES,
              ]);
              await new Promise((resolve) => setTimeout(resolve, 800));
            }
          } finally {
            // Always clear a stuck "preparing" state for the active warm generation.
            if (isWarmActive() && navigator.onLine) {
              await markReady(true);
            } else {
              try {
                sessionStorage.removeItem('vb-offline-warming');
              } catch {
                // ignore
              }
            }
          }
        };

        warmPath = () => {
          if (!navigator.onLine) return;
          const path = window.location.pathname;
          if (warmTimer) clearTimeout(warmTimer);
          warmTimer = setTimeout(() => {
            void fetch(path, {
              credentials: 'include',
              headers: { Accept: 'text/html,application/xhtml+xml' },
            })
              .then(() => warmAssets())
              .catch(() => undefined);
          }, isDev ? 800 : 400);
        };

        warmPath();
        void warmCriticalRoutes();

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
      if (isRecoverableServiceWorkerError(err)) {
        console.warn('[PWA] Service worker registration skipped:', err);
        return;
      }
      console.error('[PWA] Service worker registration failed:', err);
    });

    return () => {
      cancelled = true;
      offlineWarmGeneration += 1;
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      if (onVisible) document.removeEventListener('visibilitychange', onVisible);
      if (countdownTimer) clearInterval(countdownTimer);
      history.pushState = pushState;
      history.replaceState = replaceState;
      if (warmPath) window.removeEventListener('popstate', warmPath);
    };
  }, []);

  return <>{children}</>;
}
