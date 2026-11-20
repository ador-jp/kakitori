import { TOLERANCE } from './config';

export type Point = { x: number; y: number };
export type Stroke = Point[];
export type StrokeResult = { expected: number; actual: number; direction: number; start: number; end: number; shape: number; position: number; score: number };
export type Evaluation = { total: number; order: number; direction: number; position: number; shape: number; passed: boolean; strokes: StrokeResult[]; messages: string[] };

export function correctionStrokeIndices(strokes: Pick<StrokeResult, 'expected' | 'score'>[]): number[] {
  return [...new Set(strokes.flatMap((r, i) =>
    r.expected !== i ? [i] : r.score < 55 ? [r.expected] : []))];
}

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const clampScore = (error: number, tolerance: number) => Math.round(Math.max(0, 100 * (1 - error / tolerance)));

export function resample(points: Stroke, count: number = TOLERANCE.samplePoints): Stroke {
  if (!points.length) return [];
  if (points.length === 1) return Array(count).fill(points[0]);
  const lengths = [0];
  for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + distance(points[i - 1], points[i]));
  const total = lengths.at(-1)!;
  if (!total) return Array(count).fill(points[0]);
  return Array.from({ length: count }, (_, i) => {
    if (i === 0) return points[0];
    if (i === count - 1) return points.at(-1)!;
    const target = total * i / (count - 1);
    let j = 1;
    while (j < points.length - 1 && lengths[j] < target) j++;
    const ratio = (target - lengths[j - 1]) / (lengths[j] - lengths[j - 1]);
    return { x: points[j - 1].x + (points[j].x - points[j - 1].x) * ratio, y: points[j - 1].y + (points[j].y - points[j - 1].y) * ratio };
  });
}

export function normalize(strokes: Stroke[]): Stroke[] {
  const points = strokes.flat();
  if (!points.length) return strokes;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  const size = Math.max(maxX - minX, maxY - minY, 1);
  return strokes.map(s => s.map(p => ({ x: (p.x - minX) / size, y: (p.y - minY) / size })));
}

export function directionScore(actual: Stroke, expected: Stroke): number {
  if (actual.length < 2 || expected.length < 2) return 0;
  const av = { x: actual.at(-1)!.x - actual[0].x, y: actual.at(-1)!.y - actual[0].y };
  const ev = { x: expected.at(-1)!.x - expected[0].x, y: expected.at(-1)!.y - expected[0].y };
  const denom = Math.hypot(av.x, av.y) * Math.hypot(ev.x, ev.y);
  return denom ? Math.round(Math.max(0, (av.x * ev.x + av.y * ev.y) / denom) * 100) : 0;
}

function shapeError(a: Stroke, b: Stroke): number {
  const ar = resample(a), br = resample(b);
  return ar.reduce((sum, p, i) => sum + distance(p, br[i]), 0) / ar.length;
}

function identityError(a: Stroke, e: Stroke): number {
  const forward = distance(a[0], e[0]) + distance(a.at(-1)!, e.at(-1)!) + shapeError(a, e);
  const reverse = [...e].reverse();
  return Math.min(forward, distance(a[0], reverse[0]) + distance(a.at(-1)!, reverse.at(-1)!) + shapeError(a, reverse));
}

export const isScored = (r: Evaluation): boolean => r.strokes.length > 0;

export function evaluate(actualRaw: Stroke[], expectedRaw: Stroke[]): Evaluation {
  if (!expectedRaw.length || !actualRaw.length) {
    const messages = [!expectedRaw.length ? 'お手本を読み込めませんでした。ページを再読み込みしてください。' : '枠の中に漢字を書いてから判定してください。'];
    return { total: 0, order: 0, direction: 0, position: 0, shape: 0, passed: false, strokes: [], messages };
  }
  const actual = normalize(actualRaw), expected = normalize(expectedRaw);
  const n = Math.min(actual.length, expected.length);
  const results: StrokeResult[] = [];
  for (let i = 0; i < n; i++) {
    const a = actual[i];
    const matched = expected.reduce((best, e, j) => {
      const error = identityError(a, e);
      return error < best.error ? { j, error } : best;
    }, { j: 0, error: Infinity });
    const e = expected[i];
    const start = clampScore(distance(a[0], e[0]), TOLERANCE.startPoint);
    const end = clampScore(distance(a.at(-1)!, e.at(-1)!), TOLERANCE.endPoint);
    const direction = directionScore(a, e);
    const shape = clampScore(shapeError(resample(a), resample(e)), TOLERANCE.shape);
    const position = Math.round((start + end) / 2);
    results.push({ expected: matched.j, actual: i, direction, start, end, shape, position, score: Math.round((direction + shape * 2 + position) / 4) });
  }
  const countPenalty = Math.abs(actual.length - expected.length) * 18;
  const avg = (key: keyof StrokeResult) => n ? results.reduce((s, r) => s + Number(r[key]), 0) / n : 0;
  const orderMistakes = results.filter(r => r.expected !== r.actual).length;
  const order = Math.max(0, Math.round(100 - countPenalty - orderMistakes * 25));
  const direction = Math.round(avg('direction')), position = Math.round(avg('position')), shape = Math.round(avg('shape'));
  const total = Math.max(0, Math.round((order * 0.3 + direction * 0.2 + position * 0.2 + shape * 0.3) - countPenalty));
  const messages: string[] = [];
  if (actual.length !== expected.length) messages.push(`正しい画数：${expected.length}画　あなた：${actual.length}画`);
  results.forEach((r, i) => { if (r.expected !== i) messages.push(`${i + 1}画目の書き順を確認してみよう`); });
  results.forEach((r, i) => {
    if (r.direction < TOLERANCE.feedback.direction) messages.push(`${i + 1}画目は反対方向から書いているようです`);
    else if (r.start < TOLERANCE.feedback.start) messages.push(`${i + 1}画目の書き始めがずれています`);
    else if (r.end < TOLERANCE.feedback.end) messages.push(`${i + 1}画目の書き終わりがずれています`);
    else if (r.shape < TOLERANCE.feedback.shape) messages.push(`${i + 1}画目が、お手本から大きくずれています`);
  });
  const passed = actual.length === expected.length && !messages.length;
  if (passed) messages.push('たいへんよく書けました！すばらしい！');
  return { total, order, direction, position, shape, passed, strokes: results, messages };
}
