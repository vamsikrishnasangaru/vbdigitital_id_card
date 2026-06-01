import api from '@/lib/api';
import { offlineStore } from '@/lib/offline-store';

export type SchoolPickerOption = { id: string; name: string; code: string };

/** Shared fetch for school dropdowns (single React Query cache key). */
export async function fetchSchoolsPicker(): Promise<SchoolPickerOption[]> {
  const { data } = await api.get('/schools', { params: { limit: 100 } });
  const list = data.data as SchoolPickerOption[];
  offlineStore.cacheSchools(list);
  return list;
}
