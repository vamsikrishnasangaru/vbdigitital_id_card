'use client';

import { useOfflineSync } from '@/hooks/use-offline-sync';
import { WifiOff, CloudUpload } from 'lucide-react';

/**
 * Shown once in the dashboard shell when the app is offline or has unsynced local data.
 */
export function OfflineAppBanner() {
  const { isOffline, pendingCount, offlineStudentCount, offlineClassCount, offlineTeacherCount } =
    useOfflineSync();

  const localCount = offlineStudentCount + offlineClassCount + offlineTeacherCount;
  const show = isOffline || pendingCount > 0 || localCount > 0;

  if (!show) return null;

  return (
    <div
      className="mb-6 rounded-2xl border px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-sm"
      role="status"
      aria-live="polite"
    >
      {isOffline ? (
        <>
          <div className="flex items-center gap-2 font-semibold text-amber-900 dark:text-amber-100">
            <WifiOff className="h-4 w-4 shrink-0" />
            You are offline
          </div>
          <p className="text-amber-800/90 dark:text-amber-200/90 font-medium">
            The app keeps working with data saved on this device. Enroll students, manage classes and
            teachers, and preview ID cards. Changes sync automatically when you reconnect.
          </p>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2 font-semibold text-blue-900 dark:text-blue-100">
            <CloudUpload className="h-4 w-4 shrink-0" />
            Syncing with server
          </div>
          <p className="text-blue-800/90 dark:text-blue-200/90 font-medium">
            {pendingCount > 0
              ? `${pendingCount} change${pendingCount === 1 ? '' : 's'} uploading…`
              : 'Refreshing data…'}
            {localCount > 0 ? ` · ${localCount} item${localCount === 1 ? '' : 's'} saved locally` : ''}
          </p>
        </>
      )}
    </div>
  );
}
