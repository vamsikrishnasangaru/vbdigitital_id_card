/** Must stay in sync with apps/web/src/lib/designer-utils.ts DOWNLOAD_PIXEL_RATIO. */

export const CARD_DESIGN_PPI = 96;

/** Konva stage.toCanvas() absolute pixelRatio — print quality (~1152 DPI). */
export const DOWNLOAD_PIXEL_RATIO = 12;

/** Batch ZIP export — 480 DPI default; fast PVC prints. Override with ID_CARD_BATCH_PIXEL_RATIO (max 8). */
export const BATCH_DOWNLOAD_PIXEL_RATIO = Math.max(
  4,
  Math.min(8, Number(process.env.ID_CARD_BATCH_PIXEL_RATIO) || 5),
);

export const DOWNLOAD_RENDER_PIXEL_RATIO = DOWNLOAD_PIXEL_RATIO;
export const BATCH_RENDER_PIXEL_RATIO = BATCH_DOWNLOAD_PIXEL_RATIO;
