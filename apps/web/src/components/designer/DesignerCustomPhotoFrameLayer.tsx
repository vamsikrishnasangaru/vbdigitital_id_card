'use client';

import { useEffect, useMemo, useRef } from 'react';
import { Group, Image, Rect, Shape } from 'react-konva';
import Konva from 'konva';
import { useCorsImage } from '@/hooks/useCorsImage';
import { gradientEndPoint } from '@/lib/background-utils';
import type { DesignerElement } from '@/lib/designer-utils';
import {
  drawRoundedRectPath,
  getCustomFrameClipFunc,
  getDashPattern,
  getEffectiveBorderWidth,
  getElementCornerRadii,
  getElementSize,
  getImageFitLayout,
} from '@/lib/designer-utils';
import { useLayerSnapDrag } from './useLayerSnapDrag';

interface DesignerCustomPhotoFrameLayerProps {
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

function CustomFrameOutline({
  w,
  h,
  radii,
  stroke,
  strokeWidth,
  dash,
}: {
  w: number;
  h: number;
  radii: [number, number, number, number];
  stroke: string;
  strokeWidth: number;
  dash?: number[];
}) {
  const [tl, tr, br, bl] = radii;
  return (
    <Shape
      sceneFunc={(ctx, shape) => {
        drawRoundedRectPath(ctx, w, h, tl, tr, br, bl);
        ctx.fillStrokeShape(shape);
      }}
      stroke={stroke}
      strokeWidth={strokeWidth}
      dash={dash}
      fill="transparent"
      listening={false}
    />
  );
}

export function DesignerCustomPhotoFrameLayer({
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
}: DesignerCustomPhotoFrameLayerProps) {
  const { width: w, height: h } = getElementSize(el);
  const radii = getElementCornerRadii(el, 1);
  const borderW = getEffectiveBorderWidth(el) * ppiRatio;
  const shadow = el.frameShadow;
  const fillMode = el.frameFillMode ?? 'solid';

  const { groupRef, dragBoundFunc, onDragStart, onDragEnd: onDragEndKonva } = useLayerSnapDrag(
    el,
    cardWidth,
    cardHeight,
    orientation,
    onDragEnd,
  );

  const [image, status] = useCorsImage(imageUrl || '');
  const imageRef = useRef<Konva.Image>(null);
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
  const layout = useMemo(
    () => getImageFitLayout(srcW, srcH, w, h, el.photoFit, 1),
    [srcW, srcH, w, h, el.photoFit?.zoom, el.photoFit?.offsetX, el.photoFit?.offsetY],
  );

  const clipFunc = useMemo(
    () => getCustomFrameClipFunc(radii[0], radii[1], radii[2], radii[3], w, h),
    [radii, w, h],
  );

  const gradientStops = useMemo(() => {
    if (fillMode !== 'gradient' || !el.frameGradient) return null;
    const { start, end } = gradientEndPoint(el.frameGradient.angle, w, h);
    return { start, end, colorStart: el.frameGradient.colorStart, colorEnd: el.frameGradient.colorEnd };
  }, [fillMode, el.frameGradient, w, h]);

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
  }, [image, adjust.brightness, adjust.contrast, adjust.saturation, layout.x, layout.y, layout.width, layout.height]);

  const clipKey = `clip-${radii.join('-')}-${Math.round(w)}-${Math.round(h)}`;

  return (
    <Group
      ref={groupRef}
      id={el.id}
      opacity={el.opacity ?? 1}
      rotation={el.rotation ?? 0}
      draggable={draggable && !el.locked}
      dragBoundFunc={dragBoundFunc}
      onDragStart={onDragStart}
      onDragEnd={onDragEndKonva}
      onTransformEnd={(e) => onTransformEnd?.(e.target as Konva.Group)}
      onClick={onSelect}
      onTap={onSelect}
      shadowColor={shadow?.color ?? undefined}
      shadowBlur={shadow?.blur != null ? shadow.blur * ppiRatio : undefined}
      shadowOffsetX={shadow?.offsetX != null ? shadow.offsetX * ppiRatio : undefined}
      shadowOffsetY={shadow?.offsetY != null ? shadow.offsetY * ppiRatio : undefined}
      shadowOpacity={shadow?.opacity ?? undefined}
    >
      <Group clipX={0} clipY={0} clipWidth={w} clipHeight={h} listening={false}>
        <Group key={clipKey} clipFunc={clipFunc}>
          {fillMode === 'gradient' && gradientStops ? (
            <Rect
              width={w}
              height={h}
              fillLinearGradientStartPoint={gradientStops.start}
              fillLinearGradientEndPoint={gradientStops.end}
              fillLinearGradientColorStops={[0, gradientStops.colorStart, 1, gradientStops.colorEnd]}
            />
          ) : fillMode === 'solid' ? (
            <Rect width={w} height={h} fill={el.fill ?? '#e2e8f0'} />
          ) : null}

          {image && imageUrl && status !== 'failed' ? (
            <Image
              ref={imageRef}
              image={image}
              x={layout.x}
              y={layout.y}
              width={layout.width}
              height={layout.height}
              {...cropProps}
            />
          ) : fillMode === 'transparent' ? (
            <Rect width={w} height={h} fill="#e2e8f0" />
          ) : null}
        </Group>
      </Group>

      {showFrame && selected && (
        <CustomFrameOutline
          w={w}
          h={h}
          radii={radii}
          stroke="#3b82f6"
          strokeWidth={Math.max(1, ppiRatio * 0.75)}
          dash={[4 * ppiRatio, 3 * ppiRatio]}
        />
      )}

      {borderW > 0 && (
        <CustomFrameOutline
          w={w}
          h={h}
          radii={radii}
          stroke={el.borderColor || '#000000'}
          strokeWidth={borderW}
          dash={getDashPattern(el.borderStyle, borderW)}
        />
      )}

      {!imageUrl && !selected && borderW === 0 && (
        <CustomFrameOutline
          w={w}
          h={h}
          radii={radii}
          stroke="#cbd5e1"
          strokeWidth={Math.max(1, ppiRatio * 0.5)}
          dash={[3 * ppiRatio, 3 * ppiRatio]}
        />
      )}

      <Rect width={w} height={h} fill="rgba(0,0,0,0.001)" listening />
    </Group>
  );
}
