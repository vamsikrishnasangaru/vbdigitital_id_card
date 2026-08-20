'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useOfflineSync } from '@/hooks/use-offline-sync';
import { isOfflineAllowedPath } from '@/lib/offline-routes';
import { OfflineNetworkRequiredDialog } from '@/components/OfflineNetworkRequiredDialog';

export function OfflineRouteGuard({ role }: { role?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isOffline, serverUnavailable } = useOfflineSync();
  const workingOffline = isOffline || serverUnavailable;
  const [promptOpen, setPromptOpen] = useState(false);

  useEffect(() => {
    if (!workingOffline) {
      setPromptOpen(false);
      return;
    }
    if (isOfflineAllowedPath(role, pathname)) return;
    setPromptOpen(true);
    router.replace('/dashboard');
  }, [workingOffline, role, pathname, router]);

  return <OfflineNetworkRequiredDialog open={promptOpen} onClose={() => setPromptOpen(false)} />;
}
