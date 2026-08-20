/**
 * Offline data layer — persists students and reference data in localStorage
 * while mutations are queued in IndexedDB (sync-engine).
 */

import { OFFLINE_STORAGE_KEYS } from './offline-store-keys';
import { offlineClasses } from './offline-classes';
import { offlineTeachers } from './offline-teachers';
import { mirrorOfflineKeyToIndexedDb } from './offline-indexeddb';

export { OFFLINE_STORAGE_KEYS };

export interface OfflineStudentRecord {
  id: string;
  _offline: true;
  _pendingSync: true;
  syncOpId?: string;
  schoolId: string;
  classId: string;
  sectionId: string;
  firstName: string;
  lastName: string;
  rollNumber: string;
  admissionNumber: string;
  parentName: string;
  parentPhone: string;
  address: string;
  bloodGroup?: string | null;
  aadharCard?: string | null;
  penId?: string | null;
  apaarId?: string | null;
  childId?: string | null;
  fatherName?: string | null;
  motherName?: string | null;
  dateOfBirth?: string | null;
  emergencyContact?: string | null;
  transportDetails?: string | null;
  photoUrl?: string | null;
  status: string;
  class?: { id: string; name: string; sortOrder?: number };
  section?: { id: string; name: string; sortOrder?: number };
  createdAt: string;
}

export type OfflineMutationKind =
  | 'create-student'
  | 'update-student-status'
  | 'delete-student'
  | 'generate-id-cards'
  | 'generic';

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

function writeLocal(key: string, value: unknown, options?: { notify?: boolean }) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
    void mirrorOfflineKeyToIndexedDb(key, value);
    if (options?.notify !== false) {
      window.dispatchEvent(new CustomEvent('vb-offline-data-changed'));
    }
  } catch (e) {
    console.warn('offline-store: failed to write', key, e);
  }
}

export function isBrowserOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

/** Chrome DevTools "Offline" often leaves navigator.onLine === true. */
let forcedOffline = false;
let probeInFlight: Promise<void> | null = null;
let lastProbeAt = 0;

function readForcedOfflineFlag(): boolean {
  if (typeof sessionStorage === 'undefined') return false;
  try {
    return sessionStorage.getItem('vb-forced-offline') === '1';
  } catch {
    return false;
  }
}

if (typeof window !== 'undefined') {
  forcedOffline = readForcedOfflineFlag();
  window.addEventListener('vb-connectivity-changed', (e) => {
    const online = (e as CustomEvent<{ online?: boolean }>).detail?.online;
    forcedOffline = online === false;
  });
  window.addEventListener('offline', () => {
    forcedOffline = true;
  });
  window.addEventListener('online', () => {
    clearForcedOffline();
  });
}

/** Clear sticky DevTools/HMR offline flag when the browser reports online. */
export function clearForcedOfflineFlag(): void {
  clearForcedOffline();
}

function clearForcedOffline() {
  forcedOffline = false;
  if (typeof sessionStorage !== 'undefined') {
    try {
      sessionStorage.removeItem('vb-forced-offline');
    } catch {
      // ignore
    }
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('vb-connectivity-changed', { detail: { online: true } }));
  }
}

function maybeProbeConnectivity(): void {
  if (typeof window === 'undefined') return;
  if (!navigator.onLine) return;
  const now = Date.now();
  if (probeInFlight) return;
  if (now - lastProbeAt < 4000) return;
  lastProbeAt = now;
  probeInFlight = fetch(`/__vb-hmr-probe?t=${now}`, {
    cache: 'no-store',
    credentials: 'same-origin',
  })
    .then((res) => {
      // Any non-5xx response means the app server is reachable again.
      if (res.status < 500) clearForcedOffline();
    })
    .catch(() => {
      // keep forced-offline until next successful probe
    })
    .finally(() => {
      probeInFlight = null;
    });
}

/** True when the app should use offline caches/adapters (includes DevTools offline). */
export function isEffectivelyOffline(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (!navigator.onLine) return true;
  if (forcedOffline) {
    maybeProbeConnectivity();
    return true;
  }
  if (readForcedOfflineFlag()) {
    forcedOffline = true;
    maybeProbeConnectivity();
    return true;
  }
  return false;
}

export function createOfflineStudentId(): string {
  return `offline-${crypto.randomUUID()}`;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function getClassesForSchool(schoolId: string): {
  id: string;
  name: string;
  sortOrder?: number;
  sections?: { id: string; name: string; sortOrder?: number }[];
}[] {
  const map = readLocal<Record<string, unknown[]>>(OFFLINE_STORAGE_KEYS.classesBySchool, {});
  return (map[schoolId] as {
    id: string;
    name: string;
    sortOrder?: number;
    sections?: { id: string; name: string; sortOrder?: number }[];
  }[]) || [];
}

function resolveClassSection(
  schoolId: string,
  classId: string,
  sectionId: string,
): { class?: OfflineStudentRecord['class']; section?: OfflineStudentRecord['section'] } {
  const classes = getClassesForSchool(schoolId);
  const cls = classes.find((c) => c.id === classId);
  const section = cls?.sections?.find((s) => s.id === sectionId);
  return {
    class: cls
      ? { id: cls.id, name: cls.name, sortOrder: cls.sortOrder }
      : { id: classId, name: '—' },
    section: section
      ? { id: section.id, name: section.name, sortOrder: section.sortOrder }
      : { id: sectionId, name: '—' },
  };
}

async function formDataToOfflineStudent(
  formData: FormData,
  tempId: string,
  syncOpId?: string,
): Promise<OfflineStudentRecord> {
  const schoolId = String(formData.get('schoolId') || '');
  const classId = String(formData.get('classId') || '');
  const sectionId = String(formData.get('sectionId') || '');
  const rollNumber = String(formData.get('rollNumber') || '').trim();
  const { class: classRef, section: sectionRef } = resolveClassSection(schoolId, classId, sectionId);

  const photo = formData.get('photo');
  let photoUrl: string | undefined;
  if (photo instanceof Blob && photo.size > 0) {
    photoUrl = await blobToDataUrl(photo);
  }

  return {
    id: tempId,
    _offline: true,
    _pendingSync: true,
    syncOpId,
    schoolId,
    classId,
    sectionId,
    firstName: String(formData.get('firstName') || '').trim(),
    lastName: String(formData.get('lastName') || '').trim(),
    rollNumber,
    admissionNumber: rollNumber ? `ADM-${rollNumber}` : `ADM-${Date.now()}`,
    parentName: String(formData.get('parentName') || '').trim(),
    parentPhone: String(formData.get('parentPhone') || '').trim(),
    address: String(formData.get('address') || '').trim(),
    bloodGroup: (formData.get('bloodGroup') as string) || null,
    aadharCard: (formData.get('aadharCard') as string) || null,
    penId: (formData.get('penId') as string) || null,
    apaarId: (formData.get('apaarId') as string) || null,
    childId: (formData.get('childId') as string) || null,
    fatherName: (formData.get('fatherName') as string) || null,
    motherName: (formData.get('motherName') as string) || null,
    dateOfBirth: (formData.get('dateOfBirth') as string) || null,
    emergencyContact: (formData.get('emergencyContact') as string) || null,
    transportDetails: (formData.get('transportDetails') as string) || null,
    photoUrl: photoUrl ?? null,
    status: 'DRAFT',
    class: classRef,
    section: sectionRef,
    createdAt: new Date().toISOString(),
  };
}

function listOfflineStudents(): OfflineStudentRecord[] {
  return readLocal<OfflineStudentRecord[]>(OFFLINE_STORAGE_KEYS.students, []);
}

function saveOfflineStudents(students: OfflineStudentRecord[]) {
  writeLocal(OFFLINE_STORAGE_KEYS.students, students);
}

function listDeletedIds(): string[] {
  return readLocal<string[]>(OFFLINE_STORAGE_KEYS.deletedStudentIds, []);
}

function studentMatchesFilters(
  s: OfflineStudentRecord,
  params?: Record<string, string | number | undefined>,
): boolean {
  if (!params) return true;
  if (params.schoolId && s.schoolId !== params.schoolId) return false;
  if (params.classId && s.classId !== params.classId) return false;
  if (params.sectionId && s.sectionId !== params.sectionId) return false;
  if (params.status && s.status !== params.status) return false;
  if (params.search) {
    const q = String(params.search).toLowerCase();
    const hay = [
      s.firstName,
      s.lastName,
      s.rollNumber,
      s.admissionNumber,
      s.aadharCard,
      s.penId,
      s.apaarId,
      s.childId,
      s.fatherName,
      s.motherName,
      s.parentName,
      s.parentPhone,
    ]
      .join(' ')
      .toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

export const offlineStore = {
  cacheTemplates(schoolId: string, templates: unknown[]) {
    const map = readLocal<Record<string, unknown[]>>(OFFLINE_STORAGE_KEYS.templatesBySchool, {});
    map[schoolId] = templates;
    writeLocal(OFFLINE_STORAGE_KEYS.templatesBySchool, map, { notify: false });
  },

  getTemplates(schoolId: string): unknown[] | null {
    const map = readLocal<Record<string, unknown[]>>(OFFLINE_STORAGE_KEYS.templatesBySchool, {});
    return map[schoolId] ?? null;
  },

  cacheClasses(schoolId: string, classes: unknown[]) {
    const map = readLocal<Record<string, unknown[]>>(OFFLINE_STORAGE_KEYS.classesBySchool, {});
    map[schoolId] = classes;
    writeLocal(OFFLINE_STORAGE_KEYS.classesBySchool, map, { notify: false });
  },

  getClasses(schoolId: string): unknown[] | null {
    const map = readLocal<Record<string, unknown[]>>(OFFLINE_STORAGE_KEYS.classesBySchool, {});
    return map[schoolId] ?? null;
  },

  cacheSchools(schools: unknown[]) {
    writeLocal(OFFLINE_STORAGE_KEYS.schools, schools, { notify: false });
  },

  getSchools(): unknown[] | null {
    return readLocal<unknown[] | null>(OFFLINE_STORAGE_KEYS.schools, null);
  },

  getPendingStudents(params?: Record<string, string | number | undefined>): OfflineStudentRecord[] {
    const deleted = new Set(listDeletedIds());
    return listOfflineStudents().filter(
      (s) => !deleted.has(s.id) && studentMatchesFilters(s, params),
    );
  },

  /** Resolve one student from pending creates, local patches, or a previously cached list. */
  getStudentById(id: string): unknown | null {
    if (!id) return null;
    const deleted = new Set(listDeletedIds());
    if (deleted.has(id)) return null;

    const pending = listOfflineStudents().find((s) => s.id === id);
    if (pending) return offlineStore.applyLocalPatches(pending);

    const patches = readLocal<Record<string, Partial<OfflineStudentRecord>>>(
      OFFLINE_STORAGE_KEYS.studentPatches,
      {},
    );
    const patch = patches[id];
    if (patch) return { id, ...patch, _offline: true };

    return null;
  },

  applyLocalPatches<T extends { id: string }>(student: T): T {
    const patches = readLocal<Record<string, Partial<OfflineStudentRecord>>>(
      OFFLINE_STORAGE_KEYS.studentPatches,
      {},
    );
    const patch = patches[student.id];
    return patch ? ({ ...student, ...patch } as T) : student;
  },

  mergeStudentsIntoList<T extends { id: string }>(
    serverList: T[],
    params?: Record<string, string | number | undefined>,
  ): T[] {
    const deleted = new Set(listDeletedIds());
    const serverIds = new Set(serverList.map((s) => s.id));
    const pending = listOfflineStudents()
      .filter((s) => !deleted.has(s.id) && studentMatchesFilters(s, params))
      .filter((s) => !serverIds.has(s.id)) as unknown as T[];
    const visibleServer = serverList
      .filter((s) => !deleted.has(s.id))
      .map((s) => offlineStore.applyLocalPatches(s));
    return [...pending, ...visibleServer];
  },

  async buildOfflineMutationResponse(config: {
    url?: string;
    method?: string;
    data?: unknown;
  }, syncOpId: string): Promise<unknown> {
    const url = config.url || '';
    const method = (config.method || 'get').toLowerCase();

    if (method === 'post' && url.includes('/students') && !url.includes('/bulk')) {
      const formData = config.data instanceof FormData ? config.data : null;
      if (!formData) return { _offline: true, id: createOfflineStudentId() };
      const tempId = createOfflineStudentId();
      const student = await formDataToOfflineStudent(formData, tempId, syncOpId);
      const list = listOfflineStudents();
      list.unshift(student);
      saveOfflineStudents(list);
      return student;
    }

    if (method === 'put' && url.match(/\/students\/[^/]+$/) && !url.includes('/status')) {
      const id = url.split('/students/')[1]?.split('?')[0];
      if (id) {
        const formData = config.data instanceof FormData ? config.data : null;
        const patch: Partial<OfflineStudentRecord> = {};
        if (formData) {
          const firstName = formData.get('firstName');
          const lastName = formData.get('lastName');
          const rollNumber = formData.get('rollNumber');
          const parentPhone = formData.get('parentPhone');
          const classId = formData.get('classId');
          const sectionId = formData.get('sectionId');
          if (typeof firstName === 'string') patch.firstName = firstName.trim();
          if (typeof lastName === 'string') patch.lastName = lastName.trim();
          if (typeof rollNumber === 'string') patch.rollNumber = rollNumber.trim();
          if (typeof parentPhone === 'string') patch.parentPhone = parentPhone.trim();
          if (typeof classId === 'string') patch.classId = classId.trim();
          if (typeof sectionId === 'string') patch.sectionId = sectionId.trim();
          const photo = formData.get('photo');
          if (photo instanceof Blob && photo.size > 0) {
            patch.photoUrl = await blobToDataUrl(photo);
          }
        } else if (typeof config.data === 'object' && config.data) {
          Object.assign(patch, config.data);
        }
        offlineStore.patchStudentLocal(id, patch);
      }
      return { _offline: true, id };
    }

    if (method === 'put' && url.match(/\/students\/[^/]+\/status/)) {
      const id = url.split('/students/')[1]?.split('/')[0];
      const body =
        typeof config.data === 'string'
          ? safeParse<{ status?: string }>(config.data, {})
          : (config.data as { status?: string }) || {};
      if (id && body.status) {
        offlineStore.patchStudentLocal(id, { status: body.status });
      }
      return { _offline: true, id, status: body.status };
    }

    if (method === 'delete' && url.includes('/students/')) {
      const id = url.split('/students/')[1]?.split('?')[0];
      if (id) offlineStore.removeStudentLocal(id);
      return { _offline: true, id };
    }

    if (method === 'post' && url.includes('/id-cards/generate')) {
      return {
        _offline: true,
        message: 'ID card generation queued — will run when you are back online',
        successCount: 0,
        failCount: 0,
        results: [],
      };
    }

    const classResult = await offlineClasses.handleOfflineMutation(config, syncOpId);
    if (classResult !== null) return classResult;

    const teacherResult = await offlineTeachers.handleOfflineMutation(config, syncOpId);
    if (teacherResult !== null) return teacherResult;

    return { _offline: true, id: 'temp-' + Date.now(), syncOpId };
  },

  patchStudentLocal(id: string, patch: Partial<OfflineStudentRecord>) {
    const list = listOfflineStudents();
    const idx = list.findIndex((s) => s.id === id);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...patch };
      saveOfflineStudents(list);
      return;
    }
    const patches = readLocal<Record<string, Partial<OfflineStudentRecord>>>(
      OFFLINE_STORAGE_KEYS.studentPatches,
      {},
    );
    patches[id] = { ...patches[id], ...patch };
    writeLocal(OFFLINE_STORAGE_KEYS.studentPatches, patches);
  },

  removeStudentLocal(id: string) {
    const offline = listOfflineStudents();
    if (offline.some((s) => s.id === id)) {
      saveOfflineStudents(offline.filter((s) => s.id !== id));
      return;
    }
    const deleted = listDeletedIds();
    if (!deleted.includes(id)) {
      deleted.push(id);
      writeLocal(OFFLINE_STORAGE_KEYS.deletedStudentIds, deleted);
    }
  },

  onSyncSuccess(
    op: { id: string; url: string; method: string; data?: unknown },
    responseData: unknown,
  ) {
    const url = op.url || '';
    const method = op.method.toLowerCase();

    if (method === 'post' && url.includes('/students') && responseData && typeof responseData === 'object') {
      const list = listOfflineStudents();
      const matchIdx = list.findIndex((s) => s.syncOpId === op.id);
      if (matchIdx >= 0) {
        list.splice(matchIdx, 1);
        saveOfflineStudents(list);
      }
      return;
    }

    if (method === 'delete' && url.includes('/students/')) {
      const id = url.split('/students/')[1]?.split('?')[0];
      if (id) {
        const deleted = listDeletedIds().filter((x) => x !== id);
        writeLocal(OFFLINE_STORAGE_KEYS.deletedStudentIds, deleted);
      }
    }

    offlineClasses.onSyncSuccess(op);
    offlineTeachers.onSyncSuccess(op);
  },

  clearSyncedStudents() {
    saveOfflineStudents([]);
    writeLocal(OFFLINE_STORAGE_KEYS.deletedStudentIds, []);
    writeLocal(OFFLINE_STORAGE_KEYS.studentPatches, {});
  },

  getPendingStudentCount(): number {
    return listOfflineStudents().length;
  },

  getPendingClassStructureCount(): number {
    return offlineClasses.getPendingStructureCount();
  },

  getPendingTeacherCount(): number {
    return offlineTeachers.getPendingCount();
  },
};
