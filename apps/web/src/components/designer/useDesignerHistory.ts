'use client';

import { useCallback, useRef, useState } from 'react';
import type { DesignerElement } from '@/lib/designer-utils';

const MAX_HISTORY = 50;

export function useDesignerHistory(initial: DesignerElement[]) {
  const [elements, setElementsState] = useState<DesignerElement[]>(initial);
  const pastRef = useRef<DesignerElement[][]>([]);
  const futureRef = useRef<DesignerElement[][]>([]);
  const [historyTick, setHistoryTick] = useState(0);

  const bump = () => setHistoryTick((n) => n + 1);

  const pushPast = useCallback((snapshot: DesignerElement[]) => {
    pastRef.current = [...pastRef.current.slice(-(MAX_HISTORY - 1)), snapshot];
    futureRef.current = [];
    bump();
  }, []);

  const setElements = useCallback(
    (updater: DesignerElement[] | ((prev: DesignerElement[]) => DesignerElement[]), recordHistory = false) => {
      setElementsState((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        if (recordHistory && next !== prev) {
          pushPast(prev);
        }
        return next;
      });
    },
    [pushPast],
  );

  const replaceElements = useCallback((next: DesignerElement[]) => {
    setElementsState(next);
    pastRef.current = [];
    futureRef.current = [];
    bump();
  }, []);

  const undo = useCallback(() => {
    const past = pastRef.current;
    if (past.length === 0) return false;
    const previous = past[past.length - 1];
    pastRef.current = past.slice(0, -1);
    setElementsState((current) => {
      futureRef.current = [current, ...futureRef.current];
      return previous;
    });
    bump();
    return true;
  }, []);

  const redo = useCallback(() => {
    const future = futureRef.current;
    if (future.length === 0) return false;
    const [next, ...rest] = future;
    futureRef.current = rest;
    setElementsState((current) => {
      pastRef.current = [...pastRef.current, current];
      return next;
    });
    bump();
    return true;
  }, []);

  return {
    elements,
    setElements,
    replaceElements,
    undo,
    redo,
    canUndo: historyTick >= 0 && pastRef.current.length > 0,
    canRedo: historyTick >= 0 && futureRef.current.length > 0,
    historyVersion: historyTick,
  };
}
