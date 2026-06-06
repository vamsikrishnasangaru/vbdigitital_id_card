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

/** Handle App Router flights before Serwist (avoids `no-response` on 502 / offline). */
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (!shouldBypassServiceWorker(request, url)) return;
  event.respondWith(passthroughFetch(request));
});

serwist.addEventListeners();

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    void self.skipWaiting();
  }
});
