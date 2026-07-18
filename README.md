# 🍅 トマトオク

5×5の畑に🍅を置く、短時間ブラウザパズルです。

## 現行v1

現在の実装は、ランダムに選ばれた3ステージを連続で解き、速さと正確さを点数で競います。

- 各行・各列・各エリアに🍅は1個
- 🍅同士は上下左右斜めで隣り合えない
- 誤タップとヒントで減点
- Supabaseランキングを想定
- 遊び方モーダルと4×4自動チュートリアル
- 30ステージを一意解検証済み

| ホーム | ゲーム | 結果 |
| --- | --- | --- |
| 名前入力・遊び方・チュートリアル・ランキング | 5×5盤面・タイマー・ヒント | スコア・タイム・誤タップ・ヒント |

現行v1の実装仕様は [`docs/SPEC.md`](docs/SPEC.md) を参照してください。

## v2計画

v2は将来仕様であり、まだ実装されていません。

主な予定:

- 全員が同じ条件で遊ぶ「公式3問」
- ランキング対象外の「ランダム練習」
- 点数ではなく、誤タップとヒントを加算した「補正タイム」
- 実験場の共通Supabase RPCへの対応
- カウントダウン、ステージ別時間、競合防止
- 実験場と詳細ランキングへの導線
- 問題生成器と難易度判定の強化

v2の契約:

- [v2要件書](docs/REQUIREMENTS_v2.md)
- [v2技術仕様](docs/SPEC_v2.md)
- [v2実装計画](docs/IMPLEMENTATION_PLAN_v2.md)

## ローカル実行

ES Modulesを使うため、ファイルを直接開かずHTTPで配信してください。

```bash
npm run serve
# http://localhost:8080
```

## 構成

```text
index.html        静的エントリ
src/
  main.js         画面制御・盤面描画・タイマー・送信・シェア
  game.js         ゲームロジック
  stages.js       30ステージ
  ranking.js      Supabase連携
  tutorial.js     4×4自動チュートリアル
  styles.css      スタイル
scripts/          生成・検証・テスト
docs/             v1文書・v2計画
```

現在の複数ファイル・ES Modules構成を正式な開発構成として維持できます。1ファイル化や全作品共通の容量上限は必須条件ではありません。

## 開発コマンド

```bash
npm run gen       # ステージを再生成
npm run verify    # 出荷ステージの一意解・形式を検証
npm test          # ゲームロジック単体テスト
npm run e2e       # Playwrightブラウザテスト
npm run serve     # ローカルHTTPサーバー
```

実行済み結果は [`docs/TEST_REPORT.md`](docs/TEST_REPORT.md) を参照してください。

## ランキング設定

現行v1は`index.html`の`window.TOMATOKU_CONFIG`から公開可能なanon / Publishable keyを読みます。secretまたはservice role keyを入れないでください。

```js
window.TOMATOKU_CONFIG = {
  supabaseUrl: "https://xxxx.supabase.co",
  supabaseAnonKey: "公開可能なキー",
  gameSlug: "tomatoku",
};
```

`game_slug`は`tomatoku`、表示名・リポジトリ名・公開予定パスは`tomatooku`です。

v2では、実験場の共通RPC契約へ合わせてランキング接続を更新する予定です。現行の参考SQLを共有Supabaseへそのまま適用しないでください。

## 保存

現行v1でブラウザに保存する情報はプレイヤー名だけです。

```text
localStorage["tomatoku.playerName"]
```
