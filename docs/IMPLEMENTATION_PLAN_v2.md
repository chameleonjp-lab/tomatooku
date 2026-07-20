# トマトオク v2 実装計画

- 文書種別: 現行実装・残工程計画
- 対象: `chameleonjp-lab/tomatooku`
- 基準ブランチ: `main`
- 更新日: 2026-07-20
- 現在状態: 公式ランキング公開済み／生成器v2 Slice 3は制約上BLOCKED

## 1. 運用ルール

- `main`へ直接変更しない
- 1 work package = 1 Pull Request
- 実装、テスト、文書更新を同じPRで完結させる
- CI失敗中に別PRへ逃げない
- 公式3問、ランキング、Supabaseを生成器作業へ混在させない
- Draft解除、マージ、候補バンク有効化は明示的な人間判断を必要とする
- secret key、service role keyをブラウザへ置かない
- 現行30問とロールバック可能性を維持する

## 2. 現行の正式仕様

### ゲーム

- 5×5盤面
- 5エリア
- 各行・各列・各エリアに🍅1個
- 🍅同士は上下左右・斜めで隣接禁止
- 3ステージ

### モード

- 公式3問: `T001 / T011 / T021`
- ランダム練習: 現行30問から3問選出
- 練習結果はランキング未送信

### 補正タイム

```text
補正タイム
= 実時間
+ 誤タップ数 × 3秒
+ ヒント数 × 30秒
```

### ランキング

- `game_slug`: `tomatoku`
- 短い補正タイムが上位
- `score_scale=100`
- `score_decimals=2`
- 公式1プレイにつき送信1回
- 初回記録、ベスト記録、プレイ回数を共有Supabaseへ保存

## 3. 完了済みwork package

### 3-1. v2文書・契約

状態: **completed**

成果物:

- `docs/REQUIREMENTS_v2.md`
- `docs/SPEC_v2.md`
- 本計画書

### 3-2. 共通ランキング連携

状態: **completed**

実装:

- 共有RPC契約
- タイムアウト
- エラー分類
- play ID単位の二重送信防止
- 初回・ベストランキング取得

### 3-3. タイマー・非同期競合

状態: **completed**

実装:

- `performance.now()`
- countdownを計測から除外
- ステージ間演出を計測から除外
- 古い非同期処理の無効化
- ステージ別時間

### 3-4. 公式3問・練習・補正タイム

状態: **completed**

実装:

- 公式と練習の分離
- 公式問題固定
- 練習問題の重複防止
- 補正タイムと内訳
- 公式のみランキング送信

### 3-5. UI・アクセシビリティ

状態: **completed**

実装:

- iPhone SE相当320px対応
- モーダルフォーカス管理
- キーボード操作
- 誤タップ理由
- `prefers-reduced-motion`
- 強制カラーモード
- 保存内容・個人情報注意

### 3-6. 公式ランキング公開

状態: **completed**

実施:

- `public.games`へ登録
- `anon` SELECT権限とRLS確認
- 送信、初回、ベスト、プレイ回数の実疎通
- テストデータ削除
- `submissionsEnabled=true`

### 3-7. CI

状態: **completed**

GitHub Actionsで次を自動実行する。

- `npm ci`
- `npm test`
- 生成器成立性監査
- Chromium導入
- iPhone SE相当Playwright E2E

## 4. 生成器v2

### 4-1. Slice 1：正解配置基盤

状態: **completed**

実装:

- 正解配置14種類の完全列挙
- D4の8変換
- 3対称クラスへの正規化
- seed付き乱数
- 安定`patternId`
- 安定`symmetryClassId`

固定成果物:

```text
generated/solution-patterns-v2.json
```

### 4-2. Slice 2：連結エリア候補

状態: **completed**

実装:

- 正解セルを種とした領域成長
- 各エリア5マス
- 4近傍連結検証
- 一意解ソルバ
- D4・エリア名canonical化
- 安定`stageId`
- 上限付き探索

固定成果物:

```text
generated/stage-candidates-v2.json
```

### 4-3. Slice 3：84問候補バンク

状態: **BLOCKED BY CONSTRAINTS**

当初計画:

- 対称形を除外
- 近似盤面を除外
- 最低84問
- 各エリア5マス

全探索結果:

```text
正解配置                         14
連結5マス×5領域の完全分割        21,452
一意解付きラベル盤面              36
D4・エリア名正規化後               5
要求数                            84
成立                              false
```

固定成果物:

```text
generated/stage-bank-feasibility-v2.json
docs/GENERATOR_V2_BANK_FEASIBILITY.md
```

結論:

- 試行回数を増やしても84canonical問にはならない
- 現仕様での理論上限は5canonical問
- 現行30問も同じ正規化では5型
- `candidate-v2`の有効化は禁止

## 5. 現在のバンク契約

```text
ACTIVE_STAGE_BANK_ID = legacy-v1
legacy-v1.runtimeEnabled = true
legacy-v1.rankingEligible = true
candidate-v2.runtimeEnabled = false
candidate-v2.rankingEligible = false
candidate-v2.status = blocked-by-constraints
```

生成器v2作業によって次を変更してはいけない。

- `src/stages.js`
- 公式`T001 / T011 / T021`
- ランダム練習の選出元
- 本番ランキング
- Supabaseデータ

## 6. 必須の人間判断ゲート

次のいずれかを正式決定するまで、84問バンク実装を再開しない。

### A. 対称形を別問題として許容

- ルール変更なし
- 実装容易
- 実質構造は5型
- 「対称形除外」を撤回する必要あり

### B. 各エリア5マス固定を緩和

例:

```text
エリア数: 5
各エリア: 3〜7マス
合計: 25マス
各エリアは4近傍連結
```

- 中心ルールを維持しやすい
- canonical多様性増加が期待できる
- 新契約の全探索監査が必要

**推奨案: B**

### C. 盤面サイズまたは隣接ルールを変更

- 6×6化
- 斜め隣接禁止の変更
- エリア数変更

ゲーム性とUIへの影響が大きい。

### D. 84問目標を撤回

- 現行30問を維持
- 5canonical型を許容
- 新バンクを作らない

## 7. 推奨する次work package

人間判断でBが採用された場合、次の順で進める。

### 7-1. 可変エリア契約比較

候補:

```text
3〜7マス
2〜8マス
最小3マス・最大値のみ制限
```

各候補について全探索または完全性を説明できる列挙を実行する。

合格条件:

- 84canonical問以上の存在を実装前に確認
- 5エリア・合計25マス
- 全エリア連結
- 一意解
- 小さすぎるエリアによる視認性問題なし

### 7-2. 新validator

- 可変サイズ範囲
- A〜E
- 合計25マス
- 4近傍連結
- 一意解
- 安定ID
- D4重複なし

### 7-3. 候補バンク生成

- 84問以上
- 人間向け難易度指標
- 配置・エリアサイズ分布制御
- 近似盤面距離
- seed再現性

### 7-4. 人間レビュー

- iPhone SE
- iPhone 17 Pro
- 難易度分布
- エリア識別性
- 似た盤面の体感

### 7-5. バンク切替

人間承認後のみ:

- `candidate-v2.runtimeEnabled=true`
- 練習モードだけ先行切替
- 公式3問は変更しない
- ランキング契約は変更しない

## 8. 公開・実機の残確認

コード上の公開準備は完了しているが、次は継続確認対象とする。

- Codeberg Pages反映
- 実験場カード
- 詳細ランキング表示
- iPhone 17 Pro実送信
- iPhone 11 Pro
- iPad Pro縦横
- 低速回線
- 一時オフライン
- 共有キャンセル

## 9. 完成条件

- 現行ゲームと文書が一致
- 公式と練習が分離
- 補正タイムの小さい順
- 公式1プレイ1送信
- CI成功
- 主保証端末で操作不能なし
- 実験場と詳細ランキングへ接続
- 生成器v2の新契約が成立性監査済み
- 候補バンク有効化が人間承認済み

現時点では、ゲーム公開部分は完成状態、生成器v2拡張は仕様判断待ちです。
