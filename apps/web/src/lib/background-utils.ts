import type { CSSProperties } from 'react';

/** Standard design PPI card size in pixels (horizontal). */
export const BG_WIDTH_H = Math.round(3.375 * 96);
export const BG_HEIGHT_H = Math.round(2.125 * 96);
export const BG_WIDTH_V = Math.round(2.125 * 96);
export const BG_HEIGHT_V = Math.round(3.375 * 96);

export type BackgroundMode = 'image' | 'solid' | 'gradient';

export interface GradientBackground {
  angle: number;
  colorStart: string;
  colorEnd: string;
}

export interface TemplateBackground {
  mode: BackgroundMode;
  imageUrl?: string;
  solidColor?: string;
  gradient?: GradientBackground;
}

const DEFAULT_SOLID = '#1e40af';
const DEFAULT_GRADIENT: GradientBackground = {
  angle: 135,
  colorStart: '#1e40af',
  colorEnd: '#7c3aed',
};

export function getDefaultBackground(): TemplateBackground {
  return { mode: 'image' };
}

export function encodeBackground(bg: TemplateBackground): string {
  if (bg.mode === 'solid' && bg.solidColor) return `color:${bg.solidColor}`;
  if (bg.mode === 'gradient' && bg.gradient) {
    const g = bg.gradient;
    return `gradient:${g.angle}:${g.colorStart}:${g.colorEnd}`;
  }
  return bg.imageUrl || '';
}

export function parseBackground(value?: string | null): TemplateBackground {
  if (!value) return getDefaultBackground();
  if (value.startsWith('color:')) {
    return { mode: 'solid', solidColor: value.slice(6) || DEFAULT_SOLID };
  }
  if (value.startsWith('gradient:')) {
    const parts = value.slice(9).split(':');
    if (parts.length >= 3) {
      return {
        mode: 'gradient',
        gradient: {
          angle: Number(parts[0]) || 135,
          colorStart: parts[1] || DEFAULT_GRADIENT.colorStart,
          colorEnd: parts.slice(2).join(':') || DEFAULT_GRADIENT.colorEnd,
        },
      };
    }
  }
  return { mode: 'image', imageUrl: value };
}

export function gradientCss(g: GradientBackground): string {
  return `linear-gradient(${g.angle}deg, ${g.colorStart}, ${g.colorEnd})`;
}

export function backgroundPreviewStyle(
  bg: TemplateBackground,
  orientation: 'HORIZONTAL' | 'VERTICAL',
): CSSProperties {
  const aspect = orientation === 'VERTICAL' ? '1 / 1.58' : '1.58 / 1';
  const base: CSSProperties = { aspectRatio: aspect, width: '100%' };

  if (bg.mode === 'solid') {
    return { ...base, backgroundColor: bg.solidColor || DEFAULT_SOLID };
  }
  if (bg.mode === 'gradient' && bg.gradient) {
    return { ...base, background: gradientCss(bg.gradient) };
  }
  if (bg.imageUrl) {
    return {
      ...base,
      backgroundImage: `url(${bg.imageUrl.startsWith('data:') || bg.imageUrl.startsWith('http') ? bg.imageUrl : ''})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    };
  }
  return { ...base, backgroundColor: '#e2e8f0' };
}

/** Konva linear gradient end point from angle (degrees). */
export function gradientEndPoint(angle: number, width: number, height: number) {
  const rad = ((angle - 90) * Math.PI) / 180;
  const cx = width / 2;
  const cy = height / 2;
  const len = Math.sqrt(width * width + height * height) / 2;
  return {
    start: { x: cx - Math.cos(rad) * len, y: cy - Math.sin(rad) * len },
    end: { x: cx + Math.cos(rad) * len, y: cy + Math.sin(rad) * len },
  };
}

export async function renderBackgroundToFile(
  bg: TemplateBackground,
  orientation: 'HORIZONTAL' | 'VERTICAL',
): Promise<File | null> {
  if (bg.mode === 'image') return null;

  const w = orientation === 'VERTICAL' ? BG_WIDTH_V : BG_WIDTH_H;
  const h = orientation === 'VERTICAL' ? BG_HEIGHT_V : BG_HEIGHT_H;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  if (bg.mode === 'solid') {
    ctx.fillStyle = bg.solidColor || DEFAULT_SOLID;
    ctx.fillRect(0, 0, w, h);
  } else if (bg.mode === 'gradient' && bg.gradient) {
    const { start, end } = gradientEndPoint(bg.gradient.angle, w, h);
    const grd = ctx.createLinearGradient(start.x, start.y, end.x, end.y);
    grd.addColorStop(0, bg.gradient.colorStart);
    grd.addColorStop(1, bg.gradient.colorEnd);
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, w, h);
  }

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) return resolve(null);
      resolve(new File([blob], 'background.png', { type: 'image/png' }));
    }, 'image/png');
  });
}

export function isValidBackground(bg: TemplateBackground): boolean {
  if (bg.mode === 'image') return !!bg.imageUrl;
  if (bg.mode === 'solid') return !!bg.solidColor;
  if (bg.mode === 'gradient') return !!(bg.gradient?.colorStart && bg.gradient?.colorEnd);
  return false;
}

export function resolveBackgroundImageUrl(
  frontBgUrl: string | null | undefined,
  resolveMediaUrl: (url: string) => string,
): string | undefined {
  const bg = parseBackground(frontBgUrl);
  if (bg.mode !== 'image' || !bg.imageUrl) return undefined;
  return resolveMediaUrl(bg.imageUrl);
}

export function templateCardBackgroundStyle(
  frontBgUrl: string | null | undefined,
  orientation: 'HORIZONTAL' | 'VERTICAL',
  resolveMediaUrl: (url: string) => string,
): CSSProperties {
  const bg = parseBackground(frontBgUrl);
  if (bg.mode === 'image' && bg.imageUrl) {
    return {
      backgroundImage: `url(${resolveMediaUrl(bg.imageUrl)})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    };
  }
  if (bg.mode === 'solid') {
    return { backgroundColor: bg.solidColor || DEFAULT_SOLID };
  }
  if (bg.mode === 'gradient' && bg.gradient) {
    return { background: gradientCss(bg.gradient) };
  }
  return { backgroundColor: '#e2e8f0' };
}
