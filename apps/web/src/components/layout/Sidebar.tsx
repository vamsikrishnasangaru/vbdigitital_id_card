'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';
import {
  LayoutDashboard, School, Users, GraduationCap, CreditCard,
  ShoppingCart, Printer, Package, BarChart3, Bell, Settings,
  LogOut, ChevronRight, BookOpen, Palette, X
} from 'lucide-react';

const allRoutes = [
  { label: 'Dashboard', icon: LayoutDashboard, href: '/dashboard', roles: ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER'] },
  { label: 'Schools', icon: School, href: '/schools', roles: ['SUPER_ADMIN'] },
  { label: 'Teachers', icon: GraduationCap, href: '/teachers', roles: ['SUPER_ADMIN', 'SCHOOL_ADMIN'] },
  { label: 'Classes', icon: BookOpen, href: '/classes', roles: ['SUPER_ADMIN', 'SCHOOL_ADMIN'] },
  { label: 'Students', icon: Users, href: '/students', roles: ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER'] },
  { label: 'Generate Cards', icon: CreditCard, href: '/id-cards', roles: ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER'], previewLabel: 'Preview Cards' },
  { label: 'Orders', icon: ShoppingCart, href: '/orders', roles: ['SUPER_ADMIN'] },
  { label: 'Printing', icon: Printer, href: '/print', roles: ['SUPER_ADMIN'] },
  { label: 'Shipping', icon: Package, href: '/deliveries', roles: ['SUPER_ADMIN'] },
  { label: 'Reports', icon: BarChart3, href: '/analytics', roles: ['SUPER_ADMIN'] },
  { label: 'Templates', icon: Palette, href: '/templates', roles: ['SUPER_ADMIN'] },
  { label: 'Alerts', icon: Bell, href: '/notifications', roles: ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER'] },
  { label: 'Settings', icon: Settings, href: '/settings', roles: ['SUPER_ADMIN', 'SCHOOL_ADMIN'] },
];

interface SidebarProps {
  onClose?: () => void;
}

export function Sidebar({ onClose }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const routes = allRoutes.filter(r => user && r.roles.includes(user.role));

  return (
    <div className="flex flex-col h-full bg-[#111113] text-white border-r border-white/5 relative">
      {/* Brand Section */}
      <div
        className={cn(
          'flex items-center gap-3 relative z-10 border-b border-white/5 shrink-0',
          onClose ? 'h-16 px-4' : 'h-20 px-6',
        )}
      >
        <div className="h-10 w-10 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20 shrink-0">
          <CreditCard className="h-5 w-5 text-white" />
        </div>
        <div className="leading-tight min-w-0 flex-1">
          <span className="block font-black text-base tracking-tighter uppercase text-white">VB DIGITAL</span>
          <span className="text-[9px] text-white/40 font-bold uppercase tracking-widest">ID Card SaaS</span>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation menu"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/10 text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Navigation Section */}
      <nav className="flex-1 overflow-y-auto px-3 py-6 space-y-1 relative z-10 no-scrollbar">
        {routes.map((route) => {
          const isActive = pathname === route.href || pathname.startsWith(route.href + '/');
          const label =
            'previewLabel' in route &&
            route.previewLabel &&
            user?.role !== 'SUPER_ADMIN'
              ? route.previewLabel
              : route.label;
          return (
            <Link
              key={route.href}
              href={route.href}
              className={cn(
                'group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200',
                isActive
                  ? 'bg-primary text-white shadow-lg shadow-primary/10'
                  : 'text-white/50 hover:text-white hover:bg-white/5'
              )}
            >
              <route.icon className={cn(
                'h-5 w-5',
                isActive ? 'text-white' : 'text-white/40 group-hover:text-white'
              )} />
              <span className="text-sm font-bold tracking-tight">
                {label}
              </span>
              {isActive && (
                <ChevronRight className="ml-auto h-3.5 w-3.5 opacity-50" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer / User Profile Section */}
      <div className="p-4 relative z-10 border-t border-white/5">
        <div className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition-all group">
          <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-primary to-violet-500 flex items-center justify-center text-[10px] font-black">
            {user?.firstName?.[0]}{user?.lastName?.[0]}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-black truncate text-white">{user?.firstName}</div>
            <div className="text-[9px] text-white/30 font-bold uppercase truncate">{user?.role?.replace('_', ' ')}</div>
          </div>
          <button
            onClick={logout}
            className="p-2 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-all"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
