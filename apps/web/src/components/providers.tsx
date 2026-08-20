'use client';

import { OfflineSyncProvider } from '@/components/OfflineSyncProvider';
import { SerwistRegistration } from '@/components/SerwistRegistration';
import { OfflineReadyIndicator } from '@/components/OfflineReadyIndicator';
import { ThemeProvider } from 'next-themes';
import { SchoolColorProvider } from '@/components/SchoolColorProvider';
import { Toaster } from 'sonner';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { useState, useEffect, useLayoutEffect } from 'react';
import { APP_REVISION } from '@/lib/app-revision';
import { buildAppVersionBootstrapScript } from '@/lib/app-version-bootstrap';
import { buildSchoolColorBootstrapScript } from '@/lib/school-color';
import { OFFLINE_BOOT_FALLBACK } from '@/lib/offline-boot-fallback';
import { isEffectivelyOffline, clearForcedOfflineFlag } from '@/lib/offline-store';
import { OFFLINE_STORAGE_KEYS } from '@/lib/offline-store-keys';
import { bootstrapOfflineStorage } from '@/lib/offline-indexeddb';

function isNetworkError(error: unknown): boolean {
  const err = error as { response?: { status?: number }; code?: string };
  if (!err.response || err.code === 'ERR_NETWORK' || err.code === 'ECONNABORTED') return true;
  const status = err.response.status;
  return status === 502 || status === 503 || status === 504;
}

function isOffline(): boolean {
  return isEffectivelyOffline();
}

function injectInlineScript(id: string, source: string) {
  if (typeof document === 'undefined') return;
  if (document.getElementById(id)) return;
  const el = document.createElement('script');
  el.id = id;
  el.text = source;
  document.head.appendChild(el);
}

const OFFLINE_BOOT_SCRIPT = `${OFFLINE_BOOT_FALLBACK}
(function () {
  var btn = document.getElementById("vb-offline-retry");
  if (btn) btn.addEventListener("click", function () {
    try { sessionStorage.removeItem("vb-forced-offline"); } catch (e) {}
    location.reload();
  });
})();`;

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

  // DOM injection only — never render <script> through React (React 19 treats those as lazy resources).
  // HMR/offline WebSocket patch runs earlier via instrumentation-client.ts.
  useLayoutEffect(() => {
    injectInlineScript('vb-app-version-bootstrap', buildAppVersionBootstrapScript(APP_REVISION));
    injectInlineScript('vb-school-color-bootstrap', buildSchoolColorBootstrapScript());
    injectInlineScript('vb-offline-boot-fallback', OFFLINE_BOOT_SCRIPT);
  }, []);

  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      clearForcedOfflineFlag();
    }

    void bootstrapOfflineStorage(Object.values(OFFLINE_STORAGE_KEYS));
    setMounted(true);
    document.documentElement.setAttribute('data-vb-app', 'ready');
    window.dispatchEvent(new CustomEvent('vb-app-ready'));
    setPersister(
      createSyncStoragePersister({
        storage: window.localStorage,
        key: `vb-id-cards-query-cache-${APP_REVISION}`,
      }),
    );

    void import('@/lib/sync-engine').then(({ syncEngine }) => {
      syncEngine.init();
    });
  }, []);

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
      // React 19 treats next-themes' FOUC <script> as a lazy resource unless type is non-JS.
      scriptProps={{ type: 'application/json' }}
    >
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
          <Toaster position="top-right" richColors closeButton visibleToasts={4} />
          <OfflineReadyIndicator />
        </SerwistRegistration>
      </SchoolColorProvider>
    </ThemeProvider>
  );
}
