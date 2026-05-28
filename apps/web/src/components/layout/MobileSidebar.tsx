'use client';

import { useEffect, useRef } from 'react';
import { Sidebar } from './Sidebar';
import { cn } from '@/lib/utils';

interface MobileSidebarProps {
  open: boolean;
  onClose: () => void;
}

export function MobileSidebar({ open, onClose }: MobileSidebarProps) {
  const blockBackdropClose = useRef(false);

  useEffect(() => {
    if (!open) return;
    blockBackdropClose.current = true;
    const id = window.setTimeout(() => {
      blockBackdropClose.current = false;
    }, 400);
    return () => window.clearTimeout(id);
  }, [open]);

  const handleBackdropClick = () => {
    if (blockBackdropClose.current) return;
    onClose();
  };

  return (
    <>
      <div
        className={cn(
          'fixed inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm z-[100] lg:hidden transition-opacity duration-300',
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        )}
        onClick={handleBackdropClick}
        aria-hidden={!open}
      />

      <div
        className={cn(
          'fixed inset-y-0 left-0 w-[300px] z-[101] lg:hidden transition-transform duration-300 ease-out shadow-2xl',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <Sidebar onClose={onClose} />
      </div>
    </>
  );
}
