/**
 * Offline GET fallbacks — entity-specific logic after generic GET cache miss.
 */

import type { InternalAxiosRequestConfig } from 'axios';
import { offlineGetCache } from './offline-get-cache';

export async function resolveOfflineGet(
  config: InternalAxiosRequestConfig,
): Promise<{ data: unknown; status: number; config: InternalAxiosRequestConfig } | null> {
  const url = config.url || '';
  const params = config.params as Record<string, string | number | undefined> | undefined;

  const cached = offlineGetCache.get(url, params);
  if (cached !== null) {
    return { data: cached, status: 200, config };
  }

  const { offlineStore } = await import('./offline-store');
  const { offlineClasses } = await import('./offline-classes');
  const { offlineTeachers } = await import('./offline-teachers');

  if (url.includes('/templates')) {
    const schoolId = params?.schoolId as string | undefined;
    const fromEntity = schoolId ? offlineStore.getTemplates(schoolId) : null;
    const fromGeneric = offlineGetCache.getTemplatesList(schoolId ?? undefined);
    const hit = fromEntity ?? fromGeneric;
    if (hit) return { data: hit, status: 200, config };
  }

  if (url.includes('/classes/school/')) {
    const path = url.split('/classes/school/')[1]?.split('?')[0] || '';
    const isPicker = path.endsWith('/picker');
    const schoolId = path.replace(/\/picker$/, '');
    if (schoolId) {
      const hit = isPicker
        ? offlineClasses.getClassesPicker(schoolId)
        : offlineClasses.getClassesForSchool(schoolId) ?? offlineStore.getClasses(schoolId);
      if (hit) return { data: hit, status: 200, config };
    }
  }

  if (url.includes('/classes/teachers/')) {
    const schoolId = url.split('/classes/teachers/')[1]?.split('?')[0];
    if (schoolId) {
      const hit = offlineClasses.getAssignments(schoolId);
      if (hit) return { data: hit, status: 200, config };
    }
  }

  if ((url === '/teachers' || url.startsWith('/teachers')) && !url.includes('/teachers/me')) {
    const schoolId = params?.schoolId as string | undefined;
    if (schoolId) {
      const hit = offlineTeachers.getTeachersResponse(schoolId, params);
      if (hit) return { data: hit, status: 200, config };
    }
  }

  if (url === '/schools' || url.startsWith('/schools')) {
    const hit = offlineStore.getSchools();
    if (hit) {
      return {
        data: { data: hit, meta: { total: hit.length } },
        status: 200,
        config,
      };
    }
  }

  if (url === '/students' || (url.startsWith('/students') && !url.match(/\/students\/[^/]+/))) {
    const schoolId = params?.schoolId as string | undefined;
    const pending = offlineStore.getPendingStudents(params);
    const cachedList = schoolId
      ? (offlineGetCache.get('/students', params) as { data?: unknown[]; total?: number } | null)
      : null;
    const serverList = Array.isArray(cachedList?.data) ? cachedList!.data : [];
    const merged = offlineStore.mergeStudentsIntoList(
      serverList as { id: string }[],
      params,
    );
    if (merged.length > 0 || cachedList) {
      return {
        data: {
          data: merged,
          total: cachedList?.total ?? merged.length,
          _offline: true,
        },
        status: 200,
        config,
      };
    }
    if (pending.length > 0) {
      return {
        data: { data: pending, total: pending.length, _offline: true },
        status: 200,
        config,
      };
    }
  }

  if (url.includes('/id-cards/drive-status')) {
    const cached = offlineGetCache.get(url, params);
    if (cached) return { data: cached, status: 200, config };
    return {
      data: { configured: false, canUpload: false },
      status: 200,
      config,
    };
  }

  if (url.includes('/auth/profile')) {
    const cached = offlineGetCache.get(url, params);
    if (cached) return { data: cached, status: 200, config };
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem('user');
      if (raw) {
        try {
          const user = JSON.parse(raw) as Record<string, unknown>;
          return {
            data: {
              ...user,
              phone: user.phone ?? null,
              avatarUrl: user.avatarUrl ?? null,
              isActive: true,
              createdAt: user.createdAt ?? new Date().toISOString(),
            },
            status: 200,
            config,
          };
        } catch {
          /* ignore */
        }
      }
    }
  }

  if (url.includes('/analytics/')) {
    const analyticsCached = offlineGetCache.get(url, params);
    if (analyticsCached) return { data: analyticsCached, status: 200, config };
  }

  if (url.includes('/orders') || url.includes('/print') || url.includes('/deliveries') || url.includes('/notifications')) {
    const listCached = offlineGetCache.get(url, params);
    if (listCached) return { data: listCached, status: 200, config };
    if (url.includes('/notifications')) {
      return { data: { data: [] }, status: 200, config };
    }
    return { data: { data: [], meta: { total: 0 } }, status: 200, config };
  }

  if (url.includes('/teachers/me/assignments')) {
    const hit = offlineGetCache.get(url, params);
    if (hit) return { data: hit, status: 200, config };
  }

  return null;
}
