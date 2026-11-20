import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { evaluate, isScored } from '../src/scoring';
import { saveResult } from '../src/storage';

vi.mock('virtual:pwa-register', () => ({ registerSW: vi.fn() }));
vi.mock('../src/preferences', () => ({ loadSlowDemo: () => false }));
vi.mock('../src/selection', async importOriginal => ({ ...await importOriginal<typeof import('../src/selection')>(), selectRandom: () => ['一', '二'] }));
vi.mock('../src/storage', () => ({ loadProgress: () => ({}), saveResult: vi.fn() }));
vi.mock('../src/scoring', () => ({
  evaluate: vi.fn(() => ({ total: 85, strokes: [], messages: [], passed: true })),
  isScored: vi.fn(() => true),
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
      if (id?.[1] === 'board') Object.assign(node, {
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
        setPointerCapture() {}, querySelectorAll: () => [], insertAdjacentHTML() {}
      });
      node.remove = () => {
        this.html = this.html.replace(/<section id="prompt-notice"[\s\S]*?<\/section>/, '');
        this.nodes.delete('#prompt-notice'); this.nodes.delete('#prompt-retry');
      };
      if (tag[0].startsWith('<main')) this.nodes.set('main', { value: '', insertAdjacentHTML: (_position: string, content: string) => {
        const previous = new Map(this.nodes);
        this.innerHTML = this.html.replace(/(<main[^>]*>)/, `$1${content}`);
        for (const [key, value] of previous) if (this.nodes.has(key)) this.nodes.set(key, value);
      } });
      const kanji = tag[0].match(/data-kanji="([^"]+)"/), grade = tag[0].match(/data-grade="([^"]+)"/);
      if (kanji) { node.dataset = { kanji: kanji[1] }; this.nodes.set(`[data-kanji="${kanji[1]}"]`, node); }
      if (grade) { node.dataset = { grade: grade[1] }; this.nodes.set(`[data-grade="${grade[1]}"]`, node); }
      if (id) this.nodes.set(`#${id[1]}`, node);
      if (classes) for (const name of classes[1].split(' ')) this.nodes.set(`.${name}`, node);
    }
  }
  querySelector(selector: string) { return this.nodes.get(selector) || null; }
  querySelectorAll(selector: string) { return [...this.nodes].filter(([key]) => key.startsWith(selector.slice(0, -1) + '=')).map(([, node]) => node); }
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
  vi.spyOn(console, 'error').mockImplementation(() => {});
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
    if (url.endsWith('meta.json')) return Promise.resolve({ ok: true, json: () => ({ e1: ['一', '二'], e2: [], e3: [], e4: [], e5: [], e6: [], j1: [], j2: [], j3: [], joyo: ['一', '二'] }) });
    if (url.endsWith('prompts.json')) return Promise.resolve({ ok: true, json: () => ({ 一: { reading: 'いち', example: '一' }, 二: { reading: 'に', example: '二' } }) });
    return new Promise((resolve, reject) => loads.push({ resolve: () => resolve({ ok: true, text: () => '' }), reject }));
  }));
  await import('../src/main');
  await settle();
});

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

async function startTest() {
  app.querySelector('#to')!.value = '2';
  app.querySelector('#test-count')!.value = '2';
  app.click('#start-test');
  loads.at(-1)!.resolve();
  await settle();
}

async function restart(overrides: { prompts?: () => Promise<unknown>; meta?: () => Promise<unknown> }, search = '') {
  vi.resetModules();
  app = new Screen(); loads = [];
  vi.stubGlobal('location', { search, protocol: 'file:' });
  const original = vi.mocked(fetch).getMockImplementation()!;
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    if (url.endsWith('prompts.json') && overrides.prompts) return overrides.prompts();
    if (url.endsWith('meta.json') && overrides.meta) return overrides.meta();
    return original(url);
  }));
  await import('../src/main');
  await settle();
}

const promptMessage = 'テスト問題を読み込めませんでした。通信状態を確認して、もう一度お試しください。';
const promptResponse = () => Promise.resolve({ ok: true, json: () => ({ 一: { reading: 'いち', example: '一' }, 二: { reading: 'に', example: '二' } }) });

function drawStroke() {
  let board = app.querySelector('#board')!;
  const event = { pointerId: 1, isPrimary: true, clientX: 10, clientY: 20, preventDefault() {} };
  (board.onpointerdown as (event: unknown) => void)(event);
  board = app.querySelector('#board')!;
  (board.onpointermove as (event: unknown) => void)({ ...event, clientX: 80 });
  (board.onpointerup as (event: unknown) => void)(event);
}

function judge() {
  app.click('#judge');
  frames.shift()!(0);
  frames = [];
}

describe('per-stroke hints', () => {
  it('logs evaluation errors without throwing or changing the hint', async () => {
    vi.stubGlobal('DOMParser', class { parseFromString() { return { querySelectorAll: () => [{ getAttribute: () => '' }] }; } });
    document.createElementNS = vi.fn(() => ({ style: {}, append() {}, remove() {}, setAttribute() {}, getTotalLength: () => 1, getPointAtLength: (x: number) => ({ x, y: 0 }) })) as unknown as typeof document.createElementNS;
    app.click('[data-kanji="一"]');
    loads[0].resolve();
    await settle();
    const hint = app.querySelector('#hint')!;
    const previous = hint.textContent;
    const error = new Error('hint evaluation failed');
    vi.mocked(evaluate).mockImplementationOnce(() => { throw error; });
    expect(() => drawStroke()).not.toThrow();
    expect(evaluate).toHaveBeenCalledOnce();
    expect(console.error).toHaveBeenCalledExactlyOnceWith(error);
    expect(hint.textContent).toBe(previous);
    expect(saveResult).not.toHaveBeenCalled();
  });
});

describe('new answers after judging', () => {
  beforeEach(() => {
    vi.stubGlobal('DOMParser', class { parseFromString() { return { querySelectorAll: () => [{ getAttribute: () => '' }] }; } });
    document.createElementNS = vi.fn(() => ({ style: {}, append() {}, remove() {}, setAttribute() {}, getTotalLength: () => 1, getPointAtLength: (x: number) => ({ x, y: 0 }) })) as unknown as typeof document.createElementNS;
  });

  const expectUnanswered = () => {
    expect(app.innerHTML).toContain('<h2>もんだい</h2>');
    expect(app.innerHTML).not.toContain('class="ref ');
    expect(app.querySelector('.result')).toBeNull();
    expect(app.querySelector('#model')).toBeNull();
  };

  it.each(['#clear', '#undo'])('hides the model and clears the result after %s in test mode', async control => {
    await startTest();
    drawStroke();
    judge();
    expect(app.innerHTML).toContain('class="ref ');
    expect(app.querySelector('.result')).not.toBeNull();
    app.click(control);
    expectUnanswered();
    drawStroke();
    judge();
    judge();
    expect(saveResult).toHaveBeenCalledTimes(2);
    app.click('#next');
    loads.at(-1)!.resolve();
    await settle();
    expectUnanswered();
    app.click('#next');
    expect(app.innerHTML).toContain('<b>一</b>85点');
  });

  it('keeps the board stationary and preserves pointer coordinates until pointerup', async () => {
    await startTest();
    drawStroke();
    judge();
    const board = app.querySelector('#board')!;
    board.getBoundingClientRect = () => ({ left: 0, top: 100, width: 100, height: 100 });
    const remove = vi.fn();
    board.querySelectorAll = vi.fn(() => [{ remove }]);
    const event = { pointerId: 1, isPrimary: true, clientX: 10, clientY: 120, preventDefault() {} };
    (board.onpointerdown as (event: unknown) => void)({ ...event, isPrimary: false });
    expect(app.querySelector('.result')).not.toBeNull();
    (board.onpointerdown as (event: unknown) => void)(event);
    expect(app.querySelector('#board')).toBe(board);
    expect(app.querySelector('.result')).not.toBeNull();
    expect(board.querySelectorAll).toHaveBeenCalledWith('.ref,.number,.correction,.success-circle,.success-mark');
    expect(remove).toHaveBeenCalled();
    (board.onpointermove as (event: unknown) => void)({ ...event, clientX: 80 });
    expect(app.querySelector('#board')).toBe(board);
    (board.onpointerup as (event: unknown) => void)(event);
    expectUnanswered();
    judge();
    judge();
    expect(saveResult).toHaveBeenCalledTimes(2);
    const strokes = vi.mocked(evaluate).mock.calls.at(-1)![0];
    expect(strokes).toHaveLength(2);
    expect(strokes[1]).toEqual([{ x: 0.1, y: 0.2 }, { x: 0.8, y: 0.2 }]);
  });

  it.each(['onpointercancel', 'onlostpointercapture'])('returns to the unanswered screen after %s', async handler => {
    await startTest();
    drawStroke();
    judge();
    const board = app.querySelector('#board')!;
    const event = { pointerId: 1, isPrimary: true, clientX: 10, clientY: 20, preventDefault() {} };
    (board.onpointerdown as (event: unknown) => void)(event);
    (board[handler] as (event: unknown) => void)(event);
    expectUnanswered();
    judge();
    expect(vi.mocked(evaluate).mock.calls.at(-1)![0]).toHaveLength(1);
  });

  it.each(['free', 'order'])('keeps the model visible after clearing in %s mode', async mode => {
    app.click('[data-kanji="一"]');
    loads[0].resolve();
    await settle();
    const select = app.querySelector('#mode')!;
    select.value = mode;
    (select.onchange as (event: unknown) => void)({ target: select });
    drawStroke();
    judge();
    app.click('#clear');
    expect(app.innerHTML).toContain('class="ref ');
    expect(app.querySelector('#model')).not.toBeNull();
    expect(app.querySelector('.result')).toBeNull();
  });
});

describe('saving judged attempts', () => {
  beforeEach(async () => {
    app.click('[data-kanji="一"]');
    loads[0].resolve();
    await settle();
    drawStroke();
  });

  it('shows repeated results but saves an unchanged drawing only once', () => {
    judge();
    judge();
    expect(evaluate).toHaveBeenCalledTimes(2);
    expect(app.innerHTML).toContain('85点');
    expect(saveResult).toHaveBeenCalledExactlyOnceWith('一', 85);
  });

  it('saves again after adding a stroke', () => {
    judge();
    drawStroke();
    judge();
    judge();
    expect(saveResult).toHaveBeenCalledTimes(2);
    expect(vi.mocked(evaluate).mock.calls.at(-1)![0]).toHaveLength(2);
  });

  it.each(['#clear', '#undo'])('saves a new attempt after %s and redrawing', control => {
    judge();
    app.click(control);
    drawStroke();
    judge();
    judge();
    expect(saveResult).toHaveBeenCalledTimes(2);
    expect(vi.mocked(evaluate).mock.calls.at(-1)![0]).toHaveLength(1);
  });

  it('saves again on the next kanji', async () => {
    judge();
    app.click('#next');
    loads[1].resolve();
    await settle();
    drawStroke();
    judge();
    judge();
    expect(saveResult).toHaveBeenCalledTimes(2);
    expect(saveResult).toHaveBeenLastCalledWith('二', 85);
  });

  it('saves again when starting the same kanji anew', async () => {
    judge();
    app.click('.back');
    app.click('[data-kanji="一"]');
    loads[1].resolve();
    await settle();
    drawStroke();
    judge();
    expect(saveResult).toHaveBeenCalledTimes(2);
  });

  it('treats a mode change as a new attempt even with unchanged strokes', () => {
    judge();
    const select = app.querySelector('#mode')!;
    select.value = 'order';
    (select.onchange as (event: unknown) => void)({ target: select });
    judge();
    judge();
    expect(saveResult).toHaveBeenCalledTimes(2);
  });

  it('does not consume the save when evaluation fails or is unscored', () => {
    vi.mocked(evaluate).mockImplementationOnce(() => { throw new Error('evaluation failed'); });
    judge();
    vi.mocked(isScored).mockReturnValueOnce(false);
    judge();
    expect(saveResult).not.toHaveBeenCalled();
    judge();
    judge();
    expect(saveResult).toHaveBeenCalledExactlyOnceWith('一', 85);
  });

  it('updates test question scores on every judge but saves once per attempt', async () => {
    app.click('.back');
    await startTest();
    drawStroke();
    judge();
    const result = vi.mocked(evaluate).mock.results.at(-1)!.value;
    vi.mocked(evaluate).mockReturnValueOnce({ ...result, total: 65 });
    judge();
    expect(saveResult).toHaveBeenCalledTimes(1);
    app.click('#next');
    loads.at(-1)!.resolve();
    await settle();
    drawStroke();
    judge();
    judge();
    expect(saveResult).toHaveBeenCalledTimes(2);
    expect(saveResult).toHaveBeenLastCalledWith('二', 85);
    app.click('#next');
    expect(app.innerHTML).toContain('平均 75点');
    expect(app.innerHTML).toContain('<b>一</b>65点');
    expect(app.innerHTML).toContain('<b>二</b>85点');
    app.click('#retry');
    loads.at(-1)!.resolve();
    await settle();
    drawStroke();
    judge();
    expect(saveResult).toHaveBeenCalledTimes(3);
  });
});

describe('grade parameters', () => {
  it.each(['constructor', '__proto__', 'toString', 'hasOwnProperty', 'unknown', ''])('falls back to the e1 list for grade=%s', async grade => {
    await restart({}, `?grade=${grade}`);
    expect(app.innerHTML).toContain('<h1>小学1年</h1>');
    expect(app.innerHTML).toContain('練習する漢字を選んでください');
    expect(app.querySelector('[data-kanji="一"]')).not.toBeNull();
    expect(history.replaceState).toHaveBeenLastCalledWith(null, '', '?grade=e1');
  });

  it.each([['e3', '小学3年'], ['joyo', '常用漢字']])('keeps the supported grade %s', async (grade, title) => {
    await restart({}, `?grade=${grade}`);
    expect(app.innerHTML).toContain(`<h1>${title}</h1>`);
    expect(app.innerHTML).toContain('練習する漢字を選んでください');
    expect(history.replaceState).toHaveBeenLastCalledWith(null, '', `?grade=${grade}`);
  });

  it.each(['inherited', 'non-array', 'unsupported'])('rejects %s metadata grade entries', async kind => {
    const data = Object.assign(Object.create({ e3: ['三'] }), { e1: ['一', '二'], joyo: ['一', '二'], extra: ['三'] });
    if (kind === 'non-array') data.e3 = '三';
    await restart({ meta: () => Promise.resolve({ ok: true, json: () => data }) }, `?grade=${kind === 'unsupported' ? 'extra' : 'e3'}`);
    expect(app.innerHTML).toContain('<h1>小学1年</h1>');
    expect(app.querySelector('[data-kanji="一"]')).not.toBeNull();
  });

  it('uses the fallback grade for next-kanji navigation', async () => {
    await restart({}, '?grade=constructor&kanji=一');
    loads[0].resolve();
    await settle();
    app.click('#next');
    expect(fetch).toHaveBeenLastCalledWith('./data/kanji/04e8c.svg');
    loads[1].resolve();
    await settle();
    expect(app.innerHTML).toContain('「二」の練習');
  });
});

describe('independent prompt loading', () => {
  it('waits for pending prompts before entering a test deep link', async () => {
    let resolvePrompts!: (response: unknown) => void;
    await restart({ prompts: () => new Promise(resolve => { resolvePrompts = resolve; }) }, '?grade=e1&kanji=一&mode=test');
    expect(loads).toHaveLength(0);
    expect(app.innerHTML).not.toContain(promptMessage);
    resolvePrompts(await promptResponse());
    await settle();
    expect(loads).toHaveLength(1);
    loads[0].resolve();
    await settle();
    expect(app.innerHTML).toContain('テストモード');
    expect(app.innerHTML).not.toContain(promptMessage);
  });

  it('waits for pending prompts when a range test is requested', async () => {
    let resolvePrompts!: (response: unknown) => void;
    await restart({ prompts: () => new Promise(resolve => { resolvePrompts = resolve; }) }, '?grade=e1');
    app.querySelector('#to')!.value = '2';
    app.querySelector('#test-count')!.value = '2';
    app.click('#start-test');
    await settle();
    expect(loads).toHaveLength(0);
    expect(app.innerHTML).not.toContain(promptMessage);
    resolvePrompts(await promptResponse());
    await settle();
    expect(loads).toHaveLength(1);
    loads[0].resolve();
    await settle();
    expect(app.innerHTML).toContain('テスト 1問目');
    expect(app.innerHTML).not.toContain(promptMessage);
  });

  it.each(['success', 'failure'])('ignores a pending test entry after navigation on prompt %s', async outcome => {
    let resolvePrompts!: (response: unknown) => void, rejectPrompts!: (error: Error) => void;
    await restart({ prompts: () => new Promise((resolve, reject) => { resolvePrompts = resolve; rejectPrompts = reject; }) }, '?grade=e1');
    app.querySelector('#to')!.value = '2';
    app.querySelector('#test-count')!.value = '2';
    app.click('#start-test');
    app.click('.back');
    if (outcome === 'success') resolvePrompts(await promptResponse());
    else rejectPrompts(new Error('offline'));
    await settle();
    expect(app.innerHTML).toContain('学年を選んでください');
    expect(app.innerHTML).not.toContain(promptMessage);
    expect(loads).toHaveLength(0);
  });

  it('renders home before prompts settle and allows free and order practice after a prompt failure', async () => {
    let rejectPrompts!: (error: Error) => void;
    await restart({ prompts: () => new Promise((_resolve, reject) => { rejectPrompts = reject; }) });
    expect(app.innerHTML).toContain('学年を選んでください');
    const error = new Error('Failed to fetch');
    rejectPrompts(error);
    await settle();
    expect(console.error).toHaveBeenCalledWith(error);
    expect(app.innerHTML).not.toContain(error.message);
    app.click('[data-grade="e1"]');
    app.click('[data-kanji="一"]');
    loads[0].resolve();
    await settle();
    expect(app.innerHTML).toContain('「一」の練習');
    expect(app.querySelector('#mode')!.value).toBe('free');
    const select = app.querySelector('#mode')!;
    select.value = 'order';
    (select.onchange as (event: unknown) => void)({ target: select });
    expect(app.querySelector('#mode')!.value).toBe('order');
    expect(app.querySelector('#judge')).not.toBeNull();
  });

  it('blocks a range test with a fixed notice and retries into the requested test', async () => {
    let available = false;
    await restart({ prompts: () => available ? promptResponse() : Promise.reject(new Error('offline')) }, '?grade=e1');
    app.querySelector('#to')!.value = '2';
    app.querySelector('#test-count')!.value = '2';
    app.click('#start-test');
    await settle();
    expect(app.innerHTML).toContain(promptMessage);
    expect(app.innerHTML).not.toContain('offline');
    expect(loads).toHaveLength(0);
    available = true;
    app.click('#prompt-retry');
    await settle();
    expect(loads).toHaveLength(1);
    loads[0].resolve();
    await settle();
    expect(app.innerHTML).toContain('テスト 1問目');
    expect(app.innerHTML).toContain('テスト 1 / 2問');
    expect(app.innerHTML).not.toContain(promptMessage);
  });

  it('guards the practice mode selector and retries into test mode', async () => {
    let available = false;
    await restart({ prompts: () => available ? promptResponse() : Promise.reject(new Error('offline')) }, '?grade=e1&kanji=一');
    loads[0].resolve();
    await settle();
    const select = app.querySelector('#mode')!;
    select.value = 'test';
    (select.onchange as (event: unknown) => void)({ target: select });
    await settle();
    expect(select.value).toBe('free');
    expect(app.innerHTML).toContain(promptMessage);
    expect(app.innerHTML).not.toContain('もんだい');
    available = true;
    app.click('#prompt-retry');
    await settle();
    expect(app.innerHTML).toContain('もんだい');
    expect(app.innerHTML).toContain('テストモード');
  });

  it('falls back to free practice for a test deep link and retries the same kanji', async () => {
    let available = false;
    await restart({ prompts: () => available ? promptResponse() : Promise.reject(new Error('offline')) }, '?grade=e1&kanji=二&mode=test');
    loads[0].resolve();
    await settle();
    expect(app.querySelector('#mode')!.value).toBe('free');
    expect(app.innerHTML).toContain(promptMessage);
    available = true;
    app.click('#prompt-retry');
    await settle();
    expect(fetch).toHaveBeenLastCalledWith('./data/kanji/04e8c.svg');
    loads[1].resolve();
    await settle();
    expect(app.innerHTML).toContain('もんだい');
  });

  it('keeps a test deep link working when prompts are already available', async () => {
    await restart({}, '?grade=e1&kanji=一&mode=test');
    loads[0].resolve();
    await settle();
    expect(app.innerHTML).toContain('テストモード');
    expect(app.innerHTML).not.toContain(promptMessage);
  });

  it('shows the deep-link notice on the landing list without a kanji parameter', async () => {
    await restart({ prompts: () => Promise.reject(new Error('offline')) }, '?grade=e1&mode=test');
    expect(app.innerHTML).toContain('練習する漢字を選んでください');
    expect(app.innerHTML).toContain(promptMessage);
    expect(app.querySelector('#prompt-retry')).not.toBeNull();
  });

  it('keeps the notice and allows another attempt when retry fails', async () => {
    await restart({ prompts: () => Promise.reject(new Error('offline')) }, '?grade=e1');
    app.querySelector('#to')!.value = '2';
    app.querySelector('#test-count')!.value = '2';
    app.click('#start-test');
    await settle();
    app.click('#prompt-retry');
    await settle();
    expect(app.innerHTML).toContain(promptMessage);
    expect(app.querySelector('#prompt-retry')!.disabled).toBe(false);
    expect(loads).toHaveLength(0);
  });

  it.each(['404', 'bad JSON', 'empty data'])('treats prompt %s as unavailable without blocking startup', async failure => {
    const json = vi.fn(() => { if (failure === 'bad JSON') throw new SyntaxError('bad JSON'); return {}; });
    await restart({ prompts: () => Promise.resolve({ ok: failure !== '404', status: 404, json }) });
    expect(app.innerHTML).toContain('学年を選んでください');
    expect(console.error).toHaveBeenCalled();
    if (failure === '404') expect(json).not.toHaveBeenCalled();
    app.click('[data-grade="e1"]');
    app.querySelector('#to')!.value = '2';
    app.querySelector('#test-count')!.value = '2';
    app.click('#start-test');
    await settle();
    expect(app.innerHTML).toContain(promptMessage);
    expect(loads).toHaveLength(0);
  });

  it('does not enter a test when a retry succeeds after navigating away', async () => {
    let resolveRetry!: (response: unknown) => void;
    let retry = false;
    await restart({ prompts: () => retry ? new Promise(resolve => { resolveRetry = resolve; }) : Promise.reject(new Error('offline')) }, '?grade=e1');
    app.querySelector('#to')!.value = '2';
    app.querySelector('#test-count')!.value = '2';
    app.click('#start-test');
    await settle();
    retry = true;
    app.click('#prompt-retry');
    app.click('.back');
    resolveRetry(await promptResponse());
    await settle();
    expect(app.innerHTML).toContain('学年を選んでください');
    expect(loads).toHaveLength(0);
  });

  it('keeps the startup alert when metadata fails', async () => {
    await restart({ meta: () => Promise.reject(new Error('meta offline')) });
    expect(app.innerHTML).toBe('<p role="alert">データを読み込めませんでした。ページを再読み込みしてください。</p>');
  });
});

describe('practice reference loading screens', () => {
  it('shows a reference error with retry and a working back-to-list button', async () => {
    await startTest();
    app.click('#next');
    const error = new Error('Failed to fetch');
    loads[1].reject(error);
    await settle();
    expect(app.innerHTML).toContain('<p role="alert">通信状態を確認して、もう一度お試しください。</p>');
    expect(app.innerHTML).not.toContain(error.message);
    expect(console.error).toHaveBeenCalledExactlyOnceWith(error);
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
