import { get, set } from 'idb-keyval';
import api from './api';
import { offlineStore } from './offline-store';
import { toast } from 'sonner';

export interface SyncOperation {
  id: string;
  url: string;
  method: string;
  data?: unknown;
  headers?: Record<string, string>;
  timestamp: number;
}

export const SYNC_QUEUE_KEY = 'sync_queue';

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

export const syncEngine = {
  async getQueueLength(): Promise<number> {
    const queue: SyncOperation[] = (await get(SYNC_QUEUE_KEY)) || [];
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
    const queue: SyncOperation[] = (await get(SYNC_QUEUE_KEY)) || [];

    const op: SyncOperation = {
      id: crypto.randomUUID(),
      url: config.url || '',
      method: config.method || 'post',
      data: await serializeData(config.data),
      headers: { ...config.headers },
      timestamp: Date.now(),
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

    queue.push(op);
    await set(SYNC_QUEUE_KEY, queue);

    window.dispatchEvent(
      new CustomEvent('vb-sync-queue-changed', { detail: { length: queue.length } }),
    );

    return op.id;
  },

  /**
   * Flush all operations in the queue.
   */
  async flushQueue() {
    const queue: SyncOperation[] = (await get(SYNC_QUEUE_KEY)) || [];
    if (queue.length === 0) return;

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
        if (!axiosErr.response) {
          failedQueue.push(op);
        } else {
          console.error('Failed to sync operation:', op, axiosErr.response);
        }
      }
    }

    await set(SYNC_QUEUE_KEY, failedQueue);

    window.dispatchEvent(
      new CustomEvent('vb-sync-queue-changed', { detail: { length: failedQueue.length } }),
    );

    if (successCount > 0) {
      window.dispatchEvent(new CustomEvent('vb-offline-sync-complete'));
    }

    if (failedQueue.length === 0 && successCount > 0) {
      toast.success('All offline changes synced to the server.');
    } else if (failedQueue.length > 0 && successCount > 0) {
      toast.warning(
        `Synced ${successCount} change${successCount === 1 ? '' : 's'}. ${failedQueue.length} still pending.`,
      );
    } else if (failedQueue.length > 0 && successCount === 0) {
      toast.error(`Could not sync ${failedQueue.length} change${failedQueue.length === 1 ? '' : 's'}. Will retry.`);
    }
  },

  init() {
    if (typeof window === 'undefined') return;

    window.addEventListener('online', () => {
      void this.flushQueue();
    });

    if (navigator.onLine) {
      void this.flushQueue();
    }
  },
};
