'use client';

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Group, Text, Rect } from 'react-konva';
import Konva from 'konva';
import type { DesignerElement } from '@/lib/designer-utils';
import { getDashPattern, getEffectiveBorderWidth, getKonvaFontStyle, isStudentNameFieldType, applyTextCase } from '@/lib/designer-utils';
import { useLayerSnapDrag } from './useLayerSnapDrag';
import { fitSingleLineFontSize, singleLineTextHeight } from './designer-text-fit';

interface DesignerTextLayerProps {
  el: DesignerElement;
  text: string;
  selected: boolean;
  ppiRatio: number;
  /** Multiply border/stroke widths; use 1 when element geometry is already scaled (render export). */
  unitScale?: number;
  cardWidth: number;
  cardHeight: number;
  orientation: 'HORIZONTAL' | 'VERTICAL';
  showFrame: boolean;
  draggable: boolean;
  onSelect: () => void;
  onDragEnd: (x: number, y: number) => void;
  onTransformEnd: (node: Konva.Group) => void;
  /** Sharper text when supersampling for preview/export. */
  highQuality?: boolean;
}

const PREVIEW_FONT_SIZE = 12;
const PREVIEW_FILL = '#111827';

/** Fields that auto-shrink font so long values stay inside the text box. */
const SHRINK_FIELD_TYPES = new Set([
  'fullName',
  'studentName',
  'firstName',
  'lastName',
  'fatherName',
  'motherName',
  'parentName',
  'address',
]);

function shouldShrinkToFit(fieldType?: string): boolean {
  return !!fieldType && SHRINK_FIELD_TYPES.has(fieldType);
}

export function DesignerTextLayer({
  el,
  text,
  selected,
  ppiRatio,
  unitScale: unitScaleProp,
  cardWidth,
  cardHeight,
  orientation,
  showFrame,
  draggable,
  onSelect,
  onDragEnd,
  onTransformEnd,
  highQuality = false,
}: DesignerTextLayerProps) {
  const unitScale = unitScaleProp ?? ppiRatio;
  const isNameField = isStudentNameFieldType(el.fieldType);
  const shrinkToFit = shouldShrinkToFit(el.fieldType);
  const displayText = useMemo(() => applyTextCase(text, el.textCase), [text, el.textCase]);
  const hasBoxWidth = el.width != null && el.width > 0;
  const baseFontSize = el.fontSize ?? PREVIEW_FONT_SIZE;
  const fontFamily = el.fontFamily || 'Arial';
  const fontStyle = getKonvaFontStyle(el);
  const textDecoration = el.textDecoration || '';

  const fitWidth = useMemo(() => {
    if (!shrinkToFit) return null;
    if (hasBoxWidth) return el.width!;
    // Leave a small right margin so text does not touch the card edge.
    return Math.max(48, cardWidth - el.x - 8);
  }, [shrinkToFit, hasBoxWidth, el.width, el.x, cardWidth]);

  const displayFontSize = useMemo(() => {
    if (!fitWidth || !displayText.trim()) return baseFontSize;
    return fitSingleLineFontSize(
      displayText,
      fitWidth,
      baseFontSize,
      fontFamily,
      fontStyle,
      textDecoration,
    );
  }, [fitWidth, displayText, baseFontSize, fontFamily, fontStyle, textDecoration]);

  const lineHeight = singleLineTextHeight(displayFontSize);
  const textBoxWidth = hasBoxWidth
    ? el.width!
    : shrinkToFit && fitWidth
      ? fitWidth
      : undefined;
  const textBoxHeight = hasBoxWidth ? Math.max(lineHeight, el.height ?? lineHeight) : lineHeight;
  // Student name stays centered; father/mother/address keep left (or designer) alignment.
  const textAlign = isNameField ? (el.textAlign ?? 'center') : (el.textAlign ?? 'left');
  const centerInBox = isNameField && textBoxWidth != null;
  const alignInBox = shrinkToFit && textBoxWidth != null;
  const textY =
    (centerInBox || alignInBox) && hasBoxWidth && el.height != null && el.height > lineHeight
      ? (el.height - lineHeight) / 2
      : centerInBox
        ? 0
        : hasBoxWidth && el.height != null && el.height > lineHeight
          ? (el.height - lineHeight) / 2
          : 0;

  const [frameSize, setFrameSize] = useState({
    width: textBoxWidth ?? (hasBoxWidth ? el.width! : 40),
    height: hasBoxWidth ? textBoxHeight : lineHeight,
  });
  const borderW = getEffectiveBorderWidth(el) * unitScale;

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
      width: textBoxWidth ?? (hasBoxWidth ? el.width! : Math.max(node.width(), 8)),
      height: hasBoxWidth ? textBoxHeight : Math.max(node.height(), lineHeight),
    };
    setFrameSize((prev) =>
      prev.width === next.width && prev.height === next.height ? prev : next,
    );
  }, [
    text,
    displayText,
    el.width,
    el.height,
    hasBoxWidth,
    displayFontSize,
    lineHeight,
    textBoxHeight,
    textBoxWidth,
    fontFamily,
    fontStyle,
    textDecoration,
    el.fill,
    el.fontSize,
  ]);

  const strokeW = (el.strokeWidth ?? 0) > 0 && el.stroke ? el.strokeWidth! * unitScale : 0;
  const strokeColor = el.stroke;
  const fillColor = el.fill ?? PREVIEW_FILL;

  const sharedTextProps = {
    y: textY,
    text: displayText,
    width: textBoxWidth,
    height: alignInBox || centerInBox ? textBoxHeight : undefined,
    align: textAlign,
    verticalAlign: alignInBox || centerInBox ? ('middle' as const) : undefined,
    wrap: 'none' as const,
    ellipsis: false,
    fontSize: displayFontSize,
    fontFamily,
    fontStyle,
    textDecoration,
    listening: false,
    perfectDrawEnabled: highQuality,
  };

  return (
    <Group
      ref={groupRef}
      id={el.id}
      opacity={el.opacity ?? 1}
      rotation={el.rotation ?? 0}
      draggable={draggable}
      dragBoundFunc={dragBoundFunc}
      onDragStart={onDragStart}
      onDragEnd={onDragEndKonva}
      onTransformEnd={(e) => onTransformEnd(e.target as Konva.Group)}
      onClick={onSelect}
      onTap={onSelect}
      clip={
        hasBoxWidth ? { x: 0, y: 0, width: el.width!, height: textBoxHeight } : undefined
      }
    >
      {(showFrame || draggable) && (
        <Rect
          x={0}
          y={0}
          width={Math.max(frameSize.width, 8)}
          height={Math.max(frameSize.height, lineHeight)}
          fill="transparent"
          listening
        />
      )}
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
      {strokeW > 0 && strokeColor && (
        <Text
          {...sharedTextProps}
          fill="transparent"
          stroke={strokeColor}
          strokeWidth={strokeW * 2}
          listening={false}
        />
      )}
      <Text ref={textRef} {...sharedTextProps} fill={fillColor} />
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
