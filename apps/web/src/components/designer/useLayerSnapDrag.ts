'use client';

import { useMemo } from 'react';
import type { DesignerElement } from '@/lib/designer-utils';
import { clampDragPositionForElement } from '@/lib/designer-utils';
import { useDesignerSnapOptional } from './DesignerSnapContext';
import { useKonvaDragPosition } from './useKonvaDrag';

export function useLayerSnapDrag(
  el: DesignerElement,
  cardWidth: number,
  cardHeight: number,
  orientation: 'HORIZONTAL' | 'VERTICAL',
  onDragEnd: (x: number, y: number) => void,
) {
  const snap = useDesignerSnapOptional();
  const { groupRef, bindDrag } = useKonvaDragPosition(el.x, el.y);

  const dragBoundFunc = useMemo(() => {
    if (snap) return snap.getDragBound(el.id);
    return (pos: { x: number; y: number }) =>
      clampDragPositionForElement(pos, el, orientation, cardWidth, cardHeight);
  }, [snap, el, orientation, cardWidth, cardHeight]);

  const dragHandlers = bindDrag(
    (x, y) => {
      const snapped = snap?.applySnapToPosition
        ? snap.applySnapToPosition(el.id, { x, y })
        : { x, y };
      onDragEnd(snapped.x, snapped.y);
    },
    {
      onDragStart: snap?.onDragStart,
      onDragEnd: snap?.onDragEnd,
    },
  );

  return { groupRef, dragBoundFunc, ...dragHandlers };
}
