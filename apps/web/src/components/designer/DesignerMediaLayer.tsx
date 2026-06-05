'use client';

import { useEffect, useMemo, useRef } from 'react';
import { Group, Image, Rect, Circle, Ellipse } from 'react-konva';
import Konva from 'konva';
import { useCorsImage } from '@/hooks/useCorsImage';
import type { DesignerElement, PhotoShape } from '@/lib/designer-utils';
import {
  getClipFunc,
  getDashPattern,
  getEffectiveBorderWidth,
  getElementSize,
  getImageCoverLayout,
} from '@/lib/designer-utils';
import { useLayerSnapDrag } from './useLayerSnapDrag';

interface DesignerMediaLayerProps {
  el: DesignerElement;
  imageUrl: string;
  selected: boolean;
  ppiRatio: number;
  cardWidth: number;
  cardHeight: number;
  orientation: 'HORIZONTAL' | 'VERTICAL';
  showFrame?: boolean;
  draggable: boolean;
  onSelect: () => void;
  onDragEnd: (x: number, y: number) => void;
  onTransformEnd?: (node: Konva.Group) => void;
}

function ShapeOutline({
  shape,
  w,
  h,
  cornerRadius,
  stroke,
  strokeWidth,
  dash,
}: {
  shape: PhotoShape;
  w: number;
  h: number;
  cornerRadius: number;
  stroke: string;
  strokeWidth: number;
  dash?: number[];
}) {
  const common = { stroke, strokeWidth, dash, fill: 'transparent' as const, listening: false as const };

  if (shape === 'circle') {
    return <Circle x={w / 2} y={h / 2} radius={Math.min(w, h) / 2} {...common} />;
  }
  if (shape === 'ellipse') {
    return <Ellipse x={w / 2} y={h / 2} radiusX={w / 2} radiusY={h / 2} {...common} />;
  }
  if (shape === 'rounded') {
    return <Rect width={w} height={h} cornerRadius={Math.min(cornerRadius, w / 2, h / 2)} {...common} />;
  }
  return <Rect width={w} height={h} {...common} />;
}

export function DesignerMediaLayer({
  el,
  imageUrl,
  selected,
  ppiRatio,
  showFrame = false,
  cardWidth,
  cardHeight,
  orientation,
  draggable,
  onSelect,
  onDragEnd,
  onTransformEnd,
}: DesignerMediaLayerProps) {
  const { width: w, height: h } = getElementSize(el);

  const { groupRef, dragBoundFunc, onDragStart, onDragEnd: onDragEndKonva } = useLayerSnapDrag(
    el,
    cardWidth,
    cardHeight,
    orientation,
    onDragEnd,
  );

  const [image, status] = useCorsImage(imageUrl || '');
  const imageRef = useRef<Konva.Image>(null);
  const isStudentPhoto = el.type === 'photo' || el.fieldType === 'studentPhoto';
  const borderW = getEffectiveBorderWidth(el) * ppiRatio;
  const shape = (el.photoShape || 'rectangle') as PhotoShape;
  const cornerRadius = (el.cornerRadius ?? 8) * ppiRatio;
  const adjust = el.colorAdjust || {};

  const crop = el.crop;
  const cropProps =
    crop && image
      ? {
          crop: {
            x: crop.x * image.width,
            y: crop.y * image.height,
            width: crop.width * image.width,
            height: crop.height * image.height,
          },
        }
      : {};

  const srcW = crop && image ? crop.width * image.width : image?.width ?? w;
  const srcH = crop && image ? crop.height * image.height : image?.height ?? h;
  const cover = useMemo(() => getImageCoverLayout(srcW, srcH, w, h), [srcW, srcH, w, h]);

  const clipFunc = useMemo(
    () => getClipFunc(shape, w, h, cornerRadius),
    [shape, w, h, cornerRadius],
  );

  useEffect(() => {
    const node = imageRef.current;
    if (!node || !image) return;
    node.clearCache();
    const filters: typeof Konva.Filters.Brighten[] = [];
    if (adjust.brightness) filters.push(Konva.Filters.Brighten);
    if (adjust.contrast) filters.push(Konva.Filters.Contrast);
    if (adjust.saturation) filters.push(Konva.Filters.HSL);
    if (filters.length > 0) {
      node.filters(filters);
      if (adjust.brightness) node.brightness(adjust.brightness);
      if (adjust.contrast) node.contrast(adjust.contrast);
      if (adjust.saturation) node.saturation(adjust.saturation / 100);
      node.cache();
    }
    node.getLayer()?.batchDraw();
  }, [image, adjust.brightness, adjust.contrast, adjust.saturation, cover.x, cover.y, cover.width, cover.height, shape]);

  return (
    <Group
      ref={groupRef}
      id={el.id}
      opacity={el.opacity ?? 1}
      draggable={draggable && !el.locked}
      dragBoundFunc={dragBoundFunc}
      onDragStart={onDragStart}
      onDragEnd={onDragEndKonva}
      onTransformEnd={(e) => onTransformEnd?.(e.target as Konva.Group)}
      onClick={onSelect}
      onTap={onSelect}
    >
      <Group clipX={0} clipY={0} clipWidth={w} clipHeight={h} listening={false}>
        <Group key={`clip-${shape}-${Math.round(w)}-${Math.round(h)}-${Math.round(cornerRadius)}`} clipFunc={clipFunc}>
          {image && imageUrl && status !== 'failed' ? (
            <Image
              ref={imageRef}
              image={image}
              x={cover.x}
              y={cover.y}
              width={cover.width}
              height={cover.height}
              {...cropProps}
            />
          ) : (
            <Rect width={w} height={h} fill="#e2e8f0" />
          )}
        </Group>
      </Group>

      {showFrame && selected && (
        <ShapeOutline
          shape={shape}
          w={w}
          h={h}
          cornerRadius={cornerRadius}
          stroke="#3b82f6"
          strokeWidth={Math.max(1, ppiRatio * 0.75)}
          dash={[4 * ppiRatio, 3 * ppiRatio]}
        />
      )}

      {borderW > 0 && (
        <ShapeOutline
          shape={shape}
          w={w}
          h={h}
          cornerRadius={cornerRadius}
          stroke={el.borderColor || '#000000'}
          strokeWidth={borderW}
          dash={getDashPattern(el.borderStyle, borderW)}
        />
      )}

      {!imageUrl && !selected && isStudentPhoto && borderW === 0 && (
        <ShapeOutline
          shape={shape}
          w={w}
          h={h}
          cornerRadius={cornerRadius}
          stroke="#cbd5e1"
          strokeWidth={Math.max(1, ppiRatio * 0.5)}
          dash={[3 * ppiRatio, 3 * ppiRatio]}
        />
      )}
      {!imageUrl && !isStudentPhoto && (
        <ShapeOutline
          shape={shape}
          w={w}
          h={h}
          cornerRadius={cornerRadius}
          stroke={selected ? '#3b82f6' : '#94a3b8'}
          strokeWidth={Math.max(1, ppiRatio)}
          dash={[4 * ppiRatio, 4 * ppiRatio]}
        />
      )}

      {/* Hit target — clipped children use listening={false} */}
      <Rect width={w} height={h} fill="rgba(0,0,0,0.001)" listening />
    </Group>
  );
}
