'use client';

import { useMemo } from 'react';
import { offlineStore } from '@/lib/offline-store';

export function useMergedStudents<T extends { id: string }>(
  serverList: T[] | undefined,
  filters: {
    schoolId?: string;
    classId?: string;
    sectionId?: string;
    status?: string;
    search?: string;
  },
  refreshKey = 0,
): T[] {
  return useMemo(
    () => offlineStore.mergeStudentsIntoList(serverList || [], filters),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refreshKey bumps on offline events
    [serverList, filters.schoolId, filters.classId, filters.sectionId, filters.status, filters.search, refreshKey],
  );
}
