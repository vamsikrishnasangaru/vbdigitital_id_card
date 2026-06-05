/**
 * Requests that must bypass Serwist strategies (plain fetch only).
 * Serwist NetworkOnly throws `no-response` when the network fails (502 / down).
 */

export function shouldBypassServiceWorker(request: Request, url: URL): boolean {
  if (request.method !== 'GET') return false;
  if (url.origin !== self.location.origin) return false;

  /** Same-origin API reads — axios + offline cache handle failures; Serwist NetworkOnly throws `no-response`. */
  if (url.pathname.startsWith('/api/')) {
    if (/^\/api\/v\d+\/uploads\//i.test(url.pathname)) return false;
    return true;
  }

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
