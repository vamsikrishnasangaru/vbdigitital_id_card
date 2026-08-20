import api from '@/lib/api';
import { offlineStore } from '@/lib/offline-store';
import { fetchClassesPicker } from '@/lib/classes-query';
import { fetchAllStudents } from '@/lib/students-query';
import { warmOfflineMediaFromClient } from '@/lib/offline-ready-verify';

type SchoolRow = { id: string; name?: string; code?: string };

/**
 * Prefetch students + templates + classes for every known school so Super Admin
 * can switch schools offline without empty lists.
 */
export async function warmAllSchoolsDirectoryData(): Promise<number> {
  if (typeof window === 'undefined' || !navigator.onLine) return 0;

  let schools = (offlineStore.getSchools() || []) as SchoolRow[];
  if (schools.length === 0) {
    try {
      const { data } = await api.get('/schools', { params: { limit: 100 } });
      const list = (data?.data || data || []) as SchoolRow[];
      if (Array.isArray(list) && list.length) {
        offlineStore.cacheSchools(list);
        schools = list;
      }
    } catch {
      return 0;
    }
  }

  let warmed = 0;
  const queue = [...schools];
  const workers = Array.from({ length: Math.min(3, queue.length) }, async () => {
    while (queue.length > 0) {
      const school = queue.shift();
      if (!school?.id) continue;
      try {
        const [, { data: templatesRes }] = await Promise.all([
          fetchAllStudents({ schoolId: school.id }),
          api.get('/templates', { params: { schoolId: school.id } }),
        ]);

        const templates = Array.isArray(templatesRes)
          ? templatesRes
          : Array.isArray(templatesRes?.data)
            ? templatesRes.data
            : [];
        if (templates.length) offlineStore.cacheTemplates(school.id, templates);

        await fetchClassesPicker(school.id).catch(() => undefined);
        warmed += 1;
      } catch {
        // keep going for other schools
      }
    }
  });

  await Promise.all(workers);
  await warmOfflineMediaFromClient().catch(() => 0);
  return warmed;
}
