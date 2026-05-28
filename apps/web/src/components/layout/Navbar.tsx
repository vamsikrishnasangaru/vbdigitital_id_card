'use client';

import { useTheme } from 'next-themes';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { Moon, Sun, Bell, Menu, X, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { MobileSidebar } from './MobileSidebar';
import { cn } from '@/lib/utils';
import { useSystemStatus } from '@/hooks/use-system-status';

const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/schools': 'Schools',
  '/teachers': 'Teachers',
  '/students': 'Students',
  '/id-cards': 'ID Cards',
  '/orders': 'Orders',
  '/print': 'Printing',
  '/deliveries': 'Shipping',
  '/analytics': 'Reports',
  '/notifications': 'Alerts',
  '/settings': 'Settings',
  '/templates': 'Card Templates',
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
      <header className="h-16 border-b border-border bg-background/95 backdrop-blur-md flex items-center justify-between px-6 lg:px-8 sticky top-0 z-[45]">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setMobileOpen((open) => !open);
            }}
            aria-expanded={mobileOpen}
            aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
            className="lg:hidden flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          
          <div className="flex flex-col">
            <h1 className="text-lg font-black tracking-tight text-foreground">{title}</h1>
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  'h-1.5 w-1.5 rounded-full transition-colors',
                  systemOnline ? 'bg-emerald-500 animate-pulse' : 'bg-red-500',
                )}
              />
              <span
                className={cn(
                  'text-[10px] font-bold uppercase tracking-widest transition-colors',
                  systemOnline ? 'text-muted-foreground' : 'text-red-600 dark:text-red-400',
                )}
              >
                {systemOnline ? 'System Online' : 'System Offline'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Simple Search */}
          <div className="hidden md:flex items-center gap-3 px-3 py-2 bg-muted/50 border border-border rounded-xl group focus-within:bg-background transition-all w-64">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input 
              placeholder="Quick search..." 
              className="bg-transparent border-none outline-none text-xs font-medium w-full placeholder:text-muted-foreground/50"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-card text-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-card text-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground relative"
            >
              <Bell className="h-4 w-4" />
              <span className="absolute top-2 right-2 h-1.5 w-1.5 bg-primary rounded-full" />
            </button>
          </div>

          <div className="flex items-center gap-3 pl-4 border-l border-border">
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-xs font-black text-foreground">{user?.firstName}</span>
              <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">{user?.role?.replace('_', ' ')}</span>
            </div>
            <div className="h-9 w-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-[10px] font-black text-primary">
              {user?.firstName?.[0]}{user?.lastName?.[0]}
            </div>
          </div>
        </div>
      </header>

      <MobileSidebar open={mobileOpen} onClose={() => setMobileOpen(false)} />
    </>
  );
}
