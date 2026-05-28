'use client';

import { Crop, Trash2, Upload } from 'lucide-react';
import type { DesignerElement } from '@/lib/designer-utils';
import {
  getCardSize,
  getDragClampSize,
  getElementSize,
  getSquarePhotoSize,
} from '@/lib/designer-utils';
import { FONT_FAMILIES, PHOTO_SHAPES, BORDER_STYLES, DEFAULT_COLOR_ADJUST } from './designer-constants';

interface DesignerPropertiesPanelProps {
  selected: DesignerElement | null;
  onUpdate: (patch: Partial<DesignerElement>) => void;
  onRemove: () => void;
  onOpenCrop: () => void;
  onCenterOnCard?: () => void;
  onReplaceAsset?: (kind: 'schoolLogo' | 'schoolSignature') => void;
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
  const isSignature = selected.fieldType === 'schoolSignature';
  const isLogo = selected.fieldType === 'schoolLogo';
  const mediaLabel = isSignature ? 'Signature' : isLogo ? 'Logo' : 'Photo';
  const isMedia = selected.type === 'photo' || selected.type === 'image' || isSignature || isLogo;
  const isBox = selected.type === 'qr' || selected.type === 'barcode';
  const isShape = selected.type === 'shape';
  const adjust = { ...DEFAULT_COLOR_ADJUST, ...selected.colorAdjust };

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
              <Select
                value={selected.fontStyle ?? ''}
                onChange={(e) => onUpdate({ fontStyle: (e.target.value || undefined) as DesignerElement['fontStyle'] })}
              >
                <option value="" className="bg-zinc-900">Regular</option>
                <option value="bold" className="bg-zinc-900">Bold</option>
                <option value="italic" className="bg-zinc-900">Italic</option>
                <option value="bold italic" className="bg-zinc-900">Bold Italic</option>
              </Select>
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
          <ColorRow label="Text stroke" value={selected.stroke ?? ''} onChange={(v) => onUpdate({ stroke: v })} />
          <div className="space-y-1.5">
            <Label>Text box width (px)</Label>
            <p className="text-[9px] text-white/25">Optional — set to wrap long text; leave empty for auto width</p>
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
              placeholder="0"
              value={numInputValue(selected.strokeWidth)}
              onChange={(e) => onUpdate({ strokeWidth: parseNumInput(e.target.value) })}
            />
          </div>
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
          <ColorRow label="Border color" value={selected.borderColor ?? ''} onChange={(v) => onUpdate({ borderColor: v })} />
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>Border width</Label>
              <Input
                type="number"
                min={0}
                max={20}
                placeholder="0"
                value={numInputValue(selected.borderWidth)}
                onChange={(e) => onUpdate({ borderWidth: parseNumInput(e.target.value) })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Border style</Label>
              <Select
                value={selected.borderStyle ?? ''}
                onChange={(e) => onUpdate({ borderStyle: (e.target.value || undefined) as DesignerElement['borderStyle'] })}
              >
                <option value="" className="bg-zinc-900">Default</option>
                {BORDER_STYLES.map((b) => (
                  <option key={b.id} value={b.id} className="bg-zinc-900">{b.label}</option>
                ))}
              </Select>
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
        <Label>Opacity</Label>
        <input
          type="range"
          min={0.1}
          max={1}
          step={0.05}
          value={selected.opacity ?? 1}
          onChange={(e) => onUpdate({ opacity: Number(e.target.value) })}
          className="w-full accent-primary"
        />
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
