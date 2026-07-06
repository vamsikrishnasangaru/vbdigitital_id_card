import type Konva from 'konva';
import { DOWNLOAD_PIXEL_RATIO } from '@/lib/designer-utils';

export const KONVA_EXPORT_MIME = 'image/png' as const;

export type KonvaHighResExportOptions = {
  /** Minimum 4, default 12 — print-quality PVC export. */
  targetPixelRatio?: number;
};

/** Wait for web fonts and Konva image nodes before lossless export. */
export async function waitForKonvaExportReady(stage: Konva.Stage): Promise<void> {
  await document.fonts?.ready;

  const imageNodes = stage.find('Image');
  await Promise.all(
    imageNodes.map(
      (node) =>
        new Promise<void>((resolve) => {
          const img = (node as Konva.Image).image();
          if (!(img instanceof HTMLImageElement) || img.complete) {
            resolve();
            return;
          }
          img.onload = () => resolve();
          img.onerror = () => resolve();
        }),
    ),
  );

  stage.batchDraw();
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

/**
 * Lossless high-DPI Konva export — Konva best practice via stage.toCanvas().
 * Preserves layout; does not resize or compress the output.
 */
export function exportKonvaStageToDataUrl(
  stage: Konva.Stage,
  options: KonvaHighResExportOptions = {},
): string {
  const targetPixelRatio = Math.max(4, options.targetPixelRatio ?? DOWNLOAD_PIXEL_RATIO);

  const scaleX = stage.scaleX() || 1;
  const scaleY = stage.scaleY() || 1;
  const logicalWidth = stage.width() / scaleX;
  const logicalHeight = stage.height() / scaleY;
  const exportPixelRatio = targetPixelRatio;

  const oldSize = { width: stage.width(), height: stage.height() };
  const needReset = scaleX !== 1 || scaleY !== 1;

  if (needReset) {
    stage.width(logicalWidth);
    stage.height(logicalHeight);
    stage.scale({ x: 1, y: 1 });
  }

  stage.batchDraw();

  try {
    const canvas = stage.toCanvas({
      pixelRatio: exportPixelRatio,
      x: 0,
      y: 0,
      width: logicalWidth,
      height: logicalHeight,
    });

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
    }

    const dataUrl = canvas.toDataURL(KONVA_EXPORT_MIME);
    canvas.width = 0;
    canvas.height = 0;
    return dataUrl;
  } finally {
    if (needReset) {
      stage.width(oldSize.width);
      stage.height(oldSize.height);
      stage.scale({ x: scaleX, y: scaleY });
      stage.batchDraw();
    }
  }
}

export async function exportKonvaStageToPngDataUrl(
  stage: Konva.Stage,
  options?: KonvaHighResExportOptions,
): Promise<string> {
  await waitForKonvaExportReady(stage);
  return exportKonvaStageToDataUrl(stage, options);
}
