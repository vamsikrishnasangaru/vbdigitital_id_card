'use client';

import { useEffect, useLayoutEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { isEffectivelyOffline } from '@/lib/offline-store';
import { Sidebar } from '@/components/layout/Sidebar';
import { Navbar } from '@/components/layout/Navbar';
import { OfflineAppBanner } from '@/components/OfflineAppBanner';
import { PwaInstallBanner } from '@/components/PwaInstallBanner';
import { OfflineRouteGuard } from '@/components/OfflineRouteGuard';
import { WifiOff } from 'lucide-react';

/** Routes only Super Admin may open (school admin & teacher are redirected). */
const SUPER_ADMIN_ONLY_PATHS = ['/analytics'];

function OfflineSignInNeeded() {
  return (
    <div className="h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md text-center space-y-3">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
          <WifiOff className="h-6 w-6 text-muted-foreground" />
        </div>
        <h1 className="text-lg font-semibold text-foreground">Sign in required</h1>
        <p className="text-sm text-muted-foreground">
          You are offline and not signed in on this device. Connect once to sign in — after that,
          Students and Dashboard work offline.
        </p>
      </div>
    </div>
  );
}

/**
 * Always render the dashboard chrome (no “Starting session…” SSR shell).
 * That way the cached offline HTML is the real app shell, not a spinner.
 * Auth redirect runs only after client bootstrap.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [bootstrapped, setBootstrapped] = useState(false);
  const { user, isAuthenticated, initialize } = useAuthStore();

  useLayoutEffect(() => {
    initialize();
    setBootstrapped(true);
  }, [initialize]);

  useEffect(() => {
    if (!bootstrapped || isAuthenticated) return;
    if (isEffectivelyOffline()) return;
    router.push('/');
  }, [bootstrapped, isAuthenticated, router]);

  useEffect(() => {
    if (!bootstrapped || !isAuthenticated || user?.role === 'SUPER_ADMIN') return;
    const blocked = SUPER_ADMIN_ONLY_PATHS.some(
      (p) => pathname === p || pathname.startsWith(`${p}/`),
    );
    if (blocked) router.replace('/dashboard');
  }, [bootstrapped, isAuthenticated, user?.role, pathname, router]);

  if (bootstrapped && !isAuthenticated) {
    if (isEffectivelyOffline()) return <OfflineSignInNeeded />;
    return null;
  }

  return (
    <div className="h-screen flex overflow-hidden bg-background">
      <div className="hidden lg:flex lg:w-[260px] lg:flex-col lg:fixed lg:inset-y-0 z-50">
        <Sidebar />
      </div>

      <main className="lg:pl-[260px] flex-1 flex flex-col h-full min-w-0">
        <Navbar />
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto w-full min-w-0">
            <PwaInstallBanner />
            <OfflineAppBanner />
            <OfflineRouteGuard role={user?.role} />
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
