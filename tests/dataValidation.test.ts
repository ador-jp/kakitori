import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../', import.meta.url));
const current = JSON.parse(readFileSync(join(repo, 'public/data/meta.json'), 'utf8')) as Record<string, string[]>;
const grades = ['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'j1', 'j2', 'j3', 'joyo'];
let root: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'kakitori-validation-'));
  mkdirSync(join(root, 'scripts'));
  cpSync(join(repo, 'scripts/build-data.mjs'), join(root, 'scripts/build-data.mjs'));
  cpSync(join(repo, 'public/data'), join(root, 'public/data'), { recursive: true });
});
afterAll(() => { if (root) rmSync(root, { recursive: true, force: true }); });

function check(change: (meta: Record<string, unknown>) => void = () => {}) {
  const meta = structuredClone(current);
  change(meta);
  writeFileSync(join(root, 'public/data/meta.json'), JSON.stringify(meta));
  const result = spawnSync(process.execPath, [join(root, 'scripts/build-data.mjs'), '--check'], { encoding: 'utf8' });
  expect(result.error).toBeUndefined();
  expect(result.stderr).toBe('');
  const report = JSON.parse(result.stdout) as { joyo: number; elementary: number; issues: string[] };
  return { status: result.status, report };
}

describe('data validation CLI', () => {
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
