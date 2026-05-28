'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { DesignerElement } from '@/lib/designer-utils';
import {
  clampDragPositionForElement,
  getDragClampSize,
  getElementBounds,
} from '@/lib/designer-utils';
import {
  DESIGN_GRID_STEP,
  DESIGN_SNAP_THRESHOLD,
  EMPTY_SNAP_GUIDES,
  snapDragPosition,
  type SnapGuides,
} from '@/lib/designer-snap';

interface DesignerSnapContextValue {
  showGrid: boolean;
  setShowGrid: React.Dispatch<React.SetStateAction<boolean>>;
  snapEnabled: boolean;
  setSnapEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  guides: SnapGuides;
  /** Card-edge clamp only — elements move freely while dragging. */
  getDragBound: (elementId: string) => (pos: { x: number; y: number }) => { x: number; y: number };
  /** Optional grid / alignment snap when the user releases the element. */
  applySnapToPosition: (
    elementId: string,
    pos: { x: number; y: number },
  ) => { x: number; y: number };
  onDragStart: () => void;
  onDragEnd: () => void;
  gridStep: number;
}

const DesignerSnapContext = createContext<DesignerSnapContextValue | null>(null);

export function DesignerSnapProvider({
  children,
  cardWidth,
  cardHeight,
  ppiRatio,
  displayElements,
  orientation,
}: {
  children: React.ReactNode;
  cardWidth: number;
  cardHeight: number;
  ppiRatio: number;
  displayElements: DesignerElement[];
  orientation: 'HORIZONTAL' | 'VERTICAL';
}) {
  const [showGrid, setShowGrid] = useState(true);
  const [snapEnabled, setSnapEnabled] = useState(false);
  const [guides, setGuides] = useState<SnapGuides>(EMPTY_SNAP_GUIDES);
  const guidesRafRef = useRef<number | null>(null);
  const pendingGuidesRef = useRef<SnapGuides>(EMPTY_SNAP_GUIDES);

  const gridStep = DESIGN_GRID_STEP * ppiRatio;
  const threshold = DESIGN_SNAP_THRESHOLD * ppiRatio;

  const findElement = useCallback(
    (elementId: string) => displayElements.find((e) => e.id === elementId),
    [displayElements],
  );

  const snapSizes = useCallback(
    (el: DesignerElement) => {
      const clamp = getDragClampSize(el, orientation);
      if (clamp.anchorOnly) {
        return { elW: 0, elH: 0, anchorOnly: true as const };
      }
      return { elW: clamp.width, elH: clamp.height, anchorOnly: false as const };
    },
    [orientation],
  );

  const buildOthers = useCallback(
    (elementId: string) =>
      displayElements
        .filter((e) => e.id !== elementId && e.visible !== false)
        .map((e) => {
          const b = getElementBounds(e, orientation);
          return { id: e.id, x: e.x, y: e.y, width: b.width, height: b.height };
        }),
    [displayElements, orientation],
  );

  const scheduleGuides = useCallback((next: SnapGuides) => {
    pendingGuidesRef.current = next;
    if (guidesRafRef.current != null) return;
    guidesRafRef.current = requestAnimationFrame(() => {
      guidesRafRef.current = null;
      setGuides(pendingGuidesRef.current);
    });
  }, []);

  const getDragBound = useCallback(
    (elementId: string) => {
      return (pos: { x: number; y: number }) => {
        const el = findElement(elementId);
        if (!el) return pos;

        const clamped = clampDragPositionForElement(pos, el, orientation, cardWidth, cardHeight);

        if (snapEnabled) {
          const { elW, elH } = snapSizes(el);
          const preview = snapDragPosition(clamped, elW, elH, cardWidth, cardHeight, {
            gridStep,
            threshold,
            enableGrid: showGrid,
            enableAlignment: true,
            others: buildOthers(elementId),
          });
          scheduleGuides(preview.guides);
        } else {
          scheduleGuides(EMPTY_SNAP_GUIDES);
        }

        return clamped;
      };
    },
    [
      findElement,
      orientation,
      cardWidth,
      cardHeight,
      gridStep,
      threshold,
      showGrid,
      snapEnabled,
      snapSizes,
      buildOthers,
      scheduleGuides,
    ],
  );

  const applySnapToPosition = useCallback(
    (elementId: string, pos: { x: number; y: number }) => {
      const el = findElement(elementId);
      if (!el) return pos;

      const clamped = clampDragPositionForElement(pos, el, orientation, cardWidth, cardHeight);
      if (!snapEnabled) return clamped;

      const { elW, elH } = snapSizes(el);
      const result = snapDragPosition(clamped, elW, elH, cardWidth, cardHeight, {
        gridStep,
        threshold,
        enableGrid: showGrid,
        enableAlignment: true,
        others: buildOthers(elementId),
      });
      return { x: result.x, y: result.y };
    },
    [
      findElement,
      orientation,
      cardWidth,
      cardHeight,
      gridStep,
      threshold,
      showGrid,
      snapEnabled,
      snapSizes,
      buildOthers,
    ],
  );

  const onDragStart = useCallback(() => {
    if (guidesRafRef.current != null) {
      cancelAnimationFrame(guidesRafRef.current);
      guidesRafRef.current = null;
    }
    setGuides(EMPTY_SNAP_GUIDES);
  }, []);

  const onDragEnd = useCallback(() => {
    if (guidesRafRef.current != null) {
      cancelAnimationFrame(guidesRafRef.current);
      guidesRafRef.current = null;
    }
    setGuides(EMPTY_SNAP_GUIDES);
  }, []);

  const value = useMemo(
    () => ({
      showGrid,
      setShowGrid,
      snapEnabled,
      setSnapEnabled,
      guides,
      getDragBound,
      applySnapToPosition,
      onDragStart,
      onDragEnd,
      gridStep,
    }),
    [
      showGrid,
      snapEnabled,
      guides,
      getDragBound,
      applySnapToPosition,
      onDragStart,
      onDragEnd,
      gridStep,
    ],
  );

  return <DesignerSnapContext.Provider value={value}>{children}</DesignerSnapContext.Provider>;
}

export function useDesignerSnap() {
  const ctx = useContext(DesignerSnapContext);
  if (!ctx) {
    throw new Error('useDesignerSnap must be used within DesignerSnapProvider');
  }
  return ctx;
}

/** Optional snap hooks for render mode (no provider). */
export function useDesignerSnapOptional() {
  return useContext(DesignerSnapContext);
}
