# トマトオク v2 タイマー・非同期競合確認

- 対象工程: v2実装計画 第3回
- 対象ブランチ: `agent/tomatooku-timer-race`
- 基準: PR #5マージ後の`main`
- 目的: 計測開始点を正確にし、古い非同期処理が別プレイを進めないようにする

## 1. 変更範囲

```text
index.html
src/game.js
src/main.js
scripts/game.test.js
scripts/e2e.test.js
README.md
docs/TIMER_REVIEW_v2.md
```

変更していない範囲:

- スコア式
- 公式・練習モード分離
- ステージ選出ロジック
- ステージデータ
- ランキングRPC契約
- Supabaseデータ
- 実験場登録
- 画面デザインの全面変更

## 2. 画面状態

画面制御は次の状態を明示的に扱う。

```text
home
countdown
playing
stageTransition
result
retired
```

`stageTransition`はゲーム画面を表示したまま入力を無効化する状態である。

## 3. カウントダウン

開始操作後に独立したカウントダウン画面を表示する。

```text
3
2
1
スタート
```

規則:

- カウントダウン中は盤面を表示しない
- カウントダウン中は計測しない
- ホームへ戻る操作で全待機タイマーを解除する
- 古いplay IDのカウントダウン完了処理は何もしない
- 盤面を構築・描画した次の`requestAnimationFrame`で計測を開始する

## 4. タイマー

ゲーム時間には単調増加時計を使う。

```js
performance.now()
```

利用できない環境だけ`Date.now()`へフォールバックする。

ステージごとの流れ:

1. 盤面DOMを構築
2. 盤面を描画
3. `requestAnimationFrame`
4. `startStage(now)`
5. 入力を有効化
6. クリア確定時に`finishStage(now)`
7. 演出と待機
8. `advance(now)`
9. 次盤面を描画
10. 次の`startStage(now)`

演出時間と盤面描画待ちは計測へ含めない。

## 5. GameSession

追加または明確化した主な状態:

```text
playId
mode
stageTimesMs
accumulatedMs
stageStartedAt
startedAt
completedAt
status
```

主なAPI:

```js
startStage(now)
finishStage(now)
advance(now)
currentStageElapsedMs(now)
elapsedMs(now)
retire()
```

`advance()`は次ステージの計測を自動開始しない。UIが盤面描画を完了した後に`startStage()`を呼ぶ。

`finishStage()`は二重呼び出し時に0を返し、時間を重複加算しない。

## 6. 非同期競合防止

保持する非同期ID:

```text
timerRafId
countdownRafId
countdownTimerIds
transitionTimerId
toastTimerId
```

プレイ開始ごとに`playId`を生成し、非同期コールバックは次を確認する。

```js
capturedPlayId === activePlayId
session.playId === activePlayId
```

次の操作では待機処理を解除する。

- カウントダウン取消し
- ゲーム中のホーム移動
- ステージ遷移中のホーム移動
- 結果画面からの再開始
- 結果画面からホームへ移動
- 新しいプレイ開始

## 7. ランキングとの関係

今回も現行ランダム3問はランキングへ送信しない。

`submitScore()`へ渡す値:

```js
{
  playId,
  mode: "legacy",
  playerName,
  score
}
```

ランキングクライアント側の公式モード判定により`skipped`となる。

古いプレイの送信Promiseが完了しても、play IDと現在画面が一致しない場合はUIへ反映しない。

## 8. 単体テスト

ゲームロジックテストへ次を追加または更新した。

- play IDの生成と一意性
- 計測開始前は0
- `startStage()`後だけ時間が進む
- 演出時間を除外
- 次盤面描画待ちを除外
- ステージ別時間を保持
- ステージ時間合計と累計が一致
- `finishStage()`二重呼び出しで重複加算しない
- リタイア後は計測を再開しない
- 3ステージの明示開始・終了フロー

ローカルで実行した結果:

```text
==== TEST RESULT: PASS=48 FAIL=0 ====
```

## 9. ブラウザE2E項目

`scripts/e2e.test.js`へ次を追加した。

- カウントダウンが3から始まる
- カウントダウン中に盤面がない
- カウントダウン取消し後、古い待機処理がゲームを開始しない
- 盤面描画後にほぼ0から計測開始
- ステージ遷移中にリタイアしても古い処理が次画面へ進まない
- 再プレイもカウントダウンから始まる
- 現行ランダムプレイのランキング送信停止表示

GitHub連携環境ではPlaywrightブラウザを実行していない。PRレビュー時またはCIで実行が必要。

## 10. 未確認

- iPhone 17 Pro実機
- iPhone 11 Pro実機
- iPad Pro 2018縦横
- Safariでのバックグラウンド復帰
- Playwright E2Eの実行結果
- 実Supabase書き込み
- 公式モードでのランキング送信

## 11. 次工程

次はv2実装計画 第4回「補正タイムとモード分離」。

含む内容:

- 公式3問
- ランダム練習
- 補正タイム
- 公式だけランキング送信
- 結果内訳
- ステージ別時間表示

今回のPRへ混在させない。
