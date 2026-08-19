'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { PublicHeader } from '@/components/landing/PublicHeader';
import { LoginDialog } from '@/components/auth/LoginDialog';
import { ContactProvider } from '@/components/landing/ContactProvider';
import { PublicFooter } from '@/components/landing/PublicFooter';
import { IdCardGallery } from '@/components/landing/IdCardGallery';
import { useSiteContent } from '@/hooks/use-site-content';
import { DEFAULT_SITE_CONTENT } from '@/lib/site-content';

const STAT_TINTS = [
  'border-t-4 border-t-sky-500 bg-sky-50 dark:bg-sky-950/40',
  'border-t-4 border-t-amber-400 bg-amber-50 dark:bg-amber-950/40',
  'border-t-4 border-t-emerald-500 bg-emerald-50 dark:bg-emerald-950/40',
  'border-t-4 border-t-rose-500 bg-rose-50 dark:bg-rose-950/40',
];

const STEP_BADGES = [
  'bg-sky-500 text-white',
  'bg-amber-400 text-amber-950',
  'bg-emerald-500 text-white',
  'bg-rose-500 text-white',
];

export default function LandingPage() {
  const [loginOpen, setLoginOpen] = useState(false);
  const { data } = useSiteContent();
  const content = data ?? DEFAULT_SITE_CONTENT;

  return (
    <ContactProvider>
    <div className="min-h-dvh bg-background">
      <div className="sticky top-0 z-50">
        <div className="h-1.5 w-full bg-[linear-gradient(90deg,#0ea5e9,#fbbf24,#22c55e,#f43f5e,#8b5cf6)]" />
        <PublicHeader onLogin={() => setLoginOpen(true)} />
      </div>
      <LoginDialog open={loginOpen} onClose={() => setLoginOpen(false)} />

      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute -left-24 top-0 h-72 w-72 rounded-full bg-sky-400/25 blur-3xl" />
        <div className="pointer-events-none absolute right-0 top-10 h-80 w-80 rounded-full bg-amber-300/30 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-emerald-400/20 blur-3xl" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-2 lg:gap-16 lg:py-24">
          <div className="min-w-0">
            <p className="mb-4 inline-flex rounded-full border border-amber-300/70 bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
              Built for schools
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl lg:text-5xl lg:leading-[1.1]">
              {content.heroTitle}
            </h1>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              {content.heroSubtitle}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => setLoginOpen(true)}
                className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-md shadow-sky-500/25 transition-colors hover:bg-primary/90"
              >
                Sign in
              </button>
              <Link
                href="/info"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
              >
                {content.ctaLabel} <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {content.stats.map((stat, i) => (
                <div key={stat.label} className={`rounded-xl border border-border px-4 py-3 ${STAT_TINTS[i % STAT_TINTS.length]}`}>
                  <div className="text-lg font-semibold tracking-tight">{stat.value}</div>
                  <div className="text-xs font-medium text-muted-foreground">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="min-w-0 rounded-2xl border-2 border-amber-200/80 bg-gradient-to-br from-sky-50 via-white to-amber-50 p-3 shadow-lg shadow-sky-500/10 sm:p-6 dark:border-sky-800 dark:from-sky-950/40 dark:via-background dark:to-amber-950/30">
            <IdCardGallery media={content.media} variant="hero" />
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-card">
        <div className="mx-auto max-w-6xl overflow-x-hidden px-4 py-14 sm:px-6 sm:py-20">
          <p className="text-sm font-semibold text-sky-600 dark:text-sky-400">Campus samples</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Demo ID cards</h2>
          <p className="mt-2 mb-8 max-w-2xl text-sm text-muted-foreground sm:text-base">
            Sample school ID cards generated on the platform. Super admin can replace these from Landing page settings.
          </p>
          <IdCardGallery media={content.media} />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">Classroom workflow</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">How it works</h2>
        <p className="mt-2 mb-8 max-w-2xl text-sm text-muted-foreground sm:text-base">
          Four steps from student enrollment to a print-ready card.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {content.howItWorks.map((step, i) => (
            <div key={step.title} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div
                className={`mb-3 flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${STEP_BADGES[i % STEP_BADGES.length]}`}
              >
                {i + 1}
              </div>
              <h3 className="mb-1.5 text-sm font-semibold">{step.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-border bg-gradient-to-br from-sky-100 via-amber-50 to-emerald-100 dark:from-sky-950/50 dark:via-amber-950/30 dark:to-emerald-950/40">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Want the full walkthrough?</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground sm:text-base">
              See how ID cards are generated, how photos are used, and what happens after you click generate.
            </p>
            <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/info"
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-md shadow-sky-500/20 hover:bg-primary/90"
              >
                {content.ctaLabel} <ArrowRight className="h-4 w-4" />
              </Link>
              <button
                type="button"
                onClick={() => setLoginOpen(true)}
                className="inline-flex items-center rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-semibold hover:bg-secondary"
              >
                Sign in
              </button>
            </div>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
    </ContactProvider>
  );
}
