import { Prisma } from '@prisma/client';

/** Matches web `isStudentIncomplete` — missing required profile fields or Unassigned class. */
export const INCOMPLETE_STUDENT_OR: Prisma.StudentWhereInput[] = [
  { photoUrl: null },
  { photoUrl: '' },
  { rollNumber: null },
  { rollNumber: '' },
  { parentName: null },
  { parentName: '' },
  { parentPhone: null },
  { parentPhone: '' },
  { class: { name: { equals: 'Unassigned', mode: 'insensitive' } } },
];

export function incompleteStudentWhere(
  base: Prisma.StudentWhereInput = {},
): Prisma.StudentWhereInput {
  return {
    ...base,
    deletedAt: null,
    OR: INCOMPLETE_STUDENT_OR,
  };
}

export function completeStudentWhere(
  base: Prisma.StudentWhereInput = {},
): Prisma.StudentWhereInput {
  return {
    ...base,
    deletedAt: null,
    photoUrl: { not: null },
    rollNumber: { not: null },
    parentName: { not: null },
    parentPhone: { not: null },
    NOT: [
      { photoUrl: '' },
      { rollNumber: '' },
      { parentName: '' },
      { parentPhone: '' },
      { class: { name: { equals: 'Unassigned', mode: 'insensitive' } } },
    ],
  };
}
