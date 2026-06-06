'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { toast } from 'sonner';
import { 
  CreditCard, Loader2, Play, Users,
  Settings, Layers,
  Zap, X, Building2, Pencil, Phone, GraduationCap,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { DesignerLoadingOverlay } from '@/components/designer/DesignerLoadingOverlay';
import { cn, resolveMediaUrl, formatSectionName, formatStudentFullName, formatStudentLastName } from '@/lib/utils';
import { normalizeFrontConfig } from '@/lib/template-utils';
import { fetchTemplateWithConfig } from '@/lib/fetch-template-detail';
import { queryKeys } from '@/lib/query-keys';
import {
  classesQueryKey,
  classesQueryStaleTime,
  fetchClassesPicker,
  getCachedClassesForSchool,
} from '@/lib/classes-query';
import { fetchSchoolsPicker, getCachedSchoolsPicker } from '@/lib/schools-query';
import { offlineStore } from '@/lib/offline-store';
import { useOfflineSync } from '@/hooks/use-offline-sync';
import { useMergedStudents } from '@/hooks/use-merged-students';
import { GenerateCardsDialog } from '@/components/id-cards/GenerateCardsDialog';
import {
  generateIdCards,
  triggerIdCardDownload,
  fetchDriveStatus,
  type GenerateDestination,
} from '@/lib/generate-id-cards';
import { saveEditStudentIntent } from '@/lib/students-navigation';
import { MODAL_BACKDROP, modalPanelClass } from '@/lib/modal-motion';

const IdCardDesigner = dynamic(
  () => import('@/components/designer/IdCardDesigner').then((m) => m.IdCardDesigner),
  { ssr: false, loading: () => <DesignerLoadingOverlay /> },
);

const ALL_CLASSES = '__all__';
const ALL_SECTIONS = '__all__';

function safeLabel(value: string | null | undefined, fallback: string) {
  return value?.trim() ? value : fallback;
}

async function fetchStudentsForBatch(params: {
  schoolId: string;
  classId?: string;
  sectionId?: string;
}) {
  const limit = 200;
  let page = 1;
  let totalPages = 1;
  const all: any[] = [];

  do {
    const query: Record<string, string | number> = {
      schoolId: params.schoolId,
      limit,
      page,
    };
    if (params.classId) query.classId = params.classId;
    if (params.sectionId) query.sectionId = params.sectionId;

    const { data } = await api.get('/students', { params: query });
    all.push(...(data.data || []));
    totalPages = data.totalPages ?? 1;
    page += 1;
  } while (page <= totalPages);

  return all;
}

export default function IdCardsPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const { isOffline, pendingCount, offlineStudentCount } = useOfflineSync();
  const offlineRefreshKey = pendingCount + offlineStudentCount + (isOffline ? 1 : 0);
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const [selectedSchoolId, setSelectedSchoolId] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedSection, setSelectedSection] = useState('');
  const [viewStudent, setViewStudent] = useState<any | null>(null);
  const [cardPreviewOpen, setCardPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<{
    name: string;
    frontBgUrl?: string;
    orientation: string;
    frontConfig?: unknown;
  } | null>(null);
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);

  const effectiveSchoolId = isSuperAdmin ? selectedSchoolId : (user?.schoolId || '');

  useEffect(() => {
    router.prefetch('/students');
  }, [router]);

  const { data: schools = [] } = useQuery({
    queryKey: queryKeys.schools.picker,
    queryFn: fetchSchoolsPicker,
    placeholderData: getCachedSchoolsPicker,
    enabled: isSuperAdmin,
  });

  useEffect(() => {
    if (!isSuperAdmin || schools.length === 0) return;
    const saved = localStorage.getItem('idcards_selected_school_id');
    const valid = saved && schools.some((s) => s.id === saved);
    setSelectedSchoolId(valid ? saved! : schools[0].id);
  }, [isSuperAdmin, schools]);

  useEffect(() => {
    if (isSuperAdmin && selectedSchoolId) {
      localStorage.setItem('idcards_selected_school_id', selectedSchoolId);
    }
  }, [isSuperAdmin, selectedSchoolId]);

  useEffect(() => {
    setSelectedTemplate('');
    setSelectedClass('');
    setSelectedSection('');
  }, [effectiveSchoolId]);

  // Queries
  const { data: templates = [] } = useQuery({
    queryKey: ['templates', effectiveSchoolId],
    queryFn: async () => {
      if (!effectiveSchoolId) return [];
      const { data } = await api.get('/templates', {
        params: { schoolId: effectiveSchoolId },
      });
      offlineStore.cacheTemplates(effectiveSchoolId, data);
      return data;
    },
    enabled: !!effectiveSchoolId,
  });

  const { data: classes = [] } = useQuery({
    queryKey: classesQueryKey(effectiveSchoolId),
    queryFn: () => fetchClassesPicker(effectiveSchoolId),
    enabled: !!effectiveSchoolId,
    staleTime: classesQueryStaleTime(),
    placeholderData: () => getCachedClassesForSchool(effectiveSchoolId),
  });

  const { data: studentsRaw = [], isLoading: loadingStudents } = useQuery({
    queryKey: ['students-batch', effectiveSchoolId, selectedClass, selectedSection],
    queryFn: async () => {
      if (!effectiveSchoolId || !selectedClass || !selectedSection) return [];
      return fetchStudentsForBatch({
        schoolId: effectiveSchoolId,
        classId: selectedClass === ALL_CLASSES ? undefined : selectedClass,
        sectionId: selectedSection === ALL_SECTIONS ? undefined : selectedSection,
      });
    },
    enabled: !!effectiveSchoolId && !!selectedClass && !!selectedSection,
  });

  const students = useMergedStudents(
    studentsRaw,
    {
      schoolId: effectiveSchoolId,
      classId:
        selectedClass && selectedClass !== ALL_CLASSES ? selectedClass : undefined,
      sectionId:
        selectedSection && selectedSection !== ALL_SECTIONS ? selectedSection : undefined,
    },
    offlineRefreshKey,
    classes,
  );

  // Mutations
  const generateMutation = useMutation({
    mutationFn: async (destination: GenerateDestination) => {
      return generateIdCards({
        templateId: selectedTemplate,
        studentIds: students.map((s: { id: string }) => s.id),
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
          toast.info(data.message || 'Generation queued — will run when you are back online');
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
      queryClient.invalidateQueries({ queryKey: ['students-batch'] });
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Failed to remove student');
    },
  });

  const handleDeleteStudent = (s: { id: string; firstName?: string; lastName?: string }) => {
    if (!confirm(`Remove ${s.firstName ?? ''} ${s.lastName ?? ''}? This cannot be undone.`)) return;
    deleteMutation.mutate(s.id);
  };

  const openEditStudent = (student: Record<string, unknown> & { id: string; schoolId?: string }) => {
    saveEditStudentIntent(student as Parameters<typeof saveEditStudentIntent>[0]);
    setViewStudent(null);
    const schoolId = student.schoolId || effectiveSchoolId;
    if (schoolId) {
      void queryClient.prefetchQuery({
        queryKey: classesQueryKey(schoolId),
        queryFn: () => fetchClassesPicker(schoolId),
        staleTime: classesQueryStaleTime(),
      });
    }
    router.push('/students');
  };

  const openCardPreview = async () => {
    if (!selectedTemplate) {
      toast.error('Select a template to preview');
      return;
    }
    setPreviewLoading(true);
    try {
      const tpl = await fetchTemplateWithConfig<{
        name: string;
        frontBgUrl?: string;
        orientation: string;
        frontConfig?: unknown;
      }>(selectedTemplate);
      setPreviewTemplate(tpl);
      setCardPreviewOpen(true);
    } catch {
      toast.error('Failed to load template for preview');
    } finally {
      setPreviewLoading(false);
    }
  };

  const studentPhotoSrc = (photoUrl?: string | null) => (photoUrl ? resolveMediaUrl(photoUrl) : '');

  const canGenerate =
    isSuperAdmin &&
    !!selectedTemplate &&
    !!selectedClass &&
    !!selectedSection &&
    students.length > 0 &&
    !generateMutation.isPending;

  const canPreview =
    !!selectedTemplate && !!selectedClass && !!selectedSection && students.length > 0;

  const handleGenerate = () => {
    if (!isSuperAdmin) return;
    if (!effectiveSchoolId) {
      toast.error('Select a school first');
      return;
    }
    if (!selectedTemplate) {
      toast.error('Select a template first');
      return;
    }
    if (!selectedClass || !selectedSection) {
      toast.error('Select a class and section (or All Classes / All Sections)');
      return;
    }
    if (students.length === 0) {
      toast.error('No students found for this selection');
      return;
    }
    setShowGenerateDialog(true);
  };

  useEffect(() => {
    if (templates.length === 1 && !selectedTemplate) {
      setSelectedTemplate(templates[0].id);
    }
  }, [templates, selectedTemplate]);

  const activeClass = classes.find((c: any) => c.id === selectedClass);
  const sections = activeClass?.sections || [];
  const selectedSchool = schools.find((s) => s.id === effectiveSchoolId);

  const selectionLabel = (() => {
    if (!selectedClass || !selectedSection) return 'No Selection';
    const classLabel = selectedClass === ALL_CLASSES ? 'All Classes' : activeClass?.name ?? 'Class';
    const sectionLabel =
      selectedSection === ALL_SECTIONS
        ? 'All Sections'
        : sections.find((s: { id: string }) => s.id === selectedSection)?.name ?? 'Section';
    return `${classLabel} · ${sectionLabel}`;
  })();

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      {isSuperAdmin && (
        <div className="panel-toolbar rounded-2xl p-4 flex flex-col sm:flex-row gap-3 sm:items-center">
          <div className="flex items-center gap-2 text-primary font-bold text-xs uppercase tracking-wider shrink-0">
            <Building2 className="h-4 w-4" /> School
          </div>
          <select
            value={selectedSchoolId}
            onChange={(e) => setSelectedSchoolId(e.target.value)}
            className="flex-1 px-4 py-2.5 bg-background border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            {schools.length === 0 ? (
              <option value="">Loading schools…</option>
            ) : (
              schools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))
            )}
          </select>
          {selectedSchool && (
            <span className="text-xs text-muted-foreground">
              Generating cards for <strong className="text-foreground">{selectedSchool.name}</strong>
            </span>
          )}
        </div>
      )}

      {!effectiveSchoolId && isSuperAdmin && (
        <div className="panel-empty p-8 text-center text-sm text-muted-foreground">
          Select a school to load templates and students.
        </div>
      )}

      {effectiveSchoolId && (
      <>
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-primary font-bold text-xs uppercase tracking-[0.2em] mb-1">
            <Zap className="h-3.5 w-3.5 fill-primary/20" />{' '}
            {isSuperAdmin ? 'Generate Cards' : 'Preview Cards'}
          </div>
          <h2 className="text-4xl font-black tracking-tight text-foreground">
            ID Card Generator
          </h2>
          <p className="text-muted-foreground text-sm font-medium">
            {isSuperAdmin
              ? 'Select a class and template, then download PNG/ZIP or upload to Google Drive.'
              : 'Select a class and template, then use Preview on each student to view their card.'}
          </p>
        </div>
        {isSuperAdmin && (
          <button
            disabled={!canGenerate}
            onClick={handleGenerate}
            className="group relative flex items-center gap-3 px-8 py-4 bg-primary text-primary-foreground rounded-2xl text-sm font-black shadow-2xl shadow-primary/30 hover:shadow-primary/50 active:scale-95 disabled:opacity-50 transition-all overflow-hidden shrink-0"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
            {generateMutation.isPending ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Play className="h-5 w-5" />
            )}
            GENERATE CARDS
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
        {/* Left: Configuration Panel */}
        <div className="xl:col-span-4 space-y-6">
          <div className="panel-toolbar rounded-[2.5rem] p-8 shadow-sm space-y-8">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 bg-primary/10 rounded-xl flex items-center justify-center">
                <Settings className="h-5 w-5 text-primary" />
              </div>
              <h3 className="text-xl font-black text-foreground">Settings</h3>
            </div>

            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-1">Choose Template</label>
                <div className="grid grid-cols-1 gap-2">
                  {templates.map((t: any) => (
                    <button 
                      key={t.id}
                      onClick={() => setSelectedTemplate(t.id)}
                      className={cn(
                        "flex items-center justify-between p-4 rounded-2xl border transition-all text-left",
                        selectedTemplate === t.id 
                          ? "bg-primary/5 border-primary text-primary shadow-lg shadow-primary/5" 
                          : "bg-muted border-border text-muted-foreground hover:bg-muted"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <Layers className="h-4 w-4" />
                        <span className="text-sm font-bold">{t.name}</span>
                      </div>
                      <div className="text-[10px] font-black uppercase tracking-widest px-2 py-1 bg-background/50 rounded-lg">
                        {t.orientation}
                      </div>
                    </button>
                  ))}
                  {templates.length === 0 && (
                    <p className="text-xs font-medium text-muted-foreground p-4 bg-muted/30 rounded-2xl border border-dashed text-center">
                      No templates detected
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-1">Select Students</label>
                <div className="space-y-3">
                  <select 
                    value={selectedClass} 
                    onChange={e => {
                      const value = e.target.value;
                      setSelectedClass(value);
                      setSelectedSection(value === ALL_CLASSES ? ALL_SECTIONS : '');
                    }}
                    className="w-full px-5 py-4 bg-card border border-border rounded-2xl text-sm font-bold focus:ring-4 focus:ring-primary/10 outline-none transition-all shadow-sm"
                  >
                    <option value="">Select Class</option>
                    <option value={ALL_CLASSES}>All Classes</option>
                    {classes.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  
                  <select 
                    value={selectedSection} 
                    onChange={e => setSelectedSection(e.target.value)}
                    disabled={!selectedClass || selectedClass === ALL_CLASSES}
                    className="w-full px-5 py-4 bg-card border border-border rounded-2xl text-sm font-bold focus:ring-4 focus:ring-primary/10 outline-none transition-all shadow-sm disabled:opacity-50"
                  >
                    <option value="">Select Section</option>
                    <option value={ALL_SECTIONS}>All Sections</option>
                    {selectedClass !== ALL_CLASSES &&
                      sections.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div className="pt-4">
              <div className="p-6 bg-primary/5 rounded-3xl border border-primary/10 space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Selected Students</span>
                  <span className="text-lg font-black text-primary">{students.length}</span>
                </div>
                <div className="h-1 w-full bg-primary/10 rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all" style={{ width: students.length > 0 ? '100%' : '0%' }} />
                </div>
                <p className="text-[10px] font-medium text-muted-foreground text-center">
                  {isSuperAdmin
                    ? 'Super admin: PNG images render and upload to Google Drive.'
                    : 'Use View on each student to preview their ID card.'}
                </p>
                {isSuperAdmin ? (
                  <button
                    type="button"
                    disabled={!canGenerate}
                    onClick={handleGenerate}
                    className="w-full flex items-center justify-center gap-2 py-4 bg-primary text-primary-foreground rounded-2xl text-sm font-black uppercase tracking-widest shadow-lg shadow-primary/20 hover:opacity-90 active:scale-[0.98] disabled:opacity-50 transition-all"
                  >
                    {generateMutation.isPending ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Play className="h-5 w-5" />
                    )}
                    Generate cards
                  </button>
                ) : (
                  <p className="text-center text-xs font-bold text-muted-foreground py-2">
                    {canPreview
                      ? `${students.length} student(s) ready to preview`
                      : 'Choose template, class, and section'}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Students List/Preview */}
        <div className="xl:col-span-8 space-y-6">
          <div className="panel-xl min-h-[600px] flex flex-col min-w-0">
            <div className="p-8 border-b border-border bg-muted/20 flex justify-between items-center">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 bg-white rounded-2xl flex items-center justify-center shadow-lg">
                  <Users className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-foreground">Student List</h3>
                  <p className="text-muted-foreground text-xs font-medium uppercase tracking-widest">
                    {selectionLabel}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex-1 min-h-0 min-w-0 overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]">
              {loadingStudents ? (
                <div className="p-24 text-center">
                  <div className="flex flex-col items-center gap-4">
                    <div className="h-12 w-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                    <p className="text-sm font-black text-muted-foreground uppercase tracking-widest">Loading Batch Records...</p>
                  </div>
                </div>
              ) : students.length === 0 ? (
                <div className="p-32 text-center space-y-6">
                  <div className="relative inline-block">
                    <div className="absolute inset-0 bg-primary/10 blur-3xl rounded-full" />
                    <div className="relative h-24 w-24 bg-card border border-border rounded-[2rem] flex items-center justify-center shadow-2xl rotate-6 mx-auto">
                      <CreditCard className="h-10 w-10 text-muted-foreground/30" />
                    </div>
                  </div>
                  <div>
                    <h4 className="text-xl font-black text-foreground">Please select settings</h4>
                    <p className="text-muted-foreground text-sm font-medium max-w-xs mx-auto">
                      Select a template and student group from the settings to start.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-2 inline-block min-w-full">
                  <table className="w-full text-left border-collapse min-w-[640px]">
                    <thead>
                      <tr className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">
                        <th className="p-4 sm:p-6 whitespace-nowrap">Student Name</th>
                        <th className="p-4 sm:p-6 whitespace-nowrap">Roll No</th>
                        <th className="p-4 sm:p-6 whitespace-nowrap">Class</th>
                        <th className="p-4 sm:p-6 whitespace-nowrap">Section</th>
                        <th className="p-4 sm:p-6 text-right whitespace-nowrap">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30">
                      {students.map((s: any) => (
                        <tr key={s.id} className="group/row hover:bg-muted/30 transition-all">
                          <td className="p-4 sm:p-6 whitespace-nowrap">
                            <div className="flex items-center gap-4">
                              <div className="h-10 w-10 rounded-xl overflow-hidden shadow-sm border border-border bg-muted">
                                {s.photoUrl ? (
                                  <img 
                                    src={studentPhotoSrc(s.photoUrl)} 
                                    alt="" 
                                    className="h-full w-full object-cover" 
                                  />
                                ) : (
                                  <div className="h-full w-full flex items-center justify-center text-xs font-black text-primary/30">
                                    {s.firstName?.[0]}{formatStudentLastName(s.lastName)?.[0] ?? ''}
                                  </div>
                                )}
                              </div>
                              <div className="font-black text-foreground group-hover/row:text-primary transition-colors">
                                {formatStudentFullName(s.firstName, s.lastName)}
                              </div>
                            </div>
                          </td>
                          <td className="p-4 sm:p-6 whitespace-nowrap">
                            <span className="font-mono text-xs font-black text-muted-foreground px-3 py-1.5 rounded-lg bg-muted border border-border whitespace-nowrap">
                              {s.rollNumber || '—'}
                            </span>
                          </td>
                          <td className="p-4 sm:p-6 whitespace-nowrap">
                            <div className="flex items-center gap-2 text-sm font-black text-foreground">
                              <GraduationCap className="h-3.5 w-3.5 text-primary shrink-0" />
                              {safeLabel(s.class?.name, 'Unassigned')}
                            </div>
                          </td>
                          <td className="p-4 sm:p-6 whitespace-nowrap">
                            <span className="text-sm font-bold text-foreground">
                              {formatSectionName(s.section?.name)}
                            </span>
                          </td>
                          <td className="p-4 sm:p-6 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => setViewStudent(s)}
                              className="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-card border border-border text-muted-foreground hover:text-primary hover:border-primary/30 hover:shadow-lg transition-all"
                            >
                              View
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Student detail — bottom sheet on mobile, centered on desktop */}
      {viewStudent && !cardPreviewOpen && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:p-4">
          <div
            className={MODAL_BACKDROP}
            onClick={() => setViewStudent(null)}
          />
          <div
            className={cn(
              'relative bg-card border border-border w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[92vh]',
              'rounded-t-[2rem] sm:rounded-3xl border-b-0 sm:border-b',
              modalPanelClass(),
            )}
          >
            <div className="flex justify-center pt-3 pb-1 sm:hidden shrink-0">
              <span className="h-1 w-10 rounded-full bg-border" aria-hidden />
            </div>
            <div className="p-6 border-b border-border flex justify-between items-start gap-4 shrink-0">
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
                    Roll {viewStudent.rollNumber || '—'} · Adm {viewStudent.admissionNumber || '—'}
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
            <div className="p-6 space-y-4 text-sm overflow-y-auto flex-1 min-h-0">
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
                  <p className="font-bold text-foreground">{viewStudent.status || '—'}</p>
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
            </div>
            <div className="p-6 border-t border-border flex flex-wrap gap-3 justify-end bg-muted/30 shrink-0 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:pb-6">
              <button
                type="button"
                onClick={() => handleDeleteStudent(viewStudent)}
                disabled={deleteMutation.isPending || previewLoading}
                className="px-4 py-2.5 rounded-xl text-sm font-bold text-red-600 hover:bg-red-500/10 transition-colors disabled:opacity-50"
              >
                Remove
              </button>
              {!(viewStudent.status === 'APPROVED' && !isSuperAdmin) && (
                <button
                  type="button"
                  onClick={() => openEditStudent(viewStudent)}
                  disabled={previewLoading}
                  className="px-4 py-2.5 rounded-xl text-sm font-bold bg-card border border-border hover:bg-muted transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  <Pencil className="h-4 w-4" />
                  Edit
                </button>
              )}
              <button
                type="button"
                onClick={() => void openCardPreview()}
                disabled={!selectedTemplate || previewLoading}
                className="px-4 py-2.5 rounded-xl text-sm font-bold bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {previewLoading && <Loader2 className="h-4 w-4 animate-spin" />}
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

      {/* Designer Preview Overlay */}
      {cardPreviewOpen && previewTemplate && viewStudent && (
        <div className="fixed inset-0 z-[110] bg-background">
          <IdCardDesigner
            bgUrl={previewTemplate.frontBgUrl || ''}
            elements={normalizeFrontConfig(previewTemplate.frontConfig)}
            templateName={`${previewTemplate.name} - ${viewStudent.firstName} (PREVIEW)`}
            orientation={previewTemplate.orientation === 'VERTICAL' ? 'VERTICAL' : 'HORIZONTAL'}
            student={viewStudent}
            restrictedPreview={!isSuperAdmin}
            onClose={() => {
              setCardPreviewOpen(false);
              setPreviewTemplate(null);
            }}
          />
        </div>
      )}

      </>
      )}

      <GenerateCardsDialog
        open={showGenerateDialog}
        onClose={() => setShowGenerateDialog(false)}
        studentCount={students.length}
        isSubmitting={generateMutation.isPending}
        driveAvailable={driveStatus?.canUpload ?? false}
        onDownload={() => generateMutation.mutate('download')}
        onGoogleDrive={() => generateMutation.mutate('drive')}
      />
    </div>
  );
}
