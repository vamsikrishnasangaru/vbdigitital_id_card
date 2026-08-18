import { runtimeCaching } from "./sw-runtime-cache";
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
});
