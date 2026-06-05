'use client';

import { useMemo } from 'react';
import type { ClassPickerOption } from '@/lib/classes-query';
import { offlineStore } from '@/lib/offline-store';
import { sortStudentsByClassSection, type StudentClassSectionSortable } from '@/lib/sort-students';

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
  classes?: ClassPickerOption[],
): T[] {
  return useMemo(() => {
    const merged = offlineStore.mergeStudentsIntoList(serverList || [], filters);
    return sortStudentsByClassSection(
      merged as Array<T & StudentClassSectionSortable>,
      classes,
    ) as T[];
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refreshKey bumps on offline events
  }, [
    serverList,
    filters.schoolId,
    filters.classId,
    filters.sectionId,
    filters.status,
    filters.search,
    refreshKey,
    classes,
  ]);
}
