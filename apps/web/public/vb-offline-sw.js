/**
 * Dev offline shell: caches navigations + Next.js static assets after you visit them online.
 * Production uses Serwist (/sw.js).
 */
const PAGE_CACHE = "vb-offline-pages-v4";
const ASSET_CACHE = "vb-offline-assets-v4";
const OFFLINE_PAGE = "/~offline";

const WARM_URLS = [
  "/",
  OFFLINE_PAGE,
  "/info",
  "/dashboard",
  "/students",
  "/classes",
  "/teachers",
  "/id-cards",
  "/schools",
  "/icon.svg",
  "/apple-icon.svg",
  "/manifest.json",
];

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

/** Next.js dev/prod bundles, styles, manifest, fonts. */
function isStaticAsset(url) {
  const { pathname } = new URL(url);
  return (
    pathname.startsWith("/_next/static/") ||
    pathname.startsWith("/_next/data/") ||
    pathname.startsWith("/_next/image") ||
    pathname === "/manifest.json" ||
    pathname === "/favicon.ico" ||
    pathname === "/icon.svg" ||
    pathname === "/apple-icon.svg" ||
    /\.(?:woff2?|ttf|otf|eot|svg|png|webmanifest)$/i.test(pathname)
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
  return (
    (await cache.match(request.url)) ||
    (await cache.match(request, { ignoreSearch: true })) ||
    (await cache.match("/dashboard")) ||
    (await cache.match("/")) ||
    (await cache.match(OFFLINE_PAGE)) ||
    null
  );
}

async function handleNavigate(request) {
  const cache = await caches.open(PAGE_CACHE);
  if (self.navigator && self.navigator.onLine === false) {
    const cached = await matchPage(cache, request);
    if (cached) return cached;
    return new Response(
      "<!DOCTYPE html><html><body><h1>Offline</h1><p>Open this page once while online, then try again.</p></body></html>",
      { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }
  try {
    const response = await fetchWithTimeout(request, 5000);
    if (response.ok) {
      try {
        await putCacheable(cache, request.url, response);
      } catch {
        /* ignore */
      }
    }
    return response;
  } catch {
    const cached = await matchPage(cache, request);
    if (cached) return cached;
    return new Response(
      "<!DOCTYPE html><html><body><h1>Offline</h1><p>Visit this app while online first, then try again.</p></body></html>",
      { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }
}

/** Cache JS/CSS/chunks on success; serve cache when offline. Never return fake 503 JS. */
async function handleStaticAsset(request) {
  const cache = await caches.open(ASSET_CACHE);
  if (self.navigator && self.navigator.onLine === false) {
    return (
      (await cache.match(request)) ||
      (await cache.match(request, { ignoreSearch: true })) ||
      fetch(request)
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
    const cached = (await cache.match(request)) || (await cache.match(request, { ignoreSearch: true }));
    if (cached) return cached;
    throw new Error("offline-miss");
  }
}

async function handleRsc(request) {
  const cache = await caches.open("vb-offline-rsc-v1");
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
            .filter((k) => k !== PAGE_CACHE && k !== ASSET_CACHE && k.startsWith("vb-offline"))
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (!sameOrigin(event.request.url)) return;

  if (isNavigateRequest(event.request)) {
    event.respondWith(handleNavigate(event.request));
    return;
  }

  if (isRscRequest(event.request)) {
    event.respondWith(handleRsc(event.request));
    return;
  }

  if (isStaticAsset(event.request.url)) {
    event.respondWith(handleStaticAsset(event.request));
  }
});
