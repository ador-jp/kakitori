import type { Point, Stroke } from './scoring';

type Pointer = { pointerId: number; isPrimary: boolean };

export function createPointerStroke(strokes: Stroke[]) {
  let activeId: number | null = null;
  let current: Stroke | null = null;
  const owns = (event: Pointer) => event.isPrimary && event.pointerId === activeId;
  return {
    down(event: Pointer & { button?: number }, point: Point) {
      if (!event.isPrimary || activeId !== null || (event.button ?? 0) !== 0) return false;
      activeId = event.pointerId;
      current = [point];
      strokes.push(current);
      return true;
    },
    move(event: Pointer, point: Point) {
      if (!owns(event) || !current) return false;
      const last = current.at(-1)!;
      if (Math.hypot(point.x - last.x, point.y - last.y) <= .004) return false;
      current.push(point);
      return true;
    },
    up(event: Pointer) {
      if (!owns(event)) return false;
      activeId = null;
      current = null;
      return true;
    },
    cancel(event: Pick<Pointer, 'pointerId'>) {
      if (event.pointerId !== activeId || !current) return false;
      const index = strokes.indexOf(current);
      if (index !== -1) strokes.splice(index, 1);
      activeId = null;
      current = null;
      return true;
    },
  };
}
