import { describe, expect, it } from 'vitest';
import { directionScore, evaluate, normalize, resample, type Stroke } from '../src/scoring';

const horizontal: Stroke = [{ x: 10, y: 20 }, { x: 50, y: 20 }, { x: 90, y: 20 }];
const vertical: Stroke = [{ x: 50, y: 10 }, { x: 50, y: 90 }];

describe('筆順判定', () => {
  it('座標を0〜1へ正規化する', () => { const n = normalize([horizontal]); expect(n[0][0]).toEqual({ x: 0, y: 0 }); expect(n[0].at(-1)!.x).toBe(1); });
  it('パスを指定数に再標本化する', () => { const r = resample(horizontal, 5); expect(r).toHaveLength(5); expect(r[2].x).toBe(50); });
  it('逆方向を検出する', () => expect(directionScore([...horizontal].reverse(), horizontal)).toBe(0));
  it('正しい入力を高く評価する', () => expect(evaluate([horizontal, vertical], [horizontal, vertical]).total).toBeGreaterThan(85));
  it('正しい入力を合格にして褒める', () => { const result = evaluate([horizontal, vertical], [horizontal, vertical]); expect(result.passed).toBe(true); expect(result.messages[0]).toContain('すばらしい'); });
  it('子どもの小さなずれを許容する', () => expect(evaluate([[{ x: 11, y: 22 }, { x: 91, y: 21 }]], [horizontal]).total).toBeGreaterThan(60));
  it('始点・終点の大きなずれを下げる', () => expect(evaluate([[{ x: 50, y: 20 }, { x: 90, y: 20 }], vertical], [horizontal, vertical]).position).toBeLessThan(90));
  it('全く異なる軌跡を下げる', () => expect(evaluate([vertical], [horizontal]).shape).toBeLessThan(60));
  it('不足・余分な画を減点する', () => { expect(evaluate([horizontal], [horizontal, vertical]).total).toBeLessThan(80); expect(evaluate([horizontal, vertical, horizontal], [horizontal, vertical]).total).toBeLessThan(80); });
  it('入れ替わった画を検出して指摘する', () => { const result = evaluate([vertical, horizontal], [horizontal, vertical]); expect(result.order).toBeLessThan(100); expect(result.passed).toBe(false); expect(result.messages.join()).toContain('書き順'); });
  it('大きくずれた画を指摘する', () => expect(evaluate([[{ x: 0, y: 0 }, { x: 0.1, y: 0.1 }], vertical], [horizontal, vertical]).messages.join()).toMatch(/ずれ|書き始め/));
});
