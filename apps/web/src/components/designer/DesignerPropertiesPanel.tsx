'use client';

import { Crop, Trash2, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DesignerElement, PhotoFit } from '@/lib/designer-utils';
import {
  getCardSize,
  getDragClampSize,
  getElementSize,
  getSquarePhotoSize,
} from '@/lib/designer-utils';
import { FONT_FAMILIES, PHOTO_SHAPES, BORDER_STYLES, DEFAULT_COLOR_ADJUST } from './designer-constants';

const DEFAULT_FRAME_GRADIENT = {
  angle: 135,
  colorStart: '#e2e8f0',
  colorEnd: '#94a3b8',
};

interface DesignerPropertiesPanelProps {
  selected: DesignerElement | null;
  onUpdate: (patch: Partial<DesignerElement>) => void;
  onRemove: () => void;
  onOpenCrop: () => void;
  onCenterOnCard?: () => void;
  onReplaceAsset?: (kind: 'schoolLogo' | 'schoolSignature') => void;
  onUploadFramePhoto?: () => void;
  orientation?: 'HORIZONTAL' | 'VERTICAL';
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="text-[10px] font-bold text-white/40 uppercase">{children}</label>;
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-primary ${props.className || ''}`}
    />
  );
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-primary ${props.className || ''}`}
    />
  );
}

function numInputValue(value?: number | null): string {
  if (value == null || Number.isNaN(value)) return '';
  return String(Math.round(value));
}

function parseNumInput(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (trimmed === '') return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

function borderWidthInputValue(el: DesignerElement): string {
  return numInputValue(el.borderWidth);
}

function borderWidthPatch(width: number | undefined): Partial<DesignerElement> {
  if (width === undefined) return { borderWidth: undefined };
  if (width <= 0) {
    return { borderWidth: undefined, borderColor: undefined, borderStyle: undefined };
  }
  return { borderWidth: width };
}

function strokeWidthPatch(width: number | undefined): Partial<DesignerElement> {
  if (width === undefined) return { strokeWidth: undefined };
  if (width <= 0) return { strokeWidth: undefined, stroke: undefined };
  return { strokeWidth: width };
}

function borderStyleSelectValue(el: DesignerElement): string {
  if (!el.borderColor?.trim() || el.borderWidth == null || el.borderWidth <= 0) return 'none';
  return el.borderStyle ?? 'solid';
}

function borderStylePatch(style: string): Partial<DesignerElement> {
  if (style === 'none') {
    return { borderColor: undefined, borderWidth: undefined, borderStyle: undefined };
  }
  return { borderStyle: style as DesignerElement['borderStyle'] };
}

const FONT_STYLE_OPTIONS: {
  value: DesignerElement['fontStyle'] | '';
  label: string;
  previewClass: string;
}[] = [
  { value: '', label: 'Regular', previewClass: 'font-normal not-italic' },
  { value: 'bold', label: 'Bold', previewClass: 'font-bold not-italic' },
  { value: 'italic', label: 'Italic', previewClass: 'font-normal italic' },
  { value: 'bold italic', label: 'Bold Italic', previewClass: 'font-bold italic' },
];

function FontStylePicker({
  value,
  onChange,
}: {
  value: DesignerElement['fontStyle'] | undefined;
  onChange: (style: DesignerElement['fontStyle'] | undefined) => void;
}) {
  const current = value ?? '';
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {FONT_STYLE_OPTIONS.map((opt) => (
        <button
          key={opt.label}
          type="button"
          onClick={() => onChange(opt.value || undefined)}
          className={cn(
            'rounded-lg border px-2 py-2 text-xs text-white transition-colors',
            opt.previewClass,
            current === opt.value
              ? 'border-primary bg-primary/15 text-white'
              : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function BorderStyleSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (patch: Partial<DesignerElement>) => void;
}) {
  return (
    <Select value={value} onChange={(e) => onChange(borderStylePatch(e.target.value))}>
      <option value="none" className="bg-zinc-900">None — border remove</option>
      {BORDER_STYLES.map((b) => (
        <option key={b.id} value={b.id} className="bg-zinc-900">{b.label}</option>
      ))}
    </Select>
  );
}

function SizeRow({
  label,
  width,
  height,
  onWidth,
  onHeight,
}: {
  label: string;
  width?: number;
  height?: number;
  onWidth: (v: number | undefined) => void;
  onHeight: (v: number | undefined) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label} size (px)</Label>
      <div className="grid grid-cols-2 gap-2">
        <Input
          type="number"
          min={4}
          placeholder="Width"
          value={numInputValue(width)}
          onChange={(e) => onWidth(parseNumInput(e.target.value))}
        />
        <Input
          type="number"
          min={4}
          placeholder="Height"
          value={numInputValue(height)}
          onChange={(e) => onHeight(parseNumInput(e.target.value))}
        />
      </div>
    </div>
  );
}

function RangeBar({
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
  const safeMax = Math.max(min, max);
  const clamped = Math.max(min, Math.min(safeMax, value));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label>{label}</Label>
        <span className="text-[10px] font-bold tabular-nums text-white/55">{clamped} px</span>
      </div>
      <input
        type="range"
        min={min}
        max={safeMax}
        step={1}
        value={clamped}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-2 rounded-full appearance-none cursor-pointer bg-white/10 accent-primary [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-md"
      />
      <div className="flex justify-between text-[9px] text-white/25 tabular-nums">
        <span>{min}</span>
        <span>{safeMax}</span>
      </div>
    </div>
  );
}

function CornerRadiusControl({
  label,
  value,
  max,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  onChange: (v: number) => void;
}) {
  const safeMax = Math.max(0, max);
  const clamped = Math.max(0, Math.min(safeMax, value));

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label>{label}</Label>
        <span className="text-[10px] font-bold tabular-nums text-white/55">{clamped}px</span>
      </div>
      <div className="flex gap-2 items-center">
        <input
          type="range"
          min={0}
          max={safeMax}
          step={1}
          value={clamped}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 h-2 rounded-full appearance-none cursor-pointer bg-white/10 accent-primary [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
        />
        <Input
          type="number"
          min={0}
          max={safeMax}
          className="w-[4.5rem] shrink-0 px-2"
          value={clamped}
          onChange={(e) => {
            const n = parseNumInput(e.target.value);
            if (n != null) onChange(Math.max(0, Math.min(safeMax, n)));
          }}
        />
      </div>
    </div>
  );
}

function PositionControls({
  selected,
  orientation,
  onUpdate,
}: {
  selected: DesignerElement;
  orientation: 'HORIZONTAL' | 'VERTICAL';
  onUpdate: (patch: Partial<DesignerElement>) => void;
}) {
  const { width: cardW, height: cardH } = getCardSize(orientation);
  const clampSize = getDragClampSize(selected, orientation);

  const maxX = clampSize.anchorOnly ? cardW : Math.max(0, Math.round(cardW - clampSize.width));
  const maxY = clampSize.anchorOnly ? cardH : Math.max(0, Math.round(cardH - clampSize.height));
  const x = Math.round(Math.max(0, Math.min(maxX, selected.x)));
  const y = Math.round(Math.max(0, Math.min(maxY, selected.y)));

  const nudge = (dx: number, dy: number) => {
    onUpdate({
      x: Math.max(0, Math.min(maxX, x + dx)),
      y: Math.max(0, Math.min(maxY, y + dy)),
    });
  };

  return (
    <div className="space-y-4 pt-2 border-t border-white/10">
      <p className="text-[10px] font-bold text-white/40 uppercase tracking-wider">Position</p>
      <p className="text-[9px] text-white/25 -mt-2">
        Sliders, arrow keys (↑↓←→, Shift = 8px), or type values below
      </p>

      <RangeBar label="Left ↔ Right (X)" value={x} min={0} max={maxX} onChange={(v) => onUpdate({ x: v })} />
      <RangeBar label="Top ↕ Bottom (Y)" value={y} min={0} max={maxY} onChange={(v) => onUpdate({ y: v })} />

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label>X</Label>
          <Input
            type="number"
            min={0}
            max={maxX}
            value={x}
            onChange={(e) => {
              const n = parseNumInput(e.target.value);
              if (n != null) onUpdate({ x: Math.max(0, Math.min(maxX, n)) });
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Y</Label>
          <Input
            type="number"
            min={0}
            max={maxY}
            value={y}
            onChange={(e) => {
              const n = parseNumInput(e.target.value);
              if (n != null) onUpdate({ y: Math.max(0, Math.min(maxY, n)) });
            }}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Fine nudge (or keyboard)</Label>
        <p className="text-[9px] text-white/25">Focus the canvas, then ↑ ↓ ← → · hold Shift for 8px steps</p>
        <div className="grid grid-cols-3 gap-1 w-fit mx-auto">
          <span />
          <button
            type="button"
            onClick={() => nudge(0, -1)}
            className="h-8 w-8 rounded-lg bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 text-sm"
            title="Move up 1px"
          >
            ↑
          </button>
          <span />
          <button
            type="button"
            onClick={() => nudge(-1, 0)}
            className="h-8 w-8 rounded-lg bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 text-sm"
            title="Move left 1px"
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => nudge(0, 1)}
            className="h-8 w-8 rounded-lg bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 text-sm"
            title="Move down 1px"
          >
            ↓
          </button>
          <button
            type="button"
            onClick={() => nudge(1, 0)}
            className="h-8 w-8 rounded-lg bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 text-sm"
            title="Move right 1px"
          >
            →
          </button>
        </div>
      </div>
    </div>
  );
}

function colorPatchWithBorder(
  color: string | undefined,
  currentWidth?: number | null,
): Partial<DesignerElement> {
  if (!color) return { borderColor: undefined, borderWidth: undefined, borderStyle: undefined };
  const patch: Partial<DesignerElement> = { borderColor: color };
  if (currentWidth == null || currentWidth <= 0) {
    patch.borderWidth = 2;
    patch.borderStyle = 'solid';
  }
  return patch;
}

function colorPatchWithStroke(color: string | undefined): Partial<DesignerElement> {
  if (!color) return { stroke: undefined, strokeWidth: undefined };
  return { stroke: color };
}

function ColorRow({
  label,
  value,
  onChange,
  placeholder = '#000000',
}: {
  label: string;
  value: string;
  onChange: (v: string | undefined) => void;
  placeholder?: string;
}) {
  const pickerValue = value && /^#[0-9a-fA-F]{6}$/i.test(value) ? value : placeholder;
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <input
          type="color"
          className="h-8 w-12 bg-transparent border-none cursor-pointer shrink-0"
          value={pickerValue}
          onChange={(e) => onChange(e.target.value)}
        />
        <Input
          value={value}
          placeholder={placeholder}
          onChange={(e) => {
            const v = e.target.value.trim();
            onChange(v === '' ? undefined : v);
          }}
        />
      </div>
    </div>
  );
}

export function DesignerPropertiesPanel({
  selected,
  onUpdate,
  onRemove,
  onOpenCrop,
  onCenterOnCard,
  onReplaceAsset,
  onUploadFramePhoto,
  orientation = 'HORIZONTAL',
}: DesignerPropertiesPanelProps) {
  if (!selected) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-6">
        <p className="text-[11px] font-bold text-white/40 uppercase tracking-widest">No selection</p>
        <p className="text-[10px] text-white/20 mt-2">Click an element to edit fonts, colors, sizes and borders</p>
      </div>
    );
  }

  const isText = selected.type === 'text';
  const isCustomFrame = selected.type === 'customPhotoFrame';
  const isSignature = selected.fieldType === 'schoolSignature';
  const isLogo = selected.fieldType === 'schoolLogo';
  const mediaLabel = isSignature ? 'Signature' : isLogo ? 'Logo' : 'Photo';
  const isMedia =
    !isCustomFrame &&
    (selected.type === 'photo' || selected.type === 'image' || isSignature || isLogo);
  const isBox = selected.type === 'qr' || selected.type === 'barcode';
  const isShape = selected.type === 'shape';
  const adjust = { ...DEFAULT_COLOR_ADJUST, ...selected.colorAdjust };
  const photoFit: PhotoFit = selected.photoFit ?? { zoom: 1, offsetX: 0, offsetY: 0 };
  const frameShadow = selected.frameShadow ?? {};
  const cornerMax = Math.max(
    0,
    Math.floor(Math.min(selected.width ?? 140, selected.height ?? 180) / 2),
  );

  const patchPhotoFit = (patch: Partial<PhotoFit>) =>
    onUpdate({ photoFit: { ...photoFit, ...patch } });

  const patchFrameShadow = (patch: Partial<NonNullable<DesignerElement['frameShadow']>>) =>
    onUpdate({ frameShadow: { ...frameShadow, ...patch } });

  return (
    <div className="space-y-5 px-2 pb-8">
      <div className="flex items-center justify-between">
        <h4 className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Edit room</h4>
        <button type="button" onClick={onRemove} className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {isText && (
        <>
          <div className="space-y-1.5">
            <Label>Text</Label>
            <Input value={selected.text || ''} onChange={(e) => onUpdate({ text: e.target.value })} disabled={!!selected.fieldType && selected.fieldType !== 'custom'} />
          </div>
          <div className="space-y-1.5">
            <Label>Font family</Label>
            <Select
              value={selected.fontFamily ?? ''}
              onChange={(e) => onUpdate({ fontFamily: e.target.value || undefined })}
            >
              <option value="" className="bg-zinc-900">Default</option>
              {FONT_FAMILIES.map((f) => (
                <option key={f} value={f} className="bg-zinc-900">{f}</option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>Font size</Label>
              <Input
                type="number"
                min={6}
                max={72}
                placeholder="Size"
                value={numInputValue(selected.fontSize)}
                onChange={(e) => onUpdate({ fontSize: parseNumInput(e.target.value) })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Style</Label>
              <FontStylePicker
                value={selected.fontStyle}
                onChange={(fontStyle) => onUpdate({ fontStyle })}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Decoration</Label>
            <Select value={selected.textDecoration || ''} onChange={(e) => onUpdate({ textDecoration: e.target.value as DesignerElement['textDecoration'] })}>
              <option value="" className="bg-zinc-900">None</option>
              <option value="underline" className="bg-zinc-900">Underline</option>
              <option value="line-through" className="bg-zinc-900">Strikethrough</option>
            </Select>
          </div>
          <ColorRow label="Text color" value={selected.fill ?? ''} onChange={(v) => onUpdate({ fill: v })} />
          <ColorRow
            label="Text stroke"
            value={selected.stroke ?? ''}
            onChange={(v) => onUpdate(colorPatchWithStroke(v))}
          />
          <div className="space-y-1.5">
            <Label>Text box width (px)</Label>
            <p className="text-[9px] text-white/25">Optional — long names shrink to fit on one line inside this width</p>
            <Input
              type="number"
              min={20}
              max={400}
              placeholder="Auto"
              value={numInputValue(selected.width)}
              onChange={(e) => onUpdate({ width: parseNumInput(e.target.value) })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Stroke width</Label>
            <Input
              type="number"
              min={0}
              max={10}
              step={0.5}
              placeholder="Width"
              value={numInputValue(selected.strokeWidth)}
              onChange={(e) => onUpdate(strokeWidthPatch(parseNumInput(e.target.value)))}
            />
          </div>
          <ColorRow
            label="Border color"
            value={selected.borderColor ?? ''}
            onChange={(v) => onUpdate(colorPatchWithBorder(v, selected.borderWidth))}
          />
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>Border width</Label>
              <Input
                type="number"
                min={0}
                max={20}
                placeholder="Width"
                value={borderWidthInputValue(selected)}
                onChange={(e) => onUpdate(borderWidthPatch(parseNumInput(e.target.value)))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Border style</Label>
              <BorderStyleSelect
                value={borderStyleSelectValue(selected)}
                onChange={onUpdate}
              />
            </div>
          </div>
        </>
      )}

      {isCustomFrame && (
        <>
          <p className="text-[10px] font-bold text-white/40 uppercase tracking-wider">Photo settings</p>
          {onUploadFramePhoto && (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onUploadFramePhoto}
                className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-primary/30 bg-primary/10 text-[11px] font-bold text-primary hover:bg-primary/20"
              >
                <Upload className="h-3.5 w-3.5" />
                {selected.imageUrl ? 'Replace' : 'Upload'}
              </button>
              <button
                type="button"
                onClick={onOpenCrop}
                className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-white/10 bg-white/5 text-[11px] font-bold text-white hover:bg-white/10"
              >
                <Crop className="h-3.5 w-3.5" />
                Crop
              </button>
            </div>
          )}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label>Zoom</Label>
              <span className="text-[10px] font-bold tabular-nums text-white/55">
                {Math.round((photoFit.zoom ?? 1) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={25}
              max={300}
              step={5}
              value={Math.round((photoFit.zoom ?? 1) * 100)}
              onChange={(e) => patchPhotoFit({ zoom: Number(e.target.value) / 100 })}
              className="w-full accent-primary"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>Position X</Label>
              <Input
                type="number"
                value={numInputValue(photoFit.offsetX)}
                onChange={(e) => patchPhotoFit({ offsetX: parseNumInput(e.target.value) ?? 0 })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Position Y</Label>
              <Input
                type="number"
                value={numInputValue(photoFit.offsetY)}
                onChange={(e) => patchPhotoFit({ offsetY: parseNumInput(e.target.value) ?? 0 })}
              />
            </div>
          </div>

          <p className="text-[10px] font-bold text-white/40 uppercase tracking-wider pt-2 border-t border-white/10">
            Shape settings
          </p>
          <SizeRow
            label="Frame"
            width={selected.width}
            height={selected.height}
            onWidth={(v) => onUpdate({ width: v })}
            onHeight={(v) => onUpdate({ height: v })}
          />
          <div className="space-y-1.5">
            <Label>Rotation (°)</Label>
            <Input
              type="number"
              min={-180}
              max={180}
              value={numInputValue(selected.rotation ?? 0)}
              onChange={(e) => onUpdate({ rotation: parseNumInput(e.target.value) ?? 0 })}
            />
          </div>
          <CornerRadiusControl
            label="Top left radius"
            value={selected.topLeftRadius ?? 0}
            max={cornerMax}
            onChange={(v) => onUpdate({ topLeftRadius: v })}
          />
          <CornerRadiusControl
            label="Top right radius"
            value={selected.topRightRadius ?? 0}
            max={cornerMax}
            onChange={(v) => onUpdate({ topRightRadius: v })}
          />
          <CornerRadiusControl
            label="Bottom left radius"
            value={selected.bottomLeftRadius ?? 0}
            max={cornerMax}
            onChange={(v) => onUpdate({ bottomLeftRadius: v })}
          />
          <CornerRadiusControl
            label="Bottom right radius"
            value={selected.bottomRightRadius ?? 0}
            max={cornerMax}
            onChange={(v) => onUpdate({ bottomRightRadius: v })}
          />
          <ColorRow
            label="Border color"
            value={selected.borderColor ?? ''}
            onChange={(v) => onUpdate(colorPatchWithBorder(v, selected.borderWidth))}
          />
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>Border width</Label>
              <Input
                type="number"
                min={0}
                max={20}
                placeholder="Width"
                value={borderWidthInputValue(selected)}
                onChange={(e) => onUpdate(borderWidthPatch(parseNumInput(e.target.value)))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Border style</Label>
              <BorderStyleSelect value={borderStyleSelectValue(selected)} onChange={onUpdate} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Background</Label>
            <Select
              value={selected.frameFillMode ?? 'solid'}
              onChange={(e) => {
                const mode = e.target.value as DesignerElement['frameFillMode'];
                const patch: Partial<DesignerElement> = { frameFillMode: mode };
                if (mode === 'gradient' && !selected.frameGradient) {
                  patch.frameGradient = DEFAULT_FRAME_GRADIENT;
                }
                onUpdate(patch);
              }}
            >
              <option value="transparent" className="bg-zinc-900">Transparent</option>
              <option value="solid" className="bg-zinc-900">Solid color</option>
              <option value="gradient" className="bg-zinc-900">Gradient</option>
            </Select>
          </div>
          {(selected.frameFillMode ?? 'solid') === 'solid' && (
            <ColorRow label="Background color" value={selected.fill ?? '#e2e8f0'} onChange={(v) => onUpdate({ fill: v })} />
          )}
          {selected.frameFillMode === 'gradient' && selected.frameGradient && (
            <>
              <ColorRow
                label="Gradient start"
                value={selected.frameGradient.colorStart}
                onChange={(v) =>
                  onUpdate({
                    frameGradient: { ...selected.frameGradient!, colorStart: v || DEFAULT_FRAME_GRADIENT.colorStart },
                  })
                }
              />
              <ColorRow
                label="Gradient end"
                value={selected.frameGradient.colorEnd}
                onChange={(v) =>
                  onUpdate({
                    frameGradient: { ...selected.frameGradient!, colorEnd: v || DEFAULT_FRAME_GRADIENT.colorEnd },
                  })
                }
              />
              <div className="space-y-1.5">
                <Label>Gradient angle: {selected.frameGradient.angle}°</Label>
                <input
                  type="range"
                  min={0}
                  max={360}
                  step={5}
                  value={selected.frameGradient.angle}
                  onChange={(e) =>
                    onUpdate({
                      frameGradient: { ...selected.frameGradient!, angle: Number(e.target.value) },
                    })
                  }
                  className="w-full accent-primary"
                />
              </div>
            </>
          )}
          <p className="text-[10px] font-bold text-white/40 uppercase tracking-wider pt-2">Shadow</p>
          <ColorRow
            label="Shadow color"
            value={frameShadow.color ?? '#000000'}
            onChange={(v) => patchFrameShadow({ color: v })}
          />
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>Blur</Label>
              <Input
                type="number"
                min={0}
                max={40}
                value={numInputValue(frameShadow.blur ?? 0)}
                onChange={(e) => patchFrameShadow({ blur: parseNumInput(e.target.value) ?? 0 })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Opacity</Label>
              <Input
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={frameShadow.opacity ?? 0}
                onChange={(e) => patchFrameShadow({ opacity: Number(e.target.value) })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>Offset X</Label>
              <Input
                type="number"
                value={numInputValue(frameShadow.offsetX ?? 0)}
                onChange={(e) => patchFrameShadow({ offsetX: parseNumInput(e.target.value) ?? 0 })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Offset Y</Label>
              <Input
                type="number"
                value={numInputValue(frameShadow.offsetY ?? 0)}
                onChange={(e) => patchFrameShadow({ offsetY: parseNumInput(e.target.value) ?? 0 })}
              />
            </div>
          </div>
          {onCenterOnCard && (
            <button
              type="button"
              onClick={onCenterOnCard}
              className="w-full py-2.5 rounded-xl border border-primary/30 bg-primary/10 text-xs font-bold text-primary hover:bg-primary/20 transition-colors"
            >
              Center on card
            </button>
          )}
        </>
      )}

      {isMedia && (
        <>
          {(isLogo || isSignature) && onReplaceAsset && (
            <button
              type="button"
              onClick={() => onReplaceAsset(isLogo ? 'schoolLogo' : 'schoolSignature')}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-primary/30 bg-primary/10 text-xs font-bold text-primary hover:bg-primary/20 transition-colors"
            >
              <Upload className="h-4 w-4" />
              {isLogo ? 'Change logo' : 'Change signature'}
            </button>
          )}
          <div className="space-y-1.5">
            <Label>Photo shape</Label>
            <Select
              value={selected.photoShape ?? ''}
              onChange={(e) => {
                const raw = e.target.value;
                const photoShape = (raw || undefined) as DesignerElement['photoShape'];
                const patch: Partial<DesignerElement> = { photoShape };
                if (photoShape === 'circle') {
                  const size = getSquarePhotoSize(selected.width, selected.height);
                  if (size) {
                    patch.width = size;
                    patch.height = size;
                  }
                }
                if (photoShape === 'custom') {
                  const fallback = selected.cornerRadius ?? 8;
                  patch.topLeftRadius = selected.topLeftRadius ?? fallback;
                  patch.topRightRadius = selected.topRightRadius ?? fallback;
                  patch.bottomLeftRadius = selected.bottomLeftRadius ?? fallback;
                  patch.bottomRightRadius = selected.bottomRightRadius ?? fallback;
                }
                onUpdate(patch);
              }}
            >
              <option value="" className="bg-zinc-900">Default</option>
              {PHOTO_SHAPES.map((s) => (
                <option key={s.id} value={s.id} className="bg-zinc-900">{s.label}</option>
              ))}
            </Select>
          </div>
          {selected.photoShape === 'rounded' && (
            <div className="space-y-1.5">
              <Label>Corner radius</Label>
              <Input
                type="number"
                min={0}
                max={80}
                placeholder="Radius"
                value={numInputValue(selected.cornerRadius)}
                onChange={(e) => onUpdate({ cornerRadius: parseNumInput(e.target.value) })}
              />
            </div>
          )}
          {selected.photoShape === 'custom' && (() => {
            const { width, height } = getElementSize(selected);
            const cornerMax = Math.max(0, Math.floor(Math.min(width, height) / 2));
            return (
              <>
                <CornerRadiusControl
                  label="Top left"
                  value={selected.topLeftRadius ?? 0}
                  max={cornerMax}
                  onChange={(v) => onUpdate({ topLeftRadius: v })}
                />
                <CornerRadiusControl
                  label="Top right"
                  value={selected.topRightRadius ?? 0}
                  max={cornerMax}
                  onChange={(v) => onUpdate({ topRightRadius: v })}
                />
                <CornerRadiusControl
                  label="Bottom left"
                  value={selected.bottomLeftRadius ?? 0}
                  max={cornerMax}
                  onChange={(v) => onUpdate({ bottomLeftRadius: v })}
                />
                <CornerRadiusControl
                  label="Bottom right"
                  value={selected.bottomRightRadius ?? 0}
                  max={cornerMax}
                  onChange={(v) => onUpdate({ bottomRightRadius: v })}
                />
              </>
            );
          })()}
          <SizeRow
            label={mediaLabel}
            width={selected.width}
            height={selected.height}
            onWidth={(v) => onUpdate({ width: v })}
            onHeight={(v) => onUpdate({ height: v })}
          />
          {onCenterOnCard && (
            <button
              type="button"
              onClick={onCenterOnCard}
              className="w-full py-2.5 rounded-xl border border-primary/30 bg-primary/10 text-xs font-bold text-primary hover:bg-primary/20 transition-colors"
            >
              Center on card
            </button>
          )}
          <ColorRow
            label="Border color"
            value={selected.borderColor ?? ''}
            onChange={(v) => onUpdate(colorPatchWithBorder(v, selected.borderWidth))}
          />
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>Border width</Label>
              <Input
                type="number"
                min={0}
                max={20}
                placeholder="Width"
                value={borderWidthInputValue(selected)}
                onChange={(e) => onUpdate(borderWidthPatch(parseNumInput(e.target.value)))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Border style</Label>
              <BorderStyleSelect
                value={borderStyleSelectValue(selected)}
                onChange={onUpdate}
              />
            </div>
          </div>
          <button type="button" onClick={onOpenCrop} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-white/10 bg-white/5 text-xs font-bold text-white hover:bg-white/10">
            <Crop className="h-4 w-4" /> Crop image
          </button>
          <div className="pt-2 border-t border-white/10 space-y-3">
            <p className="text-[10px] font-bold text-white/40 uppercase">Color correction</p>
            <div className="space-y-1.5">
              <Label>Brightness {(adjust.brightness ?? 0).toFixed(2)}</Label>
              <input type="range" min={-0.5} max={0.5} step={0.05} value={adjust.brightness ?? 0} onChange={(e) => onUpdate({ colorAdjust: { ...adjust, brightness: Number(e.target.value) } })} className="w-full accent-primary" />
            </div>
            <div className="space-y-1.5">
              <Label>Contrast {adjust.contrast ?? 0}</Label>
              <input type="range" min={-100} max={100} step={5} value={adjust.contrast ?? 0} onChange={(e) => onUpdate({ colorAdjust: { ...adjust, contrast: Number(e.target.value) } })} className="w-full accent-primary" />
            </div>
            <div className="space-y-1.5">
              <Label>Saturation {adjust.saturation ?? 0}</Label>
              <input type="range" min={-100} max={100} step={5} value={adjust.saturation ?? 0} onChange={(e) => onUpdate({ colorAdjust: { ...adjust, saturation: Number(e.target.value) } })} className="w-full accent-primary" />
            </div>
          </div>
        </>
      )}

      {isBox && (
        <SizeRow
          label={selected.type === 'qr' ? 'QR code' : 'Barcode'}
          width={selected.width}
          height={selected.height}
          onWidth={(v) => onUpdate({ width: v })}
          onHeight={(v) => onUpdate({ height: v })}
        />
      )}

      {isShape && (
        <>
          <ColorRow label="Fill" value={selected.fill ?? '#3b82f6'} onChange={(v) => onUpdate({ fill: v })} />
          <ColorRow label="Stroke" value={selected.stroke ?? ''} onChange={(v) => onUpdate({ stroke: v })} />
          <SizeRow
            label="Shape"
            width={selected.width}
            height={selected.height}
            onWidth={(v) => onUpdate({ width: v })}
            onHeight={(v) => onUpdate({ height: v })}
          />
          <div className="space-y-1.5">
            <Label>Corner radius</Label>
            <Input
              type="number"
              min={0}
              max={80}
              value={numInputValue(selected.cornerRadius)}
              onChange={(e) => onUpdate({ cornerRadius: parseNumInput(e.target.value) })}
            />
          </div>
        </>
      )}

      <div className="space-y-2 pt-2 border-t border-white/10">
        {!isCustomFrame && (
          <>
            <div className="flex items-center justify-between gap-2">
              <Label>Opacity</Label>
              <span className="text-[10px] font-bold tabular-nums text-white/55">
                {Math.round((selected.opacity ?? 1) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={selected.opacity ?? 1}
              onChange={(e) => onUpdate({ opacity: Number(e.target.value) })}
              className="w-full accent-primary"
            />
          </>
        )}
        {isCustomFrame && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label>Frame opacity</Label>
              <span className="text-[10px] font-bold tabular-nums text-white/55">
                {Math.round((selected.opacity ?? 1) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={selected.opacity ?? 1}
              onChange={(e) => onUpdate({ opacity: Number(e.target.value) })}
              className="w-full accent-primary"
            />
          </div>
        )}
        <label className="flex items-center gap-2 text-xs text-white/60 cursor-pointer">
          <input
            type="checkbox"
            checked={!!selected.locked}
            onChange={(e) => onUpdate({ locked: e.target.checked })}
            className="rounded accent-primary"
          />
          Lock element
        </label>
        <label className="flex items-center gap-2 text-xs text-white/60 cursor-pointer">
          <input
            type="checkbox"
            checked={selected.visible === false}
            onChange={(e) => onUpdate({ visible: e.target.checked ? false : undefined })}
            className="rounded accent-primary"
          />
          Hidden
        </label>
      </div>

      <PositionControls selected={selected} orientation={orientation} onUpdate={onUpdate} />
    </div>
  );
}
