import { describe, expect, it } from 'vitest';
import meta from '../public/data/meta.json';
import prompts from '../public/data/prompts.json';
describe('漢字データ', () => { it('公式の小学校配当字数を満たす', () => expect(['e1','e2','e3','e4','e5','e6'].map(k => meta[k as keyof typeof meta].length)).toEqual([80,160,200,202,193,191])); it('常用漢字2136字に重複がない', () => expect(new Set(meta.joyo).size).toBe(2136)); it('全常用漢字に正式な読みと用例がある', () => expect(meta.joyo.filter(char => !(prompts as Record<string, { reading: string; example: string }>)[char]?.example.includes(char))).toEqual([])); });
