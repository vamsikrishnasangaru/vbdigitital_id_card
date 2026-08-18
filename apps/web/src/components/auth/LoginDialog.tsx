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
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!mounted || !open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center sm:p-4">
      <button type="button" className={MODAL_BACKDROP} aria-label="Close login" onClick={onClose} />
      <div
        className={cn(
          'relative bg-card border border-border w-full max-w-md shadow-2xl p-6 sm:p-8',
          'rounded-t-[2rem] sm:rounded-3xl',
          modalPanelClass(),
        )}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl hover:bg-muted"
          aria-label="Close"
        >
          <X className="h-5 w-5 text-muted-foreground" />
        </button>
        <LoginForm onSuccess={onClose} />
      </div>
    </div>
  );
}
