export type StudentCompletionFields = {
  photoUrl?: string | null;
  rollNumber?: string | null;
  parentName?: string | null;
  parentPhone?: string | null;
  classId?: string | null;
  class?: { id?: string; name?: string | null } | null;
};

/** Profile is incomplete when required fields are missing or class is Unassigned. */
export function isStudentIncomplete(s: StudentCompletionFields): boolean {
  return (
    !s?.photoUrl ||
    !String(s?.rollNumber ?? '').trim() ||
    !String(s?.classId ?? s?.class?.id ?? '').trim() ||
    String(s?.class?.name ?? '').trim().toLowerCase() === 'unassigned' ||
    !String(s?.parentName ?? '').trim() ||
    !String(s?.parentPhone ?? '').trim()
  );
}
