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
  const out: DesignerElement[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const el = item as Record<string, unknown>;
    if (
      typeof el.id === 'string' &&
      typeof el.type === 'string' &&
      typeof el.x === 'number' &&
      typeof el.y === 'number'
    ) {
      out.push(el as unknown as DesignerElement);
    }
  }
  return out;
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
