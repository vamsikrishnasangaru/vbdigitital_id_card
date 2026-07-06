'use client';

import { useEffect, useRef } from 'react';

type SwipeHandlers = {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
};

/** Horizontal swipe on a container — swipe left = next, swipe right = previous. */
export function useSwipeNavigation(
  element: HTMLElement | null,
  handlers: SwipeHandlers,
  enabled = true,
  minDistance = 48,
) {
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!enabled || !element) return;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      startRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };

    const onTouchEnd = (e: TouchEvent) => {
      const start = startRef.current;
      startRef.current = null;
      if (!start || e.changedTouches.length !== 1) return;

      const dx = e.changedTouches[0].clientX - start.x;
      const dy = e.changedTouches[0].clientY - start.y;
      if (Math.abs(dx) < minDistance || Math.abs(dx) < Math.abs(dy) * 1.2) return;

      if (dx < 0) handlersRef.current.onSwipeLeft?.();
      else handlersRef.current.onSwipeRight?.();
    };

    element.addEventListener('touchstart', onTouchStart, { passive: true });
    element.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      element.removeEventListener('touchstart', onTouchStart);
      element.removeEventListener('touchend', onTouchEnd);
    };
  }, [element, enabled, minDistance]);
}
