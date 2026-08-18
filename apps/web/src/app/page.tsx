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
    <div className="min-h-screen bg-background">
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
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-white/70 mb-3">
              VB Digital ID Cards
            </p>
            <h1 className="text-4xl sm:text-5xl font-black leading-tight">{content.heroTitle}</h1>
            <p className="mt-4 text-lg text-white/80 leading-relaxed max-w-xl">{content.heroSubtitle}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setLoginOpen(true)}
                className="px-5 py-2.5 rounded-xl bg-white text-[#111113] text-sm font-black hover:bg-white/90"
              >
                Login
              </button>
              <Link
                href="/info"
                className="px-5 py-2.5 rounded-xl border border-white/30 text-sm font-black hover:bg-white/10 inline-flex items-center gap-2"
              >
                {content.ctaLabel} <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="mt-10 grid grid-cols-2 sm:grid-cols-4 gap-3">
              {content.stats.map((stat) => (
                <div key={stat.label} className="bg-white/10 rounded-xl p-3">
                  <div className="text-xl font-black">{stat.value}</div>
                  <div className="text-white/60 text-[11px] font-medium">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="hidden lg:block">
            <IdCardGallery media={[]} />
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
        <h2 className="text-2xl sm:text-3xl font-black mb-2">Demo ID cards</h2>
        <p className="text-muted-foreground mb-8 max-w-2xl">
          Sample layouts of school ID cards generated on the platform. Super admin can replace these with real school samples.
        </p>
        <IdCardGallery media={content.media} />
      </section>

      <section className="bg-muted/40 border-y border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
          <h2 className="text-2xl sm:text-3xl font-black mb-2">How it works</h2>
          <p className="text-muted-foreground mb-8 max-w-2xl">
            Four steps from student enrollment to a print-ready card.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {content.howItWorks.map((step, i) => (
              <div key={step.title} className="bg-card border border-border rounded-2xl p-5">
                <div className="text-xs font-black text-primary mb-2">0{i + 1}</div>
                <h3 className="font-bold mb-2">{step.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
        <div className="rounded-3xl border border-border bg-card p-8 sm:p-12 text-center">
          <CheckCircle2 className="h-10 w-10 text-primary mx-auto mb-4" />
          <h2 className="text-2xl sm:text-3xl font-black mb-3">Want the full walkthrough?</h2>
          <p className="text-muted-foreground max-w-xl mx-auto mb-6">
            See how ID cards are generated, how photos are used, and what happens after you click generate.
          </p>
          <Link
            href="/info"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-black hover:opacity-90"
          >
            {content.ctaLabel} <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} VB Digital ID Cards. All rights reserved.
      </footer>
    </div>
  );
}
