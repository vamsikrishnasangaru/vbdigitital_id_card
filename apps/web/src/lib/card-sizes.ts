export type CardOrientation = 'HORIZONTAL' | 'VERTICAL';

/** ISO/IEC 7810 ID-1 (CR80) — credit-card stock size. */
export const CR80_LONG_IN = 3.375;
export const CR80_SHORT_IN = 2.125;

export type Cr80Dimensions = {
  widthIn: number;
  heightIn: number;
  widthMm: number;
  heightMm: number;
};

/** Display dimensions for each layout orientation (portrait vs landscape). */
export function getCr80Dimensions(orientation: CardOrientation): Cr80Dimensions {
  if (orientation === 'VERTICAL') {
    return {
      widthIn: CR80_SHORT_IN,
      heightIn: CR80_LONG_IN,
      widthMm: 54,
      heightMm: 86,
    };
  }
  return {
    widthIn: CR80_LONG_IN,
    heightIn: CR80_SHORT_IN,
    widthMm: 85.6,
    heightMm: 54,
  };
}

export function formatCr80Label(orientation: CardOrientation): string {
  const d = getCr80Dimensions(orientation);
  return `CR80 · ${d.widthIn}" × ${d.heightIn}" (${d.widthMm} mm × ${d.heightMm} mm)`;
}

export function formatCr80Short(orientation: CardOrientation): string {
  const d = getCr80Dimensions(orientation);
  return `${d.widthIn}" × ${d.heightIn}"`;
}

export function formatCr80Mm(orientation: CardOrientation): string {
  const d = getCr80Dimensions(orientation);
  return `${d.widthMm} mm × ${d.heightMm} mm`;
}

export const CR80_SIZE_OPTIONS: {
  orientation: CardOrientation;
  title: string;
  subtitle: string;
}[] = [
  {
    orientation: 'HORIZONTAL',
    title: 'Landscape (Horizontal)',
    subtitle: formatCr80Label('HORIZONTAL'),
  },
  {
    orientation: 'VERTICAL',
    title: 'Portrait (Vertical)',
    subtitle: formatCr80Label('VERTICAL'),
  },
];
