import type { VbAxiosConfig } from '@/lib/api';

/** Headless batch render can load large student payloads — avoid the 4s app default. */
export const RENDER_API_TIMEOUT_MS = 120_000;

export function renderAuthConfig(token: string): VbAxiosConfig {
  return {
    headers: { Authorization: `Bearer ${token}` },
    timeout: RENDER_API_TIMEOUT_MS,
    _skipOfflineQueue: true,
  } as VbAxiosConfig;
}
