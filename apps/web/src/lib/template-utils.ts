import api from '@/lib/api';
import type { DesignerElement } from '@/lib/designer-utils';

/** Normalize API/DB frontConfig JSON into a designer element array. */
export function normalizeFrontConfig(config: unknown): DesignerElement[] {
  const raw: unknown[] = (() => {
    if (!config) return [];
    if (Array.isArray(config)) return config as unknown[];
    if (typeof config === 'string') {
      try {
        return normalizeFrontConfig(JSON.parse(config));
      } catch {
        return [];
      }
    }
    if (typeof config === 'object' && config !== null) {
      const obj = config as { elements?: unknown };
      if (Array.isArray(obj.elements)) return obj.elements;
    }
    return [];
  })();

  // Keep only objects that look like designer elements.
  return raw
    .filter((el): el is Record<string, unknown> => typeof el === 'object' && el !== null)
    .filter((el): el is DesignerElement => {
      const id = el.id;
      const type = el.type;
      const x = el.x;
      const y = el.y;
      return (
        typeof id === 'string' &&
        typeof type === 'string' &&
        typeof x === 'number' &&
        typeof y === 'number'
      );
    });
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
