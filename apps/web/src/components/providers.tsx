'use client';

import { SerwistRegistration } from '@/components/SerwistRegistration';
import { ThemeProvider } from 'next-themes';
import { Toaster } from 'sonner';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { useState, useEffect } from 'react';
function OfflineSyncListener({ queryClient }: { queryClient: QueryClient }) {
  useEffect(() => {
    const onSyncComplete = () => {
      void queryClient.invalidateQueries({ refetchType: 'active' });
    };
    window.addEventListener('vb-offline-sync-complete', onSyncComplete);
    return () => window.removeEventListener('vb-offline-sync-complete', onSyncComplete);
  }, [queryClient]);
  return null;
}

function isNetworkError(error: unknown): boolean {
  const err = error as { response?: unknown; code?: string };
  return !err.response || err.code === 'ERR_NETWORK';
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
              if (typeof navigator !== 'undefined' && !navigator.onLine) return false;
              if (isNetworkError(error)) return failureCount < 1;
              return failureCount < 2;
            },
            /** Keep showing last good data when offline instead of error screens. */
            throwOnError: (error, query) => {
              if (query.state.data !== undefined && isNetworkError(error)) return false;
              if (typeof navigator !== 'undefined' && !navigator.onLine) return false;
              return true;
            },
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
      key: 'vb-id-cards-query-cache',
    });
    setPersister(syncPersister);

    import('@/lib/sync-engine').then(({ syncEngine }) => {
      syncEngine.init();
    });
  }, []);

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
      <SerwistRegistration>
      {mounted && persister ? (
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{ persister, maxAge: 1000 * 60 * 60 * 24 * 7 }}
        >
          <OfflineSyncListener queryClient={queryClient} />
          {children}
        </PersistQueryClientProvider>
      ) : (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      )}
      <Toaster position="top-right" richColors closeButton />
      </SerwistRegistration>
    </ThemeProvider>
  );
}
