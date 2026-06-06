export const STUDENTS_CLASS_SECTION_FILTER_KEY = 'vb_students_class_section_filter';
export const EDIT_STUDENT_STORAGE_KEY = 'vb_edit_student_id';
export const EDIT_STUDENT_PAYLOAD_KEY = 'vb_edit_student_payload';

export type StudentsClassSectionFilter = {
  schoolId?: string;
  classId: string;
  sectionId: string;
};

export type EditStudentPayload = {
  id: string;
  schoolId?: string;
  classId?: string;
  sectionId?: string;
  class?: { id: string; name?: string; sections?: { id: string; name: string }[] };
  section?: { id: string; name?: string };
  firstName?: string;
  lastName?: string;
  rollNumber?: string | null;
  admissionNumber?: string;
  parentName?: string | null;
  parentPhone?: string | null;
  bloodGroup?: string | null;
  aadharCard?: string | null;
  address?: string | null;
  dateOfBirth?: string | null;
  emergencyContact?: string | null;
  transportDetails?: string | null;
  photoUrl?: string | null;
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

export function saveEditStudentIntent(student: EditStudentPayload): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(EDIT_STUDENT_STORAGE_KEY, student.id);
  sessionStorage.setItem(EDIT_STUDENT_PAYLOAD_KEY, JSON.stringify(student));
}

export function peekEditStudentIntent(): EditStudentPayload | null {
  if (typeof window === 'undefined') return null;
  const raw = sessionStorage.getItem(EDIT_STUDENT_PAYLOAD_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as EditStudentPayload;
  } catch {
    return null;
  }
}

export function consumeEditStudentIntent(): EditStudentPayload | null {
  if (typeof window === 'undefined') return null;
  const id = sessionStorage.getItem(EDIT_STUDENT_STORAGE_KEY);
  const student = peekEditStudentIntent();
  sessionStorage.removeItem(EDIT_STUDENT_STORAGE_KEY);
  sessionStorage.removeItem(EDIT_STUDENT_PAYLOAD_KEY);
  if (student?.id) return student;
  if (id) return { id };
  return null;
}
