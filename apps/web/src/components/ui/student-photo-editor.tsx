'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, RotateCcw, X, Crop, SlidersHorizontal } from 'lucide-react';
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

type EditorTab = 'crop' | 'adjust';

/** CSS display size of the crop canvas (internal canvas is PHOTO_EDITOR_VIEWPORT). */
const PREVIEW_DISPLAY_PX = 152;
const PREVIEW_DRAG_SCALE = PHOTO_EDITOR_VIEWPORT / PREVIEW_DISPLAY_PX;

function AdjustmentSlider({
  label,
  value,
  min,
  max,
  onChange,
  compact = false,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  compact?: boolean;
}) {
  return (
    <div className={cn(compact ? 'space-y-0.5' : 'space-y-1.5')}>
      <div className="flex items-center justify-between text-[9px] font-black uppercase tracking-wider text-muted-foreground">
        <span>{label}</span>
        <span className="tabular-nums text-foreground">{value > 0 ? `+${value}` : value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onInput={(e) => onChange(Number(e.currentTarget.value))}
        className="w-full accent-primary h-1.5 cursor-pointer"
      />
    </div>
  );
}

export function StudentPhotoEditor({ open, source, onClose, onSave }: StudentPhotoEditorProps) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<EditorTab>('crop');
  const [crop, setCrop] = useState<PhotoCropState>(DEFAULT_PHOTO_CROP);
  const [adjustments, setAdjustments] = useState<PhotoAdjustments>(DEFAULT_PHOTO_ADJUSTMENTS);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewRafRef = useRef<number>(0);

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
      setActiveTab('crop');
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
        setActiveTab('crop');
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
    cancelAnimationFrame(previewRafRef.current);
    previewRafRef.current = requestAnimationFrame(() => {
      drawPreview();
    });
    return () => cancelAnimationFrame(previewRafRef.current);
  }, [drawPreview]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!image || activeTab !== 'crop') return;
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, panX: crop.panX, panY: crop.panY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging || !image) return;
    const dx = (e.clientX - dragStart.current.x) * PREVIEW_DRAG_SCALE;
    const dy = (e.clientY - dragStart.current.y) * PREVIEW_DRAG_SCALE;
    const next = {
      panX: dragStart.current.panX + dx,
      panY: dragStart.current.panY + dy,
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
        className="bg-card border border-border rounded-3xl shadow-2xl w-full max-w-sm max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-border flex items-center justify-between shrink-0">
          <h4 className="font-black text-foreground">Edit photo</h4>
          <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-muted" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground flex-1">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm font-bold">Loading photo…</p>
          </div>
        ) : error ? (
          <div className="text-center py-12 text-red-600 text-sm font-medium flex-1">{error}</div>
        ) : image ? (
          <>
            {/* Preview stays fixed — updates live while adjusting sliders below */}
            <div className="shrink-0 px-4 pt-2 pb-2 border-b border-border bg-card flex justify-center">
              <div className="relative rounded-xl overflow-hidden border border-border bg-black shadow-inner w-[152px] h-[152px]">
                <canvas
                  ref={previewCanvasRef}
                  width={PHOTO_EDITOR_VIEWPORT}
                  height={PHOTO_EDITOR_VIEWPORT}
                  className={cn(
                    'w-full h-full block touch-none',
                    activeTab === 'crop' && (dragging ? 'cursor-grabbing' : 'cursor-grab'),
                  )}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                />
              </div>
            </div>

            <div className="shrink-0 px-4 pt-2 pb-1">
              <div className="flex p-0.5 rounded-lg bg-muted/60 border border-border">
                <button
                  type="button"
                  onClick={() => setActiveTab('crop')}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-[10px] font-black uppercase tracking-wider transition-all',
                    activeTab === 'crop'
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Crop className="h-3.5 w-3.5" />
                  Crop
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('adjust')}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-[10px] font-black uppercase tracking-wider transition-all',
                    activeTab === 'adjust'
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  Color
                </button>
              </div>
            </div>

            <div className="shrink-0 px-4 py-2">
              {activeTab === 'crop' ? (
                <AdjustmentSlider
                  compact
                  label="Zoom"
                  value={Math.round((crop.zoom - 1) * 100)}
                  min={0}
                  max={150}
                  onChange={onZoomChange}
                />
              ) : (
                <div className="space-y-2">
                  <AdjustmentSlider
                    compact
                    label="Brightness"
                    value={adjustments.brightness}
                    min={-100}
                    max={100}
                    onChange={(v) => setAdjustments((a) => ({ ...a, brightness: v }))}
                  />
                  <AdjustmentSlider
                    compact
                    label="Contrast"
                    value={adjustments.contrast}
                    min={-100}
                    max={100}
                    onChange={(v) => setAdjustments((a) => ({ ...a, contrast: v }))}
                  />
                  <div className="grid grid-cols-3 gap-2 pt-0.5">
                    <AdjustmentSlider
                      compact
                      label="Red"
                      value={adjustments.red}
                      min={-100}
                      max={100}
                      onChange={(v) => setAdjustments((a) => ({ ...a, red: v }))}
                    />
                    <AdjustmentSlider
                      compact
                      label="Green"
                      value={adjustments.green}
                      min={-100}
                      max={100}
                      onChange={(v) => setAdjustments((a) => ({ ...a, green: v }))}
                    />
                    <AdjustmentSlider
                      compact
                      label="Blue"
                      value={adjustments.blue}
                      min={-100}
                      max={100}
                      onChange={(v) => setAdjustments((a) => ({ ...a, blue: v }))}
                    />
                  </div>
                </div>
              )}
            </div>
          </>
        ) : null}

        <div className="px-4 py-3 border-t border-border flex flex-wrap gap-2 justify-end bg-muted/30 shrink-0">
          <button
            type="button"
            onClick={resetAll}
            disabled={loading || saving || !image}
            className="px-3 py-2 rounded-xl text-xs font-bold border border-border hover:bg-muted disabled:opacity-50 flex items-center gap-1.5"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-3 py-2 rounded-xl text-xs font-bold border border-border hover:bg-muted disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={loading || saving || !image}
            className="px-5 py-2 rounded-xl text-xs font-black bg-primary text-primary-foreground disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Apply photo
          </button>
        </div>
      </div>
    </div>
  );
}
