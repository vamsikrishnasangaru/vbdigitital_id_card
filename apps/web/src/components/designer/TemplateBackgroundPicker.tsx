'use client';

import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import {
  type TemplateBackground,
  type BackgroundMode,
  type GradientBackground,
  backgroundPreviewStyle,
  getDefaultBackground,
} from '@/lib/background-utils';
import { Camera, Upload, Palette, Layers } from 'lucide-react';

const GRADIENT_PRESETS: GradientBackground[] = [
  { angle: 135, colorStart: '#1e40af', colorEnd: '#7c3aed' },
  { angle: 90, colorStart: '#0ea5e9', colorEnd: '#22d3ee' },
  { angle: 180, colorStart: '#059669', colorEnd: '#10b981' },
  { angle: 45, colorStart: '#dc2626', colorEnd: '#f97316' },
  { angle: 135, colorStart: '#1e293b', colorEnd: '#475569' },
];

interface TemplateBackgroundPickerProps {
  orientation: 'HORIZONTAL' | 'VERTICAL';
  value: TemplateBackground;
  onChange: (bg: TemplateBackground) => void;
  onImageFile: (file: File) => void;
  imageFileName?: string;
  onClearImage: () => void;
}

export function TemplateBackgroundPicker({
  orientation,
  value,
  onChange,
  onImageFile,
  imageFileName,
  onClearImage,
}: TemplateBackgroundPickerProps) {
  const setMode = (mode: BackgroundMode) => {
    if (mode === 'image') onChange({ mode: 'image', imageUrl: value.imageUrl });
    if (mode === 'solid') onChange({ mode: 'solid', solidColor: value.solidColor || '#1e40af' });
    if (mode === 'gradient') {
      onChange({
        mode: 'gradient',
        gradient: value.gradient || GRADIENT_PRESETS[0],
      });
    }
  };

  const previewUrl =
    value.mode === 'image' && value.imageUrl
      ? value.imageUrl.startsWith('blob:') ||
          value.imageUrl.startsWith('data:') ||
          value.imageUrl.startsWith('http')
        ? value.imageUrl
        : undefined
      : undefined;

  const previewStyle: CSSProperties =
    value.mode === 'image' && previewUrl
      ? {
          aspectRatio: orientation === 'VERTICAL' ? '1 / 1.58' : '1.58 / 1',
          width: '100%',
          backgroundImage: `url(${previewUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }
      : backgroundPreviewStyle(value, orientation);

  return (
    <div className="space-y-4">
      <div className="flex p-1 bg-muted rounded-xl gap-1">
        {(
          [
            { id: 'image' as const, label: 'Image', icon: Camera },
            { id: 'solid' as const, label: 'Solid', icon: Palette },
            { id: 'gradient' as const, label: 'Gradient', icon: Layers },
          ] as const
        ).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setMode(id)}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all',
              value.mode === id
                ? 'bg-primary text-primary-foreground shadow-md'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      <div
        className={cn(
          'relative rounded-2xl border-2 overflow-hidden min-h-[160px]',
          value.mode !== 'image' || previewUrl
            ? 'border-primary/30 ring-2 ring-primary/10'
            : 'border-dashed border-border',
          orientation === 'VERTICAL' ? 'aspect-[1/1.58] max-h-[320px]' : 'aspect-[1.58/1] max-h-[240px]',
        )}
        style={previewStyle}
      >
        {value.mode === 'image' && !previewUrl && (
          <label className="absolute inset-0 flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-primary/5 transition-colors">
            <Camera className="h-10 w-10 text-muted-foreground/40" />
            <span className="text-xs font-bold text-muted-foreground uppercase">Upload image</span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onImageFile(file);
                e.target.value = '';
              }}
            />
          </label>
        )}
      </div>

      {value.mode === 'image' && (
        <div className="space-y-2">
          {imageFileName && (
            <p className="text-xs text-muted-foreground">
              Selected: <span className="font-bold text-foreground">{imageFileName}</span>
            </p>
          )}
          <div className="flex gap-2">
            <label className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border bg-card text-xs font-bold cursor-pointer hover:border-primary/40">
              <Upload className="h-4 w-4 text-primary" />
              Choose image
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onImageFile(file);
                  e.target.value = '';
                }}
              />
            </label>
            {previewUrl && (
              <button
                type="button"
                onClick={onClearImage}
                className="px-4 py-2 rounded-xl border border-border text-xs font-bold hover:bg-muted"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      {value.mode === 'solid' && (
        <div className="space-y-3">
          <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            Solid color
          </label>
          <div className="flex gap-3 items-center">
            <input
              type="color"
              value={value.solidColor || '#1e40af'}
              onChange={(e) => onChange({ mode: 'solid', solidColor: e.target.value })}
              className="h-12 w-14 rounded-xl border border-border cursor-pointer bg-transparent"
            />
            <input
              type="text"
              value={value.solidColor || '#1e40af'}
              onChange={(e) => onChange({ mode: 'solid', solidColor: e.target.value })}
              className="flex-1 px-4 py-3 rounded-xl border border-border bg-card text-sm font-mono font-bold"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {['#1e40af', '#059669', '#dc2626', '#7c3aed', '#0f172a', '#ffffff', '#fbbf24'].map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => onChange({ mode: 'solid', solidColor: c })}
                className="h-8 w-8 rounded-lg border-2 border-border hover:scale-110 transition-transform"
                style={{ backgroundColor: c }}
                title={c}
              />
            ))}
          </div>
        </div>
      )}

      {value.mode === 'gradient' && value.gradient && (
        <div className="space-y-3">
          <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            Gradient presets
          </label>
          <div className="grid grid-cols-5 gap-2">
            {GRADIENT_PRESETS.map((preset, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onChange({ mode: 'gradient', gradient: preset })}
                className="h-10 rounded-lg border-2 border-border hover:border-primary/50 transition-all"
                style={{
                  background: `linear-gradient(${preset.angle}deg, ${preset.colorStart}, ${preset.colorEnd})`,
                }}
              />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground uppercase">Start color</label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={value.gradient.colorStart}
                  onChange={(e) =>
                    onChange({
                      mode: 'gradient',
                      gradient: { ...value.gradient!, colorStart: e.target.value },
                    })
                  }
                  className="h-10 w-12 rounded-lg border border-border cursor-pointer"
                />
                <input
                  type="text"
                  value={value.gradient.colorStart}
                  onChange={(e) =>
                    onChange({
                      mode: 'gradient',
                      gradient: { ...value.gradient!, colorStart: e.target.value },
                    })
                  }
                  className="flex-1 px-2 py-1.5 rounded-lg border border-border bg-card text-xs font-mono"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground uppercase">End color</label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={value.gradient.colorEnd}
                  onChange={(e) =>
                    onChange({
                      mode: 'gradient',
                      gradient: { ...value.gradient!, colorEnd: e.target.value },
                    })
                  }
                  className="h-10 w-12 rounded-lg border border-border cursor-pointer"
                />
                <input
                  type="text"
                  value={value.gradient.colorEnd}
                  onChange={(e) =>
                    onChange({
                      mode: 'gradient',
                      gradient: { ...value.gradient!, colorEnd: e.target.value },
                    })
                  }
                  className="flex-1 px-2 py-1.5 rounded-lg border border-border bg-card text-xs font-mono"
                />
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-muted-foreground uppercase">
              Angle: {value.gradient.angle}°
            </label>
            <input
              type="range"
              min={0}
              max={360}
              value={value.gradient.angle}
              onChange={(e) =>
                onChange({
                  mode: 'gradient',
                  gradient: { ...value.gradient!, angle: Number(e.target.value) },
                })
              }
              className="w-full accent-primary"
            />
          </div>
        </div>
      )}
    </div>
  );
}

export function createEmptyBackground(): TemplateBackground {
  return getDefaultBackground();
}
