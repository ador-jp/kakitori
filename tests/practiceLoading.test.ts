import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { evaluate } from '../src/scoring';
import { saveResult } from '../src/storage';

vi.mock('virtual:pwa-register', () => ({ registerSW: vi.fn() }));
vi.mock('../src/preferences', () => ({ loadSlowDemo: () => false }));
vi.mock('../src/selection', () => ({ selectRandom: () => ['一', '二'] }));
vi.mock('../src/storage', () => ({ loadProgress: () => ({}), saveResult: vi.fn() }));
vi.mock('../src/scoring', () => ({
  evaluate: vi.fn(() => ({ total: 85, strokes: [], messages: [], passed: true })),
  isScored: () => true,
  correctionStrokeIndices: () => []
}));

type Node = { value: string; onclick?: (event: unknown) => void; [key: string]: unknown };

class Screen {
  private html = '';
  private nodes = new Map<string, Node>();
  get innerHTML() { return this.html; }
  set innerHTML(html: string) {
    this.html = html;
    this.nodes.clear();
    for (const tag of html.matchAll(/<[^/!][^>]*>/g)) {
      const id = tag[0].match(/id="([^"]+)"/), classes = tag[0].match(/class="([^"]+)"/);
      const node: Node = { value: tag[0].match(/value="([^"]*)"/)?.[1] || '' };
      if (id) this.nodes.set(`#${id[1]}`, node);
      if (classes) for (const name of classes[1].split(' ')) this.nodes.set(`.${name}`, node);
    }
  }
  querySelector(selector: string) { return this.nodes.get(selector) || null; }
  querySelectorAll() { return []; }
  click(selector: string) {
    const node = this.querySelector(selector)!;
    node.onclick!({ currentTarget: node });
  }
}

let app: Screen;
let loads: Array<{ resolve: () => void; reject: (error: Error) => void }>;
let frames: FrameRequestCallback[];
const settle = () => vi.dynamicImportSettled();

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  app = new Screen(); loads = []; frames = [];
  vi.stubGlobal('location', { search: '?grade=e1', protocol: 'file:' });
  vi.stubGlobal('navigator', {});
  vi.stubGlobal('history', { replaceState: vi.fn() });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.push(callback); });
  vi.stubGlobal('document', {
    querySelector: () => app,
    createElement: () => ({ textContent: '', get innerHTML() { return this.textContent.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'); } }),
    createElementNS: () => ({ style: {}, append() {}, remove() {} }),
    body: { append() {} }
  });
  vi.stubGlobal('DOMParser', class { parseFromString() { return { querySelectorAll: () => [] }; } });
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    if (url.endsWith('meta.json')) return Promise.resolve({ json: () => ({ e1: ['一', '二'], e2: [], e3: [], e4: [], e5: [], e6: [], j1: [], j2: [], j3: [], joyo: ['一', '二'] }) });
    if (url.endsWith('prompts.json')) return Promise.resolve({ json: () => ({ 一: { reading: 'いち', example: '一' }, 二: { reading: 'に', example: '二' } }) });
    return new Promise((resolve, reject) => loads.push({ resolve: () => resolve({ ok: true, text: () => '' }), reject }));
  }));
  await import('../src/main');
  await settle();
});

afterEach(() => vi.unstubAllGlobals());

async function startTest() {
  app.querySelector('#to')!.value = '2';
  app.querySelector('#test-count')!.value = '2';
  app.click('#start-test');
  loads.at(-1)!.resolve();
  await settle();
}

describe('practice reference loading screens', () => {
  it('shows a reference error with retry and a working back-to-list button', async () => {
    await startTest();
    app.click('#next');
    loads[1].reject(new Error('お手本を読み込めませんでした'));
    await settle();
    expect(app.innerHTML).toContain('<p role="alert">お手本を読み込めませんでした</p>');
    expect(app.innerHTML).toContain('もう一度</button>');
    expect(app.innerHTML).toContain('← 漢字一覧</button>');
    expect(app.querySelector('#retry')).not.toBeNull();
    app.click('.back');
    expect(app.innerHTML).toContain('練習する漢字を選んでください');
  });

  it('retries the same kanji and restores practice without advancing the test', async () => {
    await startTest();
    app.click('#next');
    loads[1].reject(new Error('offline'));
    await settle();
    app.click('#retry');
    expect(fetch).toHaveBeenLastCalledWith('./data/kanji/04e8c.svg');
    expect(app.innerHTML).toContain('お手本を読み込んでいます');
    loads[2].resolve();
    await settle();
    expect(app.innerHTML).toContain('テスト 2問目');
    expect(app.querySelector('#judge')).not.toBeNull();
  });

  it('ignores a stale failure after a different kanji has loaded', async () => {
    await startTest();
    app.click('#next');
    app.click('.back');
    await startTest();
    const current = app.innerHTML;
    loads[1].reject(new Error('late failure'));
    await settle();
    expect(app.innerHTML).toBe(current);
    expect(app.innerHTML).not.toContain('role="alert"');
    expect(app.querySelector('#retry')).toBeNull();
  });

  it('disables empty-list tests and guards direct start calls without loading a reference', () => {
    app.click('.back');
    app.click('#weak');
    expect(app.innerHTML).toContain('id="start-test" class="primary" disabled');
    expect(app.innerHTML).toContain('テストに出題する漢字がありません。');
    app.click('#start-test');
    expect(app.querySelector('#test-error')!.textContent).toBe('テストに出題する漢字がありません。');
    expect(loads).toHaveLength(0);
    expect(app.innerHTML).not.toContain('1〜0');
  });

  it.each(['resolve', 'reject'] as const)('keeps the test summary when a pending reference later %ss', async outcome => {
    await startTest();
    const next = app.querySelector('#next')!.onclick!;
    next({});
    next({});
    expect(app.innerHTML).toContain('<h1>テスト結果</h1>');
    if (outcome === 'resolve') loads[1].resolve();
    else loads[1].reject(new Error('late failure'));
    await settle();
    expect(app.innerHTML).toContain('<h1>テスト結果</h1>');
    expect(app.innerHTML).not.toContain('テスト 3問目');
  });

  it('removes scoring controls during loading and restores working controls after completion', async () => {
    await startTest();
    app.click('#next');
    expect(app.innerHTML).toContain('お手本を読み込んでいます');
    expect(app.querySelector('#judge')).toBeNull();
    expect(app.querySelector('#board')).toBeNull();
    expect(app.querySelector('#next')).toBeNull();
    expect(saveResult).not.toHaveBeenCalled();
    loads[1].resolve();
    await settle();
    expect(app.innerHTML).toContain('テスト 2問目');
    app.click('#judge');
    frames.shift()!(0);
    expect(evaluate).toHaveBeenCalledOnce();
    expect(saveResult).toHaveBeenCalledExactlyOnceWith('二', 85);
  });

  it('discards scoring queued before the next reference starts loading', async () => {
    await startTest();
    app.click('#judge');
    app.click('#next');
    frames.shift()!(0);
    expect(evaluate).not.toHaveBeenCalled();
    expect(saveResult).not.toHaveBeenCalled();
    expect(app.innerHTML).toContain('お手本を読み込んでいます');
    loads[1].resolve();
    await settle();
    expect(app.innerHTML).toContain('テスト 2問目');
  });
});
