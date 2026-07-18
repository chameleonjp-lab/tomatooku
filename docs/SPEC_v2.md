# トマトオク v2 技術仕様

- 対象: `chameleonjp-lab/tomatooku`
- `game_slug`: `tomatoku`
- 公開名・リポジトリ名: `tomatooku`
- 標準公開先: `https://chameleonjp.codeberg.page/tomatooku/`

## 1. ゲーム概要

5×5の盤面へ🍅を5個置くパズル。次をすべて満たすとクリアする。

- 各行に1個
- 各列に1個
- 各エリアに1個
- 上下左右斜めで隣接しない

1プレイは難易度1・2・3の3ステージで構成する。

## 2. モード

### 公式

```text
mode = "official"
```

出題は固定する。

```text
T001
T011
T021
```

順序も固定し、全プレイヤーが同じ条件で遊ぶ。ランキング対象となる唯一のモードである。

起動時またはテストで次を検証する。

- 3件すべてが存在
- IDが重複しない
- 難易度が1→2→3
- 正解配置署名が重複しない

### ランダム練習

```text
mode = "practice"
```

難易度1・2・3から1問ずつ選ぶ。ステージIDと正解配置署名が重複しない有効な3問組を事前列挙し、その中から選ぶ。

ランキングへは送信しない。

## 3. モジュール責務

```text
index.html
  画面構造、モード選択、結果内訳

src/main.js
  状態遷移、DOM、入力、共有、ランキング連携

src/game.js
  盤面ルール、モード別問題選出、セッション、タイマー、補正タイム

src/stages.js
  検証済み30ステージ

src/ranking-config.js
  ブラウザ公開可能な接続設定と送信ゲート

src/ranking.js
  共有Supabase RPC、通信状態、二重送信防止

src/tutorial.js
  4×4チュートリアル

src/styles.css
  モバイル優先UI
```

## 4. 状態遷移

```text
home
countdown
playing
stageTransition
result
retired
```

主な遷移:

```text
home -> countdown
countdown -> playing
countdown -> home
playing -> stageTransition
playing -> retired
stageTransition -> playing
stageTransition -> result
stageTransition -> retired
result -> countdown
result -> home
```

非同期コールバックは、保持したplay IDと現在のplay IDが一致するときだけ反映する。

## 5. セッション

```js
GameSession {
  playId: string;
  mode: "official" | "practice";
  playerName: string;
  stages: Stage[];
  index: number;
  states: StageState[];
  mistakeCount: number;
  hintCount: number;
  stageMistakeCounts: number[];
  stageHintCounts: number[];
  stageTimesMs: number[];
  accumulatedMs: number;
  stageStartedAt: number | null;
  status: SessionStatus;
}
```

play IDは開始ごとに新しくする。画面遷移だけを理由にランキング送信キャッシュを解除しない。

## 6. タイマー

時計は`performance.now()`を優先する。

- カウントダウン中は未計測
- 盤面DOM構築・描画後の次フレームで開始
- 5個目の配置でクリア確定した瞬間に停止
- クリア演出中は未計測
- 次盤面の描画待ち中は未計測
- `finishStage()`を二重に呼んでも重複加算しない
- バックグラウンド滞在は経過時間として扱う

各ステージの実時間を`stageTimesMs`へ保存する。

## 7. 補正タイム

ランキング値は100分の1秒単位の非負整数とする。

```js
const MISTAKE_CENTISECONDS = 300;
const HINT_CENTISECONDS = 3000;

score =
  floor(max(0, elapsedMs) / 10)
  + max(0, mistakeCount) * MISTAKE_CENTISECONDS
  + max(0, hintCount) * HINT_CENTISECONDS;
```

表示:

```text
score / 100 秒
小数2桁固定
```

DBメタデータ:

```text
score_order = asc
score_unit = 秒
score_scale = 100
score_decimals = 2
score_label = 補正タイム
first_score_label = 初回タイム
best_score_label = ベストタイム
```

## 8. 結果内訳

結果画面に次を表示する。

- モード
- 補正タイム
- 実時間
- 誤タップ数
- 誤タップ加算秒
- ヒント数
- ヒント加算秒
- 各ステージの実時間
- 各ステージの誤タップ数
- 各ステージのヒント数

## 9. ランキング契約

送信:

```text
POST /rest/v1/rpc/submit_score
```

```json
{
  "p_display_name": "表示名",
  "p_game_slug": "tomatoku",
  "p_score": 4835,
  "p_client_version": "tomatooku-web-2.1.0-mode-score-v1"
}
```

取得:

```text
get_best_score_ranking(p_game_slug, p_limit)
get_first_try_ranking(p_game_slug, p_limit)
```

返却列:

```text
rank_no
display_name
first_score
best_score
play_count
updated_at
```

送信条件:

- `mode === "official"`
- play IDが空でない
- ランキング設定が有効
- `submissionsEnabled === true`
- 同一play IDでは1回だけ

練習、リタイア、設定不備、送信ゲートOFFでは送信しない。

## 10. 送信ゲート

現在は`public.games`への登録と本番疎通が未完了のため、次で停止する。

```js
submissionsEnabled: false
```

解除は公開準備工程で行う。コード実装完了だけで有効化しない。

## 11. 通信状態

```text
ok
empty
error
not_configured
skipped
```

- `ok`: 正常
- `empty`: 取得成功・0件
- `error`: HTTP、タイムアウト、JSON、返却形式不正
- `not_configured`: URLまたはPublishable key不足
- `skipped`: 練習または送信ゲートOFF

タイムアウトは`AbortController`で実通信を中止する。

## 12. 名前

送信前に次を適用する。

1. NFKC正規化
2. 制御文字・方向制御文字の除去
3. 連続空白を1つへ集約
4. 前後空白を除去
5. 20文字以内
6. 空文字を拒否

## 13. ヒント

ヒントは次を返す。

```js
{
  placed: [row, col] | null,
  removed: Array<[row, col]>
}
```

正解でない配置を除去し、未配置の正解セルを1つ置く。使用1回につき補正タイムへ30秒加算する。

## 14. 誤タップ

配置不可理由:

```text
row
col
region
adjacent
full
```

誤タップ1回につき補正タイムへ3秒加算する。

## 15. 共有

- Web Share API対応時は明示的に使用
- `AbortError`はユーザーキャンセルとして終了
- キャンセル後にクリップボードへフォールバックしない
- コピー本文には正式URLを含める
- 結果共有にはモード、補正タイム、実時間、誤タップ、ヒントを含める

## 16. 非同期競合防止

管理対象:

```text
countdown timeout
countdown requestAnimationFrame
stage transition timeout
timer requestAnimationFrame
toast timeout
ranking Promise
```

ホーム移動、リタイア、再開始時に待機処理を解除する。古いランキングPromiseは新しいプレイのUIを更新しない。

## 17. セキュリティ

- Publishable keyのみ使用
- `apikey`ヘッダーだけを送る
- secret key禁止
- service role key禁止
- `Authorization: Bearer`禁止
- テーブルへ直接INSERTしない
- 共有RPCや共有テーブルをリポジトリ内SQLで置換しない

## 18. 対応端末

- 主保証: iPhone 17 Pro Safari
- 検証: iPhone 11 Pro、iPad Pro 2018
- 補助: iPhone SE相当幅、Chromium、WebKit
- 横スクロールなし
- タップ反応100ms以内を目標
- 盤面操作中30fps以上を目標

## 19. テスト

単体:

- 公式IDと順序
- 公式設定不正の拒否
- 練習500回の重複なし
- 補正タイム式
- 小数2桁表示
- ステージ別時間と加算回数
- 演出除外
- 二重終了防止
- 練習送信停止
- 公式送信ゲート
- 共通RPC本文
- 同一play ID二重送信防止

E2E:

- モードボタン
- カウントダウン
- 公式ID順序
- 公式3問クリア
- 補正タイム結果
- ステージ別内訳
- 練習開始
- 送信ゲート表示
- 320px横スクロールなし

## 20. 公開前の残作業

- `public.games`登録
- 本番RPC疎通
- 送信ゲート有効化
- 実験場カード・詳細ランキング導線
- Chromium / WebKit E2E
- iPhone実機確認
- 公開URL確認
