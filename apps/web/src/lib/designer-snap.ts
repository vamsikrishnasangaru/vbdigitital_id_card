/** Grid spacing in design pixels (96 PPI); scaled on canvas via ppiRatio. */
export const DESIGN_GRID_STEP = 8;

/** Snap distance in design pixels before alignment guides engage. */
export const DESIGN_SNAP_THRESHOLD = 6;

/** Draw a bolder grid line every N minor steps. */
export const DESIGN_GRID_MAJOR_EVERY = 5;

export interface SnapGuides {
  vertical: number[];
  horizontal: number[];
}

export interface ElementBounds {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export const EMPTY_SNAP_GUIDES: SnapGuides = { vertical: [], horizontal: [] };

function snapToStep(value: number, step: number): number {
  if (step <= 0) return value;
  return Math.round(value / step) * step;
}

function findAxisSnap(
  pos: number,
  span: number,
  targets: number[],
  threshold: number,
): { pos: number; guide: number } | null {
  const left = pos;
  const center = pos + span / 2;
  const right = pos + span;

  let best: { dist: number; pos: number; guide: number } | null = null;

  for (const line of targets) {
    const candidates = [
      { pos: line, dist: Math.abs(left - line), guide: line },
      { pos: line - span / 2, dist: Math.abs(center - line), guide: line },
      { pos: line - span, dist: Math.abs(right - line), guide: line },
    ];
    for (const c of candidates) {
      if (c.dist <= threshold && (!best || c.dist < best.dist)) {
        best = { dist: c.dist, pos: c.pos, guide: c.guide };
      }
    }
  }

  return best ? { pos: best.pos, guide: best.guide } : null;
}

function uniqueGuides(values: number[]): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const v of values) {
    const key = Math.round(v * 100) / 100;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

/** Keep element inside the card — used during live drag (no grid or alignment pull). */
export function clampDragToCard(
  pos: { x: number; y: number },
  elW: number,
  elH: number,
  cardW: number,
  cardH: number,
): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(Math.max(0, cardW - elW), pos.x)),
    y: Math.max(0, Math.min(Math.max(0, cardH - elH), pos.y)),
  };
}

export function snapDragPosition(
  pos: { x: number; y: number },
  elW: number,
  elH: number,
  cardW: number,
  cardH: number,
  options: {
    gridStep: number;
    threshold: number;
    enableGrid: boolean;
    enableAlignment: boolean;
    others: ElementBounds[];
  },
): { x: number; y: number; guides: SnapGuides } {
  let x = Math.max(0, Math.min(Math.max(0, cardW - elW), pos.x));
  let y = Math.max(0, Math.min(Math.max(0, cardH - elH), pos.y));

  const verticalGuides: number[] = [];
  const horizontalGuides: number[] = [];

  if (options.enableAlignment) {
    const xTargets: number[] = [0, cardW / 2, cardW];
    const yTargets: number[] = [0, cardH / 2, cardH];

    for (const o of options.others) {
      xTargets.push(o.x, o.x + o.width / 2, o.x + o.width);
      yTargets.push(o.y, o.y + o.height / 2, o.y + o.height);
    }

    const xSnap = findAxisSnap(x, elW, xTargets, options.threshold);
    if (xSnap) {
      x = Math.max(0, Math.min(cardW - elW, xSnap.pos));
      verticalGuides.push(xSnap.guide);
    }

    const ySnap = findAxisSnap(y, elH, yTargets, options.threshold);
    if (ySnap) {
      y = Math.max(0, Math.min(cardH - elH, ySnap.pos));
      horizontalGuides.push(ySnap.guide);
    }
  }

  if (options.enableGrid && options.gridStep > 0 && verticalGuides.length === 0) {
    x = snapToStep(x, options.gridStep);
    x = Math.max(0, Math.min(cardW - elW, x));
  }
  if (options.enableGrid && options.gridStep > 0 && horizontalGuides.length === 0) {
    y = snapToStep(y, options.gridStep);
    y = Math.max(0, Math.min(cardH - elH, y));
  }

  return {
    x,
    y,
    guides: {
      vertical: uniqueGuides(verticalGuides),
      horizontal: uniqueGuides(horizontalGuides),
    },
  };
}
