import { loadImageFromSource } from '@/lib/photo-editor-utils';

type ProgressCallback = (key: string, current: number, total: number) => void;

type RemoveBackgroundFn = (
  image: Blob | ImageData | HTMLImageElement | string,
  config?: {
    model?: 'isnet' | 'isnet_fp16' | 'isnet_quint8';
    output?: { format?: string; type?: 'foreground' | 'background' | 'mask' };
    progress?: ProgressCallback;
  },
) => Promise<Blob>;

let removeBackgroundFn: RemoveBackgroundFn | null = null;
let cutoutCache: WeakMap<HTMLImageElement, HTMLImageElement> | null = null;

async function getRemoveBackground(): Promise<RemoveBackgroundFn> {
  if (removeBackgroundFn) return removeBackgroundFn;
  const mod = await import('@imgly/background-removal');
  removeBackgroundFn = (mod.removeBackground || mod.default) as RemoveBackgroundFn;
  if (!removeBackgroundFn) {
    throw new Error('Background remover failed to load');
  }
  return removeBackgroundFn;
}

function getCutoutCache(): WeakMap<HTMLImageElement, HTMLImageElement> {
  if (!cutoutCache) cutoutCache = new WeakMap();
  return cutoutCache;
}

async function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(blob);
  try {
    return await loadImageFromSource(objectUrl);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function imageToPngBlob(image: HTMLImageElement): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not prepare photo');
  ctx.drawImage(image, 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/png');
  });
  if (!blob) throw new Error('Could not prepare photo');
  return blob;
}

/**
 * Post-process the raw cutout alpha mask:
 * 1. Fill small holes inside the person
 * 2. Smooth jagged alpha edges
 * 3. Remove color spill / decontaminate edges
 */
function refineAlphaMask(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const { data } = imageData;

  // --- Pass 1: Fill small holes (isolated transparent pixels surrounded by opaque) ---
  const alpha = new Uint8Array(width * height);
  for (let i = 0; i < alpha.length; i++) {
    alpha[i] = data[i * 4 + 3];
  }

  const filled = new Uint8Array(alpha);
  const HOLE_RADIUS = 2;
  for (let y = HOLE_RADIUS; y < height - HOLE_RADIUS; y++) {
    for (let x = HOLE_RADIUS; x < width - HOLE_RADIUS; x++) {
      const idx = y * width + x;
      if (alpha[idx] > 30) continue;
      let opaqueCount = 0;
      let totalCount = 0;
      for (let dy = -HOLE_RADIUS; dy <= HOLE_RADIUS; dy++) {
        for (let dx = -HOLE_RADIUS; dx <= HOLE_RADIUS; dx++) {
          if (dx === 0 && dy === 0) continue;
          totalCount++;
          if (alpha[(y + dy) * width + (x + dx)] > 200) opaqueCount++;
        }
      }
      if (opaqueCount > totalCount * 0.75) {
        filled[idx] = 255;
      }
    }
  }

  // --- Pass 2: Alpha sharpening + edge-aware smoothing ---
  // Sharpen: push near-opaque pixels to fully opaque and near-transparent to fully transparent
  // This reduces the soft "haze" around edges while keeping a narrow band of true semi-transparency
  const sharpened = new Uint8Array(filled);
  const LOW_THRESH = 25;
  const HIGH_THRESH = 230;
  for (let i = 0; i < sharpened.length; i++) {
    const a = filled[i];
    if (a <= LOW_THRESH) { sharpened[i] = 0; continue; }
    if (a >= HIGH_THRESH) { sharpened[i] = 255; continue; }
    // Sigmoid-like contrast boost for the transition band
    const t = (a - LOW_THRESH) / (HIGH_THRESH - LOW_THRESH);
    const s = t * t * (3 - 2 * t); // smoothstep
    sharpened[i] = Math.round(s * 255);
  }

  // Smooth only the remaining semi-transparent edge band (3x3 box)
  const smoothed = new Uint8Array(sharpened);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const a = sharpened[idx];
      if (a === 0 || a === 255) continue;
      let sum = 0;
      let count = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          sum += sharpened[(y + dy) * width + (x + dx)];
          count++;
        }
      }
      smoothed[idx] = Math.round(sum / count);
    }
  }

  // --- Pass 3: Color decontamination (remove background color spill on semi-transparent edges) ---
  for (let i = 0; i < smoothed.length; i++) {
    const px = i * 4;
    const a = smoothed[i];
    data[px + 3] = a;

    if (a > 5 && a < 250) {
      const r = data[px];
      const g = data[px + 1];
      const b = data[px + 2];
      // Detect dominant background color in edge pixels and neutralize it
      // Use premultiplied-alpha-aware decontamination
      const alphaFrac = a / 255;
      if (alphaFrac < 0.6) {
        // For low-alpha edges, desaturate toward luminance to remove color halos
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        const blend = Math.min(1, alphaFrac * 1.8);
        data[px] = Math.round(r * blend + lum * (1 - blend));
        data[px + 1] = Math.round(g * blend + lum * (1 - blend));
        data[px + 2] = Math.round(b * blend + lum * (1 - blend));
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

export async function cutOutStudentPhoto(
  image: HTMLImageElement,
  onProgress?: (phase: string, pct: number) => void,
): Promise<HTMLImageElement> {
  const cache = getCutoutCache();
  const cached = cache.get(image);
  if (cached) return cached;

  const removeBackground = await getRemoveBackground();
  const source = await imageToPngBlob(image);

  const blob = await removeBackground(source, {
    model: 'isnet_fp16',
    output: { format: 'image/png' },
    progress: (key, current, total) => {
      if (!onProgress) return;
      const pct = total > 0 ? Math.round((current / total) * 100) : 0;
      if (key.includes('fetch') || key.includes('download')) {
        onProgress('Downloading model', pct);
      } else if (key.includes('compute') || key.includes('inference')) {
        onProgress('Processing', pct);
      }
    },
  });
  if (!blob || blob.size === 0) {
    throw new Error('Background removal returned an empty image');
  }

  // Refine the raw cutout
  const rawCutout = await blobToImage(blob);
  const refineCanvas = document.createElement('canvas');
  refineCanvas.width = rawCutout.naturalWidth || rawCutout.width;
  refineCanvas.height = rawCutout.naturalHeight || rawCutout.height;
  const rctx = refineCanvas.getContext('2d');
  if (!rctx) throw new Error('Canvas not supported');
  rctx.drawImage(rawCutout, 0, 0);
  refineAlphaMask(refineCanvas);

  const refinedBlob = await new Promise<Blob | null>((resolve) => {
    refineCanvas.toBlob(resolve, 'image/png');
  });
  if (!refinedBlob) throw new Error('Alpha refinement failed');
  const cutout = await blobToImage(refinedBlob);
  cache.set(image, cutout);
  return cutout;
}

export async function compositeOnSolidColor(
  foreground: HTMLImageElement,
  color: string,
): Promise<HTMLImageElement> {
  const width = foreground.naturalWidth || foreground.width;
  const height = foreground.naturalHeight || foreground.height;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not apply solid background');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(foreground, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Could not apply solid background');
  return blobToImage(blob);
}

export async function removeStudentPhotoBackground(
  image: HTMLImageElement,
): Promise<HTMLImageElement> {
  const cutout = await cutOutStudentPhoto(image);
  return compositeOnSolidColor(cutout, '#FFFFFF');
}

export async function applyStudentSolidBackground(
  image: HTMLImageElement,
  color: string,
  cutout?: HTMLImageElement | null,
): Promise<HTMLImageElement> {
  const subject = cutout || (await cutOutStudentPhoto(image));
  return compositeOnSolidColor(subject, color);
}

export async function composeStudentBackgroundImage(
  foreground: HTMLImageElement,
  backgroundFile: File,
): Promise<HTMLImageElement> {
  const bg = await loadImageFromSource(backgroundFile);
  const width = foreground.naturalWidth || foreground.width;
  const height = foreground.naturalHeight || foreground.height;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not prepare background image');

  const bgRatio = (bg.naturalWidth || bg.width) / (bg.naturalHeight || bg.height);
  const fgRatio = width / height;
  let drawW = width;
  let drawH = height;
  let dx = 0;
  let dy = 0;
  if (bgRatio > fgRatio) {
    drawH = height;
    drawW = height * bgRatio;
    dx = (width - drawW) / 2;
  } else {
    drawW = width;
    drawH = width / bgRatio;
    dy = (height - drawH) / 2;
  }

  ctx.drawImage(bg, dx, dy, drawW, drawH);
  ctx.drawImage(foreground, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/png');
  });
  if (!blob) throw new Error('Could not compose background image');
  return blobToImage(blob);
}
