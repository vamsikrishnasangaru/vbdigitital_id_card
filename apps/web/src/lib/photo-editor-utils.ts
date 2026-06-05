export type PhotoAdjustments = {
  brightness: number;
  exposure: number;
  contrast: number;
  highlights: number;
  shadows: number;
  saturation: number;
  warmth: number;
  tint: number;
  sharpness: number;
};

export type PhotoCropState = {
  panX: number;
  panY: number;
  zoom: number;
};

export const DEFAULT_PHOTO_ADJUSTMENTS: PhotoAdjustments = {
  brightness: 0,
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  saturation: 0,
  warmth: 0,
  tint: 0,
  sharpness: 0,
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

function srgbToLinear(channel: number): number {
  const x = channel / 255;
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}

function linearToSrgb(channel: number): number {
  const x = clamp01(channel);
  return x <= 0.0031308 ? x * 12.92 * 255 : (1.055 * Math.pow(x, 1 / 2.4) - 0.055) * 255;
}

function luminanceLinear(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function scaleLuminance(r: number, g: number, b: number, delta: number) {
  const lum = luminanceLinear(r, g, b);
  const next = lum + delta;
  if (lum > 1e-5) {
    const scale = next / lum;
    return [r * scale, g * scale, b * scale] as const;
  }
  return [r + delta, g + delta, b + delta] as const;
}

function applyExposureLinear(r: number, g: number, b: number, exposure: number) {
  const ev = (exposure / 100) * 1.1;
  const mul = Math.pow(2, ev);
  return [r * mul, g * mul, b * mul] as const;
}

function applyBrightnessLinear(r: number, g: number, b: number, brightness: number) {
  const delta = (brightness / 100) * 0.14;
  return scaleLuminance(r, g, b, delta);
}

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

function applyHighlightsLinear(r: number, g: number, b: number, highlights: number) {
  if (highlights === 0) return [r, g, b] as const;
  const lum = luminanceLinear(r, g, b);
  const weight = Math.pow(clamp01((lum - 0.42) / 0.58), 1.6);
  const delta = (highlights / 100) * 0.38 * weight;
  return scaleLuminance(r, g, b, delta);
}

function applyShadowsLinear(r: number, g: number, b: number, shadows: number) {
  if (shadows === 0) return [r, g, b] as const;
  const lum = luminanceLinear(r, g, b);
  const weight = Math.pow(clamp01((0.58 - lum) / 0.58), 1.6);
  const delta = (shadows / 100) * 0.38 * weight;
  return scaleLuminance(r, g, b, delta);
}

function applySaturationLinear(r: number, g: number, b: number, saturation: number) {
  if (saturation === 0) return [r, g, b] as const;
  const lum = luminanceLinear(r, g, b);
  const s = 1 + (saturation / 100) * 0.9;
  return [lum + (r - lum) * s, lum + (g - lum) * s, lum + (b - lum) * s] as const;
}

function applyWarmthLinear(r: number, g: number, b: number, warmth: number) {
  if (warmth === 0) return [r, g, b] as const;
  const w = (warmth / 100) * 0.07;
  return [r + w, g, b - w] as const;
}

function applyTintLinear(r: number, g: number, b: number, tint: number) {
  if (tint === 0) return [r, g, b] as const;
  const t = (tint / 100) * 0.05;
  return [r + t, g - t, b + t] as const;
}

export function hasPhotoAdjustments(adjustments: PhotoAdjustments): boolean {
  return Object.values(adjustments).some((value) => value !== 0);
}

function applyAdjustmentsToImageData(data: ImageData, adjustments: PhotoAdjustments) {
  if (!hasPhotoAdjustments(adjustments)) return;

  const {
    brightness,
    exposure,
    contrast,
    highlights,
    shadows,
    saturation,
    warmth,
    tint,
  } = adjustments;

  const pixels = data.data;
  for (let i = 0; i < pixels.length; i += 4) {
    let rl = srgbToLinear(pixels[i]);
    let gl = srgbToLinear(pixels[i + 1]);
    let bl = srgbToLinear(pixels[i + 2]);

    if (exposure !== 0) [rl, gl, bl] = applyExposureLinear(rl, gl, bl, exposure);
    if (brightness !== 0) [rl, gl, bl] = applyBrightnessLinear(rl, gl, bl, brightness);
    if (contrast !== 0) [rl, gl, bl] = applyContrastLinear(rl, gl, bl, contrast);
    if (highlights !== 0) [rl, gl, bl] = applyHighlightsLinear(rl, gl, bl, highlights);
    if (shadows !== 0) [rl, gl, bl] = applyShadowsLinear(rl, gl, bl, shadows);
    if (saturation !== 0) [rl, gl, bl] = applySaturationLinear(rl, gl, bl, saturation);
    if (warmth !== 0) [rl, gl, bl] = applyWarmthLinear(rl, gl, bl, warmth);
    if (tint !== 0) [rl, gl, bl] = applyTintLinear(rl, gl, bl, tint);

    pixels[i] = clamp255(linearToSrgb(rl));
    pixels[i + 1] = clamp255(linearToSrgb(gl));
    pixels[i + 2] = clamp255(linearToSrgb(bl));
  }

  if (adjustments.sharpness !== 0) {
    applySharpness(data, adjustments.sharpness);
  }
}

function applySharpness(data: ImageData, sharpness: number) {
  const { width, height, data: pixels } = data;
  const src = new Uint8ClampedArray(pixels);
  const strength = (sharpness / 100) * 0.85;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            sum += src[((y + dy) * width + (x + dx)) * 4 + c];
          }
        }
        const blurred = sum / 9;
        pixels[idx + c] = clamp255(src[idx + c] + strength * (src[idx + c] - blurred));
      }
    }
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

  if (hasPhotoAdjustments(adjustments)) {
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
