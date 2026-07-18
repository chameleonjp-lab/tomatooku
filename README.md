# 🍅 トマトオク

5×5の畑に🍅を置く、短時間ブラウザパズルです。

## 現行v1

現在のゲーム画面は、ランダムに選ばれた3ステージを連続で解き、速さと正確さを点数で競うv1です。

- 各行・各列・各エリアに🍅は1個
- 🍅同士は上下左右斜めで隣り合えない
- 誤タップとヒントで減点
- 遊び方モーダルと4×4自動チュートリアル
- 30ステージを一意解検証済み

| ホーム | ゲーム | 結果 |
| --- | --- | --- |
| 名前入力・遊び方・チュートリアル・ランキング | 5×5盤面・タイマー・ヒント | スコア・タイム・誤タップ・ヒント |

現行v1の実装仕様は [`docs/SPEC.md`](docs/SPEC.md) を参照してください。

## v2進行状況

v2は段階的に実装しています。

### 完了

- v2要件・技術仕様・実装計画の確定
- 実験場の共有Supabase RPC定義の確認
- 共通ランキング取得クライアント
- 共通`submit_score`送信クライアント
- Publishable keyを`apikey`だけに設定する構成
- `AbortController`による通信タイムアウト
- play ID単位の二重送信防止
- ランキング通信の単体テスト

### 未実装

- 全員が同じ条件で遊ぶ「公式3問」
- ランキング対象外の「ランダム練習」
- 誤タップとヒントを加算した「補正タイム」
- カウントダウン、ステージ別時間、非同期競合防止
- 実験場と詳細ランキングへの導線
- 問題生成器と難易度判定の強化

**重要:** 現行v1はランダム3問のため、本番ランキングへスコアを送信しません。`submit_score`は、将来の`official`モードとplay IDが明示された場合だけ動作します。

v2文書:

- [v2要件書](docs/REQUIREMENTS_v2.md)
- [v2技術仕様](docs/SPEC_v2.md)
- [v2実装計画](docs/IMPLEMENTATION_PLAN_v2.md)
- [ランキング契約確認](docs/RANKING_REVIEW_v2.md)

## ローカル実行

ES Modulesを使うため、ファイルを直接開かずHTTPで配信してください。

```bash
npm run serve
# http://localhost:8080
```

## 構成

```text
index.html
src/
  game.js             ゲームロジック
  main.js             画面制御
  ranking-config.js   ブラウザ公開可能なランキング設定
  ranking.js          共有Supabase RPCクライアント
  stages.js           30ステージ
  styles.css          スタイル
  tutorial.js         4×4自動チュートリアル
scripts/
  game.test.js
  ranking.test.js
  verify_stages.js
  e2e.test.js
docs/
  v1文書・v2契約・確認記録
```

現在の複数ファイル・ES Modules構成を正式な開発構成として維持できます。1ファイル化や全作品共通の容量上限は必須条件ではありません。

## 開発コマンド

```bash
npm run gen           # ステージを再生成
npm run verify        # 出荷ステージの一意解・形式を検証
npm test              # ゲームロジックとランキング契約の単体テスト
npm run test:game     # ゲームロジックだけをテスト
npm run test:ranking  # ランキング契約だけをテスト
npm run e2e           # Playwrightブラウザテスト
npm run serve         # ローカルHTTPサーバー
```

既存のゲームテスト結果は [`docs/TEST_REPORT.md`](docs/TEST_REPORT.md) を参照してください。ランキング契約の確認結果は [`docs/RANKING_REVIEW_v2.md`](docs/RANKING_REVIEW_v2.md) に記録しています。

## ランキング連携

ブラウザ公開可能な設定は`src/ranking-config.js`へ集約しています。

- `game_slug`: `tomatoku`
- 送信: `submit_score`
- 最高記録取得: `get_best_score_ranking`
- 初回記録取得: `get_first_try_ranking`
- ヘッダー: `apikey`
- 送信本文: `p_display_name`、`p_game_slug`、`p_score`、`p_client_version`

secret key、service role key、`Authorization: Bearer`は使用しません。Publishable keyはブラウザ公開用ですが、文書や作業報告へ複製しません。

共有Supabaseの関数やテーブルを、このリポジトリのSQLで置き換えないでください。現在`tomatoku`は`public.games`へ未登録で、実スコア送信も未実施です。公式問題と補正タイムの実装後に登録・疎通確認を行います。

## 保存

現行v1でブラウザに保存する情報はプレイヤー名だけです。

```text
localStorage["tomatoku.playerName"]
```
