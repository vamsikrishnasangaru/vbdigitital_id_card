'use client';

import { useEffect, useState } from 'react';
import { Loader2, Mail, X } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { MODAL_BACKDROP, modalPanelClass } from '@/lib/modal-motion';
import { cn } from '@/lib/utils';

type FormState = {
  schoolName: string;
  mobile: string;
  email: string;
  message: string;
};

const EMPTY_FORM: FormState = {
  schoolName: '',
  mobile: '',
  email: '',
  message: '',
};

const inputClass =
  'min-h-11 w-full rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm shadow-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30';

export function ContactDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

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

  useEffect(() => {
    if (open) return;
    setForm(EMPTY_FORM);
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/contact', {
        schoolName: form.schoolName.trim(),
        mobile: form.mobile.trim(),
        email: form.email.trim() || undefined,
        message: form.message.trim() || undefined,
      });
      toast.success('Message sent', {
        description: 'We will get back to your school shortly.',
      });
      onClose();
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string | string[] } } }).response?.data?.message
          : undefined;
      const description = Array.isArray(message) ? message[0] : message;
      toast.error('Could not send message', {
        description: description || 'Please check the form and try again.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (!mounted || !open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center sm:p-4">
      <button type="button" className={MODAL_BACKDROP} aria-label="Close contact form" onClick={onClose} />
      <div
        className={cn(
          'relative w-full max-w-lg overflow-y-auto border border-border bg-card shadow-xl',
          'max-h-[min(100dvh,100%)] px-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-8 sm:py-8',
          'rounded-t-[2rem] sm:rounded-3xl',
          modalPanelClass(),
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby="contact-dialog-title"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-xl p-2 hover:bg-muted sm:right-4 sm:top-4"
          aria-label="Close"
        >
          <X className="h-5 w-5 text-muted-foreground" />
        </button>

        <div className="mb-6 flex items-start gap-3 pr-10">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Mail className="h-5 w-5" />
          </div>
          <div>
            <h2 id="contact-dialog-title" className="text-xl font-semibold tracking-tight sm:text-2xl">
              Contact us
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Tell us about your school and we will reach out on mobile or email.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="contact-school" className="text-sm font-medium">
              Name of the School <span className="text-destructive">*</span>
            </label>
            <input
              id="contact-school"
              type="text"
              required
              value={form.schoolName}
              onChange={(e) => setForm((f) => ({ ...f, schoolName: e.target.value }))}
              className={inputClass}
              placeholder="e.g. ZPH High School"
              maxLength={200}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="contact-mobile" className="text-sm font-medium">
              Mobile Number <span className="text-destructive">*</span>
            </label>
            <input
              id="contact-mobile"
              type="tel"
              required
              inputMode="tel"
              value={form.mobile}
              onChange={(e) => setForm((f) => ({ ...f, mobile: e.target.value }))}
              className={inputClass}
              placeholder="9876543210"
              maxLength={20}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="contact-email" className="text-sm font-medium">
              Email <span className="text-xs font-normal text-muted-foreground">(optional)</span>
            </label>
            <input
              id="contact-email"
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className={inputClass}
              placeholder="admin@school.edu"
              maxLength={200}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="contact-message" className="text-sm font-medium">
              Message <span className="text-xs font-normal text-muted-foreground">(optional)</span>
            </label>
            <textarea
              id="contact-message"
              rows={4}
              value={form.message}
              onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
              className={cn(inputClass, 'min-h-[6.5rem] resize-y py-3')}
              placeholder="Tell us how many students, timelines, or any questions…"
              maxLength={2000}
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90 disabled:opacity-60"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Send message
          </button>
        </form>
      </div>
    </div>
  );
}
