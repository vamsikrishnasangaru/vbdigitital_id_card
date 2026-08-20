'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Loader2,
  RotateCcw,
  X,
  Crop,
  Eraser,
  Palette,
  ImagePlus,
  SlidersHorizontal,
} from 'lucide-react';
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
import {
  applyStudentSolidBackground,
  composeStudentBackgroundImage,
  cutOutStudentPhoto,
} from '@/lib/remove-student-photo-background';

interface StudentPhotoEditorProps {
  open: boolean;
  source: string | File | null;
  backupSource?: string | File | null;
  onClose: () => void;
  onSave: (file: File, previewUrl: string) => void;
}

type EditorTab = 'bg' | 'crop' | 'color';
type AdjustmentKey = keyof PhotoAdjustments;

/** CSS display size of the crop canvas (internal canvas is PHOTO_EDITOR_VIEWPORT). */
const PREVIEW_DISPLAY_PX = 280;
const PREVIEW_DRAG_SCALE = PHOTO_EDITOR_VIEWPORT / PREVIEW_DISPLAY_PX;

const SOLID_COLORS = ['#FFFFFF', '#F8FAFC', '#E2E8F0', '#DBEAFE', '#FEE2E2', '#DCFCE7', '#FEF3C7'];

const ADJUST_CONTROLS: { key: AdjustmentKey; label: string; min?: number; max?: number }[] = [
  { key: 'brightness', label: 'Brightness' },
  { key: 'contrast', label: 'Contrast' },
  { key: 'saturation', label: 'Saturation' },
  { key: 'highlights', label: 'Highlights' },
  { key: 'shadows', label: 'Shadows' },
  { key: 'sharpness', label: 'Sharpen', min: 0, max: 100 },
  { key: 'hue', label: 'Hue' },
];

function AdjustmentSlider({
  label,
  icon,
  value,
  min = -100,
  max = 100,
  onChange,
}: {
  label: string;
  icon?: ReactNode;
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 text-foreground">
          {icon ? <span className="text-muted-foreground shrink-0">{icon}</span> : null}
          <span className="text-[11px] font-medium truncate">{label}</span>
        </div>
        <span className="min-w-9 px-1.5 py-0.5 rounded-md border border-border text-[11px] tabular-nums text-muted-foreground text-center shrink-0">
          {value}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onInput={(e) => onChange(Number(e.currentTarget.value))}
        className="w-full accent-primary h-1 cursor-pointer"
      />
    </div>
  );
}

export function StudentPhotoEditor({ open, source, backupSource = null, onClose, onSave }: StudentPhotoEditorProps) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removingBg, setRemovingBg] = useState(false);
  const [bgProgress, setBgProgress] = useState('');
  const [applyingSolidBg, setApplyingSolidBg] = useState(false);
  const [applyingImageBg, setApplyingImageBg] = useState(false);
  const [bgRemoved, setBgRemoved] = useState(false);
  const [selectedSolidColor, setSelectedSolidColor] = useState('#FFFFFF');
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<EditorTab>('bg');
  const [crop, setCrop] = useState<PhotoCropState>(DEFAULT_PHOTO_CROP);
  const [adjustments, setAdjustments] = useState<PhotoAdjustments>(DEFAULT_PHOTO_ADJUSTMENTS);
  const [dragging, setDragging] = useState(false);
  const [hasBackup, setHasBackup] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewRafRef = useRef<number>(0);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const cropRef = useRef<PhotoCropState>(DEFAULT_PHOTO_CROP);
  const adjustmentsRef = useRef<PhotoAdjustments>(DEFAULT_PHOTO_ADJUSTMENTS);
  const originalImageRef = useRef<HTMLImageElement | null>(null);
  const backupImageRef = useRef<HTMLImageElement | null>(null);
  const cutoutImageRef = useRef<HTMLImageElement | null>(null);
  const backgroundUploadRef = useRef<HTMLInputElement>(null);

  const commitImage = (img: HTMLImageElement | null) => {
    imageRef.current = img;
    setImage(img);
  };

  const commitCrop = (next: PhotoCropState) => {
    cropRef.current = next;
    setCrop(next);
  };

  const resetCrop = () => {
    cropRef.current = DEFAULT_PHOTO_CROP;
    setCrop(DEFAULT_PHOTO_CROP);
  };

  const resetAdjustments = () => {
    adjustmentsRef.current = DEFAULT_PHOTO_ADJUSTMENTS;
    setAdjustments(DEFAULT_PHOTO_ADJUSTMENTS);
  };

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

    // Draw checkerboard behind the crop area when BG has been removed
    if (bgRemoved) {
      const CHECKER = 10;
      const ox = PHOTO_EDITOR_CROP_INSET;
      const oy = PHOTO_EDITOR_CROP_INSET;
      for (let cy = 0; cy < cropDisplaySize; cy += CHECKER) {
        for (let cx = 0; cx < cropDisplaySize; cx += CHECKER) {
          const isLight = ((Math.floor(cx / CHECKER) + Math.floor(cy / CHECKER)) % 2) === 0;
          ctx.fillStyle = isLight ? '#e0e0e0' : '#c0c0c0';
          ctx.fillRect(
            ox + cx, oy + cy,
            Math.min(CHECKER, cropDisplaySize - cx),
            Math.min(CHECKER, cropDisplaySize - cy),
          );
        }
      }
    }

    const edited = renderEditedPhoto(image, crop, adjustments, cropDisplaySize);
    ctx.drawImage(edited, PHOTO_EDITOR_CROP_INSET, PHOTO_EDITOR_CROP_INSET);

    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    ctx.strokeRect(PHOTO_EDITOR_CROP_INSET, PHOTO_EDITOR_CROP_INSET, cropDisplaySize, cropDisplaySize);
  }, [image, crop, adjustments, cropDisplaySize, bgRemoved]);

  useEffect(() => {
    if (!open || !source) {
      commitImage(null);
      originalImageRef.current = null;
      backupImageRef.current = null;
      setHasBackup(false);
      cutoutImageRef.current = null;
      setError(null);
      setActiveTab('bg');
      resetCrop();
      resetAdjustments();
      setBgRemoved(false);
      setBgProgress('');
      setSelectedSolidColor('#FFFFFF');
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        let img: HTMLImageElement | null = null;
        try {
          img = await loadImageFromSource(source);
        } catch {
          if (backupSource) img = await loadImageFromSource(backupSource);
          else throw new Error('primary failed');
        }
        const backup =
          backupSource && backupSource !== source
            ? await loadImageFromSource(backupSource).catch(() => null)
            : null;
        if (cancelled) return;
        originalImageRef.current = img;
        backupImageRef.current = backup;
        setHasBackup(Boolean(backup));
        cutoutImageRef.current = null;
        commitImage(img);
        setActiveTab('bg');
        resetCrop();
        resetAdjustments();
        setBgRemoved(false);
        setSelectedSolidColor('#FFFFFF');
      } catch {
        if (!cancelled) setError('Could not load photo for editing');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, source, backupSource]);

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
    const currentImage = imageRef.current;
    if (!dragging || !currentImage) return;
    const dx = (e.clientX - dragStart.current.x) * PREVIEW_DRAG_SCALE;
    const dy = (e.clientY - dragStart.current.y) * PREVIEW_DRAG_SCALE;
    const next = {
      panX: dragStart.current.panX + dx,
      panY: dragStart.current.panY + dy,
      zoom: cropRef.current.zoom,
    };
    commitCrop(clampPhotoCrop(currentImage.naturalWidth, currentImage.naturalHeight, next));
  };

  const onZoomChange = (v: number) => {
    const currentImage = imageRef.current;
    if (!currentImage) return;
    const next = { ...cropRef.current, zoom: 1 + v / 100 };
    commitCrop(clampPhotoCrop(currentImage.naturalWidth, currentImage.naturalHeight, next));
  };

  const onPointerUp = () => setDragging(false);

  const resetAll = () => {
    const original = originalImageRef.current;
    if (original) commitImage(original);
    cutoutImageRef.current = null;
    setBgRemoved(false);
    setSelectedSolidColor('#FFFFFF');
    resetCrop();
    resetAdjustments();
    setError(null);
  };

  const restoreFromBackup = () => {
    const backup = backupImageRef.current;
    if (!backup) {
      setError('Original backup is not available for this photo');
      return;
    }
    commitImage(backup);
    cutoutImageRef.current = null;
    setBgRemoved(false);
    setSelectedSolidColor('#FFFFFF');
    resetCrop();
    resetAdjustments();
    setActiveTab('bg');
    setError(null);
  };

  const ensureCutout = async (
    onProgress?: (phase: string, pct: number) => void,
  ): Promise<HTMLImageElement> => {
    if (cutoutImageRef.current) return cutoutImageRef.current;
    const sourceImage = originalImageRef.current || image;
    if (!sourceImage) throw new Error('No photo loaded');
    const cutout = await cutOutStudentPhoto(sourceImage, onProgress);
    cutoutImageRef.current = cutout;
    return cutout;
  };

  const handleRemoveBackground = async () => {
    if (removingBg) return;
    setRemovingBg(true);
    setBgProgress('Starting…');
    setError(null);
    try {
      const cutout = await ensureCutout((phase, pct) => {
        setBgProgress(`${phase}… ${pct}%`);
      });
      const cleaned = await applyStudentSolidBackground(
        originalImageRef.current || image!,
        '#FFFFFF',
        cutout,
      );
      commitImage(cleaned);
      setBgRemoved(true);
      setSelectedSolidColor('#FFFFFF');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Background removal failed');
    } finally {
      setRemovingBg(false);
      setBgProgress('');
    }
  };

  const handleApplySolidBackground = async (color: string) => {
    if (applyingSolidBg) return;
    setApplyingSolidBg(true);
    setError(null);
    setSelectedSolidColor(color);
    try {
      const cutout = await ensureCutout();
      const colored = await applyStudentSolidBackground(
        originalImageRef.current || image!,
        color,
        cutout,
      );
      commitImage(colored);
      setBgRemoved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Applying solid background failed');
    } finally {
      setApplyingSolidBg(false);
    }
  };

  const handleUploadBackground = async (file: File | undefined) => {
    if (!file || applyingImageBg) return;
    setApplyingImageBg(true);
    setError(null);
    try {
      const cutout = await ensureCutout();
      const composed = await composeStudentBackgroundImage(cutout, file);
      commitImage(composed);
      setBgRemoved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Applying image background failed');
    } finally {
      setApplyingImageBg(false);
      if (backgroundUploadRef.current) backgroundUploadRef.current.value = '';
    }
  };

  const setAdjustment = (key: AdjustmentKey, value: number) => {
    setAdjustments((a) => {
      const next = { ...a, [key]: value };
      adjustmentsRef.current = next;
      return next;
    });
  };

  const handleSave = async () => {
    const currentImage = imageRef.current;
    if (!currentImage) return;
    setSaving(true);
    setError(null);
    try {
      const canvas = renderEditedPhoto(
        currentImage,
        cropRef.current,
        adjustmentsRef.current,
      );
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
    <div className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-sm">
      <div
        className="bg-card border border-border rounded-3xl shadow-2xl w-full max-w-xl max-h-[94vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3.5 border-b border-border flex items-center justify-between shrink-0">
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
        ) : error && !image ? (
          <div className="text-center py-12 text-red-600 text-sm font-medium flex-1 px-5">{error}</div>
        ) : image ? (
          <>
            {error ? (
              <div className="px-5 pt-3 text-xs font-medium text-red-600">{error}</div>
            ) : null}
            <div className="shrink-0 px-5 pt-4 pb-3 border-b border-border bg-card flex justify-center">
              <div
                className="relative rounded-xl overflow-hidden border border-border bg-black shadow-inner"
                style={{ width: PREVIEW_DISPLAY_PX, height: PREVIEW_DISPLAY_PX }}
              >
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

            <div className="shrink-0 px-5 pt-3 pb-1">
              <div className="flex p-0.5 rounded-lg bg-muted/60 border border-border">
                <button
                  type="button"
                  onClick={() => setActiveTab('bg')}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1 py-2 rounded-md text-[9px] font-black uppercase tracking-wider transition-all',
                    activeTab === 'bg'
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Eraser className="h-3.5 w-3.5 shrink-0" />
                  BG remove
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('crop')}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1 py-2 rounded-md text-[9px] font-black uppercase tracking-wider transition-all',
                    activeTab === 'crop'
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Crop className="h-3.5 w-3.5 shrink-0" />
                  Crop
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('color')}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1 py-2 rounded-md text-[9px] font-black uppercase tracking-wider transition-all',
                    activeTab === 'color'
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Palette className="h-3.5 w-3.5 shrink-0" />
                  Adjust
                </button>
              </div>
            </div>

            <div className="shrink-0 px-5 py-3 max-h-[36vh] overflow-y-auto">
              {activeTab === 'bg' ? (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Remove the background on this device. The original upload stays saved. First run may take a moment while the model loads.
                  </p>
                  <button
                    type="button"
                    onClick={() => void handleRemoveBackground()}
                    disabled={removingBg || saving || applyingSolidBg || applyingImageBg}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold border border-primary/30 bg-primary/10 text-primary hover:bg-primary/15 disabled:opacity-50"
                  >
                    {removingBg ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eraser className="h-4 w-4" />}
                    {removingBg ? (bgProgress || 'Processing…') : bgRemoved ? 'Run BG remove again' : 'Remove background'}
                  </button>
                  <div className="space-y-2 pt-1">
                    <p className="text-[11px] text-muted-foreground font-medium">Solid background color</p>
                    <div className="flex items-center gap-2">
                      <div className="grid grid-cols-7 gap-2 flex-1">
                        {SOLID_COLORS.map((color) => (
                          <button
                            key={color}
                            type="button"
                            onClick={() => void handleApplySolidBackground(color)}
                            disabled={applyingSolidBg || removingBg || saving}
                            className={cn(
                              'h-8 rounded-lg border transition-all',
                              selectedSolidColor === color ? 'border-primary ring-2 ring-primary/30' : 'border-border',
                            )}
                            style={{ backgroundColor: color }}
                            title={color}
                          />
                        ))}
                      </div>
                      <input
                        type="color"
                        value={selectedSolidColor}
                        onChange={(e) => void handleApplySolidBackground(e.target.value)}
                        disabled={applyingSolidBg || removingBg || saving}
                        className="h-8 w-8 rounded-md border border-border bg-transparent p-0.5 cursor-pointer disabled:opacity-50"
                        title="Custom color"
                      />
                    </div>
                    {applyingSolidBg ? (
                      <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Applying color...
                      </div>
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    <p className="text-[11px] text-muted-foreground font-medium">Upload custom background image</p>
                    <input
                      ref={backgroundUploadRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => void handleUploadBackground(e.target.files?.[0])}
                    />
                    <button
                      type="button"
                      onClick={() => backgroundUploadRef.current?.click()}
                      disabled={applyingImageBg || saving || removingBg || applyingSolidBg}
                      className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold border border-border hover:bg-muted disabled:opacity-50"
                    >
                      {applyingImageBg ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                      Upload background
                    </button>
                  </div>
                  {bgRemoved && (
                    <button
                      type="button"
                      onClick={resetAll}
                      className="w-full py-2 rounded-xl text-xs font-bold border border-border hover:bg-muted"
                    >
                      Restore original
                    </button>
                  )}
                </div>
              ) : activeTab === 'crop' ? (
                <AdjustmentSlider
                  label="Zoom"
                  icon={<Crop className="h-3.5 w-3.5" />}
                  value={Math.round((crop.zoom - 1) * 100)}
                  min={0}
                  max={150}
                  onChange={onZoomChange}
                />
              ) : activeTab === 'color' ? (
                <div className="space-y-3.5 pb-1">
                  <div className="flex items-center gap-2 text-foreground">
                    <SlidersHorizontal className="h-3.5 w-3.5 text-primary" />
                    <h5 className="text-[12px] font-semibold">Adjust</h5>
                  </div>
                  {ADJUST_CONTROLS.map(({ key, label, min, max }) => (
                    <AdjustmentSlider
                      key={key}
                      label={label}
                      value={adjustments[key]}
                      min={min}
                      max={max}
                      onChange={(v) => setAdjustment(key, v)}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          </>
        ) : null}

        <div className="px-5 py-4 border-t border-border flex flex-wrap gap-2 justify-end bg-muted/30 shrink-0">
          {hasBackup ? (
            <button
              type="button"
              onClick={restoreFromBackup}
              disabled={loading || saving}
              className="px-3 py-2 rounded-xl text-xs font-bold border border-border hover:bg-muted disabled:opacity-50"
            >
              Use original backup
            </button>
          ) : null}
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
