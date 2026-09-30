import './style.css';
import './mobile.css';
import { evaluate, type Evaluation, type Point, type Stroke } from './scoring';
import { clearProgress, loadProgress, saveResult } from './storage';
import { registerSW } from 'virtual:pwa-register';
import { selectRandom } from './selection';

type Meta = Record<string, string[]>;
type Prompts = Record<string, { reading: string; example: string }>;
const labels: Record<string, string> = { e1: '小学1年', e2: '小学2年', e3: '小学3年', e4: '小学4年', e5: '小学5年', e6: '小学6年', j1: '中学1年（参考）', j2: '中学2年（参考）', j3: '中学3年（参考）', joyo: '常用漢字' };
const app = document.querySelector<HTMLDivElement>('#app')!;
let meta: Meta, prompts: Prompts, grade = 'e1', selected = '', mode = 'free', strokes: Stroke[] = [], reference: Stroke[] = [], showModel = true, debug = new URLSearchParams(location.search).has('debug');
let testQueue: string[] = [], testIndex = 0, testScores: Array<number | undefined> = [];
let slowDemo = localStorage.getItem('kakitori-slow-demo') === 'true';

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) registerSW({ immediate: true });

function urlFor(char: string) { return `./data/kanji/${char.codePointAt(0)!.toString(16).padStart(5, '0')}.svg`; }
function setQuery(values: Record<string, string>) { const q = new URLSearchParams(values); history.replaceState(null, '', `?${q}`); }
function escapeHtml(value: string) { const el = document.createElement('span'); el.textContent = value; return el.innerHTML; }

async function loadReference(char: string) {
  const text = await fetch(urlFor(char)).then(r => { if (!r.ok) throw new Error('お手本を読み込めませんでした'); return r.text(); });
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.style.position = 'absolute'; svg.style.visibility = 'hidden';
  const paths = [...doc.querySelectorAll('path')].map(p => { const copy = document.createElementNS(svg.namespaceURI, 'path') as SVGPathElement; copy.setAttribute('d', p.getAttribute('d') || ''); svg.append(copy); return copy; });
  document.body.append(svg);
  reference = paths.map(path => Array.from({ length: 48 }, (_, i) => { const p = path.getPointAtLength(path.getTotalLength() * i / 47); return { x: p.x / 109, y: p.y / 109 }; }));
  svg.remove();
}

function home() {
  selected = ''; testQueue = [];
  app.innerHTML = `<header><h1>かきとり</h1><p>書き順を見ながら、漢字を楽しく練習しよう</p></header><main>
    <section aria-labelledby="grade-title"><h2 id="grade-title">学年を選んでください</h2><div class="grade-grid">${Object.entries(labels).map(([key, label]) => `<button class="grade" data-grade="${key}">${label}<small>${meta[key].length}字</small></button>`).join('')}</div></section>
    <section><h2>学習メニュー</h2><div class="menu"><button id="weak">苦手な漢字</button><button id="progress">これまでの練習</button></div><p class="privacy">学習記録はこの端末だけに保存され、外部へ送信されません。</p></section></main>`;
  app.querySelectorAll<HTMLButtonElement>('[data-grade]').forEach(b => b.onclick = () => choose(b.dataset.grade!));
  app.querySelector<HTMLButtonElement>('#progress')!.onclick = progressView;
  app.querySelector<HTMLButtonElement>('#weak')!.onclick = () => { const weak = Object.entries(loadProgress()).filter(([, p]) => p.lowScores > 0).sort((a, b) => b[1].lowScores - a[1].lowScores).map(([k]) => k); list('苦手な漢字', weak); };
}

function choose(key: string) { grade = key; testQueue = []; setQuery({ grade }); list(labels[key], meta[key]); }
function list(title: string, chars: string[]) {
  app.innerHTML = `<header class="compact"><button class="back" aria-label="ホームへ戻る">← ホーム</button><h1>${title}</h1></header><main><section><h2>練習する漢字を選んでください</h2>${grade.startsWith('j') ? '<p class="notice">中学校には公式の学年別配当がないため、常用漢字の学習用参考区分です。</p>' : ''}<div class="filters"><label>漢字を検索 <input id="search" maxlength="1" inputmode="text" placeholder="例：海"></label><label>番号 <input id="from" type="number" min="1" value="1"> 〜 <input id="to" type="number" min="1" value="${Math.min(25, chars.length)}"></label><button id="range">しぼりこむ</button><button id="random">ランダム練習</button></div><div class="test-maker"><h3>範囲からテストを作る</h3><label>出題数 <input id="test-count" type="number" min="1" value="5"> 問</label><button id="start-test" class="primary">この範囲からテスト</button><p id="test-error" role="alert"></p></div><p id="count">${chars.length}字</p><div class="kanji-grid">${chars.map((k, i) => `<button data-kanji="${k}" aria-label="${k}を練習"><span>${k}</span><small>${i + 1}</small></button>`).join('')}</div></section></main>`;
  app.querySelector<HTMLButtonElement>('.back')!.onclick = home;
  const buttons = [...app.querySelectorAll<HTMLButtonElement>('[data-kanji]')];
  buttons.forEach(b => b.onclick = () => { testQueue = []; practice(b.dataset.kanji!); });
  app.querySelector<HTMLInputElement>('#search')!.oninput = e => { const q = (e.target as HTMLInputElement).value; buttons.forEach(b => b.hidden = !!q && b.dataset.kanji !== q); };
  app.querySelector<HTMLButtonElement>('#range')!.onclick = () => { const from = Number((app.querySelector('#from') as HTMLInputElement).value || 1), to = Number((app.querySelector('#to') as HTMLInputElement).value || chars.length); buttons.forEach((b, i) => b.hidden = i + 1 < from || i + 1 > to); };
  app.querySelector<HTMLButtonElement>('#random')!.onclick = () => { testQueue = []; practice(chars[Math.floor(Math.random() * chars.length)]); };
  app.querySelector<HTMLButtonElement>('#start-test')!.onclick = () => {
    const from = Number((app.querySelector('#from') as HTMLInputElement).value), to = Number((app.querySelector('#to') as HTMLInputElement).value), count = Number((app.querySelector('#test-count') as HTMLInputElement).value), error = app.querySelector<HTMLElement>('#test-error')!;
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to > chars.length || from > to) { error.textContent = `番号は1〜${chars.length}の範囲で、最初の番号を小さくしてください。`; return; }
    if (!Number.isInteger(count) || count < 1 || count > to - from + 1) { error.textContent = `出題数は1〜${to - from + 1}問にしてください。`; return; }
    testQueue = selectRandom(chars, from, to, count); testScores = Array(count); testIndex = 0; mode = 'test'; practice(testQueue[0]);
  };
}

async function practice(char: string) {
  selected = char; strokes = []; showModel = mode !== 'test'; setQuery({ grade, ...(mode === 'test' ? {} : { kanji: char }), mode, ...(debug ? { debug: '1' } : {}) });
  try { await loadReference(char); } catch (e) { app.innerHTML = `<p role="alert">${(e as Error).message}</p>`; return; }
  renderPractice();
}

function referencePaths(animated = false) { return reference.map((s, i) => `<polyline class="ref ${animated ? 'animate' : ''}" style="--i:${i}" points="${s.map(p => `${p.x * 100},${p.y * 100}`).join(' ')}"/><text class="number" x="${s[0].x * 100}" y="${s[0].y * 100}">${i + 1}</text>`).join(''); }
function studentPaths(result?: Evaluation) { return strokes.map((s, i) => `<polyline class="student ${result && (!result.strokes[i] || result.strokes[i].score < 55 || result.strokes[i].expected !== i) ? 'wrong' : result ? 'correct' : ''}" data-stroke="${i}" points="${s.map(p => `${p.x * 100},${p.y * 100}`).join(' ')}"/>`).join(''); }
function correctionPaths(result: Evaluation) { const bad = new Set(result.strokes.filter((r, i) => r.expected !== i || r.score < 55).map((r, i) => r.expected !== i ? i : r.expected)); return [...bad].map(i => reference[i] ? `<polyline class="correction" points="${reference[i].map(p => `${p.x * 100},${p.y * 100}`).join(' ')}"/>` : '').join(''); }
function testQuestion(result?: Evaluation) { if (mode !== 'test') return ''; const prompt = prompts[selected], reading = escapeHtml(prompt.reading), example = escapeHtml(prompt.example.replaceAll(selected, '□')); return result ? `<section class="test-question answered"><h2>答え：「${selected}」</h2><p>読み：${reading}</p></section>` : `<section class="test-question"><h2>もんだい</h2><p>読み：<strong>${reading}</strong></p><p>例文：${example}</p><strong>□に入る漢字を一字で書きましょう。</strong></section>`; }

function renderPractice(result?: Evaluation) {
  const activeTest = mode === 'test' && !result;
  const title = activeTest ? `テスト${testQueue.length ? ` ${testIndex + 1}問目` : ''}` : mode === 'test' ? `答え：「${selected}」` : `「${selected}」の練習`;
  const toolbar = activeTest ? '<div class="toolbar"><span>テストモード</span></div>' : `<div class="toolbar" role="group" aria-label="練習モード"><label>モード <select id="mode"><option value="free">自由練習</option><option value="order">書き順練習</option><option value="test">テスト</option></select></label><span>正しい画数：${reference.length}画</span></div>`;
  app.innerHTML = `<header class="compact"><button class="back">← 漢字一覧</button><h1>${title}</h1></header><main class="practice">${testQueue.length ? `<p class="test-progress">テスト ${testIndex + 1} / ${testQueue.length}問</p>` : ''}${testQuestion(result)}${toolbar}${result ? resultHtml(result) : ''}<div class="board-wrap"><svg id="board" viewBox="0 0 100 100" aria-label="漢字を書く場所"><line x1="50" y1="0" x2="50" y2="100"/><line x1="0" y1="50" x2="100" y2="50"/>${showModel ? referencePaths() : ''}${result ? correctionPaths(result) : ''}${studentPaths(result)}${result?.passed ? '<circle class="success-circle" cx="50" cy="50" r="45"/><text class="success-mark" x="50" y="57">○</text>' : ''}</svg></div><p id="hint" class="hint" aria-live="polite">${strokes.length ? `${strokes.length}画目を書きました` : '枠の中に書いてみよう'}</p><div class="actions"><button id="undo">一画戻す</button><button id="clear">全部消す</button>${activeTest ? '' : '<button id="model">お手本を見る</button>'}<button id="judge" class="primary">判定する</button><button id="next">${testQueue.length && testIndex === testQueue.length - 1 ? 'テスト結果' : '次の漢字'}</button></div>${debug ? debugHtml(result) : ''}</main>`;
  const modeSelect = app.querySelector<HTMLSelectElement>('#mode'); if (modeSelect) modeSelect.value = mode;
  bindCanvas();
  app.querySelector<HTMLButtonElement>('.back')!.onclick = () => choose(grade);
  if (modeSelect) modeSelect.onchange = e => { mode = (e.target as HTMLSelectElement).value; showModel = mode !== 'test'; renderPractice(); };
  app.querySelector<HTMLButtonElement>('#undo')!.onclick = () => { strokes.pop(); renderPractice(); };
  app.querySelector<HTMLButtonElement>('#clear')!.onclick = () => { strokes = []; renderPractice(); };
  const modelButton = app.querySelector<HTMLButtonElement>('#model'); if (modelButton) modelButton.onclick = showDemo;
  app.querySelector<HTMLButtonElement>('#judge')!.onclick = e => { const button = e.currentTarget as HTMLButtonElement; button.disabled = true; button.textContent = '判定中…'; requestAnimationFrame(() => { try { const r = evaluate(strokes, reference); if (testQueue.length) testScores[testIndex] = r.total; showModel = true; renderPractice(r); saveResult(selected, r.total); requestAnimationFrame(() => app.querySelector<HTMLElement>('.result')?.focus()); } catch (error) { console.error(error); button.disabled = false; button.textContent = '判定する'; app.querySelector('#hint')!.textContent = '判定できませんでした。もう一度押してください。'; } }); };
  app.querySelector<HTMLButtonElement>('#next')!.onclick = next;
}

function bindCanvas() {
  const board = app.querySelector<SVGSVGElement>('#board')!; let current: Stroke | null = null;
  const point = (e: PointerEvent): Point => { const r = board.getBoundingClientRect(); return { x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)) }; };
  board.onpointerdown = e => { e.preventDefault(); board.setPointerCapture(e.pointerId); current = [point(e)]; strokes.push(current); };
  board.onpointermove = e => { if (!current) return; e.preventDefault(); const p = point(e); if (Math.hypot(p.x - current.at(-1)!.x, p.y - current.at(-1)!.y) > .004) { current.push(p); app.querySelectorAll('.student').forEach(n => n.remove()); board.insertAdjacentHTML('beforeend', studentPaths()); } };
  board.onpointerup = () => { if (!current) return; current = null; const i = strokes.length - 1; const partial = reference[i] ? evaluate([strokes[i]], [reference[i]]).strokes[0] : null; app.querySelector('#hint')!.textContent = partial && partial.score >= 45 ? `${i + 1}画目：OK！` : reference[i] ? `${i + 1}画目：お手本と見くらべよう` : '画数が多いようです'; };
}

function resultHtml(r: Evaluation) { return `<section class="result ${r.passed ? 'passed' : 'needs-work'}" tabindex="-1" role="status"><h2>${r.passed ? '◎ ' : ''}${r.total}点</h2><p>${r.passed ? 'たいへんよくできました！' : '赤い線のところを、お手本と見くらべよう'}</p><div class="scores"><span>書き順 <b>${r.order}点</b></span><span>書く方向 <b>${r.direction}点</b></span><span>位置 <b>${r.position}点</b></span><span>形 <b>${r.shape}点</b></span></div><ul>${r.messages.map(m => `<li>${m}</li>`).join('')}</ul></section>`; }
function debugHtml(r?: Evaluation) { return `<details class="debug" open><summary>開発者用デバッグ</summary><p>実線：入力／点線：お手本　採点結果：${r ? escapeHtml(JSON.stringify(r.strokes)) : '未判定'}</p><svg viewBox="0 0 100 100">${referencePaths()}${studentPaths()}</svg></details>`; }

function showDemo() {
  showModel = true; renderPractice(); const board = app.querySelector('#board')!; board.querySelectorAll('.ref,.number').forEach(n => n.remove()); board.insertAdjacentHTML('beforeend', referencePaths(true));
  board.classList.toggle('slow', slowDemo);
  const controls = document.createElement('div'); controls.className = 'demo-controls'; controls.innerHTML = `<button id="replay">最初から</button><button id="pause">一時停止</button><label><input id="slow" type="checkbox" ${slowDemo ? 'checked' : ''}> ゆっくり</label>`; board.parentElement!.after(controls);
  controls.querySelector<HTMLButtonElement>('#replay')!.onclick = showDemo;
  controls.querySelector<HTMLButtonElement>('#pause')!.onclick = e => { board.classList.toggle('paused'); (e.target as HTMLButtonElement).textContent = board.classList.contains('paused') ? '再生' : '一時停止'; };
  controls.querySelector<HTMLInputElement>('#slow')!.onchange = e => { slowDemo = (e.target as HTMLInputElement).checked; localStorage.setItem('kakitori-slow-demo', String(slowDemo)); board.classList.toggle('slow', slowDemo); };
}

function next() { if (testQueue.length) { if (++testIndex >= testQueue.length) showTestSummary(); else practice(testQueue[testIndex]); return; } const chars = meta[grade] || meta.joyo, i = chars.indexOf(selected); practice(chars[(i + 1) % chars.length]); }
function showTestSummary() { const answered = testScores.filter((score): score is number => score !== undefined), average = answered.length ? Math.round(answered.reduce((a, b) => a + b, 0) / answered.length) : 0; app.innerHTML = `<header class="compact"><button class="back">← 漢字一覧</button><h1>テスト結果</h1></header><main><section class="test-summary"><h2>平均 ${average}点</h2><p>${answered.length} / ${testQueue.length}問を判定しました</p><div class="test-results">${testQueue.map((char, i) => `<span><b>${char}</b>${testScores[i] === undefined ? '未判定' : `${testScores[i]}点`}</span>`).join('')}</div><div class="actions"><button id="retry">同じ漢字でもう一度</button><button id="finish" class="primary">漢字一覧へ</button></div></section></main>`; app.querySelector<HTMLButtonElement>('.back')!.onclick = () => choose(grade); app.querySelector<HTMLButtonElement>('#finish')!.onclick = () => choose(grade); app.querySelector<HTMLButtonElement>('#retry')!.onclick = () => { testScores = Array(testQueue.length); testIndex = 0; mode = 'test'; practice(testQueue[0]); }; }
function progressView() { const rows = Object.entries(loadProgress()); app.innerHTML = `<header class="compact"><button class="back">← ホーム</button><h1>これまでの練習</h1></header><main><table><thead><tr><th>漢字</th><th>練習回数</th><th>最新</th><th>最高点</th></tr></thead><tbody>${rows.map(([k, p]) => `<tr><th>${k}</th><td>${p.attempts}回</td><td>${p.latest}点</td><td>${p.best}点</td></tr>`).join('') || '<tr><td colspan="4">まだ記録がありません</td></tr>'}</tbody></table><button id="erase" class="danger">学習記録を消す</button></main>`; app.querySelector<HTMLButtonElement>('.back')!.onclick = home; app.querySelector<HTMLButtonElement>('#erase')!.onclick = () => { if (confirm('この端末の学習記録をすべて消しますか？')) { clearProgress(); progressView(); } }; }

Promise.all([fetch('./data/meta.json').then(r => r.json()), fetch('./data/prompts.json').then(r => r.json())]).then(([data, promptData]: [Meta, Prompts]) => { meta = data; prompts = promptData; const q = new URLSearchParams(location.search); grade = meta[q.get('grade') || ''] ? q.get('grade')! : 'e1'; mode = ['free', 'order', 'test'].includes(q.get('mode') || '') ? q.get('mode')! : 'free'; const char = q.get('kanji'); char && meta.joyo.includes(char) ? practice(char) : q.has('grade') ? choose(grade) : home(); }).catch(() => app.innerHTML = '<p role="alert">データを読み込めませんでした。ページを再読み込みしてください。</p>');
