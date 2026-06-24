import type { ClassPickerOption } from '@/lib/classes-query';
import type { ExcelImportColumn, ExcelImportTemplateSpec } from '@/lib/student-excel-template';
import { DEFAULT_EXCEL_IMPORT_TEMPLATE } from '@/lib/student-excel-template';

export type ImportRowStatus = 'ready' | 'error';

export interface ParsedImportRow {
  rowNumber: number;
  studentName: string;
  className: string;
  sectionName: string;
  parentName: string;
  fatherName: string;
  motherName: string;
  address: string;
  rollNumber?: string;
  parentPhone?: string;
  childId?: string;
  aadharCard?: string;
  penId?: string;
  apaarId?: string;
  bloodGroup?: string;
  dateOfBirth?: string;
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
  className?: string;
  sectionName?: string;
  parentName?: string;
  fatherName?: string;
  motherName?: string;
  address?: string;
  rollNumber?: string;
  parentPhone: string;
  childId?: string;
  aadharCard?: string;
  penId?: string;
  apaarId?: string;
  bloodGroup?: string;
  dateOfBirth?: string;
}

type ParsedFieldKey = keyof Omit<
  ParsedImportRow,
  'rowNumber' | 'status' | 'message' | 'firstName' | 'lastName' | 'classId' | 'sectionId'
>;

const HEADER_ALIASES: Record<string, ParsedFieldKey> = {
  'student name': 'studentName',
  name: 'studentName',
  student: 'studentName',
  'full name': 'studentName',
  class: 'className',
  grade: 'className',
  'class name': 'className',
  section: 'sectionName',
  'section name': 'sectionName',
  'father name': 'fatherName',
  father: 'fatherName',
  'mother name': 'motherName',
  mother: 'motherName',
  'parent name': 'parentName',
  'parent / guardian name': 'parentName',
  guardian: 'parentName',
  address: 'address',
  'roll number': 'rollNumber',
  roll: 'rollNumber',
  'roll no': 'rollNumber',
  phone: 'parentPhone',
  mobile: 'parentPhone',
  'parent phone': 'parentPhone',
  'father phone': 'parentPhone',
  'mother phone': 'parentPhone',
  'child id': 'childId',
  'student child id': 'childId',
  childid: 'childId',
  aadhar: 'aadharCard',
  'aadhar card': 'aadharCard',
  aadhaar: 'aadharCard',
  'pen id': 'penId',
  pen: 'penId',
  'apaar id': 'apaarId',
  apaar: 'apaarId',
  'blood group': 'bloodGroup',
  'date of birth': 'dateOfBirth',
  dob: 'dateOfBirth',
  birthday: 'dateOfBirth',
};

function normKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function normClassName(value: string): string {
  return normKey(value)
    .replace(/[._-]/g, ' ')
    .replace(/\b(class|grade|standard|std)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normSectionName(value: string): string {
  return normKey(value)
    .replace(/[._-]/g, ' ')
    .replace(/\b(section|sec)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cellString(value: unknown): string {
  if (value == null) return '';
  return String(value).trim();
}

function mapHeader(header: string): ParsedFieldKey | null {
  const key = normKey(header);
  return HEADER_ALIASES[key] ?? null;
}

function buildHeaderLookup(template: ExcelImportTemplateSpec): Map<string, ParsedFieldKey> {
  const lookup = new Map<string, ParsedFieldKey>();
  for (const col of template.columns) {
    const field = columnIdToField(col.id);
    if (!field) continue;
    lookup.set(normKey(col.header), field);
  }
  for (const [alias, field] of Object.entries(HEADER_ALIASES)) {
    lookup.set(alias, field);
  }
  return lookup;
}

function columnIdToField(id: ExcelImportColumn['id']): ParsedFieldKey | null {
  switch (id) {
    case 'studentName':
      return 'studentName';
    case 'class':
      return 'className';
    case 'section':
      return 'sectionName';
    case 'rollNumber':
      return 'rollNumber';
    case 'fatherName':
      return 'fatherName';
    case 'motherName':
      return 'motherName';
    case 'parentName':
      return 'parentName';
    case 'parentPhone':
      return 'parentPhone';
    case 'address':
      return 'address';
    case 'childId':
      return 'childId';
    case 'aadharCard':
      return 'aadharCard';
    case 'penId':
      return 'penId';
    case 'apaarId':
      return 'apaarId';
    case 'bloodGroup':
      return 'bloodGroup';
    case 'dateOfBirth':
      return 'dateOfBirth';
    default:
      return null;
  }
}

function fieldValue(row: ParsedImportRow, id: ExcelImportColumn['id']): string {
  switch (id) {
    case 'studentName':
      return row.studentName;
    case 'class':
      return row.className;
    case 'section':
      return row.sectionName;
    case 'rollNumber':
      return row.rollNumber ?? '';
    case 'fatherName':
      return row.fatherName || row.parentName;
    case 'motherName':
      return row.motherName;
    case 'parentName':
      return row.parentName || row.fatherName;
    case 'parentPhone':
      return row.parentPhone ?? '';
    case 'address':
      return row.address;
    case 'childId':
      return row.childId ?? '';
    case 'aadharCard':
      return row.aadharCard ?? '';
    case 'penId':
      return row.penId ?? '';
    case 'apaarId':
      return row.apaarId ?? '';
    case 'bloodGroup':
      return row.bloodGroup ?? '';
    case 'dateOfBirth':
      return row.dateOfBirth ?? '';
    default:
      return '';
  }
}

function normalizePhone(value: string): string {
  return value.replace(/\D/g, '');
}

export function splitStudentName(full: string): { firstName: string; lastName: string } {
  const trimmed = full.trim();
  if (!trimmed) return { firstName: '', lastName: '' };
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

export function buildClassSectionLookup(classes: ClassPickerOption[]) {
  const classByNorm = new Map<string, ClassPickerOption>();
  const sectionByClass = new Map<string, Map<string, { id: string; name: string }>>();

  for (const cls of classes) {
    classByNorm.set(normKey(cls.name), cls);
    classByNorm.set(normClassName(cls.name), cls);
    const secMap = new Map<string, { id: string; name: string }>();
    for (const sec of cls.sections ?? []) {
      secMap.set(normKey(sec.name), sec);
      secMap.set(normSectionName(sec.name), sec);
    }
    sectionByClass.set(cls.id, secMap);
  }

  return { classByNorm, sectionByClass };
}

export function resolveClassSection(
  className: string,
  sectionName: string,
  lookup: ReturnType<typeof buildClassSectionLookup>,
): {
  classId?: string;
  sectionId?: string;
  willCreateClass?: boolean;
  willCreateSection?: boolean;
  matchedClassName?: string;
} {
  if (!className.trim()) {
    return {};
  }
  const cls =
    lookup.classByNorm.get(normClassName(className)) ??
    lookup.classByNorm.get(normKey(className));
  if (!cls) {
    return { willCreateClass: true, willCreateSection: !sectionName.trim() };
  }
  if (!sectionName.trim()) {
    return { classId: cls.id, matchedClassName: cls.name };
  }
  const secMap = lookup.sectionByClass.get(cls.id);
  const sec =
    secMap?.get(normSectionName(sectionName)) ??
    secMap?.get(normKey(sectionName));
  if (!sec) {
    return { classId: cls.id, willCreateSection: true, matchedClassName: cls.name };
  }
  return { classId: cls.id, sectionId: sec.id, matchedClassName: cls.name };
}

export function parseExcelRows(
  sheetRows: Record<string, unknown>[],
  classes: ClassPickerOption[],
  template: ExcelImportTemplateSpec = DEFAULT_EXCEL_IMPORT_TEMPLATE,
): ParsedImportRow[] {
  const lookup = buildClassSectionLookup(classes);
  const headerLookup = buildHeaderLookup(template);
  const usedRollKeys = new Set<string>();
  const requiredColumns = template.columns.filter((c) => c.required);

  return sheetRows.map((raw, index) => {
    const rowNumber = index + 2;
    const row: ParsedImportRow = {
      rowNumber,
      studentName: '',
      className: '',
      sectionName: '',
      parentName: '',
      fatherName: '',
      motherName: '',
      address: '',
      status: 'error',
    };

    for (const [header, value] of Object.entries(raw)) {
      const field = headerLookup.get(normKey(header)) ?? mapHeader(header);
      if (!field) continue;
      const text = cellString(value);
      row[field] = text;
    }

    for (const col of requiredColumns) {
      const value = fieldValue(row, col.id);
      if (!value.trim()) {
        return { ...row, message: `${col.header} is required` };
      }
    }

    const { firstName, lastName } = splitStudentName(row.studentName);
    if (!firstName) {
      return { ...row, message: 'Invalid student name' };
    }

    const phoneDigits = normalizePhone(row.parentPhone ?? '');
    if (phoneDigits && phoneDigits.length !== 10) {
      return { ...row, message: 'Parent phone must be 10 digits' };
    }
    if (row.parentPhone) {
      row.parentPhone = phoneDigits;
    }

    const resolved = resolveClassSection(row.className, row.sectionName ?? '', lookup);
    let message: string | undefined;
    if (resolved.willCreateClass) {
      message = row.sectionName?.trim()
        ? `Will create class "${row.className}" and section "${row.sectionName}"`
        : `Will create class "${row.className}" (no section)`;
    } else if (resolved.willCreateSection) {
      message = `Will create section "${row.sectionName}" in ${resolved.matchedClassName ?? row.className}`;
    }

    const rollNumber = row.rollNumber?.trim() || '';
    if (rollNumber) {
      const rollKey = row.sectionName?.trim()
        ? `${normClassName(row.className)}|${normSectionName(row.sectionName)}|${rollNumber}`
        : `${normClassName(row.className)}||${rollNumber}`;
      if (usedRollKeys.has(rollKey)) {
        return {
          ...row,
          message: `Duplicate roll number "${rollNumber}" for this class and section in this file`,
        };
      }
      usedRollKeys.add(rollKey);
    }

    return {
      ...row,
      firstName,
      lastName,
      classId: resolved.classId,
      sectionId: resolved.sectionId,
      rollNumber: rollNumber || undefined,
      status: 'ready',
      message,
    };
  });
}

export function toImportPayload(rows: ParsedImportRow[]): ImportPayloadRow[] {
  return rows
    .filter((r) => r.status === 'ready' && r.firstName && r.parentPhone)
    .map((r) => ({
      firstName: r.firstName!,
      lastName: r.lastName ?? '',
      ...(r.className.trim() ? { className: r.className.trim() } : {}),
      ...(r.sectionName?.trim() ? { sectionName: r.sectionName.trim() } : {}),
      ...(r.parentName.trim() || r.fatherName.trim()
        ? { parentName: (r.fatherName || r.parentName).trim() }
        : {}),
      ...(r.fatherName.trim() ? { fatherName: r.fatherName.trim() } : {}),
      ...(r.motherName.trim() ? { motherName: r.motherName.trim() } : {}),
      ...(r.address.trim() ? { address: r.address.trim() } : {}),
      ...(r.rollNumber?.trim() ? { rollNumber: r.rollNumber.trim() } : {}),
      parentPhone: r.parentPhone!.trim(),
      ...(r.childId?.trim() ? { childId: r.childId.trim() } : {}),
      ...(r.aadharCard?.trim() ? { aadharCard: r.aadharCard.trim() } : {}),
      ...(r.penId?.trim() ? { penId: r.penId.trim() } : {}),
      ...(r.apaarId?.trim() ? { apaarId: r.apaarId.trim() } : {}),
      ...(r.bloodGroup?.trim() ? { bloodGroup: r.bloodGroup.trim() } : {}),
      ...(r.dateOfBirth?.trim() ? { dateOfBirth: r.dateOfBirth.trim() } : {}),
    }));
}

/** @deprecated Use buildExcelImportTemplate + excelTemplateToSheet */
export const IMPORT_TEMPLATE_HEADERS = DEFAULT_EXCEL_IMPORT_TEMPLATE.columns.map((c) => c.header);

/** @deprecated Use buildExcelImportTemplate + excelTemplateToSheet */
export const IMPORT_TEMPLATE_SAMPLE = [
  Object.fromEntries(
    DEFAULT_EXCEL_IMPORT_TEMPLATE.columns.map((c) => [c.header, c.sample]),
  ),
];
