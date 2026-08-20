'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  getOfflineReadyState,
  offlineReadyEventName,
  type OfflineReadyState,
} from '@/lib/offline-ready';
import { syncEngine } from '@/lib/sync-engine';
import { isEffectivelyOffline } from '@/lib/offline-store';

function subscribeOfflineReady(onStoreChange: () => void) {
  window.addEventListener(offlineReadyEventName(), onStoreChange);
  return () => window.removeEventListener(offlineReadyEventName(), onStoreChange);
}

function getOfflineReadySnapshot(): OfflineReadyState {
  return getOfflineReadyState();
}

const IDLE: OfflineReadyState = {
  status: 'idle',
  progress: 0,
  secondsLeft: 0,
  message: '',
};

/**
 * Offline cache status as a fixed banner (not Sonner).
 * Loading toasts were sticking forever and blocking the UI.
 */
export function OfflineReadyIndicator() {
  const state = useSyncExternalStore(
    subscribeOfflineReady,
    getOfflineReadySnapshot,
    () => IDLE,
  );
  const [hideReady, setHideReady] = useState(false);
  const wasOfflineRef = useRef(false);
  const syncToastRef = useRef(false);
  const readyShownAtRef = useRef(0);

  useEffect(() => {
    if (state.status !== 'ready') {
      setHideReady(false);
      readyShownAtRef.current = 0;
      return;
    }
    if (!readyShownAtRef.current) readyShownAtRef.current = Date.now();
    const left = Math.max(0, 12_000 - (Date.now() - readyShownAtRef.current));
    const timer = window.setTimeout(() => setHideReady(true), left);
    return () => window.clearTimeout(timer);
  }, [state.status]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Clear any stuck Sonner "Preparing offline" toast from older builds.
    void import('sonner').then(({ toast }) => {
      toast.dismiss('vb-offline-preparing');
    });

    const onConnectivity = () => {
      const offline = isEffectivelyOffline();
      if (offline) {
        wasOfflineRef.current = true;
        syncToastRef.current = false;
        return;
      }
      if (wasOfflineRef.current && !syncToastRef.current) {
        syncToastRef.current = true;
        wasOfflineRef.current = false;
        void syncEngine.flushQueue();
      }
    };

    window.addEventListener('online', onConnectivity);
    window.addEventListener('offline', onConnectivity);
    window.addEventListener('vb-connectivity-changed', onConnectivity);
    wasOfflineRef.current = isEffectivelyOffline();

    return () => {
      window.removeEventListener('online', onConnectivity);
      window.removeEventListener('offline', onConnectivity);
      window.removeEventListener('vb-connectivity-changed', onConnectivity);
    };
  }, []);

  if (state.status === 'idle') return null;
  if (state.status === 'ready' && hideReady) return null;

  const preparing = state.status === 'preparing';

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 right-4 z-[200] max-w-sm"
    >
      <div
        className={
          preparing
            ? 'rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-lg'
            : 'rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950 shadow-lg'
        }
      >
        <p className="font-medium">
          {preparing ? `Preparing offline… ${state.progress}%` : 'Offline ready'}
        </p>
        <p className="mt-0.5 text-xs opacity-80">
          {preparing
            ? 'Stay online until caching finishes.'
            : 'You can go offline now. Changes sync when internet returns.'}
        </p>
        {preparing ? (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-amber-200/80">
            <div
              className="h-full rounded-full bg-amber-500 transition-[width] duration-300"
              style={{ width: `${Math.max(4, state.progress)}%` }}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
