'use client';

import { Image } from 'react-konva';
import { useCorsImage } from '@/hooks/useCorsImage';

interface StudentPhotoLayerProps {
  x: number;
  y: number;
  width: number;
  height: number;
  photoUrl: string;
  id: string;
}

export function StudentPhotoLayer({ x, y, width, height, photoUrl, id }: StudentPhotoLayerProps) {
  const [image, status] = useCorsImage(photoUrl || '');

  if (!photoUrl || status === 'failed' || !image) {
    return null;
  }

  return (
    <Image
      id={id}
      image={image}
      x={x}
      y={y}
      width={width}
      height={height}
      cornerRadius={4}
    />
  );
}
