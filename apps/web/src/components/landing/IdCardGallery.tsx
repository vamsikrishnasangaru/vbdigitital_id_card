'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { resolveMediaUrl } from '@/lib/utils';
import { CR80_LONG_IN, CR80_SHORT_IN } from '@/lib/card-sizes';
import { DEFAULT_DEMO_MEDIA, type SiteMedia } from '@/lib/site-content';

/** Physical CR80 (ISO/IEC 7810 ID-1) — same stock size as generated cards. */
const PORTRAIT_RATIO = `${CR80_SHORT_IN} / ${CR80_LONG_IN}`;
const LANDSCAPE_RATIO = `${CR80_LONG_IN} / ${CR80_SHORT_IN}`;
const AUTOPLAY_MS = 3800;

function galleryItems(media: SiteMedia[]) {
  const gallery = media.filter((m) => m.placement !== 'info');
  return gallery.length > 0 ? gallery : DEFAULT_DEMO_MEDIA;
}

function wrappedOffset(index: number, active: number, count: number) {
  let delta = index - active;
  if (delta > count / 2) delta -= count;
  if (delta < -count / 2) delta += count;
  return delta;
}

function layoutForWidth(width: number, compact: boolean) {
  const w = width > 0 ? width : compact ? 320 : 400;
  const budget = Math.max(200, w - 4);
  const maxCard = compact ? 196 : 248;
  const minCard = compact ? 112 : 128;
  let spread = Math.min(compact ? 72 : 118, Math.round(budget * 0.2));
  let shortSide = Math.min(maxCard, Math.round(budget - 2 * spread));
  if (shortSide < minCard) {
    shortSide = Math.min(maxCard, Math.max(minCard, Math.round(budget * 0.48)));
    spread = Math.max(16, Math.floor((budget - shortSide) / 2));
  }
  const rotate = budget < 360 ? 7 : compact ? 10 : 12;
  const sideScale = budget < 360 ? 0.82 : compact ? 0.86 : 0.88;
  const portraitHeight = shortSide * (CR80_LONG_IN / CR80_SHORT_IN);
  const extra = Math.sin((rotate * Math.PI) / 180) * shortSide + 16;
  const stageHeight = Math.ceil(portraitHeight + extra);
  return { shortSide, spread, rotate, sideScale, stageHeight };
}

function carouselSlot(
  offset: number,
  spread: number,
  rotate: number,
  sideScale: number,
) {
  if (offset === 0) {
    return { x: 0, rotate: 2, scale: 1, z: 30, opacity: 1 };
  }
  if (offset === -1) {
    return { x: -spread, rotate: -rotate, scale: sideScale, z: 20, opacity: 1 };
  }
  if (offset === 1) {
    return { x: spread, rotate, scale: sideScale, z: 19, opacity: 1 };
  }
  const hiddenX = offset < 0 ? -spread * 1.25 : spread * 1.25;
  return { x: hiddenX, rotate: offset < 0 ? -rotate - 4 : rotate + 4, scale: 0.7, z: 1, opacity: 0 };
}

function DemoCardMedia({
  item,
  className,
  onOrientation,
}: {
  item: SiteMedia;
  className?: string;
  onOrientation?: (landscape: boolean) => void;
}) {
  if (item.kind === 'video') {
    return (
      <video
        src={resolveMediaUrl(item.url)}
        muted
        playsInline
        loop
        className={className}
        onLoadedMetadata={(event) => {
          const video = event.currentTarget;
          onOrientation?.(video.videoWidth > video.videoHeight);
        }}
      />
    );
  }

  return (
    <img
      src={resolveMediaUrl(item.url)}
      alt={item.caption || 'School ID card sample'}
      className={className}
      draggable={false}
      onLoad={(event) => {
        const image = event.currentTarget;
        onOrientation?.(image.naturalWidth > image.naturalHeight);
      }}
    />
  );
}

function Cr80Card({
  item,
  shortSidePx,
  className,
}: {
  item: SiteMedia;
  shortSidePx: number;
  className?: string;
}) {
  const [landscape, setLandscape] = useState(false);
  const width = landscape ? shortSidePx * (CR80_LONG_IN / CR80_SHORT_IN) : shortSidePx;
  const ratio = landscape ? LANDSCAPE_RATIO : PORTRAIT_RATIO;

  return (
    <div
      className={className}
      style={{
        width,
        maxWidth: '100%',
        aspectRatio: ratio,
      }}
    >
      <DemoCardMedia
        item={item}
        onOrientation={setLandscape}
        className="absolute inset-0 h-full w-full object-contain"
      />
    </div>
  );
}

function CardCarousel({
  items,
  compact,
  showControls,
  cardClassName,
}: {
  items: SiteMedia[];
  compact?: boolean;
  showControls?: boolean;
  cardClassName: string;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = items.length;
  const layout = layoutForWidth(width, Boolean(compact));

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (count < 2 || paused) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const timer = window.setInterval(() => {
      setActive((current) => (current + 1) % count);
    }, AUTOPLAY_MS);
    return () => window.clearInterval(timer);
  }, [count, paused]);

  if (count === 0) return null;

  const front = items[active];

  return (
    <div
      className="w-full max-w-full"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
      onTouchEnd={() => {
        window.setTimeout(() => setPaused(false), 2500);
      }}
    >
      <div
        ref={stageRef}
        className="relative mx-auto flex w-full max-w-full items-center justify-center overflow-hidden"
        style={{ height: layout.stageHeight }}
      >
        {items.map((item, index) => {
          const slot = carouselSlot(
            wrappedOffset(index, active, count),
            layout.spread,
            layout.rotate,
            layout.sideScale,
          );
          const isFront = index === active;
          return (
            <button
              key={item.id}
              type="button"
              aria-label={item.caption || `Show ID card ${index + 1}`}
              onClick={() => setActive(index)}
              className="absolute left-1/2 top-1/2 origin-center cursor-pointer border-0 bg-transparent p-0"
              style={{
                zIndex: slot.z,
                opacity: slot.opacity,
                transform: `translate(-50%, -50%) translateX(${slot.x}px) rotate(${slot.rotate}deg) scale(${slot.scale})`,
                transition: 'transform 700ms cubic-bezier(0.22, 1, 0.36, 1), opacity 500ms ease',
                pointerEvents: slot.opacity === 0 ? 'none' : 'auto',
              }}
            >
              <Cr80Card
                item={item}
                shortSidePx={layout.shortSide}
                className={`${cardClassName} ${isFront ? 'ring-2 ring-white/70' : ''}`}
              />
            </button>
          );
        })}
      </div>

      {showControls && count > 1 ? (
        <div className="mt-3 flex items-center justify-center gap-3 sm:gap-4">
          <button
            type="button"
            aria-label="Previous ID card"
            onClick={() => setActive((current) => (current - 1 + count) % count)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card hover:bg-muted"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-1.5">
            {items.map((item, index) => (
              <button
                key={item.id}
                type="button"
                aria-label={`Go to card ${index + 1}`}
                onClick={() => setActive(index)}
                className={`h-2 rounded-full transition-all ${
                  index === active ? 'w-6 bg-primary' : 'w-2 bg-muted-foreground/30 hover:bg-muted-foreground/50'
                }`}
              />
            ))}
          </div>
          <button
            type="button"
            aria-label="Next ID card"
            onClick={() => setActive((current) => (current + 1) % count)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card hover:bg-muted"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      {showControls && front?.caption ? (
        <p className="mt-3 px-2 text-center text-sm font-medium text-muted-foreground">{front.caption}</p>
      ) : null}
    </div>
  );
}

export function IdCardGallery({
  media,
  variant = 'grid',
}: {
  media: SiteMedia[];
  variant?: 'grid' | 'hero';
}) {
  const items = galleryItems(media);

  if (variant === 'hero') {
    return (
      <CardCarousel
        items={items}
        compact
        cardClassName="relative overflow-hidden rounded-xl border-2 border-white/80 bg-white shadow-2xl"
      />
    );
  }

  return (
    <CardCarousel
      items={items}
      showControls
      cardClassName="relative overflow-hidden rounded-2xl border border-border bg-white shadow-xl"
    />
  );
}
