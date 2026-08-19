'use client';

import { cn } from '@/lib/utils';
import { useContact } from '@/components/landing/ContactProvider';

export function ContactTrigger({
  className,
  dark = false,
  variant = 'nav',
}: {
  className?: string;
  dark?: boolean;
  variant?: 'nav' | 'footer' | 'pill';
}) {
  const { openContact } = useContact();

  return (
    <button
      type="button"
      onClick={openContact}
      className={cn(
        variant === 'nav' &&
          cn(
            'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
            dark ? 'text-white/85 hover:text-white' : 'text-muted-foreground hover:text-foreground',
          ),
        variant === 'footer' &&
          'rounded-lg px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground',
        variant === 'pill' &&
          'rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold transition-colors hover:bg-secondary',
        dark &&
          variant === 'pill' &&
          'border-white/20 bg-white/10 text-white hover:bg-white/15',
        className,
      )}
    >
      Contact
    </button>
  );
}
