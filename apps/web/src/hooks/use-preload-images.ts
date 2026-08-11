'use client';

import { useEffect, useState } from 'react';

export type PreloadImagesStatus = 'idle' | 'loading' | 'ready';

function needsCrossOrigin(url: string): boolean {
  if (!url || url.startsWith('data:') || url.startsWith('blob:')) return false;
  if (!url.startsWith('http') || typeof window === 'undefined') return false;
  try {
    return new URL(url).origin !== window.location.origin;
  } catch {
    return false;
  }
}

/** Preload image URLs (used before headless Konva render so backgrounds/frames are painted). */
export function usePreloadImages(urls: string[], skip = false): PreloadImagesStatus {
  const key = urls.filter(Boolean).join('\0');
  const [status, setStatus] = useState<PreloadImagesStatus>(skip ? 'ready' : 'idle');

  useEffect(() => {
    if (skip) {
      setStatus('ready');
      return;
    }

    const list = [...new Set(urls.filter(Boolean))];
    if (list.length === 0) {
      setStatus('ready');
      return;
    }

    setStatus('loading');
    let cancelled = false;

    Promise.all(
      list.map(
        (url) =>
          new Promise<void>((resolve) => {
            const img = new window.Image();
            if (needsCrossOrigin(url)) img.crossOrigin = 'anonymous';
            img.onload = () => resolve();
            img.onerror = () => resolve();
            img.src = url;
          }),
      ),
    ).then(() => {
      if (!cancelled) setStatus('ready');
    });

    return () => {
      cancelled = true;
    };
  }, [key, skip]);

  return status;
}
