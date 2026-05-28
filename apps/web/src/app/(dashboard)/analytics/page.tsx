'use client';

import { BarChart3 } from 'lucide-react';

export default function AnalyticsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Reports</h2>
        <p className="text-sm text-muted-foreground mt-0.5">See how your school is doing.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {['Monthly Orders', 'New Students', 'Printing Progress', 'Delivery Status'].map((chart) => (
          <div key={chart} className="rounded-xl border bg-card p-6 min-h-[300px] flex items-center justify-center">
            <div className="text-center">
              <BarChart3 className="h-10 w-10 mx-auto text-muted-foreground/20 mb-3" />
              <h3 className="font-semibold text-sm">{chart}</h3>
              <p className="text-xs text-muted-foreground mt-1">Chart data will appear here when data is available</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
