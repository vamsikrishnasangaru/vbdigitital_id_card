'use client';

import { useCallback, useEffect, useState } from 'react';
import api from '@/lib/api';
import { isEffectivelyOffline } from '@/lib/offline-store';
import { getSyncStatus, syncStatusEventName, type SyncStatus } from '@/lib/sync-state';

export function useSystemStatus() {
  const [browserOnline, setBrowserOnline] = useState(true);
  const [apiOnline, setApiOnline] = useState(true);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(() => getSyncStatus());

  const checkApi = useCallback(async () => {
    if (typeof window === 'undefined' || isEffectivelyOffline()) {
      setApiOnline(false);
      return;
    }

    try {
      await api.get('/auth/profile', { timeout: 8000 });
      setApiOnline(true);
    } catch (err: unknown) {
      const axiosErr = err as { response?: unknown; code?: string };
      if (axiosErr.response) {
        setApiOnline(true);
      } else {
        setApiOnline(false);
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const syncBrowser = () => {
      const online = !isEffectivelyOffline();
      setBrowserOnline(online);
      if (online) checkApi();
      else setApiOnline(false);
    };

    setBrowserOnline(!isEffectivelyOffline());
    if (!isEffectivelyOffline()) checkApi();

    window.addEventListener('online', syncBrowser);
    window.addEventListener('offline', syncBrowser);

    const interval = window.setInterval(() => {
      if (!isEffectivelyOffline()) checkApi();
    }, 30000);
    const onSyncStatus = (e: Event) => {
      const detail = (e as CustomEvent<{ status?: SyncStatus }>).detail;
      if (detail?.status) setSyncStatus(detail.status);
    };
    window.addEventListener(syncStatusEventName(), onSyncStatus);

    return () => {
      window.removeEventListener('online', syncBrowser);
      window.removeEventListener('offline', syncBrowser);
      window.removeEventListener(syncStatusEventName(), onSyncStatus);
      window.clearInterval(interval);
    };
  }, [checkApi]);

  const systemOnline = browserOnline && apiOnline;

  return { browserOnline, apiOnline, systemOnline, syncStatus };
}
