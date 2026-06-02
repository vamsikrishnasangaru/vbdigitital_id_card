/** Resize/compress images before upload (nginx often limits bodies to 1MB). */

export const STUDENT_PHOTO_UPLOAD_OPTS = {
  maxBytes: 400 * 1024,
  maxWidth: 800,
  maxHeight: 800,
  initialQuality: 0.78,
} as const;

const DEFAULT_MAX_BYTES = STUDENT_PHOTO_UPLOAD_OPTS.maxBytes;
const DEFAULT_MAX_DIMENSION = STUDENT_PHOTO_UPLOAD_OPTS.maxWidth;

function isLikelyImage(file: File): boolean {
  if (file.type.startsWith('image/')) return true;
  return /\.(jpe?g|png|gif|webp|heic|heif|bmp)$/i.test(file.name);
}

async function loadImageSource(
  file: File,
): Promise<{ source: CanvasImageSource; width: number; height: number; cleanup: () => void }> {
  try {
    const bitmap = await createImageBitmap(file);
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      cleanup: () => bitmap.close(),
    };
  } catch {
    // Fallback for formats createImageBitmap cannot decode (some HEIC, older browsers).
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({
        source: img,
        width: img.naturalWidth,
        height: img.naturalHeight,
        cleanup: () => URL.revokeObjectURL(url),
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not decode image'));
    };
    img.src = url;
  });
}

async function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', quality);
  });
}

export async function compressImageForUpload(
  file: File,
  options?: {
    maxBytes?: number;
    maxWidth?: number;
    maxHeight?: number;
    initialQuality?: number;
  },
): Promise<File> {
  if (!isLikelyImage(file)) return file;

  const maxBytes = options?.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxWidth = options?.maxWidth ?? DEFAULT_MAX_DIMENSION;
  const maxHeight = options?.maxHeight ?? DEFAULT_MAX_DIMENSION;

  let loaded: Awaited<ReturnType<typeof loadImageSource>>;
  try {
    loaded = await loadImageSource(file);
  } catch {
    return file;
  }

  const { source, cleanup } = loaded;
  let width = loaded.width;
  let height = loaded.height;

  try {
    let dimensionScale = Math.min(1, maxWidth / width, maxHeight / height);
    let bestBlob: Blob | null = null;

    for (let dimPass = 0; dimPass < 6; dimPass++) {
      const w = Math.max(1, Math.round(width * dimensionScale));
      const h = Math.max(1, Math.round(height * dimensionScale));

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) break;
      ctx.drawImage(source, 0, 0, w, h);

      let quality = options?.initialQuality ?? 0.78;
      for (let qPass = 0; qPass < 10; qPass++) {
        const blob = await canvasToJpegBlob(canvas, quality);
        if (blob) {
          bestBlob = blob;
          if (blob.size <= maxBytes) {
            const baseName = file.name.replace(/\.[^.]+$/, '') || 'photo';
            return new File([blob], `${baseName}.jpg`, {
              type: 'image/jpeg',
              lastModified: Date.now(),
            });
          }
        }
        quality -= 0.07;
        if (quality < 0.35) break;
      }

      dimensionScale *= 0.82;
    }

    if (bestBlob) {
      const baseName = file.name.replace(/\.[^.]+$/, '') || 'photo';
      return new File([bestBlob], `${baseName}.jpg`, {
        type: 'image/jpeg',
        lastModified: Date.now(),
      });
    }
  } finally {
    cleanup();
  }

  return file;
}
