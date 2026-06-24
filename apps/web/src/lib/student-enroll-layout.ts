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

/** Fixed primary block — shown first when those fields exist on the template. */
const CORE_PRIMARY_BLOCKS: EnrollFormFieldKey[][] = [
  ['class', 'section'],
  ['firstName', 'lastName'],
  ['fatherName', 'motherName'],
  ['parentPhone'],
  ['address'],
];

const CORE_PRIMARY_KEYS = new Set(CORE_PRIMARY_BLOCKS.flat());

function collectTemplateKeys(fieldTypes: string[]): Set<EnrollFormFieldKey> {
  const keys = new Set<EnrollFormFieldKey>();
  for (const ft of fieldTypes) {
    for (const key of TEMPLATE_FIELD_MAP[ft] ?? []) {
      keys.add(key);
    }
  }
  return keys;
}

/** Template field keys in designer canvas order. */
function templateOrderKeys(fieldTypes: string[]): EnrollFormFieldKey[] {
  const ordered: EnrollFormFieldKey[] = [];
  for (const ft of fieldTypes) {
    if (ft === 'studentPhoto') continue;
    for (const key of TEMPLATE_FIELD_MAP[ft] ?? []) {
      if (!ordered.includes(key)) ordered.push(key);
    }
  }
  return ordered;
}

function insertRequiredPrimary(primary: EnrollFormFieldKey[]) {
  if (!primary.includes('firstName')) {
    const afterSection = primary.indexOf('section');
    const afterClass = primary.indexOf('class');
    const at = afterSection >= 0 ? afterSection + 1 : afterClass >= 0 ? afterClass + 1 : 0;
    primary.splice(at, 0, 'firstName');
  }
  if (!primary.includes('parentPhone')) {
    const afterAddress = primary.indexOf('address');
    const afterMother = primary.indexOf('motherName');
    const afterFather = primary.indexOf('fatherName');
    const afterLastName = primary.indexOf('lastName');
    const at =
      afterAddress >= 0
        ? afterAddress + 1
        : Math.max(afterMother, afterFather, afterLastName, primary.indexOf('firstName')) + 1;
    primary.splice(Math.max(0, at), 0, 'parentPhone');
  }
}

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

/**
 * Primary fields:
 * 1. Class & section (if on template)
 * 2. Student name
 * 3. Father & mother name
 * 4. Parent phone
 * 5. Address
 * 6. Other template fields (designer order)
 */
export function buildEnrollFormLayout(fieldTypes: string[]): EnrollFormLayout {
  const showPhoto = fieldTypes.length === 0 || fieldTypes.includes('studentPhoto');

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

  const templateKeys = collectTemplateKeys(fieldTypes);
  const templateOrdered = templateOrderKeys(fieldTypes);
  const primaryFields: EnrollFormFieldKey[] = [];

  for (const block of CORE_PRIMARY_BLOCKS) {
    for (const key of block) {
      const onTemplate = templateKeys.has(key);
      const required = REQUIRED_PRIMARY.includes(key);
      if ((onTemplate || required) && !primaryFields.includes(key)) {
        primaryFields.push(key);
      }
    }
  }

  for (const key of templateOrdered) {
    if (!CORE_PRIMARY_KEYS.has(key) && !primaryFields.includes(key)) {
      primaryFields.push(key);
    }
  }

  insertRequiredPrimary(primaryFields);

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
