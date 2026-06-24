import type { DesignerElement } from '@/lib/designer-utils';
import { normalizeFrontConfig } from '@/lib/template-utils';

export type EnrollFormFieldKey =
  | 'class'
  | 'section'
  | 'firstName'
  | 'lastName'
  | 'rollNumber'
  | 'childId'
  | 'fatherName'
  | 'motherName'
  | 'parentName'
  | 'parentPhone'
  | 'address'
  | 'aadharCard'
  | 'penId'
  | 'apaarId'
  | 'bloodGroup'
  | 'dateOfBirth'
  | 'emergencyContact'
  | 'transportDetails';

export type EnrollFormLayout = {
  primaryFields: EnrollFormFieldKey[];
  optionalFields: EnrollFormFieldKey[];
  showPhoto: boolean;
  templateFieldTypes: string[];
};

const TEMPLATE_FIELD_MAP: Record<string, EnrollFormFieldKey[]> = {
  studentPhoto: [],
  fullName: ['firstName', 'lastName'],
  studentName: ['firstName', 'lastName'],
  firstName: ['firstName'],
  lastName: ['lastName'],
  rollNo: ['rollNumber'],
  rollNumber: ['rollNumber'],
  classSection: ['class', 'section'],
  className: ['class'],
  sectionName: ['section'],
  bloodGroup: ['bloodGroup'],
  aadharCard: ['aadharCard'],
  penId: ['penId'],
  apaarId: ['apaarId'],
  childId: ['childId'],
  fatherName: ['fatherName'],
  motherName: ['motherName'],
  parentName: ['parentName'],
  parentPhone: ['parentPhone'],
  cell: ['parentPhone'],
  phone: ['parentPhone'],
  address: ['address'],
  dob: ['dateOfBirth'],
};

const ALL_ENROLL_FIELDS: EnrollFormFieldKey[] = [
  'class',
  'section',
  'firstName',
  'lastName',
  'rollNumber',
  'childId',
  'fatherName',
  'motherName',
  'parentName',
  'parentPhone',
  'address',
  'aadharCard',
  'penId',
  'apaarId',
  'bloodGroup',
  'dateOfBirth',
  'emergencyContact',
  'transportDetails',
];

const SKIP_TEMPLATE_FIELD_TYPES = new Set([
  'custom',
  'schoolLogo',
  'schoolSignature',
  'qr',
  'barcode',
  'rfid',
  'admissionNo',
  'admissionNumber',
]);

const REQUIRED_PRIMARY: EnrollFormFieldKey[] = ['firstName', 'parentPhone'];

function isStudentPhotoElement(el: DesignerElement): boolean {
  if (el.visible === false) return false;
  if (el.type === 'photo' || el.fieldType === 'studentPhoto') return true;
  if (el.type === 'customPhotoFrame') return true;
  return false;
}

function templateFieldTypeFromElement(el: DesignerElement): string | null {
  if (el.visible === false) return null;
  if (isStudentPhotoElement(el)) return 'studentPhoto';
  if (el.type === 'text' && el.fieldType) return el.fieldType;
  return null;
}

/** Unique student field types from template designer (front + back), in canvas order. */
export function extractTemplateStudentFieldTypes(
  frontConfig: unknown,
  backConfig?: unknown,
): string[] {
  const elements = [
    ...normalizeFrontConfig(frontConfig),
    ...normalizeFrontConfig(backConfig),
  ];
  const seen = new Set<string>();
  const order: string[] = [];

  for (const el of elements) {
    const ft = templateFieldTypeFromElement(el);
    if (!ft || SKIP_TEMPLATE_FIELD_TYPES.has(ft)) continue;
    if (!seen.has(ft)) {
      seen.add(ft);
      order.push(ft);
    }
  }
  return order;
}

function appendPrimary(primary: EnrollFormFieldKey[], keys: EnrollFormFieldKey[]) {
  for (const key of keys) {
    if (!primary.includes(key)) primary.push(key);
  }
}

/** Primary fields = template fields first; everything else optional. */
export function buildEnrollFormLayout(fieldTypes: string[]): EnrollFormLayout {
  const primaryFields: EnrollFormFieldKey[] = [];
  let showPhoto = true;

  if (fieldTypes.length === 0) {
    return {
      primaryFields: ['firstName', 'lastName', 'parentPhone'],
      optionalFields: ALL_ENROLL_FIELDS.filter(
        (k) => !['firstName', 'lastName', 'parentPhone'].includes(k),
      ),
      showPhoto: true,
      templateFieldTypes: [],
    };
  }

  for (const ft of fieldTypes) {
    if (ft === 'studentPhoto') {
      showPhoto = true;
      continue;
    }
    appendPrimary(primaryFields, TEMPLATE_FIELD_MAP[ft] ?? []);
  }

  for (const required of REQUIRED_PRIMARY) {
    if (!primaryFields.includes(required)) {
      primaryFields.unshift(required);
    }
  }

  const optionalFields = ALL_ENROLL_FIELDS.filter((k) => !primaryFields.includes(k));

  return {
    primaryFields,
    optionalFields,
    showPhoto,
    templateFieldTypes: fieldTypes,
  };
}

export function enrollFieldLabel(key: EnrollFormFieldKey): string {
  const labels: Record<EnrollFormFieldKey, string> = {
    class: 'Class',
    section: 'Section',
    firstName: 'First name',
    lastName: 'Last name',
    rollNumber: 'Roll number',
    childId: 'Student Child ID',
    fatherName: 'Father name',
    motherName: 'Mother name',
    parentName: 'Parent / guardian name',
    parentPhone: 'Parent mobile',
    address: 'Address',
    aadharCard: 'Aadhar Card',
    penId: 'PEN ID',
    apaarId: 'APAAR ID',
    bloodGroup: 'Blood group',
    dateOfBirth: 'Date of birth',
    emergencyContact: 'Emergency contact',
    transportDetails: 'Transport',
  };
  return labels[key];
}

export function isEnrollFieldRequired(key: EnrollFormFieldKey): boolean {
  return key === 'firstName' || key === 'parentPhone';
}
