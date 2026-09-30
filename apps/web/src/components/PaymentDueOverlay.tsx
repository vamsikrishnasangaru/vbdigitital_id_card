'use client';

import { AlertTriangle } from 'lucide-react';

/**
 * On for every production build — turn off with a web redeploy:
 *   NEXT_PUBLIC_PAYMENT_DUE_NOTICE=0 bash scripts/vps-deploy-web.sh
 * Opt-out (not opt-in) so a missing env var at build time cannot silently unlock the app.
 */
const enabled =
  process.env.NODE_ENV === 'production' &&
  process.env.NEXT_PUBLIC_PAYMENT_DUE_NOTICE !== '0';
const rawAmount = process.env.NEXT_PUBLIC_PAYMENT_DUE_AMOUNT || '45000';
const contact = process.env.NEXT_PUBLIC_PAYMENT_DUE_CONTACT || '';

function formatAmount(value: string): string {
  const amount = Number(value.replace(/[^\d.]/g, ''));
  if (!Number.isFinite(amount) || amount <= 0) return value;
  return amount.toLocaleString('en-IN');
}

export function PaymentDueOverlay() {
  if (!enabled) return null;

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="payment-due-title"
      aria-describedby="payment-due-desc"
    >
      <div className="absolute inset-0 bg-background/95 backdrop-blur-xl" />
      <div className="relative w-full max-w-lg overflow-hidden rounded-[2rem] border border-amber-500/40 bg-card shadow-[0_32px_64px_-12px_rgba(0,0,0,0.35)]">
        <div className="flex items-start gap-4 border-b border-border bg-amber-500/10 p-6 sm:p-8">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-500/20 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-700 dark:text-amber-400">
              Account on hold
            </p>
            <h2 id="payment-due-title" className="mt-1 text-2xl font-black text-foreground">
              Payment Pending
            </h2>
          </div>
        </div>

        <div className="space-y-5 p-6 sm:p-8">
          <p id="payment-due-desc" className="text-sm font-medium leading-relaxed text-muted-foreground">
            Please complete the pending payment to continue using VB Digital ID Cards. Access to
            students, templates and ID card generation stays locked until the payment is cleared.
          </p>

          <div className="rounded-2xl border border-border bg-muted/40 p-5">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
              Amount due
            </p>
            <p className="mt-1 text-3xl font-black tracking-tight text-foreground">
              ₹{formatAmount(rawAmount)}/-
            </p>
          </div>

          {contact ? (
            <p className="text-xs font-bold text-muted-foreground">
              For payment details contact{' '}
              <span className="text-foreground">{contact}</span>.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
