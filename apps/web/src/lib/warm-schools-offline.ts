import api from '@/lib/api';
import { offlineStore } from '@/lib/offline-store';
import { fetchClassesPicker } from '@/lib/classes-query';
import { fetchAllStudents } from '@/lib/students-query';
import { warmOfflineMediaFromClient } from '@/lib/offline-ready-verify';
import { collectPhotoUrlsFromStudentCaches } from '@/lib/offline-students-cache';
import { resolveMediaUrl } from '@/lib/utils';

type SchoolRow = { id: string; name?: string; code?: string };

function photoUrlsFromStudents(rows: unknown[]): string[] {
  const urls: string[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const s = row as Record<string, unknown>;
    for (const field of ['photoUrl', 'originalPhotoUrl'] as const) {
      const raw = s[field];
      if (typeof raw !== 'string' || !raw || raw.startsWith('data:')) continue;
      const resolved = resolveMediaUrl(raw);
      if (resolved) urls.push(resolved);
    }
  }
  return urls;
}

function postWarmToServiceWorker(urls: string[]) {
  if (!urls.length || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  const send = (worker: ServiceWorker | null | undefined) => {
    worker?.postMessage({ type: 'WARM_ASSETS', urls });
  };
  send(navigator.serviceWorker.controller);
  void navigator.serviceWorker.ready
    .then((reg) => send(reg.active || reg.waiting || reg.installing))
    .catch(() => undefined);
}

/**
 * Prefetch students + templates + classes + student photos for every known school
 * so Super Admin can switch schools offline with faces visible.
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
  const allPhotoUrls = new Set<string>();
  const queue = [...schools];
  const workers = Array.from({ length: Math.min(3, queue.length) }, async () => {
    while (queue.length > 0) {
      const school = queue.shift();
      if (!school?.id) continue;
      try {
        const [studentsRes, { data: templatesRes }] = await Promise.all([
          fetchAllStudents({ schoolId: school.id }),
          api.get('/templates', { params: { schoolId: school.id } }),
        ]);

        const students = Array.isArray(studentsRes?.data) ? studentsRes.data : [];
        photoUrlsFromStudents(students).forEach((u) => allPhotoUrls.add(u));

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

  collectPhotoUrlsFromStudentCaches().forEach((u) => {
    const resolved = resolveMediaUrl(u);
    if (resolved) allPhotoUrls.add(resolved);
  });

  const photoList = [...allPhotoUrls];
  postWarmToServiceWorker(photoList);
  await warmOfflineMediaFromClient(photoList).catch(() => 0);
  return warmed;
}
