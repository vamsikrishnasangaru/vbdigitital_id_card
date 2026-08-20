import { getCachedStudentsForSchool } from './offline-students-cache';
import { offlineGetCache } from './offline-get-cache';
import { offlineStore } from './offline-store';

export type StudentsListParams = Record<string, string | number | undefined>;

export type StudentsListResponse = {
  data?: unknown[];
  total?: number;
  _offline?: boolean;
};

function pickCachedStudents(params: StudentsListParams): StudentsListResponse | undefined {
  const schoolId = typeof params.schoolId === 'string' ? params.schoolId : '';

  if (schoolId) {
    const durable = getCachedStudentsForSchool(schoolId);
    if (durable?.data?.length) {
      const merged = offlineStore.mergeStudentsIntoList(
        durable.data as { id: string }[],
        params,
      );
      return { data: merged, total: durable.total, _offline: true };
    }
  }

  const cached =
    (offlineGetCache.get('/students', params) as StudentsListResponse | null) ?? null;
  if (cached && (Array.isArray(cached.data) || cached.total != null)) return cached;

  if (schoolId) {
    const scoped =
      (offlineGetCache.get('/students', {
        schoolId,
        limit: params.limit ?? 100,
      }) as StudentsListResponse | null) ??
      (offlineGetCache.get('/students', { schoolId }) as StudentsListResponse | null);
    if (scoped && Array.isArray(scoped.data)) return scoped;
  }

  const pending = offlineStore.getPendingStudents(params);
  if (pending.length > 0) {
    return { data: pending, total: pending.length, _offline: true };
  }

  return undefined;
}

/** Instant list for react-query placeholderData while offline or refetching. */
export function getCachedStudentsList(params: StudentsListParams): StudentsListResponse | undefined {
  return pickCachedStudents(params);
}
