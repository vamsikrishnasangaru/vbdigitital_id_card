'use client';

import { Group, Rect } from 'react-konva';
import Konva from 'konva';
import type { DesignerElement } from '@/lib/designer-utils';
import { useLayerSnapDrag } from './useLayerSnapDrag';

interface DesignerShapeLayerProps {
  el: DesignerElement;
  selected: boolean;
  ppiRatio: number;
  cardWidth: number;
  cardHeight: number;
  orientation: 'HORIZONTAL' | 'VERTICAL';
  draggable: boolean;
  onSelect: () => void;
  onDragEnd: (x: number, y: number) => void;
  onTransformEnd: (node: Konva.Group) => void;
}

export function DesignerShapeLayer({
  el,
  selected,
  ppiRatio,
  cardWidth,
  cardHeight,
  orientation,
  draggable,
  onSelect,
  onDragEnd,
  onTransformEnd,
}: DesignerShapeLayerProps) {
  const isDivider = el.fieldType === 'divider';
  const boxW = el.width ?? (isDivider ? 120 : 80);
  const boxH = el.height ?? (isDivider ? 2 : 40);

  const { groupRef, dragBoundFunc, onDragStart, onDragEnd: onDragEndKonva } = useLayerSnapDrag(
    el,
    cardWidth,
    cardHeight,
    orientation,
    onDragEnd,
  );

  return (
    <Group
      ref={groupRef}
      id={el.id}
      draggable={draggable && !el.locked}
      dragBoundFunc={dragBoundFunc}
      onDragStart={onDragStart}
      onDragEnd={onDragEndKonva}
      opacity={el.opacity ?? 1}
      rotation={el.rotation ?? 0}
      onTransformEnd={(e) => onTransformEnd(e.target as Konva.Group)}
      onClick={onSelect}
      onTap={onSelect}
    >
      <Rect
        width={boxW}
        height={boxH}
        fill={el.fill ?? (isDivider ? '#94a3b8' : '#3b82f6')}
        stroke={selected ? '#6366f1' : el.stroke}
        strokeWidth={selected ? Math.max(1, ppiRatio) : (el.strokeWidth ?? 0)}
        cornerRadius={el.cornerRadius ?? (isDivider ? 0 : 8)}
      />
    </Group>
  );
}
