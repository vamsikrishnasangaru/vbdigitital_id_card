/**
 * Runs synchronously in <head> before React — flags SW refresh when deploy revision changes.
 * Does not wipe offline students/classes/teachers (those sync when back online).
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
      try {
        localStorage.removeItem("vb_offline_get_cache");
        for (var i = localStorage.length - 1; i >= 0; i--) {
          var k = localStorage.key(i);
          if (k && (k === "vb-id-cards-query-cache" || k.indexOf("vb-id-cards-query-cache-") === 0)) {
            localStorage.removeItem(k);
          }
        }
      } catch (e2) {}
      sessionStorage.setItem(FLAG, REV);
    }
    localStorage.setItem(KEY, REV);
  } catch (e) {}
})();
`.trim();
}
