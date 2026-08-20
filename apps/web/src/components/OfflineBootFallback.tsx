/** Static HTML fallback when JS bundles fail offline (common in dev). */
export function OfflineBootFallback() {
  return (
    <div
      id="vb-offline-static"
      style={{ display: 'none' }}
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-4 bg-background p-6 text-center"
    >
      <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary text-xl font-bold">
        !
      </div>
      <div className="max-w-md space-y-2">
        <h1 className="text-lg font-semibold text-foreground">App could not start offline</h1>
        <p className="text-sm text-muted-foreground">
          You are offline and this page was not cached yet. Go online, open Dashboard / Schools /
          Students once, wait until they fully load, then try offline again.
        </p>
        <p className="text-xs text-muted-foreground">
          For reliable offline, use a production build (
          <code className="text-foreground">pnpm build &amp;&amp; pnpm start</code>) or the live site.
        </p>
      </div>
      <button
        type="button"
        id="vb-offline-retry"
        className="mt-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
      >
        Try again
      </button>
    </div>
  );
}
