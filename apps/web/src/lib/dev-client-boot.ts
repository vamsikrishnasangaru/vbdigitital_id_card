/**
 * Dev-only: patch HMR WebSocket + connectivity flags BEFORE Next.js hydrates.
 * Imported from instrumentation-client.ts (runs synchronously before React).
 */

const FORCED_KEY = 'vb-forced-offline';

type MutableSocket = {
  url: string;
  readyState: number;
  bufferedAmount: number;
  extensions: string;
  protocol: string;
  binaryType: BinaryType;
  onopen: ((this: WebSocket, ev: Event) => unknown) | null;
  onclose: ((this: WebSocket, ev: CloseEvent) => unknown) | null;
  onerror: ((this: WebSocket, ev: Event) => unknown) | null;
  onmessage: ((this: WebSocket, ev: MessageEvent) => unknown) | null;
  addEventListener: WebSocket['addEventListener'];
  removeEventListener: WebSocket['removeEventListener'];
  dispatchEvent: WebSocket['dispatchEvent'];
  send: WebSocket['send'];
  close: WebSocket['close'];
  _binaryType?: BinaryType;
  _real?: WebSocket | null;
  _closed?: boolean;
};

declare global {
  interface Window {
    __vbMarkForcedOffline?: () => void;
    __vbMarkForcedOnline?: () => void;
  }
}

function isForcedOffline(): boolean {
  try {
    return sessionStorage.getItem(FORCED_KEY) === '1';
  } catch {
    return false;
  }
}

function installConnectivity() {
  const notify = (online: boolean) => {
    try {
      window.dispatchEvent(new CustomEvent('vb-connectivity-changed', { detail: { online } }));
    } catch {
      // ignore
    }
  };

  const markOffline = () => {
    try {
      sessionStorage.setItem(FORCED_KEY, '1');
    } catch {
      // ignore
    }
    notify(false);
  };

  const markOnline = () => {
    try {
      sessionStorage.removeItem(FORCED_KEY);
    } catch {
      // ignore
    }
    notify(true);
  };

  if (!navigator.onLine) markOffline();
  window.addEventListener('online', markOnline);
  window.addEventListener('offline', markOffline);
  window.__vbMarkForcedOffline = markOffline;
  window.__vbMarkForcedOnline = markOnline;
}

function installHmrWebSocketPatch() {
  const Orig = window.WebSocket as typeof WebSocket & { __vbHmrOfflinePatched?: boolean };
  if (!Orig || Orig.__vbHmrOfflinePatched) return;

  const isHmrUrl = (url: unknown) => String(url || '').includes('/_next/webpack-hmr');

  function NoOpHmrSocket(this: MutableSocket) {
    const self = this;
    self.url = '';
    self.readyState = Orig.CONNECTING;
    self.bufferedAmount = 0;
    self.extensions = '';
    self.protocol = '';
    self.binaryType = 'arraybuffer';
    self.onopen = null;
    self.onclose = null;
    self.onerror = null;
    self.onmessage = null;
    self.addEventListener = (() => {}) as WebSocket['addEventListener'];
    self.removeEventListener = (() => {}) as WebSocket['removeEventListener'];
    self.dispatchEvent = () => true;
    self.send = () => {};
    self.close = () => {
      self.readyState = Orig.CLOSED;
    };
  }

  let hmrProbe: Promise<boolean> | null = null;

  function DeferredHmrSocket(this: MutableSocket, url: string | URL, protocols?: string | string[]) {
    const self = this;
    const urlStr = String(url);
    self.url = urlStr;
    self.readyState = Orig.CONNECTING;
    self.bufferedAmount = 0;
    self.extensions = '';
    self.protocol = '';
    self._binaryType = 'arraybuffer';
    self.onopen = null;
    self.onclose = null;
    self.onerror = null;
    self.onmessage = null;
    self._real = null;
    self._closed = false;

    const listeners: Record<string, Array<(ev: Event) => void>> = {
      open: [],
      close: [],
      error: [],
      message: [],
    };

    Object.defineProperty(self, 'binaryType', {
      get: () => (self._real ? self._real.binaryType : self._binaryType),
      set: (value: BinaryType) => {
        self._binaryType = value;
        if (self._real) self._real.binaryType = value;
      },
    });

    self.addEventListener = ((type: string, fn: EventListener) => {
      if (listeners[type]) listeners[type].push(fn as (ev: Event) => void);
    }) as WebSocket['addEventListener'];

    self.removeEventListener = ((type: string, fn: EventListener) => {
      if (!listeners[type]) return;
      listeners[type] = listeners[type].filter((cb) => cb !== fn);
    }) as WebSocket['removeEventListener'];

    self.dispatchEvent = () => true;
    self.send = ((data: string | ArrayBufferLike | Blob | ArrayBufferView) => {
      if (self._real && self._real.readyState === Orig.OPEN) self._real.send(data);
    }) as WebSocket['send'];

    self.close = (() => {
      self._closed = true;
      self.readyState = Orig.CLOSED;
      if (self._real) {
        try {
          self._real.close();
        } catch {
          // ignore
        }
      }
    }) as WebSocket['close'];

    const emit = (type: string, event: Event) => {
      const handler = (self as Record<string, unknown>)[`on${type}`];
      if (typeof handler === 'function') {
        (handler as (this: MutableSocket, ev: Event) => void).call(self, event);
      }
      (listeners[type] || []).forEach((fn) => fn.call(self, event));
    };

    const connectNative = () => {
      if (self._closed || self._real) return;
      const real = protocols !== undefined ? new Orig(urlStr, protocols) : new Orig(urlStr);
      real.binaryType = self._binaryType || 'arraybuffer';
      self._real = real;
      real.addEventListener('open', (e) => {
        self.readyState = Orig.OPEN;
        emit('open', e);
      });
      real.addEventListener('message', (e) => emit('message', e));
      real.addEventListener('error', (e) => emit('error', e));
      real.addEventListener('close', (e) => {
        self.readyState = Orig.CLOSED;
        emit('close', e);
      });
    };

    if (!hmrProbe) {
      hmrProbe = fetch(`${location.origin}/vb-hmr-probe?t=${Date.now()}`, {
        cache: 'no-store',
        credentials: 'same-origin',
      })
        .then((res) => {
          if (res.status === 503) {
            window.__vbMarkForcedOffline?.();
            return false;
          }
          return true;
        })
        .catch(() => {
          window.__vbMarkForcedOffline?.();
          return false;
        });
    }

    void hmrProbe.then((ok) => {
      if (ok) connectNative();
    });
  }

  function Patched(url: string | URL, protocols?: string | string[]) {
    if (!isHmrUrl(url)) {
      return protocols !== undefined ? new Orig(url, protocols) : new Orig(url);
    }
    if (!navigator.onLine || isForcedOffline()) {
      return new (NoOpHmrSocket as unknown as new () => WebSocket)();
    }
    return new (DeferredHmrSocket as unknown as new (
      u: string | URL,
      p?: string | string[],
    ) => WebSocket)(url, protocols);
  }

  Patched.prototype = Orig.prototype;
  Object.assign(Patched, {
    CONNECTING: Orig.CONNECTING,
    OPEN: Orig.OPEN,
    CLOSING: Orig.CLOSING,
    CLOSED: Orig.CLOSED,
    __vbHmrOfflinePatched: true,
  });
  window.WebSocket = Patched as unknown as typeof WebSocket;
}

function purgeStaleSerwist() {
  if (!('serviceWorker' in navigator)) return;
  try {
    if (sessionStorage.getItem('vb-sw-purged-serwist')) return;
  } catch {
    return;
  }

  const isSerwistWorker = (url: string | undefined) => {
    if (!url) return false;
    try {
      return new URL(url, location.origin).pathname === '/sw.js';
    } catch {
      return false;
    }
  };

  const purgeAndReload = () => {
    try {
      sessionStorage.setItem('vb-sw-purged-serwist', '1');
    } catch {
      // ignore
    }
    location.reload();
  };

  const ctrl = navigator.serviceWorker.controller;
  if (ctrl && isSerwistWorker(ctrl.scriptURL)) {
    void navigator.serviceWorker.getRegistrations().then((regs) =>
      Promise.all(regs.map((r) => r.unregister())).then(purgeAndReload),
    );
    return;
  }

  void navigator.serviceWorker.getRegistrations().then((regs) => {
    const hasSerwist = regs.some((r) => {
      const url = r.active?.scriptURL || r.waiting?.scriptURL || r.installing?.scriptURL;
      return isSerwistWorker(url);
    });
    if (!hasSerwist) return;
    return Promise.all(regs.map((r) => r.unregister())).then(purgeAndReload);
  });
}

/** Call once from instrumentation-client (dev only). */
export function installDevClientBoot() {
  if (typeof window === 'undefined') return;
  if (process.env.NODE_ENV !== 'development') return;
  installConnectivity();
  installHmrWebSocketPatch();
  purgeStaleSerwist();
}
