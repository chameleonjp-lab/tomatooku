# トマトオク v2 技術仕様

- 文書種別: 将来版の技術契約
- 対象リポジトリ: `chameleonjp-lab/tomatooku`
- `game_slug`: `tomatoku`
- 公開名・リポジトリ名: `tomatooku`

> この文書はv2の目標技術仕様であり、現行実装済み仕様ではない。

## 1. 現行v1との差

v1は、ランダム3問、180,000点からの減点方式、独自想定RPC、`Date.now()`による計測で動作する。

v2では次へ変更する予定。

- 公式3問とランダム練習を分離
- 公式3問だけをランキング対象にする
- 補正タイムの小さい順へ変更
- 共通Supabase RPCへ合わせる
- `performance.now()`で操作可能時間を計測
- カウントダウン、ステージ別時間、競合防止を追加
- 実験場と詳細ランキングへの導線を追加

v2実装完了までは、既存`docs/SPEC.md`を現行v1の実装仕様として扱う。

## 2. モジュール責務

現行の複数ファイル・ES Modules構成を維持する。

```text
index.html
  画面の土台、公開設定、モーダル、導線

src/main.js
  画面遷移、入力、描画、共有、ランキングとの橋渡し

src/game.js
  セッション、ステージ状態、タイマー、補正タイム

src/stages.js
  検証済みステージバンク

src/ranking.js
  共通Supabase RPC、通信状態、二重送信防止

src/tutorial.js
  遊び方表示

src/styles.css
  端末別レイアウト、状態表示、アクセシビリティ
```

定数とURLを複数ファイルへ重複記載しない。公開URL、実験場URL、詳細ランキングURL、`CLIENT_VERSION`、`game_slug`は一元設定する。

## 3. 状態遷移

```text
home
countdown
playing
stageTransition
result
retired
```

許可する主な遷移:

```text
home -> countdown
countdown -> playing
countdown -> home
playing -> stageTransition
playing -> retired
stageTransition -> playing
stageTransition -> result
stageTransition -> retired
retired -> home
result -> countdown
result -> home
```

状態外の入力は無視する。非同期処理は、開始時の状態とplay IDが一致する場合だけ結果を反映する。

## 4. セッションモデル

```js
GameSession {
  playId: string;
  mode: "official" | "practice";
  playerName: string;
  stages: Stage[];
  stageIndex: number;
  states: StageState[];
  mistakeCount: number;
  hintCount: number;
  stageTimesMs: number[];
  accumulatedMs: number;
  stageStartedAt: number | null;
  completedAt: number | null;
  status: SessionStatus;
}
```

`playId`はプレイ開始ごとに新しくする。古いタイマー、通信、演出処理は、保持している`playId`と現在値が異なれば何もしない。

## 5. 公式・練習の問題選出

### 公式

```js
selectOfficialStages(config): Stage[]
```

- 設定された3つのステージIDを同じ順序で返す
- 3件すべてが存在することを起動時またはテストで確認する
- 難易度1・2・3を1問ずつ含む
- 同じ正解配置を持たないことを確認する
- 不正な設定時はランキング対象プレイを開始しない

具体的なIDは未決定。

### 練習

```js
selectPracticeStages(rand): Stage[]
```

- 難易度1・2・3から1問ずつ
- ステージIDを重複させない
- 正解配置の署名を重複させない
- 条件を満たす3問組が存在しない場合、黙って重複を許さず設定エラーにする

有効な3問組を事前に列挙し、その配列から選ぶ方式を推奨する。

## 6. タイマーAPI

単調増加する時計を使う。

```js
const now = () => performance.now();
```

想定API:

```js
session.startStage(nowMs)
session.finishStage(nowMs)
session.elapsedMs(nowMs)
session.currentStageElapsedMs(nowMs)
```

規則:

- `countdown`中は計測しない
- `playing`へ入る直前に開始する
- 5個目を置いてクリア確定した瞬間に終了する
- `stageTransition`中は計測しない
- 次盤面のDOM構築後、入力を有効にする直前に再開する
- バックグラウンド中は経過扱いにする
- `finishStage`の二重呼び出しで重複加算しない

## 7. 補正タイム計算API

```js
const PENALTY = {
  MISTAKE_CENTISECONDS: 300,
  HINT_CENTISECONDS: 3000,
};

function computeAdjustedTime({
  elapsedMs,
  mistakeCount,
  hintCount,
}) {
  return (
    Math.floor(Math.max(0, elapsedMs) / 10)
    + Math.max(0, mistakeCount) * PENALTY.MISTAKE_CENTISECONDS
    + Math.max(0, hintCount) * PENALTY.HINT_CENTISECONDS
  );
}
```

返り値は100分の1秒単位の非負整数。表示時は`score / 100`秒として小数2桁にする。

## 8. ステージ別時間

各ステージ終了時に実プレイ時間を`stageTimesMs`へ保存する。

```js
stageTimesMs.length === completedStageCount
sum(stageTimesMs) === accumulatedMs
```

誤差は整数丸め前のミリ秒で管理し、補正タイム計算時だけ100分の1秒へ変換する。

## 9. ランキング通信契約

### 設定

```js
const RANKING_CONFIG = {
  gameSlug: "tomatoku",
  clientVersion: "tomatooku-2.0.0", // 最終値は未決定
  timeoutMs: 8000,
};
```

### 送信

```text
POST /rest/v1/rpc/submit_score
```

```json
{
  "p_display_name": "表示名",
  "p_game_slug": "tomatoku",
  "p_score": 4835,
  "p_client_version": "tomatooku-2.0.0"
}
```

公式モードの完了時だけ呼ぶ。練習、リタイア、初期化失敗では呼ばない。

### 取得

```text
get_best_score_ranking
get_first_try_ranking
```

本番RPCの正確な引数と返却列は、実装前に共有Supabaseの現行定義を確認して固定する。推測で互換コードを書かない。

## 10. 通信状態

```js
{
  status: "ok" | "empty" | "error" | "not_configured",
  rows: [],
  message: ""
}
```

- `ok`: 1件以上取得
- `empty`: 正常応答だが0件
- `error`: 通信、タイムアウト、形式不正
- `not_configured`: 公開設定不足

`fetch`は`AbortController`で中止する。単にPromiseだけをタイムアウトさせて通信を残さない。

## 11. 二重送信防止

送信単位は`playId`。

```js
Map<playId, Promise<SubmitResult>>
```

同じ`playId`の再呼び出しは既存Promiseを返す。新しいプレイは別`playId`として送信可能にする。

画面遷移だけで送信ロックを解除しない。

## 12. 名前正規化

```js
normalizeDisplayName(input): string
```

処理:

1. UnicodeをNFKC正規化
2. 制御文字を除く
3. 方向制御文字を除く
4. 前後空白を削除
5. 連続空白を1つへまとめる
6. 24文字以内に制限
7. 空文字を拒否

本名、メール、電話番号を入力しない案内を画面へ表示する。

## 13. ヒントと誤タップ

### 誤タップ結果

```js
{
  type: "mistake",
  reason: "row" | "col" | "region" | "adjacent" | "full"
}
```

UIは理由別の短文を表示する。

### ヒント結果

```js
{
  placed: [row, col] | null,
  removed: Array<[row, col]>,
  penaltyCentiseconds: 3000
}
```

配置を取り除く動作を結果として返し、UIが何が起きたか説明できるようにする。

## 14. シェア

- Web Share API対応時は`text`と`url`を重複させない
- `AbortError`はユーザーキャンセルとして終了する
- キャンセル後にクリップボードへコピーしない
- コピー用本文には正式URLを含める
- X投稿画面を自動的な最終処理として開かない。明示ボタンを使う

## 15. 競合防止

保持する値:

```js
let transitionTimerId = null;
let activePlayId = null;
```

リタイア、ホーム移動、再開始、結果破棄時に次を行う。

```js
clearTimeout(transitionTimerId)
transitionTimerId = null
activePlayId = null または新しいID
```

非同期コールバックは次を最初に確認する。

```js
if (capturedPlayId !== activePlayId) return;
```

`stageTransition`中は盤面、ヒント、リタイアを無効化するか、安全にキャンセルできる専用処理を通す。

## 16. アクセシビリティ

### モーダル

- 開いた時に見出しまたは閉じるボタンへフォーカス
- モーダル内へフォーカスを閉じ込める
- 閉じた時に元ボタンへ戻す
- 背景を`inert`にする
- 背景スクロールを止める

### 盤面

- `aria-pressed`を更新
- ラベルへ行、列、エリア、配置状態を含める
- 絵文字は読み上げ対象から外す
- 矢印キーで移動、Enter / Spaceで操作
- Tab移動対象を1マスへ絞るロービングタブインデックスを使う

### 動き

`prefers-reduced-motion: reduce`では揺れ、拡大、モーダル移動、チュートリアル自動再生を抑える。

## 17. 対応端末と性能

- 主保証: iPhone 17 Pro + Safari
- 検証: iPhone 11 Pro、iPad Pro 2018縦横
- 補助: iPhone SE相当幅、Chromium、WebKit
- 盤面操作中30fps以上
- タップ反応100ミリ秒以内
- タイム表示のDOM更新は50〜100ミリ秒間隔
- 非表示画面では描画更新を止める

## 18. テスト契約

### 単体

- 補正タイム
- 3分以上の値
- 公式3問設定検証
- 練習3問のID・正解配置非重複
- `performance.now()`前提の開始・停止・再開
- ステージ別時間
- `finishStage`二重呼び出し
- 名前正規化
- 共通RPC送信body
- 1プレイ1送信
- 通信状態分類

### ブラウザ

- カウントダウン中に盤面が見えない
- 描画後にタイマーが始まる
- クリア演出中のリタイア
- リタイア直後の再開始
- 古いコールバックが新しいプレイを進めない
- 練習は送信しない
- 公式は1回だけ送信する
- 共有キャンセル時にコピーしない
- モーダルのフォーカス復帰
- キーボード盤面操作
- reduced motion
- 実験場と詳細ランキングのリンク

### 実機

- iPhone 17 Pro Safari
- iPhone 11 Pro Safari
- iPad Pro 2018縦横
- 低速回線、一時オフライン、共有キャンセル

## 19. 未決定事項

- 公式3問のID
- `CLIENT_VERSION`最終値
- 共通RPCの引数・返却列
- 公開時のランキング移行方法
- 実験場の最新登録方法
