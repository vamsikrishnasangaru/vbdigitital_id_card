'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Copy, ExternalLink, Share, Smartphone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getAppOrigin, getPwaPlatform, type PwaPlatform } from '@/lib/pwa-install';
import { usePwaInstall } from '@/hooks/use-pwa-install';

function InstallQrCode({ url }: { url: string }) {
  if (!url) {
    return (
      <div className="h-[240px] w-[240px] rounded-2xl border border-border bg-muted/40 animate-pulse" />
    );
  }

  const src = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=10&data=${encodeURIComponent(url)}`;

  return (
    <img
      src={src}
      alt="QR code linking to this app"
      width={240}
      height={240}
      className="rounded-2xl border border-border bg-white shadow-sm"
    />
  );
}

function PlatformSteps({ platform }: { platform: PwaPlatform }) {
  if (platform === 'ios') {
    return (
      <ol className="space-y-3 text-sm text-foreground">
        <li className="flex gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-black text-primary">
            1
          </span>
          <span>
            Open this page in <strong>Safari</strong> (required on iPhone and iPad).
          </span>
        </li>
        <li className="flex gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-black text-primary">
            2
          </span>
          <span className="flex items-start gap-2">
            <Share className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
            Tap <strong>Share</strong> at the bottom of Safari.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-black text-primary">
            3
          </span>
          <span>
            Scroll and choose <strong>Add to Home Screen</strong>, then tap <strong>Add</strong>.
          </span>
        </li>
      </ol>
    );
  }

  if (platform === 'android') {
    return (
      <ol className="space-y-3 text-sm text-foreground">
        <li className="flex gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-black text-primary">
            1
          </span>
          <span>Open this app in <strong>Chrome</strong>.</span>
        </li>
        <li className="flex gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-black text-primary">
            2
          </span>
          <span>
            Tap the menu (<strong>⋮</strong>) and choose <strong>Install app</strong> or{' '}
            <strong>Add to Home screen</strong>.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-black text-primary">
            3
          </span>
          <span>Confirm install. The app opens full-screen from your home screen.</span>
        </li>
      </ol>
    );
  }

  return (
    <ol className="space-y-3 text-sm text-foreground">
      <li className="flex gap-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-black text-primary">
          1
        </span>
        <span>Open this page on your phone or tablet.</span>
      </li>
      <li className="flex gap-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-black text-primary">
          2
        </span>
        <span>Follow the iPhone or Android steps shown above after switching devices.</span>
      </li>
      <li className="flex gap-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-black text-primary">
          3
        </span>
        <span>Or scan the QR code with your phone camera to open the install page.</span>
      </li>
    </ol>
  );
}

interface PwaInstallInstructionsProps {
  compact?: boolean;
  className?: string;
}

export function PwaInstallInstructions({ compact = false, className }: PwaInstallInstructionsProps) {
  const { canNativeInstall, install, installing, isStandalone } = usePwaInstall();
  const [origin, setOrigin] = useState('');
  const [platform, setPlatform] = useState<PwaPlatform>('desktop');

  useEffect(() => {
    setOrigin(getAppOrigin());
    setPlatform(getPwaPlatform());
  }, []);

  const installUrl = origin ? `${origin}/install` : '';

  const copyLink = async () => {
    if (!installUrl) return;
    try {
      await navigator.clipboard.writeText(installUrl);
      toast.success('Install link copied');
    } catch {
      toast.error('Could not copy link');
    }
  };

  if (isStandalone) {
    return (
      <div className={cn('rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4', className)}>
        <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
          App is installed. You&apos;re running VB Digital from your home screen.
        </p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-6', className)}>
      {!compact && (
        <div className="flex flex-col sm:flex-row gap-6 items-start">
          <div className="shrink-0 mx-auto sm:mx-0">
            <InstallQrCode url={installUrl} />
            <p className="mt-2 text-center text-xs text-muted-foreground max-w-[240px]">
              Scan to open the install page on another phone
            </p>
          </div>
          <div className="flex-1 min-w-0 space-y-4">
            <div>
              <h3 className="text-base font-black text-foreground">Share install link</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Send this link to teachers or staff so they can add the app on their phones.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex-1 min-w-0 rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-xs font-mono truncate">
                {installUrl || '…'}
              </div>
              <button
                type="button"
                onClick={() => void copyLink()}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-bold hover:bg-muted transition-colors shrink-0"
              >
                <Copy className="h-4 w-4" />
                Copy link
              </button>
            </div>
            {canNativeInstall && (
              <button
                type="button"
                disabled={installing}
                onClick={() => void install()}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-black text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                <Smartphone className="h-4 w-4" />
                {installing ? 'Installing…' : 'Install app now'}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-5">
          <h4 className="text-sm font-black uppercase tracking-wider text-muted-foreground mb-4">
            iPhone / iPad
          </h4>
          <PlatformSteps platform="ios" />
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <h4 className="text-sm font-black uppercase tracking-wider text-muted-foreground mb-4">
            Android
          </h4>
          <PlatformSteps platform="android" />
        </div>
      </div>

      {!compact && platform === 'desktop' && (
        <div className="rounded-2xl border border-border bg-muted/20 p-5">
          <h4 className="text-sm font-black text-foreground mb-3">On this computer</h4>
          <PlatformSteps platform="desktop" />
        </div>
      )}

      {compact && canNativeInstall && (
        <button
          type="button"
          disabled={installing}
          onClick={() => void install()}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-black text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          <Smartphone className="h-4 w-4" />
          {installing ? 'Installing…' : 'Install app now'}
        </button>
      )}

      {compact && (
        <Link
          href="/install"
          className="inline-flex items-center gap-2 text-sm font-bold text-primary hover:underline"
        >
          Full install guide
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      )}
    </div>
  );
}
