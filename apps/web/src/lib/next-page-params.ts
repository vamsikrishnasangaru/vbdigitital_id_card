'use client';

import { use } from 'react';

export type NextClientPageProps = {
  params?: Promise<Record<string, string | string[]>>;
};

/** Unwrap async route params in Next.js 15+ client page components. */
export function useNextPageParams(params?: Promise<Record<string, string | string[]>>) {
  return use(params ?? Promise.resolve({}));
}
