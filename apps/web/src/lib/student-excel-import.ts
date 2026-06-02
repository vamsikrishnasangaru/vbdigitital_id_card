import type { ClassPickerOption } from '@/lib/classes-query';

export type ImportRowStatus = 'ready' | 'error';

export interface ParsedImportRow {
  rowNumber: number;
  studentName: string;
  className: string;
  sectionName: string;
  parentName: string;
  address: string;
  rollNumber?: string;
  parentPhone?: string;
  firstName?: string;
  lastName?: string;
  classId?: string;
  sectionId?: string;
  status: ImportRowStatus;
  message?: string;
}

export interface ImportPayloadRow {
  firstName: string;
  lastName: string;
  classId: string;
  sectionId: string;
  parentName: string;
  address: string;
  rollNumber: string;
  parentPhone?: string;
}

const HEADER_ALIASES: Record<string, keyof Omit<ParsedImportRow, 'rowNumber' | 'status' | 'message' | 'firstName' | 'lastName' | 'classId' | 'sectionId'>> = {
  'student name': 'studentName',
  name: 'studentName',
  student: 'studentName',
  'full name': 'studentName',
  class: 'className',
  grade: 'className',
  'class name': 'className',
  section: 'sectionName',
  'section name': 'sectionName',
  'father name': 'parentName',
  'parent name': 'parentName',
  father: 'parentName',
  guardian: 'parentName',
  address: 'address',
  'roll number': 'rollNumber',
  roll: 'rollNumber',
  'roll no': 'rollNumber',
  phone: 'parentPhone',
  mobile: 'parentPhone',
  'parent phone': 'parentPhone',
  'father phone': 'parentPhone',
};

function normKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function cellString(value: unknown): string {
  if (value == null) return '';
  return String(value).trim();
}

function mapHeader(header: string): string | null {
  const key = normKey(header);
  const field = HEADER_ALIASES[key];
  return field ?? null;
}

export function splitStudentName(full: string): { firstName: string; lastName: string } {
  const trimmed = full.trim();
  if (!trimmed) return { firstName: '', lastName: '' };
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: '-' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

export function buildClassSectionLookup(classes: ClassPickerOption[]) {
  const classByNorm = new Map<string, ClassPickerOption>();
  const sectionByClass = new Map<string, Map<string, { id: string; name: string }>>();

  for (const cls of classes) {
    classByNorm.set(normKey(cls.name), cls);
    const secMap = new Map<string, { id: string; name: string }>();
    for (const sec of cls.sections ?? []) {
      secMap.set(normKey(sec.name), sec);
    }
    sectionByClass.set(cls.id, secMap);
  }

  return { classByNorm, sectionByClass };
}

export function resolveClassSection(
  className: string,
  sectionName: string,
  lookup: ReturnType<typeof buildClassSectionLookup>,
): { classId?: string; sectionId?: string; error?: string } {
  const cls = lookup.classByNorm.get(normKey(className));
  if (!cls) {
    return { error: `Class "${className}" not found in this school` };
  }
  const secMap = lookup.sectionByClass.get(cls.id);
  const sec = secMap?.get(normKey(sectionName));
  if (!sec) {
    return { error: `Section "${sectionName}" not found in class "${cls.name}"` };
  }
  return { classId: cls.id, sectionId: sec.id };
}

export function parseExcelRows(
  sheetRows: Record<string, unknown>[],
  classes: ClassPickerOption[],
): ParsedImportRow[] {
  const lookup = buildClassSectionLookup(classes);
  const usedRollNumbers = new Set<string>();

  return sheetRows.map((raw, index) => {
    const rowNumber = index + 2;
    const row: ParsedImportRow = {
      rowNumber,
      studentName: '',
      className: '',
      sectionName: '',
      parentName: '',
      address: '',
      status: 'error',
    };

    for (const [header, value] of Object.entries(raw)) {
      const field = mapHeader(header);
      if (!field) continue;
      const text = cellString(value);
      if (field === 'studentName') row.studentName = text;
      else if (field === 'className') row.className = text;
      else if (field === 'sectionName') row.sectionName = text;
      else if (field === 'parentName') row.parentName = text;
      else if (field === 'address') row.address = text;
      else if (field === 'rollNumber') row.rollNumber = text;
      else if (field === 'parentPhone') row.parentPhone = text;
    }

    if (!row.studentName) {
      return { ...row, message: 'Student name is required' };
    }
    if (!row.className) {
      return { ...row, message: 'Class is required' };
    }
    if (!row.sectionName) {
      return { ...row, message: 'Section is required' };
    }
    if (!row.parentName) {
      return { ...row, message: 'Father / parent name is required' };
    }
    if (!row.address) {
      return { ...row, message: 'Address is required' };
    }

    const { firstName, lastName } = splitStudentName(row.studentName);
    if (!firstName) {
      return { ...row, message: 'Invalid student name' };
    }

    const resolved = resolveClassSection(row.className, row.sectionName, lookup);
    if (resolved.error) {
      return { ...row, firstName, lastName, message: resolved.error };
    }

    let rollNumber = row.rollNumber?.trim() || '';
    if (!rollNumber) {
      rollNumber = `IMP-${rowNumber}`;
    }
    if (usedRollNumbers.has(rollNumber)) {
      rollNumber = `${rollNumber}-${index + 1}`;
    }
    usedRollNumbers.add(rollNumber);

    return {
      ...row,
      firstName,
      lastName,
      classId: resolved.classId,
      sectionId: resolved.sectionId,
      rollNumber,
      status: 'ready',
    };
  });
}

export function toImportPayload(rows: ParsedImportRow[]): ImportPayloadRow[] {
  return rows
    .filter((r) => r.status === 'ready' && r.classId && r.sectionId && r.firstName && r.lastName)
    .map((r) => ({
      firstName: r.firstName!,
      lastName: r.lastName!,
      classId: r.classId!,
      sectionId: r.sectionId!,
      parentName: r.parentName.trim(),
      address: r.address.trim(),
      rollNumber: r.rollNumber!.trim(),
      ...(r.parentPhone?.trim() ? { parentPhone: r.parentPhone.trim() } : {}),
    }));
}

export const IMPORT_TEMPLATE_HEADERS = [
  'Student Name',
  'Class',
  'Section',
  'Father Name',
  'Address',
  'Roll Number',
  'Parent Phone',
];

export const IMPORT_TEMPLATE_SAMPLE = [
  {
    'Student Name': 'Rahul Sharma',
    Class: '10',
    Section: 'A',
    'Father Name': 'Vijay Sharma',
    Address: '12 MG Road, Bengaluru',
    'Roll Number': '101',
    'Parent Phone': '9876543210',
  },
];
