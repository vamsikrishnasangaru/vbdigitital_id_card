'use client';

import { useNextPageParams, type NextClientPageProps } from '@/lib/next-page-params';
import { useState, useDeferredValue } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { toast } from 'sonner';
import { Plus, Search, Edit, Trash2, School as SchoolIcon, Loader2, Filter, Download, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MODAL_BACKDROP, modalPanelClass } from '@/lib/modal-motion';
import { ResponsiveDataView, rowActionsClass } from '@/components/ui/responsive-data-view';
import { ListLoading, ListEmpty } from '@/components/ui/list-state';
import { queryKeys } from '@/lib/query-keys';
import { offlineStore, isEffectivelyOffline } from '@/lib/offline-store';

interface School {
  id: string;
  name: string;
  code: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  isActive: boolean;
  _count: { students: number; classes: number; users: number };
}

function getCachedSchoolsList(search?: string): School[] | undefined {
  const cached = offlineStore.getSchools();
  if (!Array.isArray(cached) || cached.length === 0) return undefined;
  const list = cached as School[];
  const q = (search || '').trim().toLowerCase();
  if (!q) return list;
  return list.filter((s) =>
    [s.name, s.code, s.city, s.email, s.phone, s.state]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(q),
  );
}

export default function SchoolsPage({ params }: NextClientPageProps) {
  useNextPageParams(params);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim());
  const [showCreate, setShowCreate] = useState(false);
  const [editingSchool, setEditingSchool] = useState<School | null>(null);
  const [form, setForm] = useState({
    name: '',
    code: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    pincode: '',
    adminPassword: '',
    confirmAdminPassword: '',
  });

  const emptyForm = {
    name: '',
    code: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    pincode: '',
    adminPassword: '',
    confirmAdminPassword: '',
  };

  const { data: schoolsData, isFetching, isPending } = useQuery({
    queryKey: queryKeys.schools.adminList(deferredSearch),
    queryFn: async () => {
      // Offline: never wait on the network — return local cache immediately.
      if (isEffectivelyOffline()) {
        return getCachedSchoolsList(deferredSearch) ?? [];
      }
      try {
        const { data } = await api.get('/schools', {
          params: { search: deferredSearch || undefined, limit: 50 },
        });
        const list = (data?.data as School[]) || [];
        offlineStore.cacheSchools(list);
        return list;
      } catch {
        const fallback = getCachedSchoolsList(deferredSearch);
        if (fallback) return fallback;
        return [];
      }
    },
    // No localStorage initial/placeholder data — that mismatches SSR HTML.
    staleTime: 30_000,
    retry: (failureCount) => !isEffectivelyOffline() && failureCount < 1,
  });

  // Never spin forever offline — show cache or empty state.
  const showSchoolsSpinner = isPending && !schoolsData && isFetching;

  // Mutations
  type SchoolFormPayload = {
    name?: string;
    code?: string;
    email?: string;
    phone?: string;
    address?: string;
    city?: string;
    state?: string;
    pincode?: string;
    adminPassword?: string;
    isActive?: boolean;
  };

  const createMutation = useMutation({
    mutationFn: (data: SchoolFormPayload & { name: string; code: string }) => api.post('/schools', data),
    onSuccess: (res) => {
      if (res.data?._offline) {
        toast.success('School saved locally — will sync when online');
      } else {
        toast.success('School created successfully');
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.schools.all });
      closeModal();
    },
    onError: (err: any) => {
      if (!err.response && !navigator.onLine) return;
      toast.error(err.response?.data?.message || 'Failed to create school');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: SchoolFormPayload }) => api.put(`/schools/${id}`, data),
    onSuccess: (res) => {
      if (res.data?._offline) {
        toast.success('Changes saved locally — will sync when online');
      } else {
        toast.success('School updated successfully');
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.schools.all });
      closeModal();
    },
    onError: (err: any) => {
      if (!err.response && !navigator.onLine) return;
      toast.error(err.response?.data?.message || 'Failed to update school');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/schools/${id}`),
    onSuccess: (res) => {
      if (res.data?._offline) {
        toast.success('Removal queued — will sync when online');
      } else {
        toast.success('School deleted successfully');
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.schools.all });
    },
    onError: (err: unknown) => {
      if (!(err as { response?: unknown }).response && !navigator.onLine) return;
      toast.error('Failed to delete school');
    },
  });

  const closeModal = () => {
    setShowCreate(false);
    setEditingSchool(null);
    setForm(emptyForm);
  };

  const validatePasswordFields = () => {
    const password = form.adminPassword.trim();
    const confirm = form.confirmAdminPassword.trim();
    if (!password && !confirm) return true;
    if (!password) {
      toast.error('Enter the new password');
      return false;
    }
    if (password !== confirm) {
      toast.error('Passwords do not match');
      return false;
    }
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return false;
    }
    return true;
  };

  const buildSchoolPayload = (forUpdate: boolean): SchoolFormPayload => {
    const { confirmAdminPassword, adminPassword, ...rest } = form;
    const password = adminPassword.trim();
    const { code, ...updateRest } = rest;
    const base = forUpdate ? updateRest : rest;
    return password ? { ...base, adminPassword: password } : base;
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validatePasswordFields()) return;
    if (editingSchool) {
      updateMutation.mutate({ id: editingSchool.id, data: buildSchoolPayload(true) });
    } else {
      createMutation.mutate({
        ...buildSchoolPayload(false),
        name: form.name,
        code: form.code,
      });
    }
  };

  const openEdit = (school: School) => {
    setForm({
      name: school.name || '',
      code: school.code || '',
      email: school.email || '',
      phone: school.phone || '',
      address: (school as any).address || '',
      city: school.city || '',
      state: school.state || '',
      pincode: (school as any).pincode || '',
      adminPassword: '',
      confirmAdminPassword: '',
    });
    setEditingSchool(school);
    setShowCreate(true);
  };

  const schools = schoolsData || [];
  const isSearchPending = search.trim() !== deferredSearch;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60">
            Schools
          </h2>
          <p className="text-sm text-muted-foreground mt-1">Manage schools and their details.</p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
          <button className="flex items-center justify-center gap-2 px-3 py-2 border rounded-lg text-sm font-medium hover:bg-muted transition-all w-full sm:w-auto">
            <Download className="h-4 w-4 shrink-0" /> Export
          </button>
          <button 
            onClick={() => { setEditingSchool(null); setShowCreate(true); }} 
            className="flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold shadow-lg shadow-primary/20 hover:opacity-90 active:scale-95 transition-all w-full sm:w-auto"
          >
            <Plus className="h-4 w-4 shrink-0" /> Add School
          </button>
        </div>
      </div>

      {/* Filters Area */}
      <div className="panel-toolbar flex flex-col md:flex-row gap-4 items-center justify-between p-4">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input 
            value={search} 
            onChange={(e) => setSearch(e.target.value)} 
            placeholder="Search by name, code, city, email, or phone..."
            className="w-full pl-10 pr-10 py-2 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
          />
          {isSearchPending && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>
        {deferredSearch && (
          <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
            {showSchoolsSpinner ? 'Searching…' : `${schools.length} result${schools.length === 1 ? '' : 's'}`}
          </span>
        )}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <button className="flex items-center gap-2 px-3 py-2 border rounded-lg text-sm font-medium hover:bg-muted transition-all w-full md:w-auto justify-center">
            <Filter className="h-4 w-4" /> Filters
          </button>
        </div>
      </div>

      <ResponsiveDataView
        mobile={
          showSchoolsSpinner ? (
            <ListLoading message="Loading institutions..." />
          ) : schools.length === 0 ? (
            <ListEmpty
              icon={SchoolIcon}
              title="No schools found matching your search"
            />
          ) : (
            schools.map((school) => (
              <div key={school.id} className="p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="h-11 w-11 shrink-0 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/10">
                    <SchoolIcon className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-foreground truncate">{school.name}</div>
                    <div className="text-xs text-muted-foreground truncate mt-0.5">
                      {school.email || 'No email provided'}
                    </div>
                    <span className="inline-block mt-2 px-2.5 py-1 rounded-md bg-muted font-mono text-[11px] font-bold text-muted-foreground border border-border">
                      {school.code}
                    </span>
                  </div>
                  <div className={cn(rowActionsClass(), 'shrink-0')}>
                    <button
                      type="button"
                      onClick={() => openEdit(school)}
                      className="p-2 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-all"
                      aria-label="Edit school"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm('Delete this school and all associated data?')) {
                          deleteMutation.mutate(school.id);
                        }
                      }}
                      className="p-2 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-all"
                      aria-label="Delete school"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {(school.city || school.state) && (
                    <span className="text-muted-foreground">
                      {[school.city, school.state].filter(Boolean).join(', ')}
                    </span>
                  )}
                  <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[10px] font-bold border border-blue-500/20">
                    {school._count?.students || 0} Students
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 text-[10px] font-bold border border-purple-500/20">
                    {school._count?.classes || 0} Classes
                  </span>
                  <button
                    type="button"
                    onClick={() => updateMutation.mutate({ id: school.id, data: { isActive: !school.isActive } })}
                    className={cn(
                      'text-[10px] px-3 py-1 rounded-full font-bold uppercase border ml-auto',
                      school.isActive
                        ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                        : 'bg-red-500/10 text-red-600 border-red-500/20',
                    )}
                  >
                    {school.isActive ? 'Active' : 'Inactive'}
                  </button>
                </div>
              </div>
            ))
          )
        }
        desktop={
          <table className="w-full text-sm min-w-[800px]">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left p-4 font-semibold text-foreground">School</th>
                <th className="text-left p-4 font-semibold text-foreground">School Code</th>
                <th className="text-left p-4 font-semibold text-foreground">City</th>
                <th className="text-left p-4 font-semibold text-foreground">Info</th>
                <th className="text-left p-4 font-semibold text-foreground">Status</th>
                <th className="text-right p-4 font-semibold text-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {showSchoolsSpinner ? (
                <tr>
                  <td colSpan={6} className="p-20 text-center">
                    <Loader2 className="h-8 w-8 animate-spin text-primary/60 mx-auto" />
                    <p className="text-sm text-muted-foreground mt-3">Loading institutions...</p>
                  </td>
                </tr>
              ) : schools.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-20 text-center text-muted-foreground">
                    No schools found matching your search
                  </td>
                </tr>
              ) : (
                schools.map((school) => (
                  <tr key={school.id} className="group hover:bg-primary/5 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-4">
                        <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/10">
                          <SchoolIcon className="h-5 w-5 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-foreground group-hover:text-primary transition-colors">{school.name}</div>
                          <div className="text-xs text-muted-foreground truncate max-w-[200px]">{school.email || 'No email'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className="px-2.5 py-1 rounded-md bg-muted font-mono text-[11px] font-bold border border-border">
                        {school.code}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="text-xs font-medium">{school.city || '—'}</div>
                      <div className="text-[10px] text-muted-foreground uppercase">{school.state || 'N/A'}</div>
                    </td>
                    <td className="p-4">
                      <div className="flex flex-wrap gap-2">
                        <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[10px] font-bold border border-blue-500/20">
                          {school._count?.students || 0} Students
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 text-[10px] font-bold border border-purple-500/20">
                          {school._count?.classes || 0} Classes
                        </span>
                      </div>
                    </td>
                    <td className="p-4">
                      <button
                        type="button"
                        onClick={() => updateMutation.mutate({ id: school.id, data: { isActive: !school.isActive } })}
                        className={cn(
                          'text-[10px] px-3 py-1 rounded-full font-bold uppercase border',
                          school.isActive
                            ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                            : 'bg-red-500/10 text-red-600 border-red-500/20',
                        )}
                      >
                        {school.isActive ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className="p-4 text-right">
                      <div className={cn(rowActionsClass(), 'justify-end')}>
                        <button type="button" onClick={() => openEdit(school)} className="p-2 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary">
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm('Delete this school and all associated data?')) {
                              deleteMutation.mutate(school.id);
                            }
                          }}
                          className="p-2 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-500"
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

      {/* School form modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
          <div className={MODAL_BACKDROP} onClick={closeModal} aria-hidden />
          <div
            className={cn(
              'relative bg-card border border-border shadow-2xl w-full max-w-xl max-h-[92vh] sm:max-h-[90vh] flex flex-col min-h-0 min-w-0',
              'rounded-t-[1.5rem] sm:rounded-2xl border-b-0 sm:border-b',
              modalPanelClass(),
            )}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="school-form-title"
          >
            <div className="flex justify-center pt-3 pb-1 sm:hidden shrink-0">
              <span className="h-1 w-10 rounded-full bg-border" aria-hidden />
            </div>
            <div className="px-4 py-4 sm:p-6 border-b border-border bg-muted/20 shrink-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h3 id="school-form-title" className="font-bold text-lg sm:text-xl tracking-tight">
                    {editingSchool ? 'Edit School' : 'Add New School'}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Enter the details for the school profile.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeModal}
                  className="p-2 rounded-xl hover:bg-muted text-muted-foreground shrink-0"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <form onSubmit={handleSave} className="flex flex-col flex-1 min-h-0">
              <div className="flex-1 overflow-y-auto px-4 py-4 sm:p-6 space-y-4 sm:space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5 min-w-0">
                  <div className="sm:col-span-2 min-w-0">
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 block">
                      School Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      required
                      className="w-full min-w-0 px-4 py-2.5 bg-muted/30 border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:outline-none focus:border-primary/40 transition-all"
                    />
                  </div>
                  <div className="min-w-0">
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 block">
                      School Code <span className="text-red-500">*</span>
                    </label>
                    <input
                      value={form.code}
                      onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                      required
                      disabled={!!editingSchool}
                      className="w-full min-w-0 px-4 py-2.5 bg-muted/30 border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:outline-none focus:border-primary/40 transition-all font-mono disabled:opacity-50"
                    />
                  </div>
                  <div className="min-w-0">
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 block">
                      Admin Email
                    </label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      placeholder="admin@school.com"
                      className="w-full min-w-0 px-4 py-2.5 bg-muted/30 border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:outline-none focus:border-primary/40 transition-all"
                    />
                  </div>
                  <div className="sm:col-span-2 min-w-0 pt-1 border-t border-border/60">
                    <p className="text-xs text-muted-foreground mt-3 mb-4">
                      {editingSchool
                        ? 'Optional — leave blank to keep the current school admin password.'
                        : 'Set the login password for the school admin account.'}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 block">
                      {editingSchool ? 'Update Password' : 'Admin Password'}
                    </label>
                    <input
                      type="password"
                      value={form.adminPassword}
                      onChange={(e) => setForm({ ...form, adminPassword: e.target.value })}
                      placeholder={editingSchool ? 'Enter new password' : 'Required if admin email is set'}
                      autoComplete="new-password"
                      className="w-full min-w-0 px-4 py-2.5 bg-muted/30 border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:outline-none focus:border-primary/40 transition-all"
                    />
                  </div>
                  <div className="min-w-0">
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 block">
                      Confirm Password
                    </label>
                    <input
                      type="password"
                      value={form.confirmAdminPassword}
                      onChange={(e) => setForm({ ...form, confirmAdminPassword: e.target.value })}
                      placeholder="Re-enter password"
                      autoComplete="new-password"
                      className="w-full min-w-0 px-4 py-2.5 bg-muted/30 border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:outline-none focus:border-primary/40 transition-all"
                    />
                  </div>
                  <div className="min-w-0">
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 block">
                      Contact Phone
                    </label>
                    <input
                      type="tel"
                      inputMode="tel"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      className="w-full min-w-0 px-4 py-2.5 bg-muted/30 border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:outline-none focus:border-primary/40 transition-all"
                    />
                  </div>
                  <div className="min-w-0">
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 block">
                      City
                    </label>
                    <input
                      value={form.city}
                      onChange={(e) => setForm({ ...form, city: e.target.value })}
                      className="w-full min-w-0 px-4 py-2.5 bg-muted/30 border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:outline-none focus:border-primary/40 transition-all"
                    />
                  </div>
                  <div className="min-w-0">
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 block">
                      State
                    </label>
                    <input
                      value={form.state}
                      onChange={(e) => setForm({ ...form, state: e.target.value })}
                      className="w-full min-w-0 px-4 py-2.5 bg-muted/30 border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:outline-none focus:border-primary/40 transition-all"
                    />
                  </div>
                  <div className="min-w-0">
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 block">
                      Pincode
                    </label>
                    <input
                      inputMode="numeric"
                      value={form.pincode}
                      onChange={(e) => setForm({ ...form, pincode: e.target.value })}
                      className="w-full min-w-0 px-4 py-2.5 bg-muted/30 border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:outline-none focus:border-primary/40 transition-all"
                    />
                  </div>
                  <div className="sm:col-span-2 min-w-0">
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 block">
                      Full Address
                    </label>
                    <textarea
                      value={form.address}
                      onChange={(e) => setForm({ ...form, address: e.target.value })}
                      rows={3}
                      className="w-full min-w-0 px-4 py-2.5 bg-muted/30 border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:outline-none focus:border-primary/40 transition-all resize-none"
                    />
                  </div>
                </div>
              </div>
              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 px-4 py-4 sm:px-6 sm:py-5 border-t border-border bg-muted/10 shrink-0">
                <button
                  type="button"
                  onClick={closeModal}
                  className="w-full sm:w-auto px-5 py-2.5 text-sm font-bold rounded-xl border border-border hover:bg-muted transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="w-full sm:w-auto px-6 py-2.5 text-sm font-bold rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:opacity-90 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {(createMutation.isPending || updateMutation.isPending) && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  {editingSchool ? 'Save Changes' : 'Add School'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
