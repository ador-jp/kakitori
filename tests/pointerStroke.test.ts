import { describe, expect, it } from 'vitest';
import { createPointerStroke } from '../src/pointerStroke';
import type { Stroke } from '../src/scoring';

const first = { pointerId: 1, isPrimary: true };
const second = { pointerId: 2, isPrimary: true };
const start = { x: .1, y: .1 }, end = { x: .8, y: .8 };

function setup() {
  const strokes: Stroke[] = [];
  return { strokes, drawing: createPointerStroke(strokes) };
}

describe('single pointer strokes', () => {
  it('records a normal down/move/up stroke and accepts the next stroke', () => {
    const { strokes, drawing } = setup();
    expect(drawing.down(first, start)).toBe(true);
    expect(drawing.move(first, end)).toBe(true);
    expect(drawing.up(first)).toBe(true);
    expect(drawing.move(first, start)).toBe(false);
    expect(strokes).toEqual([[start, end]]);
    expect(drawing.down(second, end)).toBe(true);
    expect(strokes).toEqual([[start, end], [end]]);
  });

  it('ignores a second pointer down, move, up and cancel while drawing', () => {
    const { strokes, drawing } = setup();
    drawing.down(first, start);
    expect(drawing.down(second, end)).toBe(false);
    expect(drawing.move(second, end)).toBe(false);
    expect(drawing.up(second)).toBe(false);
    expect(drawing.cancel(second)).toBe(false);
    expect(strokes).toEqual([[start]]);
    expect(drawing.move(first, end)).toBe(true);
    expect(drawing.up(first)).toBe(true);
    expect(strokes).toEqual([[start, end]]);
  });

  it('ignores non-primary pointers even when idle', () => {
    const { strokes, drawing } = setup();
    const secondary = { pointerId: 2, isPrimary: false };
    expect(drawing.down(secondary, start)).toBe(false);
    expect(drawing.move(secondary, end)).toBe(false);
    expect(drawing.up(secondary)).toBe(false);
    expect(strokes).toEqual([]);
  });

  it('discards only the cancelled stroke and resets for a new pointer', () => {
    const { strokes, drawing } = setup();
    drawing.down(first, start);
    drawing.up(first);
    drawing.down(first, start);
    drawing.move(first, end);
    expect(drawing.cancel(first)).toBe(true);
    expect(strokes).toEqual([[start]]);
    expect(drawing.move(first, end)).toBe(false);
    expect(drawing.up(first)).toBe(false);
    expect(drawing.cancel(first)).toBe(false);
    expect(drawing.down(second, end)).toBe(true);
  });

  it('preserves other strokes and resets when the active stroke was already removed', () => {
    const { strokes, drawing } = setup();
    drawing.down(first, start);
    drawing.up(first);
    drawing.down(first, end);
    strokes.pop();
    expect(drawing.cancel(first)).toBe(true);
    expect(strokes).toEqual([[start]]);
    expect(drawing.move(first, end)).toBe(false);
    expect(drawing.up(first)).toBe(false);
    expect(drawing.cancel(first)).toBe(false);
    expect(drawing.down(second, end)).toBe(true);
    expect(strokes).toEqual([[start], [end]]);
  });

  it('does not discard a completed stroke on subsequent capture loss', () => {
    const { strokes, drawing } = setup();
    drawing.down(first, start);
    drawing.up(first);
    expect(drawing.cancel(first)).toBe(false);
    expect(strokes).toEqual([[start]]);
  });

  it('ignores moves, completion and cancellation when idle and tiny moves when active', () => {
    const { strokes, drawing } = setup();
    expect(drawing.move(first, start)).toBe(false);
    expect(drawing.up(first)).toBe(false);
    expect(drawing.cancel(first)).toBe(false);
    drawing.down(first, start);
    expect(drawing.move(first, { x: .101, y: .101 })).toBe(false);
    expect(strokes).toEqual([[start]]);
  });
});
