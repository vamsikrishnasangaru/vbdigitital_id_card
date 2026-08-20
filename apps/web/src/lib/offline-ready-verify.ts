import { resolveMediaUrl } from '@/lib/utils';
import { OFFLINE_STORAGE_KEYS } from '@/lib/offline-store-keys';
import { collectPhotoUrlsFromStudentCaches } from '@/lib/offline-students-cache';

const CRITICAL_ROUTES = ['/dashboard', '/students', '/schools', '/teachers', '/classes'];
/** Must match apps/web/public/vb-offline-sw.js cache names so SW can serve them offline. */
const CLIENT_PAGE_CACHE = 'vb-offline-pages-v7';
const CLIENT_ASSET_CACHE = 'vb-offline-assets-v7';
/** Must match apps/web/src/app/sw-runtime-cache.ts (production Serwist). */
const UPLOAD_CACHE = 'api-upload-assets';
const STATIC_IMAGE_CACHE = 'static-image-assets';

async function putCacheable(cache: Cache, key: string, response: Response) {
  const body = await response.clone().arrayBuffer();
  const headers = new Headers(response.headers);
  headers.delete('set-cookie');
  headers.delete('Set-Cookie');
  headers.set('Cache-Control', 'public, max-age=604800');
  await cache.put(
    key,
    new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    }),
  );
}

function extractAssetUrls(html: string, pageUrl: string): string[] {
  const urls: string[] = [];
  const re = /(?:src|href)=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const raw = match[1];
    if (!raw || raw.startsWith('data:') || raw.startsWith('blob:')) continue;
    try {
      const abs = new URL(raw, pageUrl);
      if (abs.origin !== window.location.origin) continue;
      const p = abs.pathname;
      if (
        p.startsWith('/_next/') ||
        p === '/manifest.json' ||
        /\.(?:js|css|woff2?|ttf|otf|eot|svg|png|webp|jpe?g|gif|ico)$/i.test(p) ||
        /^\/api\/v\d+\/uploads\//i.test(p)
      ) {
        urls.push(abs.href);
      }
    } catch {
      // ignore
    }
  }
  return [...new Set(urls)];
}

function normalizeMediaCandidate(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) return null;
  if (trimmed.startsWith('color:') || trimmed.startsWith('gradient:')) return null;

  const resolved = resolveMediaUrl(trimmed);
  if (!resolved || resolved.startsWith('data:') || resolved.startsWith('blob:')) return null;

  try {
    const abs = new URL(resolved, window.location.origin);
    if (abs.origin !== window.location.origin) return null;
    const p = abs.pathname;
    const ok =
      /^\/api\/v\d+\/uploads\//i.test(p) ||
      p.startsWith('/demo/') ||
      /\.(?:jpg|jpeg|gif|png|svg|ico|webp)$/i.test(p);
    return ok ? abs.href : null;
  } catch {
    return null;
  }
}

/** Pull upload / demo image URLs from DOM + offline localStorage. */
export function collectOfflineMediaUrls(): string[] {
  if (typeof window === 'undefined') return [];
  const urls = new Set<string>();

  document.querySelectorAll('img[src]').forEach((el) => {
    const href = normalizeMediaCandidate((el as HTMLImageElement).currentSrc || (el as HTMLImageElement).src);
    if (href) urls.add(href);
  });

  document.querySelectorAll('img[srcset], source[srcset]').forEach((el) => {
    const srcset = el.getAttribute('srcset') || '';
    srcset.split(',').forEach((part) => {
      const candidate = part.trim().split(/\s+/)[0];
      const href = normalizeMediaCandidate(candidate || '');
      if (href) urls.add(href);
    });
  });

  // Durable Super Admin student lists (main photo source while offline).
  collectPhotoUrlsFromStudentCaches().forEach((raw) => {
    const href = normalizeMediaCandidate(raw);
    if (href) urls.add(href);
  });

  const storageKeys = new Set<string>(Object.values(OFFLINE_STORAGE_KEYS));
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (
      !storageKeys.has(key as (typeof OFFLINE_STORAGE_KEYS)[keyof typeof OFFLINE_STORAGE_KEYS]) &&
      !key.includes('vb-id-cards-query-cache') &&
      !key.includes('vb_offline') &&
      !key.startsWith('vb_school_students::')
    ) {
      continue;
    }
    const raw = localStorage.getItem(key);
    if (!raw || raw.length > 4_000_000) continue;

    const uploadRe =
      /(?:\\\/|\/)api\/v\d+\/uploads\/[^"'\\\s]+|\/uploads\/[^"'\\\s]+|\/demo\/[^"'\\\s]+\.(?:png|jpe?g|gif|webp|svg)/gi;
    let match: RegExpExecArray | null;
    while ((match = uploadRe.exec(raw))) {
      const token = match[0].replace(/\\\//g, '/');
      const href = normalizeMediaCandidate(token);
      if (href) urls.add(href);
    }

    const fieldRe = /"(?:photoUrl|logoUrl|signatureUrl|backgroundUrl|imageUrl|url)"\s*:\s*"([^"]+)"/gi;
    while ((match = fieldRe.exec(raw))) {
      const href = normalizeMediaCandidate(match[1] || '');
      if (href) urls.add(href);
    }
  }

  return [...urls];
}

async function cacheMediaUrl(
  url: string,
  cachesToWrite: Cache[],
): Promise<boolean> {
  try {
    for (const cache of cachesToWrite) {
      const existing =
        (await cache.match(url)) ||
        (await cache.match(url, { ignoreSearch: true })) ||
        (await cache.match(new URL(url).pathname));
      if (existing) return true;
    }

    const assetRes = await fetch(url, { credentials: 'same-origin', cache: 'force-cache' });
    if (!assetRes.ok) return false;

    await Promise.all(
      cachesToWrite.map(async (cache) => {
        await putCacheable(cache, url, assetRes);
        const path = new URL(url).pathname;
        if (path !== url) await putCacheable(cache, path, assetRes);
      }),
    );
    return true;
  } catch {
    return false;
  }
}

/** Prefetch student/school/demo images into SW-readable caches. */
export async function warmOfflineMediaFromClient(extraUrls: string[] = []): Promise<number> {
  if (typeof window === 'undefined' || !('caches' in window) || !navigator.onLine) {
    return 0;
  }

  const urls = [...new Set([...collectOfflineMediaUrls(), ...extraUrls.map((u) => normalizeMediaCandidate(u) || '').filter(Boolean)])];
  if (urls.length === 0) return 0;

  const [devAssets, uploadCache, imageCache] = await Promise.all([
    caches.open(CLIENT_ASSET_CACHE),
    caches.open(UPLOAD_CACHE),
    caches.open(STATIC_IMAGE_CACHE),
  ]);

  let cached = 0;
  // Higher concurrency for photo warm — faces are the offline UX bottleneck.
  const queue = [...urls];
  const workers = Array.from({ length: Math.min(10, queue.length) }, async () => {
    while (queue.length > 0) {
      const url = queue.shift();
      if (!url) return;
      const path = new URL(url).pathname;
      const targets = /^\/api\/v\d+\/uploads\//i.test(path)
        ? [uploadCache, devAssets]
        : [imageCache, devAssets];
      if (await cacheMediaUrl(url, targets)) cached += 1;
    }
  });
  await Promise.all(workers);

  // Ask the controlling SW to mirror into its runtime caches too.
  try {
    const worker = navigator.serviceWorker?.controller;
    if (worker && urls.length > 0) {
      worker.postMessage({ type: 'WARM_ASSETS', urls });
    }
  } catch {
    // ignore
  }

  return cached;
}

/** Warm Cache Storage from the page itself (does not rely on SW intercept). */
export async function warmOfflineCachesFromClient(routes: string[] = CRITICAL_ROUTES): Promise<{
  pages: number;
  assets: number;
}> {
  if (typeof window === 'undefined' || !('caches' in window) || !navigator.onLine) {
    return { pages: 0, assets: 0 };
  }

  const pageCache = await caches.open(CLIENT_PAGE_CACHE);
  const assetCache = await caches.open(CLIENT_ASSET_CACHE);
  let pages = 0;
  let assets = 0;

  for (const route of routes) {
    try {
      const res = await fetch(route, {
        credentials: 'include',
        headers: { Accept: 'text/html,application/xhtml+xml' },
        cache: 'no-store',
      });
      if (!res.ok) continue;
      await putCacheable(pageCache, route, res);
      pages += 1;
      const html = await res.clone().text();
      const urls = extractAssetUrls(html, window.location.origin + route);
      await Promise.allSettled(
        urls.map(async (url) => {
          try {
            const existing =
              (await assetCache.match(url)) ||
              (await assetCache.match(url, { ignoreSearch: true }));
            if (existing) {
              assets += 1;
              return;
            }
            const assetRes = await fetch(url, { credentials: 'same-origin', cache: 'force-cache' });
            if (!assetRes.ok) return;
            await putCacheable(assetCache, url, assetRes);
            const path = new URL(url).pathname;
            if (path !== url) await putCacheable(assetCache, path, assetRes);
            assets += 1;
          } catch {
            // ignore
          }
        }),
      );
    } catch {
      // ignore
    }
  }

  // Also cache scripts currently on this page.
  const liveUrls = [
    ...Array.from(document.querySelectorAll('script[src]')).map((el) => (el as HTMLScriptElement).src),
    ...Array.from(document.querySelectorAll('link[rel="stylesheet"][href]')).map(
      (el) => (el as HTMLLinkElement).href,
    ),
  ].filter((u) => u.startsWith(window.location.origin));

  await Promise.allSettled(
    liveUrls.map(async (url) => {
      try {
        const existing =
          (await assetCache.match(url)) || (await assetCache.match(url, { ignoreSearch: true }));
        if (existing) {
          assets += 1;
          return;
        }
        const assetRes = await fetch(url, { credentials: 'same-origin', cache: 'force-cache' });
        if (!assetRes.ok) return;
        await putCacheable(assetCache, url, assetRes);
        assets += 1;
      } catch {
        // ignore
      }
    }),
  );

  assets += await warmOfflineMediaFromClient();

  return { pages, assets };
}

export async function verifyOfflineCacheReady(
  routes: string[] = CRITICAL_ROUTES,
): Promise<{ ok: boolean; pages: number; assets: number; hasController: boolean; reason?: string }> {
  if (typeof window === 'undefined' || !('caches' in window)) {
    return { ok: false, pages: 0, assets: 0, hasController: false, reason: 'no-cache-api' };
  }

  const hasController = Boolean(navigator.serviceWorker?.controller);
  let pages = 0;
  let assets = 0;

  try {
    const cacheNames = await caches.keys();
    for (const name of cacheNames) {
      const cache = await caches.open(name);
      const keys = await cache.keys();
      for (const req of keys) {
        try {
          const path = new URL(req.url).pathname;
          if (
            path.startsWith('/_next/') ||
            path.endsWith('.js') ||
            path.endsWith('.css') ||
            /^\/api\/v\d+\/uploads\//i.test(path) ||
            /\.(?:png|jpe?g|gif|webp|svg|ico)$/i.test(path)
          ) {
            assets += 1;
          }
        } catch {
          // ignore
        }
      }
    }

    for (const route of routes) {
      const hit =
        (await caches.match(route, { ignoreSearch: true })) ||
        (await caches.match(new URL(route, window.location.origin).href, { ignoreSearch: true }));
      if (hit) pages += 1;
    }
  } catch {
    return { ok: false, pages, assets, hasController, reason: 'cache-read-failed' };
  }

  const claimed = (() => {
    try {
      return sessionStorage.getItem('vb-sw-claim-reload') === '1';
    } catch {
      return false;
    }
  })();

  // Prefer a controlling SW, but allow ready after client cache warm even without one
  // (production Serwist may claim a moment later).
  if (!hasController && !claimed && pages < 1) {
    return { ok: false, pages, assets, hasController, reason: 'no-sw-controller' };
  }
  if (pages < 2) {
    return { ok: false, pages, assets, hasController, reason: 'pages-missing' };
  }
  if (assets < 3) {
    return { ok: false, pages, assets, hasController, reason: 'assets-missing' };
  }

  return { ok: true, pages, assets, hasController };
}
