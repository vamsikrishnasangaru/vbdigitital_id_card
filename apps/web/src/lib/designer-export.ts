import type Konva from 'konva';
import { EXPORT_PIXEL_RATIO, resolveExportPixelRatio } from '@/lib/designer-utils';
import { getCr80Dimensions } from '@/lib/card-sizes';

export class DesignerExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DesignerExportError';
  }
}

function exportPixelRatioForStage(stage: Konva.Stage): number {
  return resolveExportPixelRatio(Number(stage.getAttr('pixelRatio')) || 1);
}

function dataUrlFromStage(stage: Konva.Stage): string {
  const scaleX = stage.scaleX() || 1;
  const scaleY = stage.scaleY() || 1;
  const logicalWidth = stage.width() / scaleX;
  const logicalHeight = stage.height() / scaleY;
  const oldSize = { width: stage.width(), height: stage.height() };
  const needReset = scaleX !== 1 || scaleY !== 1;

  if (needReset) {
    stage.width(logicalWidth);
    stage.height(logicalHeight);
    stage.scale({ x: 1, y: 1 });
  }
  stage.batchDraw();
  try {
    return stage.toDataURL({
      pixelRatio: exportPixelRatioForStage(stage),
      mimeType: 'image/png',
      x: 0,
      y: 0,
      width: logicalWidth,
      height: logicalHeight,
    });
  } catch (err) {
    const message =
      err instanceof Error && err.message.includes('Tainted')
        ? 'Export blocked by browser security. Reload the designer and ensure photos load from this site (not a blocked cross-origin URL).'
        : err instanceof Error
          ? err.message
          : 'Could not export the card image.';
    throw new DesignerExportError(message);
  } finally {
    if (needReset) {
      stage.width(oldSize.width);
      stage.height(oldSize.height);
      stage.scale({ x: scaleX, y: scaleY });
    }
    stage.batchDraw();
  }
}

export function exportStageToPng(stage: Konva.Stage, filename: string) {
  const uri = dataUrlFromStage(stage);
  const link = document.createElement('a');
  link.download = filename.endsWith('.png') ? filename : `${filename}.png`;
  link.href = uri;
  link.click();
}

/** CR80 card size in inches (ISO/IEC 7810 ID-1). */
export function getCardDimensionsInches(orientation: 'HORIZONTAL' | 'VERTICAL') {
  const { widthIn, heightIn } = getCr80Dimensions(orientation);
  return { widthIn, heightIn };
}

export async function exportStageToPdf(
  stage: Konva.Stage,
  filename: string,
  orientation: 'HORIZONTAL' | 'VERTICAL',
) {
  const { jsPDF } = await import('jspdf');
  const { widthIn, heightIn } = getCardDimensionsInches(orientation);
  const uri = dataUrlFromStage(stage);
  const pdf = new jsPDF({
    orientation: widthIn > heightIn ? 'landscape' : 'portrait',
    unit: 'in',
    format: [widthIn, heightIn],
  });
  pdf.addImage(uri, 'PNG', 0, 0, widthIn, heightIn);
  pdf.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
}

export async function captureStageThumbnail(
  stage: Konva.Stage,
  maxWidth = 320,
): Promise<string> {
  const scale = maxWidth / stage.width();
  try {
    return stage.toDataURL({ pixelRatio: Math.max(1, scale) });
  } catch {
    return '';
  }
}
