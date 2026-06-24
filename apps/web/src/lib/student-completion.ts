export type StudentCompletionFields = {
  photoUrl?: string | null;
  firstName?: string | null;
  parentPhone?: string | null;
};

/** Incomplete only when photo, first name, or parent mobile is missing. */
export function isStudentIncomplete(s: StudentCompletionFields): boolean {
  return (
    !String(s?.photoUrl ?? '').trim() ||
    !String(s?.firstName ?? '').trim() ||
    !String(s?.parentPhone ?? '').trim()
  );
}
