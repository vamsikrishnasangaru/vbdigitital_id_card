import {
  DEFAULT_PHOTO_ADJUSTMENTS,
  renderEditedPhoto,
  type PhotoAdjustments,
  type PhotoCropState,
  PHOTO_EDITOR_CROP_INSET,
  PHOTO_EDITOR_VIEWPORT,
} from './photo-editor-utils';

export type PhotoFilterId =
  | 'punch'
  | 'golden'
  | 'radiate'
  | 'warm-contrast'
  | 'calm'
  | 'cool-light'
  | 'vivid-cool'
  | 'dramatic-cool'
  | 'bw';

export type PhotoFilterPreset = {
  id: PhotoFilterId;
  name: string;
  swatch: [string, string, string];
  adjustments: PhotoAdjustments;
};

function preset(
  id: PhotoFilterId,
  name: string,
  swatch: [string, string, string],
  partial: Partial<PhotoAdjustments>,
): PhotoFilterPreset {
  return {
    id,
    name,
    swatch,
    adjustments: { ...DEFAULT_PHOTO_ADJUSTMENTS, ...partial },
  };
}

export const PHOTO_FILTER_PRESETS: PhotoFilterPreset[] = [
  preset('punch', 'Punch', ['#ff512f', '#f09819', '#ffd200'], {
    exposure: 8,
    contrast: 38,
    saturation: 42,
    shadows: 22,
    sharpness: 28,
  }),
  preset('golden', 'Golden', ['#f7971e', '#ffd200', '#ffe259'], {
    exposure: 10,
    warmth: 42,
    saturation: 24,
    highlights: -12,
    shadows: 18,
    contrast: 12,
  }),
  preset('radiate', 'Radiate', ['#ff9a56', '#ff6a88', '#ffd180'], {
    exposure: 14,
    brightness: 10,
    highlights: 18,
    warmth: 28,
    saturation: 35,
    shadows: 15,
  }),
  preset('warm-contrast', 'Warm Contrast', ['#c94b4b', '#4b134f', '#f7971e'], {
    warmth: 35,
    contrast: 32,
    saturation: 18,
    shadows: 25,
    exposure: 5,
  }),
  preset('calm', 'Calm', ['#a8c0ff', '#c2e9fb', '#e0f7fa'], {
    brightness: 6,
    contrast: -12,
    saturation: -18,
    warmth: -15,
    tint: 8,
    shadows: 12,
    highlights: -8,
  }),
  preset('cool-light', 'Cool Light', ['#89f7fe', '#66a6ff', '#cfd9df'], {
    exposure: 8,
    brightness: 8,
    warmth: -32,
    highlights: 14,
    shadows: 10,
    saturation: -8,
  }),
  preset('vivid-cool', 'Vivid Cool', ['#00c6ff', '#0072ff', '#7f7fd5'], {
    saturation: 48,
    contrast: 22,
    warmth: -28,
    exposure: 6,
    sharpness: 18,
    shadows: 12,
  }),
  preset('dramatic-cool', 'Dramatic Cool', ['#0f2027', '#203a43', '#2c5364'], {
    contrast: 45,
    warmth: -38,
    saturation: 12,
    shadows: -22,
    highlights: -18,
    exposure: -6,
    sharpness: 32,
  }),
  preset('bw', 'B&W', ['#434343', '#888888', '#e0e0e0'], {
    saturation: -100,
    contrast: 22,
    brightness: 4,
    sharpness: 20,
  }),
];

function clamp(value: number, min: number, max: number): number {
  return Math.round(Math.max(min, Math.min(max, value)));
}

export function computeAutoEnhanceAdjustments(
  img: HTMLImageElement,
  crop: PhotoCropState,
): PhotoAdjustments {
  const sampleSize = 72;
  const canvas = renderEditedPhoto(
    img,
    crop,
    DEFAULT_PHOTO_ADJUSTMENTS,
    sampleSize,
    PHOTO_EDITOR_VIEWPORT,
    PHOTO_EDITOR_CROP_INSET,
  );
  const ctx = canvas.getContext('2d');
  if (!ctx) return { ...DEFAULT_PHOTO_ADJUSTMENTS };

  const { data } = ctx.getImageData(0, 0, sampleSize, sampleSize);
  let sumL = 0;
  let sumL2 = 0;
  let dark = 0;
  let bright = 0;
  let satSum = 0;
  const count = data.length / 4;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    sumL += l;
    sumL2 += l * l;
    if (l < 55) dark++;
    if (l > 210) bright++;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    satSum += max === 0 ? 0 : (max - min) / max;
  }

  const avgL = sumL / count;
  const stdL = Math.sqrt(Math.max(0, sumL2 / count - avgL * avgL));
  const avgSat = satSum / count;
  const darkRatio = dark / count;
  const brightRatio = bright / count;

  const exposure = clamp(((128 - avgL) / 128) * 28, -18, 28);
  const brightness = clamp(((128 - avgL) / 128) * 14, -12, 14);
  const contrast = clamp(((42 - stdL) / 42) * 30, -8, 32);
  const shadows = darkRatio > 0.18 ? clamp((darkRatio - 0.15) * 90, 0, 38) : 0;
  const highlights = brightRatio > 0.06 ? clamp(-(brightRatio - 0.04) * 120, -35, 0) : 0;
  const saturation = avgSat < 0.22 ? clamp(28 - avgSat * 80, 12, 32) : clamp(14 - avgSat * 20, 4, 18);
  const sharpness = stdL < 38 ? 22 : 14;

  return {
    ...DEFAULT_PHOTO_ADJUSTMENTS,
    exposure,
    brightness,
    contrast,
    highlights,
    shadows,
    saturation,
    sharpness,
  };
}

export function adjustmentsMatchFilter(
  adjustments: PhotoAdjustments,
  filter: PhotoFilterPreset,
): boolean {
  return (Object.keys(DEFAULT_PHOTO_ADJUSTMENTS) as (keyof PhotoAdjustments)[]).every(
    (key) => adjustments[key] === filter.adjustments[key],
  );
}
