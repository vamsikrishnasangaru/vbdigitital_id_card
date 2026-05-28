/**
 * Offline cache + mutations for teachers (staff list).
 */

import { OFFLINE_STORAGE_KEYS } from './offline-store-keys';

const KEYS = OFFLINE_STORAGE_KEYS;

export interface OfflineTeacherAssignment {
  id: string;
  class: { id: string; name: string };
  section: { id: string; name: string };
  _offline?: true;
}

export interface OfflineTeacherRecord {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  isActive: boolean;
  schoolId: string;
  school?: { name: string };
  teacherAssignments?: OfflineTeacherAssignment[];
  _offline?: true;
  _pendingSync?: true;
  syncOpId?: string;
}

interface TeachersListResponse {
  /**
   * Server responses may contain `_offline: false | undefined` and are not guaranteed
   * to include offline-only fields. We accept them and normalize on write.
   */
  data: Array<OfflineTeacherRecord | (Omit<OfflineTeacherRecord, '_offline' | '_pendingSync'> & { _offline?: boolean })>;
  meta: { total: number; page?: number; limit?: number; totalPages?: number };
  _offline?: boolean;
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function readLocal<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  return safeParse(localStorage.getItem(key), fallback);
}

function writeLocal(key: string, value: unknown) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent('vb-offline-data-changed'));
  } catch (e) {
    console.warn('offline-teachers: write failed', key, e);
  }
}

function parseBody(data: unknown): Record<string, unknown> {
  if (typeof data === 'string') {
    try {
      return JSON.parse(data) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  if (data && typeof data === 'object' && !(data instanceof FormData)) {
    return data as Record<string, unknown>;
  }
  return {};
}

function normalizePath(url: string): string {
  const path = url.split('?')[0] || '';
  return path.startsWith('/') ? path : `/${path}`;
}

function createOfflineTeacherId() {
  return `offline-teacher-${crypto.randomUUID()}`;
}

function createOfflineAssignmentId() {
  return `offline-assign-${crypto.randomUUID()}`;
}

function isOfflineEntityId(id: string) {
  return id.startsWith('offline-');
}

function getClassesMap(): Record<string, { id: string; name: string; sections?: { id: string; name: string }[] }[]> {
  return readLocal(KEYS.classesBySchool, {});
}

function resolveAssignment(
  schoolId: string,
  classId: string,
  sectionId: string,
): OfflineTeacherAssignment | null {
  const classes = getClassesMap()[schoolId] || [];
  const cls = classes.find((c) => c.id === classId);
  const sec = cls?.sections?.find((s) => s.id === sectionId);
  if (!cls || !sec) return null;
  return {
    id: createOfflineAssignmentId(),
    class: { id: cls.id, name: cls.name },
    section: { id: sec.id, name: sec.name },
    _offline: true,
  };
}

function listPendingTeachers(): OfflineTeacherRecord[] {
  return readLocal<OfflineTeacherRecord[]>(KEYS.pendingTeachers, []);
}

function savePendingTeachers(list: OfflineTeacherRecord[]) {
  writeLocal(KEYS.pendingTeachers, list);
}

function listDeletedTeacherIds(): string[] {
  return readLocal<string[]>(KEYS.deletedTeacherIds, []);
}

function getCachedBySchool(): Record<string, OfflineTeacherRecord[]> {
  return readLocal<Record<string, OfflineTeacherRecord[]>>(KEYS.teachersFullBySchool, {});
}

function saveCachedBySchool(map: Record<string, OfflineTeacherRecord[]>) {
  writeLocal(KEYS.teachersFullBySchool, map);
}

function syncMinimalPicker(schoolId: string, teachers: OfflineTeacherRecord[]) {
  const map = readLocal<Record<string, { id: string; firstName: string; lastName: string; email: string; schoolId?: string }[]>>(
    KEYS.teachersBySchool,
    {},
  );
  map[schoolId] = teachers.map((t) => ({
    id: t.id,
    firstName: t.firstName,
    lastName: t.lastName,
    email: t.email,
    schoolId: t.schoolId,
  }));
  writeLocal(KEYS.teachersBySchool, map);
}

function teacherMatchesFilters(
  t: OfflineTeacherRecord,
  params?: Record<string, string | number | undefined>,
): boolean {
  if (!params) return true;
  if (params.schoolId && t.schoolId !== params.schoolId) return false;
  if (params.isActive === 'true' && !t.isActive) return false;
  if (params.isActive === 'false' && t.isActive) return false;
  if (params.search) {
    const q = String(params.search).toLowerCase();
    const hay = [t.firstName, t.lastName, t.email, t.phone].join(' ').toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

export const offlineTeachers = {
  cacheTeachersList(schoolId: string, response: TeachersListResponse) {
    const map = getCachedBySchool();
    const existing = map[schoolId] || [];
    const serverList = (response.data || []).map((t) => ({
      ...(t as OfflineTeacherRecord),
      _offline: t._offline ? true : undefined,
    })) as OfflineTeacherRecord[];
    const serverIds = new Set(serverList.map((t) => t.id));
    const offlineOnly = existing.filter((t) => t._offline && !serverIds.has(t.id));
    const pendingOnly = listPendingTeachers().filter(
      (t) => t.schoolId === schoolId && t._offline && !serverIds.has(t.id) && !offlineOnly.some((o) => o.id === t.id),
    );
    const merged = applyPatches([...pendingOnly, ...offlineOnly, ...serverList]);
    map[schoolId] = merged;
    saveCachedBySchool(map);
    syncMinimalPicker(schoolId, filterDeleted(merged));
  },

  getTeachersResponse(
    schoolId: string,
    params?: Record<string, string | number | undefined>,
  ): TeachersListResponse | null {
    const map = getCachedBySchool();
    const pending = listPendingTeachers().filter(
      (t) => t.schoolId === schoolId && teacherMatchesFilters(t, params),
    );
    const cached = map[schoolId] ? filterDeleted(map[schoolId]) : [];
    const serverIds = new Set(cached.map((t) => t.id));
    const extraPending = pending.filter((t) => !serverIds.has(t.id));
    const merged = applyPatches([...extraPending, ...cached]).filter((t) =>
      teacherMatchesFilters(t, params),
    );
    if (merged.length === 0 && cached.length === 0 && pending.length === 0) return null;
    return {
      data: merged,
      meta: { total: merged.length, page: 1, limit: 100, totalPages: 1 },
      _offline: true,
    };
  },

  mergeTeachersIntoList(
    serverList: OfflineTeacherRecord[],
    schoolId: string,
    params?: Record<string, string | number | undefined>,
  ): OfflineTeacherRecord[] {
    const deleted = new Set(listDeletedTeacherIds());
    const pending = listPendingTeachers().filter(
      (t) => t.schoolId === schoolId && !deleted.has(t.id) && teacherMatchesFilters(t, params),
    );
    const serverIds = new Set(serverList.map((t) => t.id));
    const extra = pending.filter((t) => !serverIds.has(t.id));
    const visible = serverList
      .filter((t) => !deleted.has(t.id))
      .map((t) => applyPatchToTeacher(t));
    return [...extra, ...visible];
  },

  getPendingCount(): number {
    return listPendingTeachers().length;
  },

  async handleOfflineMutation(
    config: { url?: string; method?: string; data?: unknown },
    syncOpId: string,
  ): Promise<unknown | null> {
    const url = normalizePath(config.url || '');
    const method = (config.method || 'get').toLowerCase();
    const body = parseBody(config.data);

    if (method === 'post' && url === '/teachers') {
      const schoolId = String(body.schoolId || '');
      const classId = String(body.classId || '');
      const sectionId = String(body.sectionId || '');
      const teacher: OfflineTeacherRecord = {
        id: createOfflineTeacherId(),
        firstName: String(body.firstName || '').trim(),
        lastName: String(body.lastName || '').trim(),
        email: String(body.email || '').trim(),
        phone: String(body.phone || '').trim(),
        isActive: true,
        schoolId,
        teacherAssignments: [],
        _offline: true,
        _pendingSync: true,
        syncOpId,
      };
      if (classId && sectionId) {
        const assignment = resolveAssignment(schoolId, classId, sectionId);
        if (assignment) teacher.teacherAssignments = [assignment];
      }
      const pending = listPendingTeachers();
      pending.unshift(teacher);
      savePendingTeachers(pending);
      prependToSchoolCache(schoolId, teacher);
      return teacher;
    }

    if (method === 'put' && /^\/teachers\/[^/]+$/.test(url)) {
      const id = url.split('/')[2] || '';
      const patch = buildTeacherPatch(body, id);
      patchTeacherLocal(id, patch);
      return { ...patch, id, _offline: true };
    }

    if (method === 'delete' && /^\/teachers\/[^/]+$/.test(url)) {
      const id = url.split('/')[2] || '';
      removeTeacherLocal(id);
      return { _offline: true, id };
    }

    return null;
  },

  onSyncSuccess(op: { id: string; url: string; method: string }) {
    const url = normalizePath(op.url || '');
    const method = op.method.toLowerCase();

    if (method === 'post' && url === '/teachers') {
      const pending = listPendingTeachers();
      const idx = pending.findIndex((t) => t.syncOpId === op.id);
      if (idx >= 0) {
        pending.splice(idx, 1);
        savePendingTeachers(pending);
      }
    }

    if (method === 'delete' && /^\/teachers\/[^/]+$/.test(url)) {
      const id = url.split('/')[2];
      if (id) {
        const deleted = listDeletedTeacherIds().filter((x) => x !== id);
        writeLocal(KEYS.deletedTeacherIds, deleted);
      }
    }
  },
};

function filterDeleted(teachers: OfflineTeacherRecord[]): OfflineTeacherRecord[] {
  const deleted = new Set(listDeletedTeacherIds());
  return teachers.filter((t) => !deleted.has(t.id));
}

function applyPatches(teachers: OfflineTeacherRecord[]): OfflineTeacherRecord[] {
  return teachers.map(applyPatchToTeacher);
}

function applyPatchToTeacher(teacher: OfflineTeacherRecord): OfflineTeacherRecord {
  const patches = readLocal<Record<string, Partial<OfflineTeacherRecord>>>(KEYS.teacherPatches, {});
  const patch = patches[teacher.id];
  return patch ? ({ ...teacher, ...patch } as OfflineTeacherRecord) : teacher;
}

function prependToSchoolCache(schoolId: string, teacher: OfflineTeacherRecord) {
  const map = getCachedBySchool();
  const list = map[schoolId] ? [teacher, ...map[schoolId].filter((t) => t.id !== teacher.id)] : [teacher];
  map[schoolId] = list;
  saveCachedBySchool(map);
  syncMinimalPicker(schoolId, filterDeleted(list));
}

function buildTeacherPatch(
  body: Record<string, unknown>,
  teacherId: string,
): Partial<OfflineTeacherRecord> {
  const patch: Partial<OfflineTeacherRecord> = {};
  if (body.firstName != null) patch.firstName = String(body.firstName).trim();
  if (body.lastName != null) patch.lastName = String(body.lastName).trim();
  if (body.email != null) patch.email = String(body.email).trim();
  if (body.phone != null) patch.phone = String(body.phone).trim();
  if (typeof body.isActive === 'boolean') patch.isActive = body.isActive;

  const classId = body.classId != null ? String(body.classId) : undefined;
  const sectionId = body.sectionId != null ? String(body.sectionId) : undefined;
  if (classId === '' && sectionId === '') {
    patch.teacherAssignments = [];
  } else if (classId && sectionId) {
    const schoolId = findTeacherSchoolId(teacherId);
    if (schoolId) {
      const assignment = resolveAssignment(schoolId, classId, sectionId);
      if (assignment) patch.teacherAssignments = [assignment];
    }
  }
  return patch;
}

function findTeacherSchoolId(teacherId: string): string | null {
  const pending = listPendingTeachers().find((t) => t.id === teacherId);
  if (pending) return pending.schoolId;
  for (const [schoolId, list] of Object.entries(getCachedBySchool())) {
    if (list.some((t) => t.id === teacherId)) return schoolId;
  }
  return null;
}

function patchTeacherLocal(id: string, patch: Partial<OfflineTeacherRecord>) {
  const pending = listPendingTeachers();
  const idx = pending.findIndex((t) => t.id === id);
  if (idx >= 0) {
    pending[idx] = { ...pending[idx], ...patch };
    savePendingTeachers(pending);
    prependToSchoolCache(pending[idx].schoolId, pending[idx]);
    return;
  }
  const patches = readLocal<Record<string, Partial<OfflineTeacherRecord>>>(KEYS.teacherPatches, {});
  patches[id] = { ...patches[id], ...patch };
  writeLocal(KEYS.teacherPatches, patches);
  const schoolId = findTeacherSchoolId(id);
  if (schoolId) {
    const map = getCachedBySchool();
    if (map[schoolId]) {
      map[schoolId] = map[schoolId].map((t) => (t.id === id ? { ...t, ...patch } : t));
      saveCachedBySchool(map);
    }
  }
}

function removeTeacherLocal(id: string) {
  const pending = listPendingTeachers();
  if (pending.some((t) => t.id === id)) {
    savePendingTeachers(pending.filter((t) => t.id !== id));
    for (const [schoolId, list] of Object.entries(getCachedBySchool())) {
      const next = list.filter((t) => t.id !== id);
      if (next.length !== list.length) {
        const map = getCachedBySchool();
        map[schoolId] = next;
        saveCachedBySchool(map);
        syncMinimalPicker(schoolId, next);
      }
    }
    return;
  }
  const deleted = listDeletedTeacherIds();
  if (!deleted.includes(id)) {
    deleted.push(id);
    writeLocal(KEYS.deletedTeacherIds, deleted);
  }
}
