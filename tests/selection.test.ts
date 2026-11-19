import { describe, expect, it } from 'vitest';
import { modeForKanjiSelection, randomItem, selectRandom } from '../src/selection';

describe('ランダム練習の漢字選択', () => {
  it('空なら漢字を返さない', () => expect(randomItem([])).toBeUndefined());
  it('一字ならその漢字を返す', () => expect(randomItem(['海'])).toBe('海'));
  it.each([0, 0.1, 0.5, 0.9, 0.999999])('乱数 %s でも一覧内の漢字を返す', value => {
    const chars = ['一', '二', '三'];
    expect(chars).toContain(randomItem(chars, () => value));
  });
});

describe('漢字選択後の練習モード', () => {
  it('テストモードから自由練習に戻る', () => expect(modeForKanjiSelection('test')).toBe('free'));

  it.each(['free', 'order'])('%s モードは維持する', mode => expect(modeForKanjiSelection(mode)).toBe(mode));
});

describe('範囲テスト抽出', () => {
  it('指定範囲から指定数を重複なしで抽出する', () => { const result = selectRandom(['一','二','三','四','五'], 2, 4, 2, () => 0); expect(result).toHaveLength(2); expect(new Set(result).size).toBe(2); expect(result.every(char => ['二','三','四'].includes(char))).toBe(true); });
});
