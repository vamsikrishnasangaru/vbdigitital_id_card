/**
 * Offline GET fallbacks — entity-specific logic after generic GET cache miss.
 */

import type { InternalAxiosRequestConfig } from 'axios';
import { offlineGetCache } from './offline-get-cache';

function apiPath(url: string): string {
  let path = url || '';
  try {
    if (path.startsWith('http')) path = new URL(path).pathname;
  } catch {
    /* keep */
  }
  path = path.replace(/^\/api\/v\d+/, '');
  path = path.split('?')[0] || '';
  return path.startsWith('/') ? path : `/${path}`;
}

function ok(
  config: InternalAxiosRequestConfig,
  data: unknown,
): { data: unknown; status: number; config: InternalAxiosRequestConfig } {
  return { data, status: 200, config };
}

export async function resolveOfflineGet(
  config: InternalAxiosRequestConfig,
): Promise<{ data: unknown; status: number; config: InternalAxiosRequestConfig } | null> {
  const url = apiPath(config.url || '');
  const params = config.params as Record<string, string | number | undefined> | undefined;

  const cached =
    offlineGetCache.get(url, params) ??
    offlineGetCache.get(config.url || '', params);
  if (cached !== null) {
    return ok(config, cached);
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
        : (offlineClasses.getClassesForSchool(schoolId) ?? offlineStore.getClasses(schoolId));
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
      if (hit) return ok(config, hit);
    }
    return ok(config, { data: [], meta: { total: 0 }, _offline: true });
  }

  if (url === '/schools' || url.startsWith('/schools')) {
    const hit = offlineStore.getSchools() ?? [];
    return ok(config, { data: hit, meta: { total: hit.length }, _offline: true });
  }

  if (url === '/students' || (url.startsWith('/students') && !url.match(/\/students\/[^/]+/))) {
    const pending = offlineStore.getPendingStudents(params);
    let cachedList =
      (offlineGetCache.get('/students', params) as { data?: unknown[]; total?: number } | null) ??
      null;

    /** Exact query-key miss — still try a school-scoped list so filters work offline. */
    if (!cachedList && params?.schoolId) {
      cachedList =
        (offlineGetCache.get('/students', {
          schoolId: params.schoolId,
          limit: params.limit ?? 100,
        }) as { data?: unknown[]; total?: number } | null) ??
        (offlineGetCache.get('/students', { schoolId: params.schoolId }) as {
          data?: unknown[];
          total?: number;
        } | null);
    }

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
    return ok(config, { data: [], total: 0, _offline: true });
  }

  const studentById = url.match(/^\/students\/([^/?]+)$/);
  if (studentById) {
    const id = studentById[1];
    const fromCache = offlineGetCache.get(url, params);
    if (fromCache) return { data: fromCache, status: 200, config };
    const local = offlineStore.getStudentById(id);
    if (local) return { data: local, status: 200, config };
  }

  if (url === '/site-content' || url.startsWith('/site-content')) {
    const { DEFAULT_SITE_CONTENT } = await import('./site-content');
    return { data: DEFAULT_SITE_CONTENT, status: 200, config };
  }

  if (url.includes('/id-cards/drive-status')) {
    const cached = offlineGetCache.get(url, params);
    if (cached) return { data: cached, status: 200, config };
    return {
      data: { configured: false, canUpload: false, authOk: false },
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
    const analyticsCached = offlineGetCache.get(url, params) ?? offlineGetCache.get(config.url || '', params);
    if (analyticsCached) return ok(config, analyticsCached);
    return ok(config, { _offline: true });
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
