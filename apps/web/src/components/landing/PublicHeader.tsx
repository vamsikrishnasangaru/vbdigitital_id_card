'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { CreditCard } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { cn } from '@/lib/utils';

export function PublicHeader({
  onLogin,
  variant = 'light',
}: {
  onLogin?: () => void;
  variant?: 'light' | 'overlay';
}) {
  const { isAuthenticated, initialize } = useAuthStore();
  const overlay = variant === 'overlay';

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <header
      className={cn(
        'sticky top-0 z-40 border-b',
        overlay
          ? 'border-white/10 bg-[#111113]/80 text-white backdrop-blur-md'
          : 'border-border bg-background/90 backdrop-blur-md',
      )}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-3">
        <Link href="/" className="flex items-center gap-2 min-w-0">
          <div
            className={cn(
              'p-1.5 rounded-lg shrink-0',
              overlay ? 'bg-white/15' : 'bg-primary/10',
            )}
          >
            <CreditCard className={cn('h-5 w-5', overlay ? 'text-white' : 'text-primary')} />
          </div>
          <span className="font-black tracking-tight truncate">
            VB Digital <span className={overlay ? 'text-white/70' : 'text-muted-foreground'}>ID Cards</span>
          </span>
        </Link>

        {isAuthenticated ? (
          <Link
            href="/dashboard"
            className={cn(
              'shrink-0 px-4 py-2 rounded-xl text-sm font-bold transition-all',
              overlay
                ? 'bg-white text-[#111113] hover:bg-white/90'
                : 'bg-primary text-primary-foreground hover:opacity-90',
            )}
          >
            Dashboard
          </Link>
        ) : onLogin ? (
          <button
            type="button"
            onClick={onLogin}
            className={cn(
              'shrink-0 px-4 py-2 rounded-xl text-sm font-bold transition-all',
              overlay
                ? 'bg-white text-[#111113] hover:bg-white/90'
                : 'bg-primary text-primary-foreground hover:opacity-90',
            )}
          >
            Login
          </button>
        ) : (
          <Link
            href="/login"
            className={cn(
              'shrink-0 px-4 py-2 rounded-xl text-sm font-bold transition-all',
              overlay
                ? 'bg-white text-[#111113] hover:bg-white/90'
                : 'bg-primary text-primary-foreground hover:opacity-90',
            )}
          >
            Login
          </Link>
        )}
      </div>
    </header>
  );
}
