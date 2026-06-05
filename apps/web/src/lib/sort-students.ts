import type { ClassPickerOption } from '@/lib/classes-query';

export type StudentClassSectionSortable = {
  classId?: string;
  sectionId?: string;
  class?: { id?: string; name?: string; sortOrder?: number };
  section?: { id?: string; name?: string; sortOrder?: number };
  rollNumber?: string | null;
  firstName?: string;
  lastName?: string;
};

function compareRollNumber(a: string | null | undefined, b: string | null | undefined): number {
  const ra = (a ?? '').trim();
  const rb = (b ?? '').trim();
  if (!ra && !rb) return 0;
  if (!ra) return 1;
  if (!rb) return -1;
  return ra.localeCompare(rb, undefined, { numeric: true, sensitivity: 'base' });
}

function buildClassSectionOrderMaps(classes: ClassPickerOption[]) {
  const classOrder = new Map<string, number>();
  const sectionOrder = new Map<string, number>();

  classes.forEach((cls, classIndex) => {
    classOrder.set(cls.id, cls.sortOrder ?? classIndex);
    cls.sections?.forEach((section, sectionIndex) => {
      sectionOrder.set(section.id, section.sortOrder ?? sectionIndex);
    });
  });

  return { classOrder, sectionOrder };
}

/** Sort students by class order, section order, roll number, then name. */
export function sortStudentsByClassSection<T extends StudentClassSectionSortable>(
  students: T[],
  classes?: ClassPickerOption[],
): T[] {
  const { classOrder, sectionOrder } = classes?.length
    ? buildClassSectionOrderMaps(classes)
    : { classOrder: new Map<string, number>(), sectionOrder: new Map<string, number>() };

  const classSortKey = (student: T) =>
    student.class?.sortOrder ??
    classOrder.get(student.class?.id ?? student.classId ?? '') ??
    Number.MAX_SAFE_INTEGER;

  const sectionSortKey = (student: T) =>
    student.section?.sortOrder ??
    sectionOrder.get(student.section?.id ?? student.sectionId ?? '') ??
    Number.MAX_SAFE_INTEGER;

  return [...students].sort((a, b) => {
    const classDiff = classSortKey(a) - classSortKey(b);
    if (classDiff !== 0) return classDiff;

    const sectionDiff = sectionSortKey(a) - sectionSortKey(b);
    if (sectionDiff !== 0) return sectionDiff;

    const rollDiff = compareRollNumber(a.rollNumber, b.rollNumber);
    if (rollDiff !== 0) return rollDiff;

    const nameA = `${a.firstName ?? ''} ${a.lastName ?? ''}`.trim();
    const nameB = `${b.firstName ?? ''} ${b.lastName ?? ''}`.trim();
    return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
  });
}
