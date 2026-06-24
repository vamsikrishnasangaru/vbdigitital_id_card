'use client';

import { useNextPageParams, type NextClientPageProps } from '@/lib/next-page-params';
import Link from 'next/link';
import { CreditCard, ArrowLeft } from 'lucide-react';
import { PwaInstallInstructions } from '@/components/pwa/PwaInstallInstructions';

export default function InstallPage({ params }: NextClientPageProps) {
  useNextPageParams(params);
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors mb-8"
        >
          <ArrowLeft className="h-4 w-4" />
          Open app
        </Link>

        <div className="flex items-center gap-3 mb-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
            <CreditCard className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">
              Install VB Digital
            </h1>
            <p className="text-sm text-muted-foreground">Works on Android and iPhone — no app store needed</p>
          </div>
        </div>

        <p className="text-sm text-muted-foreground mb-8 max-w-2xl">
          Install once on your phone for full-screen access, faster launch, and offline student data.
          Updates happen automatically when you&apos;re online.
        </p>

        <PwaInstallInstructions />

        <p className="mt-10 text-center text-xs text-muted-foreground">
          Already installed? Open VB Digital from your home screen icon.
        </p>
      </div>
    </div>
  );
}
