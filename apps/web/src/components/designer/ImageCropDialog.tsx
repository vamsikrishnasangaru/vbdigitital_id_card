'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Check, RotateCcw } from 'lucide-react';
import { clampCrop, type ImageCrop } from '@/lib/designer-utils';

interface ImageCropDialogProps {
  imageUrl: string;
  initialCrop?: ImageCrop;
  onClose: () => void;
  onApply: (crop: ImageCrop) => void;
}

const DEFAULT_CROP: ImageCrop = { x: 0.1, y: 0.1, width: 0.8, height: 0.8 };

export function ImageCropDialog({ imageUrl, initialCrop, onClose, onApply }: ImageCropDialogProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [crop, setCrop] = useState<ImageCrop>(clampCrop(initialCrop ?? DEFAULT_CROP));
  const [loadError, setLoadError] = useState(false);
  const [dragging, setDragging] = useState<'move' | 'se' | null>(null);
  const dragStart = useRef({ mx: 0, my: 0, crop: crop });
  const imgRef = useRef<HTMLImageElement | null>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, w, h);

    const cx = crop.x * w;
    const cy = crop.y * h;
    const cw = crop.width * w;
    const ch = crop.height * h;

    ctx.save();
    ctx.beginPath();
    ctx.rect(cx, cy, cw, ch);
    ctx.clip();
    ctx.drawImage(img, 0, 0, w, h);
    ctx.restore();

    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(cx, cy, cw, ch);
    ctx.setLineDash([]);
    ctx.fillStyle = '#3b82f6';
    ctx.fillRect(cx + cw - 8, cy + ch - 8, 16, 16);
  }, [crop]);

  useEffect(() => {
    setLoadError(false);
    const img = new window.Image();
    const needsCrossOrigin =
      imageUrl.startsWith('http') &&
      !imageUrl.startsWith(window.location.origin) &&
      !imageUrl.startsWith('data:') &&
      !imageUrl.startsWith('blob:');
    if (needsCrossOrigin) img.crossOrigin = 'anonymous';

    img.onload = () => {
      imgRef.current = img;
      const canvas = canvasRef.current;
      if (canvas) {
        const maxW = 520;
        const scale = Math.min(1, maxW / img.width);
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
      }
      draw();
    };
    img.onerror = () => setLoadError(true);
    img.src = imageUrl;

    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [imageUrl, draw]);

  useEffect(() => {
    draw();
  }, [crop, draw]);

  const pointerDown = (e: React.PointerEvent, mode: 'move' | 'se') => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(mode);
    dragStart.current = { mx: e.clientX, my: e.clientY, crop: { ...crop } };
  };

  const pointerMove = (e: React.PointerEvent) => {
    if (!dragging || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const dx = (e.clientX - dragStart.current.mx) / rect.width;
    const dy = (e.clientY - dragStart.current.my) / rect.height;
    const base = dragStart.current.crop;

    if (dragging === 'move') {
      setCrop(
        clampCrop({
          ...base,
          x: base.x + dx,
          y: base.y + dy,
        }),
      );
    } else {
      setCrop(
        clampCrop({
          ...base,
          width: base.width + dx,
          height: base.height + dy,
        }),
      );
    }
  };

  const stopDrag = (e: React.PointerEvent) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setDragging(null);
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-label="Close" />
      <div className="relative bg-card border border-border rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-bold text-foreground">Crop image</h3>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground">Drag to move · corner handle to resize</p>

        {loadError ? (
          <div className="rounded-xl border border-border bg-muted/50 p-8 text-center text-sm text-muted-foreground">
            Could not load the image for cropping. Check that the photo URL is accessible.
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            className="w-full rounded-xl border border-border cursor-crosshair touch-none"
            onPointerMove={pointerMove}
            onPointerUp={stopDrag}
            onPointerCancel={stopDrag}
            onPointerDown={(e) => {
              const canvas = canvasRef.current;
              if (!canvas || loadError) return;
              const rect = canvas.getBoundingClientRect();
              const px = (e.clientX - rect.left) / rect.width;
              const py = (e.clientY - rect.top) / rect.height;
              const inHandle = px >= crop.x + crop.width - 0.05 && py >= crop.y + crop.height - 0.05;
              pointerDown(e, inHandle ? 'se' : 'move');
            }}
          />
        )}

        <div className="flex justify-between gap-2">
          <button
            type="button"
            onClick={() => setCrop(DEFAULT_CROP)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl border border-border hover:bg-muted"
          >
            <RotateCcw className="h-4 w-4" /> Reset
          </button>
          <button
            type="button"
            disabled={loadError}
            onClick={() => onApply(clampCrop(crop))}
            className="flex items-center gap-2 px-6 py-2 text-sm font-bold rounded-xl bg-primary text-primary-foreground disabled:opacity-50"
          >
            <Check className="h-4 w-4" /> Apply crop
          </button>
        </div>
      </div>
    </div>
  );
}
