import {
  buildEnrollFormLayout,
  type EnrollFormFieldKey,
  extractTemplateStudentFieldTypes,
} from '@/lib/student-enroll-layout';

export type ExcelImportColumnId = 'studentName' | EnrollFormFieldKey;

export type ExcelImportColumn = {
  id: ExcelImportColumnId;
  header: string;
  sample: string;
  required: boolean;
};

export type ExcelImportTemplateSpec = {
  columns: ExcelImportColumn[];
  templateName: string | null;
  fieldTypes: string[];
};

const COLUMN_META: Record<ExcelImportColumnId, { header: string; sample: string }> = {
  studentName: { header: 'Student Name', sample: 'Rahul Sharma' },
  class: { header: 'Class', sample: '10' },
  section: { header: 'Section', sample: 'A' },
  firstName: { header: 'First Name', sample: 'Rahul' },
  lastName: { header: 'Last Name', sample: 'Sharma' },
  rollNumber: { header: 'Roll Number', sample: '101' },
  fatherName: { header: 'Father Name', sample: 'Vijay Sharma' },
  motherName: { header: 'Mother Name', sample: 'Priya Sharma' },
  parentName: { header: 'Parent / Guardian Name', sample: 'Vijay Sharma' },
  parentPhone: { header: 'Parent Phone', sample: '9876543210' },
  address: { header: 'Address', sample: '12 MG Road, Bengaluru' },
  childId: { header: 'Student Child ID', sample: '123456789012' },
  aadharCard: { header: 'Aadhar Card', sample: '1234 5678 9012' },
  penId: { header: 'PEN ID', sample: 'PEN-1234567890' },
  apaarId: { header: 'APAAR ID', sample: 'APAAR-9876543210' },
  bloodGroup: { header: 'Blood Group', sample: 'B+' },
  dateOfBirth: { header: 'Date of Birth', sample: '15/05/2012' },
  emergencyContact: { header: 'Emergency Contact', sample: '9876543211' },
  transportDetails: { header: 'Transport', sample: 'Bus Route 5' },
};

/** Fields we can read from Excel and send to bulk import. */
const IMPORTABLE_COLUMN_IDS = new Set<ExcelImportColumnId>([
  'studentName',
  'class',
  'section',
  'rollNumber',
  'fatherName',
  'motherName',
  'parentName',
  'parentPhone',
  'address',
  'childId',
  'aadharCard',
  'penId',
  'apaarId',
  'bloodGroup',
  'dateOfBirth',
]);

export function buildExcelImportTemplate(
  fieldTypes: string[],
  templateName?: string | null,
): ExcelImportTemplateSpec {
  const layout = buildEnrollFormLayout(fieldTypes);
  const columns: ExcelImportColumn[] = [];
  const added = new Set<ExcelImportColumnId>();

  const addColumn = (id: ExcelImportColumnId, forceRequired?: boolean) => {
    if (!IMPORTABLE_COLUMN_IDS.has(id)) return;

    if (id === 'firstName' || id === 'lastName') {
      if (added.has('studentName')) return;
      added.add('studentName');
      columns.push({
        id: 'studentName',
        ...COLUMN_META.studentName,
        required: true,
      });
      return;
    }

    if (added.has(id)) return;
    added.add(id);

    const required =
      forceRequired === true ||
      isColumnRequired(id, layout);

    columns.push({
      id,
      ...COLUMN_META[id],
      required,
    });
  };

  for (const key of layout.primaryFields) {
    addColumn(key);
  }

  if (!added.has('studentName')) addColumn('studentName', true);
  if (!added.has('parentPhone')) addColumn('parentPhone', true);

  return {
    columns,
    templateName: templateName ?? null,
    fieldTypes,
  };
}

export function buildExcelImportTemplateFromConfigs(
  frontConfig: unknown,
  backConfig: unknown,
  templateName?: string | null,
): ExcelImportTemplateSpec {
  const fieldTypes = extractTemplateStudentFieldTypes(frontConfig, backConfig);
  return buildExcelImportTemplate(fieldTypes, templateName);
}

export function excelTemplateToSheet(spec: ExcelImportTemplateSpec): {
  headers: string[];
  sampleRow: Record<string, string>;
} {
  const headers = spec.columns.map((c) => c.header);
  const sampleRow: Record<string, string> = {};
  for (const col of spec.columns) {
    sampleRow[col.header] = col.sample;
  }
  return { headers, sampleRow };
}

function isColumnRequired(id: ExcelImportColumnId, layout: ReturnType<typeof buildEnrollFormLayout>): boolean {
  if (id === 'studentName' || id === 'parentPhone') return true;
  if (id === 'firstName' || id === 'lastName') return false;
  if (layout.templateFieldTypes.length === 0) return false;
  return layout.primaryFields.includes(id as EnrollFormFieldKey);
}

export const DEFAULT_EXCEL_IMPORT_TEMPLATE = buildExcelImportTemplate([]);
