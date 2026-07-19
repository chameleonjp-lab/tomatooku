# トマトオク 生成器v2 Slice 2：連結エリア・一意解候補生成

作成日: 2026-07-20
対象リポジトリ: `chameleonjp-lab/tomatooku`
対象段階: 生成器v2 Slice 2

## 1. 目的

Slice 1で列挙した14種類の正解配置から、次の条件を満たす候補盤面を決定論的に生成できる基盤を追加する。

- 5×5
- A〜Eの5エリア
- 各エリア5マス
- 各エリアが上下左右の4近傍で連結
- 各行、各列、各エリアに🍅が1個
- 🍅同士が上下左右・斜めで隣接しない
- 全探索で解が1つだけ
- 回転・反転・エリア名の付け替えを同一盤面として扱う
- 内容ベースの安定IDを付与する
- 探索に必ず上限を設ける

このSliceでは、生成候補を現行`src/stages.js`へ接続しない。

## 2. 追加ファイル

```text
scripts/generator-v2/regions.js
scripts/generator-v2/regions.test.js
scripts/generate_stage_candidates_v2.js
generated/stage-candidates-v2.json
```

## 3. エリア生成

### 3.1 種セル

正解配置の5セルを、それぞれ別エリアの種にする。

```text
解セル1 → region 0
解セル2 → region 1
...
解セル5 → region 4
```

これにより、元の正解配置は常に「各エリア1個」の条件を満たす。

### 3.2 成長

各エリアは、既存セルに上下左右で接する未割当セルだけを追加する。

この方法により、生成途中から完成までエリア連結性を維持する。

### 3.3 バックトラック

単純な貪欲成長は、次の問題を起こす。

- 小さなエリアが閉じ込められる
- 残りセルへ到達できない
- 5マスへ到達できない

そのため、成長はバックトラック可能な探索として実装する。

### 3.4 制約優先

次の順で候補を優先する。

1. 成長余地が少ないエリア
2. 必要残数に対してfrontierが少ないエリア
3. 他の正解配置候補を多く排除するセル
4. seed付き乱数による同点順序

## 4. 生成上限

無限探索を禁止する。

既定値:

```text
1回の領域成長ノード上限: 100,000
1正解配置あたりの試行上限: 1,500
```

上限へ到達した場合は例外で停止せず、次を返す。

```json
{
  "failure": "attempt-limit",
  "attempts": 1500
}
```

`attempt-limit`は「生成不可能」の証明ではない。

意味は、指定されたgenerator version、seed、探索戦略、試行上限では候補を確認できなかった、である。

## 5. エリア検証

`validateRegionGrid()`は次を検査する。

- 5行
- 各行5文字
- ラベルがA〜E
- 各ラベル5マス
- 各エリアが4近傍連結

## 6. 全探索ソルバ

`solveRegionGrid()`は、行ごとに配置候補を全探索する。

検査条件:

- 列重複なし
- エリア重複なし
- 直前行との差が2以上

2解見つかった時点で探索を打ち切れる。

戻り値:

```text
solutionCount
unique
firstSolution
nodes
```

生成候補として採用する条件は次の両方である。

- `unique === true`
- `firstSolution`が種に使った正解配置と一致

## 7. 盤面正規化

### 7.1 エリア名の正規化

エリア名自体に意味はない。

盤面を左上から走査し、初出順にA、B、C、D、Eへ置き換える。

これにより、AとBを交換しただけの盤面は同じ署名になる。

### 7.2 D4対称正規化

次の8変換を適用する。

- 恒等
- 90度回転
- 180度回転
- 270度回転
- 左右反転
- 上下反転
- 主対角線反転
- 反対角線反転

各変換後にエリア名を再正規化し、辞書順最小の署名を`canonicalSignature`とする。

## 8. 安定ステージID

`stableStageId()`は`canonicalSignature`から生成する。

形式:

```text
STG-xxxxxxxx
```

同じ盤面について、次の変更ではIDが変わらない。

- エリア名の付け替え
- 回転
- 反転
- 生成順
- seed順序

## 9. 固定probe

既定seed:

```text
tomatooku-v2-regions-slice2
```

既定上限:

```text
1配置あたり1,500試行
```

14配置を全件probeした固定結果:

```text
正解配置数: 14
候補生成成功: 10
試行上限到達: 4
対称重複除外後の盤面: 5
確認できた解配置対称クラス: 2 / 3
```

上限到達した配置:

```text
SP-f5f166b0
SP-5453e090
SP-5d6caa30
SP-034477b0
```

これら4配置は同じ解配置対称クラス`SC-3a178cba`に属する。

現行30問バンクでも、この4配置は使用されていない。

ただし、この結果だけで生成不可能とは断定しない。

Slice 3では次のいずれかを行う。

- 探索戦略を追加して候補を探索する
- 正確な充足可能性探索を追加する
- 生成不能を証明できない場合は「未確認クラス」として分布要件から除外する

## 10. manifest

固定結果は次へ保存する。

```text
generated/stage-candidates-v2.json
```

含まれる内容:

- generator version
- seed
- 試行上限
- 14配置のprobe結果
- 成功・上限到達件数
- 対称クラスカバレッジ
- dedupe後の候補盤面
- 安定stage ID
- canonical signature
- solution
- solver nodes
- growth nodes

## 11. コマンド

```bash
npm run gen:v2
npm run gen:v2:patterns
npm run gen:v2:candidates
npm run test:generator-v2
npm run test:generator-v2:foundation
npm run test:generator-v2:regions
```

任意seed:

```bash
node scripts/generate_stage_candidates_v2.js \
  --seed example-seed \
  --max-attempts 1500 \
  --stdout
```

## 12. テスト

次を固定する。

- エリア成長成功
- 各エリア5マス
- 4近傍連結
- ラベル正規化
- D4変換後のcanonical署名不変
- D4変換後のstage ID不変
- 全探索による一意解
- 元の正解配置との一致
- 同一seedの完全再現
- 生成上限の構造化失敗
- 14配置の固定probe件数
- 上限到達4配置のfixture
- 対称重複除外
- manifest再生成一致
- CLI出力一致

## 13. 現行ゲームへの影響

変更しないもの:

- `src/stages.js`
- 現行30問
- 公式`T001 / T011 / T021`
- ランダム練習の選出元
- ゲームロジック
- 補正タイム
- ランキング
- Supabase

`generated/stage-candidates-v2.json`は開発用fixtureであり、ゲームから読み込まれない。

## 14. Slice 3への引き継ぎ

次工程:

1. 候補盤面を多数生成するbatch orchestrator
2. 近似盤面除外
3. 解配置分布制御
4. 人間向け難易度指標
5. 最低84問の候補バンク
6. 独立validator
7. 現行30問と新バンクの切替契約
8. 公式3問は自動変更しない
