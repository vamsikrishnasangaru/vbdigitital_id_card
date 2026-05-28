'use client';

import { useState, useEffect, useMemo, useDeferredValue, useRef } from 'react';
import api from '@/lib/api';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/auth-store';
import {
  Plus, Search, Users, Loader2, Check, X,
  Eye, Trash2, Download, GraduationCap, Phone,
  CreditCard, Building2, Layers,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cn, resolveMediaUrl } from '@/lib/utils';
import { ResponsiveDataView, rowActionsClass } from '@/components/ui/responsive-data-view';
import { ListLoading, ListEmpty } from '@/components/ui/list-state';
import { StudentPhotoPicker } from '@/components/ui/student-photo-picker';
import { IdCardDesigner } from '@/components/designer/IdCardDesigner';
import { normalizeFrontConfig } from '@/lib/template-utils';
import { offlineStore } from '@/lib/offline-store';
import { useOfflineSync } from '@/hooks/use-offline-sync';
import { useMergedStudents } from '@/hooks/use-merged-students';

const SELECT_OPTION_CLASS = 'bg-popover text-popover-foreground';

function templateShortId(tpl: { id: string; code?: string | null }) {
  return tpl.code?.trim() || tpl.id.slice(0, 8).toUpperCase();
}

function latestTemplateLabel(student: { idCards?: { template?: { id: string; name: string; code?: string | null } }[] }) {
  const tpl = student.idCards?.[0]?.template;
  if (!tpl) return null;
  return { name: tpl.name, code: templateShortId(tpl) };
}

interface TeacherAssignment {
  id: string;
  class: { id: string; name: string };
  section: { id: string; name: string };
}

export default function StudentsPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const { isOffline, pendingCount, offlineStudentCount } = useOfflineSync();
  const offlineRefreshKey = pendingCount + offlineStudentCount + (isOffline ? 1 : 0);
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const isTeacher = user?.role === 'TEACHER';
  const teacherDefaultsApplied = useRef(false);
  const [selectedSchoolId, setSelectedSchoolId] = useState('');
  const [schoolSearch, setSchoolSearch] = useState('');
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim());
  const [statusFilter, setStatusFilter] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [sectionFilter, setSectionFilter] = useState('');
  const [templateCode, setTemplateCode] = useState('');
  const deferredTemplateCode = useDeferredValue(templateCode.trim());
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const effectiveSchoolId = isSuperAdmin ? selectedSchoolId : (user?.schoolId || '');
  const [showCreate, setShowCreate] = useState(false);
  const [sections, setSections] = useState<any[]>([]);
  const [form, setForm] = useState<any>({
    schoolId: '',
    classId: '',
    sectionId: '',
    firstName: '',
    lastName: '',
    rollNumber: '',
    admissionNumber: '',
    parentName: '',
    parentPhone: '',
    bloodGroup: '',
    address: '',
    dateOfBirth: '',
    emergencyContact: '',
    transportDetails: '',
  });
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [viewStudent, setViewStudent] = useState<any | null>(null);
  const [cardPreviewOpen, setCardPreviewOpen] = useState(false);

  const { data: schools = [] } = useQuery({
    queryKey: ['schools', 'students-picker'],
    queryFn: async () => {
      const { data } = await api.get('/schools', { params: { limit: 100 } });
      const list = data.data as { id: string; name: string; code: string }[];
      offlineStore.cacheSchools(list);
      return list;
    },
    enabled: isSuperAdmin,
  });

  useEffect(() => {
    if (!isSuperAdmin || schools.length === 0) return;
    const saved = localStorage.getItem('students_selected_school_id');
    const valid = saved && schools.some((s) => s.id === saved);
    setSelectedSchoolId(valid ? saved! : schools[0].id);
  }, [isSuperAdmin, schools]);

  useEffect(() => {
    if (isSuperAdmin && selectedSchoolId) {
      localStorage.setItem('students_selected_school_id', selectedSchoolId);
    }
  }, [isSuperAdmin, selectedSchoolId]);

  useEffect(() => {
    setClassFilter('');
    setSectionFilter('');
    setTemplateCode('');
    setSelectedTemplateId('');
  }, [effectiveSchoolId]);

  const filteredSchools = useMemo(() => {
    const q = schoolSearch.trim().toLowerCase();
    if (!q) return schools;
    return schools.filter(
      (s) => s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q),
    );
  }, [schools, schoolSearch]);

  const selectedSchool = schools.find((s) => s.id === effectiveSchoolId);

  const { data: teacherAssignments = [] } = useQuery({
    queryKey: ['teacher-assignments', user?.id],
    queryFn: async () => {
      const { data } = await api.get('/teachers/me/assignments');
      return data as TeacherAssignment[];
    },
    enabled: isTeacher && !!user?.id,
  });

  const assignedClassIds = useMemo(
    () => new Set(teacherAssignments.map((a) => a.class.id)),
    [teacherAssignments],
  );

  const assignedSectionKeys = useMemo(
    () => new Set(teacherAssignments.map((a) => `${a.class.id}:${a.section.id}`)),
    [teacherAssignments],
  );

  useEffect(() => {
    if (!isTeacher || teacherDefaultsApplied.current || teacherAssignments.length === 0) return;
    const primary = teacherAssignments[0];
    setClassFilter(primary.class.id);
    setSectionFilter(primary.section.id);
    teacherDefaultsApplied.current = true;
  }, [isTeacher, teacherAssignments]);

  const applyMyClassFilter = () => {
    if (teacherAssignments.length === 0) return;
    const primary = teacherAssignments[0];
    setClassFilter(primary.class.id);
    setSectionFilter(primary.section.id);
  };

  const clearClassFilters = () => {
    setClassFilter('');
    setSectionFilter('');
  };

  // Queries
  const { data: studentsResponse, isLoading: loading } = useQuery({
    queryKey: [
      'students',
      {
        schoolId: effectiveSchoolId,
        search: deferredSearch,
        status: statusFilter,
        classId: classFilter,
        sectionId: sectionFilter,
        templateCode: deferredTemplateCode,
      },
    ],
    queryFn: async () => {
      const params: Record<string, string | number> = { limit: 100 };
      if (effectiveSchoolId) params.schoolId = effectiveSchoolId;
      if (deferredSearch) params.search = deferredSearch;
      if (statusFilter) params.status = statusFilter;
      if (classFilter) params.classId = classFilter;
      if (sectionFilter) params.sectionId = sectionFilter;
      if (deferredTemplateCode) params.templateCode = deferredTemplateCode;
      const { data } = await api.get('/students', { params });
      return data;
    },
    enabled: !!effectiveSchoolId,
  });

  const studentListFilters = useMemo(
    () => ({
      schoolId: effectiveSchoolId,
      classId: classFilter || undefined,
      sectionId: sectionFilter || undefined,
      status: statusFilter || undefined,
      search: deferredSearch || undefined,
    }),
    [effectiveSchoolId, classFilter, sectionFilter, statusFilter, deferredSearch],
  );

  const studentsData = useMergedStudents(
    studentsResponse?.data,
    studentListFilters,
    offlineRefreshKey,
  );
  const studentsTotal = studentsResponse?._offline
    ? studentsData.length
    : Math.max(studentsData.length, studentsResponse?.total ?? 0);

  const { data: classes = [] } = useQuery({
    queryKey: ['classes', effectiveSchoolId],
    queryFn: async () => {
      if (!effectiveSchoolId) return [];
      const { data } = await api.get(`/classes/school/${effectiveSchoolId}`);
      const list = data || [];
      offlineStore.cacheClasses(effectiveSchoolId, list);
      return list;
    },
    enabled: !!effectiveSchoolId,
  });

  const { data: modalClasses = [] } = useQuery({
    queryKey: ['classes', form.schoolId, 'enroll-modal'],
    queryFn: async () => {
      if (!form.schoolId) return [];
      const { data } = await api.get(`/classes/school/${form.schoolId}`);
      const list = data || [];
      offlineStore.cacheClasses(form.schoolId, list);
      return list;
    },
    enabled: showCreate && !!form.schoolId,
  });

  const enrollClasses = isSuperAdmin && showCreate ? modalClasses : classes;

  const { data: templates = [] } = useQuery({
    queryKey: ['templates', effectiveSchoolId],
    queryFn: async () => {
      if (!effectiveSchoolId) return [];
      const { data } = await api.get('/templates', {
        params: { schoolId: effectiveSchoolId },
      });
      const list = data as {
        id: string;
        name: string;
        orientation: string;
        frontBgUrl?: string;
        frontConfig?: unknown;
      }[];
      offlineStore.cacheTemplates(effectiveSchoolId, list);
      return list;
    },
    enabled: !!effectiveSchoolId,
  });

  const filteredTemplates = useMemo(() => {
    const q = templateCode.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q) ||
        templateShortId(t).toLowerCase().includes(q),
    );
  }, [templates, templateCode]);

  useEffect(() => {
    if (filteredTemplates.length === 0) {
      setSelectedTemplateId('');
      return;
    }
    if (!filteredTemplates.some((t) => t.id === selectedTemplateId)) {
      setSelectedTemplateId(filteredTemplates[0].id);
    }
  }, [filteredTemplates, selectedTemplateId]);

  const filterSections = useMemo(() => {
    if (!classFilter) return [];
    return classes.find((c: any) => c.id === classFilter)?.sections || [];
  }, [classes, classFilter]);

  const isFilterPending =
    search.trim() !== deferredSearch || templateCode.trim() !== deferredTemplateCode;

  // Mutations
  const createMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      return api.post('/students', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
    },
    onSuccess: (response) => {
      if (response.data?._offline) {
        toast.success('Student saved on this device — will sync when you are online');
      } else {
        toast.success('Student record created successfully');
      }
      setShowCreate(false);
      setPhoto(null);
      setPhotoPreview(null);
      setForm({
        schoolId: effectiveSchoolId || '',
        classId: '',
        sectionId: '',
        firstName: '',
        lastName: '',
        rollNumber: '',
        admissionNumber: '',
        parentName: '',
        parentPhone: '',
        bloodGroup: '',
        address: '',
        dateOfBirth: '',
        emergencyContact: '',
        transportDetails: '',
      });
      setSections([]);
      queryClient.invalidateQueries({ queryKey: ['students'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to create student');
    }
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string, status: string }) => {
      return api.put(`/students/${id}/status`, { status });
    },
    onSuccess: (_, variables) => {
      toast.success(`Student status: ${variables.status}`);
      queryClient.invalidateQueries({ queryKey: ['students'] });
    },
    onError: () => {
      toast.error('Failed to update status');
    }
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/id-cards/generate', {
        templateId: selectedTemplateId,
        studentIds: studentsData.map((s: any) => s.id),
      });
      return data;
    },
    onSuccess: (data) => {
      if (data._offline) {
        toast.info(data.message || 'Card generation queued — will run when you are back online');
        return;
      }
      if (data.failCount > 0) {
        toast.warning(data.message || `Some cards failed (${data.failCount})`);
        const firstErr = data.results?.find((r: { status: string; error?: string }) => r.status === 'FAILED')?.error;
        if (firstErr) toast.error(firstErr, { duration: 8000 });
      } else {
        toast.success(data.message || `Generated ${data.successCount} card(s)`);
      }
      queryClient.invalidateQueries({ queryKey: ['students'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (err: any) => {
      if (!err.response && !navigator.onLine) return;
      toast.error(err.response?.data?.message || 'Failed to generate ID cards');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/students/${id}`),
    onSuccess: () => {
      toast.success('Student removed');
      setViewStudent(null);
      queryClient.invalidateQueries({ queryKey: ['students'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to remove student');
    },
  });

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);

  const canGenerate =
    !!selectedTemplateId && studentsData.length > 0 && !generateMutation.isPending;

  const handleDeleteStudent = (s: { id: string; firstName?: string; lastName?: string }) => {
    if (!confirm(`Remove ${s.firstName ?? ''} ${s.lastName ?? ''}? This cannot be undone.`)) return;
    deleteMutation.mutate(s.id);
  };

  const openCardPreview = (s: any) => {
    if (!selectedTemplateId) {
      toast.error('Choose a template under “Generate with template” first');
      return;
    }
    setViewStudent(s);
    setCardPreviewOpen(true);
  };

  const studentPhotoSrc = (photoUrl?: string | null) => (photoUrl ? resolveMediaUrl(photoUrl) : '');

  const handleGenerate = () => {
    if (!selectedTemplateId) {
      toast.error('Select a template first');
      return;
    }
    if (studentsData.length === 0) {
      toast.error('No students match the current filters');
      return;
    }
    if (!confirm(`Generate ID cards for ${studentsData.length} student(s)?`)) return;
    generateMutation.mutate();
  };

  const handlePhotoSelected = (file: File | null, previewUrl: string | null) => {
    setPhoto(file);
    setPhotoPreview(previewUrl);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const schoolId = isSuperAdmin ? form.schoolId : effectiveSchoolId;
    if (!schoolId) {
      toast.error('Select a school first');
      return;
    }
    const formData = new FormData();
    formData.append('schoolId', schoolId);
    formData.append('classId', form.classId);
    formData.append('sectionId', form.sectionId);
    formData.append('firstName', form.firstName.trim());
    formData.append('lastName', form.lastName.trim());
    formData.append('rollNumber', form.rollNumber.trim());
    formData.append('parentName', form.parentName.trim());
    formData.append('parentPhone', form.parentPhone.trim());
    formData.append('address', form.address.trim());
    if (form.bloodGroup?.trim()) formData.append('bloodGroup', form.bloodGroup.trim());
    if (form.dateOfBirth) formData.append('dateOfBirth', form.dateOfBirth);
    if (form.emergencyContact?.trim()) formData.append('emergencyContact', form.emergencyContact.trim());
    if (form.transportDetails?.trim()) formData.append('transportDetails', form.transportDetails.trim());
    if (photo) formData.append('photo', photo);
    createMutation.mutate(formData);
  };

  const exportToExcel = () => {
    if (!studentsData || studentsData.length === 0) return;
    
    const exportData = studentsData.map((s: any) => ({
      'First Name': s.firstName,
      'Last Name': s.lastName,
      'Roll No': s.rollNumber || '—',
      'Admission No': s.admissionNumber,
      'Class': s.class?.name || '—',
      'Section': s.section?.name || '—',
      'Status': s.status,
      'Parent Name': s.parentName || '—',
      'Parent Phone': s.parentPhone || '—',
      'Blood Group': s.bloodGroup || '—',
    }));

    void import('xlsx')
      .then((XLSX) => {
        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Students');
        XLSX.writeFile(wb, `Students_${effectiveSchoolId}_${new Date().getTime()}.xlsx`);
      })
      .catch(() => {
        toast.error('Export failed. Please try again.');
      });
  };

  const statuses = [
    { value: '', label: 'All Records' },
    { value: 'DRAFT', label: 'Draft' },
    { value: 'SUBMITTED', label: 'Pending' },
    { value: 'APPROVED', label: 'Verified' },
    { value: 'REJECTED', label: 'Incomplete' }
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-primary font-bold text-xs uppercase tracking-[0.2em] mb-1">
            <Users className="h-3.5 w-3.5" /> Student List
          </div>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-foreground">
            Students
          </h2>
          <p className="text-muted-foreground text-sm font-medium">
            {isSuperAdmin
              ? 'Select a school, filter students, and generate ID cards.'
              : isTeacher
                ? 'Your allocated class is selected by default. Open any class or section when covering for another teacher.'
                : 'View and manage all students in your school.'}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
          {effectiveSchoolId && (
            <button
              type="button"
              disabled={!canGenerate}
              onClick={handleGenerate}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold transition-all shadow-sm disabled:opacity-50 w-full sm:w-auto"
            >
              {generateMutation.isPending ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
              ) : (
                <CreditCard className="h-4 w-4 shrink-0" />
              )}
              Generate ID Cards
            </button>
          )}
          <button
            onClick={exportToExcel}
            disabled={!studentsData.length}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-card hover:bg-muted border border-border text-foreground rounded-xl text-sm font-bold transition-all shadow-sm w-full sm:w-auto disabled:opacity-50"
          >
            <Download className="h-4 w-4 shrink-0" /> Export CSV
          </button>
          <button onClick={() => {
            const primary = isTeacher && teacherAssignments[0] ? teacherAssignments[0] : null;
            if (primary) {
              const cls = classes.find((c: { id: string }) => c.id === primary.class.id);
              setSections(cls?.sections || []);
            } else {
              setSections([]);
            }
            setForm({
              schoolId: effectiveSchoolId || '',
              classId: primary?.class.id || '',
              sectionId: primary?.section.id || '',
              firstName: '',
              lastName: '',
              rollNumber: '',
              admissionNumber: '',
              parentName: '',
              parentPhone: '',
              bloodGroup: '',
              address: '',
              dateOfBirth: '',
              emergencyContact: '',
              transportDetails: '',
            });
            setPhoto(null);
            setPhotoPreview(null);
            setSections([]);
            setShowCreate(true);
          }} className="group relative flex items-center justify-center gap-2 px-6 py-3.5 bg-primary text-primary-foreground rounded-2xl text-sm font-black shadow-xl shadow-primary/20 hover:shadow-primary/40 active:scale-95 transition-all overflow-hidden w-full sm:w-auto">
            <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
            <Plus className="h-5 w-5" /> Enroll Student
          </button>
        </div>
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
                placeholder="Filter schools..."
                className="w-full pl-10 pr-4 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <select
              value={selectedSchoolId}
              onChange={(e) => setSelectedSchoolId(e.target.value)}
              className="w-full lg:max-w-md px-4 py-2.5 bg-background border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              {filteredSchools.length === 0 ? (
                <option value="" className={SELECT_OPTION_CLASS}>No schools match</option>
              ) : (
                filteredSchools.map((s) => (
                  <option key={s.id} value={s.id} className={SELECT_OPTION_CLASS}>
                    {s.name} ({s.code})
                  </option>
                ))
              )}
            </select>
            {selectedSchool && (
              <span className="text-xs text-muted-foreground lg:ml-auto">
                Viewing <strong className="text-foreground">{selectedSchool.name}</strong>
              </span>
            )}
          </div>
        </div>
      )}

      {!effectiveSchoolId && isSuperAdmin && (
        <div className="panel-empty p-8 text-center text-sm text-muted-foreground">
          Select a school above to view students and generate ID cards.
        </div>
      )}

      {effectiveSchoolId && (
        <>
      {isTeacher && (
        <div className="panel-toolbar flex flex-col sm:flex-row sm:items-center gap-4 p-4 border-primary/20 bg-primary/5">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className="h-11 w-11 shrink-0 rounded-xl bg-primary/15 flex items-center justify-center">
              <GraduationCap className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                Your class teacher allocation
              </p>
              {teacherAssignments.length > 0 ? (
                <div className="flex flex-wrap gap-2 mt-2">
                  {teacherAssignments.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => {
                        setClassFilter(a.class.id);
                        setSectionFilter(a.section.id);
                      }}
                      className={cn(
                        'px-3 py-1.5 rounded-lg text-xs font-black border transition-colors',
                        classFilter === a.class.id && sectionFilter === a.section.id
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-card border-border hover:border-primary/40',
                      )}
                    >
                      {a.class.name} · Section {a.section.name}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm font-medium text-muted-foreground mt-1">
                  No class assigned yet. Ask your school admin to assign you under Classes.
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-2">
                Use the filters below to view <span className="font-bold text-foreground">all classes and sections</span> when substituting for an absent teacher.
              </p>
            </div>
          </div>
          {teacherAssignments.length > 0 && (
            <div className="flex flex-wrap gap-2 shrink-0">
              <button
                type="button"
                onClick={applyMyClassFilter}
                className="px-4 py-2 rounded-xl text-xs font-black bg-primary text-primary-foreground"
              >
                My class
              </button>
              <button
                type="button"
                onClick={clearClassFilters}
                className="px-4 py-2 rounded-xl text-xs font-black border border-border bg-card hover:bg-muted"
              >
                All classes
              </button>
            </div>
          )}
        </div>
      )}

      <div className="panel-toolbar flex flex-col gap-4 p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground ml-1">
              Class {isTeacher && <span className="text-primary normal-case font-medium">(all school)</span>}
            </label>
            <select
              value={classFilter}
              onChange={(e) => {
                setClassFilter(e.target.value);
                setSectionFilter('');
              }}
              className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="" className={SELECT_OPTION_CLASS}>All classes</option>
              {classes.map((c: { id: string; name: string }) => (
                <option key={c.id} value={c.id} className={SELECT_OPTION_CLASS}>
                  {c.name}
                  {isTeacher && assignedClassIds.has(c.id) ? ' (your class)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground ml-1">
              Section {isTeacher && <span className="text-primary normal-case font-medium">(all in class)</span>}
            </label>
            <select
              value={sectionFilter}
              onChange={(e) => setSectionFilter(e.target.value)}
              disabled={!classFilter}
              className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
            >
              <option value="" className={SELECT_OPTION_CLASS}>All sections</option>
              {filterSections.map((s: { id: string; name: string }) => {
                const isMine =
                  !!classFilter && assignedSectionKeys.has(`${classFilter}:${s.id}`);
                return (
                  <option key={s.id} value={s.id} className={SELECT_OPTION_CLASS}>
                    {s.name}
                    {isTeacher && isMine ? ' (your section)' : ''}
                  </option>
                );
              })}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground ml-1 flex items-center gap-1">
              <Layers className="h-3 w-3" /> Template code
            </label>
            <input
              value={templateCode}
              onChange={(e) => setTemplateCode(e.target.value)}
              placeholder="Template name or ID..."
              className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground ml-1">Generate with template</label>
            <select
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              {filteredTemplates.length === 0 ? (
                <option value="" className={SELECT_OPTION_CLASS}>No templates found</option>
              ) : (
                filteredTemplates.map((t) => (
                  <option key={t.id} value={t.id} className={SELECT_OPTION_CLASS}>
                    {t.name} ({templateShortId(t)})
                  </option>
                ))
              )}
            </select>
          </div>
        </div>
        {deferredTemplateCode && (
          <p className="text-xs text-muted-foreground">
            Template filter: students with ID cards matching &quot;{deferredTemplateCode}&quot;
            {filteredTemplates.length > 0 && ` · ${filteredTemplates.length} template(s) match`}
          </p>
        )}
        {selectedTemplateId && studentsData.length > 0 && effectiveSchoolId && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-4 py-3 text-sm text-foreground">
            <CreditCard className="h-4 w-4 shrink-0 text-emerald-600" />
            <span>
              <span className="font-bold">{studentsData.length}</span> student{studentsData.length === 1 ? '' : 's'} in this list will use{' '}
              <span className="font-black">{selectedTemplate?.name ?? 'template'}</span> when you generate.
            </span>
            {studentsTotal > studentsData.length && (
              <span className="text-xs font-bold text-amber-600">
                (List capped at {studentsData.length} of {studentsTotal} — narrow filters to include everyone.)
              </span>
            )}
          </div>
        )}
      </div>

      {/* Intelligence/Filters Bar */}
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="relative flex-1 group">
          <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-muted-foreground group-focus-within:text-primary transition-colors">
            <Search className="h-5 w-5" />
          </div>
          <input 
            value={search} 
            onChange={(e) => setSearch(e.target.value)} 
            placeholder="Search by name, roll no, admission ID, or phone..."
            className="w-full pl-12 pr-4 py-4 panel-toolbar rounded-2xl text-sm font-medium focus:ring-4 focus:ring-primary/10 focus:border-primary/50 outline-none transition-all shadow-sm group-hover:bg-card group-hover:border-border" 
          />
        </div>
        
        <div className="flex p-1.5 panel-toolbar rounded-2xl shadow-sm overflow-x-auto no-scrollbar">
          {statuses.map((s) => (
            <button 
              key={s.value} 
              onClick={() => setStatusFilter(s.value)}
              className={cn(
                "px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap",
                statusFilter === s.value 
                  ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-105" 
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-muted-foreground shrink-0">
          {(loading || isFilterPending) && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
          {!loading && (
            <span>
              {studentsTotal} student{studentsTotal === 1 ? '' : 's'}
              {selectedSchool && isSuperAdmin ? ` · ${selectedSchool.name}` : ''}
            </span>
          )}
        </div>
      </div>

      <ResponsiveDataView
        className="panel-xl"
        mobile={
          loading ? (
            <ListLoading message="Loading students..." />
          ) : !studentsData?.length ? (
            <ListEmpty
              icon={Users}
              title="Zero matches found"
              description="Try refining your filters or enroll a new student."
            />
          ) : (
            studentsData.map((s: any) => (
              <div key={s.id} className="p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="relative h-12 w-12 shrink-0 rounded-2xl overflow-hidden border border-border bg-muted">
                    {s.photoUrl ? (
                      <img
                        src={studentPhotoSrc(s.photoUrl)}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-sm font-black text-primary/40">
                        {s.firstName?.[0]}{s.lastName?.[0]}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-black text-foreground flex items-center gap-2 flex-wrap">
                      {s.firstName} {s.lastName}
                      {s._offline && (
                        <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/25">
                          Offline
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-bold mt-0.5">
                      <Phone className="h-2.5 w-2.5 shrink-0" /> {s.parentPhone || 'No contact'}
                    </div>
                    <div className="mt-2 font-mono text-[11px] font-black px-2 py-1 rounded-lg bg-muted border border-border inline-block">
                      {s.admissionNumber}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="flex items-center gap-1 text-muted-foreground font-bold">
                    <GraduationCap className="h-3.5 w-3.5 text-primary" />
                    {s.class?.name || 'Unassigned'} · {s.section?.name || 'N/A'}
                  </span>
                  {(() => {
                    const tpl = latestTemplateLabel(s);
                    if (!tpl) return null;
                    return (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-muted border border-border font-mono text-[10px] font-black">
                        <Layers className="h-3 w-3 text-primary" />
                        {tpl.name} · {tpl.code}
                      </span>
                    );
                  })()}
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase',
                      s.status === 'APPROVED' ? 'bg-emerald-500/10 text-emerald-500' :
                      s.status === 'SUBMITTED' ? 'bg-blue-500/10 text-blue-500' :
                      s.status === 'REJECTED' ? 'bg-red-500/10 text-red-500' :
                      'bg-muted text-muted-foreground',
                    )}
                  >
                    {s.status === 'SUBMITTED' ? 'PENDING' : s.status}
                  </span>
                </div>
                <div className={cn(rowActionsClass(), 'flex-wrap justify-start pt-1')}>
                  {s.status === 'SUBMITTED' && (
                    <>
                      <button
                        type="button"
                        onClick={() => statusMutation.mutate({ id: s.id, status: 'APPROVED' })}
                        className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-500"
                        aria-label="Approve"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => statusMutation.mutate({ id: s.id, status: 'REJECTED' })}
                        className="p-2.5 rounded-xl bg-red-500/10 text-red-500"
                        aria-label="Reject"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => setViewStudent(s)}
                    className="p-2.5 rounded-xl bg-card border border-border text-muted-foreground hover:text-primary transition-colors"
                    aria-label="View"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteStudent(s)}
                    disabled={deleteMutation.isPending}
                    className="p-2.5 rounded-xl bg-card border border-border text-muted-foreground hover:text-red-500 transition-colors disabled:opacity-50"
                    aria-label="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))
          )
        }
        desktop={
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                <th className="p-6 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">Student Name</th>
                <th className="p-6 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">Admission No.</th>
                <th className="p-6 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">Class / Section</th>
                <th className="p-6 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">Template</th>
                <th className="p-6 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">Status</th>
                <th className="p-6 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {loading ? (
                <tr>
                  <td colSpan={6} className="p-24 text-center">
                    <div className="flex flex-col items-center gap-4">
                      <div className="h-12 w-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                      <p className="text-sm font-black text-muted-foreground uppercase tracking-widest">Loading Students...</p>
                    </div>
                  </td>
                </tr>
              ) : !studentsData || studentsData.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-24 text-center">
                    <div className="flex flex-col items-center gap-4">
                      <div className="h-20 w-20 bg-muted/50 rounded-3xl flex items-center justify-center">
                        <Users className="h-10 w-10 text-muted-foreground/30" />
                      </div>
                      <div>
                        <h4 className="text-xl font-black text-foreground">Zero matches found</h4>
                        <p className="text-muted-foreground text-sm font-medium">Try refining your filters or enroll a new student.</p>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : studentsData.map((s: any) => (
                <tr key={s.id} className="group/row hover:bg-muted/30 transition-all duration-300">
                  <td className="p-6">
                    <div className="flex items-center gap-4">
                      <div className="relative h-12 w-12 rounded-2xl overflow-hidden shadow-lg border border-border group-hover/row:scale-110 transition-transform duration-500 bg-muted">
                        {s.photoUrl ? (
                          <img
                            src={studentPhotoSrc(s.photoUrl)}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center text-sm font-black text-primary/40">
                            {s.firstName?.[0]}{s.lastName?.[0]}
                          </div>
                        )}
                        <div className="absolute inset-0 ring-1 ring-inset ring-white/10" />
                      </div>
                      <div>
                        <div className="font-black text-foreground text-base group-hover/row:text-primary transition-colors">{s.firstName} {s.lastName}</div>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-bold uppercase tracking-tight mt-0.5">
                          <Phone className="h-2.5 w-2.5" /> {s.parentPhone || 'No contact'}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="p-6">
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-card border border-border font-mono text-[11px] font-black text-foreground shadow-sm">
                      {s.admissionNumber}
                    </div>
                  </td>
                  <td className="p-6">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-sm font-black text-foreground">
                        <GraduationCap className="h-3.5 w-3.5 text-primary" />
                        {s.class?.name || 'Unassigned'}
                      </div>
                      <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest pl-5">
                        Section {s.section?.name || 'N/A'}
                      </div>
                    </div>
                  </td>
                  <td className="p-6">
                    {(() => {
                      const tpl = latestTemplateLabel(s);
                      if (!tpl) {
                        return <span className="text-xs text-muted-foreground font-bold">No card yet</span>;
                      }
                      return (
                        <div className="space-y-1">
                          <div className="text-sm font-black text-foreground">{tpl.name}</div>
                          <div className="font-mono text-[10px] font-black text-muted-foreground uppercase tracking-wider">
                            {tpl.code}
                          </div>
                        </div>
                      );
                    })()}
                  </td>
                  <td className="p-6">
                    <div className={cn(
                      "inline-flex items-center gap-1.5 px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-wider shadow-sm",
                      s.status === 'APPROVED' ? "bg-emerald-500/10 text-emerald-500 ring-1 ring-emerald-500/20" :
                      s.status === 'SUBMITTED' ? "bg-blue-500/10 text-blue-500 ring-1 ring-blue-500/20" :
                      s.status === 'REJECTED' ? "bg-red-500/10 text-red-500 ring-1 ring-red-500/20" :
                      "bg-muted text-muted-foreground ring-1 ring-border"
                    )}>
                      <div className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        s.status === 'APPROVED' ? "bg-emerald-500 animate-pulse" :
                        s.status === 'SUBMITTED' ? "bg-blue-500 animate-pulse" :
                        s.status === 'REJECTED' ? "bg-red-500" :
                        "bg-muted-foreground"
                      )} />
                      {s.status === 'SUBMITTED' ? 'PENDING REVIEW' : s.status}
                    </div>
                  </td>
                  <td className="p-6 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {s.status === 'SUBMITTED' && (
                        <>
                          <button 
                            onClick={() => statusMutation.mutate({ id: s.id, status: 'APPROVED' })} 
                            className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500 hover:text-white transition-all shadow-sm" 
                            title="Verify Identity"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                          <button 
                            onClick={() => statusMutation.mutate({ id: s.id, status: 'REJECTED' })} 
                            className="p-2.5 rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all shadow-sm" 
                            title="Decline Record"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => setViewStudent(s)}
                        className="p-2.5 rounded-xl bg-card border border-border text-muted-foreground hover:text-primary transition-all shadow-sm"
                        title="View student"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteStudent(s)}
                        disabled={deleteMutation.isPending}
                        className="p-2.5 rounded-xl bg-card border border-border text-muted-foreground hover:text-red-500 transition-all shadow-sm disabled:opacity-50"
                        title="Remove student"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        }
      />

        </>
      )}

      {/* Student detail */}
      {viewStudent && !cardPreviewOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-background/80 backdrop-blur-xl"
            onClick={() => setViewStudent(null)}
          />
          <div className="relative bg-card border border-border w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-border flex justify-between items-start gap-4">
              <div className="flex items-center gap-4 min-w-0">
                <div className="h-16 w-16 shrink-0 rounded-2xl overflow-hidden border border-border bg-muted">
                  {viewStudent.photoUrl ? (
                    <img src={studentPhotoSrc(viewStudent.photoUrl)} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-lg font-black text-primary/40">
                      {viewStudent.firstName?.[0]}{viewStudent.lastName?.[0]}
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className="text-xl font-black text-foreground truncate">
                    {viewStudent.firstName} {viewStudent.lastName}
                  </h3>
                  <p className="font-mono text-xs font-bold text-muted-foreground mt-1">
                    Roll {viewStudent.rollNumber || '—'} · Adm {viewStudent.admissionNumber}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setViewStudent(null)}
                className="p-2 hover:bg-muted rounded-xl transition-colors shrink-0"
              >
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>
            <div className="p-6 space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Class</p>
                  <p className="font-bold text-foreground">{viewStudent.class?.name || '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Section</p>
                  <p className="font-bold text-foreground">{viewStudent.section?.name || '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Status</p>
                  <p className="font-bold text-foreground">{viewStudent.status}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Blood group</p>
                  <p className="font-bold text-foreground">{viewStudent.bloodGroup || '—'}</p>
                </div>
              </div>
              {(viewStudent.parentName || viewStudent.parentPhone) && (
                <div className="p-4 rounded-2xl bg-muted/50 border border-border">
                  <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">Parent / guardian</p>
                  <p className="font-bold text-foreground">{viewStudent.parentName || '—'}</p>
                  {viewStudent.parentPhone && (
                    <p className="flex items-center gap-1.5 text-muted-foreground font-medium mt-1">
                      <Phone className="h-3.5 w-3.5" /> {viewStudent.parentPhone}
                    </p>
                  )}
                </div>
              )}
              {viewStudent.address && (
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Address</p>
                  <p className="font-medium text-foreground">{viewStudent.address}</p>
                </div>
              )}
              {(() => {
                const tpl = latestTemplateLabel(viewStudent);
                if (!tpl) return null;
                return (
                  <p className="text-xs text-muted-foreground font-bold">
                    Latest ID card: {tpl.name} · {tpl.code}
                  </p>
                );
              })()}
            </div>
            <div className="p-6 border-t border-border flex flex-wrap gap-3 justify-end bg-muted/30">
              <button
                type="button"
                onClick={() => handleDeleteStudent(viewStudent)}
                disabled={deleteMutation.isPending}
                className="px-4 py-2.5 rounded-xl text-sm font-bold text-red-600 hover:bg-red-500/10 transition-colors disabled:opacity-50"
              >
                Remove
              </button>
              <button
                type="button"
                onClick={() => openCardPreview(viewStudent)}
                disabled={!selectedTemplateId}
                className="px-4 py-2.5 rounded-xl text-sm font-bold bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
              >
                Preview ID card
              </button>
              <button
                type="button"
                onClick={() => setViewStudent(null)}
                className="px-4 py-2.5 rounded-xl text-sm font-bold bg-card border border-border hover:bg-muted transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {cardPreviewOpen && selectedTemplate && viewStudent && (
        <div className="fixed inset-0 z-[110] bg-background">
          <IdCardDesigner
            bgUrl={selectedTemplate.frontBgUrl || ''}
            elements={normalizeFrontConfig(selectedTemplate.frontConfig)}
            templateName={`${selectedTemplate.name} - ${viewStudent.firstName} (PREVIEW)`}
            orientation={selectedTemplate.orientation === 'VERTICAL' ? 'VERTICAL' : 'HORIZONTAL'}
            student={viewStudent}
            schoolId={effectiveSchoolId || undefined}
            onClose={() => {
              setCardPreviewOpen(false);
            }}
          />
        </div>
      )}

      {/* Enrollment Modal (Full Screen Glassmorphism) */}
      {showCreate && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-background/80 backdrop-blur-xl animate-in fade-in duration-500" onClick={() => setShowCreate(false)} />
          <div className="relative bg-card border border-border w-full max-w-4xl max-h-[90vh] rounded-[3rem] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.2)] overflow-hidden flex flex-col animate-in zoom-in-95 duration-300">
            {/* Modal Header */}
            <div className="p-8 border-b border-border flex justify-between items-center bg-muted/50 sticky top-0 z-20">
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 bg-primary/10 rounded-2xl flex items-center justify-center">
                  <Users className="h-7 w-7 text-primary" />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-foreground">Add New Student</h3>
                  <p className="text-muted-foreground text-sm font-medium">Enter the student details below to add them to the system.</p>
                </div>
              </div>
              <button onClick={() => setShowCreate(false)} className="p-3 hover:bg-muted rounded-2xl transition-colors">
                <X className="h-6 w-6 text-muted-foreground" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleCreate} className="flex-1 overflow-y-auto p-8 custom-scrollbar">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                {/* Visual Identity Section */}
                <div className="lg:col-span-4 space-y-6">
                  <StudentPhotoPicker preview={photoPreview} onPhotoChange={handlePhotoSelected} />
                  <div className="p-6 bg-muted/30 rounded-3xl border border-border">
                    <h5 className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] mb-4">Identity Standards</h5>
                    <ul className="space-y-3">
                      {[
                        'Front-facing portrait',
                        'Uniform background',
                        'No eyewear or caps',
                        'Max file size: 2MB'
                      ].map((hint, i) => (
                        <li key={i} className="flex items-center gap-3 text-xs font-bold text-foreground">
                          <Check className="h-3.5 w-3.5 text-primary" />
                          {hint}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Information Fields Section */}
                <div className="lg:col-span-8 space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {isSuperAdmin && (
                      <div className="md:col-span-2 space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-1 flex items-center gap-1">
                          <Building2 className="h-3 w-3" /> School
                        </label>
                        <select
                          value={form.schoolId}
                          onChange={(e) => {
                            const schoolId = e.target.value;
                            setForm({ ...form, schoolId, classId: '', sectionId: '' });
                            setSections([]);
                          }}
                          required
                          className="w-full px-5 py-4 bg-card border border-border rounded-2xl text-sm font-bold focus:ring-4 focus:ring-primary/10 outline-none transition-all shadow-sm"
                        >
                          <option value="" className={SELECT_OPTION_CLASS}>Select school</option>
                          {schools.map((s) => (
                            <option key={s.id} value={s.id} className={SELECT_OPTION_CLASS}>
                              {s.name} ({s.code})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    <p className="md:col-span-2 text-xs text-muted-foreground font-medium">
                      Fields marked with <span className="text-red-500 font-bold">*</span> are required.
                    </p>

                    {/* Academic placement (required) */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-1">
                        Class <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={form.classId}
                        onChange={(e) => {
                          const cid = e.target.value;
                          setForm({ ...form, classId: cid, sectionId: '' });
                          const cls = enrollClasses.find((c: { id: string }) => c.id === cid);
                          setSections(cls?.sections || []);
                        }}
                        required
                        className="w-full px-5 py-4 bg-card border border-border rounded-2xl text-sm font-bold focus:ring-4 focus:ring-primary/10 outline-none transition-all shadow-sm"
                      >
                        <option value="">Select class</option>
                        {enrollClasses.map((c: { id: string; name: string }) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-1">
                        Section <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={form.sectionId}
                        onChange={(e) => setForm({ ...form, sectionId: e.target.value })}
                        required
                        disabled={!form.classId}
                        className="w-full px-5 py-4 bg-card border border-border rounded-2xl text-sm font-bold focus:ring-4 focus:ring-primary/10 outline-none transition-all shadow-sm disabled:opacity-50"
                      >
                        <option value="">Select section</option>
                        {sections.map((s: { id: string; name: string }) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </div>

                    {/* Name (required) */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-1">
                        First name <span className="text-red-500">*</span>
                      </label>
                      <input
                        value={form.firstName}
                        onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                        required
                        className="w-full px-5 py-4 bg-card border border-border rounded-2xl text-sm font-bold focus:ring-4 focus:ring-primary/10 outline-none transition-all shadow-sm"
                        placeholder="e.g. Tamiri"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-1">
                        Last name <span className="text-red-500">*</span>
                      </label>
                      <input
                        value={form.lastName}
                        onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                        required
                        className="w-full px-5 py-4 bg-card border border-border rounded-2xl text-sm font-bold focus:ring-4 focus:ring-primary/10 outline-none transition-all shadow-sm"
                        placeholder="e.g. Kumari"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-1">
                        Roll number <span className="text-red-500">*</span>
                      </label>
                      <input
                        value={form.rollNumber}
                        onChange={(e) => setForm({ ...form, rollNumber: e.target.value })}
                        required
                        className="w-full px-5 py-4 bg-card border border-border rounded-2xl text-sm font-bold focus:ring-4 focus:ring-primary/10 outline-none transition-all shadow-sm font-mono"
                        placeholder="e.g. 12"
                      />
                    </div>

                    {/* Parent / guardian (required) */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-1">
                        Parent / guardian name <span className="text-red-500">*</span>
                      </label>
                      <input
                        value={form.parentName}
                        onChange={(e) => setForm({ ...form, parentName: e.target.value })}
                        required
                        className="w-full px-5 py-4 bg-card border border-border rounded-2xl text-sm font-bold focus:ring-4 focus:ring-primary/10 outline-none transition-all shadow-sm"
                        placeholder="Full name"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-1">
                        Parent mobile <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="tel"
                        value={form.parentPhone}
                        onChange={(e) => setForm({ ...form, parentPhone: e.target.value })}
                        required
                        className="w-full px-5 py-4 bg-card border border-border rounded-2xl text-sm font-bold focus:ring-4 focus:ring-primary/10 outline-none transition-all shadow-sm"
                        placeholder="9876543210"
                      />
                    </div>

                    <div className="md:col-span-2 space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-1">
                        Address <span className="text-red-500">*</span>
                      </label>
                      <textarea
                        rows={3}
                        value={form.address}
                        onChange={(e) => setForm({ ...form, address: e.target.value })}
                        required
                        className="w-full px-5 py-4 bg-card border border-border rounded-2xl text-sm font-bold focus:ring-4 focus:ring-primary/10 outline-none transition-all shadow-sm resize-none"
                        placeholder="Street, area, city, state, PIN..."
                      />
                    </div>

                    <div className="md:col-span-2 pt-2 border-t border-border">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-4">
                        Optional details
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-1">
                            Blood group
                          </label>
                          <input
                            value={form.bloodGroup}
                            onChange={(e) => setForm({ ...form, bloodGroup: e.target.value })}
                            className="w-full px-5 py-4 bg-card border border-border rounded-2xl text-sm font-bold focus:ring-4 focus:ring-primary/10 outline-none transition-all shadow-sm"
                            placeholder="e.g. O+"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-1">
                            Date of birth
                          </label>
                          <input
                            type="date"
                            value={form.dateOfBirth}
                            onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })}
                            className="w-full px-5 py-4 bg-card border border-border rounded-2xl text-sm font-bold focus:ring-4 focus:ring-primary/10 outline-none transition-all shadow-sm"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-1">
                            Emergency contact
                          </label>
                          <input
                            type="tel"
                            value={form.emergencyContact}
                            onChange={(e) => setForm({ ...form, emergencyContact: e.target.value })}
                            className="w-full px-5 py-4 bg-card border border-border rounded-2xl text-sm font-bold focus:ring-4 focus:ring-primary/10 outline-none transition-all shadow-sm"
                            placeholder="Alternate phone"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-1">
                            Transport
                          </label>
                          <input
                            value={form.transportDetails}
                            onChange={(e) => setForm({ ...form, transportDetails: e.target.value })}
                            className="w-full px-5 py-4 bg-card border border-border rounded-2xl text-sm font-bold focus:ring-4 focus:ring-primary/10 outline-none transition-all shadow-sm"
                            placeholder="Bus route, pickup point..."
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end gap-4 pt-6">
                    <button 
                      type="button" 
                      onClick={() => setShowCreate(false)} 
                      className="px-8 py-4 text-sm font-black uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Dismiss
                    </button>
                    <button 
                      type="submit" 
                      disabled={createMutation.isPending} 
                      className="px-10 py-4 bg-primary text-primary-foreground rounded-2xl text-sm font-black uppercase tracking-widest shadow-xl shadow-primary/20 hover:shadow-primary/40 active:scale-95 disabled:opacity-50 flex items-center gap-3 transition-all"
                    >
                      {createMutation.isPending ? (
                        <>
                          <Loader2 className="h-5 w-5 animate-spin" />
                          ADDING...
                        </>
                      ) : (
                        'ADD STUDENT'
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Global CSS for custom scrollbar */}
      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(0, 0, 0, 0.1);
          border-radius: 20px;
        }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
        }
      `}</style>
    </div>
  );
}
