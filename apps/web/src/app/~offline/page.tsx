import Link from "next/link";
import { WifiOff } from "lucide-react";

export default function OfflinePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 px-6 text-center bg-background">
      <div className="rounded-full bg-amber-100 dark:bg-amber-950 p-4">
        <WifiOff className="h-10 w-10 text-amber-700 dark:text-amber-300" aria-hidden />
      </div>
      <div className="space-y-2 max-w-md">
        <h1 className="text-2xl font-semibold tracking-tight">You are offline</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          This page is not cached yet. Open the app while online and visit the sections you need
          (Students, Classes, Teachers). After that, they will load here without a connection.
        </p>
      </div>
      <Link
        href="/"
        className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        Go to home
      </Link>
    </main>
  );
}
