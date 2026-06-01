import api from '@/lib/api';

/** Full template row including frontConfig / backConfig (for designer & preview). */
export async function fetchTemplateWithConfig<T = Record<string, unknown>>(id: string): Promise<T> {
  const { data } = await api.get(`/templates/${id}`);
  return data as T;
}
