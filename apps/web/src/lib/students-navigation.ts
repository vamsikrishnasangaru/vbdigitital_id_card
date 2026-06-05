export const STUDENTS_CLASS_SECTION_FILTER_KEY = 'vb_students_class_section_filter';

export type StudentsClassSectionFilter = {
  schoolId?: string;
  classId: string;
  sectionId: string;
};

export function saveStudentsClassSectionFilter(filter: StudentsClassSectionFilter): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(STUDENTS_CLASS_SECTION_FILTER_KEY, JSON.stringify(filter));
}

export function consumeStudentsClassSectionFilter(): StudentsClassSectionFilter | null {
  if (typeof window === 'undefined') return null;
  const raw = sessionStorage.getItem(STUDENTS_CLASS_SECTION_FILTER_KEY);
  if (!raw) return null;
  sessionStorage.removeItem(STUDENTS_CLASS_SECTION_FILTER_KEY);
  try {
    const parsed = JSON.parse(raw) as StudentsClassSectionFilter;
    if (!parsed.classId || !parsed.sectionId) return null;
    return parsed;
  } catch {
    return null;
  }
}
