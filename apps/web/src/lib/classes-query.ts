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

function compareBySortOrderThenName(
  a: { sortOrder?: number; name: string },
  b: { sortOrder?: number; name: string },
): number {
  const orderA = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
  const orderB = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
  if (orderA !== orderB) return orderA - orderB;
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
}

/** Sort classes and nested sections by sortOrder (then name). */
export function sortClassesPicker(classes: ClassPickerOption[]): ClassPickerOption[] {
  return [...classes]
    .sort(compareBySortOrderThenName)
    .map((c) => ({
      ...c,
      sections: c.sections
        ? [...c.sections].sort(compareBySortOrderThenName)
        : c.sections,
    }));
}

/** Read cached classes from localStorage (instant dropdown paint). */
export function getCachedClassesForSchool(schoolId: string): ClassPickerOption[] | undefined {
  const fromPicker = offlineClasses.getClassesPicker(schoolId);
  if (fromPicker?.length) return sortClassesPicker(fromPicker);
  const fromFull = offlineClasses.getClassesForSchool(schoolId);
  if (!fromFull?.length) return undefined;
  return sortClassesPicker(
    fromFull.map((c) => ({
      id: c.id,
      name: c.name,
      sortOrder: c.sortOrder,
      sections: c.sections.map((s) => ({
        id: s.id,
        name: s.name,
        sortOrder: (s as { sortOrder?: number }).sortOrder,
      })),
    })),
  );
}

/** Fast endpoint for enrollment / filter dropdowns. */
export async function fetchClassesPicker(schoolId: string): Promise<ClassPickerOption[]> {
  const { data } = await api.get(`/classes/school/${schoolId}/picker`);
  const list = sortClassesPicker((data || []) as ClassPickerOption[]);
  offlineClasses.cacheClassesPicker(schoolId, list);
  return list;
}
