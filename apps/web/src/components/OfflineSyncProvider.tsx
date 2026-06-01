'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { syncEngine } from '@/lib/sync-engine';
import { offlineStore, isBrowserOnline } from '@/lib/offline-store';

export type OfflineSyncState = {
  isOffline: boolean;
  pendingCount: number;
  offlineStudentCount: number;
  offlineClassCount: number;
  offlineTeacherCount: number;
  refreshCounts: () => Promise<void>;
};

const OfflineSyncContext = createContext<OfflineSyncState | null>(null);

const REFRESH_INTERVAL_MS = 60_000;

function useOfflineSyncInternal(): OfflineSyncState {
  const queryClient = useQueryClient();
  const [isOffline, setIsOffline] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [offlineStudentCount, setOfflineStudentCount] = useState(0);
  const [offlineClassCount, setOfflineClassCount] = useState(0);
  const [offlineTeacherCount, setOfflineTeacherCount] = useState(0);
  const invalidateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshCounts = useCallback(async () => {
    setPendingCount(await syncEngine.getQueueLength());
    setOfflineStudentCount(offlineStore.getPendingStudentCount());
    setOfflineClassCount(offlineStore.getPendingClassStructureCount());
    setOfflineTeacherCount(offlineStore.getPendingTeacherCount());
  }, []);

  const invalidateActiveLists = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['students'], refetchType: 'active' });
    void queryClient.invalidateQueries({ queryKey: ['templates'], refetchType: 'active' });
    void queryClient.invalidateQueries({ queryKey: ['classes'], refetchType: 'active' });
    void queryClient.invalidateQueries({ queryKey: ['teachers'], refetchType: 'active' });
    void queryClient.invalidateQueries({ queryKey: ['teachers-minimal'], refetchType: 'active' });
    void queryClient.invalidateQueries({ queryKey: ['students-batch'], refetchType: 'active' });
  }, [queryClient]);

  const scheduleInvalidate = useCallback(() => {
    if (invalidateTimerRef.current) clearTimeout(invalidateTimerRef.current);
    invalidateTimerRef.current = setTimeout(() => {
      invalidateTimerRef.current = null;
      invalidateActiveLists();
    }, 400);
  }, [invalidateActiveLists]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const syncOnline = () => {
      setIsOffline(!isBrowserOnline());
      if (isBrowserOnline()) void syncEngine.flushQueue();
      void refreshCounts();
    };

    setIsOffline(!isBrowserOnline());
    void refreshCounts();

    window.addEventListener('online', syncOnline);
    window.addEventListener('offline', syncOnline);
    window.addEventListener('vb-sync-queue-changed', refreshCounts);
    const onDataChanged = () => {
      void refreshCounts();
      scheduleInvalidate();
    };
    window.addEventListener('vb-offline-data-changed', onDataChanged);
    window.addEventListener('vb-offline-sync-complete', scheduleInvalidate);

    const interval = window.setInterval(refreshCounts, REFRESH_INTERVAL_MS);

    return () => {
      window.removeEventListener('online', syncOnline);
      window.removeEventListener('offline', syncOnline);
      window.removeEventListener('vb-sync-queue-changed', refreshCounts);
      window.removeEventListener('vb-offline-data-changed', onDataChanged);
      window.removeEventListener('vb-offline-sync-complete', scheduleInvalidate);
      window.clearInterval(interval);
      if (invalidateTimerRef.current) clearTimeout(invalidateTimerRef.current);
    };
  }, [refreshCounts, scheduleInvalidate]);

  return {
    isOffline,
    pendingCount,
    offlineStudentCount,
    offlineClassCount,
    offlineTeacherCount,
    refreshCounts,
  };
}

export function OfflineSyncProvider({ children }: { children: ReactNode }) {
  const value = useOfflineSyncInternal();
  return (
    <OfflineSyncContext.Provider value={value}>{children}</OfflineSyncContext.Provider>
  );
}

export function useOfflineSync(): OfflineSyncState {
  const ctx = useContext(OfflineSyncContext);
  if (!ctx) {
    throw new Error('useOfflineSync must be used within OfflineSyncProvider');
  }
  return ctx;
}
