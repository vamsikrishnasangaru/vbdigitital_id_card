/**
 * Requests that must bypass Serwist strategies (plain fetch only).
 * Serwist NetworkOnly throws `no-response` when the network fails (502 / down).
 */

const PAGE_CACHE = 'vb-html-pages-v2';
const RSC_CACHE = 'vb-rsc-flights-v2';
const STATIC_CACHE = 'vb-static-shell-v1';
const UPLOAD_CACHE = 'api-upload-assets';
const DEV_ASSET_CACHE = 'vb-offline-assets-v7';
const STATIC_IMAGE_CACHE = 'static-image-assets';

const TRANSPARENT_PNG = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='),
  (c) => c.charCodeAt(0),
);

function isUploadAsset(url: URL): boolean {
  return /^\/api\/v\d+\/uploads\//i.test(url.pathname);
}

async function matchUploadAsset(request: Request, url: URL): Promise<Response | undefined> {
  const names = [UPLOAD_CACHE, DEV_ASSET_CACHE, STATIC_IMAGE_CACHE];
  for (const name of names) {
    const cache = await caches.open(name);
    const hit =
      (await cache.match(request)) ||
      (await cache.match(request, { ignoreSearch: true })) ||
      (await cache.match(url.href)) ||
      (await cache.match(url.pathname));
    if (hit) return hit;
  }
  return undefined;
}

async function cacheUploadAsset(request: Request, url: URL, response: Response): Promise<void> {
  if (!response.ok) return;
  const cache = await caches.open(UPLOAD_CACHE);
  await putCacheable(cache, request, response);
  try {
    await putCacheable(cache, new Request(url.href), response);
    if (url.pathname) await putCacheable(cache, new Request(url.pathname), response);
  } catch {
    /* ignore */
  }
}

/** Minimal manifest so Chrome does not log a fetch failure while offline. */
const OFFLINE_MANIFEST = JSON.stringify({
  name: 'VB Digital ID Cards',
  short_name: 'VB Digital',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  theme_color: '#4f46e5',
  background_color: '#ffffff',
  icons: [{ src: '/icon.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any' }],
});

const OFFLINE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Offline — VB Digital ID Cards</title>
  <style>
    body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
      font-family:system-ui,sans-serif;background:#0f1115;color:#e8e8ed;text-align:center;padding:24px}
    a{color:#818cf8}
  </style>
</head>
<body>
  <main>
    <h1>You are offline</h1>
    <p>Open the app once while online, then this page will load from cache.</p>
    <p><a href="/">Go to home</a></p>
  </main>
</body>
</html>`;

export function shouldBypassServiceWorker(request: Request, url: URL): boolean {
  const sameOrigin = url.origin === self.location.origin;
  const sameHostApi =
    url.hostname === self.location.hostname && /^\/api\/v\d+\//i.test(url.pathname);
  if (!sameOrigin && !sameHostApi) return false;

  /** API (including upload images) — handled in passthroughFetch, not Serwist. */
  if (url.pathname.startsWith('/api/')) {
    return true;
  }

  if (request.method !== 'GET') return false;

  /** Dev-only HMR probe — let it hit the network so Chrome Offline fails the fetch. */
  if (url.pathname.startsWith('/vb-hmr-probe')) return false;
  if (url.pathname.startsWith('/__vb-hmr-probe')) return false;

  if (url.pathname === '/manifest.json' || url.pathname === '/sw.js') return true;
  if (url.pathname === '/icon.svg' || url.pathname === '/apple-icon.svg') return true;

  /** Documents and RSC: we handle cache + offline fallback ourselves (Serwist would 503). */
  if (request.mode === 'navigate' || request.destination === 'document') return true;

  if (url.searchParams.has('_rsc')) return true;
  if (request.headers.get('RSC') === '1') return true;
  if (request.headers.get('Next-Router-Prefetch') === '1') return true;
  if (request.headers.get('Next-Router-State-Tree')) return true;
  if (request.headers.get('Accept')?.includes('text/x-component')) return true;

  return false;
}

function isDocumentRequest(request: Request): boolean {
  return request.mode === 'navigate' || request.destination === 'document';
}

function isRscRequest(request: Request, url: URL): boolean {
  return (
    url.searchParams.has('_rsc') ||
    request.headers.get('RSC') === '1' ||
    request.headers.get('Next-Router-Prefetch') === '1' ||
    Boolean(request.headers.get('Next-Router-State-Tree')) ||
    Boolean(request.headers.get('Accept')?.includes('text/x-component'))
  );
}

function navigationFallbackCandidates(pathname: string): string[] {
  /** Never serve another route shell (e.g. dashboard for /schools). */
  return [pathname];
}

async function matchInCache(cacheName: string, request: Request): Promise<Response | undefined> {
  const cache = await caches.open(cacheName);
  return (
    (await cache.match(request)) ||
    (await cache.match(request, { ignoreSearch: true })) ||
    undefined
  );
}

/**
 * Next.js documents send Cache-Control: no-store. Chromium rejects cache.put for those.
 * Store a clone with cacheable headers so navigations work offline after the first online visit.
 */
async function putCacheable(cache: Cache, request: Request, response: Response): Promise<void> {
  const body = await response.clone().arrayBuffer();
  const headers = new Headers(response.headers);
  headers.delete('set-cookie');
  headers.delete('Set-Cookie');
  headers.delete('Expires');
  headers.delete('Pragma');
  headers.set('Cache-Control', 'public, max-age=604800');
  await cache.put(
    request,
    new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    }),
  );
}

async function cacheDocumentAliases(cache: Cache, request: Request, response: Response): Promise<void> {
  await putCacheable(cache, request, response);
  try {
    const path = new URL(request.url).pathname;
    if (path && path !== '/') {
      await putCacheable(cache, new Request(path), response);
    }
  } catch {
    /* ignore malformed URL */
  }
}

async function matchOfflineDocument(
  fallbackDocument?: () => Promise<Response | undefined>,
): Promise<Response> {
  const fromPrecache = await fallbackDocument?.();
  if (fromPrecache) return fromPrecache;

  const cached = await caches.match('/~offline', { ignoreSearch: true });
  if (cached) return cached;

  return new Response(OFFLINE_HTML, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function isShellAsset(url: URL): boolean {
  return (
    url.pathname === '/manifest.json' ||
    url.pathname === '/icon.svg' ||
    url.pathname === '/apple-icon.svg'
  );
}

/** manifest/icons must never surface as 503 — Chrome logs those loudly. */
async function shellAssetFallback(request: Request, url: URL): Promise<Response> {
  const cached =
    (await matchInCache(STATIC_CACHE, request)) ??
    (await caches.match(request, { ignoreSearch: true }));
  if (cached) return cached;

  if (url.pathname === '/manifest.json') {
    return new Response(OFFLINE_MANIFEST, {
      status: 200,
      headers: { 'Content-Type': 'application/manifest+json' },
    });
  }

  return new Response('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"></svg>', {
    status: 200,
    headers: { 'Content-Type': 'image/svg+xml' },
  });
}

export async function passthroughFetch(
  request: Request,
  fallbackDocument?: () => Promise<Response | undefined>,
): Promise<Response> {
  const url = new URL(request.url);
  const apiRequest = /^\/api\/v\d+\//i.test(url.pathname);
  const documentRequest = isDocumentRequest(request);
  const rscRequest = isRscRequest(request, url);
  const shellAsset = isShellAsset(url);
  const cacheName = documentRequest
    ? PAGE_CACHE
    : rscRequest
      ? RSC_CACHE
      : shellAsset
        ? STATIC_CACHE
        : null;
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const uploadAsset = isUploadAsset(url);

  if (uploadAsset) {
    const cached = await matchUploadAsset(request, url);
    if (cached) return cached;
    if (offline) {
      return new Response(TRANSPARENT_PNG, {
        status: 404,
        statusText: 'Offline',
        headers: { 'Content-Type': 'image/png' },
      });
    }
    try {
      const response = await fetch(request);
      if (response.ok) await cacheUploadAsset(request, url, response);
      return response;
    } catch {
      const again = await matchUploadAsset(request, url);
      if (again) return again;
      return new Response(TRANSPARENT_PNG, {
        status: 404,
        statusText: 'Offline',
        headers: { 'Content-Type': 'image/png' },
      });
    }
  }

  if (offline) {
    if (apiRequest) {
      return new Response(null, { status: 503, statusText: 'Network Unavailable' });
    }
    if (documentRequest) {
      const cached = await matchInCache(PAGE_CACHE, request);
      if (cached) return cached;
      for (const path of navigationFallbackCandidates(url.pathname)) {
        const shell = await caches.match(path, { ignoreSearch: true });
        if (shell) return shell;
      }
      return matchOfflineDocument(fallbackDocument);
    }
    if (rscRequest) {
      const cached = await matchInCache(RSC_CACHE, request);
      if (cached) return cached;
    }
    if (shellAsset) return shellAssetFallback(request, url);
    if (url.pathname === '/sw.js') {
      return new Response('// offline', {
        status: 200,
        headers: { 'Content-Type': 'application/javascript; charset=utf-8' },
      });
    }
    return new Response(null, { status: 503, statusText: 'Network Unavailable' });
  }

  try {
    const response = await fetch(request);
    if (cacheName && response.ok) {
      try {
        const cache = await caches.open(cacheName);
        if (documentRequest) await cacheDocumentAliases(cache, request, response);
        else await putCacheable(cache, request, response);
      } catch {
        /* quota / opaque / private mode */
      }
    }
    if (documentRequest && !response.ok && response.status >= 500) {
      const cached = await matchInCache(PAGE_CACHE, request);
      if (cached) return cached;
      return matchOfflineDocument(fallbackDocument);
    }
    if (rscRequest && !response.ok && response.status >= 500) {
      const cached = await matchInCache(RSC_CACHE, request);
      if (cached) return cached;
    }
    return response;
  } catch {
    if (apiRequest) {
      return new Response(null, { status: 503, statusText: 'Network Unavailable' });
    }
    if (documentRequest) {
      const cached = await matchInCache(PAGE_CACHE, request);
      if (cached) return cached;
      /** Prefer a previously visited app shell over the bare offline tip page. */
      for (const path of navigationFallbackCandidates(url.pathname)) {
        const shell = await caches.match(path, { ignoreSearch: true });
        if (shell) return shell;
      }
      return matchOfflineDocument(fallbackDocument);
    }
    if (rscRequest) {
      const cached = await matchInCache(RSC_CACHE, request);
      if (cached) return cached;
    }
    if (shellAsset) return shellAssetFallback(request, url);
    /** API + other bypassed requests: axios treats 503 as offline and uses local data. */
    return new Response(null, { status: 503, statusText: 'Network Unavailable' });
  }
}
