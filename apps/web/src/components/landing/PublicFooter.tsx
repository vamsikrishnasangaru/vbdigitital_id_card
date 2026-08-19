'use client';

import { ContactTrigger } from '@/components/landing/ContactTrigger';

export function PublicFooter() {
  return (
    <footer className="border-t border-border bg-secondary/40 px-4 py-6">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 sm:flex-row sm:justify-between">
        <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} VB Digital ID Cards</p>
        <ContactTrigger variant="footer" />
      </div>
    </footer>
  );
}
