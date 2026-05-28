'use client';

import { WifiOff, RefreshCw, CloudUpload } from 'lucide-react';
import { useOfflineSync } from '@/hooks/use-offline-sync';

export function SyncIndicator() {
  const { isOffline, pendingCount, offlineStudentCount, offlineClassCount, offlineTeacherCount } =
    useOfflineSync();

  const localCount = offlineStudentCount + offlineClassCount + offlineTeacherCount;
  const show = isOffline || pendingCount > 0 || localCount > 0;
  if (!show) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-3 bg-white dark:bg-zinc-900 shadow-lg rounded-full px-4 py-2 border border-slate-200 dark:border-zinc-700 text-sm font-medium max-w-[min(100vw-2rem,24rem)]">
      {isOffline ? (
        <>
          <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
          <WifiOff className="w-4 h-4 text-amber-600 shrink-0" />
          <span className="text-amber-700 dark:text-amber-400 truncate">Offline — working locally</span>
        </>
      ) : pendingCount > 0 ? (
        <>
          <RefreshCw className="w-4 h-4 text-blue-500 animate-spin shrink-0" />
          <span className="text-blue-700 dark:text-blue-400 truncate">Syncing {pendingCount}…</span>
        </>
      ) : (
        <>
          <CloudUpload className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="text-emerald-700 dark:text-emerald-400 truncate">All changes synced</span>
        </>
      )}

      {(pendingCount > 0 || localCount > 0) && (
        <span className="ml-1 pl-3 border-l border-slate-200 dark:border-zinc-600 text-slate-500 text-xs shrink-0">
          {pendingCount > 0 && `${pendingCount} queued`}
          {pendingCount > 0 && localCount > 0 && ' · '}
          {localCount > 0 && `${localCount} local`}
        </span>
      )}
    </div>
  );
}
