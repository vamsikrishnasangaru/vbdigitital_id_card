'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { CreditCard } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { cn } from '@/lib/utils';
import { SchoolColorMenu } from '@/components/SchoolColorPicker';
import { ContactTrigger } from '@/components/landing/ContactTrigger';

export function PublicHeader({
  onLogin,
  variant = 'navy',
}: {
  onLogin?: () => void;
  variant?: 'light' | 'overlay' | 'navy';
}) {
  const { isAuthenticated, initialize } = useAuthStore();
  const dark = variant === 'overlay' || variant === 'navy';

  useEffect(() => {
    initialize();
  }, [initialize]);

  const ctaClass = cn(
    'shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-colors',
    'bg-primary text-primary-foreground hover:opacity-90',
  );

  return (
    <header
      className={cn(
        'sticky top-0 z-50 border-b',
        dark
          ? 'public-nav-navy border-white/10 text-white backdrop-blur-md'
          : 'border-border bg-background/90 backdrop-blur-md',
      )}
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-4 sm:h-16 sm:px-6">
        <Link href="/" className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <CreditCard className="h-4 w-4" />
          </div>
          <span className="truncate text-sm font-semibold tracking-tight sm:text-[15px]">
            VB Digital
            <span className={cn('ml-1 font-normal', dark ? 'text-white/80' : 'text-muted-foreground')}>
              ID Cards
            </span>
          </span>
        </Link>

        <div className="flex items-center gap-1 sm:gap-2">
          <SchoolColorMenu dark={dark} />
          <ContactTrigger dark={dark} />
          <Link
            href="/info"
            className={cn(
              'hidden rounded-lg px-3 py-2 text-sm font-medium sm:inline-flex',
              dark ? 'text-white/85 hover:text-white' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Product
          </Link>
          {isAuthenticated ? (
            <Link href="/dashboard" className={ctaClass}>
              Dashboard
            </Link>
          ) : onLogin ? (
            <button type="button" onClick={onLogin} className={ctaClass}>
              Sign in
            </button>
          ) : (
            <Link href="/login" className={ctaClass}>
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
