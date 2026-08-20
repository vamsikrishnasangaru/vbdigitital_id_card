/**
 * Runs on the client before React hydration (Next.js convention).
 * Installs the offline HMR WebSocket patch so DevTools Offline doesn't spam
 * webpack-hmr connection errors — and so hydrate isn't blocked by HMR retries.
 */
import { installDevClientBoot } from '@/lib/dev-client-boot';

installDevClientBoot();
