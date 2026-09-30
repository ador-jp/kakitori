import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const zip = path.join(os.tmpdir(), 'Unihan.zip');
const response = await fetch('https://www.unicode.org/Public/UCD/latest/ucd/Unihan.zip');
if (!response.ok) throw new Error(`Unihanを取得できませんでした: ${response.status}`);
fs.writeFileSync(zip, Buffer.from(await response.arrayBuffer()));
const source = execFileSync('unzip', ['-p', zip, 'Unihan_Readings.txt'], { encoding: 'utf8', maxBuffer: 20_000_000 });
const all = Object.fromEntries([...source.matchAll(/^U\+([0-9A-F]+)\tkJapanese\t(.+)$/gm)].map(([, code, value]) => [String.fromCodePoint(parseInt(code, 16)), value]));
const joyo = JSON.parse(fs.readFileSync(path.join(root, 'public/data/meta.json'), 'utf8')).joyo;
const readings = Object.fromEntries(joyo.map(char => {
  const choices = all[char]?.split(' ') || [];
  return [char, choices.find(reading => /[ぁ-ゖ]/.test(reading)) || choices[0]];
}));
const missing = joyo.filter(char => !readings[char]);
if (missing.length) throw new Error(`読みがありません: ${missing.join('')}`);
fs.writeFileSync(path.join(root, 'public/data/readings.json'), JSON.stringify(readings));
console.log(`Unicode Unihanから常用漢字${joyo.length}字の読みを更新しました。`);
