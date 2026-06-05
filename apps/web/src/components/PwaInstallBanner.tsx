'use client';

import Link from 'next/link';
import { Loader2, Smartphone, X } from 'lucide-react';
import { usePwaInstall } from '@/hooks/use-pwa-install';

export function PwaInstallBanner() {
  const { showBanner, platform, canNativeInstall, installing, install, dismiss } = usePwaInstall();

  if (!showBanner) return null;

  const title =
    platform === 'ios'
      ? 'Install VB Digital on your home screen'
      : canNativeInstall
        ? 'Install VB Digital for quick access'
        : 'Add VB Digital to your home screen';

  const description =
    platform === 'ios'
      ? 'Use Safari → Share → Add to Home Screen for full-screen access and offline use.'
      : canNativeInstall
        ? 'Install the app for faster launch, offline mode, and an icon on your home screen.'
        : 'Open the install guide for step-by-step instructions.';

  return (
    <div
      className="mb-6 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4"
      role="region"
      aria-label="Install app"
    >
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Smartphone className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-black text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0 sm:ml-auto">
        {canNativeInstall && platform !== 'ios' ? (
          <button
            type="button"
            disabled={installing}
            onClick={() => void install()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-black text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {installing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Install
          </button>
        ) : (
          <Link
            href="/install"
            className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2 text-xs font-black text-primary-foreground hover:opacity-90"
          >
            How to install
          </Link>
        )}
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss install prompt"
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
