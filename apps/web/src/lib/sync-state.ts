export type SyncStatus = 'ONLINE' | 'OFFLINE' | 'SYNCING' | 'SYNC_ERROR';

const SYNC_STATUS_EVENT = 'vb-sync-status-changed';

type SyncStatusDetail = {
  status: SyncStatus;
  updatedAt: number;
  reason?: string;
};

let currentStatus: SyncStatus = 'ONLINE';

function emit(status: SyncStatus, reason?: string) {
  currentStatus = status;
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<SyncStatusDetail>(SYNC_STATUS_EVENT, {
      detail: { status, updatedAt: Date.now(), reason },
    }),
  );
}

export function getSyncStatus(): SyncStatus {
  return currentStatus;
}

export function setSyncStatus(status: SyncStatus, reason?: string): void {
  if (currentStatus === status && !reason) return;
  emit(status, reason);
}

export function syncStatusEventName(): string {
  return SYNC_STATUS_EVENT;
}

