import api from '@/lib/api';
import { offlineStore } from '@/lib/offline-store';

export type SchoolPickerOption = { id: string; name: string; code: string };

/** Last cached school list for offline placeholderData. */
export function getCachedSchoolsPicker(): SchoolPickerOption[] | undefined {
  const hit = offlineStore.getSchools();
  if (!hit?.length) return undefined;
  return hit as SchoolPickerOption[];
}

/** Shared fetch for school dropdowns (single React Query cache key). */
export async function fetchSchoolsPicker(): Promise<SchoolPickerOption[]> {
  const { data } = await api.get('/schools', { params: { limit: 100 } });
  const list = data.data as SchoolPickerOption[];
  offlineStore.cacheSchools(list);
  return list;
}
