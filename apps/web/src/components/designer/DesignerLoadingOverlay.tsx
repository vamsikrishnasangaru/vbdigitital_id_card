export function DesignerLoadingOverlay() {
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-muted-foreground">Loading designer…</span>
      </div>
    </div>
  );
}
