/** Mock student record for template preview mode (placeholders). */
export const DESIGNER_MOCK_STUDENT: Record<string, unknown> = {
  firstName: 'Rahul',
  lastName: 'Sharma',
  admissionNumber: 'ADM-2026-1042',
  rollNumber: '42',
  dateOfBirth: '2012-05-15',
  bloodGroup: 'B+',
  aadharCard: '1234 5678 9012',
  penId: 'PEN-1234567890',
  apaarId: 'APAAR-9876543210',
  parentName: 'Priya Sharma',
  parentPhone: '+91 98765 43210',
  address: '12 MG Road, Bengaluru, Karnataka',
  rfid: 'RFID-9A2F88',
  class: { name: 'Class 10' },
  section: { name: 'A' },
  school: { name: 'Demo Public School' },
};

export const STUDENT_FIELD_CATALOG: {
  label: string;
  fieldType: string;
  placeholder: string;
}[] = [
  { label: 'Student Name', fieldType: 'fullName', placeholder: '{{student_name}}' },
  { label: 'Admission Number', fieldType: 'admissionNo', placeholder: '{{admission_no}}' },
  { label: 'Roll Number', fieldType: 'rollNo', placeholder: '{{roll_number}}' },
  { label: 'Class & Section', fieldType: 'classSection', placeholder: '{{class_section}}' },
  { label: 'Blood Group', fieldType: 'bloodGroup', placeholder: '{{blood_group}}' },
  { label: 'Aadhar Card', fieldType: 'aadharCard', placeholder: '{{aadhar_card}}' },
  { label: 'PEN ID', fieldType: 'penId', placeholder: '{{pen_id}}' },
  { label: 'APAAR ID', fieldType: 'apaarId', placeholder: '{{apaar_id}}' },
  { label: 'Parent Name', fieldType: 'parentName', placeholder: '{{parent_name}}' },
  { label: 'Parent Phone', fieldType: 'parentPhone', placeholder: '{{parent_phone}}' },
  { label: 'Address', fieldType: 'address', placeholder: '{{address}}' },
  { label: 'Date of Birth', fieldType: 'dob', placeholder: '{{dob}}' },
  { label: 'RFID', fieldType: 'rfid', placeholder: '{{rfid}}' },
];
