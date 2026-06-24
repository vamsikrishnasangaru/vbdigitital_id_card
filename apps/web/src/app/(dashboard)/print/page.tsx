'use client';

import { useNextPageParams, type NextClientPageProps } from '@/lib/next-page-params';
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { toast } from 'sonner';
import { Printer, Loader2, Play, CheckCircle } from 'lucide-react';
import { ResponsiveDataView } from '@/components/ui/responsive-data-view';
import { ListLoading, ListEmpty } from '@/components/ui/list-state';

export default function PrintPage({ params }: NextClientPageProps) {
  useNextPageParams(params);
  const [batches, setBatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/print', { params: { limit: 50 } })
      .then(res => setBatches(res.data.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const updateStatus = async (id: string, status: string) => {
    try {
      await api.put(`/print/${id}/status`, { status });
      toast.success('Print batch updated');
      const res = await api.get('/print', { params: { limit: 50 } });
      setBatches(res.data.data || []);
    } catch { toast.error('Failed'); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Printing</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Track ID card printing progress.</p>
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {['QUEUED', 'PRINTING', 'COMPLETED', 'FAILED'].map(status => {
          const count = batches.filter(b => b.status === status).length;
          const displayStatus = {
            QUEUED: 'Waiting',
            PRINTING: 'Printing',
            COMPLETED: 'Done',
            FAILED: 'Error'
          }[status];
          return (
            <div key={status} className="rounded-xl border bg-card p-4">
              <div className="text-xs text-muted-foreground font-medium">{displayStatus}</div>
              <div className="text-2xl font-bold mt-1">{count}</div>
            </div>
          );
        })}
      </div>

      <ResponsiveDataView
        mobile={
          loading ? (
            <ListLoading message="Loading print batches..." />
          ) : batches.length === 0 ? (
            <ListEmpty icon={Printer} title="Nothing to print yet" />
          ) : (
            batches.map((b) => (
              <div key={b.id} className="p-4 space-y-3">
                <div className="flex justify-between gap-2">
                  <span className="font-mono text-xs font-bold">{b.batchNumber}</span>
                  <span className="text-[11px] px-2.5 py-1 rounded-full font-medium bg-muted">
                    {b.status === 'QUEUED' ? 'Waiting' : b.status === 'PRINTING' ? 'Printing' : b.status === 'COMPLETED' ? 'Done' : 'Error'}
                  </span>
                </div>
                <div className="text-sm font-medium">{b.school?.name}</div>
                <div className="text-xs text-muted-foreground">{b.totalCards} cards</div>
                <div className="flex gap-2">
                  {b.status === 'QUEUED' && (
                    <button onClick={() => updateStatus(b.id, 'PRINTING')} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-amber-500/10 text-amber-700 text-xs font-bold">
                      <Play className="h-3.5 w-3.5" /> Start
                    </button>
                  )}
                  {b.status === 'PRINTING' && (
                    <button onClick={() => updateStatus(b.id, 'COMPLETED')} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-emerald-500/10 text-emerald-700 text-xs font-bold">
                      <CheckCircle className="h-3.5 w-3.5" /> Finish
                    </button>
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
                <th className="text-left p-3 font-medium text-muted-foreground">Batch ID</th>
                <th className="text-left p-3 font-medium text-muted-foreground">School</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Cards</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                <th className="text-right p-3 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="p-8 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></td></tr>
              ) : batches.length === 0 ? (
                <tr><td colSpan={5} className="p-12 text-center text-muted-foreground">Nothing to print yet</td></tr>
              ) : batches.map((b) => (
                <tr key={b.id} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="p-3 font-mono text-xs">{b.batchNumber}</td>
                  <td className="p-3">{b.school?.name}</td>
                  <td className="p-3">{b.totalCards}</td>
                  <td className="p-3">
                    <span className={`text-[11px] px-2.5 py-1 rounded-full font-medium
                      ${b.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30' :
                        b.status === 'PRINTING' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30' :
                        b.status === 'FAILED' ? 'bg-red-100 text-red-700 dark:bg-red-900/30' :
                        'bg-gray-100 text-gray-600 dark:bg-gray-800'}`}>
                      {b.status === 'QUEUED' ? 'Waiting' : b.status === 'PRINTING' ? 'Printing' : b.status === 'COMPLETED' ? 'Done' : 'Error'}
                    </span>
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {b.status === 'QUEUED' && (
                        <button onClick={() => updateStatus(b.id, 'PRINTING')} className="p-1.5 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/20 inline-flex items-center" title="Start Printing">
                          <Play className="h-3.5 w-3.5 text-amber-600" />
                          <span className="text-xs font-medium ml-1">Start</span>
                        </button>
                      )}
                      {b.status === 'PRINTING' && (
                        <button onClick={() => updateStatus(b.id, 'COMPLETED')} className="p-1.5 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/20 inline-flex items-center" title="Mark Complete">
                          <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
                          <span className="text-xs font-medium ml-1">Finish</span>
                        </button>
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
