'use client';

import { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/auth-store';
import {
  Plus, Trash2, Loader2, Image as ImageIcon,
  Settings2, Layout, Palette, X, School, Search, Upload, Copy, Layers,
} from 'lucide-react';
import { DesignerLoadingOverlay } from '@/components/designer/DesignerLoadingOverlay';
import { fetchTemplateWithConfig } from '@/lib/fetch-template-detail';
import { queryKeys } from '@/lib/query-keys';
import { fetchSchoolsPicker, getCachedSchoolsPicker, type SchoolPickerOption } from '@/lib/schools-query';
import { offlineGetCache } from '@/lib/offline-get-cache';
import { offlineStore } from '@/lib/offline-store';
import { useNextPageParams, type NextClientPageProps } from '@/lib/next-page-params';

const IdCardDesigner = dynamic(
  () => import('@/components/designer/IdCardDesigner').then((m) => m.IdCardDesigner),
  { ssr: false, loading: () => <DesignerLoadingOverlay /> },
);
import { TemplateBackgroundPicker, createEmptyBackground } from '@/components/designer/TemplateBackgroundPicker';
import { cn, resolveMediaUrl } from '@/lib/utils';
import { normalizeFrontConfig, uploadTemplateBackground } from '@/lib/template-utils';
import { CR80_SIZE_OPTIONS, formatCr80Label } from '@/lib/card-sizes';
import {
  type TemplateBackground,
  encodeBackground,
  parseBackground,
  isValidBackground,
  templateCardBackgroundStyle,
} from '@/lib/background-utils';
interface Template {
  id: string;
  name: string;
  code?: string | null;
  description?: string | null;
  schoolId?: string | null;
  orientation: 'HORIZONTAL' | 'VERTICAL';
  frontBgUrl: string;
  frontConfig?: any[];
  backBgUrl?: string;
  backConfig?: any[];
  school?: { id: string; name: string; code: string };
  _count?: { idCards: number };
}

function templateDisplayCode(tpl: { id: string; code?: string | null }) {
  return tpl.code?.trim() || tpl.id.slice(0, 8).toUpperCase();
}

function suggestDuplicateCode(
  tpl: Template,
  targetSchool?: SchoolPickerOption,
) {
  const base = (tpl.code || tpl.name.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '') || 'TEMPLATE')
    .toUpperCase()
    .slice(0, 24);
  const prefix = targetSchool?.code ? `${targetSchool.code}-` : '';
  return `${prefix}${base}`.slice(0, 40);
}

export default function TemplatesPage({ params }: NextClientPageProps) {
  useNextPageParams(params);
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const [selectedSchoolId, setSelectedSchoolId] = useState('');
  const [designerOpen, setDesignerOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [replacingBgTemplate, setReplacingBgTemplate] = useState<Template | null>(null);
  const [replaceBgDraft, setReplaceBgDraft] = useState<TemplateBackground>(createEmptyBackground());
  const [replaceBgFile, setReplaceBgFile] = useState<File | null>(null);
  const [replaceBgFileName, setReplaceBgFileName] = useState('');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'school' | 'all'>('school');
  /** Optional narrow filter when viewMode is "all" — empty string means every school. */
  const [allSchoolsFilterId, setAllSchoolsFilterId] = useState('');
  const [duplicatingTemplate, setDuplicatingTemplate] = useState<Template | null>(null);
  const [duplicateTargetSchoolId, setDuplicateTargetSchoolId] = useState('');
  const [duplicateName, setDuplicateName] = useState('');
  const [duplicateCode, setDuplicateCode] = useState('');
  const [duplicateCodeTouched, setDuplicateCodeTouched] = useState(false);

  // States for template creation dialog
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateCode, setNewTemplateCode] = useState('');
  const [newTemplateOrientation, setNewTemplateOrientation] = useState<'HORIZONTAL' | 'VERTICAL'>('HORIZONTAL');
  const [newTemplateBackground, setNewTemplateBackground] = useState<TemplateBackground>(createEmptyBackground());
  const [newTemplateBgFile, setNewTemplateBgFile] = useState<File | null>(null);
  const [newTemplateBgFileName, setNewTemplateBgFileName] = useState('');
  const [createTargetSchoolId, setCreateTargetSchoolId] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const { data: schools = [] } = useQuery({
    queryKey: queryKeys.schools.picker,
    queryFn: fetchSchoolsPicker,
    placeholderData: getCachedSchoolsPicker,
    enabled: isSuperAdmin,
  });

  const effectiveSchoolId = isSuperAdmin ? selectedSchoolId : (user?.schoolId || '');

  useEffect(() => {
    if (!isSuperAdmin) {
      if (user?.schoolId) setSelectedSchoolId(user.schoolId);
      return;
    }
    if (schools.length === 0) return;
    const saved = localStorage.getItem('templates_selected_school_id');
    const valid = saved && schools.some((s) => s.id === saved);
    setSelectedSchoolId(valid ? saved! : schools[0].id);
  }, [schools, isSuperAdmin, user?.schoolId]);

  useEffect(() => {
    if (isSuperAdmin && selectedSchoolId) {
      localStorage.setItem('templates_selected_school_id', selectedSchoolId);
    }
  }, [isSuperAdmin, selectedSchoolId]);

  useEffect(() => {
    setSearch('');
  }, [selectedSchoolId, viewMode, allSchoolsFilterId]);

  const selectedSchool = schools.find((s) => s.id === selectedSchoolId);
  const allSchoolsFilter = schools.find((s) => s.id === allSchoolsFilterId);
  /** School used when uploading a new template. */
  const uploadSchoolId = isSuperAdmin
    ? viewMode === 'all'
      ? createTargetSchoolId || allSchoolsFilterId || selectedSchoolId
      : selectedSchoolId
    : effectiveSchoolId;
  const uploadSchool =
    schools.find((s) => s.id === uploadSchoolId) ||
    (user?.school && user.school.id === uploadSchoolId ? user.school : undefined);
  
  // Queries
  const templatesQueryKey =
    viewMode === 'all' ? (['templates', 'all'] as const) : (['templates', effectiveSchoolId] as const);

  const { data: templates = [], isLoading, isFetching } = useQuery({
    queryKey: templatesQueryKey,
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (viewMode === 'school') {
        if (!effectiveSchoolId) return [] as Template[];
        params.schoolId = effectiveSchoolId;
      } else {
        params.allSchools = 'true';
      }
      const { data } = await api.get('/templates', { params });
      const list = data as Template[];
      if (viewMode === 'school' && effectiveSchoolId) {
        offlineStore.cacheTemplates(effectiveSchoolId, list);
      }
      return list;
    },
    placeholderData: () => {
      if (viewMode === 'school' && effectiveSchoolId) {
        const fromStore = offlineStore.getTemplates(effectiveSchoolId);
        if (fromStore) return fromStore as Template[];
        const cached = offlineGetCache.get('/templates', { schoolId: effectiveSchoolId });
        if (Array.isArray(cached)) return cached as Template[];
      }
      if (viewMode === 'all') {
        const cached = offlineGetCache.get('/templates', { allSchools: 'true' });
        if (Array.isArray(cached)) return cached as Template[];
      }
      return undefined;
    },
    enabled: viewMode === 'all' || !!effectiveSchoolId,
  });

  const filteredTemplates = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = templates;
    if (viewMode === 'school' && effectiveSchoolId) {
      list = list.filter((tpl) => tpl.schoolId === effectiveSchoolId);
    } else if (viewMode === 'all' && allSchoolsFilterId) {
      list = list.filter((tpl) => tpl.schoolId === allSchoolsFilterId);
    }
    if (!q) return list;
    return list.filter((tpl) => {
      const name = tpl.name?.toLowerCase() ?? '';
      const code = templateDisplayCode(tpl).toLowerCase();
      const orientation = tpl.orientation?.toLowerCase() ?? '';
      const description = tpl.description?.toLowerCase() ?? '';
      const schoolName = tpl.school?.name?.toLowerCase() ?? '';
      const schoolCode = tpl.school?.code?.toLowerCase() ?? '';
      return (
        name.includes(q) ||
        code.includes(q) ||
        orientation.includes(q) ||
        description.includes(q) ||
        schoolName.includes(q) ||
        schoolCode.includes(q)
      );
    });
  }, [templates, search, viewMode, allSchoolsFilterId, effectiveSchoolId]);

  const duplicateMutation = useMutation({
    mutationFn: async ({
      id,
      targetSchoolId,
      name,
      code,
    }: {
      id: string;
      targetSchoolId: string;
      name: string;
      code: string;
    }) => {
      const { data } = await api.post(`/templates/${id}/duplicate`, {
        targetSchoolId,
        name: name.trim(),
        code: code.trim(),
      });
      return data as Template;
    },
    onSuccess: (created, vars) => {
      toast.success(`Template copied to ${schools.find((s) => s.id === vars.targetSchoolId)?.name ?? 'school'}`);
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      setDuplicatingTemplate(null);
      setDuplicateCodeTouched(false);
      if (vars.targetSchoolId === effectiveSchoolId || viewMode === 'all') {
        setEditingTemplate({
          ...created,
          frontConfig: normalizeFrontConfig(created.frontConfig) as Template['frontConfig'],
        });
        setDesignerOpen(true);
      }
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to duplicate template');
    },
  });

  // Mutations
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/templates/${id}`),
    onSuccess: (_data, deletedId) => {
      toast.success('Template permanently removed');
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      if (editingTemplate?.id === deletedId) {
        setDesignerOpen(false);
        setEditingTemplate(null);
      }
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to delete template'),
  });

  const updateBgMutation = useMutation({
    mutationFn: async ({
      id,
      background,
      file,
    }: {
      id: string;
      background: TemplateBackground;
      file?: File | null;
    }) => {
      let frontBgUrl: string;
      if (background.mode === 'image') {
        if (file) {
          frontBgUrl = await uploadTemplateBackground(file);
        } else if (background.imageUrl && !background.imageUrl.startsWith('blob:') && !background.imageUrl.startsWith('data:')) {
          frontBgUrl = background.imageUrl;
        } else {
          throw new Error('Choose an image for the background');
        }
      } else {
        frontBgUrl = encodeBackground(background);
      }
      const { data } = await api.put(`/templates/${id}`, { frontBgUrl });
      return data as Template;
    },
    onSuccess: (updated) => {
      toast.success('Background updated');
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      if (editingTemplate?.id === updated.id) {
        setEditingTemplate({ ...editingTemplate, frontBgUrl: updated.frontBgUrl });
      }
      setReplacingBgTemplate(null);
      setReplaceBgFile(null);
      setReplaceBgFileName('');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || err.message || 'Failed to update background');
    },
  });

  const handleCreateImageFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file (PNG, JPG, etc.)');
      return;
    }
    setNewTemplateBgFile(file);
    setNewTemplateBgFileName(file.name);
    const reader = new FileReader();
    reader.onloadend = () => {
      setNewTemplateBackground({ mode: 'image', imageUrl: reader.result as string });
    };
    reader.readAsDataURL(file);
  };

  const clearCreateBackground = () => {
    setNewTemplateBgFile(null);
    setNewTemplateBgFileName('');
    setNewTemplateBackground(createEmptyBackground());
  };

  const handleReplaceImageFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file');
      return;
    }
    setReplaceBgFile(file);
    setReplaceBgFileName(file.name);
    const reader = new FileReader();
    reader.onloadend = () => {
      setReplaceBgDraft({ mode: 'image', imageUrl: reader.result as string });
    };
    reader.readAsDataURL(file);
  };

  const clearReplaceImage = () => {
    setReplaceBgFile(null);
    setReplaceBgFileName('');
    if (replacingBgTemplate) {
      setReplaceBgDraft(parseBackground(replacingBgTemplate.frontBgUrl));
    }
  };

  const openReplaceBackground = (tpl: Template) => {
    setReplacingBgTemplate(tpl);
    setReplaceBgDraft(parseBackground(tpl.frontBgUrl));
    setReplaceBgFile(null);
    setReplaceBgFileName('');
  };

  const openDuplicateToSchool = (tpl: Template) => {
    const defaultTarget =
      tpl.schoolId && tpl.schoolId !== selectedSchoolId
        ? selectedSchoolId || schools[0]?.id || ''
        : schools.find((s) => s.id !== tpl.schoolId)?.id || selectedSchoolId || schools[0]?.id || '';
    const targetSchool = schools.find((s) => s.id === defaultTarget);
    setDuplicatingTemplate(tpl);
    setDuplicateTargetSchoolId(defaultTarget);
    setDuplicateName(`${tpl.name} (${targetSchool?.code ?? 'copy'})`);
    setDuplicateCode(suggestDuplicateCode(tpl, targetSchool));
    setDuplicateCodeTouched(false);
  };

  const handleDuplicateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!duplicatingTemplate || !duplicateTargetSchoolId) return;
    if (!duplicateName.trim() || !duplicateCode.trim()) {
      toast.error('Name and template code are required');
      return;
    }
    duplicateMutation.mutate({
      id: duplicatingTemplate.id,
      targetSchoolId: duplicateTargetSchoolId,
      name: duplicateName,
      code: duplicateCode,
    });
  };

  const handleCreateNew = () => {
    if (!uploadSchoolId) {
      toast.error('Select a school first');
      return;
    }
    setNewTemplateName('');
    setNewTemplateCode('');
    setNewTemplateOrientation('HORIZONTAL');
    setNewTemplateBackground(createEmptyBackground());
    setNewTemplateBgFile(null);
    setNewTemplateBgFileName('');
    setCreateTargetSchoolId(uploadSchoolId);
    setShowCreateDialog(true);
  };

  const handleReplaceBgSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replacingBgTemplate) return;
    if (!isValidBackground(replaceBgDraft)) {
      toast.error('Set a valid background (image, solid color, or gradient)');
      return;
    }
    updateBgMutation.mutate({
      id: replacingBgTemplate.id,
      background: replaceBgDraft,
      file: replaceBgFile,
    });
  };

  const handleDesignerSave = async (
    elements: Template['frontConfig'],
    meta?: { side: 'front' | 'back' },
  ) => {
    if (!editingTemplate) return;
    const side = meta?.side ?? 'front';
    const payload =
      side === 'back'
        ? { backConfig: elements }
        : { frontConfig: elements };
    try {
      const { data } = await api.put(`/templates/${editingTemplate.id}`, payload);
      const saved = data as Template;
      setEditingTemplate({
        ...editingTemplate,
        frontConfig:
          side === 'front'
            ? (normalizeFrontConfig(saved.frontConfig) as Template['frontConfig'])
            : editingTemplate.frontConfig,
        backConfig:
          side === 'back'
            ? (normalizeFrontConfig(saved.backConfig) as Template['backConfig'])
            : editingTemplate.backConfig,
      });
      if (side === 'front') {
        toast.success('Front layout saved');
      } else {
        toast.success('Back layout saved');
      }
      queryClient.invalidateQueries({ queryKey: ['templates'] });
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to save template design');
      throw err;
    }
  };

  const handleSaveAs = () => {
    if (!editingTemplate) return;
    openDuplicateToSchool(editingTemplate);
    setDuplicateTargetSchoolId(selectedSchoolId || editingTemplate.schoolId || '');
    const school = schools.find((s) => s.id === (selectedSchoolId || editingTemplate.schoolId));
    setDuplicateName(`${editingTemplate.name} (copy)`);
    setDuplicateCode(suggestDuplicateCode(editingTemplate, school));
    setDuplicateCodeTouched(false);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetSchoolId = isSuperAdmin ? createTargetSchoolId || uploadSchoolId : effectiveSchoolId;
    if (!targetSchoolId) {
      toast.error('Select a school to assign this template');
      return;
    }
    if (!newTemplateName.trim()) {
      toast.error('Please enter a template name');
      return;
    }
    if (!isValidBackground(newTemplateBackground)) {
      toast.error('Choose a background: upload an image, pick a solid color, or create a gradient');
      return;
    }
    
    setIsCreating(true);
    try {
      let frontBgUrl: string;
      if (newTemplateBackground.mode === 'image') {
        if (!newTemplateBgFile) {
          toast.error('Upload a background image');
          setIsCreating(false);
          return;
        }
        frontBgUrl = await uploadTemplateBackground(newTemplateBgFile);
      } else {
        frontBgUrl = encodeBackground(newTemplateBackground);
      }
      
      const { data } = await api.post('/templates', {
        name: newTemplateName.trim(),
        code: newTemplateCode.trim() || undefined,
        orientation: newTemplateOrientation,
        frontBgUrl,
        frontConfig: [],
        schoolId: targetSchoolId,
      });
      
      toast.success(`Template created for ${schools.find((s) => s.id === targetSchoolId)?.name ?? user?.school?.name ?? 'school'}`);
      setShowCreateDialog(false);
      
      // Invalidate templates list query
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      
      if (isSuperAdmin && viewMode === 'school' && targetSchoolId !== selectedSchoolId) {
        setSelectedSchoolId(targetSchoolId);
      }
      
      setEditingTemplate({
        ...data,
        frontConfig: normalizeFrontConfig(data.frontConfig) as Template['frontConfig'],
      });
      setDesignerOpen(true);
    } catch (err: any) {
      console.error('Error creating template:', err);
      toast.error(err.response?.data?.message || 'Failed to create template');
    } finally {
      setIsCreating(false);
    }
  };

  const handleEdit = async (template: Template) => {
    try {
      const data = await fetchTemplateWithConfig<Template>(template.id);
      setEditingTemplate({
        ...data,
        frontConfig: normalizeFrontConfig(data.frontConfig) as Template['frontConfig'],
        backConfig: normalizeFrontConfig(data.backConfig ?? []) as Template['backConfig'],
      });
      setDesignerOpen(true);
    } catch {
      toast.error('Failed to load template');
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 text-primary font-bold text-xs uppercase tracking-[0.2em] mb-1">
            <Layout className="h-3.5 w-3.5 shrink-0" /> School Card Backgrounds
          </div>
          <h2 className="text-4xl font-black tracking-tight text-foreground">
            ID Card Templates
          </h2>
          <p className="text-muted-foreground text-sm font-medium">
            Design layouts per school, assign template codes, and copy the same card design to other schools.
          </p>
          <p className="text-xs text-muted-foreground/90 font-medium pt-1">
            Standard ID card size: <span className="text-foreground font-bold">CR80</span> (credit card).
            Horizontal {formatCr80Label('HORIZONTAL').replace('CR80 · ', '')} · Vertical{' '}
            {formatCr80Label('VERTICAL').replace('CR80 · ', '')}
          </p>
        </div>
        {isSuperAdmin && (
        <button 
          onClick={handleCreateNew}
          disabled={!uploadSchoolId}
          className="group relative flex items-center gap-2 px-6 py-3.5 bg-primary text-primary-foreground rounded-2xl text-sm font-black shadow-xl shadow-primary/20 hover:shadow-primary/40 active:scale-95 transition-all overflow-hidden disabled:opacity-50 shrink-0"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
          <Plus className="h-5 w-5" /> Upload Template
        </button>
        )}
      </div>

      {/* School selector & view mode */}
      <div className="panel-toolbar rounded-2xl p-4 sm:p-5 flex flex-col gap-4">
        {isSuperAdmin && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
          <div className="flex p-1 rounded-xl bg-muted/50 border border-border shrink-0">
            <button
              type="button"
              onClick={() => {
                setViewMode('school');
                setAllSchoolsFilterId('');
              }}
              className={cn(
                'px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all',
                viewMode === 'school' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground',
              )}
            >
              This school
            </button>
            <button
              type="button"
              onClick={() => {
                setViewMode('all');
                setAllSchoolsFilterId('');
              }}
              className={cn(
                'px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all',
                viewMode === 'all' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground',
              )}
            >
              All schools
            </button>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground shrink-0">
            <School className="h-4 w-4" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">
              {viewMode === 'all' ? 'Filter school' : 'School'}
            </span>
          </div>
          <select
            value={viewMode === 'all' ? allSchoolsFilterId : selectedSchoolId}
            onChange={(e) => {
              if (viewMode === 'all') {
                setAllSchoolsFilterId(e.target.value);
              } else {
                setSelectedSchoolId(e.target.value);
              }
            }}
            className="flex-1 min-w-0 px-4 py-3 bg-card border border-border rounded-xl text-sm font-bold focus:ring-4 focus:ring-primary/10 outline-none"
          >
            {schools.length === 0 && <option value="">Loading schools…</option>}
            {viewMode === 'all' && schools.length > 0 && (
              <option value="">All schools</option>
            )}
            {schools.map((s) => (
              <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
            ))}
          </select>
        </div>
        )}
        {!isSuperAdmin && user?.school && (
          <div className="flex items-center gap-2 px-4 py-3 bg-card border border-border rounded-xl">
            <School className="h-4 w-4 text-primary shrink-0" />
            <span className="text-sm font-bold text-foreground">{user.school.name}</span>
            <span className="text-xs font-mono text-muted-foreground">({user.school.code})</span>
          </div>
        )}
        <p className="text-xs text-muted-foreground font-medium">
          {viewMode === 'school' && (selectedSchool || user?.school) ? (
            <>
              Templates for{' '}
              <span className="text-foreground font-bold">
                {selectedSchool?.name ?? user?.school?.name}
              </span>{' '}
              only.
              {isSuperAdmin && (
                <>
                  {' '}
                  Use <span className="font-bold">Copy to school</span> on any card to reuse the same design elsewhere with a new code.
                </>
              )}
            </>
          ) : allSchoolsFilter ? (
            <>
              Showing templates for <span className="text-foreground font-bold">{allSchoolsFilter.name}</span> only.
              Choose <span className="font-bold">All schools</span> in the filter to see every school.
            </>
          ) : (
            <>
              Showing templates from <span className="text-foreground font-bold">all schools</span>.
              Pick a school above to narrow the list, or use <span className="font-bold">Copy to school</span> on any card.
              {uploadSchool && (
                <> New uploads go to <span className="text-foreground font-bold">{uploadSchool.name}</span>.</>
              )}
            </>
          )}
        </p>
      </div>

      {(viewMode === 'all' || effectiveSchoolId) && !isLoading && templates.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative flex-1 group min-w-0">
            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-muted-foreground group-focus-within:text-primary transition-colors">
              <Search className="h-5 w-5" />
            </div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, code, school, or orientation…"
              className="w-full pl-12 pr-10 py-4 panel-toolbar rounded-2xl text-sm font-medium focus:ring-4 focus:ring-primary/10 focus:border-primary/50 outline-none transition-all shadow-sm"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute inset-y-0 right-3 flex items-center text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {search.trim() && (
            <p className="text-xs font-bold text-muted-foreground shrink-0">
              {filteredTemplates.length} of {templates.length} template{templates.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>
      )}

      {/* Grid Layout */}
      {isLoading || isFetching ? (
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-[200px] panel-empty animate-pulse flex flex-col items-center justify-center gap-3 rounded-xl">
              <Loader2 className="h-8 w-8 animate-spin text-primary/20" />
            </div>
          ))}
        </div>
      ) : viewMode === 'school' && !effectiveSchoolId ? (
        <div className="flex flex-col items-center justify-center py-24 panel-empty rounded-[2.5rem] border-2">
          <School className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground font-medium">Select a school to manage its ID card backgrounds.</p>
        </div>
      ) : templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 panel-empty rounded-[2.5rem] border-2">
          <div className="relative mb-8">
            <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full" />
            <div className="relative h-24 w-24 bg-card border-2 border-primary/20 rounded-3xl flex items-center justify-center rotate-6 shadow-2xl">
              <Palette className="h-12 w-12 text-primary/40" />
            </div>
          </div>
          <h3 className="text-2xl font-black text-foreground mb-2">
            {viewMode === 'all' ? 'No templates yet' : `No templates for ${selectedSchool?.name ?? user?.school?.name}`}
          </h3>
          <p className="text-muted-foreground text-center max-w-sm px-6 font-medium">
            Upload a background image, solid color, or gradient for this school&apos;s student ID cards, then place name, photo, and QR fields in the designer.
          </p>
          <button 
            onClick={handleCreateNew}
            className="mt-8 px-8 py-3 bg-muted hover:bg-primary hover:text-primary-foreground rounded-xl text-sm font-bold transition-all"
          >
            Start Designing
          </button>
        </div>
      ) : filteredTemplates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 panel-empty rounded-[2.5rem] border-2">
          <Search className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <h3 className="text-xl font-black text-foreground mb-2">No templates match your search</h3>
          <p className="text-muted-foreground text-center max-w-sm px-6 font-medium">
            No results for &ldquo;{search.trim()}&rdquo;. Try a different name or clear the search.
          </p>
          <button
            type="button"
            onClick={() => setSearch('')}
            className="mt-6 px-6 py-2.5 rounded-xl bg-muted hover:bg-primary hover:text-primary-foreground text-sm font-bold transition-all"
          >
            Clear search
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
          {filteredTemplates.map((tpl) => (
            <div 
              key={tpl.id} 
              className="group relative panel rounded-xl overflow-hidden transition-all duration-300 hover:shadow-md hover:shadow-primary/5 hover:-translate-y-0.5"
            >
              {/* Preview — fixed height so vertical cards do not stretch the grid */}
              <div className="relative bg-muted/30 h-[108px] sm:h-[120px] flex items-center justify-center p-2 overflow-hidden">
                {tpl.frontBgUrl ? (
                  <div
                    className={cn(
                      'h-full max-w-full rounded-md shadow-md transition-transform duration-500 group-hover:scale-[1.03] bg-cover bg-center bg-no-repeat',
                      tpl.orientation === 'VERTICAL' ? 'aspect-[1/1.58] w-auto' : 'aspect-[1.58/1] w-auto',
                    )}
                    style={templateCardBackgroundStyle(tpl.frontBgUrl, tpl.orientation, resolveMediaUrl)}
                    aria-label={tpl.name}
                  />
                ) : (
                  <ImageIcon className="h-8 w-8 text-muted-foreground/20" />
                )}
                
                {/* Desktop hover overlay */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 backdrop-blur-[2px] transition-all duration-300 hidden sm:flex items-center justify-center gap-1.5">
                  <button 
                    type="button"
                    title="Replace background"
                    onClick={(e) => {
                      e.stopPropagation();
                      openReplaceBackground(tpl);
                    }}
                    disabled={updateBgMutation.isPending && replacingBgTemplate?.id === tpl.id}
                    className="p-2 bg-white text-black rounded-lg hover:scale-105 active:scale-95 transition-all shadow-lg disabled:opacity-60"
                  >
                    {updateBgMutation.isPending && replacingBgTemplate?.id === tpl.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                  </button>
                  <button
                    type="button"
                    title="Copy to another school"
                    onClick={(e) => {
                      e.stopPropagation();
                      openDuplicateToSchool(tpl);
                    }}
                    className="p-2 bg-white text-black rounded-lg hover:scale-105 active:scale-95 transition-all shadow-lg"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                  <button 
                    type="button"
                    title="Edit layout"
                    onClick={(e) => { e.stopPropagation(); handleEdit(tpl); }}
                    className="p-2 bg-white text-black rounded-lg hover:scale-105 active:scale-95 transition-all shadow-lg"
                  >
                    <Settings2 className="h-4 w-4" />
                  </button>
                  <button 
                    type="button"
                    title="Delete template"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm('Delete this template?')) deleteMutation.mutate(tpl.id);
                    }}
                    className="p-2 bg-red-500 text-white rounded-lg hover:scale-105 active:scale-95 transition-all shadow-lg"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="absolute top-1.5 left-1.5 flex flex-wrap gap-1 max-w-[90%]">
                  <span className="px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur-md text-white text-[8px] font-black uppercase tracking-wider font-mono">
                    {templateDisplayCode(tpl)}
                  </span>
                  <span className="px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur-md text-white text-[8px] font-black uppercase tracking-wider">
                    {tpl.orientation === 'VERTICAL' ? 'V' : 'H'}
                  </span>
                  {(viewMode === 'all' || isSuperAdmin) && tpl.school && (
                    <span className="px-1.5 py-0.5 rounded-md bg-primary/80 backdrop-blur-md text-white text-[8px] font-black uppercase tracking-wider">
                      {tpl.school.code}
                    </span>
                  )}
                </div>
              </div>

              {/* Content Section */}
              <div className="p-3 sm:p-3.5">
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-sm text-foreground truncate">{tpl.name}</h3>
                    <p className="text-[10px] font-bold text-muted-foreground mt-0.5 truncate">
                      <span className="font-mono text-primary">{templateDisplayCode(tpl)}</span>
                      {tpl.school && (
                        <span className="text-muted-foreground"> · {tpl.school.name}</span>
                      )}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[11px] font-black text-primary tabular-nums">{tpl._count?.idCards || 0}</div>
                    <div className="text-[7px] font-bold text-muted-foreground uppercase tracking-wider">Printed</div>
                  </div>
                </div>

                <div className="flex gap-1.5 pt-2 mt-2 border-t border-border sm:hidden">
                  <button
                    type="button"
                    onClick={() => openDuplicateToSchool(tpl)}
                    className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg bg-muted border border-border text-[9px] font-black uppercase"
                  >
                    <Copy className="h-3 w-3" /> Copy
                  </button>
                  <button
                    type="button"
                    onClick={() => handleEdit(tpl)}
                    className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg bg-primary/10 text-primary text-[9px] font-black uppercase"
                  >
                    <Settings2 className="h-3 w-3" /> Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => openReplaceBackground(tpl)}
                    className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg bg-muted border border-border text-[9px] font-black uppercase"
                  >
                    <Upload className="h-3 w-3" /> Bg
                  </button>
                  <button
                    type="button"
                    onClick={() => { if (confirm('Delete this template?')) deleteMutation.mutate(tpl.id); }}
                    className="p-2 rounded-lg bg-red-500/10 text-red-600"
                    aria-label="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="absolute inset-0 border border-primary/0 group-hover:border-primary/20 rounded-xl transition-all duration-300 pointer-events-none" />
            </div>
          ))}
        </div>
      )}

      {/* Designer Overlay */}
      {designerOpen && editingTemplate && (
        <div className="fixed inset-0 z-[100] bg-background">
          <IdCardDesigner 
            key={editingTemplate.id}
            templateId={editingTemplate.id}
            schoolId={editingTemplate.schoolId || effectiveSchoolId}
            onClose={() => {
              setDesignerOpen(false);
              setEditingTemplate(null);
              queryClient.invalidateQueries({ queryKey: ['templates'] });
            }}
            onSave={handleDesignerSave}
            onSaveAs={handleSaveAs}
            bgUrl={editingTemplate.frontBgUrl || ''}
            backBgUrl={editingTemplate.backBgUrl}
            elements={normalizeFrontConfig(editingTemplate.frontConfig ?? [])}
            backElements={normalizeFrontConfig(editingTemplate.backConfig ?? [])}
            templateName={editingTemplate.name}
            orientation={editingTemplate.orientation || 'HORIZONTAL'}
          />
        </div>
      )}

      {/* Create Template Dialog (Full Screen Glassmorphism) */}
      {showCreateDialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-background/80 backdrop-blur-xl animate-in fade-in duration-500" onClick={() => setShowCreateDialog(false)} />
          <div
            className="relative bg-card border border-border w-full max-w-2xl max-h-[90vh] rounded-[3rem] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.2)] overflow-hidden flex flex-col animate-in zoom-in-95 duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-8 border-b border-border flex justify-between items-center bg-muted/50 sticky top-0 z-20">
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 bg-primary/10 rounded-2xl flex items-center justify-center">
                  <Palette className="h-7 w-7 text-primary" />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-foreground">New School Template</h3>
                  <p className="text-muted-foreground text-sm font-medium">
                    {uploadSchool || user?.school
                      ? `Assign to ${(uploadSchool ?? user?.school)?.name}`
                      : 'Select a school first'}
                  </p>
                </div>
              </div>
              <button onClick={() => setShowCreateDialog(false)} className="p-3 hover:bg-muted rounded-2xl transition-colors">
                <X className="h-6 w-6 text-muted-foreground" />
              </button>
            </div>

            {/* Body */}
            <form onSubmit={handleCreateSubmit} className="flex-1 overflow-y-auto p-8 custom-scrollbar">
              <div className="space-y-8">
                {isSuperAdmin && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-1">
                      Assign to school <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={createTargetSchoolId}
                      onChange={(e) => setCreateTargetSchoolId(e.target.value)}
                      required
                      className="w-full px-5 py-4 bg-card border border-border rounded-2xl text-sm font-bold focus:ring-4 focus:ring-primary/10 outline-none transition-all shadow-sm"
                    >
                      <option value="">Select school</option>
                      {schools.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.code})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {/* Template Name & Code */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-1">
                      Template name <span className="text-red-500">*</span>
                    </label>
                    <input
                      value={newTemplateName}
                      onChange={(e) => setNewTemplateName(e.target.value)}
                      required
                      className="w-full px-5 py-4 bg-card border border-border rounded-2xl text-sm font-bold focus:ring-4 focus:ring-primary/10 outline-none transition-all shadow-sm"
                      placeholder="e.g. Student ID Card 2026"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-1 flex items-center gap-1">
                      <Layers className="h-3 w-3" /> Template code
                    </label>
                    <input
                      value={newTemplateCode}
                      onChange={(e) => setNewTemplateCode(e.target.value.toUpperCase())}
                      className="w-full px-5 py-4 bg-card border border-border rounded-2xl text-sm font-bold font-mono focus:ring-4 focus:ring-primary/10 outline-none transition-all shadow-sm"
                      placeholder="e.g. DEMO-STD-01"
                    />
                  </div>
                </div>

                {/* Orientation Selection — CR80 default sizes */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-1">
                    Card size &amp; orientation
                  </label>
                  <p className="text-xs text-muted-foreground ml-1 mb-3">
                    All templates use standard CR80 (credit-card) dimensions. Choose portrait or landscape layout.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {CR80_SIZE_OPTIONS.map((option) => (
                      <button
                        key={option.orientation}
                        type="button"
                        onClick={() => setNewTemplateOrientation(option.orientation)}
                        className={cn(
                          'p-6 rounded-[2rem] border border-border bg-card text-left transition-all duration-300 hover:shadow-lg flex flex-col items-center justify-center gap-3 relative overflow-hidden group',
                          newTemplateOrientation === option.orientation &&
                            'border-primary ring-2 ring-primary/20 bg-primary/5',
                        )}
                      >
                        <div
                          className={cn(
                            'rounded bg-muted-foreground/20 border-2 border-dashed border-muted-foreground/30 flex items-center justify-center relative shadow-sm',
                            option.orientation === 'VERTICAL' ? 'w-12 h-20 flex-col gap-1' : 'w-20 h-12',
                          )}
                        >
                          <div className="absolute top-1 left-1 w-2 h-2 rounded-full bg-muted-foreground/40" />
                          <div
                            className={cn(
                              'rounded-full bg-muted-foreground/20',
                              option.orientation === 'VERTICAL' ? 'w-6 h-1.5' : 'w-8 h-1.5',
                            )}
                          />
                        </div>
                        <div className="text-center space-y-1">
                          <span className="text-sm font-black text-foreground block">{option.title}</span>
                          <span className="text-[10px] font-bold text-muted-foreground leading-snug block">
                            {option.subtitle}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Background: image, solid, or gradient */}
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-1">
                    Card Background
                  </label>
                  <TemplateBackgroundPicker
                    orientation={newTemplateOrientation}
                    value={newTemplateBackground}
                    onChange={setNewTemplateBackground}
                    onImageFile={handleCreateImageFile}
                    imageFileName={newTemplateBgFileName}
                    onClearImage={clearCreateBackground}
                  />
                </div>
              </div>

              {/* Form Actions */}
              <div className="flex justify-end gap-4 pt-10 border-t border-border mt-8">
                <button 
                  type="button" 
                  onClick={() => setShowCreateDialog(false)} 
                  className="px-8 py-4 text-sm font-black uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
                >
                  Dismiss
                </button>
                <button 
                  type="submit" 
                  disabled={isCreating || !isValidBackground(newTemplateBackground)} 
                  className="px-10 py-4 bg-primary text-primary-foreground rounded-2xl text-sm font-black uppercase tracking-widest shadow-xl shadow-primary/20 hover:shadow-primary/40 active:scale-95 disabled:opacity-50 flex items-center gap-3 transition-all"
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Continue to Designer'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Copy template to another school */}
      {duplicatingTemplate && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-background/80 backdrop-blur-xl"
            onClick={() => !duplicateMutation.isPending && setDuplicatingTemplate(null)}
          />
          <div className="relative w-full max-w-lg bg-card border border-border rounded-[2rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <div>
                <h3 className="text-lg font-black text-foreground flex items-center gap-2">
                  <Copy className="h-5 w-5 text-primary" />
                  Copy to school
                </h3>
                <p className="text-xs text-muted-foreground font-medium mt-1">
                  Same card design · new school · new template code
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDuplicatingTemplate(null)}
                disabled={duplicateMutation.isPending}
                className="p-2 hover:bg-muted rounded-xl"
              >
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>
            <form onSubmit={handleDuplicateSubmit} className="p-6 space-y-5">
              <div className="p-4 rounded-xl bg-muted/40 border border-border text-sm">
                <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Source</p>
                <p className="font-bold text-foreground mt-1">{duplicatingTemplate.name}</p>
                <p className="text-xs text-muted-foreground font-mono mt-0.5">
                  {templateDisplayCode(duplicatingTemplate)}
                  {duplicatingTemplate.school ? ` · ${duplicatingTemplate.school.name}` : ''}
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                  Target school <span className="text-red-500">*</span>
                </label>
                <select
                  value={duplicateTargetSchoolId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setDuplicateTargetSchoolId(id);
                    if (!duplicateCodeTouched) {
                      const school = schools.find((s) => s.id === id);
                      setDuplicateCode(suggestDuplicateCode(duplicatingTemplate, school));
                    }
                  }}
                  required
                  className="w-full px-4 py-3 bg-card border border-border rounded-xl text-sm font-bold focus:ring-4 focus:ring-primary/10 outline-none"
                >
                  <option value="">Select school</option>
                  {schools.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                  Template name <span className="text-red-500">*</span>
                </label>
                <input
                  value={duplicateName}
                  onChange={(e) => setDuplicateName(e.target.value)}
                  required
                  className="w-full px-4 py-3 bg-card border border-border rounded-xl text-sm font-bold focus:ring-4 focus:ring-primary/10 outline-none"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  <Layers className="h-3 w-3" />
                  Template code <span className="text-red-500">*</span>
                </label>
                <input
                  value={duplicateCode}
                  onChange={(e) => {
                    setDuplicateCodeTouched(true);
                    setDuplicateCode(e.target.value.toUpperCase());
                  }}
                  required
                  className="w-full px-4 py-3 bg-card border border-border rounded-xl text-sm font-bold font-mono focus:ring-4 focus:ring-primary/10 outline-none"
                  placeholder="Unique within target school"
                />
                <p className="text-[10px] text-muted-foreground">
                  Used when filtering students and generating cards for that school.
                </p>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setDuplicatingTemplate(null)}
                  disabled={duplicateMutation.isPending}
                  className="px-5 py-2.5 rounded-xl text-sm font-bold text-muted-foreground"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={duplicateMutation.isPending}
                  className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-black flex items-center gap-2 disabled:opacity-50"
                >
                  {duplicateMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Copying…
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      Copy template
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Replace background dialog */}
      {replacingBgTemplate && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-background/80 backdrop-blur-xl"
            onClick={() => !updateBgMutation.isPending && setReplacingBgTemplate(null)}
          />
          <div className="relative w-full max-w-lg bg-card border border-border rounded-[2rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <div>
                <h3 className="text-lg font-black text-foreground">Change Background</h3>
                <p className="text-xs text-muted-foreground font-medium mt-0.5">{replacingBgTemplate.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setReplacingBgTemplate(null)}
                disabled={updateBgMutation.isPending}
                className="p-2 hover:bg-muted rounded-xl transition-colors"
              >
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>
            <form onSubmit={handleReplaceBgSubmit} className="p-6 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
              <TemplateBackgroundPicker
                orientation={replacingBgTemplate.orientation}
                value={replaceBgDraft}
                onChange={setReplaceBgDraft}
                onImageFile={handleReplaceImageFile}
                imageFileName={replaceBgFileName}
                onClearImage={clearReplaceImage}
              />
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setReplacingBgTemplate(null)}
                  disabled={updateBgMutation.isPending}
                  className="px-5 py-2.5 rounded-xl text-sm font-bold text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updateBgMutation.isPending || !isValidBackground(replaceBgDraft)}
                  className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-black flex items-center gap-2 disabled:opacity-50"
                >
                  {updateBgMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    'Save background'
                  )}
                </button>
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
