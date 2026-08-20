import { runtimeCaching, UPLOAD_CACHE_NAME, STATIC_IMAGE_CACHE_NAME } from "./sw-runtime-cache";
import { passthroughFetch, shouldBypassServiceWorker } from "./sw-bypass";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  /** navigationPreload fails when offline and blocks cache fallback on some browsers. */
  navigationPreload: false,
  runtimeCaching,
  fallbacks: {
    entries: [
      {
        url: "/~offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

async function matchPrecachedOfflinePage(): Promise<Response | undefined> {
  const keys = await caches.keys();
  for (const key of keys) {
    const cache = await caches.open(key);
    const requests = await cache.keys();
    const offlineReq = requests.find((cached) => {
      try {
        return new URL(cached.url).pathname === "/~offline";
      } catch {
        return false;
      }
    });
    if (offlineReq) {
      const hit = await cache.match(offlineReq);
      if (hit) return hit;
    }
  }
  return caches.match("/~offline", { ignoreSearch: true });
}

async function putCacheable(cache: Cache, key: string, response: Response) {
  const body = await response.clone().arrayBuffer();
  const headers = new Headers(response.headers);
  headers.delete("set-cookie");
  headers.delete("Set-Cookie");
  headers.set("Cache-Control", "public, max-age=604800");
  await cache.put(
    key,
    new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    }),
  );
}

async function warmAssetUrls(urls: string[]) {
  const uploadCache = await caches.open(UPLOAD_CACHE_NAME);
  const imageCache = await caches.open(STATIC_IMAGE_CACHE_NAME);

  await Promise.allSettled(
    urls.map(async (raw) => {
      if (typeof raw !== "string" || !raw) return;
      let url: URL;
      try {
        url = new URL(raw, self.location.origin);
      } catch {
        return;
      }
      if (url.origin !== self.location.origin) return;

      const isUpload = /^\/api\/v\d+\/uploads\//i.test(url.pathname);
      const isImage =
        isUpload ||
        url.pathname.startsWith("/demo/") ||
        /\.(?:jpg|jpeg|gif|png|svg|ico|webp)$/i.test(url.pathname);
      if (!isImage) return;

      const cache = isUpload ? uploadCache : imageCache;
      const existing =
        (await cache.match(url.href)) ||
        (await cache.match(url.href, { ignoreSearch: true })) ||
        (await cache.match(url.pathname));
      if (existing) return;

      const res = await fetch(url.href, { credentials: "same-origin" });
      if (!res.ok) return;
      await putCacheable(cache, url.href, res);
      if (url.search) await putCacheable(cache, url.pathname, res);
    }),
  );
}

/** Handle App Router flights before Serwist (avoids `no-response` on 502 / offline). */
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (!shouldBypassServiceWorker(request, url)) return;
  event.respondWith(passthroughFetch(request, matchPrecachedOfflinePage));
});

serwist.addEventListeners();

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    void self.skipWaiting();
  }
  if (event.data?.type === "WARM_ASSETS" && Array.isArray(event.data.urls)) {
    event.waitUntil(warmAssetUrls(event.data.urls));
  }
});
