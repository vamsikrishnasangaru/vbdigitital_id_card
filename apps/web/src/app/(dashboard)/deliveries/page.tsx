'use client';

import { useNextPageParams, type NextClientPageProps } from '@/lib/next-page-params';
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { toast } from 'sonner';
import { Package, Loader2, Truck, CheckCircle, MapPin } from 'lucide-react';
import { ResponsiveDataView } from '@/components/ui/responsive-data-view';
import { ListLoading, ListEmpty } from '@/components/ui/list-state';

export default function DeliveriesPage({ params }: NextClientPageProps) {
  useNextPageParams(params);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/deliveries', { params: { limit: 50 } })
      .then(res => setDeliveries(res.data.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const updateStatus = async (id: string, status: string) => {
    try {
      await api.put(`/deliveries/${id}/status`, { status });
      toast.success('Delivery updated');
      const res = await api.get('/deliveries', { params: { limit: 50 } });
      setDeliveries(res.data.data || []);
    } catch { toast.error('Failed'); }
  };

  const statusSteps = ['PACKED', 'DISPATCHED', 'IN_TRANSIT', 'DELIVERED'];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Shipping</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Track ID card shipments to schools.</p>
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {statusSteps.map(status => {
          const count = deliveries.filter(d => d.status === status).length;
          const icons: Record<string, any> = { PACKED: Package, DISPATCHED: Truck, IN_TRANSIT: MapPin, DELIVERED: CheckCircle };
          const Icon = icons[status] || Package;
          return (
            <div key={status} className="rounded-xl border bg-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <Icon className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground font-medium">{
                  status === 'PACKED' ? 'Packed' :
                  status === 'DISPATCHED' ? 'Sent' :
                  status === 'IN_TRANSIT' ? 'On the Way' :
                  'Delivered'
                }</span>
              </div>
              <div className="text-2xl font-bold">{count}</div>
            </div>
          );
        })}
      </div>

      <ResponsiveDataView
        mobile={
          loading ? (
            <ListLoading message="Loading deliveries..." />
          ) : deliveries.length === 0 ? (
            <ListEmpty icon={Package} title="No deliveries yet" />
          ) : (
            deliveries.map((d) => (
              <div key={d.id} className="p-4 space-y-3">
                <div className="font-medium text-sm">{d.school?.name}</div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="font-mono text-muted-foreground">{d.trackingNumber || 'No tracking'}</span>
                  <span className="text-muted-foreground">{d.totalCards} cards</span>
                  <span className="px-2 py-0.5 rounded-full bg-muted font-medium">
                    {d.status === 'PACKED' ? 'Packed' : d.status === 'DISPATCHED' ? 'Sent' : d.status === 'IN_TRANSIT' ? 'On the Way' : 'Delivered'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {d.status === 'PACKED' && (
                    <button onClick={() => updateStatus(d.id, 'DISPATCHED')} className="flex-1 text-xs px-3 py-2 rounded-lg bg-primary/10 text-primary font-bold">Ship Now</button>
                  )}
                  {d.status === 'DISPATCHED' && (
                    <button onClick={() => updateStatus(d.id, 'IN_TRANSIT')} className="flex-1 text-xs px-3 py-2 rounded-lg bg-blue-500/10 text-blue-700 font-bold">On the Way</button>
                  )}
                  {d.status === 'IN_TRANSIT' && (
                    <button onClick={() => updateStatus(d.id, 'DELIVERED')} className="flex-1 text-xs px-3 py-2 rounded-lg bg-emerald-500/10 text-emerald-700 font-bold">Delivered</button>
                  )}
                </div>
              </div>
            ))
          )
        }
        desktop={
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left p-3 font-medium text-muted-foreground">School</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Tracking ID</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Cards</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                <th className="text-right p-3 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="p-8 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></td></tr>
              ) : deliveries.length === 0 ? (
                <tr><td colSpan={5} className="p-12 text-center text-muted-foreground">No deliveries yet</td></tr>
              ) : deliveries.map((d) => (
                <tr key={d.id} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="p-3 font-medium">{d.school?.name}</td>
                  <td className="p-3 font-mono text-xs">{d.trackingNumber || '—'}</td>
                  <td className="p-3">{d.totalCards}</td>
                  <td className="p-3">
                    <span className={`text-[11px] px-2.5 py-1 rounded-full font-medium
                      ${d.status === 'DELIVERED' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30' :
                        d.status === 'IN_TRANSIT' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30' :
                        d.status === 'DISPATCHED' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30' :
                        'bg-gray-100 text-gray-600 dark:bg-gray-800'}`}>
                      {d.status === 'PACKED' ? 'Packed' : d.status === 'DISPATCHED' ? 'Sent' : d.status === 'IN_TRANSIT' ? 'On the Way' : 'Delivered'}
                    </span>
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-1 flex-wrap">
                      {d.status === 'PACKED' && (
                        <button onClick={() => updateStatus(d.id, 'DISPATCHED')} className="text-xs px-2.5 py-1 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 font-medium">Ship Now</button>
                      )}
                      {d.status === 'DISPATCHED' && (
                        <button onClick={() => updateStatus(d.id, 'IN_TRANSIT')} className="text-xs px-2.5 py-1 rounded-lg bg-blue-100 text-blue-700 font-medium dark:bg-blue-900/30">On the Way</button>
                      )}
                      {d.status === 'IN_TRANSIT' && (
                        <button onClick={() => updateStatus(d.id, 'DELIVERED')} className="text-xs px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-700 font-medium dark:bg-emerald-900/30">Delivered</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        }
      />
    </div>
  );
}
