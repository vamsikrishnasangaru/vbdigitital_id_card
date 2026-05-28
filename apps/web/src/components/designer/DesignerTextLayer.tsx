'use client';

import { useLayoutEffect, useRef } from 'react';
import { Group, Text, Rect } from 'react-konva';
import Konva from 'konva';
import type { DesignerElement } from '@/lib/designer-utils';
import { getKonvaFontStyle } from '@/lib/designer-utils';
import { useLayerSnapDrag } from './useLayerSnapDrag';

interface DesignerTextLayerProps {
  el: DesignerElement;
  text: string;
  selected: boolean;
  ppiRatio: number;
  cardWidth: number;
  cardHeight: number;
  orientation: 'HORIZONTAL' | 'VERTICAL';
  showFrame: boolean;
  draggable: boolean;
  onSelect: () => void;
  onDragEnd: (x: number, y: number) => void;
  onTransformEnd: (node: Konva.Group) => void;
}

const PREVIEW_FONT_SIZE = 12;
const PREVIEW_FILL = '#111827';

export function DesignerTextLayer({
  el,
  text,
  selected,
  ppiRatio,
  cardWidth,
  cardHeight,
  orientation,
  showFrame,
  draggable,
  onSelect,
  onDragEnd,
  onTransformEnd,
}: DesignerTextLayerProps) {
  const frameSizeRef = useRef({ width: 40, height: PREVIEW_FONT_SIZE * 1.4 });
  const hasBoxWidth = el.width != null && el.width > 0;
  const previewFontSize = el.fontSize ?? PREVIEW_FONT_SIZE;
  const frameSize = frameSizeRef.current;

  const { groupRef, dragBoundFunc, onDragStart, onDragEnd: onDragEndKonva } = useLayerSnapDrag(
    el,
    cardWidth,
    cardHeight,
    orientation,
    onDragEnd,
  );

  const textRef = useRef<Konva.Text>(null);
  useLayoutEffect(() => {
    const node = textRef.current;
    if (!node) return;
    frameSizeRef.current = {
      width: hasBoxWidth ? el.width! : Math.max(node.width(), 8),
      height: Math.max(node.height(), previewFontSize * 1.2),
    };
  }, [text, el.width, hasBoxWidth, previewFontSize, el.fontFamily, el.fontStyle, el.textDecoration]);

  return (
    <Group
      ref={groupRef}
      id={el.id}
      draggable={draggable}
      dragBoundFunc={dragBoundFunc}
      onDragStart={onDragStart}
      onDragEnd={onDragEndKonva}
      onTransformEnd={(e) => onTransformEnd(e.target as Konva.Group)}
      onClick={onSelect}
      onTap={onSelect}
    >
      {showFrame && selected && (
        <Rect
          x={0}
          y={0}
          width={frameSize.width}
          height={frameSize.height}
          stroke="#3b82f6"
          strokeWidth={Math.max(1, ppiRatio * 0.75)}
          dash={[4 * ppiRatio, 3 * ppiRatio]}
          listening={false}
        />
      )}
      <Text
        ref={textRef}
        text={text}
        {...(hasBoxWidth ? { width: el.width, wrap: 'word' as const } : {})}
        fontSize={previewFontSize}
        fontFamily={el.fontFamily || 'Arial'}
        fontStyle={getKonvaFontStyle(el)}
        textDecoration={el.textDecoration || ''}
        fill={el.fill ?? PREVIEW_FILL}
        stroke={el.strokeWidth && el.stroke ? el.stroke : undefined}
        strokeWidth={el.strokeWidth ? el.strokeWidth * ppiRatio : 0}
      />
    </Group>
  );
}
