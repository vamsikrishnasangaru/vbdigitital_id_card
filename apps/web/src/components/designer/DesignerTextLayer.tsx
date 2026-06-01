'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { Group, Text, Rect } from 'react-konva';
import Konva from 'konva';
import type { DesignerElement } from '@/lib/designer-utils';
import { getDashPattern, getEffectiveBorderWidth, getKonvaFontStyle } from '@/lib/designer-utils';
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
  const hasBoxWidth = el.width != null && el.width > 0;
  const previewFontSize = el.fontSize ?? PREVIEW_FONT_SIZE;
  const [frameSize, setFrameSize] = useState({
    width: hasBoxWidth ? el.width! : 40,
    height: previewFontSize * 1.4,
  });
  const borderW = getEffectiveBorderWidth(el) * ppiRatio;

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
    const next = {
      width: hasBoxWidth ? el.width! : Math.max(node.width(), 8),
      height: Math.max(node.height(), previewFontSize * 1.2),
    };
    setFrameSize((prev) =>
      prev.width === next.width && prev.height === next.height ? prev : next,
    );
  }, [
    text,
    el.width,
    hasBoxWidth,
    previewFontSize,
    el.fontFamily,
    el.fontStyle,
    el.textDecoration,
    el.fill,
    el.fontSize,
  ]);

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
        stroke={(el.strokeWidth ?? 0) > 0 && el.stroke ? el.stroke : undefined}
        strokeWidth={(el.strokeWidth ?? 0) > 0 ? (el.strokeWidth ?? 1) * ppiRatio : 0}
      />
      {borderW > 0 && (
        <Rect
          x={0}
          y={0}
          width={frameSize.width}
          height={frameSize.height}
          fillEnabled={false}
          stroke={el.borderColor || '#000000'}
          strokeWidth={borderW}
          dash={getDashPattern(el.borderStyle, borderW)}
          listening={false}
        />
      )}
    </Group>
  );
}
