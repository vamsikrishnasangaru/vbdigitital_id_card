import api from '@/lib/api';
import { offlineClasses } from '@/lib/offline-classes';

export type ClassPickerOption = {
  id: string;
  name: string;
  sortOrder?: number;
  sections?: { id: string; name: string; sortOrder?: number }[];
};

const CLASSES_STALE_MS = 1000 * 60 * 10;

export function classesQueryKey(schoolId: string) {
  return ['classes', schoolId] as const;
}

export function classesQueryStaleTime() {
  return CLASSES_STALE_MS;
}

/** Read cached classes from localStorage (instant dropdown paint). */
export function getCachedClassesForSchool(schoolId: string): ClassPickerOption[] | undefined {
  const fromPicker = offlineClasses.getClassesPicker(schoolId);
  if (fromPicker?.length) return fromPicker;
  const fromFull = offlineClasses.getClassesForSchool(schoolId);
  if (!fromFull?.length) return undefined;
  return fromFull.map((c) => ({
    id: c.id,
    name: c.name,
    sortOrder: c.sortOrder,
    sections: c.sections.map((s) => ({ id: s.id, name: s.name })),
  }));
}

/** Fast endpoint for enrollment / filter dropdowns. */
export async function fetchClassesPicker(schoolId: string): Promise<ClassPickerOption[]> {
  const { data } = await api.get(`/classes/school/${schoolId}/picker`);
  const list = (data || []) as ClassPickerOption[];
  offlineClasses.cacheClassesPicker(schoolId, list);
  return list;
}
