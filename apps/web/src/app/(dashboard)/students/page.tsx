'use client';

import { useState, useEffect, useMemo, useDeferredValue, useRef, useLayoutEffect } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import api from '@/lib/api';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/auth-store';
import {
  Plus, Search, Users, Loader2, Check, X,
  Eye, Trash2, Download, GraduationCap, Phone,
  CreditCard, Building2, Layers, Pencil, FileSpreadsheet,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  formatClassSectionLabel,
  formatSectionName,
  formatStudentFullName,
  formatStudentLastName,
  isPlaceholderSectionName,
  cn,
  resolveMediaUrl,
  sanitizeIndianMobileInput,
  isTenDigitMobile,
} from '@/lib/utils';
import { compressImageForUpload, STUDENT_PHOTO_UPLOAD_OPTS } from '@/lib/compress-image';
import { ResponsiveDataView, rowActionsClass } from '@/components/ui/responsive-data-view';
import { ListLoading, ListEmpty } from '@/components/ui/list-state';
import { StudentPhotoPicker } from '@/components/ui/student-photo-picker';
import { DesignerLoadingOverlay } from '@/components/designer/DesignerLoadingOverlay';
import { normalizeFrontConfig } from '@/lib/template-utils';
import { fetchTemplateWithConfig } from '@/lib/fetch-template-detail';
import { queryKeys } from '@/lib/query-keys';
import { isStudentIncomplete, type StudentCompletionFields } from '@/lib/student-completion';
import { fetchSchoolsPicker, getCachedSchoolsPicker } from '@/lib/schools-query';
import {
  classesQueryKey,
  classesQueryStaleTime,
  fetchClassesPicker,
  getCachedClassesForSchool,
} from '@/lib/classes-query';
import { offlineStore } from '@/lib/offline-store';
import { useOfflineSync } from '@/hooks/use-offline-sync';
import { useMergedStudents } from '@/hooks/use-merged-students';
import { GenerateCardsDialog } from '@/components/id-cards/GenerateCardsDialog';
import { consumeStudentsClassSectionFilter, consumeEditStudentIntent } from '@/lib/students-navigation';
import { MODAL_BACKDROP, modalPanelClass } from '@/lib/modal-motion';
import { StudentExcelImportDialog } from '@/components/students/StudentExcelImportDialog';
import {
  generateIdCards,
  triggerIdCardDownload,
  fetchDriveStatus,
  type GenerateDestination,
} from '@/lib/generate-id-cards';

const IdCardDesigner = dynamic(
  () => import('@/components/designer/IdCardDesigner').then((m) => m.IdCardDesigner),
  { ssr: false, loading: () => <DesignerLoadingOverlay /> },
);

const SELECT_OPTION_CLASS = 'bg-popover text-popover-foreground';

function templateShortId(tpl: { id: string; code?: string | null }) {
  return tpl.code?.trim() || tpl.id.slice(0, 8).toUpperCase();
}

function safeLabel(value: unknown, fallback: string) {
  const s = typeof value === 'string' ? value.trim() : '';
  if (!s) return fallback;
  const lowered = s.toLowerCase();
  if (lowered === 'undefined' || lowered === 'null') return fallback;
  return s;
}

function latestTemplateLabel(student: { idCards?: { template?: { id: string; name: string; code?: string | null } }[] }) {
  const tpl = student.idCards?.[0]?.template;
  if (!tpl) return null;
  return { name: tpl.name, code: templateShortId(tpl) };
}

function resolveStudentTemplateLabel(
  student: { idCards?: { template?: { id: string; name: string; code?: string | null } }[] },
  activeTemplate?: { id: string; name: string; code?: string | null } | null,
) {
  const generated = latestTemplateLabel(student);
  if (generated) return generated;
  if (!activeTemplate) return null;
  return { name: activeTemplate.name, code: templateShortId(activeTemplate) };
}

interface TeacherAssignment {
  id: string;
  class: { id: string; name: string };
  section: { id: string; name: string };
}

interface StudentFormState {
  schoolId: string;
  classId: string;
  sectionId: string;
  firstName: string;
  lastName: string;
  rollNumber: string;
  admissionNumber: string;
  parentName: string;
  parentPhone: string;
  bloodGroup: string;
  aadharCard: string;
  address: string;
  dateOfBirth: string;
  emergencyContact: string;
  transportDetails: string;
}

function emptyStudentForm(schoolId = ''): StudentFormState {
  return {
    schoolId,
    classId: '',
    sectionId: '',
    firstName: '',
    lastName: '',
    rollNumber: '',
    admissionNumber: '',
    parentName: '',
    parentPhone: '',
    bloodGroup: '',
    aadharCard: '',
    address: '',
    dateOfBirth: '',
    emergencyContact: '',
    transportDetails: '',
  };
}

export default function StudentsPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const { isOffline, pendingCount, offlineStudentCount } = useOfflineSync();
  const offlineRefreshKey = pendingCount + offlineStudentCount + (isOffline ? 1 : 0);
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const isTeacher = user?.role === 'TEACHER';
  const teacherDefaultsApplied = useRef(false);
  const skipFilterResetRef = useRef(false);
  const classSectionNavApplied = useRef(false);
  const editIntentHandled = useRef(false);
  const [skipPageEnterAnimation, setSkipPageEnterAnimation] = useState(false);
  const [selectedSchoolId, setSelectedSchoolId] = useState(() => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('students_selected_school_id') ?? '';
  });
  const [schoolSearch, setSchoolSearch] = useState('');
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim());
  const [statusFilter, setStatusFilter] = useState('');
  const searchParams = useSearchParams();
  const urlFilterApplied = useRef(false);

  useEffect(() => {
    if (urlFilterApplied.current) return;
    const filter = searchParams.get('filter')?.toLowerCase();
    const legacyStatus = searchParams.get('status')?.toUpperCase();
    if (!filter && !legacyStatus) return;
    urlFilterApplied.current = true;

    if (filter === 'incomplete' || legacyStatus === 'DRAFT') {
      setStatusFilter('INCOMPLETE');
    } else if (filter === 'verified' || filter === 'complete' || legacyStatus === 'APPROVED') {
      setStatusFilter('COMPLETE');
    } else if (filter === 'pending' || legacyStatus === 'SUBMITTED') {
      setStatusFilter('SUBMITTED');
    }
  }, [searchParams]);
  const [classFilter, setClassFilter] = useState('');
  const [sectionFilter, setSectionFilter] = useState('');
  const [templateCode, setTemplateCode] = useState('');
  const deferredTemplateCode = useDeferredValue(templateCode.trim());
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const effectiveSchoolId = isSuperAdmin ? selectedSchoolId : (user?.schoolId || '');
  const viewAllSchools = useMemo(() => {
    if (!isSuperAdmin) return false;
    if (searchParams.get('allSchools') === '1') return true;
    return statusFilter === 'INCOMPLETE' || statusFilter === 'COMPLETE' || statusFilter === 'SUBMITTED';
  }, [isSuperAdmin, searchParams, statusFilter]);

  useEffect(() => {
    if (!viewAllSchools) return;
    setClassFilter('');
    setSectionFilter('');
  }, [viewAllSchools]);
  const [showCreate, setShowCreate] = useState(false);
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [sections, setSections] = useState<any[]>([]);
  const [form, setForm] = useState<StudentFormState>(() => emptyStudentForm());
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [viewStudent, setViewStudent] = useState<any | null>(null);
  const [cardPreviewOpen, setCardPreviewOpen] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<{
    id: string;
    name: string;
    frontBgUrl?: string;
    orientation: string;
    frontConfig?: unknown;
  } | null>(null);

  const { data: schools = [] } = useQuery({
    queryKey: queryKeys.schools.picker,
    queryFn: fetchSchoolsPicker,
    placeholderData: getCachedSchoolsPicker,
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
    if (classSectionNavApplied.current) return;
    const filter = consumeStudentsClassSectionFilter();
    if (!filter) return;
    classSectionNavApplied.current = true;
    skipFilterResetRef.current = true;
    teacherDefaultsApplied.current = true;
    if (isSuperAdmin && filter.schoolId) {
      setSelectedSchoolId(filter.schoolId);
      localStorage.setItem('students_selected_school_id', filter.schoolId);
    }
    setClassFilter(filter.classId);
    setSectionFilter(filter.sectionId);
  }, [isSuperAdmin]);

  useEffect(() => {
    if (skipFilterResetRef.current) {
      skipFilterResetRef.current = false;
      return;
    }
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
        allSchools: viewAllSchools,
        schoolId: viewAllSchools ? undefined : effectiveSchoolId,
        search: deferredSearch,
        status: statusFilter,
        classId: classFilter,
        sectionId: sectionFilter,
        templateCode: deferredTemplateCode,
      },
    ],
    queryFn: async () => {
      const params: Record<string, string | number> = { limit: viewAllSchools ? 500 : 100 };
      if (!viewAllSchools && effectiveSchoolId) params.schoolId = effectiveSchoolId;
      if (deferredSearch) params.search = deferredSearch;
      if (!viewAllSchools && statusFilter === 'COMPLETE') params.completion = 'COMPLETE';
      if (!viewAllSchools && statusFilter === 'INCOMPLETE') params.completion = 'INCOMPLETE';
      if (!viewAllSchools && statusFilter === 'SUBMITTED') params.status = 'SUBMITTED';
      if (classFilter) params.classId = classFilter;
      if (sectionFilter) params.sectionId = sectionFilter;
      if (deferredTemplateCode) params.templateCode = deferredTemplateCode;
      const { data } = await api.get('/students', { params });
      return data;
    },
    enabled: isSuperAdmin ? viewAllSchools || !!effectiveSchoolId : !!effectiveSchoolId,
  });

  const { data: classes = [], isPending: classesPending } = useQuery({
    queryKey: classesQueryKey(effectiveSchoolId),
    queryFn: () => fetchClassesPicker(effectiveSchoolId),
    enabled: !!effectiveSchoolId,
    staleTime: classesQueryStaleTime(),
    placeholderData: () => getCachedClassesForSchool(effectiveSchoolId),
  });

  const studentListFilters = useMemo(
    () => ({
      schoolId: viewAllSchools ? undefined : effectiveSchoolId,
      classId: classFilter || undefined,
      sectionId: sectionFilter || undefined,
      status: undefined,
      search: deferredSearch || undefined,
    }),
    [viewAllSchools, effectiveSchoolId, classFilter, sectionFilter, statusFilter, deferredSearch],
  );

  const studentsData = useMergedStudents(
    studentsResponse?.data,
    studentListFilters,
    offlineRefreshKey,
    classes,
  );

  const visibleStudents = useMemo(() => {
    const list = studentsData as Array<StudentCompletionFields & { id: string; status?: string }>;
    if (statusFilter === 'INCOMPLETE') {
      return list.filter((s) => isStudentIncomplete(s));
    }
    if (statusFilter === 'COMPLETE') {
      return list.filter((s) => !isStudentIncomplete(s));
    }
    if (statusFilter === 'SUBMITTED') {
      return list.filter((s) => s.status === 'SUBMITTED');
    }
    return studentsData;
  }, [studentsData, statusFilter]);

  const studentsTotal = studentsResponse?._offline || viewAllSchools
    ? visibleStudents.length
    : Math.max(visibleStudents.length, studentsResponse?.total ?? 0);

  const enrollSchoolId = showCreate ? (form.schoolId || effectiveSchoolId) : '';

  const { data: enrollAltClasses = [], isPending: enrollAltPending } = useQuery({
    queryKey: classesQueryKey(enrollSchoolId),
    queryFn: () => fetchClassesPicker(enrollSchoolId),
    enabled: showCreate && !!enrollSchoolId && enrollSchoolId !== effectiveSchoolId,
    staleTime: classesQueryStaleTime(),
    placeholderData: () => getCachedClassesForSchool(enrollSchoolId),
  });

  const enrollClasses =
    !showCreate || !enrollSchoolId
      ? []
      : enrollSchoolId === effectiveSchoolId
        ? classes
        : enrollAltClasses;

  const enrollClassesLoading =
    showCreate &&
    !!enrollSchoolId &&
    enrollClasses.length === 0 &&
    (enrollSchoolId === effectiveSchoolId ? classesPending : enrollAltPending);

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
        code?: string | null;
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

  const resetEnrollForm = () => {
    setEditingStudentId(null);
    setPhoto(null);
    setPhotoPreview(null);
    setForm(emptyStudentForm(effectiveSchoolId || ''));
    setSections([]);
  };

  const closeEnrollModal = () => {
    setShowCreate(false);
    resetEnrollForm();
  };

  const openCreateStudent = async () => {
    resetEnrollForm();
    const schoolId = effectiveSchoolId || '';
    const primary = isTeacher && teacherAssignments[0] ? teacherAssignments[0] : null;
    if (primary && schoolId) {
      const cached = getCachedClassesForSchool(schoolId) ?? classes;
      const cls = cached.find((c) => c.id === primary.class.id);
      setSections(cls?.sections || []);
      setForm({
        ...emptyStudentForm(schoolId),
        classId: primary.class.id,
        sectionId: primary.section.id,
      });
    }
    if (schoolId) {
      await queryClient.ensureQueryData({
        queryKey: classesQueryKey(schoolId),
        queryFn: () => fetchClassesPicker(schoolId),
        staleTime: classesQueryStaleTime(),
      });
    }
    setShowCreate(true);
  };

  const openEditStudent = (student: {
    id: string;
    schoolId?: string;
    classId?: string;
    sectionId?: string;
    class?: { id: string; name?: string; sections?: { id: string; name: string }[] };
    section?: { id: string; name?: string };
    firstName?: string;
    lastName?: string;
    rollNumber?: string | null;
    admissionNumber?: string;
    parentName?: string | null;
    parentPhone?: string | null;
    bloodGroup?: string | null;
    aadharCard?: string | null;
    address?: string | null;
    dateOfBirth?: string | null;
    emergencyContact?: string | null;
    transportDetails?: string | null;
    photoUrl?: string | null;
  }) => {
    const schoolId = student.schoolId || effectiveSchoolId || '';
    const classId = student.classId || student.class?.id || '';
    const rawSectionId = student.sectionId || student.section?.id || '';
    const sectionId = isPlaceholderSectionName(student.section?.name) ? '' : rawSectionId;
    const cls = classes.find((c: { id: string }) => c.id === classId);

    setEditingStudentId(student.id);
    setForm({
      schoolId,
      classId,
      sectionId,
      firstName: student.firstName || '',
      lastName: student.lastName || '',
      rollNumber: student.rollNumber || '',
      admissionNumber: student.admissionNumber || '',
      parentName: student.parentName || '',
      parentPhone: sanitizeIndianMobileInput(student.parentPhone || ''),
      bloodGroup: student.bloodGroup || '',
      aadharCard: student.aadharCard || '',
      address: student.address || '',
      dateOfBirth: student.dateOfBirth ? String(student.dateOfBirth).slice(0, 10) : '',
      emergencyContact: student.emergencyContact || '',
      transportDetails: student.transportDetails || '',
    });
    setPhoto(null);
    setPhotoPreview(student.photoUrl ? studentPhotoSrc(student.photoUrl) : null);
    setSections(
      (cls?.sections || student.class?.sections || []).filter(
        (s: { name?: string }) => !isPlaceholderSectionName(s.name),
      ),
    );
    setViewStudent(null);
    setShowCreate(true);
  };

  useLayoutEffect(() => {
    if (editIntentHandled.current) return;
    const intent = consumeEditStudentIntent();
    if (!intent) return;

    editIntentHandled.current = true;
    setSkipPageEnterAnimation(true);

    const hasDetails =
      Boolean(intent.firstName?.trim()) ||
      Boolean(intent.rollNumber?.trim()) ||
      Boolean(intent.parentPhone?.trim());

    if (hasDetails) {
      openEditStudent(intent);
    } else {
      void api
        .get(`/students/${intent.id}`)
        .then(({ data }) => openEditStudent(data))
        .catch(() => {
          toast.error('Could not open student for editing');
        });
    }

    const schoolId = intent.schoolId || effectiveSchoolId;
    if (schoolId) {
      void queryClient.prefetchQuery({
        queryKey: classesQueryKey(schoolId),
        queryFn: () => fetchClassesPicker(schoolId),
        staleTime: classesQueryStaleTime(),
      });
    }
  }, [effectiveSchoolId, queryClient]);

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
      closeEnrollModal();
      queryClient.invalidateQueries({ queryKey: ['students'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to create student');
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      formData,
      payload,
    }: {
      id: string;
      formData?: FormData;
      payload?: Record<string, unknown>;
    }) => {
      if (formData) return api.put(`/students/${id}`, formData);
      return api.put(`/students/${id}`, payload);
    },
    onSuccess: () => {
      toast.success('Student updated successfully');
      closeEnrollModal();
      queryClient.invalidateQueries({ queryKey: ['students'] });
    },
    onError: (err: any) => {
      if (err.response?.status === 413) {
        toast.error(
          'Photo is too large for the server. Ask your host to set nginx client_max_body_size 15M, or use a smaller image.',
        );
        return;
      }
      toast.error(err.response?.data?.message || 'Failed to update student');
    },
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
    mutationFn: async (destination: GenerateDestination) => {
      return generateIdCards({
        templateId: selectedTemplateId,
        studentIds: visibleStudents.map((s: { id: string }) => s.id),
        destination,
      });
    },
    onSuccess: (result) => {
      setShowGenerateDialog(false);
      if (result.kind === 'file') {
        triggerIdCardDownload(result.blob, result.filename);
        if (result.failCount > 0) {
          toast.warning(`Downloaded ${result.successCount} card(s); ${result.failCount} failed`);
        } else {
          toast.success(
            result.filename.endsWith('.zip')
              ? `Downloaded ZIP with ${result.successCount} PNG card(s)`
              : 'Downloaded ID card PNG',
          );
        }
      } else {
        const data = result.data as {
          _offline?: boolean;
          message?: string;
          failCount?: number;
          successCount?: number;
          results?: { status: string; error?: string }[];
        };
        if (data._offline) {
          toast.info(data.message || 'Card generation queued — will run when you are back online');
          return;
        }
        if ((data.failCount ?? 0) > 0) {
          toast.warning(data.message || `Some cards failed (${data.failCount})`);
          const firstErr = data.results?.find((r) => r.status === 'FAILED')?.error;
          if (firstErr) toast.error(firstErr, { duration: 8000 });
        } else {
          toast.success(data.message || `Uploaded ${data.successCount} card(s) to Google Drive`);
        }
      }
      queryClient.invalidateQueries({ queryKey: ['students'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      if (!err.response && !navigator.onLine) return;
      toast.error(err.response?.data?.message || 'Failed to generate ID cards');
    },
  });

  const { data: driveStatus } = useQuery({
    queryKey: ['id-cards', 'drive-status'],
    queryFn: fetchDriveStatus,
    enabled: isSuperAdmin,
    staleTime: 60_000,
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
    isSuperAdmin &&
    !!selectedTemplateId &&
    visibleStudents.length > 0 &&
    !generateMutation.isPending;

  const handleDeleteStudent = (s: { id: string; firstName?: string; lastName?: string }) => {
    if (!confirm(`Remove ${s.firstName ?? ''} ${s.lastName ?? ''}? This cannot be undone.`)) return;
    deleteMutation.mutate(s.id);
  };

  const openCardPreview = async (s: { id: string; firstName?: string }) => {
    if (!selectedTemplateId) {
      toast.error('Choose a template under “Generate with template” first');
      return;
    }
    setViewStudent(s);
    try {
      const tpl = await fetchTemplateWithConfig<{
        id: string;
        name: string;
        frontBgUrl?: string;
        orientation: string;
        frontConfig?: unknown;
      }>(selectedTemplateId);
      setPreviewTemplate(tpl);
      setCardPreviewOpen(true);
    } catch {
      toast.error('Failed to load template for preview');
    }
  };

  const studentPhotoSrc = (photoUrl?: string | null) => (photoUrl ? resolveMediaUrl(photoUrl) : '');

  const handleGenerate = () => {
    if (!isSuperAdmin) return;
    if (!selectedTemplateId) {
      toast.error('Select a template first');
      return;
    }
    if (visibleStudents.length === 0) {
      toast.error('No students match the current filters');
      return;
    }
    setShowGenerateDialog(true);
  };

  const handlePhotoSelected = (file: File | null, previewUrl: string | null) => {
    setPhoto(file);
    setPhotoPreview(previewUrl);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const schoolId = isSuperAdmin ? form.schoolId : effectiveSchoolId;
    if (!schoolId) {
      toast.error('Select a school first');
      return;
    }

    const parentPhone = form.parentPhone.trim();
    if (!isTenDigitMobile(parentPhone)) {
      toast.error('Parent mobile must be exactly 10 digits');
      return;
    }

    if (editingStudentId) {
      const formData = new FormData();
      formData.append('schoolId', schoolId);
      formData.append('firstName', form.firstName.trim());
      formData.append('lastName', form.lastName.trim());
      formData.append('rollNumber', form.rollNumber.trim());
      formData.append('parentPhone', parentPhone);
      formData.append('address', form.address.trim());
      if (form.parentName.trim()) formData.append('parentName', form.parentName.trim());
      if (form.classId.trim()) {
        formData.append('classId', form.classId.trim());
        formData.append('sectionId', form.sectionId.trim());
      }
      if (form.bloodGroup?.trim()) formData.append('bloodGroup', form.bloodGroup.trim());
      if (form.aadharCard?.trim()) formData.append('aadharCard', form.aadharCard.trim());
      if (form.dateOfBirth) formData.append('dateOfBirth', form.dateOfBirth);
      if (form.emergencyContact?.trim()) formData.append('emergencyContact', form.emergencyContact.trim());
      if (form.transportDetails?.trim()) formData.append('transportDetails', form.transportDetails.trim());

      if (photo) {
        try {
          const compressed = await compressImageForUpload(photo, STUDENT_PHOTO_UPLOAD_OPTS);
          formData.append('photo', compressed);
        } catch {
          formData.append('photo', photo);
        }
      }

      updateMutation.mutate({ id: editingStudentId, formData });
      return;
    }

    const formData = new FormData();
    formData.append('schoolId', schoolId);
    formData.append('firstName', form.firstName.trim());
    formData.append('lastName', form.lastName.trim());
    formData.append('rollNumber', form.rollNumber.trim());
    if (form.parentName.trim()) formData.append('parentName', form.parentName.trim());
    formData.append('parentPhone', parentPhone);
    formData.append('address', form.address.trim());
    if (form.classId.trim()) {
      formData.append('classId', form.classId.trim());
      formData.append('sectionId', form.sectionId.trim());
    }
    if (form.bloodGroup?.trim()) formData.append('bloodGroup', form.bloodGroup.trim());
    if (form.aadharCard?.trim()) formData.append('aadharCard', form.aadharCard.trim());
    if (form.dateOfBirth) formData.append('dateOfBirth', form.dateOfBirth);
    if (form.emergencyContact?.trim()) formData.append('emergencyContact', form.emergencyContact.trim());
    if (form.transportDetails?.trim()) formData.append('transportDetails', form.transportDetails.trim());
    if (photo) {
      try {
        const compressed = await compressImageForUpload(photo, STUDENT_PHOTO_UPLOAD_OPTS);
        formData.append('photo', compressed);
      } catch {
        formData.append('photo', photo);
      }
    }
    createMutation.mutate(formData);
  };

  const exportToExcel = () => {
    if (!visibleStudents || visibleStudents.length === 0) return;
    
    const exportData = visibleStudents.map((s: any) => ({
      'First Name': s.firstName,
      'Last Name': formatStudentLastName(s.lastName) || '—',
      'Roll No': s.rollNumber || '—',
      'Admission No': s.admissionNumber,
      'Class': s.class?.name || '—',
      'Section': formatSectionName(s.section?.name) || '—',
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
    { value: 'INCOMPLETE', label: 'Incomplete' },
    { value: 'SUBMITTED', label: 'Pending Review' },
    { value: 'COMPLETE', label: 'Verified' },
  ];

  return (
    <div className={cn('space-y-8', !skipPageEnterAnimation && 'animate-in fade-in duration-200')}>
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-primary font-bold text-xs uppercase tracking-[0.2em] mb-1">
            <Users className="h-3.5 w-3.5" /> Student List
          </div>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-foreground">
            Students
          </h2>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
          {effectiveSchoolId && isSuperAdmin && (
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
            disabled={!visibleStudents.length}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-card hover:bg-muted border border-border text-foreground rounded-xl text-sm font-bold transition-all shadow-sm w-full sm:w-auto disabled:opacity-50"
          >
            <Download className="h-4 w-4 shrink-0" /> Export CSV
          </button>
          <button
            type="button"
            disabled={!effectiveSchoolId}
            onClick={() => {
              if (!effectiveSchoolId) {
                toast.error(isSuperAdmin ? 'Select a school first' : 'School not configured');
                return;
              }
              setShowImportDialog(true);
            }}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-card hover:bg-muted border border-border text-foreground rounded-xl text-sm font-bold transition-all shadow-sm w-full sm:w-auto disabled:opacity-50"
          >
            <FileSpreadsheet className="h-4 w-4 shrink-0" /> Import Excel
          </button>
          <button
            type="button"
            onClick={() => void openCreateStudent()}
            className="group relative flex items-center justify-center gap-2 px-6 py-3.5 bg-primary text-primary-foreground rounded-2xl text-sm font-black shadow-xl shadow-primary/20 hover:shadow-primary/40 active:scale-95 transition-all overflow-hidden w-full sm:w-auto"
          >
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

      {!effectiveSchoolId && isSuperAdmin && !viewAllSchools && (
        <div className="panel-empty p-8 text-center text-sm text-muted-foreground">
          Select a school above to view students and generate ID cards.
        </div>
      )}

      {(effectiveSchoolId || viewAllSchools) && (
        <>
      {viewAllSchools && (
        <div className="panel-toolbar px-4 py-3 text-sm font-medium text-muted-foreground border-primary/20 bg-primary/5 rounded-2xl">
          Showing students across <strong className="text-foreground">all schools</strong> — matches dashboard totals.
        </div>
      )}
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
            <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground ml-1">
              {isSuperAdmin ? 'Generate with template' : 'Preview with template'}
            </label>
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
              {viewAllSchools
                ? ' · All schools'
                : selectedSchool && isSuperAdmin
                  ? ` · ${selectedSchool.name}`
                  : ''}
            </span>
          )}
        </div>
      </div>

      <ResponsiveDataView
        className="panel-xl"
        tableOnMobile
        mobile={
          loading ? (
            <ListLoading message="Loading students..." />
          ) : !visibleStudents?.length ? (
            <ListEmpty
              icon={Users}
              title="Zero matches found"
              description="Try refining your filters or enroll a new student."
            />
          ) : (
            visibleStudents.map((s: any) => (
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
                        {s.firstName?.[0]}{formatStudentLastName(s.lastName)?.[0] ?? ''}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-black text-foreground flex items-center gap-2 flex-wrap">
                      {formatStudentFullName(s.firstName, s.lastName)}
                      {s._offline && (
                        <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/25">
                          Offline
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-bold mt-0.5">
                      <Phone className="h-2.5 w-2.5 shrink-0" /> {s.parentPhone || 'No contact'}
                    </div>
                    {viewAllSchools && s.school?.name && (
                      <div className="flex items-center gap-1.5 text-[10px] text-primary font-bold mt-0.5">
                        <Building2 className="h-2.5 w-2.5 shrink-0" /> {s.school.name}
                      </div>
                    )}
                    <div className="mt-2 font-mono text-[11px] font-black px-2 py-1 rounded-lg bg-muted border border-border inline-block">
                      {s.rollNumber || '—'}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="flex items-center gap-1 text-muted-foreground font-bold">
                    <GraduationCap className="h-3.5 w-3.5 text-primary" />
                    {formatClassSectionLabel(s.class?.name, s.section?.name) ||
                      safeLabel(s.class?.name, 'Unassigned')}
                  </span>
                  {(() => {
                    const tpl = resolveStudentTemplateLabel(s, selectedTemplate);
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
                      isStudentIncomplete(s) ? 'bg-red-500/10 text-red-500' :
                      'bg-emerald-500/10 text-emerald-500',
                    )}
                  >
                    {isStudentIncomplete(s) ? 'INCOMPLETE' : 'VERIFIED'}
                  </span>
                </div>
                <div className={cn(rowActionsClass(), 'flex-wrap justify-start pt-1')}>
                  {isSuperAdmin && !isStudentIncomplete(s) && s.status !== 'APPROVED' && (
                    <button
                      type="button"
                      onClick={() => statusMutation.mutate({ id: s.id, status: 'APPROVED' })}
                      className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-500"
                      aria-label="Approve"
                    >
                      <Check className="h-4 w-4" />
                    </button>
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
                <th className="p-6 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">Roll No.</th>
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
              ) : !visibleStudents || visibleStudents.length === 0 ? (
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
              ) : visibleStudents.map((s: any) => (
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
                            {s.firstName?.[0]}{formatStudentLastName(s.lastName)?.[0] ?? ''}
                          </div>
                        )}
                        <div className="absolute inset-0 ring-1 ring-inset ring-white/10" />
                      </div>
                      <div>
                        <div className="font-black text-foreground text-base group-hover/row:text-primary transition-colors">
                          {formatStudentFullName(s.firstName, s.lastName)}
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-bold uppercase tracking-tight mt-0.5">
                          <Phone className="h-2.5 w-2.5" /> {s.parentPhone || 'No contact'}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="p-6">
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-card border border-border font-mono text-[11px] font-black text-foreground shadow-sm">
                      {s.rollNumber || '—'}
                    </div>
                  </td>
                  <td className="p-6">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-sm font-black text-foreground">
                        <GraduationCap className="h-3.5 w-3.5 text-primary" />
                        {safeLabel(s.class?.name, 'Unassigned')}
                      </div>
                      {formatSectionName(s.section?.name) ? (
                        <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest pl-5">
                          Section {formatSectionName(s.section?.name)}
                        </div>
                      ) : null}
                    </div>
                  </td>
                  <td className="p-6">
                    {(() => {
                      const tpl = resolveStudentTemplateLabel(s, selectedTemplate);
                      if (!tpl) {
                        return <span className="text-xs text-muted-foreground font-bold">No template</span>;
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
                      isStudentIncomplete(s)
                        ? "bg-red-500/10 text-red-500 ring-1 ring-red-500/20"
                        : "bg-emerald-500/10 text-emerald-500 ring-1 ring-emerald-500/20"
                    )}>
                      <div className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        isStudentIncomplete(s) ? "bg-red-500" : "bg-emerald-500 animate-pulse"
                      )} />
                      {isStudentIncomplete(s) ? 'INCOMPLETE' : 'VERIFIED'}
                    </div>
                  </td>
                  <td className="p-6 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {isSuperAdmin && !isStudentIncomplete(s) && s.status !== 'APPROVED' && (
                        <button
                          onClick={() => statusMutation.mutate({ id: s.id, status: 'APPROVED' })}
                          className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500 hover:text-white transition-all shadow-sm"
                          title="Approve student"
                        >
                          <Check className="h-4 w-4" />
                        </button>
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
                      {viewStudent.firstName?.[0]}{formatStudentLastName(viewStudent.lastName)?.[0] ?? ''}
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className="text-xl font-black text-foreground truncate">
                    {formatStudentFullName(viewStudent.firstName, viewStudent.lastName)}
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
                  <p className="font-bold text-foreground">{formatSectionName(viewStudent.section?.name)}</p>
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
                const tpl = resolveStudentTemplateLabel(viewStudent, selectedTemplate);
                if (!tpl) return null;
                const generated = latestTemplateLabel(viewStudent);
                return (
                  <p className="text-xs text-muted-foreground font-bold">
                    {generated ? 'Latest ID card' : 'Template'}: {tpl.name} · {tpl.code}
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
              {!(viewStudent.status === 'APPROVED' && !isSuperAdmin) && (
                <button
                  type="button"
                  onClick={() => openEditStudent(viewStudent)}
                  className="px-4 py-2.5 rounded-xl text-sm font-bold bg-card border border-border hover:bg-muted transition-colors flex items-center gap-2"
                >
                  <Pencil className="h-4 w-4" />
                  Edit
                </button>
              )}
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

      {cardPreviewOpen && previewTemplate && viewStudent && (
        <div className="fixed inset-0 z-[110] bg-background">
          <IdCardDesigner
            bgUrl={previewTemplate.frontBgUrl || ''}
            elements={normalizeFrontConfig(previewTemplate.frontConfig)}
            templateName={`${previewTemplate.name} - ${viewStudent.firstName} (PREVIEW)`}
            orientation={previewTemplate.orientation === 'VERTICAL' ? 'VERTICAL' : 'HORIZONTAL'}
            student={viewStudent}
            schoolId={effectiveSchoolId || undefined}
            restrictedPreview={!isSuperAdmin}
            onClose={() => {
              setCardPreviewOpen(false);
              setPreviewTemplate(null);
            }}
          />
        </div>
      )}

      {/* Enrollment Modal (Full Screen Glassmorphism) */}
      {showCreate && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:p-4">
          <div
            className={MODAL_BACKDROP}
            onClick={closeEnrollModal}
          />
          <div
            className={cn(
              'relative bg-card border border-border w-full max-w-4xl max-h-[92vh] sm:max-h-[90vh] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.2)] flex flex-col min-h-0',
              'rounded-t-[2rem] sm:rounded-[3rem] border-b-0 sm:border-b',
              modalPanelClass(),
            )}
          >
            <div className="flex justify-center pt-3 pb-1 sm:hidden shrink-0">
              <span className="h-1 w-10 rounded-full bg-border" aria-hidden />
            </div>
            {/* Modal Header */}
            <div className="p-8 border-b border-border flex justify-between items-center bg-muted/50 sticky top-0 z-20">
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 bg-primary/10 rounded-2xl flex items-center justify-center">
                  <Users className="h-7 w-7 text-primary" />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-foreground">
                    {editingStudentId ? 'Edit Student' : 'Add New Student'}
                  </h3>
                  <p className="text-muted-foreground text-sm font-medium">
                    {editingStudentId
                      ? 'Update the student details below and save your changes.'
                      : 'Enter the Student Details'}
                  </p>
                </div>
              </div>
              <button type="button" onClick={closeEnrollModal} className="p-3 hover:bg-muted rounded-2xl transition-colors">
                <X className="h-6 w-6 text-muted-foreground" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-8 custom-scrollbar">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                {/* Visual Identity Section */}
                <div className="lg:col-span-4 space-y-6">
                  <StudentPhotoPicker
                    preview={photoPreview}
                    onPhotoChange={handlePhotoSelected}
                    enablePhotoEditor={showCreate}
                  />
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
                            if (schoolId) {
                              void queryClient.prefetchQuery({
                                queryKey: classesQueryKey(schoolId),
                                queryFn: () => fetchClassesPicker(schoolId),
                                staleTime: classesQueryStaleTime(),
                              });
                            }
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

                    {/* Academic placement (optional) */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-1">
                        Class
                      </label>
                      <select
                        value={form.classId}
                        onChange={(e) => {
                          const cid = e.target.value;
                          setForm({ ...form, classId: cid, sectionId: '' });
                          const cls = enrollClasses.find((c: { id: string }) => c.id === cid);
                          setSections(
                            (cls?.sections || []).filter(
                              (s: { name?: string }) => !isPlaceholderSectionName(s.name),
                            ),
                          );
                        }}
                        className="w-full px-5 py-4 bg-card border border-border rounded-2xl text-sm font-bold focus:ring-4 focus:ring-primary/10 outline-none transition-all shadow-sm"
                      >
                        <option value="">
                          {enrollClassesLoading ? 'Loading classes…' : 'Select class'}
                        </option>
                        {enrollClasses.map((c: { id: string; name: string }) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-1">
                        Section <span className="normal-case font-bold text-muted-foreground/70">(optional)</span>
                      </label>
                      <select
                        value={form.sectionId}
                        onChange={(e) => setForm({ ...form, sectionId: e.target.value })}
                        disabled={!form.classId}
                        className="w-full px-5 py-4 bg-card border border-border rounded-2xl text-sm font-bold focus:ring-4 focus:ring-primary/10 outline-none transition-all shadow-sm disabled:opacity-50"
                      >
                        <option value="">No section</option>
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
                        Last name
                      </label>
                      <input
                        value={form.lastName}
                        onChange={(e) => setForm({ ...form, lastName: e.target.value })}
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

                    {/* Parent / guardian */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-1">
                        Parent / guardian name
                      </label>
                      <input
                        value={form.parentName}
                        onChange={(e) => setForm({ ...form, parentName: e.target.value })}
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
                        inputMode="numeric"
                        autoComplete="tel"
                        maxLength={10}
                        pattern="\d{10}"
                        value={form.parentPhone}
                        onChange={(e) =>
                          setForm({ ...form, parentPhone: sanitizeIndianMobileInput(e.target.value) })
                        }
                        required
                        className="w-full px-5 py-4 bg-card border border-border rounded-2xl text-sm font-bold focus:ring-4 focus:ring-primary/10 outline-none transition-all shadow-sm font-mono tracking-wide"
                        placeholder="10-digit mobile"
                      />
                      <p className="text-[10px] text-muted-foreground ml-1">Numbers only · exactly 10 digits</p>
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
                            Aadhar Card
                          </label>
                          <input
                            value={form.aadharCard}
                            onChange={(e) => setForm({ ...form, aadharCard: e.target.value })}
                            inputMode="numeric"
                            maxLength={12}
                            className="w-full px-5 py-4 bg-card border border-border rounded-2xl text-sm font-bold focus:ring-4 focus:ring-primary/10 outline-none transition-all shadow-sm font-mono"
                            placeholder="12-digit Aadhar number"
                          />
                        </div>
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
                      onClick={closeEnrollModal} 
                      className="px-8 py-4 text-sm font-black uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Dismiss
                    </button>
                    <button 
                      type="submit" 
                      disabled={createMutation.isPending || updateMutation.isPending} 
                      className="px-10 py-4 bg-primary text-primary-foreground rounded-2xl text-sm font-black uppercase tracking-widest shadow-xl shadow-primary/20 hover:shadow-primary/40 active:scale-95 disabled:opacity-50 flex items-center gap-3 transition-all"
                    >
                      {(createMutation.isPending || updateMutation.isPending) ? (
                        <>
                          <Loader2 className="h-5 w-5 animate-spin" />
                          {editingStudentId ? 'SAVING...' : 'ADDING...'}
                        </>
                      ) : (
                        editingStudentId ? 'SAVE CHANGES' : 'ADD STUDENT'
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      <GenerateCardsDialog
        open={showGenerateDialog}
        onClose={() => setShowGenerateDialog(false)}
        studentCount={visibleStudents.length}
        isSubmitting={generateMutation.isPending}
        driveAvailable={driveStatus?.canUpload ?? false}
        onDownload={() => generateMutation.mutate('download')}
        onGoogleDrive={() => generateMutation.mutate('drive')}
      />

      <StudentExcelImportDialog
        open={showImportDialog}
        onClose={() => setShowImportDialog(false)}
        schoolId={effectiveSchoolId}
        schoolName={
          isSuperAdmin
            ? schools.find((s) => s.id === effectiveSchoolId)?.name
            : undefined
        }
      />

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
