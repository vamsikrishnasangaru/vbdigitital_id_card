/** Shared React Query keys — keep pickers on one cache entry. */
export const queryKeys = {
  schools: {
    all: ['schools'] as const,
    /** Super-admin school pickers (limit 100, shared across pages). */
    picker: ['schools', 'picker'] as const,
    /** Schools admin list with optional search. */
    adminList: (search: string) => ['schools', 'admin', search] as const,
  },
};
