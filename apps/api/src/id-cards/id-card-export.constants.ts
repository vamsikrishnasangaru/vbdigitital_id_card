/** Must stay in sync with apps/web/src/lib/designer-utils.ts print export constants. */

export const CARD_DESIGN_PPI = 96;

/** Final PVC print DPI (CR80 landscape → 1013 × 638 px). */
export const PRINT_OUTPUT_DPI = 300;

/** Internal render DPI before downscale to print size. */
export const PRINT_RENDER_DPI = 600;

export const PRINT_RENDER_PIXEL_RATIO = PRINT_RENDER_DPI / CARD_DESIGN_PPI;

export const PRINT_EXPORT_PIXEL_SIZE = {
  HORIZONTAL: { width: 1013, height: 638 },
  VERTICAL: { width: 638, height: 1013 },
} as const;
