'use client';

import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { syncEngine } from '@/lib/sync-engine';
import { offlineStore, isBrowserOnline } from '@/lib/offline-store';

/**
 * Subscribes to offline queue / local data changes and refreshes React Query caches.
 */
export function useOfflineSync() {
  const queryClient = useQueryClient();
  const [isOffline, setIsOffline] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [offlineStudentCount, setOfflineStudentCount] = useState(0);
  const [offlineClassCount, setOfflineClassCount] = useState(0);
  const [offlineTeacherCount, setOfflineTeacherCount] = useState(0);

  const refreshCounts = useCallback(async () => {
    setPendingCount(await syncEngine.getQueueLength());
    setOfflineStudentCount(offlineStore.getPendingStudentCount());
    setOfflineClassCount(offlineStore.getPendingClassStructureCount());
    setOfflineTeacherCount(offlineStore.getPendingTeacherCount());
  }, []);

  const invalidateAll = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['students'] });
    void queryClient.invalidateQueries({ queryKey: ['templates'] });
    void queryClient.invalidateQueries({ queryKey: ['classes'] });
    void queryClient.invalidateQueries({ queryKey: ['assignments'] });
    void queryClient.invalidateQueries({ queryKey: ['teachers-minimal'] });
    void queryClient.invalidateQueries({ queryKey: ['students-batch'] });
  }, [queryClient]);

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
      invalidateAll();
    };
    window.addEventListener('vb-offline-data-changed', onDataChanged);
    window.addEventListener('vb-offline-sync-complete', invalidateAll);

    const interval = window.setInterval(refreshCounts, 8000);

    return () => {
      window.removeEventListener('online', syncOnline);
      window.removeEventListener('offline', syncOnline);
      window.removeEventListener('vb-sync-queue-changed', refreshCounts);
      window.removeEventListener('vb-offline-data-changed', onDataChanged);
      window.removeEventListener('vb-offline-sync-complete', invalidateAll);
      window.clearInterval(interval);
    };
  }, [refreshCounts, invalidateAll]);

  return {
    isOffline,
    pendingCount,
    offlineStudentCount,
    offlineClassCount,
    offlineTeacherCount,
    refreshCounts,
  };
}
