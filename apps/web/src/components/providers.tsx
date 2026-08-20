'use client';

import { OfflineSyncProvider } from '@/components/OfflineSyncProvider';
import { SerwistRegistration } from '@/components/SerwistRegistration';
import { ThemeProvider } from 'next-themes';
import { SchoolColorProvider } from '@/components/SchoolColorProvider';
import { Toaster } from 'sonner';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { useState, useEffect } from 'react';
import { APP_REVISION } from '@/lib/app-revision';
function isNetworkError(error: unknown): boolean {
  const err = error as { response?: { status?: number }; code?: string };
  if (!err.response || err.code === 'ERR_NETWORK' || err.code === 'ECONNABORTED') return true;
  const status = err.response.status;
  return status === 502 || status === 503 || status === 504;
}

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && !navigator.onLine;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000 * 60 * 5,
            gcTime: 1000 * 60 * 60 * 24 * 7,
            networkMode: 'offlineFirst',
            refetchOnWindowFocus: false,
            refetchOnReconnect: true,
            refetchOnMount: true,
            retry: (failureCount, error) => {
              if (isOffline()) return false;
              if (isNetworkError(error)) return failureCount < 1;
              return failureCount < 2;
            },
            /** Never blow up the page for a connectivity problem — show cached/empty data. */
            throwOnError: (error) => !isOffline() && !isNetworkError(error),
          },
          mutations: {
            networkMode: 'offlineFirst',
            retry: false,
          },
        },
      }),
  );

  const [persister, setPersister] = useState<ReturnType<typeof createSyncStoragePersister> | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const syncPersister = createSyncStoragePersister({
      storage: window.localStorage,
      key: `vb-id-cards-query-cache-${APP_REVISION}`,
    });
    setPersister(syncPersister);

    import('@/lib/sync-engine').then(({ syncEngine }) => {
      syncEngine.init();
    });
  }, []);

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
      <SchoolColorProvider>
      <SerwistRegistration>
      {mounted && persister ? (
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{
            persister,
            maxAge: 1000 * 60 * 60 * 24,
            dehydrateOptions: {
              shouldDehydrateQuery: (query) => {
                if (query.state.status !== 'success') return false;
                const root = query.queryKey[0];
                if (root === 'templates') return false;
                return true;
              },
            },
          }}
        >
          <OfflineSyncProvider>{children}</OfflineSyncProvider>
        </PersistQueryClientProvider>
      ) : (
        <QueryClientProvider client={queryClient}>
          <OfflineSyncProvider>{children}</OfflineSyncProvider>
        </QueryClientProvider>
      )}
      <Toaster position="top-right" richColors closeButton />
      </SerwistRegistration>
      </SchoolColorProvider>
    </ThemeProvider>
  );
}
