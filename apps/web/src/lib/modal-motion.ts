import { cn } from '@/lib/utils';

/** Fast modal backdrop — no backdrop-blur (blur is slow on mobile). */
export const MODAL_BACKDROP =
  'absolute inset-0 bg-background/85 animate-in fade-in duration-150';

/** Fast centered / sheet panel entrance. */
export function modalPanelClass() {
  return cn(
    'animate-in fade-in zoom-in-95 duration-150 ease-out',
  );
}
