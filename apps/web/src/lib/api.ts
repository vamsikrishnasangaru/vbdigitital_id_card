import axios, { type InternalAxiosRequestConfig } from 'axios';
import { isBrowserOnline } from './offline-store';
import { offlineGetCache } from './offline-get-cache';
import { resolveOfflineGet } from './api-offline-handlers';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

export type VbAxiosConfig = InternalAxiosRequestConfig & {
  _skipOfflineQueue?: boolean;
  _retry?: boolean;
};

export const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

let offlineMutationToastShown = false;

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

function isMutation(config?: VbAxiosConfig): boolean {
  const method = config?.method?.toLowerCase() || '';
  return ['post', 'put', 'patch', 'delete'].includes(method);
}

function shouldQueueMutation(config?: VbAxiosConfig, networkFailure = false): boolean {
  if (!config || config._skipOfflineQueue) return false;
  if (!isMutation(config)) return false;
  return networkFailure;
}

/** Cache successful GET responses for offline replay. */
api.interceptors.response.use(
  (response) => {
    const config = response.config as VbAxiosConfig;
    if (config._skipOfflineQueue) return response;
    if (config.method?.toLowerCase() === 'get' && response.data !== undefined) {
      offlineGetCache.set(config.url || '', config.params, response.data);
    }
    return response;
  },
  async (error) => {
    const original = error.config as VbAxiosConfig | undefined;

    const networkFailure = !error.response;
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
