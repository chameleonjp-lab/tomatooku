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

## 生成器v2の状態

### Slice 1：正解配置基盤

5×5ルールを満たす正解配置14種類を完全列挙し、回転・反転を含むD4対称変換で3クラスへ正規化します。

- 個別配置の安定`patternId`: 14件
- 対称クラスの安定`symmetryClassId`: 3件
- seed付きMulberry32と非破壊Fisher–Yates shuffle
- generator versionとseedを持つ固定manifest

```text
generated/solution-patterns-v2.json
```

### Slice 2：固定5マス連結エリア候補

正解セルを別エリアの種として、各5マス・4近傍連結のエリアへ成長させます。全探索ソルバで一意解を確認し、エリア名、回転、反転に依存しない安定`stageId`を生成します。

```text
正解配置: 14
候補生成成功: 10
試行上限到達: 4
対称重複除外後: 5盤面
確認できた解配置対称クラス: 2 / 3
```

```text
generated/stage-candidates-v2.json
```

### Slice 3：固定5マス84問成立性監査

現在の盤面契約を固定して全探索しました。

```text
正解配置                     14
連結5マス×5領域の完全分割    21,452
一意解付きラベル盤面          36
D4・エリア名正規化後           5
要求されたcanonical盤面       84
目標成立                      false
```

固定5マス契約では、対称形を除外した84問バンクは構築できません。最大数は5問です。

```text
generated/stage-bank-feasibility-v2.json
```

```text
candidate-v2.runtimeEnabled = false
candidate-v2.rankingEligible = false
candidate-v2.status = blocked-by-constraints
```

### Slice 4：可変4〜6マス84問成立性監査

中心ルールを維持したまま、エリアサイズだけを4〜6マスへ緩和して存在証明型の監査を行いました。

```text
要求canonical盤面                    84
確認canonical盤面                    84
目標成立                              true
処理した正解配置                      1 / 14
訪問した連結完全分割                  9,524
一意解として確認した分割              84
```

サイズプロファイル:

```text
4-4-5-6-6    65問
4-5-5-5-6    19問
```

`3〜7マス`まで広げる必要はなく、最小緩和`4〜6マス`だけで84問が成立します。

```text
generated/stage-bank-variable-feasibility-v2.json
```

```text
candidate-v2-variable-4-6.runtimeEnabled = false
candidate-v2-variable-4-6.rankingEligible = false
candidate-v2-variable-4-6.status = feasible-pending-contract-approval
```

成立確認は仕様採用を意味しません。現行30問、公式3問、ランダム練習には接続していません。

詳細:

- `docs/GENERATOR_V2_FOUNDATION.md`
- `docs/GENERATOR_V2_REGIONS.md`
- `docs/GENERATOR_V2_BANK_FEASIBILITY.md`
- `docs/GENERATOR_V2_VARIABLE_REGION_FEASIBILITY.md`

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

## アクセシビリティ

- モーダルを開いたときにフォーカスを内部へ移動
- `Tab`キーをモーダル内へ閉じ込める
- 閉じたときに起点のボタンへフォーカスを戻す
- 盤面を操作グループとして説明
- 配置・取り除き・誤タップ理由をライブ領域で通知
- キーボードフォーカスを明確に表示
- `prefers-reduced-motion`に対応
- 強制カラーモード用の輪郭を追加
- 320px幅ではHUDを2列へ組み替え
- 外部リンクが新しいタブで開くことを読み上げへ追加
- チュートリアル進行度を`progressbar`として提供

## プレイヤー名と保存内容

ブラウザ内の`localStorage`にはプレイヤー名だけを保存します。

```text
localStorage["tomatoku.playerName"]
```

公式プレイでは、次の情報が公開ランキングへ保存されます。

- プレイヤー名
- 補正タイム
- プレイ回数

ランダム練習の結果は送信しません。本名、メールアドレス、電話番号を入力しない案内を画面に表示します。

## ローカル実行

ES Modulesを使うため、HTTPで配信してください。

```bash
npm run serve
# http://localhost:8080
```

## 開発コマンド

```bash
npm run gen                              # 現行30問バンクを再生成
npm run gen:v2                           # v2配置manifestと候補probeを再生成
npm run gen:v2:patterns                  # v2正解配置manifestを再生成
npm run gen:v2:candidates                # v2固定5マス候補manifestを再生成
npm run audit:v2:bank                    # 固定5マス84問成立性を全探索監査
npm run audit:v2:variable-regions        # 可変4〜6マスで84問の存在を監査
npm run verify                           # 現行ステージ形式・一意解検証
npm test                                 # 全静的・契約テスト
npm run test:game                        # ゲームロジック
npm run test:ranking                     # ランキング契約
npm run test:launch                      # 本番送信ゲートと公開導線
npm run test:accessibility               # UIアクセシビリティ契約
npm run test:generator-v2                # v2生成器の全契約
npm run test:generator-v2:foundation     # v2列挙・対称性・seed・ID契約
npm run test:generator-v2:regions        # v2固定5マス・一意解・盤面ID契約
npm run test:generator-v2:feasibility    # 固定5マス全探索・停止契約
npm run test:generator-v2:variable-regions # 可変4〜6マス成立性契約
npm run e2e                              # Playwrightブラウザテスト
npm run serve                            # ローカルHTTPサーバー
```

## 構成

```text
generated/
  solution-patterns-v2.json
  stage-candidates-v2.json
  stage-bank-feasibility-v2.json
  stage-bank-variable-feasibility-v2.json
index.html
src/
  accessibility.css
  accessibility.js
  game.js
  main.js
  ranking-config.js
  ranking.js
  stage-bank-config.js
  stages.js
  styles.css
  tutorial.js
scripts/
  generator-v2/
    core.js
    core.test.js
    feasibility.js
    feasibility.test.js
    regions.js
    regions.test.js
    variable-feasibility.js
    variable-feasibility.test.js
  accessibility.test.js
  audit_stage_bank_v2.js
  audit_variable_region_sizes_v2.js
  generate_stages.js
  generate_stages_v2.js
  generate_stage_candidates_v2.js
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
  ACCESSIBILITY_REVIEW_v2.md
  GENERATOR_V2_FOUNDATION.md
  GENERATOR_V2_REGIONS.md
  GENERATOR_V2_BANK_FEASIBILITY.md
  GENERATOR_V2_VARIABLE_REGION_FEASIBILITY.md
```

## セキュリティ

ブラウザにはPublishable keyだけを置きます。secret key、service role key、`Authorization: Bearer`は使用しません。共有Supabaseの関数やテーブルを、このリポジトリのSQLで置き換えないでください。
