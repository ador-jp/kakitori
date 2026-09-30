import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const meta = JSON.parse(fs.readFileSync(path.join(root, 'public/data/meta.json'), 'utf8'));
const joyo = new Set(meta.joyo);
const response = await fetch('https://www.bunka.go.jp/kokugo_nihongo/sisaku/joho/joho/kijun/naikaku/kanji/joyokanjisakuin/');
if (!response.ok) throw new Error(`文化庁の常用漢字表を取得できませんでした: ${response.status}`);
const html = new TextDecoder('shift_jis').decode(await response.arrayBuffer());
const text = value => value.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
const prompts = {};
for (const row of html.matchAll(/<tr>([\s\S]*?)<\/tr>/gi)) {
  const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(match => text(match[1]));
  if (cells.length < 3) continue;
  const char = [...cells[0]].find(value => joyo.has(value));
  if (!char) continue;
  const readings = cells[1].split('\n').map(value => value.trim());
  const examples = cells[2].split('\n').map(value => value.trim());
  const notes = (cells[3] || '').split('\n').map(value => value.trim());
  const choices = readings.map((reading, index) => ({ reading, examples: (examples[index] || notes[index] || '').split('，').filter(example => example.includes(char)) })).filter(choice => choice.reading && choice.examples.length);
  const choice = choices.find(item => /[ぁ-ゖ]/.test(item.reading) && item.examples.some(example => [...example].length > 1)) || choices.find(item => item.examples.some(example => [...example].length > 1)) || choices.find(item => /[ぁ-ゖ]/.test(item.reading)) || choices[0];
  if (choice) prompts[char] = { reading: choice.reading, example: choice.examples.find(example => [...example].length > 1) || choice.examples[0] };
}
Object.assign(prompts, {
  朕: { reading: 'チン', example: '天皇が自分を指すときに朕と言う。' }, 虞: { reading: 'おそれ', example: '失敗する虞がある。' }, 俺: { reading: 'おれ', example: '俺は学生だ。' },
  柿: { reading: 'かき', example: '秋に柿を食べる。' }, 釜: { reading: 'かま', example: '釜で御飯を炊く。' }, 熊: { reading: 'くま', example: '森で熊を見た。' },
  芯: { reading: 'シン', example: '鉛筆の芯が折れた。' }, 誰: { reading: 'だれ', example: '誰が来ましたか。' }, 梨: { reading: 'なし', example: '秋の果物、梨を食べる。' },
  謎: { reading: 'なぞ', example: 'この問題の謎を解く。' }, 虹: { reading: 'にじ', example: '雨上がりに虹が出た。' }, 箸: { reading: 'はし', example: '箸で御飯を食べる。' }, 岬: { reading: 'みさき', example: '海に突き出た岬へ行く。' },
});
const missing = meta.joyo.filter(char => !prompts[char]);
if (missing.length) throw new Error(`問題データがありません: ${missing.join('')}`);
fs.writeFileSync(path.join(root, 'public/data/prompts.json'), JSON.stringify(prompts));
console.log(`文化庁「常用漢字表」の音訓・用例から${meta.joyo.length}字の問題を更新しました。`);
