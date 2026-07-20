# 可変盤面 人間レビュー基盤

- 対象リポジトリ: `chameleonjp-lab/tomatooku`
- 対象候補プール: `generated/variable-stage-candidate-pool-v2.json`
- 対象件数: 108問
- 画面: `review/variable-stage-review.html`
- 文書状態: implemented / human review pending
- 更新日: 2026-07-20

## 1. 目的

可変エリア4〜6マスの候補108問から、ランダム練習へ採用する完成バンクを選別する。

候補プールは次の状態であり、そのままゲームへ接続しない。

```text
status = candidate-pool-ready-for-review
runtimeEnabled = false
rankingEligible = false
ACTIVE_STAGE_BANK_ID = legacy-v1
```

候補108問には、D4変換後の構造距離が1の問題が59問含まれる。自動選別だけでは体感上の重複、境界の見やすさ、難易度の妥当性を判断できないため、人間レビューを必須とする。

## 2. 起動方法

ES ModulesとJSON取得を使用するため、ファイルを直接開かずHTTP配信する。

```bash
npm run serve
```

ブラウザで次を開く。

```text
http://localhost:8080/review/variable-stage-review.html
```

特定の問題を直接開く場合:

```text
http://localhost:8080/review/variable-stage-review.html?stage=STG-xxxxxxxx
```

このページはゲーム本体の`index.html`からリンクしない。公開ゲームの通常導線にも追加しない。

## 3. 表示内容

### 3-1. レビュー対象

- Stage ID
- 5×5盤面
- 正解表示切替
- 自動難易度1〜3
- 難易度score
- 正解配置の対称クラス
- エリアサイズ構成
- 仮定分岐数
- 最大仮定深さ
- 最近傍構造距離

### 3-2. 最近傍盤面

全108問から、D4変換とエリア名の正規化を考慮して最短距離となる問題を再計算する。

比較側には、距離が最小となる次のいずれかを適用する。

- 変換なし
- 90度・180度・270度回転
- 左右反転
- 上下反転
- 主対角線反転
- 反対角線反転

比較後に異なるセルへ太枠を表示する。画面内で計算した最近傍距離がmanifest記録値と一致しない場合、読み込み状態へ警告を表示する。

## 4. レビュー判断

各候補について次の1つを保存する。

```text
keep     採用
reject   除外
hold     保留
未保存   未判断
```

除外・保留理由:

- 近似盤面
- 境界が見づらい
- 自動難易度と体感が不一致
- 簡単すぎる
- 難しすぎる
- その他

補足メモは最大500文字とする。

## 5. フィルターと移動

表示条件:

- 判断状態
- 最近傍距離1、2、3以上
- 難易度1〜3
- 対称クラス
- エリアサイズ構成
- Stage ID検索

並び順:

- 最近傍距離が近い順
- 難易度順
- Stage ID順

操作:

- 前へ・次へ
- 次の未判断へ
- URLクエリへ現在Stage IDを反映

キーボード:

```text
← / →  前後移動
K        採用
R        除外
H        保留
U        未判断へ戻す
```

入力欄・選択欄へフォーカスしている間はショートカットを発火しない。

## 6. 保存契約

判断内容はブラウザの`localStorage`だけへ保存する。

```text
localStorage["tomatooku.variableStageReview.v1"]
```

保存内容:

```json
{
  "schemaVersion": 1,
  "manifestGeneratorVersion": "2.6.0-variable-pool.1",
  "updatedAt": "ISO-8601",
  "decisions": {
    "STG-xxxxxxxx": {
      "status": "keep | reject | hold",
      "reason": "near-duplicate | visual-boundary | difficulty-mismatch | too-easy | too-hard | other | empty",
      "note": "最大500文字",
      "reviewedAt": "ISO-8601"
    }
  }
}
```

Supabase、ランキングRPC、外部APIへ送信しない。

## 7. JSON入出力

### 7-1. 書き出し

レビュー結果を次のファイル名で書き出す。

```text
tomatooku-variable-review-YYYY-MM-DD.json
```

用途:

- 別端末への移行
- レビューのバックアップ
- 完成バンク選別スクリプトへの入力
- GitHub上へ判断根拠を残すための資料

### 7-2. 読み込み

同じschema versionのJSONだけを受け入れる。

- 現在の108問に存在しないStage IDは無視
- 不正な判断状態は無視
- メモは500文字へ切り詰め
- 現在の判断へStage ID単位で統合

## 8. 推奨レビュー順

### 第1巡: 距離1の59問

近似盤面の除外を優先する。

判断観点:

- 1セル差でも解法体験が変わるか
- エリア境界の見た目が明確に異なるか
- 同じ問題を再提示された印象になるか
- 片方だけ難易度・学習価値が高いか

### 第2巡: 距離2の33問

- 距離1で残した問題との体感重複
- 難易度分布
- 対称クラス分布
- サイズ構成分布

### 第3巡: 距離3以上の16問

基本的には採用候補とするが、視認性と難易度の妥当性を確認する。

## 9. 完成バンクの判断条件

レビュー基盤自体は完成バンクを自動生成しない。

完成バンクへ進む前に、少なくとも次を満たす。

- 未判断0件、または未判断を除外する明示判断
- 採用84問以上
- 距離1問題を人間が全件確認
- 難易度1〜3の必要数を確保
- 希少対称クラス`SC-3a178cba`を可能な範囲で維持
- iPhone SEで境界判別不能な問題を除外
- iPhone 17 Proで体感難易度を確認
- JSONレビュー結果を保存

採用が84問未満の場合は、候補生成条件または距離閾値を再検討する。未確認問題を自動採用して84問へ水増ししない。

## 10. テスト契約

### 静的テスト

```bash
npm run test:variable-stage-review
```

検証内容:

- 必須UI
- 320px対応
- reduced motion
- forced colors
- Supabase・ランキング通信なし
- ゲーム本体からの自動接続なし
- 108問安全状態
- 最近傍距離の独立再計算
- manifest距離分布との完全一致
- ID・canonical重複なし

### ブラウザE2E

```bash
npm run e2e:review
```

iPhone SE相当`320×568`で次を確認する。

- 108問読み込み
- 盤面ペア表示
- 差分セル数と距離の一致
- 正解5個表示
- 採用・保留保存
- 再読み込み復元
- フィルター
- URL復帰
- JSON生成内容
- JSON読み込み
- 横スクロールなし
- 全判断消去
- console errorなし

## 11. ロールバック

レビュー画面はゲーム実行経路から独立している。

問題が発生した場合は次のファイル群を削除しても、公開ゲーム・公式3問・ランキングへ影響しない。

```text
review/variable-stage-review.html
review/variable-stage-review.css
review/variable-stage-review.js
scripts/variable-stage-review.test.js
scripts/variable-stage-review.e2e.js
docs/VARIABLE_STAGE_REVIEW_TOOL.md
```

候補プール、現行30問、公式3問は変更しない。
