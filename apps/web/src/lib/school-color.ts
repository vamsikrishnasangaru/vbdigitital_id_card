export const SCHOOL_COLOR_STORAGE_KEY = 'vb-school-color';
export const SCHOOL_ACCENT_HEX_KEY = 'vb-school-accent-hex';
export const SCHOOL_BG_HEX_KEY = 'vb-school-bg-hex';

export const DEFAULT_CUSTOM_ACCENT = '#2b8fd9';
export const DEFAULT_CUSTOM_BG = '#f6f0e4';

export const SCHOOL_COLOR_IDS = [
  'sky',
  'emerald',
  'gold',
  'maroon',
  'violet',
  'rose',
  'teal',
  'orange',
  'custom',
] as const;

export type SchoolColorId = (typeof SCHOOL_COLOR_IDS)[number];

export const DEFAULT_SCHOOL_COLOR: SchoolColorId = 'sky';

export const SCHOOL_COLORS: {
  id: SchoolColorId;
  name: string;
  hint: string;
  swatch: string;
}[] = [
  { id: 'sky', name: 'Sky blue', hint: 'Classic campus', swatch: '#2b8fd9' },
  { id: 'emerald', name: 'House green', hint: 'Sports day', swatch: '#1a9a6a' },
  { id: 'gold', name: 'House gold', hint: 'Honour board', swatch: '#d4a017' },
  { id: 'maroon', name: 'House maroon', hint: 'Formal blazer', swatch: '#9b2c3a' },
  { id: 'violet', name: 'House purple', hint: 'Prefect sash', swatch: '#7c5cbf' },
  { id: 'rose', name: 'House rose', hint: 'Annual day', swatch: '#d4537a' },
  { id: 'teal', name: 'House teal', hint: 'Science lab', swatch: '#1a8f8f' },
  { id: 'orange', name: 'House orange', hint: 'Morning assembly', swatch: '#e07830' },
];

export const SCHOOL_BG_STORAGE_KEY = 'vb-school-bg';

export const SCHOOL_BG_IDS = [
  'cream',
  'white',
  'sky',
  'mint',
  'gold',
  'blush',
  'lavender',
  'slate',
  'custom',
] as const;

export type SchoolBgId = (typeof SCHOOL_BG_IDS)[number];

export const DEFAULT_SCHOOL_BG: SchoolBgId = 'cream';

export const SCHOOL_BACKGROUNDS: {
  id: SchoolBgId;
  name: string;
  hint: string;
  swatch: string;
}[] = [
  { id: 'cream', name: 'Cream paper', hint: 'Notebook page', swatch: '#f6f0e4' },
  { id: 'white', name: 'Classroom white', hint: 'Clean board', swatch: '#f7f8fa' },
  { id: 'sky', name: 'Sky wash', hint: 'Morning assembly', swatch: '#e7f3fb' },
  { id: 'mint', name: 'Mint paper', hint: 'Sports field', swatch: '#e7f6ef' },
  { id: 'gold', name: 'Gold paper', hint: 'Honour roll', swatch: '#f7efd8' },
  { id: 'blush', name: 'Blush paper', hint: 'Annual day', swatch: '#fbecee' },
  { id: 'lavender', name: 'Lavender paper', hint: 'Prefect hall', swatch: '#f1ecf8' },
  { id: 'slate', name: 'Cool slate', hint: 'Staff room', swatch: '#eceef2' },
];

export function normalizeHex(value: string): string | null {
  const raw = value.trim();
  const withHash = raw.startsWith('#') ? raw : `#${raw}`;
  if (/^#[0-9a-f]{3}$/i.test(withHash)) {
    const r = withHash[1];
    const g = withHash[2];
    const b = withHash[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  if (/^#[0-9a-f]{6}$/i.test(withHash)) return withHash.toLowerCase();
  return null;
}

export function hexLuminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  if (Number.isNaN(n)) return 0;
  const channel = (shift: number) => {
    const c = ((n >> shift) & 255) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
}

export function contrastFg(hex: string): string {
  return hexLuminance(hex) > 0.55 ? '#1a1f2e' : '#ffffff';
}

export function isSchoolColorId(value: unknown): value is SchoolColorId {
  return typeof value === 'string' && (SCHOOL_COLOR_IDS as readonly string[]).includes(value);
}

export function isSchoolBgId(value: unknown): value is SchoolBgId {
  return typeof value === 'string' && (SCHOOL_BG_IDS as readonly string[]).includes(value);
}

export function applySchoolColor(id: SchoolColorId) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-school-color', id);
}

export function applySchoolBg(id: SchoolBgId) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-school-bg', id);
}

export function applyAccentHex(hex: string) {
  if (typeof document === 'undefined') return;
  const n = normalizeHex(hex);
  if (!n) return;
  const root = document.documentElement;
  root.style.setProperty('--school-accent-custom', n);
  root.style.setProperty('--school-accent-fg', contrastFg(n));
}

export function applyBgHex(hex: string) {
  if (typeof document === 'undefined') return;
  const n = normalizeHex(hex);
  if (!n) return;
  const root = document.documentElement;
  root.style.setProperty('--school-bg-custom', n);
  root.style.setProperty('--school-bg-fg', contrastFg(n));
}

export function readStoredSchoolColor(): SchoolColorId {
  try {
    const stored = localStorage.getItem(SCHOOL_COLOR_STORAGE_KEY);
    if (isSchoolColorId(stored)) return stored;
  } catch {
    /* private mode / SSR */
  }
  return DEFAULT_SCHOOL_COLOR;
}

export function readStoredSchoolBg(): SchoolBgId {
  try {
    const stored = localStorage.getItem(SCHOOL_BG_STORAGE_KEY);
    if (isSchoolBgId(stored)) return stored;
  } catch {
    /* private mode / SSR */
  }
  return DEFAULT_SCHOOL_BG;
}

export function persistSchoolColor(id: SchoolColorId) {
  applySchoolColor(id);
  try {
    localStorage.setItem(SCHOOL_COLOR_STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}

export function persistSchoolBg(id: SchoolBgId) {
  applySchoolBg(id);
  try {
    localStorage.setItem(SCHOOL_BG_STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}

export function readStoredAccentHex(): string {
  try {
    const stored = localStorage.getItem(SCHOOL_ACCENT_HEX_KEY);
    return normalizeHex(stored ?? '') ?? DEFAULT_CUSTOM_ACCENT;
  } catch {
    return DEFAULT_CUSTOM_ACCENT;
  }
}

export function readStoredBgHex(): string {
  try {
    const stored = localStorage.getItem(SCHOOL_BG_HEX_KEY);
    return normalizeHex(stored ?? '') ?? DEFAULT_CUSTOM_BG;
  } catch {
    return DEFAULT_CUSTOM_BG;
  }
}

export function persistAccentHex(hex: string): string | null {
  const n = normalizeHex(hex);
  if (!n) return null;
  applyAccentHex(n);
  applySchoolColor('custom');
  try {
    localStorage.setItem(SCHOOL_ACCENT_HEX_KEY, n);
    localStorage.setItem(SCHOOL_COLOR_STORAGE_KEY, 'custom');
  } catch {
    /* ignore */
  }
  return n;
}

export function persistBgHex(hex: string): string | null {
  const n = normalizeHex(hex);
  if (!n) return null;
  applyBgHex(n);
  applySchoolBg('custom');
  try {
    localStorage.setItem(SCHOOL_BG_HEX_KEY, n);
    localStorage.setItem(SCHOOL_BG_STORAGE_KEY, 'custom');
  } catch {
    /* ignore */
  }
  return n;
}

export function buildSchoolColorBootstrapScript() {
  return `(function(){try{var r=document.documentElement;function n(v){v=String(v||'').trim();if(v[0]!=='#')v='#'+v;if(/^#[0-9a-f]{3}$/i.test(v))v='#'+v[1]+v[1]+v[2]+v[2]+v[3]+v[3];return /^#[0-9a-f]{6}$/i.test(v)?v.toLowerCase():null}function fg(h){var x=parseInt(h.slice(1),16),R=((x>>16)&255)/255,G=((x>>8)&255)/255,B=(x&255)/255;function L(c){return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4)}return 0.2126*L(R)+0.7152*L(G)+0.0722*L(B)>0.55?'#1a1f2e':'#ffffff'}var c=localStorage.getItem(${JSON.stringify(SCHOOL_COLOR_STORAGE_KEY)});if(c)r.setAttribute('data-school-color',c);var b=localStorage.getItem(${JSON.stringify(SCHOOL_BG_STORAGE_KEY)});if(b)r.setAttribute('data-school-bg',b);var ah=n(localStorage.getItem(${JSON.stringify(SCHOOL_ACCENT_HEX_KEY)}));if(ah){r.style.setProperty('--school-accent-custom',ah);r.style.setProperty('--school-accent-fg',fg(ah))}var bh=n(localStorage.getItem(${JSON.stringify(SCHOOL_BG_HEX_KEY)}));if(bh){r.style.setProperty('--school-bg-custom',bh);r.style.setProperty('--school-bg-fg',fg(bh))}}catch(e){}})();`;
}
