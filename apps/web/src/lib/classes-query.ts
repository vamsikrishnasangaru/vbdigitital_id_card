import api from '@/lib/api';
import { offlineClasses } from '@/lib/offline-classes';
import { offlineStore } from '@/lib/offline-store';

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
  const fromOffline =
    offlineClasses.getClassesForSchool(schoolId) ??
    (offlineStore.getClasses(schoolId) as ClassPickerOption[] | null);
  if (!fromOffline?.length) return undefined;
  return fromOffline as ClassPickerOption[];
}

/** Fast endpoint for enrollment / filter dropdowns. */
export async function fetchClassesPicker(schoolId: string): Promise<ClassPickerOption[]> {
  const { data } = await api.get(`/classes/school/${schoolId}/picker`);
  const list = (data || []) as ClassPickerOption[];
  offlineStore.cacheClasses(schoolId, list);
  offlineClasses.cacheClasses(schoolId, list);
  return list;
}
