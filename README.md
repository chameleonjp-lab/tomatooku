# 🍅 トマトオク

5×5の畑に🍅を置く、3ステージのタイムパズルです。

## ゲームモード

### 公式3問

全員が同じ問題を同じ順番で遊びます。

```text
T001（やさしい）
T011（ふつう）
T021（むずかしい）
```

記録は、実際に操作した時間へペナルティを加えた「補正タイム」です。短いほど好成績です。

```text
補正タイム
= 実時間
+ 誤タップ数 × 3秒
+ ヒント数 × 30秒
```

公式3問の結果は、実験場の共通ランキングへ送信されます。同じプレイIDの送信は1回だけです。

### ランダム練習

難易度1・2・3から有効な3問組をランダムに選びます。ステージIDと正解配置は同一プレイ内で重複しません。練習結果はランキングへ送信しません。

## ランキング状態

`tomatoku`は共有Supabaseの`public.games`へ登録済みです。2026年7月19日に、初回記録・ベスト更新・プレイ回数・初回ランキング・ベストランキングの疎通を確認し、確認用データを削除したうえで公式送信ゲートを有効化しました。

- 公式3問: ランキング送信対象
- ランダム練習: 常にランキング対象外
- `game_slug`: `tomatoku`
- 表示名・リポジトリ名・公開パス: `tomatooku`
- `score_order`: `asc`
- `score_unit`: `秒`
- `score_scale`: `100`
- `score_decimals`: `2`
- `score_label`: `補正タイム`

公開導線:

- [カメレオンJPの実験場](https://chameleonjp.codeberg.page/chameleonjp_lab/)
- [トマトオク 詳細ランキング](https://chameleonjp.codeberg.page/chameleonjp_lab/ranking.html?game=tomatoku)

## ルール

- 各行に🍅は1個
- 各列に🍅は1個
- 各エリアに🍅は1個
- 🍅同士は上下左右斜めで隣り合わない

## 画面フロー

```text
home
→ countdown
→ playing
→ stageTransition
→ result
```

カウントダウンとステージ間演出は計測に含めません。盤面描画後に計測を開始し、クリア確定時に停止します。

## 結果表示

- モード
- 補正タイム
- 実時間
- 誤タップ数と加算秒
- ヒント数と加算秒
- ステージ別の実時間、誤タップ数、ヒント数
- 公式ランキング送信状態

## ローカル実行

ES Modulesを使うため、HTTPで配信してください。

```bash
npm run serve
# http://localhost:8080
```

## 開発コマンド

```bash
npm run gen           # ステージを再生成
npm run verify        # ステージ形式・一意解検証
npm test              # ゲーム + ランキング + 公開設定
npm run test:game     # ゲームロジック
npm run test:ranking  # ランキング契約
npm run test:launch   # 本番送信ゲートと公開導線
npm run e2e           # Playwrightブラウザテスト
npm run serve         # ローカルHTTPサーバー
```

## 構成

```text
index.html
src/
  game.js
  main.js
  ranking-config.js
  ranking.js
  stages.js
  styles.css
  tutorial.js
scripts/
  game.test.js
  ranking.test.js
  launch-config.test.js
  e2e.test.js
docs/
  REQUIREMENTS_v2.md
  SPEC_v2.md
  IMPLEMENTATION_PLAN_v2.md
  RANKING_REVIEW_v2.md
  TIMER_REVIEW_v2.md
  MODE_SCORE_REVIEW_v2.md
  RANKING_LAUNCH_v2.md
```

## セキュリティ

ブラウザにはPublishable keyだけを置きます。secret key、service role key、`Authorization: Bearer`は使用しません。共有Supabaseの関数やテーブルを、このリポジトリのSQLで置き換えないでください。

## 保存

ブラウザに保存する情報はプレイヤー名だけです。

```text
localStorage["tomatoku.playerName"]
```
