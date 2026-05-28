'use client';

import { useCallback, useEffect, useState } from 'react';
import api from '@/lib/api';

export function useSystemStatus() {
  const [browserOnline, setBrowserOnline] = useState(true);
  const [apiOnline, setApiOnline] = useState(true);

  const checkApi = useCallback(async () => {
    if (typeof window === 'undefined' || !navigator.onLine) {
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
      const online = navigator.onLine;
      setBrowserOnline(online);
      if (online) checkApi();
      else setApiOnline(false);
    };

    setBrowserOnline(navigator.onLine);
    if (navigator.onLine) checkApi();

    window.addEventListener('online', syncBrowser);
    window.addEventListener('offline', syncBrowser);

    const interval = window.setInterval(() => {
      if (navigator.onLine) checkApi();
    }, 30000);

    return () => {
      window.removeEventListener('online', syncBrowser);
      window.removeEventListener('offline', syncBrowser);
      window.clearInterval(interval);
    };
  }, [checkApi]);

  const systemOnline = browserOnline && apiOnline;

  return { browserOnline, apiOnline, systemOnline };
}
