'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Loader2,
  RotateCcw,
  X,
  Crop,
  SlidersHorizontal,
  Sparkles,
  Wand2,
  Sun,
  CircleDot,
  Contrast,
  SunDim,
  Moon,
  Pipette,
  Thermometer,
  Droplet,
  Gem,
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
  hasPhotoAdjustments,
} from '@/lib/photo-editor-utils';
import { compressImageForUpload, STUDENT_PHOTO_UPLOAD_OPTS } from '@/lib/compress-image';
import {
  PHOTO_FILTER_PRESETS,
  blendPhotoAdjustments,
  buildFilterThumbnails,
  computeAutoEnhanceAdjustments,
  DEFAULT_FILTER_INTENSITY,
  type PhotoFilterId,
} from '@/lib/photo-editor-filters';

interface StudentPhotoEditorProps {
  open: boolean;
  source: string | File | null;
  onClose: () => void;
  onSave: (file: File, previewUrl: string) => void;
}

type EditorTab = 'crop' | 'adjust' | 'filters';
type AdjustmentKey = keyof PhotoAdjustments;
type ActiveFilter = PhotoFilterId | 'auto' | null;

/** CSS display size of the crop canvas (internal canvas is PHOTO_EDITOR_VIEWPORT). */
const PREVIEW_DISPLAY_PX = 152;
const PREVIEW_DRAG_SCALE = PHOTO_EDITOR_VIEWPORT / PREVIEW_DISPLAY_PX;

const LIGHT_CONTROLS: { key: AdjustmentKey; label: string; icon: ReactNode }[] = [
  { key: 'brightness', label: 'Brightness', icon: <Sun className="h-3.5 w-3.5" /> },
  { key: 'exposure', label: 'Exposure', icon: <CircleDot className="h-3.5 w-3.5" /> },
  { key: 'contrast', label: 'Contrast', icon: <Contrast className="h-3.5 w-3.5" /> },
  { key: 'highlights', label: 'Highlights', icon: <SunDim className="h-3.5 w-3.5" /> },
  { key: 'shadows', label: 'Shadows', icon: <Moon className="h-3.5 w-3.5" /> },
];

const COLOR_CONTROLS: { key: AdjustmentKey; label: string; icon: ReactNode }[] = [
  { key: 'saturation', label: 'Saturation', icon: <Pipette className="h-3.5 w-3.5" /> },
  { key: 'warmth', label: 'Warmth', icon: <Thermometer className="h-3.5 w-3.5" /> },
  { key: 'tint', label: 'Tint', icon: <Droplet className="h-3.5 w-3.5" /> },
  { key: 'sharpness', label: 'Sharpness', icon: <Gem className="h-3.5 w-3.5" /> },
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
  icon: ReactNode;
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 text-foreground">
          <span className="text-muted-foreground shrink-0">{icon}</span>
          <span className="text-[11px] font-medium truncate">{label}</span>
        </div>
        <span className="text-[11px] tabular-nums text-muted-foreground shrink-0">{value}</span>
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

function AdjustmentSection({
  title,
  controls,
  adjustments,
  onChange,
}: {
  title: string;
  controls: { key: AdjustmentKey; label: string; icon: ReactNode }[];
  adjustments: PhotoAdjustments;
  onChange: (key: AdjustmentKey, value: number) => void;
}) {
  return (
    <div className="space-y-2.5">
      <h5 className="text-[11px] font-semibold text-foreground">{title}</h5>
      <div className="space-y-3">
        {controls.map(({ key, label, icon }) => (
          <AdjustmentSlider
            key={key}
            label={label}
            icon={icon}
            value={adjustments[key]}
            onChange={(v) => onChange(key, v)}
          />
        ))}
      </div>
    </div>
  );
}

function FilterThumbnail({
  name,
  previewUrl,
  selected,
  onClick,
}: {
  name: string;
  previewUrl?: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-col items-center gap-1 rounded-lg p-0.5 transition-all',
        selected ? 'ring-2 ring-primary' : 'opacity-90 hover:opacity-100',
      )}
    >
      <div className="relative w-full aspect-square rounded-md overflow-hidden border border-border/70 bg-muted">
        {previewUrl ? (
          <img src={previewUrl} alt="" className="w-full h-full object-cover" draggable={false} />
        ) : (
          <div className="w-full h-full animate-pulse bg-muted" />
        )}
      </div>
      <span
        className={cn(
          'text-[9px] font-semibold text-center leading-tight px-0.5 truncate w-full',
          selected ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        {name}
      </span>
    </button>
  );
}

function IntensitySlider({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <div className="space-y-1 pt-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-foreground">Intensity</span>
        <span className="text-[11px] tabular-nums text-muted-foreground">{value}</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onInput={(e) => onChange(Number(e.currentTarget.value))}
        className="w-full accent-primary h-1 cursor-pointer"
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
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>(null);
  const [filterIntensity, setFilterIntensity] = useState(DEFAULT_FILTER_INTENSITY);
  const [filterBaseAdjustments, setFilterBaseAdjustments] = useState<PhotoAdjustments | null>(null);
  const [filterThumbnails, setFilterThumbnails] = useState<Record<string, string>>({});
  const [autoEnhancing, setAutoEnhancing] = useState(false);
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
      setActiveFilter(null);
      setFilterIntensity(DEFAULT_FILTER_INTENSITY);
      setFilterBaseAdjustments(null);
      setFilterThumbnails({});
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
        setActiveFilter(null);
        setFilterIntensity(DEFAULT_FILTER_INTENSITY);
        setFilterBaseAdjustments(null);
        setFilterThumbnails({});
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

  useEffect(() => {
    if (!image || !open) {
      setFilterThumbnails({});
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      requestAnimationFrame(() => {
        if (cancelled || !image) return;
        setFilterThumbnails(buildFilterThumbnails(image, crop));
      });
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [image, crop, open]);

  const applyFilterAtIntensity = useCallback(
    (base: PhotoAdjustments, intensity: number) => {
      setAdjustments(blendPhotoAdjustments(DEFAULT_PHOTO_ADJUSTMENTS, base, intensity));
    },
    [],
  );

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
    setActiveFilter(null);
    setFilterIntensity(DEFAULT_FILTER_INTENSITY);
    setFilterBaseAdjustments(null);
  };

  const applyFilter = (filterId: PhotoFilterId) => {
    const preset = PHOTO_FILTER_PRESETS.find((f) => f.id === filterId);
    if (!preset) return;
    const intensity = DEFAULT_FILTER_INTENSITY;
    setFilterBaseAdjustments(preset.adjustments);
    setFilterIntensity(intensity);
    setActiveFilter(filterId);
    applyFilterAtIntensity(preset.adjustments, intensity);
  };

  const applyAutoEnhance = () => {
    if (!image) return;
    setAutoEnhancing(true);
    requestAnimationFrame(() => {
      const enhanced = computeAutoEnhanceAdjustments(image, crop);
      setFilterBaseAdjustments(enhanced);
      setFilterIntensity(100);
      setActiveFilter('auto');
      applyFilterAtIntensity(enhanced, 100);
      setAutoEnhancing(false);
    });
  };

  const clearFilter = () => {
    setAdjustments(DEFAULT_PHOTO_ADJUSTMENTS);
    setActiveFilter(null);
    setFilterBaseAdjustments(null);
    setFilterIntensity(DEFAULT_FILTER_INTENSITY);
  };

  const onFilterIntensityChange = (intensity: number) => {
    if (!filterBaseAdjustments) return;
    setFilterIntensity(intensity);
    applyFilterAtIntensity(filterBaseAdjustments, intensity);
  };

  const setAdjustment = (key: AdjustmentKey, value: number) => {
    setAdjustments((a) => ({ ...a, [key]: value }));
    setActiveFilter(null);
    setFilterBaseAdjustments(null);
    setFilterIntensity(DEFAULT_FILTER_INTENSITY);
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
                  onClick={() => setActiveTab('adjust')}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1 py-2 rounded-md text-[9px] font-black uppercase tracking-wider transition-all',
                    activeTab === 'adjust'
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" />
                  Color
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('filters')}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1 py-2 rounded-md text-[9px] font-black uppercase tracking-wider transition-all',
                    activeTab === 'filters'
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Sparkles className="h-3.5 w-3.5 shrink-0" />
                  Filters
                </button>
              </div>
            </div>

            <div className="shrink-0 px-4 py-2 max-h-[38vh] overflow-y-auto">
              {activeTab === 'crop' ? (
                <AdjustmentSlider
                  label="Zoom"
                  icon={<Crop className="h-3.5 w-3.5" />}
                  value={Math.round((crop.zoom - 1) * 100)}
                  min={0}
                  max={150}
                  onChange={onZoomChange}
                />
              ) : activeTab === 'adjust' ? (
                <div className="space-y-5 pb-1">
                  <AdjustmentSection
                    title="Light"
                    controls={LIGHT_CONTROLS}
                    adjustments={adjustments}
                    onChange={setAdjustment}
                  />
                  <AdjustmentSection
                    title="Color"
                    controls={COLOR_CONTROLS}
                    adjustments={adjustments}
                    onChange={setAdjustment}
                  />
                </div>
              ) : (
                <div className="space-y-3 pb-1">
                  <button
                    type="button"
                    onClick={applyAutoEnhance}
                    disabled={autoEnhancing}
                    className={cn(
                      'w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold border transition-all',
                      activeFilter === 'auto'
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-muted/40 hover:bg-muted text-foreground',
                    )}
                  >
                    {autoEnhancing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Wand2 className="h-4 w-4" />
                    )}
                    Auto Enhance
                  </button>

                  <div className="grid grid-cols-3 gap-2">
                    <FilterThumbnail
                      name="Original"
                      previewUrl={filterThumbnails.original}
                      selected={activeFilter === null && !hasPhotoAdjustments(adjustments)}
                      onClick={clearFilter}
                    />
                    {PHOTO_FILTER_PRESETS.map((filter) => (
                      <FilterThumbnail
                        key={filter.id}
                        name={filter.name}
                        previewUrl={filterThumbnails[filter.id]}
                        selected={activeFilter === filter.id}
                        onClick={() => applyFilter(filter.id)}
                      />
                    ))}
                  </div>

                  {activeFilter !== null && filterBaseAdjustments ? (
                    <IntensitySlider value={filterIntensity} onChange={onFilterIntensityChange} />
                  ) : null}
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
