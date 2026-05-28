'use client';

import { useEffect } from 'react';
import { toast } from 'sonner';

export const WATERMARK_LABEL = 'VBDIGITAL';

const WATERMARK_BG = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="280" height="160" viewBox="0 0 280 160">
    <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"
      transform="rotate(-32 140 80)"
      font-family="Arial,Helvetica,sans-serif" font-size="15" font-weight="700"
      fill="rgba(30,64,175,0.22)" letter-spacing="1">${WATERMARK_LABEL}</text>
  </svg>`,
)}")`;

export function useRestrictedPreviewGuards(active: boolean) {
  useEffect(() => {
    if (!active) return;

    const blockContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.('[data-restricted-preview-root]')) {
        e.preventDefault();
      }
    };

    const blockKeys = (e: KeyboardEvent) => {
      const root = document.querySelector('[data-restricted-preview-root]');
      if (!root) return;

      const key = e.key.toLowerCase();
      const withMod = e.ctrlKey || e.metaKey;
      if (withMod && (key === 's' || key === 'p' || key === 'c')) {
        e.preventDefault();
        toast.error('Download and copy are disabled in preview mode.');
        return;
      }
      if (key === 'printscreen') {
        e.preventDefault();
        toast.error('Screenshots are not permitted for ID card preview.');
      }
    };

    const blockCopy = (e: ClipboardEvent) => {
      const sel = document.getSelection();
      if (!sel?.anchorNode) return;
      const root = document.querySelector('[data-restricted-preview-root]');
      if (root?.contains(sel.anchorNode)) {
        e.preventDefault();
        toast.error('Copy is disabled in preview mode.');
      }
    };

    const blockDrag = (e: DragEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.('[data-restricted-preview-root]')) {
        e.preventDefault();
      }
    };

    document.addEventListener('contextmenu', blockContextMenu, true);
    document.addEventListener('keydown', blockKeys, true);
    document.addEventListener('copy', blockCopy, true);
    document.addEventListener('dragstart', blockDrag, true);

    return () => {
      document.removeEventListener('contextmenu', blockContextMenu, true);
      document.removeEventListener('keydown', blockKeys, true);
      document.removeEventListener('copy', blockCopy, true);
      document.removeEventListener('dragstart', blockDrag, true);
    };
  }, [active]);
}

export function DesignerRestrictedWatermark() {
  return (
    <div
      className="absolute inset-0 z-30 pointer-events-none select-none"
      aria-hidden
      onContextMenu={(e) => e.preventDefault()}
      style={{
        userSelect: 'none',
        WebkitUserSelect: 'none',
        backgroundImage: WATERMARK_BG,
        backgroundRepeat: 'repeat',
        backgroundSize: '280px 160px',
      }}
    >
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <span
          className="text-lg sm:text-xl font-black uppercase tracking-[0.25em] text-blue-900/25 rotate-[-28deg] whitespace-nowrap"
          style={{ textShadow: '0 0 1px rgba(255,255,255,0.5)' }}
        >
          {WATERMARK_LABEL}
        </span>
      </div>
    </div>
  );
}
