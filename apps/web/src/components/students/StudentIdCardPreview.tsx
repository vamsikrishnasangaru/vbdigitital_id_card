'use client';

import dynamic from 'next/dynamic';
import { formatStudentFullName } from '@/lib/utils';
import { normalizeFrontConfig } from '@/lib/template-utils';

const IdCardDesigner = dynamic(
  () => import('@/components/designer/IdCardDesigner').then((m) => m.IdCardDesigner),
  { ssr: false, loading: () => <div className="fixed inset-0 z-[110] bg-[#08080c]" /> },
);

export type StudentPreviewTemplate = {
  name: string;
  frontBgUrl?: string;
  orientation: string;
  frontConfig?: unknown;
};

type StudentRow = Record<string, unknown> & {
  id: string;
  firstName?: string;
  lastName?: string;
};

interface StudentIdCardPreviewProps {
  template: StudentPreviewTemplate;
  students: StudentRow[];
  student: StudentRow;
  onStudentChange: (student: StudentRow) => void;
  schoolId?: string;
  onClose: () => void;
  onEdit?: () => void;
  canEdit?: boolean;
  /** Super admin: show PNG/PDF download in preview toolbar */
  allowExport?: boolean;
}

export function StudentIdCardPreview({
  template,
  students,
  student,
  onStudentChange,
  schoolId,
  onClose,
  onEdit,
  canEdit = true,
  allowExport = false,
}: StudentIdCardPreviewProps) {
  const currentIndex = Math.max(
    0,
    students.findIndex((s) => s.id === student.id),
  );
  const total = students.length;
  const hasMultiple = total > 1;

  const goTo = (index: number) => {
    const next = students[index];
    if (next) onStudentChange(next);
  };

  const studentLabel = formatStudentFullName(
    typeof student.firstName === 'string' ? student.firstName : '',
    typeof student.lastName === 'string' ? student.lastName : '',
  );

  return (
    <div className="fixed inset-0 z-[110] bg-background">
      <IdCardDesigner
        bgUrl={template.frontBgUrl || ''}
        elements={normalizeFrontConfig(template.frontConfig)}
        templateName={`${template.name} - ${studentLabel || 'Student'} (PREVIEW)`}
        orientation={template.orientation === 'VERTICAL' ? 'VERTICAL' : 'HORIZONTAL'}
        student={student}
        schoolId={schoolId}
        restrictedPreview
        allowPreviewExport={allowExport}
        onClose={onClose}
        previewNavigation={
          hasMultiple || onEdit
            ? {
                currentIndex,
                total,
                studentLabel: studentLabel || 'Student',
                onPrevious: () => goTo(currentIndex - 1),
                onNext: () => goTo(currentIndex + 1),
                onEdit: canEdit ? onEdit : undefined,
              }
            : undefined
        }
      />
    </div>
  );
}
