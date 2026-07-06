/** Must stay in sync with apps/web/src/lib/designer-utils.ts download export constants. */

export const CARD_DESIGN_PPI = 96;

/** Same supersampling as on-screen preview — no downscale on capture. */
export const DOWNLOAD_PIXEL_RATIO = 6;

export const DOWNLOAD_RENDER_PIXEL_RATIO = DOWNLOAD_PIXEL_RATIO;

const CARD_LOGICAL = {
  HORIZONTAL: { width: 3.375 * CARD_DESIGN_PPI, height: 2.125 * CARD_DESIGN_PPI },
  VERTICAL: { width: 2.125 * CARD_DESIGN_PPI, height: 3.375 * CARD_DESIGN_PPI },
} as const;

export function getExportPixelSize(orientation: 'HORIZONTAL' | 'VERTICAL') {
  const logical = CARD_LOGICAL[orientation];
  return {
    width: Math.round(logical.width * DOWNLOAD_PIXEL_RATIO),
    height: Math.round(logical.height * DOWNLOAD_PIXEL_RATIO),
  };
}
