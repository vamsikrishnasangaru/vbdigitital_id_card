'use client';

import { useOfflineSync } from '@/hooks/use-offline-sync';
import { WifiOff, CloudUpload, ServerOff } from 'lucide-react';

/**
 * Shown once in the dashboard shell when the app is offline, server is unavailable,
 * or has unsynced local data.
 */
export function OfflineAppBanner() {
  const {
    isOffline,
    serverUnavailable,
    pendingCount,
    offlineStudentCount,
    offlineClassCount,
    offlineTeacherCount,
  } = useOfflineSync();

  const localCount = offlineStudentCount + offlineClassCount + offlineTeacherCount;
  const show = isOffline || serverUnavailable || pendingCount > 0 || localCount > 0;

  if (!show) return null;

  const pendingLabel =
    pendingCount > 0
      ? `${pendingCount} change${pendingCount === 1 ? '' : 's'} queued`
      : null;
  const localLabel =
    localCount > 0
      ? `${localCount} item${localCount === 1 ? '' : 's'} saved locally`
      : null;
  const detailParts = [pendingLabel, localLabel].filter(Boolean).join(' · ');

  if (serverUnavailable && !isOffline) {
    return (
      <div
        className="mb-6 rounded-2xl border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/40 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-sm"
        role="status"
        aria-live="polite"
      >
        <div className="flex items-center gap-2 font-semibold text-orange-900 dark:text-orange-100">
          <ServerOff className="h-4 w-4 shrink-0" />
          Server unavailable — working offline
        </div>
        {detailParts && (
          <p className="text-orange-800/90 dark:text-orange-200/90 font-medium">
            {detailParts}. Will sync automatically when server recovers.
          </p>
        )}
      </div>
    );
  }

  if (isOffline) {
    return (
      <div
        className="mb-6 rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-sm"
        role="status"
        aria-live="polite"
      >
        <div className="flex items-center gap-2 font-semibold text-amber-900 dark:text-amber-100">
          <WifiOff className="h-4 w-4 shrink-0" />
          You are offline
        </div>
        {detailParts && (
          <p className="text-amber-800/90 dark:text-amber-200/90 font-medium">
            {detailParts}. Changes will sync when you reconnect.
          </p>
        )}
      </div>
    );
  }

  return (
    <div
      className="mb-6 rounded-2xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-sm"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2 font-semibold text-blue-900 dark:text-blue-100">
        <CloudUpload className="h-4 w-4 animate-pulse shrink-0" />
        Syncing with server
      </div>
      <p className="text-blue-800/90 dark:text-blue-200/90 font-medium">
        {pendingCount > 0
          ? `${pendingCount} change${pendingCount === 1 ? '' : 's'} uploading…`
          : 'Refreshing data…'}
        {localLabel ? ` · ${localLabel}` : ''}
      </p>
    </div>
  );
}
