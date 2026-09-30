import { describe, expect, it } from 'vitest';
import meta from '../public/data/meta.json';
import readings from '../public/data/readings.json';
describe('漢字データ', () => { it('公式の小学校配当字数を満たす', () => expect(['e1','e2','e3','e4','e5','e6'].map(k => meta[k as keyof typeof meta].length)).toEqual([80,160,200,202,193,191])); it('常用漢字2136字に重複がない', () => expect(new Set(meta.joyo).size).toBe(2136)); it('全常用漢字にテスト用の読みがある', () => expect(meta.joyo.filter(char => !readings[char as keyof typeof readings])).toEqual([])); });
