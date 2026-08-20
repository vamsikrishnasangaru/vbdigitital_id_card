import { getCachedStudentsForSchool } from './offline-students-cache';
import { offlineGetCache } from './offline-get-cache';
import { offlineStore } from './offline-store';
import { cacheStudentsForSchool } from './offline-students-cache';
import api from './api';

export type StudentsListParams = Record<string, string | number | undefined>;

export type StudentsListResponse = {
  data?: unknown[];
  total?: number;
  page?: number;
  limit?: number;
  totalPages?: number;
  _offline?: boolean;
};

const PAGE_SIZE = 200;
const MAX_PAGES = 40; // up to 8000 students per school

function isBaseSchoolList(params: StudentsListParams): boolean {
  return Boolean(
    params.schoolId &&
      !params.search &&
      !params.classId &&
      !params.sectionId &&
      !params.status &&
      !params.completion &&
      !params.templateCode,
  );
}

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

/**
 * Fetch every page for a school (or filtered query) so lists are not capped at 100.
 */
export async function fetchAllStudents(params: StudentsListParams): Promise<StudentsListResponse> {
  const all: unknown[] = [];
  let total = 0;
  let page = 1;
  let totalPages = 1;

  do {
    const { data } = await api.get('/students', {
      params: {
        ...params,
        page,
        limit: PAGE_SIZE,
      },
    });
    const chunk = Array.isArray(data?.data) ? data.data : [];
    total = typeof data?.total === 'number' ? data.total : all.length + chunk.length;
    totalPages =
      typeof data?.totalPages === 'number'
        ? data.totalPages
        : Math.max(1, Math.ceil(total / PAGE_SIZE));
    all.push(...chunk);
    page += 1;
  } while (page <= totalPages && page <= MAX_PAGES && all.length < total);

  const result: StudentsListResponse = {
    data: all,
    total: Math.max(total, all.length),
    page: 1,
    limit: all.length,
    totalPages: 1,
  };

  if (isBaseSchoolList(params) && typeof params.schoolId === 'string') {
    cacheStudentsForSchool(params.schoolId, result);
  }

  return result;
}
