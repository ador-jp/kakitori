import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearProgress, loadProgress, saveResult } from '../src/storage';

const values = new Map<string, string>();
vi.stubGlobal('localStorage', { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v), removeItem: (k: string) => values.delete(k) });
describe('学習記録', () => { beforeEach(() => { values.clear(); clearProgress(); }); it('回数・最新・最高点を端末内に保存する', () => { saveResult('海', 61); saveResult('海', 88); expect(loadProgress().海).toMatchObject({ attempts: 2, latest: 88, best: 88, lowScores: 1 }); }); it('端末へ保存できなくても採点を止めない', () => { vi.spyOn(localStorage, 'setItem').mockImplementationOnce(() => { throw new Error('保存不可'); }); expect(() => saveResult('海', 80)).not.toThrow(); }); });
