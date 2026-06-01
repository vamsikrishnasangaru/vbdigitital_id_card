import type Konva from 'konva';

const EXPORT_PIXEL_RATIO = 4;

export class DesignerExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DesignerExportError';
  }
}

function dataUrlFromStage(stage: Konva.Stage): string {
  try {
    return stage.toDataURL({ pixelRatio: EXPORT_PIXEL_RATIO });
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

export function exportStageToPng(stage: Konva.Stage, filename: string) {
  const uri = dataUrlFromStage(stage);
  const link = document.createElement('a');
  link.download = filename.endsWith('.png') ? filename : `${filename}.png`;
  link.href = uri;
  link.click();
}

/** CR80 card size in inches (ISO/IEC 7810 ID-1). */
export function getCardDimensionsInches(orientation: 'HORIZONTAL' | 'VERTICAL') {
  const w = 3.375;
  const h = 2.125;
  return orientation === 'VERTICAL' ? { widthIn: h, heightIn: w } : { widthIn: w, heightIn: h };
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
