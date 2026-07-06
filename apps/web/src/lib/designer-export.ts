import type Konva from 'konva';
import { exportKonvaStageToPngDataUrl } from '@/lib/konva-export';
import { getCr80Dimensions } from '@/lib/card-sizes';

export class DesignerExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DesignerExportError';
  }
}

async function dataUrlFromStage(stage: Konva.Stage): Promise<string> {
  try {
    return await exportKonvaStageToPngDataUrl(stage);
  } catch (err) {
    const message =
      err instanceof Error && err.message.includes('Tainted')
        ? 'Export blocked by browser security. Reload the designer and ensure photos load from this site (not a blocked cross-origin URL).'
        : err instanceof Error
          ? err.message
          : 'Could not export the card image.';
    throw new DesignerExportError(message);
  }
}

export function exportStageToPng(
  stage: Konva.Stage,
  filename: string,
  _orientation: 'HORIZONTAL' | 'VERTICAL',
) {
  void dataUrlFromStage(stage)
    .then((uri) => {
      const link = document.createElement('a');
      link.download = filename.endsWith('.png') ? filename : `${filename}.png`;
      link.href = uri;
      link.click();
    })
    .catch((err) => {
      throw err instanceof DesignerExportError ? err : new DesignerExportError('Export failed.');
    });
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
  const uri = await dataUrlFromStage(stage);
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
