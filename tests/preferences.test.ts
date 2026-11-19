import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadSlowDemo, saveSlowDemo } from '../src/preferences';

const key = 'kakitori-slow-demo';
const values = new Map<string, string>();

describe('お手本の速度設定', () => {
  beforeEach(() => {
    values.clear();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => values.get(k) ?? null,
      setItem: (k: string, value: string) => values.set(k, value)
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('未保存なら通常速度にする', () => expect(loadSlowDemo()).toBe(false));

  it.each([true, false])('設定 %s を保存して読み込む', value => {
    saveSlowDemo(value);
    expect(values.get(key)).toBe(String(value));
    expect(loadSlowDemo()).toBe(value);
  });

  it('読み込みできなければ通常速度にする', () => {
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => { throw new Error('読込不可'); });
    expect(loadSlowDemo()).toBe(false);
  });

  it('ストレージへのアクセス自体が失敗しても継続する', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() { throw new Error('アクセス不可'); }
    });
    expect(loadSlowDemo()).toBe(false);
    expect(() => saveSlowDemo(true)).not.toThrow();
  });

  it.each([true, false])('保存できなくても選択した設定 %s を維持する', value => {
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('保存不可'); });
    let slowDemo = !value;
    const toggle = () => { slowDemo = value; saveSlowDemo(slowDemo); };
    expect(toggle).not.toThrow();
    expect(slowDemo).toBe(value);
  });
});
