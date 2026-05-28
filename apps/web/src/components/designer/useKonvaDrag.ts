'use client';

import { useLayoutEffect, useRef } from 'react';
import type Konva from 'konva';

/**
 * Keeps Konva node position in sync with React state without fighting live drag.
 * Position is applied via ref — never pass x/y as React props on the Group.
 */
export function useKonvaDragPosition(x: number, y: number) {
  const groupRef = useRef<Konva.Group>(null);
  const isDraggingRef = useRef(false);

  useLayoutEffect(() => {
    const node = groupRef.current;
    if (!node) return;
    // Do not snap back to React props while the user is dragging.
    if (isDraggingRef.current) return;
    node.position({ x, y });
  }, [x, y]);

  const bindDrag = (
    onPosition: (x: number, y: number) => void,
    hooks?: { onDragStart?: () => void; onDragEnd?: () => void },
  ) => ({
    onDragStart: () => {
      isDraggingRef.current = true;
      hooks?.onDragStart?.();
    },
    onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => {
      isDraggingRef.current = false;
      onPosition(e.target.x(), e.target.y());
      hooks?.onDragEnd?.();
    },
  });

  return { groupRef, bindDrag };
}
