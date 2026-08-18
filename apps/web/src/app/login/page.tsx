'use client';

import Link from 'next/link';
import { CreditCard } from 'lucide-react';
import { LoginForm } from '@/components/auth/LoginForm';

export default function LoginPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="p-1.5 bg-primary/10 rounded-lg">
              <CreditCard className="h-5 w-5 text-primary" />
            </div>
            <span className="font-black tracking-tight">VB Digital ID Cards</span>
          </Link>
          <Link href="/" className="text-sm font-bold text-muted-foreground hover:text-foreground">
            Back
          </Link>
        </div>
      </header>
      <div className="flex-1 flex items-center justify-center p-6">
        <LoginForm />
      </div>
    </div>
  );
}
