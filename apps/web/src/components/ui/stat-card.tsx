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

const iconStyles: Record<StatCardColor, string> = {
  indigo:
    'bg-indigo-500/15 text-indigo-600 shadow-indigo-500/20 dark:bg-indigo-500/20 dark:text-indigo-400',
  blue: 'bg-blue-500/15 text-blue-600 shadow-blue-500/20 dark:bg-blue-500/20 dark:text-blue-400',
  emerald:
    'bg-emerald-500/15 text-emerald-600 shadow-emerald-500/20 dark:bg-emerald-500/20 dark:text-emerald-400',
  amber:
    'bg-amber-500/15 text-amber-600 shadow-amber-500/20 dark:bg-amber-500/20 dark:text-amber-400',
  rose: 'bg-rose-500/15 text-rose-600 shadow-rose-500/20 dark:bg-rose-500/20 dark:text-rose-400',
  violet:
    'bg-violet-500/15 text-violet-600 shadow-violet-500/20 dark:bg-violet-500/20 dark:text-violet-400',
  primary:
    'bg-primary/15 text-primary shadow-primary/20 dark:bg-primary/20 dark:text-primary',
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
        'stat-card group h-full hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300',
        href && 'cursor-pointer',
        className,
      )}
    >
      <div className={cn('stat-card-glow', glowColors[color])} aria-hidden />
      <div className="relative z-10 flex flex-col min-h-[120px]">
        <div
          className={cn(
            'h-11 w-11 rounded-xl flex items-center justify-center mb-5 shadow-lg transition-transform group-hover:scale-105',
            iconStyles[color],
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="mt-auto space-y-0.5">
          <div className="text-3xl font-black tracking-tighter text-foreground">
            {loading ? (
              <div className="h-8 w-14 bg-muted animate-pulse rounded-lg" />
            ) : (
              value
            )}
          </div>
          <div className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
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
