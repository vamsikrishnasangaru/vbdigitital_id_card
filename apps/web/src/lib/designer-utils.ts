import { parseBackground, type GradientBackground } from '@/lib/background-utils';
import {
  formatSectionName,
  formatStudentFullName,
  resolveMediaUrl,
  resolveMediaUrlAbsolute,
} from '@/lib/utils';

export const DESIGN_PPI = 96;

/** Placeholder used in template designer when no student photo is available. */
export const DESIGNER_PHOTO_PLACEHOLDER =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500" viewBox="0 0 400 500">' +
      '<rect fill="#e2e8f0" width="400" height="500"/>' +
      '<circle cx="200" cy="170" r="75" fill="#94a3b8"/>' +
      '<ellipse cx="200" cy="410" rx="120" ry="90" fill="#94a3b8"/>' +
      '</svg>',
  );

export type PhotoShape = 'rectangle' | 'rounded' | 'circle' | 'ellipse' | 'custom';
export type BorderStyle = 'solid' | 'dashed' | 'dotted';

export interface ImageCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ColorAdjust {
  brightness?: number;
  contrast?: number;
  saturation?: number;
}

export interface PhotoFit {
  zoom?: number;
  offsetX?: number;
  offsetY?: number;
}

export type FrameFillMode = 'transparent' | 'solid' | 'gradient';

export interface FrameShadow {
  color?: string;
  blur?: number;
  offsetX?: number;
  offsetY?: number;
  opacity?: number;
}

export interface DesignerElement {
  id: string;
  type: 'text' | 'photo' | 'image' | 'qr' | 'barcode' | 'shape' | 'customPhotoFrame';
  x: number;
  y: number;
  width?: number;
  height?: number;
  rotation?: number;
  opacity?: number;
  locked?: boolean;
  visible?: boolean;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fontStyle?: 'normal' | 'italic' | 'bold' | 'bold italic';
  textDecoration?: '' | 'underline' | 'line-through';
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  fieldType?: string;
  imageUrl?: string;
  photoShape?: PhotoShape;
  cornerRadius?: number;
  borderColor?: string;
  borderWidth?: number;
  borderStyle?: BorderStyle;
  crop?: ImageCrop;
  colorAdjust?: ColorAdjust;
  topLeftRadius?: number;
  topRightRadius?: number;
  bottomLeftRadius?: number;
  bottomRightRadius?: number;
  frameFillMode?: FrameFillMode;
  frameGradient?: GradientBackground;
  frameShadow?: FrameShadow;
  photoFit?: PhotoFit;
}

export function scaleElementsForPpi(
  elements: DesignerElement[],
  targetPpi: number,
  designPpi: number = DESIGN_PPI,
): DesignerElement[] {
  if (targetPpi === designPpi) return elements;
  const factor = targetPpi / designPpi;
  return elements.map((el) => ({
    ...el,
    x: el.x * factor,
    y: el.y * factor,
    fontSize: el.fontSize ? el.fontSize * factor : el.fontSize,
    width: el.width ? el.width * factor : el.width,
    height: el.height ? el.height * factor : el.height,
    strokeWidth: el.strokeWidth ? el.strokeWidth * factor : el.strokeWidth,
    borderWidth: el.borderWidth ? el.borderWidth * factor : el.borderWidth,
    cornerRadius: el.cornerRadius ? el.cornerRadius * factor : el.cornerRadius,
    topLeftRadius: el.topLeftRadius ? el.topLeftRadius * factor : el.topLeftRadius,
    topRightRadius: el.topRightRadius ? el.topRightRadius * factor : el.topRightRadius,
    bottomLeftRadius: el.bottomLeftRadius ? el.bottomLeftRadius * factor : el.bottomLeftRadius,
    bottomRightRadius: el.bottomRightRadius ? el.bottomRightRadius * factor : el.bottomRightRadius,
    photoFit: el.photoFit
      ? {
          zoom: el.photoFit.zoom,
          offsetX: el.photoFit.offsetX != null ? el.photoFit.offsetX * factor : el.photoFit.offsetX,
          offsetY: el.photoFit.offsetY != null ? el.photoFit.offsetY * factor : el.photoFit.offsetY,
        }
      : el.photoFit,
    frameShadow: el.frameShadow
      ? {
          ...el.frameShadow,
          blur: el.frameShadow.blur != null ? el.frameShadow.blur * factor : el.frameShadow.blur,
          offsetX: el.frameShadow.offsetX != null ? el.frameShadow.offsetX * factor : el.frameShadow.offsetX,
          offsetY: el.frameShadow.offsetY != null ? el.frameShadow.offsetY * factor : el.frameShadow.offsetY,
        }
      : el.frameShadow,
  }));
}

export function getKonvaFontStyle(el: DesignerElement): string {
  if (el.fontStyle) return el.fontStyle;
  return 'normal';
}

type ClipContext = {
  beginPath(): void;
  closePath(): void;
  arc(x: number, y: number, r: number, start: number, end: number, ccw?: boolean): void;
  ellipse(x: number, y: number, rx: number, ry: number, rot: number, start: number, end: number): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void;
  rect(x: number, y: number, w: number, h: number): void;
};

export function clampCornerRadii(
  tl: number,
  tr: number,
  br: number,
  bl: number,
  w: number,
  h: number,
): [number, number, number, number] {
  const maxR = Math.max(0, Math.min(w, h) / 2);
  return [
    Math.min(Math.max(0, tl), maxR),
    Math.min(Math.max(0, tr), maxR),
    Math.min(Math.max(0, br), maxR),
    Math.min(Math.max(0, bl), maxR),
  ];
}

export function getElementCornerRadii(
  el: DesignerElement,
  ppiScale = 1,
): [number, number, number, number] {
  const boxW = (el.width ?? 72) * ppiScale;
  const boxH = (el.height ?? 96) * ppiScale;
  if (el.type === 'customPhotoFrame' || el.photoShape === 'custom') {
    return clampCornerRadii(
      (el.topLeftRadius ?? 0) * ppiScale,
      (el.topRightRadius ?? 0) * ppiScale,
      (el.bottomRightRadius ?? 0) * ppiScale,
      (el.bottomLeftRadius ?? 0) * ppiScale,
      boxW,
      boxH,
    );
  }
  const r = (el.cornerRadius ?? 0) * ppiScale;
  return [r, r, r, r];
}

export function getPhotoClipFunc(el: DesignerElement, w: number, h: number, ppiScale = 1) {
  const shape = el.photoShape || 'rectangle';
  if (shape === 'custom') {
    const [tl, tr, br, bl] = getElementCornerRadii(el, ppiScale);
    return getCustomFrameClipFunc(tl, tr, br, bl, w, h);
  }
  return getClipFunc(shape, w, h, (el.cornerRadius ?? 8) * ppiScale);
}

export function drawRoundedRectPath(
  ctx: ClipContext,
  w: number,
  h: number,
  tl: number,
  tr: number,
  br: number,
  bl: number,
) {
  const [a, b, c, d] = clampCornerRadii(tl, tr, br, bl, w, h);
  ctx.beginPath();
  ctx.moveTo(a, 0);
  ctx.lineTo(w - b, 0);
  ctx.quadraticCurveTo(w, 0, w, b);
  ctx.lineTo(w, h - c);
  ctx.quadraticCurveTo(w, h, w - c, h);
  ctx.lineTo(d, h);
  ctx.quadraticCurveTo(0, h, 0, h - d);
  ctx.lineTo(0, a);
  ctx.quadraticCurveTo(0, 0, a, 0);
  ctx.closePath();
}

export function getCustomFrameClipFunc(
  tl: number,
  tr: number,
  br: number,
  bl: number,
  w: number,
  h: number,
) {
  return (ctx: ClipContext) => drawRoundedRectPath(ctx, w, h, tl, tr, br, bl);
}

export function getClipFunc(shape: PhotoShape | undefined, w: number, h: number, radius?: number) {
  const r = radius ?? 8;
  return (ctx: ClipContext) => {
    ctx.beginPath();
    const shapeType = shape || 'rectangle';
    if (shapeType === 'circle') {
      const diameter = Math.min(w, h);
      ctx.arc(w / 2, h / 2, diameter / 2, 0, Math.PI * 2, false);
    } else if (shapeType === 'ellipse') {
      ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    } else if (shapeType === 'rounded') {
      const rad = Math.min(r, w / 2, h / 2);
      ctx.moveTo(rad, 0);
      ctx.lineTo(w - rad, 0);
      ctx.quadraticCurveTo(w, 0, w, rad);
      ctx.lineTo(w, h - rad);
      ctx.quadraticCurveTo(w, h, w - rad, h);
      ctx.lineTo(rad, h);
      ctx.quadraticCurveTo(0, h, 0, h - rad);
      ctx.lineTo(0, rad);
      ctx.quadraticCurveTo(0, 0, rad, 0);
      ctx.closePath();
    } else {
      ctx.rect(0, 0, w, h);
    }
  };
}

/** Cover layout with optional zoom and pan inside a photo frame. */
export function getImageFitLayout(
  srcWidth: number,
  srcHeight: number,
  boxW: number,
  boxH: number,
  fit?: PhotoFit,
  ppiScale = 1,
): { x: number; y: number; width: number; height: number } {
  const cover = getImageCoverLayout(srcWidth, srcHeight, boxW, boxH);
  const zoom = Math.max(0.25, Math.min(4, fit?.zoom ?? 1));
  const width = cover.width * zoom;
  const height = cover.height * zoom;
  const cx = cover.x + cover.width / 2;
  const cy = cover.y + cover.height / 2;
  const offsetX = (fit?.offsetX ?? 0) * ppiScale;
  const offsetY = (fit?.offsetY ?? 0) * ppiScale;
  return {
    x: cx - width / 2 + offsetX,
    y: cy - height / 2 + offsetY,
    width,
    height,
  };
}

/** Scale image to cover a box (center crop) while preserving aspect ratio. */
export function getImageCoverLayout(
  srcWidth: number,
  srcHeight: number,
  boxW: number,
  boxH: number,
): { x: number; y: number; width: number; height: number } {
  if (srcWidth <= 0 || srcHeight <= 0) {
    return { x: 0, y: 0, width: boxW, height: boxH };
  }
  const scale = Math.max(boxW / srcWidth, boxH / srcHeight);
  const width = srcWidth * scale;
  const height = srcHeight * scale;
  return {
    x: (boxW - width) / 2,
    y: (boxH - height) / 2,
    width,
    height,
  };
}

export function getSquarePhotoSize(width?: number, height?: number): number | undefined {
  if (width == null && height == null) return undefined;
  return Math.max(width ?? 0, height ?? 0, 20);
}

export function getDashPattern(style: BorderStyle | undefined, width: number): number[] | undefined {
  if (style === 'dashed') return [width * 3, width * 2];
  if (style === 'dotted') return [width, width * 1.5];
  return undefined;
}

/** Default stroke width when a border color is set without an explicit width. */
export const DEFAULT_PHOTO_BORDER_WIDTH = 2;

/** Border draws when color is set; width defaults to {@link DEFAULT_PHOTO_BORDER_WIDTH}. */
export function getEffectiveBorderWidth(el: Pick<DesignerElement, 'borderColor' | 'borderWidth'>): number {
  if (!el.borderColor?.trim()) return 0;
  const w = el.borderWidth;
  if (w == null || w <= 0) return DEFAULT_PHOTO_BORDER_WIDTH;
  return w;
}

/** Ensure media borders persist when only color is provided in template JSON. */
export function normalizeMediaBorder(el: DesignerElement): DesignerElement {
  if (!el.borderColor?.trim()) return el;
  if (el.borderWidth != null && el.borderWidth > 0) return el;
  return {
    ...el,
    borderWidth: DEFAULT_PHOTO_BORDER_WIDTH,
    borderStyle: el.borderStyle ?? 'solid',
  };
}

export function resolveStudentField(
  student: Record<string, unknown> | null | undefined,
  fieldType?: string,
  fallbackText?: string,
): string {
  if (!student || !fieldType || fieldType === 'custom') {
    return fallbackText || '';
  }

  const s = student as {
    firstName?: string;
    lastName?: string;
    admissionNumber?: string;
    rollNumber?: string;
    dateOfBirth?: string;
    bloodGroup?: string;
    aadharCard?: string;
    penId?: string;
    apaarId?: string;
    childId?: string;
    fatherName?: string;
    motherName?: string;
    parentName?: string;
    parentPhone?: string;
    address?: string;
    class?: { name?: string };
    section?: { name?: string };
    school?: { name?: string };
  };

  switch (fieldType) {
    case 'fullName':
    case 'studentName':
      return formatStudentFullName(s.firstName, s.lastName) || 'N/A';
    case 'admissionNo':
    case 'admissionNumber':
      return s.admissionNumber || 'N/A';
    case 'rollNo':
    case 'rollNumber':
      return s.rollNumber || 'N/A';
    case 'classSection': {
      const cls = s.class?.name?.trim();
      const clsDisplay = cls && cls.toLowerCase() !== 'unassigned' ? cls : '';
      const sec = formatSectionName(s.section?.name);
      return [clsDisplay, sec].filter(Boolean).join(' ') || 'N/A';
    }
    case 'className':
      return s.class?.name || 'N/A';
    case 'sectionName':
      return formatSectionName(s.section?.name);
    case 'schoolName':
      return s.school?.name || 'N/A';
    case 'dob':
      return s.dateOfBirth ? new Date(s.dateOfBirth).toLocaleDateString('en-IN') : 'N/A';
    case 'bloodGroup':
      return s.bloodGroup || 'N/A';
    case 'aadharCard':
      return s.aadharCard || 'N/A';
    case 'penId':
      return s.penId || 'N/A';
    case 'apaarId':
      return s.apaarId || 'N/A';
    case 'childId':
      return s.childId || 'N/A';
    case 'fatherName':
      return s.fatherName || 'N/A';
    case 'motherName':
      return s.motherName || 'N/A';
    case 'parentName':
      return s.parentName || 'N/A';
    case 'parentPhone':
    case 'cell':
    case 'phone':
      return s.parentPhone || 'N/A';
    case 'address':
      return s.address || 'N/A';
    case 'rfid':
      return String((student as { rfid?: string }).rfid ?? s.admissionNumber ?? 'N/A');
    default:
      return fallbackText || '';
  }
}

export function getCardSize(orientation: 'HORIZONTAL' | 'VERTICAL', ppi: number = DESIGN_PPI) {
  const isVertical = orientation === 'VERTICAL';
  return {
    width: isVertical ? 2.125 * ppi : 3.375 * ppi,
    height: isVertical ? 3.375 * ppi : 2.125 * ppi,
  };
}

export function estimateTextBounds(el: DesignerElement): { width: number; height: number } {
  const fs = el.fontSize ?? 12;
  if (el.width != null && el.width > 0) {
    return { width: el.width, height: el.height ?? fs * 1.35 };
  }
  // Auto-width text: use a small anchor width so X/Y clamping does not lock horizontal drag.
  return { width: 8, height: el.height ?? fs * 1.35 };
}

export function clampTextDragPosition(
  pos: { x: number; y: number },
  frameW: number,
  frameH: number,
  cardW: number,
  cardH: number,
  hasBoxWidth: boolean,
) {
  if (!hasBoxWidth) {
    // Auto-width text: clamp anchor point only so vertical drag stays smooth.
    return {
      x: Math.max(0, Math.min(cardW, pos.x)),
      y: Math.max(0, Math.min(cardH, pos.y)),
    };
  }
  return clampDragPosition(pos, frameW, frameH, cardW, cardH);
}

export function getElementBounds(
  el: DesignerElement,
  orientation: 'HORIZONTAL' | 'VERTICAL',
): { width: number; height: number } {
  const { width: cardW, height: cardH } = getCardSize(orientation);
  if (el.type === 'text') {
    const { width: w, height: h } = estimateTextBounds(el);
    return { width: Math.min(w, cardW), height: Math.min(h, cardH) };
  }
  return getElementSize(el);
}

export function clampElementToCard(
  el: DesignerElement,
  orientation: 'HORIZONTAL' | 'VERTICAL',
): DesignerElement {
  const { width: cardW, height: cardH } = getCardSize(orientation);

  if (el.type === 'text' && (el.width == null || el.width <= 0)) {
    return {
      ...el,
      x: Math.max(0, Math.min(cardW, el.x)),
      y: Math.max(0, Math.min(cardH, el.y)),
    };
  }

  if (el.type === 'text' && el.width != null && el.width > 0) {
    const fs = el.fontSize ?? 12;
    const textH = el.height ?? fs * 1.35;
    return {
      ...el,
      x: Math.max(0, Math.min(Math.max(0, cardW - el.width), el.x)),
      y: Math.max(0, Math.min(Math.max(0, cardH - textH), el.y)),
    };
  }

  const { width: elW, height: elH } = getElementBounds(el, orientation);
  const maxX = Math.max(0, cardW - elW);
  const maxY = Math.max(0, cardH - elH);
  return {
    ...el,
    x: Math.max(0, Math.min(maxX, el.x)),
    y: Math.max(0, Math.min(maxY, el.y)),
  };
}

export function clampDragPosition(
  pos: { x: number; y: number },
  elW: number,
  elH: number,
  cardW: number,
  cardH: number,
) {
  return {
    x: Math.max(0, Math.min(Math.max(0, cardW - elW), pos.x)),
    y: Math.max(0, Math.min(Math.max(0, cardH - elH), pos.y)),
  };
}

/** Sizes used for mouse-drag clamping — matches properties panel / keyboard nudge, not stale Konva refs. */
export function getDragClampSize(
  el: DesignerElement,
  orientation: 'HORIZONTAL' | 'VERTICAL',
): { width: number; height: number; anchorOnly: boolean } {
  const { width: cardW, height: cardH } = getCardSize(orientation);

  if (el.type === 'text' && (el.width == null || el.width <= 0)) {
    return { width: 0, height: 0, anchorOnly: true };
  }

  if (el.type === 'text' && el.width != null && el.width > 0) {
    const fs = el.fontSize ?? 12;
    const textH = el.height ?? fs * 1.35;
    return {
      width: Math.min(el.width, cardW),
      height: Math.min(textH, cardH),
      anchorOnly: false,
    };
  }

  const normalized = isSchoolAssetSlot(el) ? normalizeSchoolAssetSizes(el, orientation) : el;
  let { width, height } = getElementBounds(normalized, orientation);

  if (isStudentPhotoSlot(normalized) || isCustomPhotoFrameElement(normalized)) {
    const maxW = cardW * 0.52;
    const maxH = cardH * 0.58;
    width = Math.min(width, maxW);
    height = Math.min(height, maxH);
  }

  return {
    width: Math.min(width, cardW),
    height: Math.min(height, cardH),
    anchorOnly: false,
  };
}

export function clampDragPositionForElement(
  pos: { x: number; y: number },
  el: DesignerElement,
  orientation: 'HORIZONTAL' | 'VERTICAL',
  cardW: number,
  cardH: number,
): { x: number; y: number } {
  const size = getDragClampSize(el, orientation);
  if (size.anchorOnly) {
    return {
      x: Math.max(0, Math.min(cardW, pos.x)),
      y: Math.max(0, Math.min(cardH, pos.y)),
    };
  }
  return clampDragPosition(pos, size.width, size.height, cardW, cardH);
}
export function getCenteredPlacement(
  orientation: 'HORIZONTAL' | 'VERTICAL',
  width: number,
  height: number,
): { x: number; y: number } {
  const { width: cardW, height: cardH } = getCardSize(orientation);
  return {
    x: Math.round((cardW - width) / 2),
    y: Math.round((cardH - height) / 2),
  };
}

export function getSignatureDefaults(orientation: 'HORIZONTAL' | 'VERTICAL'): Partial<DesignerElement> {
  const width = orientation === 'VERTICAL' ? 120 : 128;
  const height = orientation === 'VERTICAL' ? 36 : 40;
  return {
    ...getCenteredPlacement(orientation, width, height),
    width,
    height,
    photoShape: 'rectangle',
  };
}

export function getLogoDefaults(orientation: 'HORIZONTAL' | 'VERTICAL'): Partial<DesignerElement> {
  const width = 56;
  const height = 56;
  const { width: cardW } = getCardSize(orientation);
  return {
    x: Math.round((cardW - width) / 2),
    y: orientation === 'VERTICAL' ? 12 : 10,
    width,
    height,
    photoShape: 'circle',
  };
}
export function getDefaultPlacement(
  fieldType: string | undefined,
  type: DesignerElement['type'],
  orientation: 'HORIZONTAL' | 'VERTICAL',
  index: number,
): Partial<DesignerElement> {
  const vertical: Record<string, Partial<DesignerElement>> = {
    studentPhoto: { x: 52, y: 70, width: 100, height: 115 },
    schoolLogo: getLogoDefaults('VERTICAL') as Partial<DesignerElement>,
    schoolSignature: getSignatureDefaults('VERTICAL'),
    fullName: { x: 14, y: 192 },
    classSection: { x: 14, y: 210 },
    admissionNo: { x: 14, y: 224 },
    parentName: { x: 14, y: 238 },
    parentPhone: { x: 14, y: 252 },
    dob: { x: 14, y: 266 },
    address: { x: 14, y: 280 },
  };

  const horizontal: Record<string, Partial<DesignerElement>> = {
    studentPhoto: { x: 24, y: 48, width: 72, height: 96 },
    schoolLogo: getLogoDefaults('HORIZONTAL') as Partial<DesignerElement>,
    schoolSignature: getSignatureDefaults('HORIZONTAL'),
    fullName: { x: 108, y: 48 },
    classSection: { x: 108, y: 68 },
    admissionNo: { x: 108, y: 84 },
    parentName: { x: 108, y: 100 },
    parentPhone: { x: 108, y: 116 },
    dob: { x: 108, y: 132 },
    address: { x: 108, y: 148 },
  };

  const slots = orientation === 'VERTICAL' ? vertical : horizontal;
  const key = fieldType || type;
  const slot = slots[key];
  if (slot) return slot;

  return { x: 28, y: 48 + index * 28 };
}

export function getElementSize(el: DesignerElement): { width: number; height: number } {
  if (el.type === 'text') return estimateTextBounds(el);
  if (el.fieldType === 'schoolSignature') {
    return { width: el.width ?? 128, height: el.height ?? 40 };
  }
  if (el.fieldType === 'schoolLogo') {
    return { width: el.width ?? 56, height: el.height ?? 56 };
  }
  if (el.type === 'qr') return { width: el.width ?? 56, height: el.height ?? 56 };
  if (el.type === 'barcode') return { width: el.width ?? 120, height: el.height ?? 32 };
  if (el.type === 'shape') {
    return { width: el.width ?? 80, height: el.height ?? (el.fieldType === 'divider' ? 2 : 40) };
  }
  if (el.type === 'customPhotoFrame') {
    return { width: el.width ?? 140, height: el.height ?? 180 };
  }
  if (el.type === 'photo' || el.type === 'image' || el.fieldType === 'studentPhoto') {
    return { width: el.width ?? 72, height: el.height ?? 96 };
  }
  return { width: el.width ?? 72, height: el.height ?? 96 };
}

export function clampCrop(crop: ImageCrop): ImageCrop {
  const width = Math.max(0.05, Math.min(1, crop.width));
  const height = Math.max(0.05, Math.min(1, crop.height));
  const x = Math.max(0, Math.min(1 - width, crop.x));
  const y = Math.max(0, Math.min(1 - height, crop.y));
  return { x, y, width, height };
}

function isStudentPhotoSlot(el: DesignerElement): boolean {
  if (el.type === 'customPhotoFrame') return false;
  return el.type === 'photo' || el.fieldType === 'studentPhoto';
}

function isSchoolAssetSlot(el: DesignerElement): boolean {
  return el.fieldType === 'schoolLogo' || el.fieldType === 'schoolSignature';
}

/** Oversized logo/signature boxes break Y clamping (e.g. max Y ≈ 192 on a vertical card). */
function normalizeSchoolAssetSizes(
  el: DesignerElement,
  orientation: 'HORIZONTAL' | 'VERTICAL',
): DesignerElement {
  if (!isSchoolAssetSlot(el)) return el;
  const defaults =
    el.fieldType === 'schoolSignature'
      ? getSignatureDefaults(orientation)
      : getLogoDefaults(orientation);
  const { width: cardW, height: cardH } = getCardSize(orientation);
  const { width, height } = getElementSize(el);
  const maxW = cardW * 0.65;
  const maxH = cardH * 0.28;
  const minW = 20;
  const minH = el.fieldType === 'schoolSignature' ? 12 : 20;
  if (width < minW || height < minH || width > maxW || height > maxH) {
    return {
      ...el,
      width: defaults.width,
      height: defaults.height,
    };
  }
  return el;
}

/** Old templates sometimes stored a red frame on the photo slot (looked like a stuck selection). */
function stripLegacyStudentPhotoBorder(el: DesignerElement): DesignerElement {
  if (!isStudentPhotoSlot(el)) return el;
  if (!el.borderWidth || el.borderWidth <= 0) return el;
  const c = (el.borderColor || '').toLowerCase().trim();
  // Stuck transformer: width with no color
  if (!c) {
    const { borderWidth: _bw, borderColor: _bc, borderStyle: _bs, ...rest } = el;
    return rest as DesignerElement;
  }
  // Legacy exact red selection frame only — do not strip user-chosen reds like #ef4444
  const isLegacyRed = c === 'red' || c === '#f00' || c === '#ff0000';
  if (!isLegacyRed) return el;
  const { borderWidth: _bw, borderColor: _bc, borderStyle: _bs, ...rest } = el;
  return rest as DesignerElement;
}

export function sanitizeElement(el: DesignerElement, orientation: 'HORIZONTAL' | 'VERTICAL'): DesignerElement {
  let next = el;
  if (isSchoolAssetSlot(el)) {
    next = normalizeSchoolAssetSizes(el, orientation);
  } else if (isCustomPhotoFrameElement(el)) {
    const { width, height } = getElementSize(el);
    if (width < 20 || height < 20) {
      next = {
        ...el,
        width: 140,
        height: 180,
      };
    }
  } else if (isMediaElement(el)) {
    const { width, height } = getElementSize(el);
    if (width < 20 || height < 20) {
      const defaults = getDefaultPlacement(el.fieldType, el.type, orientation, 0);
      next = {
        ...el,
        width: defaults.width ?? (orientation === 'VERTICAL' ? 100 : 72),
        height: defaults.height ?? (orientation === 'VERTICAL' ? 115 : 96),
      };
    }
  }

  if (isStudentPhotoSlot(next)) {
    next = stripLegacyStudentPhotoBorder(next);
    if (next.fieldType === 'studentPhoto' && next.type !== 'photo') {
      next = { ...next, type: 'photo' };
    }
    const { width: cardW, height: cardH } = getCardSize(orientation);
    const { width, height } = getElementSize(next);
    if (width > cardW * 0.52 || height > cardH * 0.58) {
      const defaults = getDefaultPlacement('studentPhoto', 'photo', orientation, 0);
      next = {
        ...next,
        width: defaults.width ?? (orientation === 'VERTICAL' ? 100 : 72),
        height: defaults.height ?? (orientation === 'VERTICAL' ? 115 : 96),
      };
    }
  }

  if (next.type === 'text' && next.borderColor?.trim() && (next.borderWidth == null || next.borderWidth <= 0)) {
    next = { ...next, borderColor: undefined, borderStyle: undefined };
  }

  if (
    (isMediaElement(next) || isCustomPhotoFrameElement(next)) &&
    next.borderColor?.trim()
  ) {
    next = normalizeMediaBorder(next);
  }

  return clampElementToCard(next, orientation);
}

export function isCustomPhotoFrameElement(el: DesignerElement): boolean {
  return el.type === 'customPhotoFrame';
}

export function isCroppableMediaElement(el: DesignerElement): boolean {
  return isMediaElement(el) || isCustomPhotoFrameElement(el);
}

/** Use dashed frame selection instead of Konva Transformer (avoids stuck handles on photo slots). */
export function usesFrameOnlySelection(el: DesignerElement): boolean {
  return el.type === 'text' || isStudentPhotoSlot(el) || isSchoolAssetSlot(el);
}
export function getStudentPhotoUrl(student: Record<string, unknown> | null | undefined): string {
  if (!student?.photoUrl) return '';
  return resolveMediaUrl(String(student.photoUrl));
}

export function getElementImageUrl(
  el: DesignerElement,
  student: Record<string, unknown> | null | undefined,
  options?: { usePlaceholder?: boolean },
): string {
  if (el.type === 'image' && el.imageUrl) return resolveMediaUrl(el.imageUrl);
  if (el.fieldType === 'schoolLogo' || el.fieldType === 'schoolSignature') {
    if (el.imageUrl) return resolveMediaUrl(el.imageUrl);
    return '';
  }
  if (el.type === 'customPhotoFrame') {
    if (el.imageUrl) return resolveMediaUrl(el.imageUrl);
    const url = getStudentPhotoUrl(student);
    if (url) return url;
    if (options?.usePlaceholder) return DESIGNER_PHOTO_PLACEHOLDER;
    return '';
  }
  if (el.type === 'photo' || el.fieldType === 'studentPhoto') {
    const url = getStudentPhotoUrl(student);
    if (url) return url;
    if (options?.usePlaceholder) return DESIGNER_PHOTO_PLACEHOLDER;
  }
  return '';
}

/** All image URLs needed for a headless card render (background + media slots). */
export function collectRenderImageUrls(
  bgUrl: string,
  elements: DesignerElement[],
  student: Record<string, unknown> | null | undefined,
  options?: { usePlaceholder?: boolean; absolute?: boolean },
): string[] {
  const resolve = options?.absolute ? resolveMediaUrlAbsolute : resolveMediaUrl;
  const parsedBg = parseBackground(bgUrl);
  const urls: string[] = [];

  if (parsedBg.mode === 'image' && parsedBg.imageUrl) {
    urls.push(resolve(parsedBg.imageUrl));
  }

  for (const el of elements) {
    if (!isMediaElement(el) && !isCustomPhotoFrameElement(el)) continue;
    const url = getElementImageUrl(el, student, options);
    if (url && !url.startsWith('data:')) urls.push(resolve(url));
  }

  return [...new Set(urls.filter(Boolean))];
}

export function isMediaElement(el: DesignerElement): boolean {
  return (
    el.type === 'photo' ||
    el.type === 'image' ||
    el.fieldType === 'studentPhoto' ||
    el.fieldType === 'schoolLogo' ||
    el.fieldType === 'schoolSignature'
  );
}

export function isShapeElement(el: DesignerElement): boolean {
  return el.type === 'shape';
}
