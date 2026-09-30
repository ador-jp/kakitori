# かきとり

ブラウザーだけで動く、日本の小・中学生向け漢字書き順練習アプリです。ペン・指・マウスで書いた筆画を、端末内でお手本のベクターデータと比較します。アカウント、サーバー、API キー、広告、解析・追跡はありません。

## 主な機能

- 小学校6学年、学習用の中学校3区分、常用漢字から選択・検索
- Pointer Events による手書き入力、取り消し、全消去
- 画数、書き順、方向、始点・終点、位置、軌跡を使う採点と日本語フィードバック
- 自由練習、書き順練習、テスト、お手本アニメーション、ランダム練習
- 端末内だけの練習回数・最高点・苦手漢字記録
- PWA、静的配布、オフライン利用
- `?grade=e3&kanji=海&mode=test` のような直接リンク（`grade`: `e1`〜`e6`, `j1`〜`j3`, `joyo`）
- 指定した番号範囲から重複なしで指定数を抽出するテストと結果一覧
- テスト中は答えを隠し、常用漢字表の音訓と穴埋め例文を表示
- `?debug=1` による参照線・入力線・各筆画誤差の開発表示

## 対応漢字と学年分類

常用漢字2,136字を収録しています。小学校1〜6年は、文部科学省「小学校学習指導要領（平成29年告示）」別表「学年別漢字配当表」の公式配当1,026字（80 / 160 / 200 / 202 / 193 / 191字）です。

中学校では個々の常用漢字を中1・中2・中3へ割り当てる公式表がありません。このアプリの「中学1〜3年（参考）」は、小学校配当外1,110字を常用漢字表の掲載順で3等分した**学習用の参考区分**であり、公式配当ではありません。「常用漢字」では全2,136字を一覧できます。

出典：

- [文部科学省・小学校学習指導要領 国語編](https://www.mext.go.jp/content/20220606-mxt_kyoiku02-100002607_002.pdf)
- [文化庁・常用漢字表（平成22年内閣告示第2号）](https://www.bunka.go.jp/kokugo_nihongo/sisaku/joho/joho/kijun/naikaku/kanji/)

## 書き順判定の仕組み

KanjiVG のSVG筆画を文字ごとに遅延読込し、各パスを48点に標本化します。入力全体の外接矩形を正規化した後、弧長に沿って32点へ再標本化し、始点・終点距離、始終ベクトルの内積、対応点の平均距離、参照筆画との最短対応、画数を組み合わせます。軽いずれは許容しますが、書き順違い・逆向き・不足・余分な画を減点します。すべてブラウザー内で完結します。

点数は練習を助ける目安であり、学校や公的機関による正式な書写評価ではありません。崩し、はね・はらい、複雑な交差などを人間と同等には判断できません。

## 判定パラメータ

`src/config.ts` に集約しています。

- `startPoint` / `endPoint`: 大きくすると始点・終点のずれに寛容
- `directionCosine`: 方向評価用（現在は将来調整値として保持）
- `shape`: 大きくすると軌跡の違いに寛容
- `position`: 位置評価用（現在は将来調整値として保持）
- `samplePoints`: 比較する点数。増やすと細部を拾う代わりに計算量が増加

調整時は `?debug=1` を付け、入力線、お手本、筆画ごとの誤差を確認してください。

## 開発・起動・テスト

Node.js 20以降を推奨します。

```sh
npm install
npm run dev
npm test
npm run validate:data
npm run update:prompts  # 文化庁「常用漢字表」からテスト問題を更新
npm run build
```

`validate:data` は重複、学年字数、常用漢字網羅、SVG形式、筆順データ欠落を検査し、`validation-report.json` を生成します。重大な不整合があれば失敗します。

## 配布・PWA・オフライン

`npm run build` の成果物 `dist/` を GitHub Pages、Cloudflare Pages、Netlify、または静的Webサーバーへ配置します。相対パスでビルドされるためサブディレクトリ配布にも対応します。Service Worker はアプリと2,136文字分のローカルSVGを初回利用時にキャッシュし、更新版は自動取得します。インストールまたは一度読み込んだ後はオフライン利用できます。

## iOSアプリ

Capacitor 8 と Swift Package Manager のネイティブプロジェクトを `ios/` に収録しています。Web版と同じ判定処理・漢字データをアプリへ同梱するため、通信なしで利用できます。Bundle ID は `jp.kakitori.app`、最低対応は iOS 15.0 です。

機能改修は常に `src/` と `public/` のWeb版へ行い、`ios/App/App/public/` は直接編集しません。Web版の変更後に `npm run ios:sync` を実行すると、最新ビルドがiOSプロジェクトへ置き換えられます。

```sh
npm install
npm run ios:sync   # Web版をビルドしてXcodeプロジェクトへ同期
npm run ios:open   # 同期後にXcodeで開く
```

Capacitor 8 の要件により Xcode 26 以降が必要です。Xcodeで開いた後、Team・署名・Bundle IDを配布先に合わせ、実機でペン入力・オフライン起動を確認してからArchiveしてください。氏名・広告ID・位置情報などの権限は使用しません。

## 学習記録とプライバシー

記録はブラウザーの `localStorage`（キー `kakitori-progress-v1`）だけに保存します。「学習記録を消す」で削除できます。氏名、ID、メール、筆跡、点数をネットワークへ送信しません。外部フォント、解析、広告、実行時APIも使用しません。

## 使用データ・ライセンス

筆順データは [KanjiVG](https://github.com/KanjiVG/kanjivg)（Copyright © Ulrich Apel、CC BY-SA 3.0）、テスト用の音訓・用例は [文化庁「常用漢字表の音訓索引」](https://www.bunka.go.jp/kokugo_nihongo/sisaku/joho/joho/kijun/naikaku/kanji/joyokanjisakuin/) に基づきます。詳細は `THIRD_PARTY_LICENSES.md` と `public/data/KANJIVG_COPYING` を参照してください。アプリのソースコードはMIT Licenseです。

## 保守方針

バックエンド、DB、認証、外部APIを持たず、データは静的ファイルです。依存更新後は `npm test && npm run build` を実行してください。
