'use client';

import { useEffect, useRef, useState } from 'react';
import { WifiOff, RefreshCw, CloudUpload, GripVertical } from 'lucide-react';
import { useOfflineSync } from '@/hooks/use-offline-sync';

const POS_KEY = 'vb-sync-indicator-pos';

type Pos = { x: number; y: number };

function clampPos(x: number, y: number, width: number, height: number): Pos {
  const pad = 8;
  const maxX = Math.max(pad, window.innerWidth - width - pad);
  const maxY = Math.max(pad, window.innerHeight - height - pad);
  return {
    x: Math.min(maxX, Math.max(pad, x)),
    y: Math.min(maxY, Math.max(pad, y)),
  };
}

function readSavedPos(): Pos | null {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Pos;
    if (typeof parsed?.x !== 'number' || typeof parsed?.y !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function SyncIndicator() {
  const { isOffline, pendingCount, offlineStudentCount, offlineClassCount, offlineTeacherCount } =
    useOfflineSync();
  const rootRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    moved: boolean;
  } | null>(null);
  const [pos, setPos] = useState<Pos | null>(null);
  const [dragging, setDragging] = useState(false);

  const localCount = offlineStudentCount + offlineClassCount + offlineTeacherCount;
  const show = isOffline || pendingCount > 0 || localCount > 0;

  useEffect(() => {
    if (!show) return;
    const saved = readSavedPos();
    if (!saved) {
      // Default: bottom-left
      setPos({ x: 16, y: Math.max(16, window.innerHeight - 56) });
      return;
    }
    const el = rootRef.current;
    const w = el?.offsetWidth ?? 240;
    const h = el?.offsetHeight ?? 40;
    setPos(clampPos(saved.x, saved.y, w, h));
  }, [show]);

  useEffect(() => {
    if (!show) return;
    const onResize = () => {
      setPos((prev) => {
        if (!prev) return prev;
        const el = rootRef.current;
        const w = el?.offsetWidth ?? 240;
        const h = el?.offsetHeight ?? 40;
        return clampPos(prev.x, prev.y, w, h);
      });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [show]);

  if (!show) return null;

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const el = rootRef.current;
    if (!el || !pos) return;
    el.setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origX: pos.x,
      origY: pos.y,
      moved: false,
    };
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    const el = rootRef.current;
    if (!drag || drag.pointerId !== e.pointerId || !el) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    const next = clampPos(
      drag.origX + dx,
      drag.origY + dy,
      el.offsetWidth,
      el.offsetHeight,
    );
    setPos(next);
  };

  const endDrag = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    try {
      rootRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    setPos((prev) => {
      if (!prev) return prev;
      try {
        localStorage.setItem(POS_KEY, JSON.stringify(prev));
      } catch {
        // ignore
      }
      return prev;
    });
  };

  return (
    <div
      ref={rootRef}
      role="status"
      aria-live="polite"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      style={
        pos
          ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' }
          : { left: 16, bottom: 16 }
      }
      className={`fixed z-50 flex touch-none select-none items-center gap-2 bg-white dark:bg-zinc-900 shadow-lg rounded-full pl-2 pr-4 py-2 border border-slate-200 dark:border-zinc-700 text-sm font-medium max-w-[min(100vw-2rem,24rem)] cursor-grab active:cursor-grabbing ${
        dragging ? 'shadow-xl scale-[1.02]' : ''
      }`}
      title="Drag to move"
    >
      <GripVertical className="w-4 h-4 text-slate-400 shrink-0" aria-hidden />
      {isOffline ? (
        <>
          <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
          <WifiOff className="w-4 h-4 text-amber-600 shrink-0" />
          <span className="text-amber-700 dark:text-amber-400 truncate">working locally</span>
        </>
      ) : pendingCount > 0 ? (
        <>
          <RefreshCw className="w-4 h-4 text-blue-500 animate-spin shrink-0" />
          <span className="text-blue-700 dark:text-blue-400 truncate">Syncing {pendingCount}…</span>
        </>
      ) : (
        <>
          <CloudUpload className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="text-emerald-700 dark:text-emerald-400 truncate">All changes synced</span>
        </>
      )}

      {(pendingCount > 0 || localCount > 0) && (
        <span className="ml-1 pl-3 border-l border-slate-200 dark:border-zinc-600 text-slate-500 text-xs shrink-0">
          {pendingCount > 0 && `${pendingCount} queued`}
          {pendingCount > 0 && localCount > 0 && ' · '}
          {localCount > 0 && `${localCount} local`}
        </span>
      )}
    </div>
  );
}
