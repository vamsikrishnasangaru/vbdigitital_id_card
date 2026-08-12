/**
 * Requests that must bypass Serwist strategies (plain fetch only).
 * Serwist NetworkOnly throws `no-response` when the network fails (502 / down).
 */

export function shouldBypassServiceWorker(request: Request, url: URL): boolean {
  if (url.origin !== self.location.origin) return false;

  /** All API traffic — including POST login — must not go through Serwist (avoids no-response when server is down). */
  if (url.pathname.startsWith('/api/')) {
    if (request.method === 'GET' && /^\/api\/v\d+\/uploads\//i.test(url.pathname)) return false;
    return true;
  }

  if (request.method !== 'GET') return false;

  if (url.pathname === '/manifest.json' || url.pathname === '/sw.js') return true;

  /** Never serve cached HTML shells — chunk hashes change every deploy. */
  if (request.mode === 'navigate' || request.destination === 'document') return true;

  if (url.searchParams.has('_rsc')) return true;
  if (request.headers.get('RSC') === '1') return true;
  if (request.headers.get('Next-Router-Prefetch') === '1') return true;
  if (request.headers.get('Next-Router-State-Tree')) return true;
  if (request.headers.get('Accept')?.includes('text/x-component')) return true;

  return false;
}

export function passthroughFetch(request: Request): Promise<Response> {
  return fetch(request).catch(
    () => new Response(null, { status: 503, statusText: 'Network Unavailable' }),
  );
}
