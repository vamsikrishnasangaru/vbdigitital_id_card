'use client';

import Link from 'next/link';
import { useState } from 'react';
import { PublicHeader } from '@/components/landing/PublicHeader';
import { LoginDialog } from '@/components/auth/LoginDialog';
import { ContactProvider } from '@/components/landing/ContactProvider';
import { PublicFooter } from '@/components/landing/PublicFooter';
import { WhatsAppFloatButton } from '@/components/landing/WhatsAppFloatButton';
import { IdCardGallery } from '@/components/landing/IdCardGallery';
import { useSiteContent } from '@/hooks/use-site-content';
import { DEFAULT_SITE_CONTENT } from '@/lib/site-content';
import { resolveMediaUrl } from '@/lib/utils';

export default function MoreInfoPage() {
  const [loginOpen, setLoginOpen] = useState(false);
  const { data } = useSiteContent();
  const content = data ?? DEFAULT_SITE_CONTENT;
  const infoMedia = content.media.filter((m) => m.placement === 'info');
  const galleryFallback = content.media.filter((m) => m.placement !== 'info');

  return (
    <ContactProvider>
    <div className="min-h-dvh bg-background flex flex-col">
      <PublicHeader onLogin={() => setLoginOpen(true)} />
      <LoginDialog open={loginOpen} onClose={() => setLoginOpen(false)} />

      <main className="mx-auto max-w-3xl flex-1 px-4 py-12 sm:px-6 sm:py-16">
        <section className="mb-12">
          <p className="text-sm font-semibold text-sky-600 dark:text-sky-400">Campus samples</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Demo ID cards</h2>
          <p className="mt-2 mb-6 text-sm text-muted-foreground sm:text-base">
            Sample school ID cards generated on the platform.
          </p>
          {infoMedia.length > 0 ? (
            <div className="space-y-4">
              {infoMedia.map((item) => (
                <figure key={item.id} className="overflow-hidden rounded-2xl border border-border bg-card">
                  {item.kind === 'video' ? (
                    <video
                      src={resolveMediaUrl(item.url)}
                      controls
                      playsInline
                      className="aspect-video w-full bg-black object-cover"
                    />
                  ) : (
                    <img
                      src={resolveMediaUrl(item.url)}
                      alt={item.caption || 'Demo'}
                      className="w-full object-contain"
                    />
                  )}
                  {item.caption ? (
                    <figcaption className="px-3 py-2 text-xs text-muted-foreground">{item.caption}</figcaption>
                  ) : null}
                </figure>
              ))}
            </div>
          ) : (
            <IdCardGallery media={galleryFallback} />
          )}
        </section>

        <p className="mb-3 text-sm font-medium text-primary">Product</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{content.moreInfoTitle}</h1>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">{content.moreInfoIntro}</p>

        <section className="mt-12">
          <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">Classroom workflow</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">How it works</h2>
          <p className="mt-2 mb-6 text-sm text-muted-foreground sm:text-base">
            Four steps from student enrollment to a print-ready card.
          </p>
          <ol className="space-y-3">
            {content.howItWorks.map((step, i) => (
              <li key={step.title} className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <div className="mb-1 text-xs font-medium text-primary">Step {i + 1}</div>
                <h3 className="text-sm font-semibold">{step.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-12">
          <h2 className="mb-4 text-lg font-semibold">How ID cards are generated</h2>
          <ol className="space-y-3">
            {content.generationSteps.map((step) => (
              <li key={step.title} className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <h3 className="text-sm font-semibold">{step.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <div className="mt-12 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setLoginOpen(true)}
            className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Sign in
          </button>
          <Link href="/" className="rounded-lg border border-border bg-card px-5 py-2.5 text-sm font-medium hover:bg-muted">
            Back to home
          </Link>
        </div>
      </main>
      <PublicFooter />
      <WhatsAppFloatButton />
    </div>
    </ContactProvider>
  );
}
