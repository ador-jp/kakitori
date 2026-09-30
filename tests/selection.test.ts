import { describe, expect, it } from 'vitest';
import { selectRandom } from '../src/selection';

describe('範囲テスト抽出', () => {
  it('指定範囲から指定数を重複なしで抽出する', () => { const result = selectRandom(['一','二','三','四','五'], 2, 4, 2, () => 0); expect(result).toHaveLength(2); expect(new Set(result).size).toBe(2); expect(result.every(char => ['二','三','四'].includes(char))).toBe(true); });
});
