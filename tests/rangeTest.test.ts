import { describe, expect, it } from 'vitest';
import { emptyRangeMessage, rangeTestError } from '../src/rangeTest';

describe('範囲テストの入力確認', () => {
  it.each([[1, 0, 5], [1, 1, 1], [NaN, NaN, NaN]])('空の一覧では番号や出題数より先に案内する', (from, to, count) => {
    expect(rangeTestError(0, from, to, count)).toBe(emptyRangeMessage);
    expect(emptyRangeMessage).not.toContain('1〜0');
  });
  it('有効な範囲と出題数を受け入れる', () => expect(rangeTestError(5, 2, 4, 2)).toBe(''));
  it('一字の一覧で一問のテストを受け入れる', () => expect(rangeTestError(1, 1, 1, 1)).toBe(''));
  it.each([[0, 3], [1, 6], [4, 2], [1.5, 3], [1, NaN]])('無効な番号 %s〜%s を拒否する', (from, to) => {
    expect(rangeTestError(5, from, to, 1)).toBe('番号は1〜5の範囲で、最初の番号を小さくしてください。');
  });
  it.each([0, 4, 1.5, NaN])('無効な出題数 %s を拒否する', count => {
    expect(rangeTestError(5, 2, 4, count)).toBe('出題数は1〜3問にしてください。');
  });
});
