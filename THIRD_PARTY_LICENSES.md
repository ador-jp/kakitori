# 第三者ライセンス

## KanjiVG

- 対象: `public/data/kanji/*.svg`
- Copyright © 2009–2026 Ulrich Apel and KanjiVG contributors
- 出典: https://github.com/KanjiVG/kanjivg
- ライセンス: Creative Commons Attribution-ShareAlike 3.0 Unported (CC BY-SA 3.0)
- ライセンス本文: https://creativecommons.org/licenses/by-sa/3.0/legalcode
- 原文通知: `public/data/KANJIVG_COPYING`

本アプリは KanjiVG のSVGを文字別に抽出して再配布します。当該データおよびその派生物には CC BY-SA 3.0 が適用されます。変更した場合は同一ライセンスで提供し、KanjiVG と著作者を表示してください。

## 文化庁「常用漢字表の音訓索引」

- 対象: `public/data/prompts.json`（テスト問題用の音訓・用例）
- 出典: https://www.bunka.go.jp/kokugo_nihongo/sisaku/joho/joho/kijun/naikaku/kanji/joyokanjisakuin/
- 根拠: 常用漢字表（平成22年内閣告示第2号）

文化庁が示す常用漢字表内の音訓と用例から、各字のテスト問題を生成しています。例文は同音異義語を区別できるよう用例を穴埋め化し、一部の単独用例だけ本アプリ用の短文を補っています。`npm run update:prompts` で公開表から更新できます。

## 開発依存関係

Vite、TypeScript、Vitest、vite-plugin-pwa は成果物生成とテストに使用します。各パッケージのライセンスは `node_modules/*/LICENSE*` および `package-lock.json` の固定バージョンを参照してください。実行時に外部サービスへ接続する依存関係はありません。
