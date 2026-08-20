/**
 * Requests that must bypass Serwist strategies (plain fetch only).
 * Serwist NetworkOnly throws `no-response` when the network fails (502 / down).
 */

const PAGE_CACHE = 'vb-html-pages-v2';
const RSC_CACHE = 'vb-rsc-flights-v2';
const STATIC_CACHE = 'vb-static-shell-v1';

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
  if (url.origin !== self.location.origin) return false;

  /** All API traffic — including POST login — must not go through Serwist (avoids no-response when server is down). */
  if (url.pathname.startsWith('/api/')) {
    if (request.method === 'GET' && /^\/api\/v\d+\/uploads\//i.test(url.pathname)) return false;
    return true;
  }

  if (request.method !== 'GET') return false;

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

  if (offline) {
    if (documentRequest) {
      const cached = await matchInCache(PAGE_CACHE, request);
      if (cached) return cached;
      for (const path of ['/dashboard', '/students', '/schools', '/', '/info']) {
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
    return new Response(null, { status: 503, statusText: 'Network Unavailable' });
  }

  try {
    const response = await fetch(request);
    if (cacheName && response.ok) {
      try {
        const cache = await caches.open(cacheName);
        await putCacheable(cache, request, response);
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
    if (documentRequest) {
      const cached = await matchInCache(PAGE_CACHE, request);
      if (cached) return cached;
      /** Prefer a previously visited app shell over the bare offline tip page. */
      for (const path of ['/dashboard', '/students', '/', '/info']) {
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
