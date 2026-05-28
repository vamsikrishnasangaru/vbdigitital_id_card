import Script from 'next/script';
import { SW_DEV_BOOTSTRAP } from '@/lib/sw-dev-bootstrap';

/** Purge stale Serwist registrations before the app bundle runs (dev only). */
export function SwDevBootstrap() {
  if (process.env.NODE_ENV !== 'development') return null;

  return (
    <Script id="vb-sw-dev-bootstrap" strategy="beforeInteractive">
      {SW_DEV_BOOTSTRAP}
    </Script>
  );
}
