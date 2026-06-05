export type PhotoAdjustments = {
  brightness: number;
  contrast: number;
  saturation: number;
  warmth: number;
};

export type PhotoCropState = {
  panX: number;
  panY: number;
  zoom: number;
};

export const DEFAULT_PHOTO_ADJUSTMENTS: PhotoAdjustments = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  warmth: 0,
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

function clamp255(value: number): number {
  return Math.max(0, Math.min(255, value));
}

function applyAdjustmentsToImageData(
  data: ImageData,
  { brightness, contrast, saturation, warmth }: PhotoAdjustments,
) {
  const br = brightness * 1.2;
  const contrastFactor = 1 + contrast / 100;
  const satFactor = 1 + saturation / 100;
  const warm = warmth * 0.6;

  for (let i = 0; i < data.data.length; i += 4) {
    let r = data.data[i];
    let g = data.data[i + 1];
    let b = data.data[i + 2];

    r = (r - 128) * contrastFactor + 128 + br + warm;
    g = (g - 128) * contrastFactor + 128 + br;
    b = (b - 128) * contrastFactor + 128 + br - warm;

    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    r = gray + (r - gray) * satFactor;
    g = gray + (g - gray) * satFactor;
    b = gray + (b - gray) * satFactor;

    data.data[i] = clamp255(r);
    data.data[i + 1] = clamp255(g);
    data.data[i + 2] = clamp255(b);
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

  const hasAdjustments =
    adjustments.brightness !== 0 ||
    adjustments.contrast !== 0 ||
    adjustments.saturation !== 0 ||
    adjustments.warmth !== 0;

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
