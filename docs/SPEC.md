# トマトオク 仕様書 (SPEC) — 実装の正本

本書は実装後の **正本仕様**。コードと一致しない記述は残さない。
(更新基準: `src/` 実装と `scripts/` テスト)

## 1. 全体構成

- 静的サイト。素の ES Modules。サーバー常駐処理なし。
- エントリ: `index.html`(`<script type="module" src="./src/main.js">`)。
- モジュール依存: `main.js` → `game.js` → `stages.js` / `main.js` → `ranking.js` /
  `main.js` → `tutorial.js`。

## 2. データ: `src/stages.js`

`STAGES` は 30 要素の配列。各要素:

```js
{ id: "T001", difficulty: 1,
  regions: ["AABBC", ...5行...],   // 'A'..'E' = 5エリア(各5マス)
  solution: [[r,c] x5] }            // 正解配置(row昇順)
```

- difficulty: 1=やさしい / 2=ふつう / 3=むずかしい(各 10 問)。
- 全ステージ一意解。`scripts/verify_stages.js` で検証済み。
- 再生成: `node scripts/generate_stages.js`(乱数シード固定で再現可能)。

## 3. ロジック: `src/game.js`

### 定数
- `N = 5`
- `SCORE = { BASE: 180000, MISTAKE_PENALTY: 3000, HINT_PENALTY: 30000 }`

### `pickStages(rand=Math.random) → [stage,stage,stage]`
難易度 1/2/3 から 1 問ずつランダム選出。同一プレイ内で重複しない。
グループが空のときは全ステージから補完(フォールバック)。

### `class StageState(stage)`
1ステージ分の盤面。`placed[r][c]: bool`, `count`, `cleared`。

- `canPlace(r,c) → {ok, reason}`: 行/列/エリア/隣接(8方向)/5個上限を検査。
  `reason ∈ {occupied, full, row, col, region, adjacent, null}`。
- `tap(r,c) → {type, reason?}`:
  - 置いてあるマス → `remove`(常に許可)
  - 置けるマス → `place`(置いた後クリア判定)
  - 置けない空マス → `mistake`(置かない)
- `checkCleared()`: 5個 / 各行・列・エリア 1 個 / 隣接なし を明示確認。
- `applyHint() → [r,c]|null`: 正解でない配置を除去 → 未配置の正解セルを 1 つ確定配置。
  進行不能を防ぐため盤面を solution の部分集合へ正規化する。
- `canHint()`: クリア済みでなく、残り正解があれば true。

### `class GameSession(playerName, rand=Math.random)`
- `stages`(3) / `states`(3) / `index` / `mistakeCount` / `hintCount` /
  `startTime` / `endTime`。
- `start(now)`, `current`, `stageNumber`(1始まり), `totalStages`,
  `isLastStage()`, `advance(now) → finished:bool`(最終で endTime 確定),
  `elapsedMs(now)`, `score(now)`。

### `computeScore({elapsedMs, mistakeCount, hintCount}) → int`
`max(0, 180000 - floor(elapsedMs) - mistakeCount*3000 - hintCount*30000)`。
`elapsedMs` は 3ステージ通しの合計。

### `formatTime(ms) → "m:ss.S"`

## 4. UI: `src/main.js`

- 画面: `#screen-home` / `#screen-game` / `#screen-result`(`.active` で表示切替)。
- localStorage は **`tomatoku.playerName` のみ**読み書き(他は一切保存しない)。
- ホーム: 名前必須(空ならエラー表示・開始しない)。Enter でも開始。
  ボタンは スタート / **遊び方**(`#howto-btn`)/ **チュートリアル**(`#tutorial-btn`)/
  シェア。ランキング表示。
- モーダル(`#howto-modal` / `#tutorial-modal`):`.modal.open` で表示。
  背景(`.modal-backdrop`)・×・`data-close` ボタン・Esc で閉じる。
  - 遊び方: ルール/操作/スコアの静的説明。「チュートリアルで動きを見る」導線あり。
  - チュートリアル: `src/tutorial.js` の 4×4 自動アニメを再生(下記§7)。
    開くたびに最初から再生。閉じると `stopTutorial()` で停止。
- ゲーム:
  - 盤面は 25 個の `<button.cell.area-X>`。タップで `StageState.tap`。
  - 誤タップ: `mistakeCount++`、対象セルに揺れ+赤(`.mistake` 0.36s)、バイブ。
  - 配置/除去: 再描画 + HUD 更新。クリアなら `onStageClear`。
  - HUD: ステージ `n/3` / タイム / スコア目安 / 誤タップ・ヒント。
    タイムとスコア目安は `requestAnimationFrame` で更新。
  - ヒント: `applyHint` → `hintCount++`、対象セルを黄枠表示。`canHint()` で無効化。
  - ホームへ戻る: 確認後セッション破棄(記録しない)。
- クリア演出: 盤面 `pop` アニメ + トースト。850ms 後に次ステージ or 結果へ。
  `advancing` フラグで二重進行を防止。
- 結果:
  - 最終スコア / クリアタイム / ステージ(3/3)/ 誤タップ / ヒントを表示。
  - 送信状態を `#submit-state`(pending/ok/error/skipped)に表示。
  - **送信は `submitScore` を 1 回呼ぶのみ**(ranking.js でも二重送信防止)。
  - シェア文に必ずゲーム URL(`location.origin + pathname`)を含む。
  - もう一度遊ぶ / ホーム。

### ズーム・選択抑制
- `viewport`: `maximum-scale=1, user-scalable=no`。
- `body`: `user-select:none`, `touch-action:manipulation`, `-webkit-touch-callout:none`。
- ダブルタップ(300ms 以内の touchend)を `preventDefault`。
- 盤面上の contextmenu を抑制。

### エラー耐性
- `boot()` は try/catch。失敗時はエラーバナーを出し白画面を回避。

## 5. ランキング: `src/ranking.js`

- `CONFIG`: `DEFAULTS` を `window.TOMATOKU_CONFIG` で上書き。
  `supabaseUrl` / `supabaseAnonKey` / `gameSlug="tomatoku"` /
  `submitRpc="submit_score"` / `rankingRpc="get_ranking"` / `timeoutMs=8000`。
- `isConfigured()`: URL と anon key が揃っていれば true。
- `submitScore({playerName, score}) → Promise<{status, firstScore, bestScore, rank, message}>`
  - `status ∈ {ok, skipped, error}`。
  - **二重送信防止**: 初回呼び出しで送信し Promise をキャッシュ。再呼び出しは同一 Promise。
  - 未設定なら `skipped`。失敗なら `error`(例外を投げない)。
  - 送信 body: `{ p_game_slug, p_player_name(24字まで), p_score(整数) }`。
- `fetchRanking(limit=10) → Promise<[{playerName,bestScore,firstScore,rank}]>`
  失敗・未設定時は空配列。
- `resetSubmission()`: 新規プレイ開始時に送信状態を初期化。

## 6. チュートリアル: `src/tutorial.js`

- **目的**: 本番は 5×5 だが、4×4 の小盤面でルールと操作を自動アニメで解説。
- 盤面: 4×4・4分割(クォーター)の `REGIONS=["AABB","AABB","CCDD","CCDD"]`。
  解 `SOLUTION=[[0,1],[1,3],[2,0],[3,2]]`(各行/列/エリア1個・斜め隣接なし)。
- ステップエンジン: `async` シーケンス + キャンセル可能な `delay(ms, runId)`。
  `runId` 世代で再生をキャンセル(再生し直し・モーダルを閉じる時)。
- 流れ: 導入 → タップで置く → ルール①行 → ②列 → ③エリア → ④隣接(各ルールで
  ハイライト + 誤り例 `ghost-bad` を ✗ 表示)→ 残りを ✓ 付きで配置 → クリア演出
  → 「本番は5×5・3ステージ」。進捗バー(`#tutorial-bar`)を更新。
- 公開 API: `playTutorial()`(最初から再生)/ `stopTutorial()`(停止)。
- DOM 構築は初回のみ。タイマー以外の副作用なし・例外は `catch` で無視。

## 7. スタイル: `src/styles.css`

- `.app` は `max-width:480px` 中央寄せ。`overflow-x:hidden`。
- 盤面 `.board` は `width:min(92vw,380px)`, `aspect-ratio:1`, 5×5 grid。
- エリア色: `--area-a..e`(淡色 5 種)。`.cell.filled .tomato` で 🍅 表示。
- `.mistake`(揺れ+赤)/ `.cleared`(pop)/ `.toast` / 結果・ランキング表。
- モーダル: `.modal`/`.modal-card`(`modal-in` アニメ)/`.modal-close`。
- チュートリアル盤面: `.tboard`/`.tcell`、`hl-soft`(黄ハイライト)/
  `adj`(隣接赤枠)/`ghost-bad`(誤り例)/`mark-ok`(✓)/`mark-bad`(✗)/
  `tcleared`(クリア演出)。
- `@media (max-width:340px)` で iPhone SE 微調整(`.tboard` も縮小)。

## 8. 保存・通信の制約(遵守事項)

- localStorage: `tomatoku.playerName` のみ。スコア/履歴/進行は保存しない。
- ランキング送信はゲーム終了時 1 回のみ。
- secret key は使わない(anon key のみ)。
- 配信容量は数十 KB(画像/音声/ライブラリなし)。
