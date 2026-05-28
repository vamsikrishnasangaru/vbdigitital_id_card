'use client';

import { useState, useEffect, useMemo, useDeferredValue } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { toast } from 'sonner';
import { Plus, Search, Edit, Trash2, School as SchoolIcon, Loader2, Filter, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ResponsiveDataView, rowActionsClass } from '@/components/ui/responsive-data-view';
import { ListLoading, ListEmpty } from '@/components/ui/list-state';
import { offlineStore } from '@/lib/offline-store';

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

export default function SchoolsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim());
  const [showCreate, setShowCreate] = useState(false);
  const [editingSchool, setEditingSchool] = useState<School | null>(null);
  const [form, setForm] = useState({ 
    name: '', code: '', email: '', phone: '', address: '', city: '', state: '', pincode: '', adminPassword: '' 
  });

  // Queries
  const { data: schoolsData, isLoading } = useQuery({
    queryKey: ['schools', deferredSearch],
    queryFn: async () => {
      const { data } = await api.get('/schools', { params: { search: deferredSearch || undefined, limit: 50 } });
      const list = data.data as School[];
      offlineStore.cacheSchools(list);
      return list;
    },
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: (data: typeof form) => api.post('/schools', data),
    onSuccess: (res) => {
      if (res.data?._offline) {
        toast.success('School saved locally — will sync when online');
      } else {
        toast.success('School created successfully');
      }
      queryClient.invalidateQueries({ queryKey: ['schools'] });
      closeModal();
    },
    onError: (err: any) => {
      if (!err.response && !navigator.onLine) return;
      toast.error(err.response?.data?.message || 'Failed to create school');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<typeof form> & { isActive?: boolean } }) => 
      api.put(`/schools/${id}`, data),
    onSuccess: (res) => {
      if (res.data?._offline) {
        toast.success('Changes saved locally — will sync when online');
      } else {
        toast.success('School updated successfully');
      }
      queryClient.invalidateQueries({ queryKey: ['schools'] });
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
      queryClient.invalidateQueries({ queryKey: ['schools'] });
    },
    onError: (err: unknown) => {
      if (!(err as { response?: unknown }).response && !navigator.onLine) return;
      toast.error('Failed to delete school');
    },
  });

  const closeModal = () => {
    setShowCreate(false);
    setEditingSchool(null);
    setForm({ name: '', code: '', email: '', phone: '', address: '', city: '', state: '', pincode: '', adminPassword: '' });
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingSchool) {
      const { code, adminPassword, ...updateData } = form;
      updateMutation.mutate({ id: editingSchool.id, data: updateData });
    } else {
      createMutation.mutate(form);
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
      adminPassword: ''
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
            {isLoading ? 'Searching…' : `${schools.length} result${schools.length === 1 ? '' : 's'}`}
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
          isLoading ? (
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
              {isLoading ? (
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

      {/* Improved Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in zoom-in duration-200" onClick={closeModal}>
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-border bg-muted/20">
              <h3 className="font-bold text-xl tracking-tight">{editingSchool ? 'Edit School' : 'Add New School'}</h3>
              <p className="text-sm text-muted-foreground mt-1">Enter the details for the school profile.</p>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="col-span-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 block">School Name <span className="text-red-500">*</span></label>
                  <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} required
                    className="w-full px-4 py-2.5 bg-muted/30 border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:outline-none focus:border-primary/40 transition-all" />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 block">School Code <span className="text-red-500">*</span></label>
                  <input value={form.code} onChange={e => setForm({...form, code: e.target.value.toUpperCase()})} required disabled={!!editingSchool}
                    className="w-full px-4 py-2.5 bg-muted/30 border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:outline-none focus:border-primary/40 transition-all font-mono disabled:opacity-50" />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 block">Admin Email</label>
                  <input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} placeholder="admin@school.com"
                    className="w-full px-4 py-2.5 bg-muted/30 border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:outline-none focus:border-primary/40 transition-all" />
                </div>
                {!editingSchool && (
                  <div className="col-span-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 block">Temporary Password</label>
                    <input type="password" value={form.adminPassword} onChange={e => setForm({...form, adminPassword: e.target.value})} placeholder="Set a password for the admin account"
                      className="w-full px-4 py-2.5 bg-muted/30 border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:outline-none focus:border-primary/40 transition-all" />
                  </div>
                )}
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 block">Contact Phone</label>
                  <input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})}
                    className="w-full px-4 py-2.5 bg-muted/30 border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:outline-none focus:border-primary/40 transition-all" />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 block">City</label>
                  <input value={form.city} onChange={e => setForm({...form, city: e.target.value})}
                    className="w-full px-4 py-2.5 bg-muted/30 border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:outline-none focus:border-primary/40 transition-all" />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 block">State</label>
                  <input value={form.state} onChange={e => setForm({...form, state: e.target.value})}
                    className="w-full px-4 py-2.5 bg-muted/30 border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:outline-none focus:border-primary/40 transition-all" />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 block">Pincode</label>
                  <input value={form.pincode} onChange={e => setForm({...form, pincode: e.target.value})}
                    className="w-full px-4 py-2.5 bg-muted/30 border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:outline-none focus:border-primary/40 transition-all" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 block">Full Address</label>
                  <textarea value={form.address} onChange={e => setForm({...form, address: e.target.value})} rows={2}
                    className="w-full px-4 py-2.5 bg-muted/30 border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:outline-none focus:border-primary/40 transition-all resize-none" />
                </div>
              </div>
              <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-4 border-t border-border">
                <button type="button" onClick={closeModal} className="px-5 py-2.5 text-sm font-bold rounded-xl border border-border hover:bg-muted transition-all">Cancel</button>
                <button 
                  type="submit" 
                  disabled={createMutation.isPending || updateMutation.isPending} 
                  className="px-6 py-2.5 text-sm font-bold rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:opacity-90 active:scale-95 transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="h-4 w-4 animate-spin" />}
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
