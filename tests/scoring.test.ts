import { describe, expect, it } from 'vitest';
import { correctionStrokeIndices, directionScore, evaluate, isScored, normalize, resample, type Stroke } from '../src/scoring';

const horizontal: Stroke = [{ x: 10, y: 20 }, { x: 50, y: 20 }, { x: 90, y: 20 }];
const vertical: Stroke = [{ x: 50, y: 10 }, { x: 50, y: 90 }];

describe('resample endpoint regression', () => {
  const diagonal: Stroke = [{ x: 0, y: 0 }, { x: 0.8, y: 0.076 }];
  const checkSamples = (stroke: Stroke) => {
    const samples = resample(stroke);
    expect(samples).toHaveLength(32);
    expect(samples[0]).toEqual(stroke[0]);
    expect(samples.at(-1)).toEqual(stroke.at(-1));
    expect(samples.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
  };

  it('preserves exact endpoints for the rounding-overflow stroke', () => checkSamples(diagonal));
  it('scores the rounding-overflow stroke', () => {
    const result = evaluate([diagonal], [horizontal]);
    expect(isScored(result)).toBe(true);
    expect(Number.isFinite(result.total)).toBe(true);
  });
  it('handles a deterministic fuzz of two-point and multi-point strokes', () => {
    let seed = 42;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
    for (let i = 0; i < 500; i++) {
      const stroke = Array.from({ length: i % 2 ? 2 : 3 + i % 20 }, () => ({ x: random(), y: random() }));
      checkSamples(stroke);
      expect(isScored(evaluate([stroke], [horizontal]))).toBe(true);
    }
  });
  it('keeps ordinary horizontal samples unchanged', () => {
    const samples = resample(horizontal);
    samples.forEach((p, i) => {
      expect(p.x).toBeCloseTo(10 + 80 * i / 31, 12);
      expect(p.y).toBe(20);
    });
  });
  it('keeps empty, single-point and zero-length input behavior', () => {
    expect(resample([])).toEqual([]);
    const point = { x: 0.2, y: 0.3 };
    expect(resample([point])).toEqual(Array(32).fill(point));
    expect(resample([point, point])).toEqual(Array(32).fill(point));
  });
});

describe('修正するお手本の筆画', () => {
  it('筆画がなければ修正しない', () => expect(correctionStrokeIndices([])).toEqual([]));
  it('間違いがなければ修正しない', () => expect(correctionStrokeIndices([{ expected: 0, score: 90 }, { expected: 1, score: 55 }])).toEqual([]));
  it('後の筆画だけが低得点なら元の番号を使う', () => expect(correctionStrokeIndices([{ expected: 0, score: 90 }, { expected: 1, score: 54 }])).toEqual([1]));
  it('書き順が違えばその位置のお手本を示す', () => expect(correctionStrokeIndices([{ expected: 0, score: 90 }, { expected: 2, score: 90 }, { expected: 1, score: 90 }])).toEqual([1, 2]));
  it('書き順と得点の両方が悪くても重複しない', () => expect(correctionStrokeIndices([{ expected: 1, score: 20 }, { expected: 0, score: 20 }])).toEqual([0, 1]));
});

describe('筆順判定', () => {
  it('座標を0〜1へ正規化する', () => { const n = normalize([horizontal]); expect(n[0][0]).toEqual({ x: 0, y: 0 }); expect(n[0].at(-1)!.x).toBe(1); });
  it('パスを指定数に再標本化する', () => { const r = resample(horizontal, 5); expect(r).toHaveLength(5); expect(r[2].x).toBe(50); });
  it('逆方向を検出する', () => expect(directionScore([...horizontal].reverse(), horizontal)).toBe(0));
  it('正しい入力を高く評価する', () => expect(evaluate([horizontal, vertical], [horizontal, vertical]).total).toBeGreaterThan(85));
  it('正しい入力を合格にして褒める', () => { const result = evaluate([horizontal, vertical], [horizontal, vertical]); expect(result.passed).toBe(true); expect(result.messages[0]).toContain('すばらしい'); });
  it.each<{ actual: Stroke[]; expected: Stroke[]; message: string }>([
    { actual: [], expected: [], message: 'お手本を読み込めませんでした' },
    { actual: [horizontal], expected: [], message: 'お手本を読み込めませんでした' },
    { actual: [], expected: [horizontal], message: '漢字を書いてから' },
  ])('入力やお手本がない場合は0点で不合格にする: $message', ({ actual, expected, message }) => {
    const result = evaluate(actual, expected);
    expect(result).toMatchObject({ total: 0, order: 0, direction: 0, position: 0, shape: 0, passed: false, strokes: [] });
    expect(result.messages.join()).toContain(message);
    expect(result.messages.join()).not.toContain('すばらしい');
    expect(isScored(result)).toBe(false);
  });
  it('通常の入力は採点済みとして記録対象にする', () => expect(isScored(evaluate([vertical], [horizontal]))).toBe(true));
  it('子どもの小さなずれを許容する', () => expect(evaluate([[{ x: 11, y: 22 }, { x: 91, y: 21 }]], [horizontal]).total).toBeGreaterThan(60));
  it('始点・終点の大きなずれを下げる', () => expect(evaluate([[{ x: 50, y: 20 }, { x: 90, y: 20 }], vertical], [horizontal, vertical]).position).toBeLessThan(90));
  it('全く異なる軌跡を下げる', () => expect(evaluate([vertical], [horizontal]).shape).toBeLessThan(60));
  it('不足・余分な画を減点する', () => { expect(evaluate([horizontal], [horizontal, vertical]).total).toBeLessThan(80); expect(evaluate([horizontal, vertical, horizontal], [horizontal, vertical]).total).toBeLessThan(80); });
  it('入れ替わった画を検出して指摘する', () => { const result = evaluate([vertical, horizontal], [horizontal, vertical]); expect(result.order).toBeLessThan(100); expect(result.passed).toBe(false); expect(result.messages.join()).toContain('書き順'); });
  it('大きくずれた画を指摘する', () => expect(evaluate([[{ x: 0, y: 0 }, { x: 0.1, y: 0.1 }], vertical], [horizontal, vertical]).messages.join()).toMatch(/ずれ|書き始め/));
});
