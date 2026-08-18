'use client';

import { resolveMediaUrl } from '@/lib/utils';
import type { SiteMedia } from '@/lib/site-content';

const SAMPLE_CARDS = [
  { name: 'Ananya R.', cls: 'Class 10-A', roll: '24' },
  { name: 'Rahul K.', cls: 'Class 8-B', roll: '11' },
  { name: 'Meera S.', cls: 'Class 12-C', roll: '07' },
];

function SampleCard({ name, cls, roll, accent }: { name: string; cls: string; roll: string; accent: string }) {
  return (
    <div className="w-[168px] sm:w-[190px] aspect-[5/8] rounded-2xl overflow-hidden shadow-2xl border border-white/20 bg-[#0b1220] text-white shrink-0">
      <div className="h-10" style={{ background: accent }} />
      <div className="px-3 pt-3 pb-4 flex flex-col items-center">
        <div
          className="h-16 w-16 rounded-full border-2 border-white/80 mb-3"
          style={{ background: 'linear-gradient(135deg,#cbd5e1,#64748b)' }}
        />
        <p className="text-sm font-black text-center leading-tight">{name}</p>
        <p className="text-[10px] text-white/70 mt-1">{cls}</p>
        <p className="text-[10px] font-mono text-white/50 mt-0.5">Roll {roll}</p>
        <div className="mt-4 w-full h-8 rounded-md bg-white/10" />
      </div>
    </div>
  );
}

export function IdCardGallery({ media }: { media: SiteMedia[] }) {
  const gallery = media.filter((m) => m.placement !== 'info');

  if (gallery.length === 0) {
    return (
      <div className="flex justify-center gap-4 sm:gap-6 overflow-x-auto pb-2 px-1">
        {SAMPLE_CARDS.map((card, i) => (
          <SampleCard
            key={card.name}
            {...card}
            accent={['#4f46e5', '#7c3aed', '#0ea5e9'][i]}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {gallery.map((item) => (
        <figure
          key={item.id}
          className="rounded-2xl overflow-hidden border border-border bg-card shadow-sm"
        >
          {item.kind === 'video' ? (
            <video
              src={resolveMediaUrl(item.url)}
              controls
              playsInline
              className="w-full aspect-[4/3] object-cover bg-black"
            />
          ) : (
            <img
              src={resolveMediaUrl(item.url)}
              alt={item.caption || 'ID card demo'}
              className="w-full aspect-[4/3] object-cover"
            />
          )}
          {item.caption ? (
            <figcaption className="px-3 py-2 text-xs font-medium text-muted-foreground">
              {item.caption}
            </figcaption>
          ) : null}
        </figure>
      ))}
    </div>
  );
}
