'use client';

import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { DEFAULT_SITE_CONTENT, type SiteContentPayload } from '@/lib/site-content';

export function useSiteContent() {
  return useQuery({
    queryKey: ['site-content'],
    queryFn: async () => {
      const { data } = await api.get<SiteContentPayload>('/site-content');
      return data;
    },
    placeholderData: DEFAULT_SITE_CONTENT,
    staleTime: 60_000,
    retry: 1,
    throwOnError: false,
  });
}
