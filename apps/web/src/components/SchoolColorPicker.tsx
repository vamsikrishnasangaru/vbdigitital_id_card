'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Palette } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DEFAULT_CUSTOM_ACCENT,
  DEFAULT_CUSTOM_BG,
  normalizeHex,
  SCHOOL_BACKGROUNDS,
  SCHOOL_COLORS,
} from '@/lib/school-color';
import { useSchoolColor } from '@/components/SchoolColorProvider';

function SwatchButton({
  name,
  swatch,
  selected,
  size,
  checkDark,
  onSelect,
}: {
  name: string;
  swatch: string;
  selected: boolean;
  size: 'md' | 'lg';
  checkDark?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={name}
      aria-pressed={selected}
      className={cn(
        'relative rounded-full border-2 transition-transform hover:scale-105',
        size === 'lg' ? 'h-11 w-11' : 'h-8 w-8',
        selected ? 'border-foreground ring-2 ring-foreground/15' : 'border-black/10 shadow-sm',
      )}
      style={{ backgroundColor: swatch }}
    >
      {selected && (
        <Check
          className={cn(
            'absolute inset-0 m-auto drop-shadow',
            checkDark ? 'text-slate-800' : 'text-white',
            size === 'lg' ? 'h-5 w-5' : 'h-3.5 w-3.5',
          )}
        />
      )}
    </button>
  );
}

function OptionCard({
  name,
  hint,
  swatch,
  selected,
  checkDark,
  onSelect,
}: {
  name: string;
  hint: string;
  swatch: string;
  selected: boolean;
  checkDark?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex items-center gap-3 rounded-2xl border p-3 text-left transition-colors',
        selected
          ? 'border-primary bg-primary/10 ring-2 ring-primary/20'
          : 'border-border bg-card hover:border-primary/40 hover:bg-muted/40',
      )}
    >
      <span
        className={cn(
          'relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2',
          selected ? 'border-foreground ring-2 ring-foreground/15' : 'border-black/10 shadow-sm',
        )}
        style={{ backgroundColor: swatch }}
      >
        {selected && (
          <Check className={cn('h-5 w-5 drop-shadow', checkDark ? 'text-slate-800' : 'text-white')} />
        )}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-bold text-foreground">{name}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </button>
  );
}

function HexColorField({
  label,
  hint,
  value,
  selected,
  onPick,
  compact = false,
  dark = false,
}: {
  label: string;
  hint: string;
  value: string;
  selected: boolean;
  onPick: (hex: string) => void;
  compact?: boolean;
  dark?: boolean;
}) {
  const [draft, setDraft] = useState(value.toUpperCase());

  useEffect(() => {
    setDraft(value.toUpperCase());
  }, [value]);

  const commit = (raw: string) => {
    const next = normalizeHex(raw);
    if (next) onPick(next);
    else setDraft(value.toUpperCase());
  };

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-2xl border p-3',
        selected
          ? 'border-primary bg-primary/10 ring-2 ring-primary/20'
          : dark
            ? 'border-white/15 bg-white/5'
            : 'border-border bg-card',
      )}
    >
      <label
        className={cn(
          'relative shrink-0 cursor-pointer overflow-hidden rounded-full border-2 shadow-sm',
          compact ? 'h-8 w-8' : 'h-11 w-11',
          selected ? 'border-foreground ring-2 ring-foreground/15' : 'border-black/10',
        )}
      >
        <span className="absolute inset-0" style={{ backgroundColor: value }} />
        <input
          type="color"
          aria-label={label}
          value={normalizeHex(value) ?? value}
          onChange={(e) => onPick(e.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </label>
      {!compact && (
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-foreground">{label}</span>
          <span className={cn('block text-xs', dark ? 'text-white/60' : 'text-muted-foreground')}>
            {hint}
          </span>
        </span>
      )}
      <input
        value={draft}
        spellCheck={false}
        maxLength={7}
        aria-label={`${label} hex`}
        onChange={(e) => {
          const next = e.target.value;
          setDraft(next);
          const parsed = normalizeHex(next);
          if (parsed) onPick(parsed);
        }}
        onBlur={() => commit(draft)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit(draft);
        }}
        className={cn(
          'w-[5.6rem] rounded-lg border px-2 py-1.5 font-mono text-xs uppercase outline-none',
          dark
            ? 'border-white/15 bg-white/10 text-white'
            : 'border-border bg-background text-foreground',
        )}
      />
    </div>
  );
}

export function SchoolColorGrid() {
  const { color, background, accentHex, bgHex, setColor, setBackground, setAccentHex, setBgHex } =
    useSchoolColor();
  const accentValue =
    color === 'custom'
      ? accentHex
      : (SCHOOL_COLORS.find((c) => c.id === color)?.swatch ?? accentHex);
  const bgValue =
    background === 'custom'
      ? bgHex
      : (SCHOOL_BACKGROUNDS.find((c) => c.id === background)?.swatch ?? bgHex);

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div>
          <h4 className="text-sm font-black text-foreground">Accent</h4>
          <p className="text-xs text-muted-foreground">Buttons, sidebar, and header highlights.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {SCHOOL_COLORS.map((option) => (
            <OptionCard
              key={option.id}
              name={option.name}
              hint={option.hint}
              swatch={option.swatch}
              selected={color === option.id}
              onSelect={() => setColor(option.id)}
            />
          ))}
        </div>
        <HexColorField
          label="Custom accent"
          hint="Pick any color for your school vibe"
          value={accentValue}
          selected={color === 'custom'}
          onPick={setAccentHex}
        />
      </section>
      <section className="space-y-3">
        <div>
          <h4 className="text-sm font-black text-foreground">Background</h4>
          <p className="text-xs text-muted-foreground">Page paper behind cards and forms.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {SCHOOL_BACKGROUNDS.map((option) => (
            <OptionCard
              key={option.id}
              name={option.name}
              hint={option.hint}
              swatch={option.swatch}
              selected={background === option.id}
              checkDark
              onSelect={() => setBackground(option.id)}
            />
          ))}
        </div>
        <HexColorField
          label="Custom background"
          hint="Pick any paper color"
          value={bgValue}
          selected={background === 'custom'}
          onPick={setBgHex}
        />
      </section>
    </div>
  );
}

export function SchoolColorMenu({ dark = false }: { dark?: boolean }) {
  const { color, background, accentHex, bgHex, setColor, setBackground, setAccentHex, setBgHex } =
    useSchoolColor();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const currentAccent = SCHOOL_COLORS.find((c) => c.id === color);
  const currentBg = SCHOOL_BACKGROUNDS.find((c) => c.id === background);
  const accentValue = currentAccent?.swatch ?? accentHex ?? DEFAULT_CUSTOM_ACCENT;
  const bgValue = currentBg?.swatch ?? bgHex ?? DEFAULT_CUSTOM_BG;
  const accentName = currentAccent?.name ?? `Custom ${accentHex.toUpperCase()}`;
  const bgName = currentBg?.name ?? `Custom ${bgHex.toUpperCase()}`;

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`School colors: ${accentName}, ${bgName}`}
        className={cn(
          'flex h-9 w-9 items-center justify-center rounded-lg border transition-colors',
          dark
            ? 'border-white/15 bg-white/10 text-white hover:bg-white/20'
            : 'border-border bg-card text-foreground hover:bg-accent',
        )}
      >
        <Palette className="h-4 w-4" />
      </button>
      {open && (
        <div
          className={cn(
            'absolute right-0 top-full z-50 mt-2 w-72 rounded-2xl border p-3 shadow-xl',
            dark
              ? 'border-white/10 bg-[var(--sidebar)] text-white'
              : 'border-border bg-popover text-popover-foreground',
          )}
        >
          <p
            className={cn(
              'mb-2 text-[11px] font-bold uppercase tracking-wider',
              dark ? 'text-white/60' : 'text-muted-foreground',
            )}
          >
            Accent
          </p>
          <div className="grid grid-cols-4 gap-2.5">
            {SCHOOL_COLORS.map((option) => (
              <div key={option.id} className="flex justify-center">
                <SwatchButton
                  name={option.name}
                  swatch={option.swatch}
                  selected={color === option.id}
                  size="md"
                  onSelect={() => setColor(option.id)}
                />
              </div>
            ))}
          </div>
          <div className="mt-2">
            <HexColorField
              label="Custom accent"
              hint="Any color"
              value={accentValue}
              selected={color === 'custom'}
              onPick={setAccentHex}
              compact
              dark={dark}
            />
          </div>
          <p
            className={cn(
              'mb-2 mt-3 text-[11px] font-bold uppercase tracking-wider',
              dark ? 'text-white/60' : 'text-muted-foreground',
            )}
          >
            Background
          </p>
          <div className="grid grid-cols-4 gap-2.5">
            {SCHOOL_BACKGROUNDS.map((option) => (
              <div key={option.id} className="flex justify-center">
                <SwatchButton
                  name={option.name}
                  swatch={option.swatch}
                  selected={background === option.id}
                  size="md"
                  checkDark
                  onSelect={() => setBackground(option.id)}
                />
              </div>
            ))}
          </div>
          <div className="mt-2">
            <HexColorField
              label="Custom background"
              hint="Any paper color"
              value={bgValue}
              selected={background === 'custom'}
              onPick={setBgHex}
              compact
              dark={dark}
            />
          </div>
          <p className={cn('mt-3 text-center text-xs font-medium', dark ? 'text-white/80' : 'text-muted-foreground')}>
            {accentName} · {bgName}
          </p>
        </div>
      )}
    </div>
  );
}
