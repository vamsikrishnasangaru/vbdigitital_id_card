import { Prisma } from '@prisma/client';

export type StudentCompletionFields = {
  photoUrl?: string | null;
  firstName?: string | null;
  parentPhone?: string | null;
};

/** Same rules as the Students page badge — trim-aware, not just null/empty DB values. */
export function isStudentIncomplete(s: StudentCompletionFields): boolean {
  return (
    !String(s?.photoUrl ?? '').trim() ||
    !String(s?.firstName ?? '').trim() ||
    !String(s?.parentPhone ?? '').trim()
  );
}

export const STUDENT_COMPLETION_SELECT = {
  id: true,
  status: true,
  photoUrl: true,
  firstName: true,
  parentPhone: true,
} as const;

/** @deprecated Prefer isStudentIncomplete() for counts — Prisma OR misses trim-only blanks. */
export const INCOMPLETE_STUDENT_OR: Prisma.StudentWhereInput[] = [
  { photoUrl: null },
  { photoUrl: '' },
  { firstName: '' },
  { parentPhone: null },
  { parentPhone: '' },
];

export function incompleteStudentWhere(
  base: Prisma.StudentWhereInput = {},
): Prisma.StudentWhereInput {
  const { OR: scopeOr, ...rest } = base;
  if (scopeOr?.length) {
    return {
      ...rest,
      deletedAt: null,
      AND: [{ OR: scopeOr }, { OR: INCOMPLETE_STUDENT_OR }],
    };
  }
  return {
    ...rest,
    deletedAt: null,
    OR: INCOMPLETE_STUDENT_OR,
  };
}

export function completeStudentWhere(
  base: Prisma.StudentWhereInput = {},
): Prisma.StudentWhereInput {
  const { OR: scopeOr, ...rest } = base;
  const completeRules: Prisma.StudentWhereInput = {
    ...rest,
    deletedAt: null,
    photoUrl: { not: null },
    parentPhone: { not: null },
    NOT: [{ photoUrl: '' }, { firstName: '' }, { parentPhone: '' }],
  };
  if (scopeOr?.length) {
    return { ...completeRules, AND: [{ OR: scopeOr }, completeRules] };
  }
  return completeRules;
}

export function countStudentsByCompletion(
  students: StudentCompletionFields[],
): { incompleteStudents: number; completeStudents: number } {
  let incompleteStudents = 0;
  let completeStudents = 0;
  for (const student of students) {
    if (isStudentIncomplete(student)) incompleteStudents++;
    else completeStudents++;
  }
  return { incompleteStudents, completeStudents };
}
