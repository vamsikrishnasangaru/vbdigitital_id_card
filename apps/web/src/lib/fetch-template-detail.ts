import api from '@/lib/api';
import {
  cacheTemplateDetail,
  getCachedTemplateDetail,
  getCachedTemplateDetailAsync,
} from '@/lib/offline-template-details';
import { isEffectivelyOffline } from '@/lib/offline-store';

/** Full template row including frontConfig / backConfig (for designer & preview). */
export async function fetchTemplateWithConfig<T = Record<string, unknown>>(id: string): Promise<T> {
  if (!id) throw new Error('Template id required');

  // Offline-first: durable detail cache avoids empty frontConfig from list-only warm.
  if (isEffectivelyOffline()) {
    const cached =
      getCachedTemplateDetail(id) || (await getCachedTemplateDetailAsync(id));
    if (cached) return cached as T;
  }

  try {
    const { data } = await api.get(`/templates/${id}`);
    if (data && typeof data === 'object' && (data as { id?: string }).id) {
      cacheTemplateDetail(data as Record<string, unknown> & { id: string });
    }
    return data as T;
  } catch (error) {
    const cached =
      getCachedTemplateDetail(id) || (await getCachedTemplateDetailAsync(id));
    if (cached) return cached as T;
    throw error;
  }
}
