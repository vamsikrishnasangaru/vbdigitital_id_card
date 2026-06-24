'use client';

import type { Dispatch, SetStateAction } from 'react';
import {
  sanitizeIndianMobileInput,
  sanitizeChildIdInput,
  sanitizeAadharInput,
  sanitizeDobDdMmYyyyInput,
  isPlaceholderSectionName,
} from '@/lib/utils';
import {
  type EnrollFormFieldKey,
  type EnrollFormLayout,
  enrollFieldLabel,
  isEnrollFieldRequired,
} from '@/lib/student-enroll-layout';

export type StudentEnrollFormState = {
  schoolId: string;
  admissionNumber: string;
  classId: string;
  sectionId: string;
  firstName: string;
  lastName: string;
  rollNumber: string;
  childId: string;
  fatherName: string;
  motherName: string;
  parentName: string;
  parentPhone: string;
  address: string;
  aadharCard: string;
  penId: string;
  apaarId: string;
  bloodGroup: string;
  dateOfBirth: string;
  emergencyContact: string;
  transportDetails: string;
};

const inputClass =
  'w-full px-5 py-4 bg-card border border-border rounded-2xl text-sm font-bold focus:ring-4 focus:ring-primary/10 outline-none transition-all shadow-sm';
const labelClass =
  'text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-1';

type Props = {
  form: StudentEnrollFormState;
  setForm: Dispatch<SetStateAction<StudentEnrollFormState>>;
  layout: EnrollFormLayout;
  enrollClasses: { id: string; name: string; sections?: { id: string; name: string }[] }[];
  enrollClassesLoading: boolean;
  sections: { id: string; name: string }[];
  setSections: Dispatch<SetStateAction<{ id: string; name: string }[]>>;
};

function FieldLabel({
  fieldKey,
  primary,
}: {
  fieldKey: EnrollFormFieldKey;
  primary: boolean;
}) {
  const required = isEnrollFieldRequired(fieldKey);
  return (
    <label className={labelClass}>
      {enrollFieldLabel(fieldKey)}{' '}
      {required ? (
        <span className="text-red-500">*</span>
      ) : primary ? null : (
        <span className="normal-case font-bold text-muted-foreground/70">(optional)</span>
      )}
    </label>
  );
}

function EnrollField({
  fieldKey,
  primary,
  form,
  setForm,
  enrollClasses,
  enrollClassesLoading,
  sections,
  setSections,
}: {
  fieldKey: EnrollFormFieldKey;
  primary: boolean;
} & Props) {
  const spanClass = fieldKey === 'address' ? 'md:col-span-2 space-y-2' : 'space-y-2';

  switch (fieldKey) {
    case 'class':
      return (
        <div className={spanClass}>
          <FieldLabel fieldKey={fieldKey} primary={primary} />
          <select
            value={form.classId}
            onChange={(e) => {
              const cid = e.target.value;
              setForm({ ...form, classId: cid, sectionId: '' });
              const cls = enrollClasses.find((c) => c.id === cid);
              setSections(
                (cls?.sections || []).filter(
                  (s) => !isPlaceholderSectionName(s.name),
                ),
              );
            }}
            className={inputClass}
          >
            <option value="">
              {enrollClassesLoading ? 'Loading classes…' : 'Select class'}
            </option>
            {enrollClasses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      );
    case 'section':
      return (
        <div className={spanClass}>
          <FieldLabel fieldKey={fieldKey} primary={primary} />
          <select
            value={form.sectionId}
            onChange={(e) => setForm({ ...form, sectionId: e.target.value })}
            disabled={!form.classId}
            className={`${inputClass} disabled:opacity-50`}
          >
            <option value="">No section</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      );
    case 'firstName':
      return (
        <div className={spanClass}>
          <FieldLabel fieldKey={fieldKey} primary={primary} />
          <input
            value={form.firstName}
            onChange={(e) => setForm({ ...form, firstName: e.target.value })}
            required
            className={inputClass}
            placeholder="e.g. Tamiri"
          />
        </div>
      );
    case 'lastName':
      return (
        <div className={spanClass}>
          <FieldLabel fieldKey={fieldKey} primary={primary} />
          <input
            value={form.lastName}
            onChange={(e) => setForm({ ...form, lastName: e.target.value })}
            className={inputClass}
            placeholder="e.g. Kumari"
          />
        </div>
      );
    case 'rollNumber':
      return (
        <div className={spanClass}>
          <FieldLabel fieldKey={fieldKey} primary={primary} />
          <input
            value={form.rollNumber}
            onChange={(e) => setForm({ ...form, rollNumber: e.target.value })}
            className={`${inputClass} font-mono`}
            placeholder="e.g. 12"
          />
        </div>
      );
    case 'childId':
      return (
        <div className={spanClass}>
          <FieldLabel fieldKey={fieldKey} primary={primary} />
          <input
            value={form.childId}
            onChange={(e) =>
              setForm({ ...form, childId: sanitizeChildIdInput(e.target.value) })
            }
            inputMode="numeric"
            maxLength={12}
            className={`${inputClass} font-mono`}
            placeholder="Up to 12 digits"
          />
        </div>
      );
    case 'fatherName':
      return (
        <div className={spanClass}>
          <FieldLabel fieldKey={fieldKey} primary={primary} />
          <input
            value={form.fatherName}
            onChange={(e) => setForm({ ...form, fatherName: e.target.value })}
            className={inputClass}
            placeholder="Father's full name"
          />
        </div>
      );
    case 'motherName':
      return (
        <div className={spanClass}>
          <FieldLabel fieldKey={fieldKey} primary={primary} />
          <input
            value={form.motherName}
            onChange={(e) => setForm({ ...form, motherName: e.target.value })}
            className={inputClass}
            placeholder="Mother's full name"
          />
        </div>
      );
    case 'parentName':
      return (
        <div className={spanClass}>
          <FieldLabel fieldKey={fieldKey} primary={primary} />
          <input
            value={form.parentName}
            onChange={(e) => setForm({ ...form, parentName: e.target.value })}
            className={inputClass}
            placeholder="Full name"
          />
        </div>
      );
    case 'parentPhone':
      return (
        <div className={spanClass}>
          <FieldLabel fieldKey={fieldKey} primary={primary} />
          <input
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            maxLength={10}
            pattern="\d{10}"
            value={form.parentPhone}
            onChange={(e) =>
              setForm({ ...form, parentPhone: sanitizeIndianMobileInput(e.target.value) })
            }
            required
            className={`${inputClass} font-mono tracking-wide`}
            placeholder="10-digit mobile"
          />
          {primary && (
            <p className="text-[10px] text-muted-foreground ml-1">
              Numbers only · exactly 10 digits
            </p>
          )}
        </div>
      );
    case 'address':
      return (
        <div className={spanClass}>
          <FieldLabel fieldKey={fieldKey} primary={primary} />
          <textarea
            rows={3}
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            className={`${inputClass} resize-none`}
            placeholder="Street, area, city, state, PIN..."
          />
        </div>
      );
    case 'aadharCard':
      return (
        <div className={spanClass}>
          <FieldLabel fieldKey={fieldKey} primary={primary} />
          <input
            value={form.aadharCard}
            onChange={(e) =>
              setForm({ ...form, aadharCard: sanitizeAadharInput(e.target.value) })
            }
            inputMode="numeric"
            maxLength={14}
            className={`${inputClass} font-mono`}
            placeholder="1234 5678 9012"
          />
        </div>
      );
    case 'penId':
      return (
        <div className={spanClass}>
          <FieldLabel fieldKey={fieldKey} primary={primary} />
          <input
            value={form.penId}
            onChange={(e) => setForm({ ...form, penId: e.target.value })}
            className={`${inputClass} font-mono`}
            placeholder="Permanent Education Number"
          />
        </div>
      );
    case 'apaarId':
      return (
        <div className={spanClass}>
          <FieldLabel fieldKey={fieldKey} primary={primary} />
          <input
            value={form.apaarId}
            onChange={(e) => setForm({ ...form, apaarId: e.target.value })}
            className={`${inputClass} font-mono`}
            placeholder="APAAR ID"
          />
        </div>
      );
    case 'bloodGroup':
      return (
        <div className={spanClass}>
          <FieldLabel fieldKey={fieldKey} primary={primary} />
          <input
            value={form.bloodGroup}
            onChange={(e) => setForm({ ...form, bloodGroup: e.target.value })}
            className={inputClass}
            placeholder="e.g. O+"
          />
        </div>
      );
    case 'dateOfBirth':
      return (
        <div className={spanClass}>
          <FieldLabel fieldKey={fieldKey} primary={primary} />
          <input
            type="text"
            inputMode="numeric"
            value={form.dateOfBirth}
            onChange={(e) =>
              setForm({ ...form, dateOfBirth: sanitizeDobDdMmYyyyInput(e.target.value) })
            }
            maxLength={10}
            className={`${inputClass} font-mono`}
            placeholder="dd/mm/yyyy"
          />
        </div>
      );
    case 'emergencyContact':
      return (
        <div className={spanClass}>
          <FieldLabel fieldKey={fieldKey} primary={primary} />
          <input
            type="tel"
            value={form.emergencyContact}
            onChange={(e) => setForm({ ...form, emergencyContact: e.target.value })}
            className={inputClass}
            placeholder="Alternate phone"
          />
        </div>
      );
    case 'transportDetails':
      return (
        <div className={spanClass}>
          <FieldLabel fieldKey={fieldKey} primary={primary} />
          <input
            value={form.transportDetails}
            onChange={(e) => setForm({ ...form, transportDetails: e.target.value })}
            className={inputClass}
            placeholder="Bus route, pickup point..."
          />
        </div>
      );
    default:
      return null;
  }
}

export function StudentEnrollFormFields(props: Props) {
  const { layout } = props;

  return (
    <>
      {layout.templateFieldTypes.length > 0 && (
        <div className="md:col-span-2 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">
            Template fields
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Class & name first, then parent details, then other fields from your ID card
            template. Remaining fields are optional.
          </p>
        </div>
      )}

      {layout.primaryFields.map((fieldKey) => (
        <EnrollField key={`primary-${fieldKey}`} fieldKey={fieldKey} primary {...props} />
      ))}

      {layout.optionalFields.length > 0 && (
        <div className="md:col-span-2 pt-2 border-t border-border">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-4">
            Optional details
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {layout.optionalFields.map((fieldKey) => (
              <EnrollField
                key={`optional-${fieldKey}`}
                fieldKey={fieldKey}
                primary={false}
                {...props}
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
