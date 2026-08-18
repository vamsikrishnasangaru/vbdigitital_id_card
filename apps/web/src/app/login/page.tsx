'use client';

import Link from 'next/link';
import { CreditCard } from 'lucide-react';
import { LoginForm } from '@/components/auth/LoginForm';

export default function LoginPage() {
  return (
    <div className="flex min-h-dvh flex-col overflow-x-hidden bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-4 sm:h-16 sm:px-6">
          <Link href="/" className="flex min-w-0 items-center gap-2">
            <div className="shrink-0 rounded-lg bg-primary/10 p-1.5">
              <CreditCard className="h-5 w-5 text-primary" />
            </div>
            <span className="truncate text-sm font-black tracking-tight sm:text-base">VB Digital ID Cards</span>
          </Link>
          <Link href="/" className="shrink-0 text-sm font-bold text-muted-foreground hover:text-foreground">
            Back
          </Link>
        </div>
      </header>
      <div className="flex flex-1 items-start justify-center px-4 py-8 sm:items-center sm:p-6">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-8">
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
