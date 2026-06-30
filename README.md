# 🍅 トマトク

5×5 の畑に 🍅 を置く、短時間ブラウザパズル。
ランダムに選ばれた **3 ステージ**を連続で解き、速さと正確さをスコアで競います。

- 各行・各列・各エリア(色分け)に 🍅 は 1 個
- 🍅 同士は上下左右斜めで隣り合えない
- 速く解くほど高スコア / 誤タップで減点 / ヒントで大きく減点
- ランキングは「最高スコア・高い順」(Supabase 連携)

| ホーム | ゲーム | 結果 |
| --- | --- | --- |
| 名前入力・ルール・ランキング | 5×5 盤面・タイマー・ヒント | スコア・タイム・誤タップ・ヒント |

## 遊び方(ローカル)

ES Modules を使うため、ファイルを直接開くのではなく HTTP で配信してください。

```bash
npm run serve     # http://localhost:8080 を開く
# もしくは任意の静的サーバ
```

## 構成

```
index.html        静的エントリ(viewport / ランキング設定 / 3画面)
src/
  main.js         画面制御・盤面描画・タイマー・送信・シェア
  game.js         ゲームロジック(DOM 非依存)
  stages.js       30ステージ(自動生成・一意解検証済み)
  ranking.js      Supabase 連携(fetch・二重送信防止)
  styles.css      モバイル最優先スタイル
scripts/          生成・検証・テスト
docs/             要件 / 実装計画 / 仕様 / Supabase / テスト報告
```

## 開発コマンド

```bash
npm run gen       # src/stages.js を再生成(再現可能)
npm run verify    # 出荷ステージの一意解検証(30/30)
npm test          # ゲームロジック単体テスト(26 件)
npm run e2e       # ブラウザ E2E(Playwright, iPhone SE 幅)
```

## ランキング設定

`index.html` の `window.TOMATOKU_CONFIG` に **公開 anon key のみ**を設定します
(secret key は使いません)。未設定でもゲームは動作し、ランキングのみ
「未設定」表示になります。Supabase 側の SQL は
[`docs/SUPABASE_SETUP.md`](docs/SUPABASE_SETUP.md) を参照。

```js
window.TOMATOKU_CONFIG = {
  supabaseUrl: "https://xxxx.supabase.co",
  supabaseAnonKey: "公開 anon key",
  gameSlug: "tomatoku",
};
```

## 設計メモ

- 配信物は HTML/CSS/JS のみ・数十 KB(画像/音声/重いライブラリなし)。
- ブラウザ保存は **プレイヤー名のみ**(`localStorage["tomatoku.playerName"]`)。
- ランキング送信はゲーム終了時に 1 回だけ(二重送信防止)。
- パズルは 5×5 の Queens/Star Battle 変種。全ステージ一意解を保証。

詳細は [`docs/SPEC.md`](docs/SPEC.md)。
