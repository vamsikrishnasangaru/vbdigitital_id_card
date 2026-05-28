export const FONT_FAMILIES = [
  'Arial',
  'Helvetica',
  'Georgia',
  'Times New Roman',
  'Verdana',
  'Tahoma',
  'Trebuchet MS',
  'Courier New',
  'Impact',
  'Comic Sans MS',
] as const;

export const PHOTO_SHAPES = [
  { id: 'rectangle', label: 'Rectangle' },
  { id: 'rounded', label: 'Rounded' },
  { id: 'circle', label: 'Circle' },
  { id: 'ellipse', label: 'Oval' },
] as const;

export const BORDER_STYLES = [
  { id: 'solid', label: 'Solid' },
  { id: 'dashed', label: 'Dashed' },
  { id: 'dotted', label: 'Dotted' },
] as const;

export const DEFAULT_COLOR_ADJUST = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
};
