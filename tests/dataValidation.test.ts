import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../', import.meta.url));
const current = JSON.parse(readFileSync(join(repo, 'public/data/meta.json'), 'utf8')) as Record<string, string[]>;
const currentPrompts = JSON.parse(readFileSync(join(repo, 'public/data/prompts.json'), 'utf8')) as Record<string, { reading: string; example: string }>;
const grades = ['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'j1', 'j2', 'j3', 'joyo'];
let root: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'kakitori-validation-'));
  mkdirSync(join(root, 'scripts'));
  cpSync(join(repo, 'scripts/build-data.mjs'), join(root, 'scripts/build-data.mjs'));
  cpSync(join(repo, 'public/data'), join(root, 'public/data'), { recursive: true });
});
afterAll(() => { if (root) rmSync(root, { recursive: true, force: true }); });

function check(change: (meta: Record<string, unknown>) => void = () => {}, prompts: unknown = currentPrompts) {
  const meta = structuredClone(current);
  change(meta);
  writeFileSync(join(root, 'public/data/meta.json'), JSON.stringify(meta));
  writeFileSync(join(root, 'public/data/prompts.json'), JSON.stringify(prompts));
  const result = spawnSync(process.execPath, [join(root, 'scripts/build-data.mjs'), '--check'], { encoding: 'utf8' });
  expect(result.error).toBeUndefined();
  expect(result.stderr).toBe('');
  const report = JSON.parse(result.stdout) as { joyo: number; elementary: number; issues: string[] };
  return { status: result.status, report };
}

describe('data validation CLI', () => {
  it.each([
    { name: 'array reading', entry: { ...currentPrompts.一, reading: [] } },
    { name: 'numeric reading', entry: { ...currentPrompts.一, reading: 1 } },
    { name: 'numeric example', entry: { ...currentPrompts.一, example: 1 } },
    { name: 'array example', entry: { ...currentPrompts.一, example: ['一'] } },
    { name: 'null entry', entry: null },
    { name: 'number entry', entry: 1 },
    { name: 'string entry', entry: '一' },
    { name: 'array entry', entry: [] },
    { name: 'missing fields', entry: {} },
    { name: 'empty reading', entry: { ...currentPrompts.一, reading: '' } },
    { name: 'example without the kanji', entry: { ...currentPrompts.一, example: '例文' } }
  ])('rejects invalid prompt data: $name', ({ entry }) => {
    const { status, report } = check(undefined, { ...currentPrompts, 一: entry });
    expect(status).toBe(1);
    expect(report.issues).toEqual(['問題データ不正: 一']);
  });

  it.each([null, [], 1, true, 'text', {}])('rejects invalid prompts root: %j', prompts => {
    const { status, report } = check(undefined, prompts);
    expect(status).toBe(1);
    expect(report.issues).toEqual(['問題データ不正: prompts.json は空でないオブジェクトが必要です']);
  });

  it('validates extra entries that the runtime also checks', () => {
    const { status, report } = check(undefined, { ...currentPrompts, extra: { reading: [], example: '例文' } });
    expect(status).toBe(1);
    expect(report.issues).toEqual(['問題データ不正: extra']);
  });

  it('accepts an extra entry with string fields as the runtime does', () => {
    const { status, report } = check(undefined, { ...currentPrompts, extra: { reading: '', example: '' } });
    expect(status).toBe(0);
    expect(report.issues).toEqual([]);
  });

  it.each([
    { name: 'empty d', path: '<path d=""/>', valid: false },
    { name: 'missing d', path: '<path/>', valid: false },
    { name: 'whitespace-only d', path: '<path d="  \n\t "/>', valid: false },
    { name: 'non-move command', path: '<path d="L10,20"/>', valid: false },
    { name: 'commented-out path', path: '<!-- <path d="M0,0 L10,20"/> -->', valid: false },
    { name: 'unrelated attribute', path: '<path data-d="M0,0 L10,20"/>', valid: false },
    { name: 'valid path without an id', path: '<path d="M0,0 L10,20"/>', valid: true },
    { name: 'valid path followed by empty d', path: '<path d="M0,0 L10,20"/><path d=""/>', valid: false },
    { name: 'valid path followed by missing d', path: '<path d="M0,0 L10,20"/><path/>', valid: false },
    { name: 'multiple valid paths', path: '<path d="M0,0 L10,20"/><path d="m1,2 l3,4"/>', valid: true },
    { name: 'valid path with ignored comment and CDATA', path: '<path d="M0,0 L10,20"/><!-- <path/> --><![CDATA[<path d=""/>]]>', valid: true },
    { name: 'relative move with single quotes', path: "<g><path d='  m0,0 l10,20'/></g>", valid: true }
  ])('validates SVG stroke data: $name', ({ path, valid }) => {
    const file = join(root, 'public/data/kanji/04e00.svg');
    const original = readFileSync(file, 'utf8');
    try {
      writeFileSync(file, `<svg xmlns="http://www.w3.org/2000/svg">${path}</svg>`);
      const { status, report } = check();
      expect(status).toBe(valid ? 0 : 1);
      expect(report.issues).toEqual(valid ? [] : ['筆順データ不正: 一']);
    } finally {
      writeFileSync(file, original);
    }
  });

  it.each([
    { missing: ['j1', 'j2', 'j3', 'e1', 'e2', 'e3', 'e4', 'e5'] },
    { missing: ['joyo'] }
  ])('writes a complete report through a real pipe when keys are missing: $missing', ({ missing }) => {
    const meta = structuredClone(current);
    for (const grade of missing) delete meta[grade];
    writeFileSync(join(root, 'public/data/meta.json'), JSON.stringify(meta));
    const parser = `
      setTimeout(() => {
        const text = require('node:fs').readFileSync(0, 'utf8');
        process.stdout.write(JSON.stringify(JSON.parse(text)));
      }, 100);
    `;
    const result = spawnSync('sh', ['-c',
      '( "$1" "$2" --check; printf "producer-exit:%s\\n" "$?" >&2 ) | "$1" -e "$3"',
      'validation-pipe', process.execPath, join(root, 'scripts/build-data.mjs'), parser
    ], { encoding: 'utf8' });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('producer-exit:1\n');
    const reportText = readFileSync(join(root, 'validation-report.json'), 'utf8');
    expect(Buffer.byteLength(reportText)).toBeGreaterThan(50_000);
    expect(JSON.parse(result.stdout)).toEqual(JSON.parse(reportText));
    expect(JSON.parse(result.stdout).issues.length).toBeGreaterThan(1900);
  });

  it('accepts current data', () => {
    const { status, report } = check();
    expect(status).toBe(0);
    expect(report).toMatchObject({ joyo: 2136, elementary: 1026, issues: [] });
  });

  it.each(grades)('rejects a missing %s key', grade => {
    const { status, report } = check(meta => { delete meta[grade]; });
    expect(status).toBe(1);
    expect(report.issues).toContain(`${grade}: キーがありません`);
  });

  it.each(grades)('rejects a non-array %s value', grade => {
    const { status, report } = check(meta => { meta[grade] = null; });
    expect(status).toBe(1);
    expect(report.issues).toContain(`${grade}: 配列ではありません`);
  });

  it.each(grades)('rejects duplicates in %s', grade => {
    const { status, report } = check(meta => { (meta[grade] as string[])[1] = current[grade][0]; });
    expect(status).toBe(1);
    expect(report.issues).toContain(`${grade}: 重複`);
  });

  it.each(['e1', 'j1', 'j2', 'j3'])('rejects non-joyo kanji in %s', grade => {
    const { status, report } = check(meta => { (meta[grade] as string[])[0] = '𠮷'; });
    expect(status).toBe(1);
    expect(report.issues).toContain(`${grade}: 常用漢字に含まれません: 𠮷`);
  });

  it.each(['e1', 'j1', 'j2', 'j3'])('retains the expected count for %s', grade => {
    const { status, report } = check(meta => { (meta[grade] as string[]).pop(); });
    expect(status).toBe(1);
    expect(report.issues).toContain(`${grade}: ${current[grade].length - 1}/${current[grade].length}字`);
  });

  it.each(['e1', 'j1'])('rejects junior overlap with %s while preserving counts', grade => {
    const { status, report } = check(meta => { (meta.j2 as string[])[0] = current[grade][0]; });
    expect(status).toBe(1);
    expect(report.issues).toContain(`j2: ${grade} と重複: ${current[grade][0]}`);
    expect(report.issues).toContain(`学年未配当: ${current.j2[0]}`);
  });

  it('reports invalid joyo elements instead of crashing', () => {
    const { status, report } = check(meta => { (meta.joyo as unknown[])[0] = null; });
    expect(status).toBe(1);
    expect(report.issues).toContain('joyo: 不正な漢字 null');
  });
});
