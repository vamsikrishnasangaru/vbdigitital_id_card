'use client';

import { useState, useEffect, useMemo, useDeferredValue } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/auth-store';
import {
  Plus, Trash2, Loader2, BookOpen, ChevronDown,
  Users, GraduationCap, UserPlus, X, Filter, Search,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { StatCard } from '@/components/ui/stat-card';
import { queryKeys } from '@/lib/query-keys';
import { fetchSchoolsPicker } from '@/lib/schools-query';
import { offlineStore } from '@/lib/offline-store';
import { offlineClasses } from '@/lib/offline-classes';
import { useOfflineSync } from '@/hooks/use-offline-sync';

interface Section {
  id: string;
  name: string;
  _count?: { students: number };
  _offline?: boolean;
}

interface ClassItem {
  id: string;
  name: string;
  sortOrder: number;
  sections: Section[];
  _count?: { students: number };
  _offline?: boolean;
}

interface TeacherAssignment {
  id: string;
  _offline?: boolean;
  user: { id: string; firstName: string; lastName: string; email: string };
  class: { id: string; name: string };
  section: { id: string; name: string };
}

interface SchoolOption {
  id: string;
  name: string;
  code: string;
}

interface TeacherOption {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  schoolId?: string;
}

interface StudentMatch {
  id: string;
  firstName: string;
  lastName: string;
  admissionNumber: string;
  classId: string;
  sectionId: string;
  class?: { id: string; name: string };
  section?: { id: string; name: string };
}

const SELECT_OPTION_CLASS = 'bg-popover text-popover-foreground';

export default function ClassesPage() {
  const { user } = useAuthStore();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const [selectedSchoolId, setSelectedSchoolId] = useState('');
  const [schoolSearch, setSchoolSearch] = useState('');
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim());
  const effectiveSchoolId = isSuperAdmin ? selectedSchoolId : (user?.schoolId || '');
  const queryClient = useQueryClient();
  const { isOffline } = useOfflineSync();
  const [expandedClass, setExpandedClass] = useState<string | null>(null);

  const syncClassesCache = (schoolId: string) => {
    const cached = offlineClasses.getClassesForSchool(schoolId);
    if (cached) queryClient.setQueryData(['classes', schoolId], cached);
  };

  const syncAssignmentsCache = (schoolId: string) => {
    const cached = offlineClasses.getAssignments(schoolId);
    if (cached) queryClient.setQueryData(['assignments', schoolId], cached);
  };

  const { data: schools = [] } = useQuery({
    queryKey: queryKeys.schools.picker,
    queryFn: fetchSchoolsPicker,
    enabled: isSuperAdmin,
  });

  useEffect(() => {
    if (!isSuperAdmin || schools.length === 0) return;
    const saved = localStorage.getItem('classes_selected_school_id');
    const valid = saved && schools.some((s) => s.id === saved);
    setSelectedSchoolId(valid ? saved! : schools[0].id);
  }, [isSuperAdmin, schools]);

  useEffect(() => {
    if (isSuperAdmin && selectedSchoolId) {
      localStorage.setItem('classes_selected_school_id', selectedSchoolId);
    }
  }, [isSuperAdmin, selectedSchoolId]);

  useEffect(() => {
    setSearch('');
    setExpandedClass(null);
  }, [effectiveSchoolId]);

  const selectedSchool = schools.find((s) => s.id === effectiveSchoolId);

  const filteredSchools = useMemo(() => {
    const q = schoolSearch.trim().toLowerCase();
    if (!q) return schools;
    return schools.filter(
      (s) => s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q),
    );
  }, [schools, schoolSearch]);

  const { data: studentMatches = [] } = useQuery({
    queryKey: ['students', 'class-search', effectiveSchoolId, deferredSearch],
    queryFn: async () => {
      const { data } = await api.get('/students', {
        params: { schoolId: effectiveSchoolId, search: deferredSearch, limit: 30 },
      });
      return data.data as StudentMatch[];
    },
    enabled: !!effectiveSchoolId && deferredSearch.length >= 2,
  });

  const isSearchPending = search.trim() !== deferredSearch;

  // Modals
  const [showAddClass, setShowAddClass] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  
  const [showAddSection, setShowAddSection] = useState<string | null>(null); // classId
  const [newSectionName, setNewSectionName] = useState('');

  const [showAssign, setShowAssign] = useState<{ classId: string; sectionId: string } | null>(null);
  const [assignTeacherId, setAssignTeacherId] = useState('');

  // Queries
  const { data: classes = [], isLoading: isLoadingClasses } = useQuery({
    queryKey: ['classes', effectiveSchoolId],
    queryFn: async () => {
      const { data } = await api.get(`/classes/school/${effectiveSchoolId}`);
      const list = data as ClassItem[];
      offlineClasses.cacheClasses(effectiveSchoolId, list);
      return list;
    },
    enabled: !!effectiveSchoolId,
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ['assignments', effectiveSchoolId],
    queryFn: async () => {
      const { data } = await api.get(`/classes/teachers/${effectiveSchoolId}`);
      const list = data as TeacherAssignment[];
      offlineClasses.cacheAssignments(effectiveSchoolId, list);
      return list;
    },
    enabled: !!effectiveSchoolId,
  });

  const { data: teachers = [] } = useQuery({
    queryKey: ['teachers-minimal', effectiveSchoolId],
    queryFn: async () => {
      const { data } = await api.get('/teachers', {
        params: { limit: 100, schoolId: effectiveSchoolId },
      });
      const list = data.data as TeacherOption[];
      offlineClasses.cacheTeachers(effectiveSchoolId, list);
      return list;
    },
    enabled: !!effectiveSchoolId && !!showAssign,
  });

  const filteredClasses = useMemo(() => {
    const q = deferredSearch.toLowerCase();
    if (!q) return classes;

    const studentClassIds = new Set(studentMatches.map((s) => s.classId));
    const studentSectionKeys = new Set(studentMatches.map((s) => `${s.classId}:${s.sectionId}`));

    return classes
      .filter((cls) => {
        if (cls.name.toLowerCase().includes(q)) return true;
        if (cls.sections.some((sec) => sec.name.toLowerCase().includes(q))) return true;
        if (studentClassIds.has(cls.id)) return true;
        return assignments.some(
          (a) =>
            a.class.id === cls.id &&
            `${a.user.firstName} ${a.user.lastName} ${a.user.email}`.toLowerCase().includes(q),
        );
      })
      .map((cls) => {
        const classMatches = cls.name.toLowerCase().includes(q);
        const hasStudentInClass = studentClassIds.has(cls.id);
        if (classMatches || !hasStudentInClass) return cls;
        return {
          ...cls,
          sections: cls.sections.filter(
            (sec) =>
              sec.name.toLowerCase().includes(q) ||
              studentSectionKeys.has(`${cls.id}:${sec.id}`),
          ),
        };
      });
  }, [classes, deferredSearch, studentMatches, assignments]);

  // Mutations
  const invalidateClassData = () => {
    if (effectiveSchoolId) {
      syncClassesCache(effectiveSchoolId);
      syncAssignmentsCache(effectiveSchoolId);
    }
    queryClient.invalidateQueries({ queryKey: ['classes', effectiveSchoolId] });
    queryClient.invalidateQueries({ queryKey: ['assignments', effectiveSchoolId] });
    queryClient.invalidateQueries({ queryKey: ['teachers-minimal', effectiveSchoolId] });
  };

  const offlineSuccess = (label: string, res?: { data?: { _offline?: boolean } }) => {
    const savedOffline = Boolean(res?.data?._offline);
    if (savedOffline) {
      toast.success(`${label} saved locally — will sync when online`);
    } else {
      toast.success(label);
    }
    if (effectiveSchoolId) {
      syncClassesCache(effectiveSchoolId);
      syncAssignmentsCache(effectiveSchoolId);
    }
    if (!savedOffline) {
      invalidateClassData();
    }
  };

  const createClassMutation = useMutation({
    mutationFn: (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error('Class name is required');
      return api.post('/classes', { schoolId: effectiveSchoolId, name: trimmed });
    },
    onSuccess: (res) => {
      offlineSuccess('Class created', res);
      setShowAddClass(false);
      setNewClassName('');
    },
    onError: (err: any) => {
      if (!err.response && !navigator.onLine) return;
      toast.error(err.response?.data?.message || 'Failed to create class');
    },
  });

  const deleteClassMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/classes/${id}`),
    onSuccess: (res) => {
      offlineSuccess('Class deleted', res);
      setExpandedClass(null);
    },
    onError: (err: any) => {
      if (!err.response && !navigator.onLine) return;
      toast.error(err.response?.data?.message || 'Failed to delete class');
    },
  });

  const createSectionMutation = useMutation({
    mutationFn: ({ classId, name }: { classId: string; name: string }) =>
      api.post(`/classes/${classId}/sections`, { name }),
    onSuccess: (res, vars) => {
      offlineSuccess('Section created', res);
      setShowAddSection(null);
      setNewSectionName('');
      setExpandedClass(vars.classId);
    },
    onError: (err: any) => {
      if (!err.response && !navigator.onLine) return;
      toast.error(err.response?.data?.message || 'Failed to create section');
    },
  });

  const deleteSectionMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/classes/sections/${id}`),
    onSuccess: (res) => {
      offlineSuccess('Section removed', res);
    },
    onError: (err: any) => {
      if (!err.response && !navigator.onLine) return;
      toast.error(err.response?.data?.message || 'Failed to delete section');
    },
  });

  const assignTeacherMutation = useMutation({
    mutationFn: (payload: { userId: string; classId: string; sectionId: string; schoolId: string }) =>
      api.post('/classes/assign-teacher', payload),
    onSuccess: (res) => {
      offlineSuccess('Teacher assigned', res);
      setShowAssign(null);
      setAssignTeacherId('');
    },
    onError: (err: any) => {
      if (!err.response && !navigator.onLine) return;
      toast.error(err.response?.data?.message || 'Failed to assign teacher');
    },
  });

  const removeAssignmentMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/classes/assignment/${id}`),
    onSuccess: (res) => {
      offlineSuccess('Assignment removed', res);
    },
    onError: (err: any) => {
      if (!err.response && !navigator.onLine) return;
      toast.error(err.response?.data?.message || 'Failed to remove assignment');
    },
  });

  const teachersAvailableForAssign = useMemo(() => {
    if (!showAssign) return teachers;
    const assignedIds = new Set(
      assignments
        .filter((a) => a.class.id === showAssign.classId && a.section.id === showAssign.sectionId)
        .map((a) => a.user.id),
    );
    return teachers.filter((t) => !assignedIds.has(t.id));
  }, [teachers, assignments, showAssign]);

  const totalStudents = filteredClasses.reduce((sum, c) => sum + (c._count?.students || 0), 0);
  const totalSections = filteredClasses.reduce((s, c) => s + c.sections.length, 0);

  const jumpToStudent = (student: StudentMatch) => {
    if (student.classId) {
      setExpandedClass(student.classId);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60">
            Classes & Sections
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {isSuperAdmin
              ? 'Select a school to manage its classes and sections.'
              : "Manage your school's classes and sections."}
          </p>
        </div>
        <button 
          onClick={() => {
            if (!effectiveSchoolId) {
              toast.error('Please select a school first');
              return;
            }
            setShowAddClass(true);
          }}
          disabled={!effectiveSchoolId}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-bold shadow-lg shadow-primary/20 hover:opacity-90 active:scale-95 transition-all disabled:opacity-50 w-full sm:w-auto"
        >
          <Plus className="h-4 w-4 shrink-0" /> Create New Class
        </button>
      </div>

      {isSuperAdmin && (
        <div className="panel-toolbar flex flex-col gap-3 p-4">
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground shrink-0">
              School
            </label>
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                value={schoolSearch}
                onChange={(e) => setSchoolSearch(e.target.value)}
                placeholder="Filter schools..."
                className="w-full pl-10 pr-4 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <select
              value={selectedSchoolId}
              onChange={(e) => {
                setSelectedSchoolId(e.target.value);
                setExpandedClass(null);
              }}
              className="w-full sm:max-w-md px-4 py-2.5 bg-background border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              {filteredSchools.length === 0 ? (
                <option value="" className={SELECT_OPTION_CLASS}>No schools match filter</option>
              ) : (
                filteredSchools.map((s) => (
                  <option key={s.id} value={s.id} className={SELECT_OPTION_CLASS}>
                    {s.name} ({s.code})
                  </option>
                ))
              )}
            </select>
            {selectedSchool && (
              <span className="text-xs text-muted-foreground sm:ml-auto">
                Viewing <strong className="text-foreground">{selectedSchool.name}</strong>
              </span>
            )}
          </div>
        </div>
      )}

      {effectiveSchoolId && (
        <div className="panel-toolbar flex flex-col gap-3 p-4">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search classes, sections, teachers, or students (name / admission no.)..."
              className="w-full pl-10 pr-10 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            {isSearchPending && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>
          {deferredSearch && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>
                {filteredClasses.length} class{filteredClasses.length === 1 ? '' : 'es'}
                {studentMatches.length > 0 && ` · ${studentMatches.length} student${studentMatches.length === 1 ? '' : 's'}`}
              </span>
              <button
                type="button"
                onClick={() => setSearch('')}
                className="px-2 py-0.5 rounded-md border border-border hover:bg-muted text-foreground font-medium"
              >
                Clear
              </button>
            </div>
          )}
          {deferredSearch.length >= 2 && studentMatches.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {studentMatches.slice(0, 8).map((student) => (
                <button
                  key={student.id}
                  type="button"
                  onClick={() => jumpToStudent(student)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 text-[11px] font-bold hover:bg-emerald-500/20 transition-colors"
                >
                  <Users className="h-3 w-3 shrink-0" />
                  {student.firstName} {student.lastName}
                  <span className="font-normal opacity-70">
                    · {student.class?.name || 'Class'} {student.section?.name || ''}
                  </span>
                </button>
              ))}
              {studentMatches.length > 8 && (
                <span className="text-[11px] text-muted-foreground self-center">
                  +{studentMatches.length - 8} more
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {!effectiveSchoolId && isSuperAdmin && (
        <div className="panel-empty p-8 text-center text-sm text-muted-foreground">
          Select a school above to view and manage classes.
        </div>
      )}

      {effectiveSchoolId && (
        <>
      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Classes', value: filteredClasses.length, icon: BookOpen, color: 'blue' as const },
          { label: 'Active Sections', value: totalSections, icon: Filter, color: 'indigo' as const },
          { label: 'Enrolled Students', value: totalStudents, icon: Users, color: 'emerald' as const },
          { label: 'Assigned Teachers', value: assignments.length, icon: GraduationCap, color: 'amber' as const },
        ].map((stat) => (
          <StatCard
            key={stat.label}
            label={stat.label}
            value={stat.value}
            icon={stat.icon}
            color={stat.color}
          />
        ))}
      </div>

      {/* Classes List */}
      <div className="space-y-4">
        {isLoadingClasses ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 panel-empty">
            <Loader2 className="h-10 w-10 animate-spin text-primary/40" />
            <p className="text-sm font-medium text-muted-foreground">Loading classes...</p>
          </div>
        ) : classes.length === 0 ? (
          <div className="text-center py-24 panel-empty">
            <div className="h-16 w-16 bg-muted/50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <BookOpen className="h-8 w-8 text-muted-foreground/30" />
            </div>
            <h3 className="text-lg font-bold">No classes found</h3>
            <p className="text-sm text-muted-foreground max-w-xs mx-auto mt-2">
              Start by creating your first class (e.g., Grade 10) to begin managing sections and students.
            </p>
          </div>
        ) : filteredClasses.length === 0 ? (
          <div className="text-center py-24 panel-empty">
            <div className="h-16 w-16 bg-muted/50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Search className="h-8 w-8 text-muted-foreground/30" />
            </div>
            <h3 className="text-lg font-bold">No matches found</h3>
            <p className="text-sm text-muted-foreground max-w-xs mx-auto mt-2">
              Try a different search term for class, section, teacher, or student name.
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {filteredClasses.map((cls) => {
              const isExpanded = expandedClass === cls.id;
              return (
                <div key={cls.id} className={cn(
                  "group panel rounded-2xl overflow-hidden transition-all duration-300",
                  isExpanded ? "ring-2 ring-primary/20 border-primary/20 shadow-xl" : "hover:border-primary/20"
                )}>
                  {/* Class Header */}
                  <div
                    className="flex items-center justify-between p-5 cursor-pointer select-none"
                    onClick={() => setExpandedClass(isExpanded ? null : cls.id)}
                  >
                    <div className="flex items-center gap-5">
                      <div className={cn(
                        "h-12 w-12 rounded-2xl flex items-center justify-center transition-all duration-500",
                        isExpanded ? "bg-primary text-primary-foreground scale-110 rotate-6 shadow-lg shadow-primary/30" : "bg-muted/50 text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary"
                      )}>
                        <BookOpen className="h-6 w-6" />
                      </div>
                      <div>
                        <div className="font-bold text-lg text-foreground group-hover:text-primary transition-colors flex items-center gap-2 flex-wrap">
                          {cls.name}
                          {cls._offline && (
                            <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/25">
                              Offline
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-muted text-muted-foreground uppercase tracking-tighter">
                            {cls.sections.length} Sections
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-primary/10 text-primary uppercase tracking-tighter">
                            {cls._count?.students || 0} Enrolled
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all sm:translate-x-2 sm:group-hover:translate-x-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedClass(cls.id);
                            setShowAddSection(cls.id);
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-black uppercase tracking-wider rounded-xl border border-border hover:bg-muted hover:border-border transition-all"
                        >
                          <Plus className="h-3.5 w-3.5" /> Section
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const count = cls._count?.students || 0;
                            const msg =
                              count > 0
                                ? `Cannot delete ${cls.name}: ${count} student(s) enrolled.`
                                : `Delete class "${cls.name}" and all its sections?`;
                            if (count === 0 && confirm(msg)) deleteClassMutation.mutate(cls.id);
                            else if (count > 0) toast.error(msg);
                          }}
                          disabled={deleteClassMutation.isPending}
                          className="p-2 rounded-xl text-muted-foreground hover:bg-red-500/10 hover:text-red-500 transition-all disabled:opacity-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <div className={cn("p-1.5 rounded-full transition-transform duration-300", isExpanded && "rotate-180 bg-primary/10 text-primary")}>
                        <ChevronDown className="h-5 w-5 text-muted-foreground" />
                      </div>
                    </div>
                  </div>

                  {/* Sections List */}
                  {isExpanded && (
                    <div className="px-5 pb-5 animate-in slide-in-from-top-4 duration-300">
                      <div className="bg-muted/30 rounded-2xl border border-border overflow-hidden">
                        {cls.sections.length === 0 ? (
                          <div className="p-10 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
                            <Filter className="h-8 w-8 opacity-20" />
                            <p>No sections identified for this class yet.</p>
                          </div>
                        ) : (
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-muted/50 border-b border-border">
                                <th className="text-left px-6 py-3 font-bold uppercase tracking-widest text-muted-foreground">Section Name</th>
                                <th className="text-left px-6 py-3 font-bold uppercase tracking-widest text-muted-foreground">Teacher</th>
                                <th className="text-right px-6 py-3 font-bold uppercase tracking-widest text-muted-foreground">Students</th>
                                <th className="text-right px-6 py-3 font-bold uppercase tracking-widest text-muted-foreground">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border/20">
                              {cls.sections.map((sec) => {
                                const secAss = assignments.filter(a => a.class.id === cls.id && a.section.id === sec.id);
                                return (
                                  <tr key={sec.id} className="hover:bg-primary/5 transition-colors">
                                    <td className="px-6 py-4">
                                      <div className="font-bold text-foreground flex items-center gap-2 flex-wrap">
                                        Section {sec.name}
                                        {sec._offline && (
                                          <span className="text-[8px] font-black uppercase px-1 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300">
                                            Offline
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-[10px] text-muted-foreground font-mono mt-0.5 opacity-60 uppercase tracking-tighter">ID: {sec.id.slice(-6)}</div>
                                    </td>
                                    <td className="px-6 py-4">
                                      {secAss.length > 0 ? (
                                        <div className="flex flex-wrap gap-2">
                                          {secAss.map((a) => (
                                            <div key={a.id} className="group/tag inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold border border-indigo-500/20">
                                              <GraduationCap className="h-3 w-3" />
                                              {a.user.firstName}
                                              <button 
                                                onClick={() => removeAssignmentMutation.mutate(a.id)}
                                                className="opacity-0 group-hover/tag:opacity-100 hover:text-red-500 transition-all -ml-1"
                                              >
                                                <X className="h-3 w-3" />
                                              </button>
                                            </div>
                                          ))}
                                        </div>
                                      ) : (
                                        <span className="text-[10px] font-bold text-muted-foreground/40 italic">No Teacher</span>
                                      )}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                      <span className="font-black text-foreground">{sec._count?.students || 0}</span>
                                      <span className="text-muted-foreground ml-1">Students</span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                      <div className="flex items-center justify-end gap-2">
                                        <button 
                                          onClick={() => setShowAssign({ classId: cls.id, sectionId: sec.id })}
                                          className="p-1.5 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-all"
                                          title="Assign Teacher"
                                        >
                                          <UserPlus className="h-4 w-4" />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const count = sec._count?.students || 0;
                                            if (count > 0) {
                                              toast.error(
                                                `Cannot delete section ${sec.name}: ${count} student(s) enrolled.`,
                                              );
                                              return;
                                            }
                                            if (confirm(`Remove section ${sec.name}?`)) {
                                              deleteSectionMutation.mutate(sec.id);
                                            }
                                          }}
                                          disabled={deleteSectionMutation.isPending}
                                          className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-all disabled:opacity-50"
                                          title="Delete Section"
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
        </>
      )}

      {/* Modals */}
      {showAddClass && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in zoom-in duration-200" onClick={() => setShowAddClass(false)}>
          <div className="bg-card border border-border rounded-3xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-border bg-muted/20">
              <h3 className="font-black text-xl tracking-tight">Create Class</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {isSuperAdmin && selectedSchool
                  ? `Adding class to ${selectedSchool.name}`
                  : 'Enter the class name.'}
              </p>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!newClassName.trim()) {
                  toast.error('Enter a class name');
                  return;
                }
                createClassMutation.mutate(newClassName);
              }}
              className="p-6 space-y-6"
            >
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground ml-1">Class Name</label>
                <input 
                  value={newClassName} 
                  onChange={e => setNewClassName(e.target.value)} 
                  required 
                  autoFocus 
                  placeholder="e.g. Grade 10 / LKG / CS-01"
                  className="w-full px-5 py-3.5 bg-muted/30 border border-border rounded-2xl text-base font-bold focus:ring-2 focus:ring-primary/20 focus:outline-none transition-all placeholder:font-normal placeholder:opacity-40" 
                />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowAddClass(false)} className="flex-1 py-3 text-sm font-bold rounded-2xl border border-border hover:bg-muted transition-all">Cancel</button>
                <button 
                  type="submit" 
                  disabled={createClassMutation.isPending} 
                  className="flex-1 py-3 bg-primary text-primary-foreground rounded-2xl text-sm font-bold shadow-lg shadow-primary/20 hover:opacity-90 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {createClassMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save Class
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAddSection && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in zoom-in duration-200" onClick={() => setShowAddSection(null)}>
          <div className="bg-card border border-border rounded-3xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-border bg-muted/20">
              <h3 className="font-black text-xl tracking-tight">Add Section</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Defining new section for <span className="text-primary font-bold">{classes.find(c => c.id === showAddSection)?.name}</span>
              </p>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!showAddSection) return;
                if (!newSectionName.trim()) {
                  toast.error('Enter a section name');
                  return;
                }
                createSectionMutation.mutate({ classId: showAddSection, name: newSectionName });
              }}
              className="p-6 space-y-6"
            >
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground ml-1">Section Name</label>
                <input 
                  value={newSectionName} 
                  onChange={e => setNewSectionName(e.target.value)} 
                  required 
                  autoFocus 
                  placeholder="e.g. A, B, Blue, Red"
                  className="w-full px-5 py-3.5 bg-muted/30 border border-border rounded-2xl text-base font-bold focus:ring-2 focus:ring-primary/20 focus:outline-none transition-all placeholder:font-normal placeholder:opacity-40" 
                />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowAddSection(null)} className="flex-1 py-3 text-sm font-bold rounded-2xl border border-border hover:bg-muted transition-all">Cancel</button>
                <button 
                  type="submit" 
                  disabled={createSectionMutation.isPending} 
                  className="flex-1 py-3 bg-primary text-primary-foreground rounded-2xl text-sm font-bold shadow-lg shadow-primary/20 hover:opacity-90 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {createSectionMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Add Section
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAssign && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in zoom-in duration-200" onClick={() => setShowAssign(null)}>
          <div className="bg-card border border-border rounded-3xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-border bg-muted/20">
              <h3 className="font-black text-xl tracking-tight">Assign Teacher</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Assigning to <span className="text-primary font-bold">Class {classes.find(c => c.id === showAssign.classId)?.name} • {classes.find(c => c.id === showAssign.classId)?.sections.find(s => s.id === showAssign.sectionId)?.name}</span>
              </p>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!showAssign) return;
                assignTeacherMutation.mutate({
                  userId: assignTeacherId,
                  classId: showAssign.classId,
                  sectionId: showAssign.sectionId,
                  schoolId: effectiveSchoolId,
                });
              }}
              className="p-6 space-y-6"
            >
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground ml-1">Select Teacher</label>
                <select
                  value={assignTeacherId}
                  onChange={(e) => setAssignTeacherId(e.target.value)}
                  required
                  disabled={teachersAvailableForAssign.length === 0}
                  className="w-full px-5 py-3.5 bg-muted/30 border border-border rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary/20 focus:outline-none transition-all disabled:opacity-50"
                >
                  <option value="" className={SELECT_OPTION_CLASS}>
                    {teachersAvailableForAssign.length === 0
                      ? 'No teachers available (add teachers or remove existing assignment)'
                      : 'Choose teacher...'}
                  </option>
                  {teachersAvailableForAssign.map((t) => (
                    <option key={t.id} value={t.id} className={SELECT_OPTION_CLASS}>
                      {t.firstName} {t.lastName} ({t.email})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowAssign(null)} className="flex-1 py-3 text-sm font-bold rounded-2xl border border-border hover:bg-muted transition-all">Cancel</button>
                <button 
                  type="submit" 
                  disabled={assignTeacherMutation.isPending} 
                  className="flex-1 py-3 bg-primary text-primary-foreground rounded-2xl text-sm font-bold shadow-lg shadow-primary/20 hover:opacity-90 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {assignTeacherMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save Assignment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
