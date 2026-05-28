'use client';

import { cn } from '@/lib/utils';

interface ResponsiveDataViewProps {
  /** Card list for phones & tablets (below lg) */
  mobile: React.ReactNode;
  /** Table markup for desktop (lg+) */
  desktop: React.ReactNode;
  className?: string;
}

export function ResponsiveDataView({ mobile, desktop, className }: ResponsiveDataViewProps) {
  return (
    <div className={cn('panel-toolbar overflow-hidden shadow-sm', className)}>
      <div className="lg:hidden divide-y divide-border">{mobile}</div>
      <div className="hidden lg:block overflow-x-auto">
        <div className="min-w-full inline-block align-middle">{desktop}</div>
      </div>
    </div>
  );
}

/** Row actions visible on touch; hover-reveal on desktop tables */
export function rowActionsClass() {
  return 'flex items-center gap-1.5 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity';
}
