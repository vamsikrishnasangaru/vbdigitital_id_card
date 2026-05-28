/**
 * Dev offline shell: caches navigations + Next.js static assets after you visit them online.
 * Production uses Serwist (/sw.js).
 */
const PAGE_CACHE = "vb-offline-pages-v3";
const ASSET_CACHE = "vb-offline-assets-v3";
const OFFLINE_PAGE = "/~offline";

const WARM_URLS = [
  "/",
  OFFLINE_PAGE,
  "/dashboard",
  "/students",
  "/classes",
  "/teachers",
  "/id-cards",
  "/schools",
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
    /\.(?:woff2?|ttf|otf|eot)$/i.test(pathname)
  );
}

async function handleNavigate(request) {
  const cache = await caches.open(PAGE_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request.url, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request.url);
    if (cached) return cached;

    const offline = await cache.match(OFFLINE_PAGE);
    if (offline) return offline;

    const home = await cache.match("/");
    if (home) return home;

    return new Response(
      "<!DOCTYPE html><html><body><h1>Offline</h1><p>Visit this app while online first, then try again.</p></body></html>",
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }
}

/** Cache JS/CSS/chunks on success; serve cache when offline. */
async function handleStaticAsset(request) {
  const cache = await caches.open(ASSET_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;

    const { pathname } = new URL(request.url);
    const css = pathname.endsWith(".css") || request.headers.get("accept")?.includes("text/css");
    return new Response(css ? "/* offline */" : "/* offline */", {
      status: 503,
      statusText: "Offline",
      headers: { "Content-Type": css ? "text/css; charset=utf-8" : "application/javascript; charset=utf-8" },
    });
  }
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

  if (isStaticAsset(event.request.url)) {
    event.respondWith(handleStaticAsset(event.request));
  }
});
