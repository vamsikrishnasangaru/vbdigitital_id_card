/**
 * Shown only when the browser is truly offline and React never hydrates.
 * Never blocks online loads — even if vb-forced-offline is stuck.
 */
export const OFFLINE_BOOT_FALLBACK = `
(function () {
  var STATIC_ID = "vb-offline-static";
  var shown = false;

  function hideFallback() {
    var el = document.getElementById(STATIC_ID);
    if (el) el.style.display = "none";
    shown = false;
  }

  function clearForcedOffline() {
    try { sessionStorage.removeItem("vb-forced-offline"); } catch (e) {}
    try {
      window.dispatchEvent(new CustomEvent("vb-connectivity-changed", { detail: { online: true } }));
    } catch (e) {}
  }

  function isTrulyOffline() {
    return navigator.onLine === false;
  }

  function isStuckBoot() {
    if (document.documentElement.getAttribute("data-vb-app") === "ready") return false;
    if (!isTrulyOffline()) return false;
    var body = (document.body && document.body.innerText) || "";
    return body.indexOf("Starting session") !== -1 || body.trim().length < 40;
  }

  function showFallback() {
    if (shown) return;
    if (!isStuckBoot()) return;
    var el = document.getElementById(STATIC_ID);
    if (!el) return;
    shown = true;
    el.style.display = "flex";
  }

  // Online: always clear sticky offline flag and never show this overlay.
  if (navigator.onLine) {
    clearForcedOffline();
    hideFallback();
  }

  function schedule() {
    if (navigator.onLine) {
      clearForcedOffline();
      hideFallback();
      return;
    }
    setTimeout(showFallback, 4000);
    setTimeout(showFallback, 8000);
  }

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", schedule);
  } else {
    schedule();
  }

  window.addEventListener("online", function () {
    clearForcedOffline();
    hideFallback();
  });

  window.addEventListener("vb-app-ready", function () {
    hideFallback();
  });

  window.addEventListener("vb-connectivity-changed", function (e) {
    if (e && e.detail && e.detail.online) hideFallback();
  });
})();
`.trim();
