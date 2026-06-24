import Konva from 'konva';

const MIN_FONT_SIZE = 6;
const LINE_HEIGHT_RATIO = 1.2;

function measureSingleLineWidth(
  text: string,
  fontSize: number,
  fontFamily: string,
  fontStyle: string,
  textDecoration: string,
): number {
  const node = new Konva.Text({
    text,
    fontSize,
    fontFamily,
    fontStyle,
    textDecoration,
  });
  const width = node.getTextWidth();
  node.destroy();
  return width;
}

/** Shrink font size so text fits on one line inside maxWidth (never wraps). */
export function fitSingleLineFontSize(
  text: string,
  maxWidth: number,
  baseFontSize: number,
  fontFamily: string,
  fontStyle: string,
  textDecoration = '',
): number {
  if (!text.trim() || maxWidth <= 0) return baseFontSize;

  const minSize = Math.max(MIN_FONT_SIZE, Math.floor(baseFontSize * 0.35));
  if (measureSingleLineWidth(text, baseFontSize, fontFamily, fontStyle, textDecoration) <= maxWidth) {
    return baseFontSize;
  }

  let lo = minSize;
  let hi = baseFontSize;
  while (hi - lo > 0.25) {
    const mid = (lo + hi) / 2;
    if (measureSingleLineWidth(text, mid, fontFamily, fontStyle, textDecoration) <= maxWidth) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return Math.max(minSize, lo);
}

export function singleLineTextHeight(fontSize: number): number {
  return fontSize * LINE_HEIGHT_RATIO;
}
