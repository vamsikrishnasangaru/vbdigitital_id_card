'use client';

import { Download, HardDrive, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type GenerateCardsDialogProps = {
  open: boolean;
  onClose: () => void;
  studentCount: number;
  isSubmitting: boolean;
  driveAvailable: boolean;
  onDownload: () => void;
  onGoogleDrive: () => void;
};

export function GenerateCardsDialog({
  open,
  onClose,
  studentCount,
  isSubmitting,
  driveAvailable,
  onDownload,
  onGoogleDrive,
}: GenerateCardsDialogProps) {
  if (!open) return null;

  const single = studentCount === 1;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-xl animate-in fade-in duration-300"
        onClick={isSubmitting ? undefined : onClose}
      />
      <div
        className="relative bg-card border border-border w-full max-w-lg rounded-[2rem] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.25)] overflow-hidden animate-in zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 sm:p-8 border-b border-border bg-muted/40 flex justify-between items-start gap-4">
          <div>
            <h3 className="text-xl sm:text-2xl font-black text-foreground">Generate ID Cards</h3>
            <p className="text-sm text-muted-foreground font-medium mt-1">
              {studentCount} student{studentCount === 1 ? '' : 's'} selected — choose where to send the cards.
            </p>
          </div>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="p-2.5 hover:bg-muted rounded-xl transition-colors shrink-0 disabled:opacity-40"
            aria-label="Close"
          >
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        <div className="p-6 sm:p-8 space-y-4">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onDownload}
            className={cn(
              'w-full flex items-start gap-4 p-5 rounded-2xl border-2 text-left transition-all',
              'border-primary/30 bg-primary/5 hover:border-primary hover:shadow-lg hover:shadow-primary/10',
              'disabled:opacity-50 disabled:pointer-events-none',
            )}
          >
            <div className="h-12 w-12 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
              {isSubmitting ? (
                <Loader2 className="h-6 w-6 text-primary animate-spin" />
              ) : (
                <Download className="h-6 w-6 text-primary" />
              )}
            </div>
            <div className="min-w-0">
              <div className="font-black text-foreground">Download</div>
              <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                {single
                  ? 'Download one ID card as a PNG image.'
                  : 'Download a ZIP file with an id-cards folder containing PNG images.'}
              </p>
            </div>
          </button>

          <button
            type="button"
            disabled={isSubmitting || !driveAvailable}
            onClick={onGoogleDrive}
            className={cn(
              'w-full flex items-start gap-4 p-5 rounded-2xl border-2 text-left transition-all',
              driveAvailable
                ? 'border-border bg-muted/30 hover:border-emerald-500/50 hover:bg-emerald-500/5'
                : 'border-border bg-muted/20 opacity-60 cursor-not-allowed',
              'disabled:opacity-50 disabled:pointer-events-none',
            )}
          >
            <div className="h-12 w-12 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0">
              <HardDrive className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="min-w-0">
              <div className="font-black text-foreground">Google Drive</div>
              <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                {driveAvailable
                  ? 'Upload PNG images to your configured Google Drive folder (School → Class → Section).'
                  : 'Not configured yet. Set up OAuth on the server when you are ready — use Download for now.'}
              </p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
