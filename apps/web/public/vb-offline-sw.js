/**
 * Dev offline shell: caches navigations + Next.js static assets after you visit them online.
 * Production uses Serwist (/sw.js).
 */
const PAGE_CACHE = "vb-offline-pages-v7";
const ASSET_CACHE = "vb-offline-assets-v7";
const RSC_CACHE = "vb-offline-rsc-v4";
const OFFLINE_PAGE = "/~offline";

/** Public shells only — auth pages are warmed after a signed-in visit (SerwistRegistration). */
const WARM_URLS = [
  "/",
  OFFLINE_PAGE,
  "/info",
  "/icon.svg",
  "/apple-icon.svg",
  "/manifest.json",
];

/** Pull script/link URLs out of HTML so offline reload has the JS/CSS shells need. */
function extractAssetUrls(html, pageUrl) {
  const urls = [];
  const re = /(?:src|href)=["']([^"']+)["']/gi;
  let match;
  while ((match = re.exec(html))) {
    const raw = match[1];
    if (!raw || raw.startsWith("data:") || raw.startsWith("blob:")) continue;
    try {
      const abs = new URL(raw, pageUrl);
      if (abs.origin !== self.location.origin) continue;
      const p = abs.pathname;
      if (
        p.startsWith("/_next/") ||
        p === "/manifest.json" ||
        /\.(?:js|css|woff2?|ttf|otf|eot|svg|png|webp)$/i.test(p)
      ) {
        urls.push(abs.href);
      }
    } catch {
      /* ignore */
    }
  }
  return [...new Set(urls)];
}

async function warmAssetsFromHtml(html, pageUrl) {
  const urls = extractAssetUrls(html, pageUrl);
  if (urls.length === 0) return;
  const cache = await caches.open(ASSET_CACHE);
  await Promise.allSettled(
    urls.map(async (url) => {
      try {
        const existing =
          (await cache.match(url)) || (await cache.match(url, { ignoreSearch: true }));
        if (existing) return;
        const res = await fetchWithTimeout(url, 4000);
        if (res.ok) await putCacheable(cache, url, res);
      } catch {
        /* ignore */
      }
    }),
  );
}

function sameOrigin(url) {
  try {
    return new URL(url).origin === self.location.origin;
  } catch {
    return false;
  }
}

function isNavigateRequest(request) {
  return (
    request.mode === "navigate" ||
    (request.method === "GET" && request.headers.get("accept")?.includes("text/html"))
  );
}

/** Next.js dev/prod bundles, styles, manifest, fonts, turbopack chunks. */
function isStaticAsset(url) {
  const { pathname } = new URL(url);
  return (
    pathname.startsWith("/_next/") ||
    pathname === "/manifest.json" ||
    pathname === "/favicon.ico" ||
    pathname === "/icon.svg" ||
    pathname === "/apple-icon.svg" ||
    /\.(?:woff2?|ttf|otf|eot|svg|png|webmanifest|js|css|map)$/i.test(pathname)
  );
}

function isRscRequest(request) {
  const url = new URL(request.url);
  return (
    url.searchParams.has("_rsc") ||
    request.headers.get("RSC") === "1" ||
    request.headers.get("Next-Router-Prefetch") === "1" ||
    Boolean(request.headers.get("Next-Router-State-Tree")) ||
    Boolean(request.headers.get("Accept")?.includes("text/x-component"))
  );
}

function fetchWithTimeout(request, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(request, { signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

async function matchPage(cache, request) {
  const url = new URL(request.url);
  const path = url.pathname;
  /** Never map one route to another route's HTML shell. */
  const candidates = [path, OFFLINE_PAGE];

  for (const candidate of candidates) {
    const hit =
      (await cache.match(candidate)) ||
      (await cache.match(candidate, { ignoreSearch: true }));
    if (hit) return hit;
  }

  return (
    (await cache.match(request.url)) ||
    (await cache.match(request, { ignoreSearch: true })) ||
    (await cache.match(path)) ||
    null
  );
}

async function matchCachedPage(request) {
  for (const name of [PAGE_CACHE, "vb-html-pages-v2"]) {
    const cache = await caches.open(name);
    const hit = await matchPage(cache, request);
    if (hit) return hit;
  }
  return null;
}

async function warmRoute(routeUrl) {
  const pageCache = await caches.open(PAGE_CACHE);
  try {
    const req = new Request(routeUrl, {
      credentials: "same-origin",
      headers: { Accept: "text/html,application/xhtml+xml" },
    });
    const response = await fetchWithTimeout(req, 6000);
    if (!response.ok) return;
    await putCacheable(pageCache, routeUrl, response);
    const path = new URL(routeUrl, self.location.origin).pathname;
    if (path && path !== "/") await putCacheable(pageCache, path, response);
    const html = await response.clone().text();
    await warmAssetsFromHtml(html, routeUrl);
  } catch {
    /* ignore */
  }
}

async function handleNavigate(request, event) {
  if (self.navigator && self.navigator.onLine === false) {
    const cached = await matchCachedPage(request);
    if (cached) return cached;
    return new Response(
      "<!DOCTYPE html><html><body><h1>Offline</h1><p>Open this page once while online, then try again.</p></body></html>",
      { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }
  const cache = await caches.open(PAGE_CACHE);
  try {
    const response = await fetchWithTimeout(request, 5000);
    if (response.ok) {
      try {
        await putCacheable(cache, request.url, response);
        const path = new URL(request.url).pathname;
        if (path && path !== "/") {
          await putCacheable(cache, path, response);
        }
        const html = await response.clone().text();
        // Keep warm-up tied to this fetch event lifecycle.
        event.waitUntil(warmAssetsFromHtml(html, request.url));
      } catch {
        /* ignore */
      }
    }
    return response;
  } catch {
    const cached = await matchCachedPage(request);
    if (cached) return cached;
    return new Response(
      "<!DOCTYPE html><html><body><h1>Offline</h1><p>Visit this app while online first, then try again.</p></body></html>",
      { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }
}

/** Cache-first when we have a hit; stale-while-revalidate when online. */
async function handleStaticAsset(request) {
  const cache = await caches.open(ASSET_CACHE);
  const url = new URL(request.url);
  const cached =
    (await cache.match(request)) ||
    (await cache.match(request, { ignoreSearch: true })) ||
    (await cache.match(url.pathname)) ||
    (await cache.match(url.href.split("?")[0]));

  if (cached) {
    if (self.navigator && self.navigator.onLine !== false) {
      fetchWithTimeout(request, 2500)
        .then(function (response) {
          if (response.ok) return putCacheable(cache, request, response);
        })
        .catch(function () {});
    }
    return cached;
  }

  var isImageReq =
    request.destination === "image" ||
    /\.(?:png|jpe?g|gif|webp|svg|ico)(?:$|\?)/i.test(url.pathname) ||
    /\/api\/v\d+\/uploads\//i.test(url.pathname);

  if (self.navigator && self.navigator.onLine === false) {
    if (isImageReq) {
      // 1x1 transparent PNG — wrong JS content-type was breaking <img> offline.
      var bytes = Uint8Array.from(
        atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="),
        function (c) {
          return c.charCodeAt(0);
        },
      );
      return new Response(bytes, {
        status: 404,
        statusText: "Offline",
        headers: { "Content-Type": "image/png" },
      });
    }
    return new Response("/* offline */", {
      status: 503,
      statusText: "Offline",
      headers: { "Content-Type": "application/javascript; charset=utf-8" },
    });
  }

  try {
    const response = await fetchWithTimeout(request, 2500);
    if (response.ok) {
      try {
        await putCacheable(cache, request, response);
        // Also store pathname-only so ?v= query changes still hit offline.
        if (url.search) {
          await putCacheable(cache, url.pathname, response);
        }
      } catch {
        /* ignore */
      }
    }
    return response;
  } catch {
    const fallback =
      (await cache.match(request, { ignoreSearch: true })) ||
      (await cache.match(url.pathname));
    if (fallback) return fallback;
    if (isImageReq) {
      var miss = Uint8Array.from(
        atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="),
        function (c) {
          return c.charCodeAt(0);
        },
      );
      return new Response(miss, {
        status: 404,
        statusText: "Offline",
        headers: { "Content-Type": "image/png" },
      });
    }
    return new Response("/* offline */", {
      status: 503,
      statusText: "Offline",
      headers: { "Content-Type": "application/javascript; charset=utf-8" },
    });
  }
}

async function handleRsc(request) {
  const cache = await caches.open(RSC_CACHE);
  if (self.navigator && self.navigator.onLine === false) {
    return (
      (await cache.match(request)) ||
      (await cache.match(request, { ignoreSearch: true })) ||
      new Response(null, { status: 503, statusText: "Offline" })
    );
  }
  try {
    const response = await fetchWithTimeout(request, 5000);
    if (response.ok) {
      try {
        await putCacheable(cache, request, response);
      } catch {
        /* ignore */
      }
    }
    return response;
  } catch {
    return (
      (await cache.match(request)) ||
      (await cache.match(request, { ignoreSearch: true })) ||
      new Response(null, { status: 503, statusText: "Offline" })
    );
  }
}

/** Documents send no-store; strip it so Cache Storage accepts the entry. */
async function putCacheable(cache, request, response) {
  const body = await response.clone().arrayBuffer();
  const headers = new Headers(response.headers);
  headers.delete("set-cookie");
  headers.delete("Set-Cookie");
  headers.delete("Expires");
  headers.delete("Pragma");
  headers.set("Cache-Control", "public, max-age=604800");
  const key = typeof request === "string" ? request : request.url || request;
  await cache.put(
    key,
    new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    }),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PAGE_CACHE)
      .then((cache) =>
        Promise.allSettled(
          WARM_URLS.map((url) => cache.add(new Request(url, { credentials: "same-origin" }))),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== PAGE_CACHE && k !== ASSET_CACHE && k !== RSC_CACHE && k.startsWith("vb-offline"))
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
  if (event.data?.type === "WARM_ASSETS" && Array.isArray(event.data.urls)) {
    const urls = event.data.urls.filter((u) => typeof u === "string" && sameOrigin(u));
    event.waitUntil(
      (async () => {
        const cache = await caches.open(ASSET_CACHE);
        await Promise.allSettled(
          urls.map(async (url) => {
            try {
              const existing =
                (await cache.match(url)) ||
                (await cache.match(url, { ignoreSearch: true }));
              if (existing) return;
              const res = await fetchWithTimeout(url, 4000);
              if (res.ok) await putCacheable(cache, url, res);
            } catch {
              /* ignore */
            }
          }),
        );
      })(),
    );
  }
  if (event.data?.type === "WARM_ROUTES" && Array.isArray(event.data.routes)) {
    const routes = event.data.routes.filter((u) => typeof u === "string" && sameOrigin(u));
    event.waitUntil(Promise.allSettled(routes.map((route) => warmRoute(route))));
  }
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (!sameOrigin(event.request.url)) return;

  try {
    if (new URL(event.request.url).pathname.startsWith("/vb-hmr-probe")) return;
    if (new URL(event.request.url).pathname.startsWith("/__vb-hmr-probe")) return;
  } catch {
    /* ignore */
  }

  if (isNavigateRequest(event.request)) {
    event.respondWith(handleNavigate(event.request, event));
    return;
  }

  if (isRscRequest(event.request)) {
    event.respondWith(handleRsc(event.request));
    return;
  }

  if (isStaticAsset(event.request.url)) {
    event.respondWith(handleStaticAsset(event.request));
    return;
  }

  event.respondWith(handleStaticAsset(event.request));
});
