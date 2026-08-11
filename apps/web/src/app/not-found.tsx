'use client';

import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background text-foreground p-6">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="text-muted-foreground text-sm">The page you requested does not exist.</p>
      <Link href="/" className="text-primary underline underline-offset-4 text-sm">
        Back to home
      </Link>
    </div>
  );
}
