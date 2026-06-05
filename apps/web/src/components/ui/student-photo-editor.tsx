'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, RotateCcw, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DEFAULT_PHOTO_ADJUSTMENTS,
  DEFAULT_PHOTO_CROP,
  PHOTO_EDITOR_CROP_INSET,
  PHOTO_EDITOR_VIEWPORT,
  canvasToFile,
  clampPhotoCrop,
  getCropDisplaySize,
  loadImageFromSource,
  renderEditedPhoto,
  type PhotoAdjustments,
  type PhotoCropState,
} from '@/lib/photo-editor-utils';
import { compressImageForUpload, STUDENT_PHOTO_UPLOAD_OPTS } from '@/lib/compress-image';

interface StudentPhotoEditorProps {
  open: boolean;
  source: string | File | null;
  onClose: () => void;
  onSave: (file: File, previewUrl: string) => void;
}

function AdjustmentSlider({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-muted-foreground">
        <span>{label}</span>
        <span className="tabular-nums text-foreground">{value > 0 ? `+${value}` : value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-primary h-2 cursor-pointer"
      />
    </div>
  );
}

export function StudentPhotoEditor({ open, source, onClose, onSave }: StudentPhotoEditorProps) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [crop, setCrop] = useState<PhotoCropState>(DEFAULT_PHOTO_CROP);
  const [adjustments, setAdjustments] = useState<PhotoAdjustments>(DEFAULT_PHOTO_ADJUSTMENTS);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  const cropDisplaySize = getCropDisplaySize(PHOTO_EDITOR_VIEWPORT, PHOTO_EDITOR_CROP_INSET);

  const drawPreview = useCallback(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas || !image) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = PHOTO_EDITOR_VIEWPORT;
    canvas.height = PHOTO_EDITOR_VIEWPORT;
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const edited = renderEditedPhoto(image, crop, adjustments, cropDisplaySize);
    ctx.drawImage(edited, PHOTO_EDITOR_CROP_INSET, PHOTO_EDITOR_CROP_INSET);

    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    ctx.strokeRect(PHOTO_EDITOR_CROP_INSET, PHOTO_EDITOR_CROP_INSET, cropDisplaySize, cropDisplaySize);
  }, [image, crop, adjustments, cropDisplaySize]);

  useEffect(() => {
    if (!open || !source) {
      setImage(null);
      setError(null);
      setCrop(DEFAULT_PHOTO_CROP);
      setAdjustments(DEFAULT_PHOTO_ADJUSTMENTS);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    void loadImageFromSource(source)
      .then((img) => {
        if (cancelled) return;
        setImage(img);
        setCrop(DEFAULT_PHOTO_CROP);
        setAdjustments(DEFAULT_PHOTO_ADJUSTMENTS);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load photo for editing');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, source]);

  useEffect(() => {
    drawPreview();
  }, [drawPreview]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!image) return;
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, panX: crop.panX, panY: crop.panY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging || !image) return;
    const next = {
      panX: dragStart.current.panX + (e.clientX - dragStart.current.x),
      panY: dragStart.current.panY + (e.clientY - dragStart.current.y),
      zoom: crop.zoom,
    };
    setCrop(clampPhotoCrop(image.naturalWidth, image.naturalHeight, next));
  };

  const onZoomChange = (v: number) => {
    if (!image) return;
    const next = { ...crop, zoom: 1 + v / 100 };
    setCrop(clampPhotoCrop(image.naturalWidth, image.naturalHeight, next));
  };

  const onPointerUp = () => setDragging(false);

  const resetAll = () => {
    setCrop(DEFAULT_PHOTO_CROP);
    setAdjustments(DEFAULT_PHOTO_ADJUSTMENTS);
  };

  const handleSave = async () => {
    if (!image) return;
    setSaving(true);
    setError(null);
    try {
      const canvas = renderEditedPhoto(image, crop, adjustments);
      const rawFile = await canvasToFile(canvas, `student-photo-${Date.now()}.jpg`);
      const compressed = await compressImageForUpload(rawFile, STUDENT_PHOTO_UPLOAD_OPTS);
      const previewUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(compressed);
      });
      onSave(compressed, previewUrl);
      onClose();
    } catch {
      setError('Failed to save edited photo');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div
        className="bg-card border border-border rounded-3xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-border flex items-center justify-between shrink-0">
          <div>
            <h4 className="font-black text-foreground">Edit photo</h4>
            <p className="text-xs text-muted-foreground mt-0.5">Crop, brightness, contrast &amp; color</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-muted" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-5 overflow-y-auto flex-1 custom-scrollbar">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm font-bold">Loading photo…</p>
            </div>
          ) : error ? (
            <div className="text-center py-12 text-red-600 text-sm font-medium">{error}</div>
          ) : image ? (
            <>
              <div className="space-y-2">
                <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                  Crop — drag to reposition · use zoom
                </p>
                <div className="relative mx-auto rounded-2xl overflow-hidden border border-border bg-black shadow-inner">
                  <canvas
                    ref={previewCanvasRef}
                    width={PHOTO_EDITOR_VIEWPORT}
                    height={PHOTO_EDITOR_VIEWPORT}
                    className={cn(
                      'w-full max-w-[320px] mx-auto block touch-none',
                      dragging ? 'cursor-grabbing' : 'cursor-grab',
                    )}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerUp}
                  />
                </div>
                <AdjustmentSlider
                  label="Zoom"
                  value={Math.round((crop.zoom - 1) * 100)}
                  min={0}
                  max={150}
                  onChange={onZoomChange}
                />
              </div>

              <div className="space-y-4 pt-2 border-t border-border">
                <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Adjustments</p>
                <AdjustmentSlider
                  label="Brightness"
                  value={adjustments.brightness}
                  min={-100}
                  max={100}
                  onChange={(v) => setAdjustments((a) => ({ ...a, brightness: v }))}
                />
                <AdjustmentSlider
                  label="Contrast"
                  value={adjustments.contrast}
                  min={-100}
                  max={100}
                  onChange={(v) => setAdjustments((a) => ({ ...a, contrast: v }))}
                />
                <AdjustmentSlider
                  label="Color balance"
                  value={adjustments.saturation}
                  min={-100}
                  max={100}
                  onChange={(v) => setAdjustments((a) => ({ ...a, saturation: v }))}
                />
                <AdjustmentSlider
                  label="Warmth"
                  value={adjustments.warmth}
                  min={-100}
                  max={100}
                  onChange={(v) => setAdjustments((a) => ({ ...a, warmth: v }))}
                />
              </div>
            </>
          ) : null}
        </div>

        <div className="p-5 border-t border-border flex flex-wrap gap-2 justify-end bg-muted/30 shrink-0">
          <button
            type="button"
            onClick={resetAll}
            disabled={loading || saving || !image}
            className="px-4 py-2.5 rounded-xl text-sm font-bold border border-border hover:bg-muted disabled:opacity-50 flex items-center gap-2"
          >
            <RotateCcw className="h-4 w-4" />
            Reset
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2.5 rounded-xl text-sm font-bold border border-border hover:bg-muted disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={loading || saving || !image}
            className="px-6 py-2.5 rounded-xl text-sm font-black bg-primary text-primary-foreground disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Apply photo
          </button>
        </div>
      </div>
    </div>
  );
}
