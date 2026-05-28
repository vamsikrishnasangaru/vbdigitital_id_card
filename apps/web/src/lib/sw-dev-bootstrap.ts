/**
 * Runs before React hydrates in development to drop a stale Serwist worker (public/sw.js)
 * that would otherwise intercept HMR, API calls, and navigation.
 */
export const SW_DEV_BOOTSTRAP = `
(function () {
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
