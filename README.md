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

### ランダム練習

難易度1・2・3から有効な3問組をランダムに選びます。ステージIDと正解配置は同一プレイ内で重複しません。練習結果はランキングへ送信しません。

## 現在のランキング状態

共有Supabase RPCへ接続するクライアントは実装済みです。ただし、`tomatoku`の`public.games`登録と本番疎通確認が完了するまで送信ゲートを閉じています。

- 公式3問: ランキング送信対象となる設計だが、現在は公開準備中
- ランダム練習: 常にランキング対象外
- `game_slug`: `tomatoku`
- 表示名・リポジトリ名・公開パス: `tomatooku`
- `score_order`: `asc`
- `score_unit`: `秒`
- `score_scale`: `100`
- `score_decimals`: `2`

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
npm test              # ゲームロジック + ランキング契約
npm run test:game     # ゲームロジック
npm run test:ranking  # ランキング契約
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
  e2e.test.js
docs/
  REQUIREMENTS_v2.md
  SPEC_v2.md
  IMPLEMENTATION_PLAN_v2.md
  RANKING_REVIEW_v2.md
  TIMER_REVIEW_v2.md
  MODE_SCORE_REVIEW_v2.md
```

## セキュリティ

ブラウザにはPublishable keyだけを置きます。secret key、service role key、`Authorization: Bearer`は使用しません。共有Supabaseの関数やテーブルを、このリポジトリのSQLで置き換えないでください。

## 保存

ブラウザに保存する情報はプレイヤー名だけです。

```text
localStorage["tomatoku.playerName"]
```
