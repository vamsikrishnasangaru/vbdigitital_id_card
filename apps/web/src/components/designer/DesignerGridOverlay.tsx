'use client';

import { Line } from 'react-konva';
import {
  DESIGN_GRID_MAJOR_EVERY,
  type SnapGuides,
} from '@/lib/designer-snap';

interface DesignerGridOverlayProps {
  cardWidth: number;
  cardHeight: number;
  gridStep: number;
  showGrid: boolean;
  guides: SnapGuides;
}

export function DesignerGridOverlay({
  cardWidth,
  cardHeight,
  gridStep,
  showGrid,
  guides,
}: DesignerGridOverlayProps) {
  const nodes: React.ReactNode[] = [];

  if (showGrid && gridStep > 0) {
    let col = 0;
    for (let x = 0; x <= cardWidth; x += gridStep) {
      const major = col % DESIGN_GRID_MAJOR_EVERY === 0;
      nodes.push(
        <Line
          key={`gv-${x}`}
          points={[x, 0, x, cardHeight]}
          stroke={major ? 'rgba(99,102,241,0.35)' : 'rgba(148,163,184,0.2)'}
          strokeWidth={major ? 1 : 0.5}
          listening={false}
        />,
      );
      col += 1;
    }
    let row = 0;
    for (let y = 0; y <= cardHeight; y += gridStep) {
      const major = row % DESIGN_GRID_MAJOR_EVERY === 0;
      nodes.push(
        <Line
          key={`gh-${y}`}
          points={[0, y, cardWidth, y]}
          stroke={major ? 'rgba(99,102,241,0.35)' : 'rgba(148,163,184,0.2)'}
          strokeWidth={major ? 1 : 0.5}
          listening={false}
        />,
      );
      row += 1;
    }
  }

  for (const x of guides.vertical) {
    nodes.push(
      <Line
        key={`snap-v-${x}`}
        points={[x, 0, x, cardHeight]}
        stroke="#f472b6"
        strokeWidth={1}
        dash={[6, 4]}
        listening={false}
      />,
    );
  }

  for (const y of guides.horizontal) {
    nodes.push(
      <Line
        key={`snap-h-${y}`}
        points={[0, y, cardWidth, y]}
        stroke="#f472b6"
        strokeWidth={1}
        dash={[6, 4]}
        listening={false}
      />,
    );
  }

  return <>{nodes}</>;
}
