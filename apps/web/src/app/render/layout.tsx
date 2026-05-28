import type { ReactNode } from 'react';

/** Minimal layout for Puppeteer PDF capture — no dashboard chrome. */
export default function RenderLayout({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        margin: 0,
        padding: 0,
        width: 'fit-content',
        height: 'fit-content',
        overflow: 'hidden',
        background: '#ffffff',
      }}
    >
      {children}
    </div>
  );
}
