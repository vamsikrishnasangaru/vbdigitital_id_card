'use client';

import { useEffect, useState } from 'react';

type ImageStatus = 'loading' | 'loaded' | 'failed';

function needsCrossOrigin(url: string): boolean {
  if (!url || url.startsWith('data:') || url.startsWith('blob:')) return false;
  if (!url.startsWith('http')) return false;
  if (typeof window === 'undefined') return false;
  try {
    return new URL(url).origin !== window.location.origin;
  } catch {
    return false;
  }
}

/** Drop-in replacement for use-image that sets crossOrigin for export-safe canvases. */
export function useCorsImage(url: string): [HTMLImageElement | undefined, ImageStatus] {
  const [image, setImage] = useState<HTMLImageElement | undefined>();
  const [status, setStatus] = useState<ImageStatus>('loading');

  useEffect(() => {
    if (!url) {
      setImage(undefined);
      setStatus('failed');
      return;
    }

    setStatus('loading');
    const img = new window.Image();
    if (needsCrossOrigin(url)) {
      img.crossOrigin = 'anonymous';
    }

    const onLoad = () => {
      setImage(img);
      setStatus('loaded');
    };
    const onError = () => {
      setImage(undefined);
      setStatus('failed');
    };

    img.addEventListener('load', onLoad);
    img.addEventListener('error', onError);
    img.src = url;

    return () => {
      img.removeEventListener('load', onLoad);
      img.removeEventListener('error', onError);
    };
  }, [url]);

  return [image, status];
}
