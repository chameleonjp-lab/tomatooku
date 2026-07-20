# 可変エリア候補プール v2

- 対象: `chameleonjp-lab/tomatooku`
- work package: 生成器v2 Slice 6
- generator version: `2.6.0-variable-pool.1`
- stage schema: `docs/VARIABLE_REGION_STAGE_CONTRACT.md`
- 状態: **candidate-pool-ready-for-review**
- runtime: **disabled**
- ranking: **ineligible**

## 1. 目的

可変エリア4〜6マスのStage Schema v2を満たす盤面を、ゲームへ接続する前のレビュー用母集団として構築する。

成立性監査で得た84問は最初の正解配置だけに偏っていたため、そのまま完成バンクには採用しない。本プールでは次を追加する。

- D4正解配置の3対称クラスをすべて利用
- エリアサイズプロファイル分布の制御
- 構造距離による近似盤面評価
- 人間向け解法を模した難易度指標
- 難易度1〜3の均等割当
- 独立Stage Schema v2 validatorによる全件検査

## 2. 生成条件

```text
盤面                         5×5
エリア数                     5
エリアサイズ                 4〜6マス
各エリア                     4近傍連結
各行・各列・各エリア         🍅1個
隣接禁止                     上下左右・斜め
一意解                       必須
重複除外                     D4＋エリア名正規化
raw上限                      各対称クラス84問
最終選出                     合計108問
クラス最低保持               各17問
```

## 3. 実測結果

### 3-1. 全体

```text
raw候補                      185問
選出候補                     108問
対称クラス                   3
最短構造距離                 1
runtimeEnabled               false
rankingEligible              false
```

### 3-2. 対称クラス分布

```text
SC-95390462                  46問
SC-be359992                  45問
SC-3a178cba                  17問
```

`SC-3a178cba`は完全探索でraw候補が17問しか存在しなかった。分割探索上限へ到達した結果ではなく、その代表配置について対象範囲を探索し終えた結果である。

そのため、当初の「36 / 36 / 36」均等配分は不成立だった。希少クラス17問をすべて保持し、残りをraw容量の大きい2クラスへ`46 / 45`で配分した。

### 3-3. エリアサイズプロファイル

```text
4-4-5-6-6                   73問
4-5-5-5-6                   35問
```

クラス内では可能な範囲で均衡させたが、raw候補自体の分布が均等ではないため、全体は完全な50:50にはならない。

### 3-4. 難易度

```text
難易度1                      36問
難易度2                      36問
難易度3                      36問
```

難易度は候補全体を人間向け指標のscoreで並べ、3等分して付与した相対評価である。

指標:

- 制約伝播round数
- 伝播だけで確定した行数
- 未確定行数
- 残候補数
- 仮定分岐ノード数
- 最大仮定深さ

自動難易度は人間の体感を保証しない。実機プレイレビューで再分類が必要である。

### 3-5. 最近傍構造距離

```text
距離1                        59問
距離2                        33問
距離3                         9問
距離4                         4問
距離5                         1問
距離7                         1問
距離9                         1問
```

構造距離は、D4変換とエリア名正規化を考慮した25マスの最小Hamming距離である。

最短距離1の盤面が59問あるため、本成果物は完成バンクではない。類似盤面を人間レビューまたは追加選別で落とす必要がある。

## 4. 選出アルゴリズム

### 4-1. raw候補

各D4正解配置クラスから代表配置を1つ選ぶ。正解セルを各エリアの種にし、4〜6マスの連結領域で25マスをexact coverする。

候補は次を満たす場合だけ採用する。

- 一意解
- 元の正解配置と唯一解が一致
- Stage Schema v2の独立validatorに合格
- D4 canonical署名が未登録

### 4-2. クラス配分

1. 各クラスから最低17問を保持
2. 残り枠をraw残容量が大きいクラスへ1問ずつ配分
3. raw容量が同じ場合は対称クラスIDで決定

この手順は決定論的である。

### 4-3. クラス内選出

- サイズプロファイルごとのquotaを算出
- 最初の1問は、他候補との総距離が最大の盤面
- 2問目以降は、選出済み集合への最近傍距離が最大の盤面
- 同点は安定stage IDで決定

## 5. データ契約

固定成果物:

```text
generated/variable-stage-candidate-pool-v2.json
```

主要フィールド:

```js
{
  schemaVersion: 1,
  generatorVersion: "2.6.0-variable-pool.1",
  status: "candidate-pool-not-runtime",
  runtimeEnabled: false,
  rankingEligible: false,
  rawStageCount: 185,
  stageCount: 108,
  minimumPairDistance: 1,
  symmetryClassDistribution: { ... },
  profileDistribution: { ... },
  difficultyDistribution: { ... },
  nearestDistanceDistribution: { ... },
  classAudits: [ ... ],
  stages: [ ... ],
  metadata: { ... }
}
```

## 6. 検証

`npm test`で次を固定する。

- 小型fixtureの決定論的再生成
- 3対称クラスの利用
- 108問の実測値
- 108問全件のStage Schema v2検証
- ID重複なし
- D4 canonical重複なし
- 難易度分布`36 / 36 / 36`
- 対称クラス分布`46 / 45 / 17`
- サイズ分布`73 / 35`
- 最近傍距離分布
- review-only candidate bankとして有効

CIではさらに次を実行する。

```bash
npm run gen:v2:variable-pool
git diff --exit-code -- generated/variable-stage-candidate-pool-v2.json
```

## 7. 安全境界

本プールをゲームへ直接接続してはならない。

```text
ACTIVE_STAGE_BANK_ID = legacy-v1
candidate-v2-variable-4-6-pool.runtimeEnabled = false
candidate-v2-variable-4-6-pool.rankingEligible = false
candidate-v2-variable-4-6-pool.status = candidate-pool-ready-for-review
```

変更しないもの:

- 公式`T001 / T011 / T021`
- 本番ランキング
- Supabase
- 現行30問

## 8. 次の工程

### 8-1. 近似盤面選別

最短距離1の59問を重点確認する。自動除外だけで84問未満へ落とさないよう、距離閾値と最低問題数を同時に評価する。

### 8-2. 人間レビュー用表示

各候補について次を一覧化する。

- 盤面
- 正解配置クラス
- サイズプロファイル
- 自動難易度と内訳
- 最近傍stage ID
- 最近傍距離

### 8-3. 実機プレイ

- iPhone SE
- iPhone 17 Pro
- エリア境界の視認性
- 体感難易度
- 類似盤面の暗記感

### 8-4. 完成バンク

人間承認後に別成果物として作る。候補プールmanifestをそのままruntimeへ使わない。
