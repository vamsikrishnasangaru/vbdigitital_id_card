export type PhotoAdjustments = {
  brightness: number;
  contrast: number;
  red: number;
  green: number;
  blue: number;
};

export type PhotoCropState = {
  panX: number;
  panY: number;
  zoom: number;
};

export const DEFAULT_PHOTO_ADJUSTMENTS: PhotoAdjustments = {
  brightness: 0,
  contrast: 0,
  red: 0,
  green: 0,
  blue: 0,
};

export const DEFAULT_PHOTO_CROP: PhotoCropState = {
  panX: 0,
  panY: 0,
  zoom: 1,
};

const VIEWPORT_SIZE = 320;
const CROP_INSET = 20;

export function getCropDisplaySize(viewportSize = VIEWPORT_SIZE, cropInset = CROP_INSET): number {
  return viewportSize - cropInset * 2;
}

export async function loadImageFromSource(src: string | File): Promise<HTMLImageElement> {
  if (src instanceof File) {
    const url = URL.createObjectURL(src);
    try {
      return await loadImageElement(url);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  if (src.startsWith('data:') || src.startsWith('blob:')) {
    return loadImageElement(src);
  }

  try {
    const response = await fetch(src, { credentials: 'include' });
    if (!response.ok) throw new Error('fetch failed');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    try {
      return await loadImageElement(url);
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return loadImageElement(src, true);
  }
}

function loadImageElement(src: string, crossOrigin = false): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image'));
    img.src = src;
  });
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function clamp255(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

/** sRGB (0–255) → linear light (0–1). */
function srgbToLinear(channel: number): number {
  const x = channel / 255;
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}

/** Linear light (0–1) → sRGB (0–255). */
function linearToSrgb(channel: number): number {
  const x = clamp01(channel);
  return x <= 0.0031308 ? x * 12.92 * 255 : (1.055 * Math.pow(x, 1 / 2.4) - 0.055) * 255;
}

function luminanceLinear(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Photoshop-style exposure (brightness) in linear space. */
function applyExposureLinear(r: number, g: number, b: number, brightness: number) {
  const ev = (brightness / 100) * 0.85;
  const mul = Math.pow(2, ev);
  return [r * mul, g * mul, b * mul] as const;
}

/** Contrast pivoting around ~18% gray (photographic mid-point). */
function applyContrastLinear(r: number, g: number, b: number, contrast: number) {
  const pivot = 0.18;
  const t = contrast / 100;
  const factor = (1 + t) / Math.max(0.05, 1 - t * 0.92);
  return [
    (r - pivot) * factor + pivot,
    (g - pivot) * factor + pivot,
    (b - pivot) * factor + pivot,
  ] as const;
}

/** Tonal weights similar to Photoshop Color Balance (shadow / midtone / highlight). */
function colorBalanceTonalWeights(luminance: number) {
  const l = clamp01(luminance);
  const shadow = Math.pow(1 - l, 1.8);
  const highlight = Math.pow(l, 1.8);
  const midtone = Math.exp(-Math.pow((l - 0.45) / 0.28, 2));
  const sum = shadow + midtone + highlight || 1;
  return {
    shadow: shadow / sum,
    midtone: midtone / sum,
    highlight: highlight / sum,
  };
}

/** Per-channel color balance with partial luminance preservation. */
function applyColorBalanceLinear(
  r: number,
  g: number,
  b: number,
  red: number,
  green: number,
  blue: number,
) {
  const lum = luminanceLinear(r, g, b);
  const w = colorBalanceTonalWeights(lum * 1.15);
  const mix = w.shadow * 0.85 + w.midtone * 1.15 + w.highlight * 0.85;
  const strength = 0.42 * mix;

  const dr = (red / 100) * strength;
  const dg = (green / 100) * strength;
  const db = (blue / 100) * strength;

  let nr = r + dr;
  let ng = g + dg;
  let nb = b + db;

  const oldL = lum;
  const newL = luminanceLinear(nr, ng, nb);
  if (newL > 1e-6 && oldL > 1e-6) {
    const preserve = 0.72;
    const scale = oldL / newL;
    nr = nr * (1 - preserve) + nr * scale * preserve;
    ng = ng * (1 - preserve) + ng * scale * preserve;
    nb = nb * (1 - preserve) + nb * scale * preserve;
  }

  return [nr, ng, nb] as const;
}

export function hasPhotoAdjustments(adjustments: PhotoAdjustments): boolean {
  return (
    adjustments.brightness !== 0 ||
    adjustments.contrast !== 0 ||
    adjustments.red !== 0 ||
    adjustments.green !== 0 ||
    adjustments.blue !== 0
  );
}

function applyAdjustmentsToImageData(data: ImageData, adjustments: PhotoAdjustments) {
  const { brightness, contrast, red, green, blue } = adjustments;
  if (!hasPhotoAdjustments(adjustments)) return;

  const pixels = data.data;
  for (let i = 0; i < pixels.length; i += 4) {
    let rl = srgbToLinear(pixels[i]);
    let gl = srgbToLinear(pixels[i + 1]);
    let bl = srgbToLinear(pixels[i + 2]);

    if (brightness !== 0) {
      [rl, gl, bl] = applyExposureLinear(rl, gl, bl, brightness);
    }
    if (contrast !== 0) {
      [rl, gl, bl] = applyContrastLinear(rl, gl, bl, contrast);
    }
    if (red !== 0 || green !== 0 || blue !== 0) {
      [rl, gl, bl] = applyColorBalanceLinear(rl, gl, bl, red, green, blue);
    }

    pixels[i] = clamp255(linearToSrgb(rl));
    pixels[i + 1] = clamp255(linearToSrgb(gl));
    pixels[i + 2] = clamp255(linearToSrgb(bl));
  }
}

export function computeCoverScale(
  imgWidth: number,
  imgHeight: number,
  cropDisplaySize: number,
  zoom: number,
): number {
  const minScale = Math.max(cropDisplaySize / imgWidth, cropDisplaySize / imgHeight);
  return minScale * zoom;
}

export function clampPhotoCrop(
  imgWidth: number,
  imgHeight: number,
  crop: PhotoCropState,
  viewportSize = VIEWPORT_SIZE,
  cropInset = CROP_INSET,
): PhotoCropState {
  const cropDisplaySize = getCropDisplaySize(viewportSize, cropInset);
  const scale = computeCoverScale(imgWidth, imgHeight, cropDisplaySize, crop.zoom);
  const scaledW = imgWidth * scale;
  const scaledH = imgHeight * scale;
  const maxPanX = Math.max(0, (scaledW - cropDisplaySize) / 2);
  const maxPanY = Math.max(0, (scaledH - cropDisplaySize) / 2);
  return {
    panX: Math.max(-maxPanX, Math.min(maxPanX, crop.panX)),
    panY: Math.max(-maxPanY, Math.min(maxPanY, crop.panY)),
    zoom: crop.zoom,
  };
}

export function renderEditedPhoto(
  img: HTMLImageElement,
  crop: PhotoCropState,
  adjustments: PhotoAdjustments,
  outputSize = 800,
  viewportSize = VIEWPORT_SIZE,
  cropInset = CROP_INSET,
): HTMLCanvasElement {
  const cropDisplaySize = getCropDisplaySize(viewportSize, cropInset);
  const safeCrop = clampPhotoCrop(img.naturalWidth, img.naturalHeight, crop, viewportSize, cropInset);
  const scale = computeCoverScale(img.naturalWidth, img.naturalHeight, cropDisplaySize, safeCrop.zoom);
  const scaledW = img.naturalWidth * scale;
  const scaledH = img.naturalHeight * scale;
  const centerX = viewportSize / 2 + safeCrop.panX;
  const centerY = viewportSize / 2 + safeCrop.panY;

  const viewportCanvas = document.createElement('canvas');
  viewportCanvas.width = viewportSize;
  viewportCanvas.height = viewportSize;
  const vctx = viewportCanvas.getContext('2d');
  if (!vctx) throw new Error('Canvas not supported');
  vctx.fillStyle = '#000';
  vctx.fillRect(0, 0, viewportSize, viewportSize);
  vctx.drawImage(img, centerX - scaledW / 2, centerY - scaledH / 2, scaledW, scaledH);

  const canvas = document.createElement('canvas');
  canvas.width = outputSize;
  canvas.height = outputSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');

  ctx.drawImage(
    viewportCanvas,
    cropInset,
    cropInset,
    cropDisplaySize,
    cropDisplaySize,
    0,
    0,
    outputSize,
    outputSize,
  );

  const hasAdjustments = hasPhotoAdjustments(adjustments);

  if (hasAdjustments) {
    const imageData = ctx.getImageData(0, 0, outputSize, outputSize);
    applyAdjustmentsToImageData(imageData, adjustments);
    ctx.putImageData(imageData, 0, 0);
  }

  return canvas;
}

export async function canvasToFile(
  canvas: HTMLCanvasElement,
  fileName = 'student-photo.jpg',
): Promise<File> {
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', 0.92);
  });
  if (!blob) throw new Error('Failed to export photo');
  return new File([blob], fileName, { type: 'image/jpeg', lastModified: Date.now() });
}

export const PHOTO_EDITOR_VIEWPORT = VIEWPORT_SIZE;
export const PHOTO_EDITOR_CROP_INSET = CROP_INSET;
