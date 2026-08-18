'use client';

import Link from 'next/link';
import { ArrowUpRight, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type StatCardColor =
  | 'indigo'
  | 'blue'
  | 'emerald'
  | 'amber'
  | 'rose'
  | 'violet'
  | 'primary';

const glowColors: Record<StatCardColor, string> = {
  indigo: 'bg-indigo-500',
  blue: 'bg-blue-500',
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  rose: 'bg-rose-500',
  violet: 'bg-violet-500',
  primary: 'bg-primary',
};

const cardTints: Record<StatCardColor, string> = {
  indigo: 'bg-indigo-50 border-indigo-200/80 dark:bg-indigo-950/40 dark:border-indigo-800/60',
  blue: 'bg-sky-50 border-sky-200/80 dark:bg-sky-950/40 dark:border-sky-800/60',
  emerald: 'bg-emerald-50 border-emerald-200/80 dark:bg-emerald-950/40 dark:border-emerald-800/60',
  amber: 'bg-amber-50 border-amber-200/80 dark:bg-amber-950/40 dark:border-amber-800/60',
  rose: 'bg-rose-50 border-rose-200/80 dark:bg-rose-950/40 dark:border-rose-800/60',
  violet: 'bg-violet-50 border-violet-200/80 dark:bg-violet-950/40 dark:border-violet-800/60',
  primary: 'bg-sky-50 border-sky-200/80 dark:bg-sky-950/40 dark:border-sky-800/60',
};

const iconStyles: Record<StatCardColor, string> = {
  indigo: 'bg-indigo-500 text-white',
  blue: 'bg-sky-500 text-white',
  emerald: 'bg-emerald-500 text-white',
  amber: 'bg-amber-400 text-amber-950',
  rose: 'bg-rose-500 text-white',
  violet: 'bg-violet-500 text-white',
  primary: 'bg-primary text-primary-foreground',
};

export interface StatCardProps {
  label: string;
  value: React.ReactNode;
  icon: LucideIcon;
  color: StatCardColor;
  href?: string;
  loading?: boolean;
  sublabel?: string;
  className?: string;
}

export function StatCard({
  label,
  value,
  icon: Icon,
  color,
  href,
  loading,
  sublabel,
  className,
}: StatCardProps) {
  const card = (
    <div
      className={cn(
        'stat-card group h-full hover:shadow-md transition-all duration-200',
        cardTints[color],
        href && 'cursor-pointer',
        className,
      )}
    >
      <div className={cn('stat-card-glow', glowColors[color])} aria-hidden />
      <div className="relative z-10 flex flex-col min-h-[120px]">
        <div
          className={cn(
            'h-9 w-9 rounded-xl flex items-center justify-center mb-4 shadow-sm',
            iconStyles[color],
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="mt-auto space-y-0.5">
          <div className="text-2xl font-semibold tracking-tight text-foreground">
            {loading ? (
              <div className="h-7 w-14 bg-muted animate-pulse rounded-md" />
            ) : (
              value
            )}
          </div>
          <div className="text-xs font-medium text-muted-foreground">
            {label}
          </div>
          {sublabel ? (
            <div className="text-[10px] font-bold text-muted-foreground/80">{sublabel}</div>
          ) : null}
        </div>
        <ArrowUpRight
          className={cn(
            'absolute bottom-4 right-4 h-4 w-4 text-muted-foreground/40 transition-all',
            'group-hover:text-muted-foreground group-hover:translate-x-0.5 group-hover:-translate-y-0.5',
          )}
        />
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block h-full">
        {card}
      </Link>
    );
  }

  return card;
}
