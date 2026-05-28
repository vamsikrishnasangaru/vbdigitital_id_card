'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { Bell, Check, Loader2 } from 'lucide-react';

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/notifications').then(res => setNotifications(res.data.data || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div><h2 className="text-2xl font-bold tracking-tight">Alerts</h2></div>
      <div className="rounded-xl border bg-card divide-y">
        {loading ? <div className="p-8 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>
        : notifications.length === 0 ? <div className="p-12 text-center"><Bell className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" /><p className="text-sm text-muted-foreground">No alerts yet</p></div>
        : notifications.map(n => (
          <div key={n.id} className="p-4 flex items-start gap-3 hover:bg-muted/20">
            <div className={`mt-0.5 h-2 w-2 rounded-full ${n.isRead ? 'bg-transparent' : 'bg-primary'}`} />
            <div><div className="text-sm font-medium">{n.title}</div><div className="text-xs text-muted-foreground">{n.message}</div></div>
          </div>
        ))}
      </div>
    </div>
  );
}
