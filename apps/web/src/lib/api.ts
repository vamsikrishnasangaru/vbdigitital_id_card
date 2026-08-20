import axios, { type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios';
import { isEffectivelyOffline } from './offline-store';
import { offlineGetCache } from './offline-get-cache';
import { resolveOfflineGet } from './api-offline-handlers';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

declare module 'axios' {
  interface AxiosRequestConfig {
    /** Bypass offline GET cache replay and mutation queueing for this request. */
    _skipOfflineQueue?: boolean;
    _retry?: boolean;
  }
}

export type VbAxiosConfig = InternalAxiosRequestConfig & {
  _skipOfflineQueue?: boolean;
  _retry?: boolean;
};

export type VbRequestConfig<D = unknown> = AxiosRequestConfig<D>;

export const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
  /** Dead Wi‑Fi / hung Chrome-offline sockets must fail fast into local data. */
  timeout: 4_000,
});

let offlineMutationToastShown = false;
let serverUnavailableEmitted = false;

function emitServerStatus(unavailable: boolean) {
  if (typeof window === 'undefined') return;
  if (unavailable && !serverUnavailableEmitted) {
    serverUnavailableEmitted = true;
    window.dispatchEvent(new CustomEvent('vb-server-unavailable', { detail: true }));
  } else if (!unavailable && serverUnavailableEmitted) {
    serverUnavailableEmitted = false;
    window.dispatchEvent(new CustomEvent('vb-server-unavailable', { detail: false }));
  }
}

type RefreshResult = { accessToken: string; refreshToken: string };
let refreshInFlight: Promise<RefreshResult> | null = null;

async function refreshAccessToken(): Promise<RefreshResult> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) throw new Error('No refresh token');

    const { data } = await axios.post<RefreshResult>(`${API_BASE}/auth/refresh`, { refreshToken });
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    return data;
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    offlineMutationToastShown = false;
  });
}

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('accessToken');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  if (config.data instanceof FormData) {
    if (config.headers) {
      delete config.headers['Content-Type'];
      delete config.headers['content-type'];
    }
  }
  return config;
});

const networkAdapter = axios.getAdapter(['xhr', 'http']);

api.defaults.adapter = async (config) => {
  const cfg = config as VbAxiosConfig;
  const skip = cfg._skipOfflineQueue;
  if (typeof window !== 'undefined' && !skip && isEffectivelyOffline()) {
    emitServerStatus(true);
    const method = (cfg.method || 'get').toLowerCase();
    const url = (cfg.url || '').toLowerCase();

    if (url.includes('/auth/')) {
      return Promise.reject({
        message: 'Network Error',
        code: 'ERR_NETWORK',
        config: cfg,
      });
    }

    if (method === 'get') {
      const resolved = await resolveOfflineGet(cfg);
      return {
        data: resolved?.data ?? {},
        status: 200,
        statusText: 'OK',
        headers: {},
        config: cfg,
      };
    }

    if (shouldQueueMutation(cfg, true)) {
      const { syncEngine } = await import('./sync-engine');
      const { offlineStore } = await import('./offline-store');
      const syncOpId = await syncEngine.addToQueue(cfg);
      const mockData = await offlineStore.buildOfflineMutationResponse(cfg, syncOpId);
      if (!offlineMutationToastShown) {
        const { toast } = await import('sonner');
        toast.warning('Offline: saved on this device. Changes will sync when you are back online.');
        offlineMutationToastShown = true;
      }
      return {
        data: mockData,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: cfg,
      };
    }

    return Promise.reject({
      message: 'Network Error',
      code: 'ERR_NETWORK',
      config: cfg,
    });
  }

  return networkAdapter(cfg);
};

function isMutation(config?: VbAxiosConfig): boolean {
  const method = config?.method?.toLowerCase() || '';
  return ['post', 'put', 'patch', 'delete'].includes(method);
}

function shouldQueueMutation(config?: VbAxiosConfig, networkFailure = false): boolean {
  if (!config || config._skipOfflineQueue) return false;
  if (!isMutation(config)) return false;
  const url = (config.url || '').toLowerCase();
  /** Auth must never be faked offline — login/refresh need a real server. */
  if (url.includes('/auth/')) return false;
  return networkFailure;
}

function isOfflineLikeFailure(error: unknown): boolean {
  const ax = error as {
    code?: string;
    message?: string;
    name?: string;
    response?: { status?: number };
  };

  /** Aborted requests must not queue fake offline mutations. */
  if (
    ax.code === 'ERR_CANCELED' ||
    ax.name === 'CanceledError' ||
    ax.message === 'canceled' ||
    ax.message === 'Request aborted'
  ) {
    return false;
  }

  if (isEffectivelyOffline()) return true;

  const status = ax.response?.status;
  if (status === 502 || status === 503 || status === 504) return true;
  if (ax.code === 'ECONNABORTED' || ax.code === 'ERR_NETWORK') return true;
  if (!status) return true;
  return false;
}

/** Cache successful GET responses for offline replay. */
api.interceptors.response.use(
  (response) => {
    const config = response.config as VbAxiosConfig;
    if (config._skipOfflineQueue) return response;
    emitServerStatus(false);
    if (config.method?.toLowerCase() === 'get' && response.data !== undefined) {
      offlineGetCache.set(config.url || '', config.params, response.data);

      // Durable per-school student lists (survives generic GET cache eviction).
      const path = (config.url || '').split('?')[0] || '';
      const isStudentsList =
        path === '/students' ||
        path.endsWith('/students') ||
        /\/api\/v\d+\/students\/?$/.test(path);
      const schoolId = (config.params as { schoolId?: string } | undefined)?.schoolId;
      if (isStudentsList && schoolId) {
        void import('./offline-students-cache').then(({ cacheStudentsForSchool }) => {
          cacheStudentsForSchool(schoolId, response.data);
        });
      }

      // Keep templates by school for Super Admin offline switching.
      const normalizedPath = path.replace(/^\/api\/v\d+/, '');
      const isTemplatesList =
        (normalizedPath === '/templates' || normalizedPath.endsWith('/templates')) &&
        !/\/templates\/[^/]+$/.test(normalizedPath);
      if (isTemplatesList && schoolId && response.data) {
        void import('./offline-store').then(({ offlineStore }) => {
          const list = Array.isArray(response.data)
            ? response.data
            : Array.isArray(response.data?.data)
              ? response.data.data
              : null;
          if (list) offlineStore.cacheTemplates(schoolId, list);
        });
      }

      const templateDetail = normalizedPath.match(/^\/templates\/([^/]+)$/);
      if (templateDetail && response.data && typeof response.data === 'object') {
        void import('./offline-template-details').then(({ cacheTemplateDetail }) => {
          cacheTemplateDetail(response.data as Record<string, unknown> & { id: string });
        });
      }
    }
    return response;
  },
  async (error) => {
    const original = error.config as VbAxiosConfig | undefined;

    const networkFailure = isOfflineLikeFailure(error);
    if (networkFailure) emitServerStatus(true);
    const offlineMutation = shouldQueueMutation(original, networkFailure);
    const offlineGet =
      networkFailure &&
      original &&
      !original._skipOfflineQueue &&
      original.method?.toLowerCase() === 'get';

    if (offlineGet && original) {
      const resolved = await resolveOfflineGet(original);
      if (resolved) {
        return Promise.resolve({
          ...resolved,
          statusText: 'OK',
          headers: {},
        });
      }
    }

    if (offlineMutation && original) {
      const { syncEngine } = await import('./sync-engine');
      const { offlineStore } = await import('./offline-store');

      const syncOpId = await syncEngine.addToQueue(original);
      const mockData = await offlineStore.buildOfflineMutationResponse(original, syncOpId);

      if (!offlineMutationToastShown) {
        const { toast } = await import('sonner');
        toast.warning('Offline: saved on this device. Changes will sync when you are back online.');
        offlineMutationToastShown = true;
      }

      return Promise.resolve({
        data: mockData,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: original,
      });
    }

    if (error.response?.status === 401 && original && !original._retry) {
      original._retry = true;
      try {
        const data = await refreshAccessToken();
        original.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(original);
      } catch {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        if (window.location.pathname !== '/') {
          window.location.href = '/';
        }
        return Promise.reject(error);
      }
    }
    return Promise.reject(error);
  },
);

export default api;
