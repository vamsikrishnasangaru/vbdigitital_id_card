'use client';

import { useMemo } from 'react';
import { offlineTeachers, type OfflineTeacherRecord } from '@/lib/offline-teachers';

export function useMergedTeachers(
  serverList:
    | Array<
        | OfflineTeacherRecord
        | (Omit<OfflineTeacherRecord, '_offline' | '_pendingSync'> & { _offline?: boolean })
      >
    | undefined,
  schoolId: string,
  filters: {
    search?: string;
    isActive?: string;
  },
  refreshKey = 0,
): OfflineTeacherRecord[] {
  return useMemo(
    () => offlineTeachers.mergeTeachersIntoList(serverList || [], schoolId, filters),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refreshKey bumps on offline events
    [serverList, schoolId, filters.search, filters.isActive, refreshKey],
  );
}
