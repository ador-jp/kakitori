import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
if (process.argv.includes('--check')) {
  const meta = JSON.parse(fs.readFileSync(path.join(root, 'public/data/meta.json'), 'utf8'));
  const prompts = JSON.parse(fs.readFileSync(path.join(root, 'public/data/prompts.json'), 'utf8'));
  const expected = { e1: 80, e2: 160, e3: 200, e4: 202, e5: 193, e6: 191, joyo: 2136 };
  const issues = [];
  for (const [grade, count] of Object.entries(expected)) {
    if (meta[grade]?.length !== count) issues.push(`${grade}: ${meta[grade]?.length ?? 0}/${count}字`);
    if (new Set(meta[grade]).size !== meta[grade]?.length) issues.push(`${grade}: 重複`);
  }
  for (const char of meta.joyo) {
    if (!prompts[char]?.reading || !prompts[char]?.example?.includes(char)) issues.push(`問題データ不正: ${char}`);
    const file = path.join(root, 'public/data/kanji', `${char.codePointAt(0).toString(16).padStart(5, '0')}.svg`);
    if (!fs.existsSync(file) || !/<path[\s>]/.test(fs.readFileSync(file, 'utf8'))) issues.push(`筆順データ不正: ${char}`);
  }
  const report = { checkedAt: new Date().toISOString(), joyo: meta.joyo.length, elementary: ['e1','e2','e3','e4','e5','e6'].reduce((n, g) => n + meta[g].length, 0), issues };
  fs.writeFileSync(path.join(root, 'validation-report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  if (issues.length) process.exitCode = 1;
  process.exit();
}
const grades = Object.fromEntries(Array.from({ length: 6 }, (_, i) => {
  const key = `e${i + 1}`;
  const data = JSON.parse(fs.readFileSync(path.join(root, `package/lib/data/grade.g0${i + 1}.json`), 'utf8'));
  return [key, data];
}));
// 平成29年告示の公式配当に合わせ、旧1006字データから4〜6年のみ差分更新。
const changes = {
  e4: ['茨媛岡賀潟岐熊群香佐埼崎滋鹿城縄井沖徳栃奈梨阪阜富', '得告費象賞型史士殺歴航停喜囲紀救堂貯毒脈粉胃腸'],
  e5: ['囲紀喜救型航告殺士史象賞貯停堂得毒費粉脈歴', '退券富承預銭群賀徳敵恩俵舌'],
  e6: ['胃恩券承舌銭退腸敵俵預', '城'],
};
for (const [grade, [add, remove]] of Object.entries(changes)) grades[grade] = [...grades[grade].filter(char => !remove.includes(char)), ...add];
const joyo = JSON.parse(fs.readFileSync(path.join(root, 'package/index.js'), 'utf8').match(/"kanji":\s*(\[[\s\S]*\])\s*\};/)?.[1] || '[]');
const elementary = new Set(Object.values(grades).flat());
const secondary = joyo.filter(k => !elementary.has(k));
const third = Math.ceil(secondary.length / 3);
grades.j1 = secondary.slice(0, third); grades.j2 = secondary.slice(third, third * 2); grades.j3 = secondary.slice(third * 2); grades.joyo = joyo;
const issues = [];
if (new Set(joyo).size !== 2136) issues.push(`常用漢字が2136字ではありません: ${new Set(joyo).size}`);
if (elementary.size !== 1026) issues.push(`小学校配当が1026字ではありません: ${elementary.size}`);
for (const [grade, chars] of Object.entries(grades)) if (new Set(chars).size !== chars.length) issues.push(`${grade} に重複があります`);
const source = path.join(root, 'kanjivg-master/kanji');
const output = path.join(root, 'public/data/kanji');
fs.mkdirSync(output, { recursive: true });
let missing = 0, invalid = 0;
for (const char of joyo) {
  const filename = `${char.codePointAt(0).toString(16).padStart(5, '0')}.svg`;
  const src = path.join(source, filename);
  if (!fs.existsSync(src)) { issues.push(`筆順データなし: ${char} (${filename})`); missing++; continue; }
  const svg = fs.readFileSync(src, 'utf8');
  if (!/<svg[\s>]/.test(svg) || !/<path[\s>]/.test(svg)) { issues.push(`不正なSVG: ${char}`); invalid++; continue; }
  fs.copyFileSync(src, path.join(output, filename));
}
fs.writeFileSync(path.join(root, 'public/data/meta.json'), JSON.stringify(grades));
const report = { generatedAt: new Date().toISOString(), joyo: new Set(joyo).size, elementary: elementary.size, grades: Object.fromEntries(Object.entries(grades).map(([k, v]) => [k, v.length])), missingStrokeData: missing, invalidSvg: invalid, issues };
fs.writeFileSync(path.join(root, 'validation-report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (issues.length) process.exitCode = 1;
