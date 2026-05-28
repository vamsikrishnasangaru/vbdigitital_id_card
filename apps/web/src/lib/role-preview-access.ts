/** Roles that may preview ID cards but must not export or capture clean copies. */
export function isRestrictedIdCardPreviewRole(role?: string | null): boolean {
  return role === 'SCHOOL_ADMIN' || role === 'TEACHER';
}
