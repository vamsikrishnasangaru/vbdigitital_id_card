'use client';

import { cn } from '@/lib/utils';

interface ResponsiveDataViewProps {
  /** Card list for phones & tablets (below lg) */
  mobile: React.ReactNode;
  /** Table markup for desktop (lg+) */
  desktop: React.ReactNode;
  className?: string;
  /** Show table on mobile with horizontal scroll instead of card list */
  tableOnMobile?: boolean;
}

export function ResponsiveDataView({
  mobile,
  desktop,
  className,
  tableOnMobile = false,
}: ResponsiveDataViewProps) {
  return (
    <div className={cn('panel-toolbar shadow-sm min-w-0', className)}>
      {!tableOnMobile && <div className="lg:hidden divide-y divide-border">{mobile}</div>}
      <div
        className={cn(
          'overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]',
          tableOnMobile ? 'block' : 'hidden lg:block',
        )}
      >
        <div className="inline-block min-w-full align-middle">{desktop}</div>
      </div>
    </div>
  );
}

/** Row actions visible on touch; hover-reveal on desktop tables */
export function rowActionsClass() {
  return 'flex items-center gap-1.5 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity';
}
