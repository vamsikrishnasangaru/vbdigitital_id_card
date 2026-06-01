'use client';

import { useState, useEffect, useMemo, useDeferredValue } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { toast } from 'sonner';
import {
  Plus,
  Search,
  Edit,
  Trash2,
  GraduationCap,
  Loader2,
  UserCheck,
  UserMinus,
  Eye,
  X,
  Mail,
  Phone,
  Building2,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { cn } from '@/lib/utils';
import { ResponsiveDataView, rowActionsClass } from '@/components/ui/responsive-data-view';
import { ListLoading, ListEmpty } from '@/components/ui/list-state';
import { queryKeys } from '@/lib/query-keys';
import { fetchSchoolsPicker } from '@/lib/schools-query';
import { offlineStore } from '@/lib/offline-store';
import { offlineTeachers } from '@/lib/offline-teachers';
import { offlineClasses } from '@/lib/offline-classes';
import { useOfflineSync } from '@/hooks/use-offline-sync';
import { useMergedTeachers } from '@/hooks/use-merged-teachers';

const SELECT_OPTION_CLASS = 'bg-popover text-popover-foreground';

interface Teacher {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  isActive: boolean;
  schoolId: string;
  school?: { name: string };
  teacherAssignments?: { id: string; class: { id: string; name: string }; section: { id: string; name: string } }[];
  _offline?: boolean;
}

const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
] as const;

export default function TeachersPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const { isOffline, pendingCount, offlineStudentCount, offlineClassCount, offlineTeacherCount } =
    useOfflineSync();
  const offlineRefreshKey =
    pendingCount + offlineStudentCount + offlineClassCount + offlineTeacherCount + (isOffline ? 1 : 0);
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const [selectedSchoolId, setSelectedSchoolId] = useState('');
  const [schoolSearch, setSchoolSearch] = useState('');
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim());
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);
  const [viewTeacher, setViewTeacher] = useState<Teacher | null>(null);
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    schoolId: '',
    classId: '',
    sectionId: '',
  });

  const effectiveSchoolId = isSuperAdmin ? selectedSchoolId : (user?.schoolId || '');

  const teacherFilters = useMemo(
    () => ({
      search: deferredSearch || undefined,
      isActive:
        statusFilter === 'active' ? 'true' : statusFilter === 'inactive' ? 'false' : undefined,
    }),
    [deferredSearch, statusFilter],
  );

  const syncTeachersCache = (schoolId: string) => {
    const cached = offlineTeachers.getTeachersResponse(schoolId, {
      schoolId,
      ...teacherFilters,
    });
    if (cached) queryClient.setQueryData(['teachers', schoolId, deferredSearch, statusFilter], cached);
  };

  const { data: schools = [] } = useQuery({
    queryKey: queryKeys.schools.picker,
    queryFn: fetchSchoolsPicker,
    enabled: isSuperAdmin,
  });

  useEffect(() => {
    if (!isSuperAdmin || schools.length === 0) return;
    const saved = localStorage.getItem('teachers_selected_school_id');
    const valid = saved && schools.some((s) => s.id === saved);
    setSelectedSchoolId(valid ? saved! : schools[0].id);
  }, [isSuperAdmin, schools]);

  useEffect(() => {
    if (isSuperAdmin && selectedSchoolId) {
      localStorage.setItem('teachers_selected_school_id', selectedSchoolId);
    }
  }, [isSuperAdmin, selectedSchoolId]);

  const filteredSchools = useMemo(() => {
    const q = schoolSearch.trim().toLowerCase();
    if (!q) return schools;
    return schools.filter(
      (s) => s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q),
    );
  }, [schools, schoolSearch]);

  const selectedSchool = schools.find((s) => s.id === effectiveSchoolId);

  const { data: teachersResponse, isLoading: isLoadingTeachers } = useQuery({
    queryKey: ['teachers', effectiveSchoolId, deferredSearch, statusFilter],
    queryFn: async () => {
      const params: Record<string, string | number> = { limit: 100 };
      if (effectiveSchoolId) params.schoolId = effectiveSchoolId;
      if (deferredSearch) params.search = deferredSearch;
      if (statusFilter === 'active') params.isActive = 'true';
      if (statusFilter === 'inactive') params.isActive = 'false';
      const { data } = await api.get('/teachers', { params });
      const response = data as { data: Teacher[]; meta: { total: number }; _offline?: boolean };
      if (effectiveSchoolId && !response._offline) {
        offlineTeachers.cacheTeachersList(effectiveSchoolId, response);
      }
      return response;
    },
    enabled: !!effectiveSchoolId,
  });

  const teachers = useMergedTeachers(
    teachersResponse?.data,
    effectiveSchoolId,
    teacherFilters,
    offlineRefreshKey,
  );
  const teachersTotal = teachersResponse?._offline
    ? teachers.length
    : Math.max(teachers.length, teachersResponse?.meta?.total ?? 0);

  const formSchoolId = isSuperAdmin ? form.schoolId : user?.schoolId;

  const { data: classesData } = useQuery({
    queryKey: ['classes', formSchoolId, 'teacher-form'],
    queryFn: async () => {
      if (!formSchoolId) return [];
      const { data } = await api.get(`/classes/school/${formSchoolId}`);
      const list = data || [];
      offlineClasses.cacheClasses(formSchoolId, list);
      return list;
    },
    enabled: !!formSchoolId && showCreate,
  });

  const offlineMutationSuccess = (label: string, res?: { data?: { _offline?: boolean } }) => {
    const savedOffline = Boolean(res?.data?._offline);
    if (savedOffline) {
      toast.success(`${label} saved locally — will sync when online`);
    } else {
      toast.success(label);
    }
    if (effectiveSchoolId) {
      syncTeachersCache(effectiveSchoolId);
    }
    if (!savedOffline) {
      queryClient.invalidateQueries({ queryKey: ['teachers'] });
    }
  };

  const createMutation = useMutation({
    mutationFn: (data: typeof form) => {
      const payload = {
        ...data,
        schoolId: isSuperAdmin ? data.schoolId : user?.schoolId,
      };
      return api.post('/teachers', payload);
    },
    onSuccess: (res) => {
      offlineMutationSuccess('Teacher onboarded', res);
      closeModal();
    },
    onError: (err: any) => {
      if (!err.response && !navigator.onLine) return;
      toast.error(err.response?.data?.message || 'Failed to create teacher');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      api.put(`/teachers/${id}`, data),
    onSuccess: (res) => {
      offlineMutationSuccess('Teacher updated', res);
      closeModal();
      setViewTeacher(null);
    },
    onError: (err: any) => {
      if (!err.response && !navigator.onLine) return;
      toast.error(err.response?.data?.message || 'Failed to update teacher');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/teachers/${id}`),
    onSuccess: (res) => {
      offlineMutationSuccess('Teacher removed', res);
      setViewTeacher(null);
    },
    onError: (err: any) => {
      if (!err.response && !navigator.onLine) return;
      toast.error(err.response?.data?.message || 'Failed to remove teacher');
    },
  });

  const closeModal = () => {
    setShowCreate(false);
    setEditingTeacher(null);
    setForm({
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      password: '',
      schoolId: '',
      classId: '',
      sectionId: '',
    });
  };

  const openAdd = () => {
    setEditingTeacher(null);
    setForm({
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      password: '',
      schoolId: effectiveSchoolId || '',
      classId: '',
      sectionId: '',
    });
    setShowCreate(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const hasClass = !!form.classId;
    const hasSection = !!form.sectionId;
    if (hasClass !== hasSection) {
      toast.error('Select both class and section, or leave both empty');
      return;
    }
    if (editingTeacher) {
      const { password, schoolId, ...updateData } = form;
      const payload: Record<string, unknown> = { ...updateData };
      if (password) payload.password = password;
      if (!hasClass && !hasSection) {
        payload.classId = '';
        payload.sectionId = '';
      }
      updateMutation.mutate({ id: editingTeacher.id, data: payload });
    } else {
      if (!isSuperAdmin && !user?.schoolId) {
        toast.error('Your account is not linked to a school');
        return;
      }
      createMutation.mutate(form);
    }
  };

  const openEdit = (teacher: Teacher) => {
    const assignment = teacher.teacherAssignments?.[0];
    setForm({
      firstName: teacher.firstName || '',
      lastName: teacher.lastName || '',
      email: teacher.email || '',
      phone: teacher.phone || '',
      password: '',
      schoolId: teacher.schoolId || effectiveSchoolId || '',
      classId: assignment?.class?.id || '',
      sectionId: assignment?.section?.id || '',
    });
    setEditingTeacher(teacher);
    setViewTeacher(null);
    setShowCreate(true);
  };

  const handleDelete = (teacher: Teacher) => {
    if (
      !confirm(
        `Remove ${teacher.firstName} ${teacher.lastName}? They will lose access and class assignments will be cleared.`,
      )
    ) {
      return;
    }
    deleteMutation.mutate(teacher.id);
  };

  const toggleActive = (teacher: Teacher) => {
    updateMutation.mutate({ id: teacher.id, data: { isActive: !teacher.isActive } });
  };

  const classes = classesData || [];
  const currentClass = classes.find((c: { id: string }) => c.id === form.classId);
  const sections = currentClass?.sections || [];

  const assignmentChips = (teacher: Teacher) =>
    teacher.teacherAssignments?.length ? (
      teacher.teacherAssignments.map((a) => (
        <span
          key={a.id}
          className="text-[10px] px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold border border-indigo-500/20"
        >
          {a.class?.name} • {a.section?.name}
        </span>
      ))
    ) : (
      <span className="text-[10px] px-2 py-0.5 rounded-md bg-muted text-muted-foreground font-bold uppercase">
        Unassigned
      </span>
    );

  const statusButtonClass = (active: boolean) =>
    cn(
      'flex items-center gap-1.5 text-[10px] px-3 py-1 rounded-full font-bold uppercase border transition-colors',
      active
        ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 hover:bg-emerald-500/20'
        : 'bg-red-500/10 text-red-600 border-red-500/20 hover:bg-red-500/20',
    );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-primary font-bold text-xs uppercase tracking-[0.2em] mb-1">
            <GraduationCap className="h-3.5 w-3.5" /> Staff
          </div>
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">Teachers</h2>
          <p className="text-muted-foreground text-sm font-medium">
            {isSuperAdmin
              ? 'Select a school, manage teachers, and assign classes.'
              : 'Manage teachers and their class assignments.'}
          </p>
        </div>
        <button
          type="button"
          onClick={openAdd}
          disabled={!effectiveSchoolId}
          className="flex items-center justify-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-2xl text-sm font-black shadow-lg shadow-primary/20 hover:opacity-90 active:scale-95 transition-all w-full sm:w-auto disabled:opacity-50"
        >
          <Plus className="h-5 w-5 shrink-0" /> Add Teacher
        </button>
      </div>

      {isSuperAdmin && (
        <div className="panel-toolbar flex flex-col gap-4 p-4">
          <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground shrink-0">
              <Building2 className="h-4 w-4" /> School
            </div>
            <div className="relative w-full lg:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                value={schoolSearch}
                onChange={(e) => setSchoolSearch(e.target.value)}
                placeholder="Search schools..."
                className="w-full pl-10 pr-4 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <select
              value={selectedSchoolId}
              onChange={(e) => setSelectedSchoolId(e.target.value)}
              className="w-full lg:flex-1 px-4 py-2.5 bg-background border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              {filteredSchools.map((s) => (
                <option key={s.id} value={s.id} className={SELECT_OPTION_CLASS}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {!effectiveSchoolId ? (
        <div className="panel-xl p-12 text-center text-muted-foreground">
          <Building2 className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="font-bold">Select a school to view teachers.</p>
        </div>
      ) : (
        <>
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, email, or phone..."
                className="w-full pl-11 pr-4 py-3 panel-toolbar rounded-2xl text-sm font-medium focus:ring-4 focus:ring-primary/10 focus:border-primary/50 outline-none transition-all"
              />
            </div>
            <div className="flex p-1.5 panel-toolbar rounded-2xl overflow-x-auto no-scrollbar shrink-0">
              {STATUS_FILTERS.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setStatusFilter(s.value)}
                  className={cn(
                    'px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider whitespace-nowrap transition-all',
                    statusFilter === s.value
                      ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 px-2 text-xs font-bold text-muted-foreground shrink-0">
              {isLoadingTeachers && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
              {!isLoadingTeachers && (
                <span>
                  {teachersTotal} teacher{teachersTotal === 1 ? '' : 's'}
                  {selectedSchool && isSuperAdmin ? ` · ${selectedSchool.name}` : ''}
                </span>
              )}
            </div>
          </div>

          <ResponsiveDataView
            className="panel-xl"
            mobile={
              isLoadingTeachers ? (
                <ListLoading message="Loading staff records..." />
              ) : teachers.length === 0 ? (
                <ListEmpty icon={GraduationCap} title="No teachers found" />
              ) : (
                teachers.map((teacher) => (
                  <div key={teacher.id} className="p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="h-11 w-11 shrink-0 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/10">
                        <GraduationCap className="h-5 w-5 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-foreground flex items-center gap-2 flex-wrap">
                          {teacher.firstName} {teacher.lastName}
                          {teacher._offline && (
                            <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/25">
                              Offline
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">{teacher.email}</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          {teacher.phone || 'No phone'}
                        </div>
                      </div>
                      <div className={cn(rowActionsClass(), 'shrink-0 flex-wrap')}>
                        <button
                          type="button"
                          onClick={() => setViewTeacher(teacher)}
                          className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-primary"
                          aria-label="View"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openEdit(teacher)}
                          className="p-2 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary"
                          aria-label="Edit"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(teacher)}
                          disabled={deleteMutation.isPending}
                          className="p-2 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-500 disabled:opacity-50"
                          aria-label="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 items-center">
                      {assignmentChips(teacher)}
                      <button
                        type="button"
                        onClick={() => toggleActive(teacher)}
                        disabled={updateMutation.isPending}
                        className={cn(statusButtonClass(teacher.isActive), 'ml-auto disabled:opacity-50')}
                      >
                        {teacher.isActive ? (
                          <UserCheck className="h-3 w-3" />
                        ) : (
                          <UserMinus className="h-3 w-3" />
                        )}
                        {teacher.isActive ? 'Active' : 'Inactive'}
                      </button>
                    </div>
                  </div>
                ))
              )
            }
            desktop={
              <table className="w-full text-sm min-w-[900px]">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="text-left p-4 font-semibold text-foreground">Teacher Name</th>
                    <th className="text-left p-4 font-semibold text-foreground">Contact</th>
                    <th className="text-left p-4 font-semibold text-foreground">Classes</th>
                    <th className="text-left p-4 font-semibold text-foreground">Status</th>
                    <th className="text-right p-4 font-semibold text-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {isLoadingTeachers ? (
                    <tr>
                      <td colSpan={5} className="p-20 text-center">
                        <Loader2 className="h-8 w-8 animate-spin text-primary/60 mx-auto" />
                        <p className="text-sm text-muted-foreground mt-3">Loading staff records...</p>
                      </td>
                    </tr>
                  ) : teachers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-20 text-center text-muted-foreground">
                        No teachers found
                      </td>
                    </tr>
                  ) : (
                    teachers.map((teacher) => (
                      <tr key={teacher.id} className="group hover:bg-primary/5 transition-colors">
                        <td className="p-4">
                          <div className="flex items-center gap-4">
                            <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/10">
                              <GraduationCap className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                              <div className="font-bold text-foreground flex items-center gap-2 flex-wrap">
                                {teacher.firstName} {teacher.lastName}
                                {teacher._offline && (
                                  <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/25">
                                    Offline
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-muted-foreground uppercase tracking-widest">
                                Teacher
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="text-xs font-medium">{teacher.email}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {teacher.phone || 'No phone'}
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="flex flex-wrap gap-1.5">{assignmentChips(teacher)}</div>
                        </td>
                        <td className="p-4">
                          <button
                            type="button"
                            onClick={() => toggleActive(teacher)}
                            disabled={updateMutation.isPending}
                            className={cn(statusButtonClass(teacher.isActive), 'disabled:opacity-50')}
                          >
                            {teacher.isActive ? (
                              <UserCheck className="h-3 w-3" />
                            ) : (
                              <UserMinus className="h-3 w-3" />
                            )}
                            {teacher.isActive ? 'Active' : 'Inactive'}
                          </button>
                        </td>
                        <td className="p-4 text-right">
                          <div className={cn(rowActionsClass(), 'justify-end')}>
                            <button
                              type="button"
                              onClick={() => setViewTeacher(teacher)}
                              className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-primary"
                              title="View"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => openEdit(teacher)}
                              className="p-2 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary"
                              title="Edit"
                            >
                              <Edit className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(teacher)}
                              disabled={deleteMutation.isPending}
                              className="p-2 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-500 disabled:opacity-50"
                              title="Remove"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            }
          />
        </>
      )}

      {viewTeacher && !showCreate && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-background/80 backdrop-blur-xl"
            onClick={() => setViewTeacher(null)}
          />
          <div className="relative bg-card border border-border w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-border flex justify-between items-start gap-4">
              <div className="flex items-center gap-4 min-w-0">
                <div className="h-14 w-14 shrink-0 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/10">
                  <GraduationCap className="h-7 w-7 text-primary" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-xl font-black text-foreground truncate">
                    {viewTeacher.firstName} {viewTeacher.lastName}
                  </h3>
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mt-0.5">
                    Teacher
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setViewTeacher(null)}
                className="p-2 hover:bg-muted rounded-xl transition-colors shrink-0"
              >
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>
            <div className="p-6 space-y-4 text-sm">
              <div className="flex items-center gap-2 text-foreground font-medium">
                <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="truncate">{viewTeacher.email}</span>
              </div>
              {viewTeacher.phone && (
                <div className="flex items-center gap-2 text-foreground font-medium">
                  <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                  {viewTeacher.phone}
                </div>
              )}
              {isSuperAdmin && viewTeacher.school?.name && (
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                    School
                  </p>
                  <p className="font-bold text-foreground">{viewTeacher.school.name}</p>
                </div>
              )}
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-2">
                  Class assignments
                </p>
                <div className="flex flex-wrap gap-2">{assignmentChips(viewTeacher)}</div>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                  Status
                </p>
                <p
                  className={cn(
                    'font-bold',
                    viewTeacher.isActive ? 'text-emerald-600' : 'text-red-600',
                  )}
                >
                  {viewTeacher.isActive ? 'Active' : 'Inactive'}
                </p>
              </div>
            </div>
            <div className="p-6 border-t border-border flex flex-wrap gap-3 justify-end bg-muted/30">
              <button
                type="button"
                onClick={() => handleDelete(viewTeacher)}
                disabled={deleteMutation.isPending}
                className="px-4 py-2.5 rounded-xl text-sm font-bold text-red-600 hover:bg-red-500/10 transition-colors disabled:opacity-50"
              >
                Remove
              </button>
              <button
                type="button"
                onClick={() => openEdit(viewTeacher)}
                className="px-4 py-2.5 rounded-xl text-sm font-bold bg-primary text-primary-foreground hover:opacity-90 transition-colors"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => setViewTeacher(null)}
                className="px-4 py-2.5 rounded-xl text-sm font-bold bg-card border border-border hover:bg-muted transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreate && (
        <div
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in zoom-in duration-200"
          onClick={closeModal}
        >
          <div
            className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-border bg-muted/20">
              <h3 className="font-bold text-xl tracking-tight">
                {editingTeacher ? 'Edit Teacher' : 'Add New Teacher'}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                Enter the details for the teacher profile.
              </p>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 block">
                    First Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    value={form.firstName}
                    onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                    required
                    className="w-full px-4 py-2.5 bg-muted/30 border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 block">
                    Last Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    value={form.lastName}
                    onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                    required
                    className="w-full px-4 py-2.5 bg-muted/30 border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:outline-none transition-all"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 block">
                    Email Address <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    required
                    className="w-full px-4 py-2.5 bg-muted/30 border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 block">
                    Phone Number
                  </label>
                  <input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full px-4 py-2.5 bg-muted/30 border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 block">
                    {editingTeacher ? 'Update Password' : 'Initial Password'}
                  </label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder={editingTeacher ? 'Leave blank to skip' : 'Required for new staff'}
                    className="w-full px-4 py-2.5 bg-muted/30 border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:outline-none transition-all"
                  />
                </div>

                {isSuperAdmin && !editingTeacher && (
                  <div className="col-span-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 block">
                      Assign to School <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={form.schoolId}
                      onChange={(e) =>
                        setForm({ ...form, schoolId: e.target.value, classId: '', sectionId: '' })
                      }
                      required
                      className="w-full px-4 py-2.5 bg-muted/30 border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:outline-none transition-all"
                    >
                      <option value="" className={SELECT_OPTION_CLASS}>
                        Select an institution
                      </option>
                      {schools.map((s) => (
                        <option key={s.id} value={s.id} className={SELECT_OPTION_CLASS}>
                          {s.name} ({s.code})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="col-span-2 pt-4 border-t border-border">
                  <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary mb-4">
                    Class Information
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 block">
                        Class
                      </label>
                      <select
                        value={form.classId}
                        onChange={(e) =>
                          setForm({ ...form, classId: e.target.value, sectionId: '' })
                        }
                        disabled={!formSchoolId}
                        className="w-full px-4 py-2.5 bg-muted/30 border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:outline-none transition-all disabled:opacity-50"
                      >
                        <option value="" className={SELECT_OPTION_CLASS}>
                          No Class Assigned
                        </option>
                        {classes.map((c: { id: string; name: string }) => (
                          <option key={c.id} value={c.id} className={SELECT_OPTION_CLASS}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 block">
                        Section
                      </label>
                      <select
                        value={form.sectionId}
                        onChange={(e) => setForm({ ...form, sectionId: e.target.value })}
                        disabled={!form.classId}
                        className="w-full px-4 py-2.5 bg-muted/30 border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:outline-none transition-all disabled:opacity-50"
                      >
                        <option value="" className={SELECT_OPTION_CLASS}>
                          No Section Assigned
                        </option>
                        {sections.map((s: { id: string; name: string }) => (
                          <option key={s.id} value={s.id} className={SELECT_OPTION_CLASS}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-3">
                    Choose both class and section to assign, or leave both empty to clear assignments.
                  </p>
                </div>
              </div>

              <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-4 border-t border-border">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-5 py-2.5 text-sm font-bold rounded-xl border border-border hover:bg-muted transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="px-6 py-2.5 text-sm font-bold rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:opacity-90 active:scale-95 transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  {(createMutation.isPending || updateMutation.isPending) && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  {editingTeacher ? 'Save Changes' : 'Add Teacher'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
