'use client';

import Link from 'next/link';
import { useState } from 'react';
import { PublicHeader } from '@/components/landing/PublicHeader';
import { LoginDialog } from '@/components/auth/LoginDialog';
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
    <div className="min-h-screen bg-background">
      <PublicHeader onLogin={() => setLoginOpen(true)} />
      <LoginDialog open={loginOpen} onClose={() => setLoginOpen(false)} />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-primary mb-3">More info</p>
        <h1 className="text-3xl sm:text-4xl font-black leading-tight">{content.moreInfoTitle}</h1>
        <p className="mt-4 text-muted-foreground text-lg leading-relaxed">{content.moreInfoIntro}</p>

        <section className="mt-12">
          <h2 className="text-xl font-black mb-4">How it works</h2>
          <ol className="space-y-4">
            {content.howItWorks.map((step, i) => (
              <li key={step.title} className="border border-border rounded-2xl p-5 bg-card">
                <div className="text-xs font-black text-primary mb-1">Step {i + 1}</div>
                <h3 className="font-bold">{step.title}</h3>
                <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-12">
          <h2 className="text-xl font-black mb-4">How ID cards are generated</h2>
          <ol className="space-y-4">
            {content.generationSteps.map((step) => (
              <li key={step.title} className="border border-border rounded-2xl p-5 bg-card">
                <h3 className="font-bold">{step.title}</h3>
                <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {(infoMedia.length > 0 || galleryFallback.length > 0) && (
          <section className="mt-12">
            <h2 className="text-xl font-black mb-4">Samples</h2>
            {infoMedia.length > 0 ? (
              <div className="space-y-4">
                {infoMedia.map((item) => (
                  <figure key={item.id} className="rounded-2xl overflow-hidden border border-border bg-card">
                    {item.kind === 'video' ? (
                      <video
                        src={resolveMediaUrl(item.url)}
                        controls
                        playsInline
                        className="w-full aspect-video object-cover bg-black"
                      />
                    ) : (
                      <img
                        src={resolveMediaUrl(item.url)}
                        alt={item.caption || 'Demo'}
                        className="w-full object-cover"
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
        )}

        <div className="mt-12 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setLoginOpen(true)}
            className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-black"
          >
            Login
          </button>
          <Link href="/" className="px-5 py-2.5 rounded-xl border border-border text-sm font-bold">
            Back to home
          </Link>
        </div>
      </main>
    </div>
  );
}
