/** Shared localStorage keys for offline persistence. */
export const OFFLINE_STORAGE_KEYS = {
  students: 'vb_offline_students',
  deletedStudentIds: 'vb_offline_deleted_students',
  studentPatches: 'vb_offline_student_patches',
  templatesBySchool: 'vb_offline_templates_by_school',
  classesBySchool: 'vb_offline_classes_by_school',
  classesPickerBySchool: 'vb_offline_classes_picker_by_school',
  deletedClassIds: 'vb_offline_deleted_classes',
  deletedSectionIds: 'vb_offline_deleted_sections',
  deletedAssignmentIds: 'vb_offline_deleted_assignments',
  assignmentsBySchool: 'vb_offline_assignments_by_school',
  teachersBySchool: 'vb_offline_teachers_by_school',
  teachersFullBySchool: 'vb_offline_teachers_full_by_school',
  pendingTeachers: 'vb_offline_pending_teachers',
  deletedTeacherIds: 'vb_offline_deleted_teachers',
  teacherPatches: 'vb_offline_teacher_patches',
  schools: 'vb_offline_schools',
} as const;
