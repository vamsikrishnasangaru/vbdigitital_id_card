/**
 * Runs before React hydrates in development to drop a stale Serwist worker (public/sw.js)
 * that would otherwise intercept HMR, API calls, and navigation.
 *
 * Also swallows Next.js HMR WebSocket reconnects while Chrome DevTools is Offline —
 * those retries otherwise spam `webpack-hmr … failed` in the console.
 */
export const SW_DEV_BOOTSTRAP = `
(function () {
  (function vbConnectivityProbe() {
    var KEY = "vb-forced-offline";
    function notify(online) {
      try {
        window.dispatchEvent(new CustomEvent("vb-connectivity-changed", { detail: { online: online } }));
      } catch (e) {}
    }
    function markOffline() {
      try { sessionStorage.setItem(KEY, "1"); } catch (e) {}
      notify(false);
    }
    function markOnline() {
      try { sessionStorage.removeItem(KEY); } catch (e) {}
      notify(true);
    }
    // Online load must clear sticky forced-offline from earlier DevTools Offline tests.
    if (navigator.onLine) markOnline();
    else markOffline();
    window.addEventListener("online", markOnline);
    window.addEventListener("offline", markOffline);
    window.__vbMarkForcedOffline = markOffline;
    window.__vbMarkForcedOnline = markOnline;
  })();

  (function patchHmrWebSocket() {
    var Orig = window.WebSocket;
    if (!Orig || Orig.__vbHmrOfflinePatched) return;

    function isHmrUrl(url) {
      return String(url || "").indexOf("/_next/webpack-hmr") !== -1;
    }

    /** Never connects — used when the device reports offline. */
    function NoOpHmrSocket() {
      var self = this;
      this.url = "";
      this.readyState = Orig.CONNECTING;
      this.bufferedAmount = 0;
      this.extensions = "";
      this.protocol = "";
      this.binaryType = "arraybuffer";
      this.onopen = null;
      this.onclose = null;
      this.onerror = null;
      this.onmessage = null;
      this.addEventListener = function () {};
      this.removeEventListener = function () {};
      this.dispatchEvent = function () { return true; };
      this.send = function () {};
      this.close = function () { self.readyState = Orig.CLOSED; };
    }

    /**
     * Chrome DevTools "Offline" keeps navigator.onLine === true.
     * One shared probe per page — avoids spam ERR_INTERNET_DISCONNECTED on every HMR retry.
     * Pass messages through unchanged so Turbopack keeps ArrayBuffer payloads.
     */
    var hmrProbe = null;

    function DeferredHmrSocket(url, protocols) {
      var self = this;
      this.url = String(url);
      this.readyState = Orig.CONNECTING;
      this.bufferedAmount = 0;
      this.extensions = "";
      this.protocol = "";
      this._binaryType = "arraybuffer";
      this.onopen = null;
      this.onclose = null;
      this.onerror = null;
      this.onmessage = null;
      this._real = null;
      this._closed = false;
      var listeners = { open: [], close: [], error: [], message: [] };

      Object.defineProperty(this, "binaryType", {
        get: function () {
          return self._real ? self._real.binaryType : self._binaryType;
        },
        set: function (value) {
          self._binaryType = value;
          if (self._real) self._real.binaryType = value;
        },
      });

      this.addEventListener = function (type, fn) {
        if (listeners[type]) listeners[type].push(fn);
      };
      this.removeEventListener = function (type, fn) {
        if (!listeners[type]) return;
        listeners[type] = listeners[type].filter(function (cb) { return cb !== fn; });
      };
      this.dispatchEvent = function () { return true; };
      this.send = function (data) {
        if (self._real && self._real.readyState === Orig.OPEN) self._real.send(data);
      };
      this.close = function () {
        self._closed = true;
        self.readyState = Orig.CLOSED;
        if (self._real) {
          try { self._real.close(); } catch (e) {}
        }
      };

      function emit(type, event) {
        var handler = self["on" + type];
        if (typeof handler === "function") handler.call(self, event);
        (listeners[type] || []).forEach(function (fn) { fn.call(self, event); });
      }

      function connectNative() {
        if (self._closed || self._real) return;
        var real = protocols !== undefined ? new Orig(url, protocols) : new Orig(url);
        real.binaryType = self._binaryType || "arraybuffer";
        self._real = real;
        real.addEventListener("open", function (e) {
          self.readyState = Orig.OPEN;
          emit("open", e);
        });
        real.addEventListener("message", function (e) { emit("message", e); });
        real.addEventListener("error", function (e) { emit("error", e); });
        real.addEventListener("close", function (e) {
          self.readyState = Orig.CLOSED;
          emit("close", e);
        });
      }

      if (!hmrProbe) {
        hmrProbe = fetch(location.origin + "/vb-hmr-probe?t=" + Date.now(), {
          cache: "no-store",
          credentials: "same-origin",
        }).then(function (res) {
          if (res.status === 503) {
            if (typeof window.__vbMarkForcedOffline === "function") window.__vbMarkForcedOffline();
            return false;
          }
          return true;
        }).catch(function () {
          if (typeof window.__vbMarkForcedOffline === "function") window.__vbMarkForcedOffline();
          return false;
        });
      }
      hmrProbe.then(function (ok) {
        if (ok) connectNative();
      });
    }

    function isForcedOffline() {
      try { return sessionStorage.getItem("vb-forced-offline") === "1"; } catch (e) { return false; }
    }

    function Patched(url, protocols) {
      if (!isHmrUrl(url)) {
        return protocols !== undefined ? new Orig(url, protocols) : new Orig(url);
      }
      if (!navigator.onLine || isForcedOffline()) {
        return new NoOpHmrSocket();
      }
      return new DeferredHmrSocket(url, protocols);
    }
    Patched.prototype = Orig.prototype;
    Patched.CONNECTING = Orig.CONNECTING;
    Patched.OPEN = Orig.OPEN;
    Patched.CLOSING = Orig.CLOSING;
    Patched.CLOSED = Orig.CLOSED;
    Patched.__vbHmrOfflinePatched = true;
    window.WebSocket = Patched;
  })();

  if (!("serviceWorker" in navigator)) return;
  var keep = "/vb-offline-sw.js";
  function pathname(url) {
    if (!url) return "";
    try {
      return new URL(url, location.origin).pathname;
    } catch (e) {
      return "";
    }
  }
  function isSerwistWorker(url) {
    var p = pathname(url);
    return p === "/sw.js";
  }
  var key = "vb-sw-purged-serwist";
  if (sessionStorage.getItem(key)) return;

  function purgeAndReload() {
    sessionStorage.setItem(key, "1");
    location.reload();
  }

  var ctrl = navigator.serviceWorker.controller;
  if (ctrl && isSerwistWorker(ctrl.scriptURL)) {
    navigator.serviceWorker.getRegistrations().then(function (regs) {
      return Promise.all(regs.map(function (r) {
        return r.unregister();
      }));
    }).then(purgeAndReload);
    return;
  }
  navigator.serviceWorker.getRegistrations().then(function (regs) {
    var hasSerwist = regs.some(function (r) {
      var url =
        (r.active && r.active.scriptURL) ||
        (r.waiting && r.waiting.scriptURL) ||
        (r.installing && r.installing.scriptURL);
      return isSerwistWorker(url);
    });
    if (!hasSerwist) return;
    return Promise.all(regs.map(function (r) {
      return r.unregister();
    })).then(purgeAndReload);
  });
})();
`.trim();
