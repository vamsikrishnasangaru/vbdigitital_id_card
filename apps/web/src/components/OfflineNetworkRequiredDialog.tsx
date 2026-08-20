'use client';

import { WifiOff } from 'lucide-react';
import { MODAL_BACKDROP, modalPanelClass } from '@/lib/modal-motion';
import { cn } from '@/lib/utils';

export function OfflineNetworkRequiredDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center sm:p-4">
      <button type="button" className={MODAL_BACKDROP} aria-label="Close" onClick={onClose} />
      <div
        role="alertdialog"
        aria-labelledby="offline-network-title"
        aria-describedby="offline-network-desc"
        className={cn(
          'relative z-10 bg-card border border-border w-full max-w-md shadow-2xl p-6 sm:p-8',
          'rounded-t-[2rem] sm:rounded-3xl',
          modalPanelClass(),
        )}
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-700 dark:text-amber-300 mb-4">
          <WifiOff className="h-6 w-6" />
        </div>
        <h2 id="offline-network-title" className="text-xl font-black tracking-tight">
          Network is required
        </h2>
        <p id="offline-network-desc" className="mt-2 text-sm text-muted-foreground leading-relaxed">
          Please connect to the internet to open this page. Offline you can only use Dashboard
          and the directory pages for your role. All saves on this device will sync to the
          server when you are back online.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full min-h-11 rounded-xl bg-primary text-primary-foreground text-sm font-black hover:opacity-90"
        >
          OK
        </button>
      </div>
    </div>
  );
}
