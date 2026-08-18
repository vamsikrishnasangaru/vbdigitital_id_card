/**
 * Requests that must bypass Serwist strategies (plain fetch only).
 * Serwist NetworkOnly throws `no-response` when the network fails (502 / down).
 */

const PAGE_CACHE = 'vb-html-pages-v1';
const RSC_CACHE = 'vb-rsc-flights-v1';

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

export async function passthroughFetch(
  request: Request,
  fallbackDocument?: () => Promise<Response | undefined>,
): Promise<Response> {
  const url = new URL(request.url);
  const documentRequest = isDocumentRequest(request);
  const rscRequest = isRscRequest(request, url);
  const cacheName = documentRequest ? PAGE_CACHE : rscRequest ? RSC_CACHE : null;

  try {
    const response = await fetch(request);
    if (cacheName && response.ok) {
      try {
        const cache = await caches.open(cacheName);
        await cache.put(request, response.clone());
      } catch {
        /* quota / uncacheable response */
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
      return matchOfflineDocument(fallbackDocument);
    }
    if (rscRequest) {
      const cached = await matchInCache(RSC_CACHE, request);
      if (cached) return cached;
    }
    /** API + other bypassed requests: axios treats 503 as offline and uses local data. */
    return new Response(null, { status: 503, statusText: 'Network Unavailable' });
  }
}
