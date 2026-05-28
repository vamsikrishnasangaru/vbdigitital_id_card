'use client';

import { Group, Rect, Text } from 'react-konva';
import Konva from 'konva';
import type { DesignerElement } from '@/lib/designer-utils';
import { getDashPattern } from '@/lib/designer-utils';
import { useLayerSnapDrag } from './useLayerSnapDrag';

interface DesignerBoxLayerProps {
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

export function DesignerBoxLayer({
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
}: DesignerBoxLayerProps) {
  const boxW = el.width || (el.type === 'qr' ? 56 : 120);
  const boxH = el.height || (el.type === 'qr' ? 56 : 32);

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
      onTransformEnd={(e) => onTransformEnd(e.target as Konva.Group)}
      onClick={onSelect}
      onTap={onSelect}
    >
      <Rect
        width={boxW}
        height={boxH}
        fill="#f8fafc"
        stroke={selected ? '#3b82f6' : '#94a3b8'}
        strokeWidth={Math.max(1, ppiRatio)}
        dash={getDashPattern('solid', 1)}
      />
      <Text
        text={el.type === 'qr' ? 'QR' : '|||||'}
        x={8 * ppiRatio}
        y={boxH / 2 - 6 * ppiRatio}
        fontSize={12 * ppiRatio}
        fill="#64748b"
      />
    </Group>
  );
}
