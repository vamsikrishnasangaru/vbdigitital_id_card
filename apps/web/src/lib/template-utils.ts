import api from '@/lib/api';

/** Normalize API/DB frontConfig JSON into a designer element array. */
export function normalizeFrontConfig(config: unknown): Record<string, unknown>[] {
  if (!config) return [];
  if (Array.isArray(config)) return config as Record<string, unknown>[];
  if (typeof config === 'string') {
    try {
      return normalizeFrontConfig(JSON.parse(config));
    } catch {
      return [];
    }
  }
  if (typeof config === 'object' && config !== null) {
    const obj = config as Record<string, unknown>;
    if (Array.isArray(obj.elements)) return obj.elements as Record<string, unknown>[];
  }
  return [];
}

export async function uploadTemplateBackground(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await api.post<{ url: string }>('/uploads?dir=templates', formData);
  return data.url;
}

export async function uploadDesignerAsset(file: File, schoolId: string, kind: string): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await api.post<{ url: string }>(
    `/uploads?dir=templates/assets/${schoolId}/${kind}`,
    formData,
  );
  return data.url;
}
