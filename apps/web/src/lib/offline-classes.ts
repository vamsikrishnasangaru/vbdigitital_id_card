/**
 * Offline cache + mutations for classes, sections, and teacher assignments.
 */

import { OFFLINE_STORAGE_KEYS } from './offline-store-keys';

const KEYS = OFFLINE_STORAGE_KEYS;

export interface OfflineSection {
  id: string;
  name: string;
  _count?: { students: number };
  _offline?: true;
  syncOpId?: string;
}

export interface OfflineClass {
  id: string;
  name: string;
  sortOrder: number;
  sections: OfflineSection[];
  _count?: { students: number };
  _offline?: true;
  syncOpId?: string;
}

export interface OfflineTeacherAssignment {
  id: string;
  _offline?: true;
  syncOpId?: string;
  user: { id: string; firstName: string; lastName: string; email: string };
  class: { id: string; name: string };
  section: { id: string; name: string };
}

export interface OfflineTeacherMinimal {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  schoolId?: string;
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
    console.warn('offline-classes: write failed', key, e);
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

function createOfflineClassId() {
  return `offline-class-${crypto.randomUUID()}`;
}

function createOfflineSectionId() {
  return `offline-section-${crypto.randomUUID()}`;
}

function createOfflineAssignmentId() {
  return `offline-assign-${crypto.randomUUID()}`;
}

function isOfflineEntityId(id: string) {
  return id.startsWith('offline-');
}

function getClassesMap(): Record<string, OfflineClass[]> {
  return readLocal<Record<string, OfflineClass[]>>(KEYS.classesBySchool, {});
}

function saveClassesMap(map: Record<string, OfflineClass[]>) {
  writeLocal(KEYS.classesBySchool, map);
}

function getSchoolClasses(schoolId: string): OfflineClass[] {
  const map = getClassesMap();
  return map[schoolId] ? [...map[schoolId]] : [];
}

function setSchoolClasses(schoolId: string, classes: OfflineClass[]) {
  const map = getClassesMap();
  map[schoolId] = classes;
  saveClassesMap(map);
}

function findClassLocation(classId: string): {
  schoolId: string;
  classes: OfflineClass[];
  classIndex: number;
} | null {
  const map = getClassesMap();
  for (const [schoolId, classes] of Object.entries(map)) {
    const classIndex = classes.findIndex((c) => c.id === classId);
    if (classIndex >= 0) return { schoolId, classes: [...classes], classIndex };
  }
  return null;
}

function findSectionLocation(sectionId: string): {
  schoolId: string;
  classes: OfflineClass[];
  classIndex: number;
  sectionIndex: number;
} | null {
  const map = getClassesMap();
  for (const [schoolId, classes] of Object.entries(map)) {
    for (let classIndex = 0; classIndex < classes.length; classIndex++) {
      const sectionIndex = classes[classIndex].sections.findIndex((s) => s.id === sectionId);
      if (sectionIndex >= 0) {
        return { schoolId, classes: [...classes], classIndex, sectionIndex };
      }
    }
  }
  return null;
}

function listDeletedClassIds(): string[] {
  return readLocal<string[]>(KEYS.deletedClassIds, []);
}

function listDeletedSectionIds(): string[] {
  return readLocal<string[]>(KEYS.deletedSectionIds, []);
}

function listDeletedAssignmentIds(): string[] {
  return readLocal<string[]>(KEYS.deletedAssignmentIds, []);
}

function filterDeletedClasses(classes: OfflineClass[]): OfflineClass[] {
  const deletedClasses = new Set(listDeletedClassIds());
  const deletedSections = new Set(listDeletedSectionIds());
  return classes
    .filter((c) => !deletedClasses.has(c.id))
    .map((c) => ({
      ...c,
      sections: c.sections.filter((s) => !deletedSections.has(s.id)),
    }));
}

export const offlineClasses = {
  getClassesForSchool(schoolId: string): OfflineClass[] | null {
    const map = getClassesMap();
    if (!map[schoolId]) return null;
    return filterDeletedClasses(map[schoolId]);
  },

  cacheClasses(schoolId: string, serverClasses: unknown[]) {
    const map = getClassesMap();
    const existing = map[schoolId] || [];
    const serverList = serverClasses as OfflineClass[];
    const serverIds = new Set(serverList.map((c) => c.id));

    const offlineOnlyClasses = existing.filter((c) => c._offline && !serverIds.has(c.id));

    const mergedServer = serverList.map((sc) => {
      const local = existing.find((e) => e.id === sc.id);
      if (!local) return sc;
      const serverSectionIds = new Set(sc.sections.map((s) => s.id));
      const pendingSections = local.sections.filter(
        (s) => s._offline && !serverSectionIds.has(s.id),
      );
      if (pendingSections.length === 0) return sc;
      return { ...sc, sections: [...sc.sections, ...pendingSections] };
    });

    map[schoolId] = [...offlineOnlyClasses, ...mergedServer];
    saveClassesMap(map);
  },

  cacheAssignments(schoolId: string, serverAssignments: unknown[]) {
    const map = readLocal<Record<string, OfflineTeacherAssignment[]>>(
      KEYS.assignmentsBySchool,
      {},
    );
    const existing = map[schoolId] || [];
    const serverList = serverAssignments as OfflineTeacherAssignment[];
    const serverIds = new Set(serverList.map((a) => a.id));
    const offlineOnly = existing.filter((a) => a._offline && !serverIds.has(a.id));
    map[schoolId] = [...serverList, ...offlineOnly];
    writeLocal(KEYS.assignmentsBySchool, map);
  },

  getAssignments(schoolId: string): OfflineTeacherAssignment[] | null {
    const map = readLocal<Record<string, OfflineTeacherAssignment[]>>(
      KEYS.assignmentsBySchool,
      {},
    );
    if (!map[schoolId]) return null;
    const deleted = new Set(listDeletedAssignmentIds());
    return map[schoolId].filter((a) => !deleted.has(a.id));
  },

  cacheTeachers(schoolId: string, teachers: unknown[]) {
    const map = readLocal<Record<string, OfflineTeacherMinimal[]>>(KEYS.teachersBySchool, {});
    map[schoolId] = teachers as OfflineTeacherMinimal[];
    writeLocal(KEYS.teachersBySchool, map);
  },

  getTeachers(schoolId: string): OfflineTeacherMinimal[] | null {
    const map = readLocal<Record<string, OfflineTeacherMinimal[]>>(KEYS.teachersBySchool, {});
    return map[schoolId] ?? null;
  },

  getPendingStructureCount(): number {
    const map = getClassesMap();
    let n = 0;
    for (const classes of Object.values(map)) {
      for (const c of classes) {
        if (c._offline) n += 1;
        n += c.sections.filter((s) => s._offline).length;
      }
    }
    const assigns = readLocal<Record<string, OfflineTeacherAssignment[]>>(
      KEYS.assignmentsBySchool,
      {},
    );
    for (const list of Object.values(assigns)) {
      n += list.filter((a) => a._offline).length;
    }
    return n;
  },

  async handleOfflineMutation(
    config: { url?: string; method?: string; data?: unknown },
    syncOpId: string,
  ): Promise<unknown | null> {
    const url = normalizePath(config.url || '');
    const method = (config.method || 'get').toLowerCase();
    const body = parseBody(config.data);

    if (method === 'post' && url === '/classes') {
      const schoolId = String(body.schoolId || '');
      const name = String(body.name || '').trim();
      if (!schoolId || !name) return { _offline: true, syncOpId };
      const list = getSchoolClasses(schoolId);
      const newClass: OfflineClass = {
        id: createOfflineClassId(),
        name,
        sortOrder: list.length + 1,
        sections: [],
        _count: { students: 0 },
        _offline: true,
        syncOpId,
      };
      list.push(newClass);
      setSchoolClasses(schoolId, list);
      return newClass;
    }

    if (method === 'post' && /^\/classes\/[^/]+\/sections$/.test(url)) {
      const classId = url.split('/')[2] || '';
      const name = String(body.name || '').trim();
      const loc = findClassLocation(classId);
      if (!loc || !name) return { _offline: true, syncOpId };
      const section: OfflineSection = {
        id: createOfflineSectionId(),
        name,
        _count: { students: 0 },
        _offline: true,
        syncOpId,
      };
      loc.classes[loc.classIndex] = {
        ...loc.classes[loc.classIndex],
        sections: [...loc.classes[loc.classIndex].sections, section],
      };
      setSchoolClasses(loc.schoolId, loc.classes);
      return section;
    }

    if (method === 'delete' && url.startsWith('/classes/sections/')) {
      const sectionId = url.split('/')[3] || '';
      if (isOfflineEntityId(sectionId)) {
        const loc = findSectionLocation(sectionId);
        if (loc) {
          loc.classes[loc.classIndex].sections = loc.classes[loc.classIndex].sections.filter(
            (s) => s.id !== sectionId,
          );
          setSchoolClasses(loc.schoolId, loc.classes);
        }
      } else if (sectionId) {
        const deleted = listDeletedSectionIds();
        if (!deleted.includes(sectionId)) {
          deleted.push(sectionId);
          writeLocal(KEYS.deletedSectionIds, deleted);
        }
      }
      return { _offline: true, id: sectionId };
    }

    if (method === 'delete' && /^\/classes\/[^/]+$/.test(url)) {
      const classId = url.split('/')[2] || '';
      if (isOfflineEntityId(classId)) {
        const loc = findClassLocation(classId);
        if (loc) {
          loc.classes.splice(loc.classIndex, 1);
          setSchoolClasses(loc.schoolId, loc.classes);
        }
      } else if (classId) {
        const deleted = listDeletedClassIds();
        if (!deleted.includes(classId)) {
          deleted.push(classId);
          writeLocal(KEYS.deletedClassIds, deleted);
        }
      }
      return { _offline: true, id: classId };
    }

    if (method === 'post' && url === '/classes/assign-teacher') {
      const schoolId = String(body.schoolId || '');
      const userId = String(body.userId || '');
      const classId = String(body.classId || '');
      const sectionId = String(body.sectionId || '');
      const teachers = offlineClasses.getTeachers(schoolId) || [];
      const teacher = teachers.find((t) => t.id === userId);
      const loc = findClassLocation(classId);
      const cls = loc?.classes[loc.classIndex];
      const sec = cls?.sections.find((s) => s.id === sectionId);
      if (!schoolId || !teacher || !cls || !sec) return { _offline: true, syncOpId };

      const map = readLocal<Record<string, OfflineTeacherAssignment[]>>(
        KEYS.assignmentsBySchool,
        {},
      );
      const list = map[schoolId] ? [...map[schoolId]] : [];
      const assignment: OfflineTeacherAssignment = {
        id: createOfflineAssignmentId(),
        _offline: true,
        syncOpId,
        user: {
          id: teacher.id,
          firstName: teacher.firstName,
          lastName: teacher.lastName,
          email: teacher.email,
        },
        class: { id: cls.id, name: cls.name },
        section: { id: sec.id, name: sec.name },
      };
      list.push(assignment);
      map[schoolId] = list;
      writeLocal(KEYS.assignmentsBySchool, map);
      return assignment;
    }

    if (method === 'delete' && url.startsWith('/classes/assignment/')) {
      const assignmentId = url.split('/')[3] || '';
      if (isOfflineEntityId(assignmentId)) {
        const map = readLocal<Record<string, OfflineTeacherAssignment[]>>(
          KEYS.assignmentsBySchool,
          {},
        );
        for (const schoolId of Object.keys(map)) {
          map[schoolId] = map[schoolId].filter((a) => a.id !== assignmentId);
        }
        writeLocal(KEYS.assignmentsBySchool, map);
      } else if (assignmentId) {
        const deleted = listDeletedAssignmentIds();
        if (!deleted.includes(assignmentId)) {
          deleted.push(assignmentId);
          writeLocal(KEYS.deletedAssignmentIds, deleted);
        }
      }
      return { _offline: true, id: assignmentId };
    }

    return null;
  },

  onSyncSuccess(op: { id: string; url: string; method: string }) {
    const url = normalizePath(op.url || '');
    const method = op.method.toLowerCase();

    const clearOfflineBySyncOp = () => {
      const map = getClassesMap();
      let changed = false;
      for (const [schoolId, classes] of Object.entries(map)) {
        const next = classes
          .filter((c) => c.syncOpId !== op.id)
          .map((c) => ({
            ...c,
            sections: c.sections.filter((s) => s.syncOpId !== op.id),
          }));
        if (JSON.stringify(next) !== JSON.stringify(classes)) {
          map[schoolId] = next;
          changed = true;
        }
      }
      if (changed) saveClassesMap(map);

      const assignMap = readLocal<Record<string, OfflineTeacherAssignment[]>>(
        KEYS.assignmentsBySchool,
        {},
      );
      let assignChanged = false;
      for (const schoolId of Object.keys(assignMap)) {
        const filtered = assignMap[schoolId].filter((a) => a.syncOpId !== op.id);
        if (filtered.length !== assignMap[schoolId].length) {
          assignMap[schoolId] = filtered;
          assignChanged = true;
        }
      }
      if (assignChanged) writeLocal(KEYS.assignmentsBySchool, assignMap);
    };

    if (
      method === 'post' &&
      (url === '/classes' || url.includes('/sections') || url === '/classes/assign-teacher')
    ) {
      clearOfflineBySyncOp();
    }

    if (method === 'delete' && url.startsWith('/classes/')) {
      if (url.startsWith('/classes/sections/')) {
        const sectionId = url.split('/')[3];
        if (sectionId) {
          const deleted = listDeletedSectionIds().filter((x) => x !== sectionId);
          writeLocal(KEYS.deletedSectionIds, deleted);
        }
      } else if (url.startsWith('/classes/assignment/')) {
        const assignmentId = url.split('/')[3];
        if (assignmentId) {
          const deleted = listDeletedAssignmentIds().filter((x) => x !== assignmentId);
          writeLocal(KEYS.deletedAssignmentIds, deleted);
        }
      } else {
        const classId = url.split('/')[2];
        if (classId) {
          const deleted = listDeletedClassIds().filter((x) => x !== classId);
          writeLocal(KEYS.deletedClassIds, deleted);
        }
      }
    }
  },
};
