'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { PublicHeader } from '@/components/landing/PublicHeader';
import { LoginDialog } from '@/components/auth/LoginDialog';
import { IdCardGallery } from '@/components/landing/IdCardGallery';
import { useSiteContent } from '@/hooks/use-site-content';
import { DEFAULT_SITE_CONTENT } from '@/lib/site-content';

export default function LandingPage() {
  const [loginOpen, setLoginOpen] = useState(false);
  const { data } = useSiteContent();
  const content = data ?? DEFAULT_SITE_CONTENT;

  return (
    <div className="min-h-dvh overflow-x-hidden bg-background">
      <PublicHeader onLogin={() => setLoginOpen(true)} />
      <LoginDialog open={loginOpen} onClose={() => setLoginOpen(false)} />

      <section className="relative overflow-hidden bg-gradient-to-br from-[oklch(0.28_0.16_270)] via-[oklch(0.38_0.18_280)] to-[oklch(0.32_0.20_300)] text-white">
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
          }}
        />
        <div className="relative mx-auto grid max-w-6xl items-center gap-8 px-4 py-8 sm:gap-12 sm:px-6 sm:py-16 lg:grid-cols-2 lg:py-24">
          <div className="min-w-0">
            <p className="mb-3 text-[11px] font-black uppercase tracking-[0.2em] text-white/70 sm:text-xs">
              VB Digital ID Cards
            </p>
            <h1 className="text-[1.75rem] font-black leading-tight sm:text-4xl lg:text-5xl">{content.heroTitle}</h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/80 sm:mt-4 sm:text-lg">{content.heroSubtitle}</p>
            <div className="mt-6 flex flex-col gap-3 sm:mt-8 sm:flex-row sm:flex-wrap">
              <button
                type="button"
                onClick={() => setLoginOpen(true)}
                className="rounded-xl bg-white px-5 py-3 text-sm font-black text-[#111113] hover:bg-white/90 sm:py-2.5"
              >
                Login
              </button>
              <Link
                href="/info"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/30 px-5 py-3 text-sm font-black hover:bg-white/10 sm:py-2.5"
              >
                {content.ctaLabel} <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="mt-8 grid grid-cols-2 gap-2 sm:mt-10 sm:grid-cols-4 sm:gap-3">
              {content.stats.map((stat) => (
                <div key={stat.label} className="rounded-xl bg-white/10 p-3">
                  <div className="text-lg font-black sm:text-xl">{stat.value}</div>
                  <div className="text-[10px] font-medium text-white/60 sm:text-[11px]">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="min-w-0">
            <IdCardGallery media={content.media} variant="hero" />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl overflow-x-hidden px-4 py-10 sm:px-6 sm:py-16">
        <h2 className="mb-2 text-2xl font-black sm:text-3xl">Demo ID cards</h2>
        <p className="mb-6 max-w-2xl text-sm text-muted-foreground sm:mb-8 sm:text-base">
          Sample school ID cards generated on the platform. Super admin can replace these from Landing page settings.
        </p>
        <IdCardGallery media={content.media} />
      </section>

      <section className="border-y border-border bg-muted/40">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-16">
          <h2 className="mb-2 text-2xl font-black sm:text-3xl">How it works</h2>
          <p className="mb-6 max-w-2xl text-sm text-muted-foreground sm:mb-8 sm:text-base">
            Four steps from student enrollment to a print-ready card.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
            {content.howItWorks.map((step, i) => (
              <div key={step.title} className="rounded-2xl border border-border bg-card p-5">
                <div className="mb-2 text-xs font-black text-primary">0{i + 1}</div>
                <h3 className="mb-2 font-bold">{step.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-16">
        <div className="rounded-3xl border border-border bg-card p-6 text-center sm:p-12">
          <CheckCircle2 className="mx-auto mb-4 h-10 w-10 text-primary" />
          <h2 className="mb-3 text-2xl font-black sm:text-3xl">Want the full walkthrough?</h2>
          <p className="mx-auto mb-6 max-w-xl text-sm text-muted-foreground sm:text-base">
            See how ID cards are generated, how photos are used, and what happens after you click generate.
          </p>
          <Link
            href="/info"
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-black text-primary-foreground hover:opacity-90"
          >
            {content.ctaLabel} <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <footer className="border-t border-border px-4 py-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} VB Digital ID Cards. All rights reserved.
      </footer>
    </div>
  );
}
