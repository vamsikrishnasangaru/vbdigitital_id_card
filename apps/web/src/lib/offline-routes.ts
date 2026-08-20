export type AppRole = 'SUPER_ADMIN' | 'SCHOOL_ADMIN' | 'TEACHER';

/** Pages that stay usable without a network connection. */
const OFFLINE_ALLOWED: Record<AppRole, readonly string[]> = {
  SUPER_ADMIN: ['/dashboard', '/schools', '/students'],
  SCHOOL_ADMIN: ['/dashboard', '/teachers', '/students'],
  TEACHER: ['/dashboard', '/students'],
};

export function isOfflineAllowedPath(role: string | undefined, pathname: string): boolean {
  if (!role) return pathname === '/dashboard';
  const allowed = OFFLINE_ALLOWED[role as AppRole] ?? ['/dashboard'];
  return allowed.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export function getOfflineAllowedPaths(role: string | undefined): readonly string[] {
  if (!role) return ['/dashboard'];
  return OFFLINE_ALLOWED[role as AppRole] ?? ['/dashboard'];
}
