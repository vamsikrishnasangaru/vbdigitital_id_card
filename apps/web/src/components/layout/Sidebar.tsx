'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';
import { useOfflineSync } from '@/hooks/use-offline-sync';
import { isOfflineAllowedPath } from '@/lib/offline-routes';
import { OfflineNetworkRequiredDialog } from '@/components/OfflineNetworkRequiredDialog';
import {
  LayoutDashboard, School, Users, GraduationCap, CreditCard,
  BarChart3, Bell, Settings,
  LogOut, BookOpen, Palette, X, Loader2, Globe
} from 'lucide-react';

const allRoutes = [
  { label: 'Dashboard', icon: LayoutDashboard, href: '/dashboard', roles: ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER'], group: 'Workspace' },
  { label: 'Schools', icon: School, href: '/schools', roles: ['SUPER_ADMIN'], group: 'Directory' },
  { label: 'Teachers', icon: GraduationCap, href: '/teachers', roles: ['SUPER_ADMIN', 'SCHOOL_ADMIN'], group: 'Directory' },
  { label: 'Classes', icon: BookOpen, href: '/classes', roles: ['SUPER_ADMIN', 'SCHOOL_ADMIN'], group: 'Directory' },
  { label: 'Students', icon: Users, href: '/students', roles: ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER'], group: 'Directory' },
  { label: 'Generate Cards', icon: CreditCard, href: '/id-cards', roles: ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER'], previewLabel: 'Preview Cards', group: 'Production' },
  { label: 'Templates', icon: Palette, href: '/templates', roles: ['SUPER_ADMIN'], group: 'Production' },
  { label: 'Reports', icon: BarChart3, href: '/analytics', roles: ['SUPER_ADMIN'], group: 'Admin' },
  { label: 'Landing page', icon: Globe, href: '/site-content', roles: ['SUPER_ADMIN'], group: 'Admin' },
  { label: 'Alerts', icon: Bell, href: '/notifications', roles: ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER'], group: 'Admin' },
  { label: 'Settings', icon: Settings, href: '/settings', roles: ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER'], group: 'Admin' },
];

const GROUP_ORDER = ['Workspace', 'Directory', 'Production', 'Admin'];

interface SidebarProps {
  onClose?: () => void;
}

export function Sidebar({ onClose }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const { isOffline, serverUnavailable } = useOfflineSync();
  const workingOffline = isOffline || serverUnavailable;
  const [loggingOut, setLoggingOut] = useState(false);
  const [networkPrompt, setNetworkPrompt] = useState(false);
  const routes = allRoutes.filter(r => user && r.roles.includes(user.role));
  const groups = GROUP_ORDER.filter((group) => routes.some((r) => r.group === group));

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <div className="relative flex h-full flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div
        className={cn(
          'flex shrink-0 items-center gap-3 border-b border-sidebar-border',
          onClose ? 'h-16 px-4' : 'h-[72px] px-5',
        )}
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground shadow-sm">
          <CreditCard className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-sm font-semibold tracking-tight text-sidebar-foreground">VB Digital</span>
          <span className="text-[11px] font-medium text-sidebar-foreground/55">School ID Cards</span>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation menu"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/15 text-sidebar-foreground transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <nav className="no-scrollbar flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {groups.map((group) => (
          <div key={group}>
            <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wide text-sidebar-primary">
              {group}
            </p>
            <div className="space-y-0.5">
              {routes
                .filter((route) => route.group === group)
                .map((route) => {
                  const isActive = pathname === route.href || pathname.startsWith(`${route.href}/`);
                  const label =
                    'previewLabel' in route && route.previewLabel && user?.role !== 'SUPER_ADMIN'
                      ? route.previewLabel
                      : route.label;
                  const offlineBlocked = workingOffline && !isOfflineAllowedPath(user?.role, route.href);
                  return (
                    <Link
                      key={route.href}
                      href={route.href}
                      onClick={(e) => {
                        if (!offlineBlocked) return;
                        e.preventDefault();
                        setNetworkPrompt(true);
                      }}
                      className={cn(
                        'flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors',
                        isActive
                          ? 'bg-sidebar-accent font-semibold text-sidebar-accent-foreground shadow-sm'
                          : 'text-sidebar-foreground/70 hover:bg-white/10 hover:text-sidebar-foreground',
                        offlineBlocked && 'opacity-45',
                      )}
                      title={offlineBlocked ? 'Connect to the internet to open this page' : undefined}
                    >
                      <route.icon className={cn('h-4 w-4', isActive ? 'text-sidebar-primary' : 'text-sidebar-foreground/55')} />
                      {label}
                    </Link>
                  );
                })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sidebar-primary text-[11px] font-semibold text-sidebar-primary-foreground">
            {user?.firstName?.[0]}{user?.lastName?.[0]}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-sidebar-foreground">{user?.firstName}</div>
            <div className="truncate text-[11px] capitalize text-sidebar-foreground/55">
              {user?.role?.replaceAll('_', ' ').toLowerCase()}
            </div>
          </div>
          <button
            onClick={() => void handleLogout()}
            disabled={loggingOut}
            title={loggingOut ? 'Saving your changes to the server…' : 'Log out'}
            className="rounded-lg p-2 text-sidebar-foreground/50 transition-colors hover:bg-white/10 hover:text-rose-300 disabled:opacity-60"
          >
            {loggingOut ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LogOut className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
      <OfflineNetworkRequiredDialog open={networkPrompt} onClose={() => setNetworkPrompt(false)} />
    </div>
  );
}
