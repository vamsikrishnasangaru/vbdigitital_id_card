'use client';

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Group, Text, Rect } from 'react-konva';
import Konva from 'konva';
import type { DesignerElement } from '@/lib/designer-utils';
import { getDashPattern, getEffectiveBorderWidth, getKonvaFontStyle } from '@/lib/designer-utils';
import { useLayerSnapDrag } from './useLayerSnapDrag';
import { fitSingleLineFontSize, singleLineTextHeight } from './designer-text-fit';

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

const SHRINK_FIELD_TYPES = new Set([
  'fullName',
  'studentName',
  'firstName',
  'lastName',
  'fatherName',
  'motherName',
  'parentName',
]);

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
  const baseFontSize = el.fontSize ?? PREVIEW_FONT_SIZE;
  const fontFamily = el.fontFamily || 'Arial';
  const fontStyle = getKonvaFontStyle(el);
  const textDecoration = el.textDecoration || '';

  const fitWidth = useMemo(() => {
    if (hasBoxWidth) return el.width!;
    if (el.fieldType && SHRINK_FIELD_TYPES.has(el.fieldType)) {
      return Math.max(48, cardWidth - el.x - 6);
    }
    return null;
  }, [hasBoxWidth, el.width, el.fieldType, el.x, cardWidth]);

  const displayFontSize = useMemo(() => {
    if (!fitWidth || !text.trim()) return baseFontSize;
    return fitSingleLineFontSize(text, fitWidth, baseFontSize, fontFamily, fontStyle, textDecoration);
  }, [fitWidth, text, baseFontSize, fontFamily, fontStyle, textDecoration]);

  const lineHeight = singleLineTextHeight(displayFontSize);
  const boxHeight = hasBoxWidth ? (el.height ?? lineHeight) : lineHeight;
  const textY = hasBoxWidth && el.height != null && el.height > lineHeight
    ? (el.height - lineHeight) / 2
    : 0;

  const [frameSize, setFrameSize] = useState({
    width: hasBoxWidth ? el.width! : 40,
    height: boxHeight,
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
      height: hasBoxWidth ? boxHeight : Math.max(node.height(), lineHeight),
    };
    setFrameSize((prev) =>
      prev.width === next.width && prev.height === next.height ? prev : next,
    );
  }, [
    text,
    el.width,
    el.height,
    hasBoxWidth,
    displayFontSize,
    lineHeight,
    boxHeight,
    fontFamily,
    fontStyle,
    textDecoration,
    el.fill,
    el.fontSize,
  ]);

  return (
    <Group
      ref={groupRef}
      id={el.id}
      opacity={el.opacity ?? 1}
      draggable={draggable}
      dragBoundFunc={dragBoundFunc}
      onDragStart={onDragStart}
      onDragEnd={onDragEndKonva}
      onTransformEnd={(e) => onTransformEnd(e.target as Konva.Group)}
      onClick={onSelect}
      onTap={onSelect}
      clip={
        hasBoxWidth
          ? { x: 0, y: 0, width: el.width!, height: boxHeight }
          : undefined
      }
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
        y={textY}
        text={text}
        width={hasBoxWidth ? el.width : undefined}
        wrap="none"
        fontSize={displayFontSize}
        fontFamily={fontFamily}
        fontStyle={fontStyle}
        textDecoration={textDecoration}
        fill={el.fill ?? PREVIEW_FILL}
        stroke={(el.strokeWidth ?? 0) > 0 && el.stroke ? el.stroke : undefined}
        strokeWidth={(el.strokeWidth ?? 0) > 0 ? el.strokeWidth! * ppiRatio : 0}
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
