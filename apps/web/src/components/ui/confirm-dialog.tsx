'use client';

import { AlertTriangle, Loader2, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'destructive' | 'warning';
  isLoading?: boolean;
  onConfirm?: () => void;
  onClose: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  isLoading = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  if (!open) return null;

  const isWarning = variant === 'warning';
  const isDestructive = variant === 'destructive';

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-xl animate-in fade-in duration-300"
        onClick={isLoading ? undefined : onClose}
      />
      <div
        className="relative bg-card border border-border w-full max-w-md rounded-[2rem] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.25)] overflow-hidden animate-in zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-desc"
      >
        <div className="p-6 sm:p-8 border-b border-border bg-muted/40 flex justify-between items-start gap-4">
          <div className="flex items-start gap-4 min-w-0">
            <div
              className={cn(
                'h-12 w-12 rounded-2xl flex items-center justify-center shrink-0',
                isWarning && 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
                isDestructive && 'bg-red-500/15 text-red-600 dark:text-red-400',
                !isWarning && !isDestructive && 'bg-primary/15 text-primary',
              )}
            >
              {isWarning ? (
                <AlertTriangle className="h-6 w-6" />
              ) : isDestructive ? (
                <Trash2 className="h-6 w-6" />
              ) : (
                <AlertTriangle className="h-6 w-6" />
              )}
            </div>
            <div className="min-w-0">
              <h3 id="confirm-dialog-title" className="text-xl font-black text-foreground">
                {title}
              </h3>
              <p id="confirm-dialog-desc" className="text-sm text-muted-foreground font-medium mt-1 leading-relaxed">
                {description}
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={isLoading}
            onClick={onClose}
            className="p-2.5 hover:bg-muted rounded-xl transition-colors shrink-0 disabled:opacity-40"
            aria-label="Close"
          >
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        <div className="p-6 sm:p-8 flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
          <button
            type="button"
            disabled={isLoading}
            onClick={onClose}
            className="px-5 py-3 rounded-xl text-sm font-black uppercase tracking-wider border border-border bg-card hover:bg-muted transition-all disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          {onConfirm ? (
            <button
              type="button"
              disabled={isLoading}
              onClick={onConfirm}
              className={cn(
                'px-5 py-3 rounded-xl text-sm font-black uppercase tracking-wider transition-all disabled:opacity-50 flex items-center justify-center gap-2',
                isDestructive
                  ? 'bg-red-600 text-white hover:bg-red-700 shadow-lg shadow-red-600/20'
                  : 'bg-primary text-primary-foreground hover:opacity-90 shadow-lg shadow-primary/20',
              )}
            >
              {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              {confirmLabel}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
