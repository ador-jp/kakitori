import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearProgress, loadProgress, saveResult } from '../src/storage';

const values = new Map<string, string>();
const key = 'kakitori-progress-v1';
const valid = { attempts: 2, latest: 61, best: 88, lowScores: 1 };
vi.stubGlobal('localStorage', { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v), removeItem: (k: string) => values.delete(k) });
describe('学習記録', () => { beforeEach(() => { values.clear(); clearProgress(); }); it('回数・最新・最高点を端末内に保存する', () => { saveResult('海', 61); saveResult('海', 88); expect(loadProgress().海).toMatchObject({ attempts: 2, latest: 88, best: 88, lowScores: 1 }); }); it('端末へ保存できなくても採点を止めない', () => { vi.spyOn(localStorage, 'setItem').mockImplementationOnce(() => { throw new Error('保存不可'); }); expect(() => saveResult('海', 80)).not.toThrow(); }); });

describe('保存データの検証', () => {
  beforeEach(() => values.clear());

  it('未保存なら空の記録を返す', () => expect(loadProgress()).toEqual({}));

  it('有効な記録を保持する', () => {
    values.set(key, JSON.stringify({ 海: valid }));
    expect(loadProgress()).toEqual({ 海: valid });
    saveResult('海', 80);
    expect(loadProgress().海).toEqual({ attempts: 3, latest: 80, best: 88, lowScores: 1 });
  });

  it.each(['{broken', 'null', '[]', '[1]', '42', '"text"', 'true'])('不正なルート %s を無視する', raw => {
    values.set(key, raw);
    expect(loadProgress()).toEqual({});
  });

  it('不完全・非数値の記録だけを除外する', () => {
    const invalid = { missing: {}, partial: { attempts: 1 }, null: null, array: [1, 2, 3, 4] };
    const records: Record<string, unknown> = { 海: valid, ...invalid };
    for (const field of ['attempts', 'latest', 'best', 'lowScores']) {
      for (const value of ['1', null, true, {}, []]) {
        records[`${field}-${JSON.stringify(value)}`] = { ...valid, [field]: value };
      }
    }
    values.set(key, JSON.stringify(records));
    expect(loadProgress()).toEqual({ 海: valid });
    expect(() => saveResult('missing', 80)).not.toThrow();
    expect(loadProgress()).toEqual({ 海: valid, missing: { attempts: 1, latest: 80, best: 80, lowScores: 0 } });
  });

  it.each(['attempts', 'latest', 'best', 'lowScores'])('有限でない %s を除外する', field => {
    values.set(key, `{"海":${JSON.stringify(valid)},"山":{${Object.keys(valid).map(k => `"${k}":${k === field ? '1e400' : '1'}`).join(',')}}}`);
    expect(loadProgress()).toEqual({ 海: valid });
  });

  it.each(['{broken', 'null', '[]', '{"海":{}}', '{"海":{"attempts":"1"}}'])('壊れたデータ %s の上から安全に保存する', raw => {
    values.set(key, raw);
    expect(() => saveResult('海', 80)).not.toThrow();
    expect(loadProgress()).toEqual({ 海: { attempts: 1, latest: 80, best: 80, lowScores: 0 } });
  });

  it('読み込みできなくても採点を止めない', () => {
    vi.spyOn(localStorage, 'getItem').mockImplementationOnce(() => { throw new Error('読込不可'); });
    expect(() => saveResult('海', 80)).not.toThrow();
    expect(loadProgress().海).toEqual({ attempts: 1, latest: 80, best: 80, lowScores: 0 });
  });
});
