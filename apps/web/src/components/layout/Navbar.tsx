'use client';

import { useTheme } from 'next-themes';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { Moon, Sun, Bell, Menu, X, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { MobileSidebar } from './MobileSidebar';
import { cn } from '@/lib/utils';
import { useSystemStatus } from '@/hooks/use-system-status';
import { SchoolColorMenu } from '@/components/SchoolColorPicker';

const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/schools': 'Schools',
  '/teachers': 'Teachers',
  '/students': 'Students',
  '/classes': 'Classes',
  '/id-cards': 'ID Cards',
  '/analytics': 'Reports',
  '/notifications': 'Alerts',
  '/settings': 'Settings',
  '/templates': 'Card Templates',
  '/site-content': 'Landing page',
};

export function Navbar() {
  const { theme, setTheme } = useTheme();
  const pathname = usePathname();
  const { user } = useAuthStore();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onResize = () => {
      if (window.matchMedia('(min-width: 1024px)').matches) {
        setMobileOpen(false);
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const title = pageTitles[pathname] || 'Main Dashboard';
  const { systemOnline } = useSystemStatus();

  return (
    <>
      <header className="sticky top-0 z-[45] flex h-16 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur-md sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setMobileOpen((open) => !open);
            }}
            aria-expanded={mobileOpen}
            aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors hover:bg-accent lg:hidden"
          >
            {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
          
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold tracking-tight text-foreground sm:text-lg">{title}</h1>
            <div className="flex items-center gap-1.5">
              <div
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  systemOnline ? 'bg-emerald-500' : 'bg-red-500',
                )}
              />
              <span
                className={cn(
                  'text-[11px] font-medium',
                  systemOnline ? 'text-muted-foreground' : 'text-red-600 dark:text-red-400',
                )}
              >
                {systemOnline ? 'All systems operational' : 'Offline'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden w-56 items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-1.5 transition-colors focus-within:bg-background focus-within:ring-2 focus-within:ring-ring/30 md:flex">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input 
              placeholder="Search…" 
              className="w-full border-none bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
            />
          </div>

          <button
            type="button"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors hover:bg-accent"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          <SchoolColorMenu />

          <button
            type="button"
            className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors hover:bg-accent"
          >
            <Bell className="h-4 w-4" />
            <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-primary" />
          </button>

          <div className="hidden items-center gap-2 border-l border-border pl-3 sm:flex">
            <div className="flex flex-col items-end">
              <span className="text-sm font-medium text-foreground">{user?.firstName}</span>
              <span className="text-[11px] capitalize text-muted-foreground">{user?.role?.replaceAll('_', ' ').toLowerCase()}</span>
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
              {user?.firstName?.[0]}{user?.lastName?.[0]}
            </div>
          </div>
        </div>
      </header>

      <MobileSidebar open={mobileOpen} onClose={() => setMobileOpen(false)} />
    </>
  );
}
