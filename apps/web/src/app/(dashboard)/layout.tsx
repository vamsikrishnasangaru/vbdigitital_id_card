'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { Sidebar } from '@/components/layout/Sidebar';
import { Navbar } from '@/components/layout/Navbar';
import { OfflineAppBanner } from '@/components/OfflineAppBanner';
import { PwaInstallBanner } from '@/components/PwaInstallBanner';

/** Routes only Super Admin may open (school admin & teacher are redirected). */
const SUPER_ADMIN_ONLY_PATHS = ['/orders', '/deliveries', '/analytics'];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isAuthenticated, isLoading, initialize } = useAuthStore();

  useEffect(() => { initialize(); }, [initialize]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.push('/');
  }, [isLoading, isAuthenticated, router]);

  useEffect(() => {
    if (isLoading || !isAuthenticated || user?.role === 'SUPER_ADMIN') return;
    const blocked = SUPER_ADMIN_ONLY_PATHS.some(
      (p) => pathname === p || pathname.startsWith(`${p}/`),
    );
    if (blocked) router.replace('/dashboard');
  }, [isLoading, isAuthenticated, user?.role, pathname, router]);

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-muted-foreground">Loading...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <div className="h-screen flex overflow-hidden bg-background">
      {/* Desktop Sidebar */}
      <div className="hidden lg:flex lg:w-[260px] lg:flex-col lg:fixed lg:inset-y-0 z-50">
        <Sidebar />
      </div>

      {/* Main Content */}
      <main className="lg:pl-[260px] flex-1 flex flex-col h-full min-w-0">
        <Navbar />
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto w-full min-w-0">
            <PwaInstallBanner />
            <OfflineAppBanner />
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
