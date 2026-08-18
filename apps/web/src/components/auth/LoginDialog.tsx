'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { LoginForm } from '@/components/auth/LoginForm';
import { MODAL_BACKDROP, modalPanelClass } from '@/lib/modal-motion';
import { cn } from '@/lib/utils';

export function LoginDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!mounted || !open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center sm:p-4">
      <button type="button" className={MODAL_BACKDROP} aria-label="Close login" onClick={onClose} />
      <div
        className={cn(
          'relative w-full max-w-md overflow-y-auto border border-border bg-card shadow-xl',
          'max-h-[min(100dvh,100%)] px-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-8 sm:py-8',
          'rounded-t-[2rem] sm:rounded-3xl',
          modalPanelClass(),
        )}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-xl p-2 hover:bg-muted sm:right-4 sm:top-4"
          aria-label="Close"
        >
          <X className="h-5 w-5 text-muted-foreground" />
        </button>
        <LoginForm onSuccess={onClose} />
      </div>
    </div>
  );
}
