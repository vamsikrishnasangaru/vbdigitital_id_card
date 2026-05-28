'use client';

import { Loader2, type LucideIcon } from 'lucide-react';

export function ListLoading({ message = 'Loading...' }: { message?: string }) {
  return (
    <div className="p-12 sm:p-16 flex flex-col items-center gap-3">
      <Loader2 className="h-8 w-8 animate-spin text-primary/60" />
      <p className="text-sm text-muted-foreground text-center">{message}</p>
    </div>
  );
}

export function ListEmpty({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
}) {
  return (
    <div className="p-12 sm:p-16 flex flex-col items-center gap-3 text-center">
      <Icon className="h-12 w-12 text-muted-foreground/30" />
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      {description ? (
        <p className="text-xs text-muted-foreground/80 max-w-xs">{description}</p>
      ) : null}
    </div>
  );
}
