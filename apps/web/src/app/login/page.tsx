'use client';

import Link from 'next/link';
import { CreditCard } from 'lucide-react';
import { LoginForm } from '@/components/auth/LoginForm';
import { SchoolColorMenu } from '@/components/SchoolColorPicker';
import { ContactProvider } from '@/components/landing/ContactProvider';
import { ContactTrigger } from '@/components/landing/ContactTrigger';
import { PublicFooter } from '@/components/landing/PublicFooter';
import { WhatsAppFloatButton } from '@/components/landing/WhatsAppFloatButton';

export default function LoginPage() {
  return (
    <ContactProvider>
      <div className="flex min-h-dvh flex-col bg-background">
        <header className="public-nav-navy sticky top-0 z-50 border-b border-white/10 text-white backdrop-blur-md">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-4 sm:h-16 sm:px-6">
            <Link href="/" className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <CreditCard className="h-4 w-4" />
              </div>
              <span className="truncate text-sm font-semibold tracking-tight sm:text-base">
                VB Digital <span className="font-normal text-white/80">ID Cards</span>
              </span>
            </Link>
            <div className="flex items-center gap-2">
              <SchoolColorMenu dark />
              <ContactTrigger dark />
              <Link
                href="/"
                className="shrink-0 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
              >
                Back
              </Link>
            </div>
          </div>
        </header>
        <div className="flex flex-1 items-start justify-center px-4 py-8 sm:items-center sm:p-6">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-8">
            <LoginForm />
          </div>
        </div>
        <PublicFooter />
        <WhatsAppFloatButton />
      </div>
    </ContactProvider>
  );
}
