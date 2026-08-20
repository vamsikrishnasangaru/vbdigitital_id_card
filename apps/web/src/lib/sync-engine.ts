import api from './api';
import { offlineStore } from './offline-store';
import { toast } from 'sonner';
import { setSyncStatus } from './sync-state';
import { getSyncQueueFromIndexedDb, setSyncQueueInIndexedDb } from './offline-indexeddb';

export interface SyncOperation {
  id: string;
  url: string;
  method: string;
  data?: unknown;
  headers?: Record<string, string>;
  timestamp: number;
  entityType?: string;
  entityId?: string;
  operationType?: 'CREATE' | 'UPDATE' | 'DELETE' | 'UPLOAD';
  conflictKey?: string;
  retryCount?: number;
  status?: 'pending' | 'syncing' | 'failed';
  lastError?: string;
  updatedAt?: number;
}

export const SYNC_QUEUE_KEY = 'sync_queue';
const DEDUPE_WINDOW_MS = 2000;
let flushInFlight: Promise<void> | null = null;

/**
 * Serializes data for IndexedDB.
 * Converts FormData to an object and Blobs/Files to ArrayBuffers.
 */
async function serializeData(data: unknown) {
  if (!data) return undefined;

  if (typeof data === 'string') {
    try {
      return JSON.parse(data);
    } catch {
      return data;
    }
  }

  if (data instanceof FormData) {
    const obj: { _isFormData: boolean; fields: Record<string, unknown> } = {
      _isFormData: true,
      fields: {},
    };
    for (const [key, value] of data.entries()) {
      if (value instanceof Blob) {
        obj.fields[key] = {
          _isBlob: true,
          type: value.type,
          name: (value as File).name,
          data: await value.arrayBuffer(),
        };
      } else {
        obj.fields[key] = value;
      }
    }
    return obj;
  }

  return data;
}

/**
 * Reconstructs data for Axios request.
 */
function deserializeData(data: unknown) {
  if (!data) return undefined;

  if (
    typeof data === 'object' &&
    data !== null &&
    '_isFormData' in data &&
    (data as { _isFormData: boolean })._isFormData
  ) {
    const fields = (data as unknown as { fields: Record<string, unknown> }).fields;
    const formData = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      const val = value as {
        _isBlob?: boolean;
        data?: ArrayBuffer;
        type?: string;
        name?: string;
      };
      if (val && val._isBlob && val.data) {
        const blob = new Blob([val.data], { type: val.type });
        formData.append(key, blob, val.name);
      } else {
        formData.append(key, value as string | Blob);
      }
    }
    return formData;
  }

  return data;
}

function freshAuthHeaders(headers?: Record<string, string>): Record<string, string> {
  const next = { ...headers };
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('accessToken');
    if (token) next.Authorization = `Bearer ${token}`;
  }
  delete next['Content-Type'];
  delete next['content-type'];
  return next;
}

function shouldKeepForRetry(error: unknown): boolean {
  const status = (error as { response?: { status?: number } })?.response?.status;
  // Retry transient/server outages later; only drop definitive client-side failures.
  if (!status) return true;
  // 401/403 mean the session expired, not that the data is invalid — keep so the
  // work survives an auto-logout and syncs after the user signs in again.
  if (status === 401 || status === 403) return true;
  return status >= 500 || status === 429 || status === 408;
}

function hasAccessToken(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(localStorage.getItem('accessToken'));
}

function normalizeQueue(queue: SyncOperation[]): SyncOperation[] {
  const now = Date.now();
  return queue.map((op) => ({
    ...op,
    ...deriveOperationMetadata(op.url, op.method, op.data),
    retryCount: op.retryCount ?? 0,
    status: op.status ?? 'pending',
    updatedAt: op.updatedAt ?? op.timestamp ?? now,
  }));
}

function operationFingerprint(op: Pick<SyncOperation, 'url' | 'method' | 'data'>): string {
  let data = '';
  try {
    data = JSON.stringify(op.data ?? null);
  } catch {
    data = '[unserializable]';
  }
  return `${op.method.toUpperCase()}::${op.url}::${data}`;
}

function extractEntityInfo(url: string): { entityType?: string; entityId?: string } {
  const path = (url || '').split('?')[0] || '';
  const cleaned = path.replace(/^\/+/, '');
  const parts = cleaned.split('/').filter(Boolean);
  if (parts.length === 0) return {};
  let i = 0;
  if (parts[0] === 'api' && /^v\d+$/i.test(parts[1] || '')) i = 2;
  const entityType = parts[i];
  if (!entityType) return {};
  const maybeId = parts[i + 1];
  if (!maybeId || ['search', 'bulk', 'generate', 'picker'].includes(maybeId)) {
    return { entityType };
  }
  return { entityType, entityId: maybeId };
}

function deriveOperationType(method: string, data: unknown): SyncOperation['operationType'] {
  const m = (method || 'post').toLowerCase();
  if (m === 'delete') return 'DELETE';
  if (m === 'post') {
    if (data && typeof data === 'object' && '_isFormData' in (data as Record<string, unknown>)) {
      return 'UPLOAD';
    }
    return 'CREATE';
  }
  return 'UPDATE';
}

function deriveOperationMetadata(url: string, method: string, data: unknown): Partial<SyncOperation> {
  const { entityType, entityId } = extractEntityInfo(url);
  const operationType = deriveOperationType(method, data);
  const conflictKey = entityType && entityId ? `${entityType}:${entityId}` : undefined;
  return { entityType, entityId, operationType, conflictKey };
}

function mergePayload(baseData: unknown, nextData: unknown): unknown {
  const baseObj = typeof baseData === 'object' && baseData !== null ? baseData : null;
  const nextObj = typeof nextData === 'object' && nextData !== null ? nextData : null;
  if (!baseObj || !nextObj) return nextData ?? baseData;
  if (
    '_isFormData' in (baseObj as Record<string, unknown>) ||
    '_isFormData' in (nextObj as Record<string, unknown>)
  ) {
    return nextData;
  }
  return { ...(baseObj as Record<string, unknown>), ...(nextObj as Record<string, unknown>) };
}

/**
 * Coalesces queue entries by entity conflict key to avoid duplicate work:
 * - CREATE + UPDATE => CREATE with merged payload
 * - CREATE + DELETE => drop both (no net effect)
 * - UPDATE + UPDATE => single UPDATE with merged payload
 * - UPDATE + DELETE => DELETE
 */
function compactQueue(queue: SyncOperation[]): SyncOperation[] {
  const compacted: SyncOperation[] = [];
  const indexByConflictKey = new Map<string, number>();

  for (const op of queue) {
    const enriched: SyncOperation = {
      ...op,
      ...deriveOperationMetadata(op.url, op.method, op.data),
      updatedAt: op.updatedAt ?? op.timestamp ?? Date.now(),
      retryCount: op.retryCount ?? 0,
      status: op.status ?? 'pending',
    };

    if (!enriched.conflictKey) {
      compacted.push(enriched);
      continue;
    }

    const idx = indexByConflictKey.get(enriched.conflictKey);
    if (idx == null) {
      indexByConflictKey.set(enriched.conflictKey, compacted.length);
      compacted.push(enriched);
      continue;
    }

    const prev = compacted[idx];
    const prevType = prev.operationType;
    const nextType = enriched.operationType;

    if (prevType === 'CREATE' && nextType === 'UPDATE') {
      compacted[idx] = {
        ...prev,
        data: mergePayload(prev.data, enriched.data),
        updatedAt: enriched.updatedAt,
      };
      continue;
    }

    if (prevType === 'CREATE' && nextType === 'DELETE') {
      compacted.splice(idx, 1);
      indexByConflictKey.delete(enriched.conflictKey);
      for (let j = idx; j < compacted.length; j++) {
        const key = compacted[j].conflictKey;
        if (key) indexByConflictKey.set(key, j);
      }
      continue;
    }

    if (prevType === 'UPDATE' && nextType === 'UPDATE') {
      compacted[idx] = {
        ...prev,
        data: mergePayload(prev.data, enriched.data),
        updatedAt: enriched.updatedAt,
      };
      continue;
    }

    if (prevType === 'UPDATE' && nextType === 'DELETE') {
      compacted[idx] = {
        ...enriched,
        retryCount: Math.max(prev.retryCount ?? 0, enriched.retryCount ?? 0),
      };
      continue;
    }

    compacted[idx] = enriched;
  }

  return compacted;
}

export const syncEngine = {
  async getQueueLength(): Promise<number> {
    const queue: SyncOperation[] = normalizeQueue(await getSyncQueueFromIndexedDb<SyncOperation>());
    return queue.length;
  },

  /**
   * Add a failed mutation to the sync queue. Returns operation id for offline entity linking.
   */
  async addToQueue(config: {
    url?: string;
    method?: string;
    data?: unknown;
    headers?: Record<string, string>;
  }): Promise<string> {
    const queue: SyncOperation[] = normalizeQueue(await getSyncQueueFromIndexedDb<SyncOperation>());

    const url = (config.url || '').split('?')[0];
    if (url.toLowerCase().includes('/auth/')) {
      return `auth-skip-${Date.now()}`;
    }

    const op: SyncOperation = {
      id: crypto.randomUUID(),
      url: config.url || '',
      method: config.method || 'post',
      data: await serializeData(config.data),
      headers: { ...config.headers },
      timestamp: Date.now(),
      updatedAt: Date.now(),
      retryCount: 0,
      status: 'pending',
    };

    if (
      op.data &&
      typeof op.data === 'object' &&
      '_isFormData' in op.data &&
      (op.data as { _isFormData: boolean })._isFormData &&
      op.headers
    ) {
      delete op.headers['Content-Type'];
      delete op.headers['content-type'];
    }

    const fingerprint = operationFingerprint(op);
    const duplicate = queue.find(
      (q) =>
        operationFingerprint(q) === fingerprint &&
        Math.abs((q.updatedAt ?? q.timestamp) - (op.updatedAt ?? op.timestamp)) <= DEDUPE_WINDOW_MS,
    );
    if (!duplicate) queue.push(op);
    const compactedQueue = compactQueue(queue);
    await setSyncQueueInIndexedDb(compactedQueue);

    window.dispatchEvent(
      new CustomEvent('vb-sync-queue-changed', { detail: { length: compactedQueue.length } }),
    );

    return op.id;
  },

  /**
   * Flush all operations in the queue.
   */
  async flushQueue() {
    if (flushInFlight) return flushInFlight;
    flushInFlight = (async () => {
      setSyncStatus('SYNCING');
    let queue: SyncOperation[] = compactQueue(
      normalizeQueue(await getSyncQueueFromIndexedDb<SyncOperation>()),
    );
    const withoutAuth = queue.filter((op) => !op.url.toLowerCase().includes('/auth/'));
    if (withoutAuth.length !== queue.length) {
      await setSyncQueueInIndexedDb(withoutAuth);
      window.dispatchEvent(
        new CustomEvent('vb-sync-queue-changed', { detail: { length: withoutAuth.length } }),
      );
      queue = compactQueue(withoutAuth);
    }
    if (queue.length === 0) {
      setSyncStatus('ONLINE');
      return;
    }

    // Without a token every request 401s and the interceptor bounces to the login
    // page — leave the queue untouched until the user signs in again.
    if (!hasAccessToken()) {
      setSyncStatus('SYNC_ERROR', 'missing-token');
      return;
    }

    toast.info(`Syncing ${queue.length} pending change${queue.length === 1 ? '' : 's'}…`);

    const failedQueue: SyncOperation[] = [];
    let successCount = 0;

    for (const op of queue) {
      try {
        const { data } = await api.request({
          url: op.url,
          method: op.method,
          data: deserializeData(op.data),
          headers: freshAuthHeaders(op.headers),
          _skipOfflineQueue: true,
        } as Parameters<typeof api.request>[0] & { _skipOfflineQueue?: boolean });
        offlineStore.onSyncSuccess(op, data);
        successCount += 1;
      } catch (error: unknown) {
        const axiosErr = error as { response?: unknown };
        if (shouldKeepForRetry(error)) {
          failedQueue.push({
            ...op,
            retryCount: (op.retryCount ?? 0) + 1,
            status: 'failed',
            lastError: String((error as { message?: string })?.message || 'sync-failed'),
            updatedAt: Date.now(),
          });
        } else {
          console.error('Failed to sync operation:', op, axiosErr.response);
        }
      }
    }

    const compactedFailed = compactQueue(failedQueue);
    await setSyncQueueInIndexedDb(compactedFailed);

    window.dispatchEvent(
      new CustomEvent('vb-sync-queue-changed', { detail: { length: compactedFailed.length } }),
    );

    if (successCount > 0) {
      window.dispatchEvent(new CustomEvent('vb-offline-sync-complete'));
    }

    if (compactedFailed.length === 0 && successCount > 0) {
      toast.success('All offline changes synced to the server.');
      setSyncStatus('ONLINE');
    } else if (compactedFailed.length > 0 && successCount > 0) {
      toast.warning(
        `Synced ${successCount} change${successCount === 1 ? '' : 's'}. ${compactedFailed.length} still pending.`,
      );
      setSyncStatus('SYNC_ERROR', 'partial-failure');
    } else if (compactedFailed.length > 0 && successCount === 0) {
      toast.error(`Could not sync ${compactedFailed.length} change${compactedFailed.length === 1 ? '' : 's'}. Will retry.`);
      setSyncStatus('SYNC_ERROR', 'all-failed');
    } else {
      setSyncStatus('ONLINE');
    }
    })()
      .finally(() => {
        flushInFlight = null;
      });
    return flushInFlight;
  },

  /** After offline create syncs, rewrite queued PUT/DELETE URLs that still use the temp id. */
  async remapStudentIdInQueue(tempId: string, serverId: string) {
    if (!tempId || !serverId || tempId === serverId) return;
    const queue = normalizeQueue(await getSyncQueueFromIndexedDb<SyncOperation>());
    let changed = false;
    const next = queue.map((op) => {
      if (!op.url.includes(`/students/${tempId}`)) return op;
      changed = true;
      return {
        ...op,
        url: op.url.replace(`/students/${tempId}`, `/students/${serverId}`),
        updatedAt: Date.now(),
      };
    });
    if (!changed) return;
    const compacted = compactQueue(next);
    await setSyncQueueInIndexedDb(compacted);
    window.dispatchEvent(
      new CustomEvent('vb-sync-queue-changed', { detail: { length: compacted.length } }),
    );
  },

  init() {
    if (typeof window === 'undefined') return;

    window.addEventListener('online', () => {
      void this.flushQueue();
      setSyncStatus('ONLINE');
    });

    if (navigator.onLine) {
      void this.flushQueue();
      setSyncStatus('ONLINE');
    } else {
      setSyncStatus('OFFLINE');
    }
  },
};
