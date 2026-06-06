/**
 * Runs synchronously in <head> before React — clears persisted data when deploy revision changes.
 * Async SW/cache purge continues in SerwistRegistration.
 */
export function buildAppVersionBootstrapScript(revision: string): string {
  const safeRevision = revision.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `
(function () {
  var REV = "${safeRevision}";
  var KEY = "vb-app-revision";
  var FLAG = "vb-app-upgrade-pending";
  try {
    var prev = localStorage.getItem(KEY);
    if (prev && prev !== REV) {
      localStorage.removeItem("vb-id-cards-query-cache");
      localStorage.removeItem("vb_offline_get_cache");
      for (var i = localStorage.length - 1; i >= 0; i--) {
        var k = localStorage.key(i);
        if (k && k.indexOf("vb_offline_") === 0) localStorage.removeItem(k);
      }
      sessionStorage.setItem(FLAG, REV);
    }
    localStorage.setItem(KEY, REV);
  } catch (e) {}
})();
`.trim();
}
