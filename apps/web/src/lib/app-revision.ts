/** Baked into the client bundle at build time — changes every deploy. */
export const APP_REVISION =
  process.env.NEXT_PUBLIC_APP_REVISION?.trim() || 'dev';

export const APP_REVISION_STORAGE_KEY = 'vb-app-revision';
