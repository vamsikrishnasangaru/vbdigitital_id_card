/** Must stay in sync with apps/web/src/lib/designer-utils.ts DOWNLOAD_PIXEL_RATIO. */

export const CARD_DESIGN_PPI = 96;

/** Konva stage.toCanvas() absolute pixelRatio — print quality (~1152 DPI). */
export const DOWNLOAD_PIXEL_RATIO = 12;

/** Multi-card zip: ~768 DPI — faster batch export, still above PVC print targets. */
export const BATCH_DOWNLOAD_PIXEL_RATIO = 8;

export const DOWNLOAD_RENDER_PIXEL_RATIO = DOWNLOAD_PIXEL_RATIO;
