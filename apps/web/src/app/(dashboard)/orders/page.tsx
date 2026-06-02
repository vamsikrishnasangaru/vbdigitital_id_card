'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { toast } from 'sonner';
import { 
  ShoppingCart, Plus, Loader2, Eye, Search, Filter, 
  Calendar, Building2, CreditCard, ChevronRight,
  Package, CheckCircle2, Clock
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { StatCard } from '@/components/ui/stat-card';
import { ResponsiveDataView } from '@/components/ui/responsive-data-view';
import { ListLoading, ListEmpty } from '@/components/ui/list-state';

export default function OrdersPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Queries
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['orders', { search, status: statusFilter }],
    queryFn: async () => {
      const params: any = { limit: 50 };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      const { data } = await api.get('/orders', { params });
      return data.data || [];
    }
  });

  // Mutations
  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string, status: string }) => 
      api.put(`/orders/${id}/status`, { status }),
    onSuccess: () => {
      toast.success('Workflow state updated');
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: () => toast.error('Transition failed'),
  });

  const statuses = [
    { value: '', label: 'All Orders', icon: Package },
    { value: 'SUBMITTED', label: 'Submitted', icon: Clock },
    { value: 'APPROVED', label: 'Approved', icon: CheckCircle2 },
    { value: 'PROCESSING', label: 'In Production', icon: Loader2 },
    { value: 'COMPLETED', label: 'Fulfilled', icon: CheckCircle2 },
    { value: 'CANCELLED', label: 'Cancelled', icon: Package },
  ];

  const statusStyle = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return 'bg-emerald-500/10 text-emerald-500';
      case 'PROCESSING':
        return 'bg-amber-500/10 text-amber-500';
      case 'APPROVED':
        return 'bg-blue-500/10 text-blue-500';
      case 'SUBMITTED':
        return 'bg-muted text-muted-foreground';
      case 'CANCELLED':
        return 'bg-red-500/10 text-red-500';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-primary font-bold text-xs uppercase tracking-[0.2em] mb-1">
            <ShoppingCart className="h-3.5 w-3.5" /> Orders List
          </div>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-foreground">
            Orders
          </h2>
          <p className="text-muted-foreground text-sm font-medium">Track your ID card orders and delivery status.</p>
        </div>
        <button className="group relative flex items-center justify-center gap-2 px-6 py-3.5 bg-primary text-primary-foreground rounded-2xl text-sm font-black shadow-xl shadow-primary/20 hover:shadow-primary/40 active:scale-95 transition-all overflow-hidden w-full md:w-auto">
          <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
          <Plus className="h-5 w-5" /> New Order
        </button>
      </div>

      {/* Stats/Metrics Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Orders Pending', value: '12', sub: 'Orders', color: 'blue' as const, icon: Clock },
          { label: 'In Production', value: '08', sub: 'Batches', color: 'amber' as const, icon: Package },
          { label: 'Completed Today', value: '154', sub: 'ID Cards', color: 'emerald' as const, icon: CheckCircle2 },
          { label: 'Total Orders', value: '1.2k', sub: 'Lifetime', color: 'primary' as const, icon: ShoppingCart },
        ].map((stat) => (
          <StatCard
            key={stat.label}
            label={stat.label}
            value={stat.value}
            sublabel={stat.sub}
            icon={stat.icon}
            color={stat.color}
          />
        ))}
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="relative flex-1 group">
          <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-muted-foreground group-focus-within:text-primary transition-colors">
            <Search className="h-5 w-5" />
          </div>
          <input 
            value={search} 
            onChange={(e) => setSearch(e.target.value)} 
            placeholder="Search by order number or school name..."
            className="w-full pl-12 pr-4 py-4 bg-card border border-border rounded-2xl text-sm font-medium focus:ring-4 focus:ring-primary/10 focus:border-primary/50 outline-none transition-all" 
          />
        </div>
        
        <div className="flex p-1.5 bg-card border border-border rounded-2xl shadow-sm overflow-x-auto no-scrollbar">
          {statuses.map((s) => (
            <button 
              key={s.value} 
              onClick={() => setStatusFilter(s.value)}
              className={cn(
                "px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap flex items-center gap-2",
                statusFilter === s.value 
                  ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-105" 
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              <s.icon className="h-3.5 w-3.5" />
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <ResponsiveDataView
        className="panel-xl"
        mobile={
          isLoading ? (
            <ListLoading message="Loading orders..." />
          ) : orders.length === 0 ? (
            <ListEmpty icon={ShoppingCart} title="No orders in this segment" description="There are no active orders matching your filters." />
          ) : (
            orders.map((o: any) => (
              <div key={o.id} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-mono text-xs font-black text-foreground">#{o.orderNumber}</div>
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-bold mt-1">
                      <Calendar className="h-2.5 w-2.5" />
                      {new Date(o.createdAt).toLocaleDateString(undefined, { day: '2-digit', month: 'short' })}
                    </div>
                  </div>
                  <span
                    className={cn(
                      'text-[10px] px-3 py-1 rounded-full font-black uppercase',
                      statusStyle(o.status),
                    )}
                  >
                    {o.status}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 bg-primary/10 rounded-xl flex items-center justify-center shrink-0">
                    <Building2 className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-black text-foreground truncate">{o.school?.name || 'Private Client'}</div>
                    <div className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground mt-1">
                      <CreditCard className="h-3.5 w-3.5 text-primary" />
                      {o.totalCards} Units
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button type="button" className="flex-1 p-2.5 rounded-xl bg-card border border-border text-muted-foreground text-sm font-bold flex items-center justify-center gap-2">
                    <Eye className="h-4 w-4" /> View
                  </button>
                  <button type="button" className="p-2.5 rounded-xl bg-primary text-primary-foreground">
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))
          )
        }
        desktop={
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                <th className="p-6 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">Order No.</th>
                <th className="p-6 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">School</th>
                <th className="p-6 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">Cards</th>
                <th className="p-6 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">Status</th>
                <th className="p-6 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="p-24 text-center">
                    <div className="flex flex-col items-center gap-4">
                      <div className="h-12 w-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                      <p className="text-sm font-black text-muted-foreground uppercase tracking-widest">Loading Orders...</p>
                    </div>
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-24 text-center">
                    <div className="flex flex-col items-center gap-4">
                      <div className="h-20 w-20 bg-muted/50 rounded-3xl flex items-center justify-center">
                        <ShoppingCart className="h-10 w-10 text-muted-foreground/30" />
                      </div>
                      <div>
                        <h4 className="text-xl font-black text-foreground">Production clear</h4>
                        <p className="text-muted-foreground text-sm font-medium">There are no active orders in this segment.</p>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : orders.map((o: any) => (
                <tr key={o.id} className="group/row hover:bg-muted/30 transition-all duration-300">
                  <td className="p-6">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 font-mono text-xs font-black text-foreground group-hover/row:text-primary transition-colors">
                        #{o.orderNumber}
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                        <Calendar className="h-2.5 w-2.5" />
                        {new Date(o.createdAt).toLocaleDateString(undefined, { day: '2-digit', month: 'short' })}
                      </div>
                    </div>
                  </td>
                  <td className="p-6">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 bg-primary/10 rounded-xl flex items-center justify-center group-hover/row:scale-110 transition-transform shadow-sm">
                        <Building2 className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <div className="font-black text-foreground">{o.school?.name || 'Private Client'}</div>
                        <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-tight">Active Plan</div>
                      </div>
                    </div>
                  </td>
                  <td className="p-6">
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-card border border-border text-xs font-black text-foreground shadow-sm">
                      <CreditCard className="h-3.5 w-3.5 text-primary" />
                      {o.totalCards} Units
                    </div>
                  </td>
                  <td className="p-6">
                    <div className={cn(
                      "inline-flex items-center gap-2 px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-wider shadow-sm ring-1 ring-border",
                      statusStyle(o.status),
                    )}>
                      <div className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        o.status === 'PROCESSING' ? "bg-amber-500 animate-pulse" :
                        o.status === 'APPROVED' ? "bg-blue-500 animate-pulse" :
                        o.status === 'COMPLETED' ? "bg-emerald-500" :
                        "bg-muted-foreground"
                      )} />
                      {o.status}
                    </div>
                  </td>
                  <td className="p-6 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button className="p-3 rounded-xl bg-card border border-border text-muted-foreground hover:text-primary hover:border-primary/30 transition-all shadow-sm">
                        <Eye className="h-4.5 w-4.5" />
                      </button>
                      <button className="p-3 rounded-xl bg-primary text-primary-foreground hover:opacity-90 transition-all shadow-xl shadow-primary/20">
                        <ChevronRight className="h-4.5 w-4.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        }
      />

      {/* Legend/Helper */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-8 bg-primary/5 rounded-[2.5rem] border border-primary/10">
        <div className="flex items-center gap-4 text-center sm:text-left">
          <div className="h-12 w-12 bg-white rounded-2xl flex items-center justify-center shadow-lg">
            <Package className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h5 className="font-black text-foreground">Need a custom production run?</h5>
            <p className="text-muted-foreground text-sm font-medium">Batch printing is automated for all verified student records.</p>
          </div>
        </div>
        <button className="px-8 py-3 bg-white text-black rounded-xl text-xs font-black uppercase tracking-widest hover:scale-105 transition-all shadow-xl">
          Help Center
        </button>
      </div>
    </div>
  );
}
