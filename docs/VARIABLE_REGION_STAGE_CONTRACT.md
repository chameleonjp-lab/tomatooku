# 可変エリア Stage Schema v2 契約

## 1. 位置付け

本契約は、エリアサイズ4〜6マスの候補ステージを生成器から独立して検証するためのデータ契約である。

成立性監査により84問の存在は確認済みだが、本契約の追加だけではゲームへ接続しない。

```text
ACTIVE_STAGE_BANK_ID = legacy-v1
candidate-v2-variable-4-6.runtimeEnabled = false
candidate-v2-variable-4-6.rankingEligible = false
candidate-v2-variable-4-6.status = contract-proposed-pending-approval
```

## 2. Stage Schema

```js
{
  schemaVersion: 2,
  id: "STG-xxxxxxxx",
  regions: [
    "AAAAA",
    "ABBBB",
    "CCCCB",
    "CDDDE",
    "DDEEE"
  ],
  solution: [
    [0, 1],
    [1, 3],
    [2, 0],
    [3, 2],
    [4, 4]
  ],
  difficulty: 1,
  generatorVersion: "optional-non-empty-version",
  canonicalSignature: "AAAAA|ABBBB|CCCCB|CDDDE|DDEEE"
}
```

### 必須フィールド

| フィールド | 契約 |
|---|---|
| `schemaVersion` | 整数`2` |
| `id` | `STG-`＋小文字16進8桁 |
| `regions` | 5文字の文字列×5行 |
| `solution` | 行順の`[row, col]`×5 |

### 任意フィールド

| フィールド | 契約 |
|---|---|
| `difficulty` | `1 / 2 / 3` |
| `generatorVersion` | 空ではない文字列 |
| `canonicalSignature` | D4・エリア名正規化後の署名 |

未知の追加フィールドは、validatorの現在版では拒否しない。将来の分析メタデータ追加を妨げないためである。

## 3. 盤面契約

```text
盤面                         5×5
エリア数                     5
利用ラベル                   A〜E
各エリアサイズ               4〜6マス
合計                         25マス
各エリア                     上下左右の4近傍で連結
各行                         🍅1個
各列                         🍅1個
各エリア                     🍅1個
🍅同士                       上下左右・斜めで隣接禁止
解                           1個だけ
```

各ラベルA〜Eは必ず1回以上出現し、サイズ範囲を満たす必要がある。

## 4. solution契約

`solution`は行番号順に並べる。

```text
solution[0][0] = 0
solution[1][0] = 1
...
solution[4][0] = 4
```

列番号は0〜4を重複なしで1回ずつ使用する。

さらに次を満たす。

- 各solutionセルのエリアラベルがすべて異なる
- 連続する行の列差が2以上
- validator内の独立ソルバが返す唯一解と一致

## 5. canonical署名

次の8変換を同一盤面として扱う。

- 恒等
- 90度回転
- 180度回転
- 270度回転
- 左右反転
- 上下反転
- 主対角線反転
- 反対角線反転

各変換後、盤面を左上から行優先で読み、初出したエリア名からA〜Eへ付け直す。

8個の署名の辞書順最小値を`canonicalSignature`とする。

## 6. 安定ID

```text
STG-xxxxxxxx
```

IDは次の文字列のFNV-1a 32bitハッシュから生成する。

```text
tomatooku:v2:stage:<canonicalSignature>
```

`id`は正規表現に一致するだけでなく、盤面内容から再計算した値と一致しなければならない。

## 7. 独立validator

実装:

```text
src/variable-stage-contract.js
```

公開API:

```js
validateVariableStage(stage)
assertVariableStage(stage)
canonicalizeVariableStageRegions(regions)
expectedVariableStageId(regions)
validateVariableStageBank(bank)
assertVariableStageBank(bank)
```

このモジュールは`src/`内だけで完結し、`scripts/generator-v2/`をimportしない。

生成器とvalidatorが同一ロジックを共有して誤りを相互に見逃すことを防ぐためである。

## 8. Candidate Bank Schema

```js
{
  schemaVersion: 1,
  id: "candidate-v2-variable-4-6",
  status: "contract-proposed-pending-approval",
  runtimeEnabled: false,
  rankingEligible: false,
  stages: [/* Stage Schema v2 を84件以上 */]
}
```

候補bankは次を満たす。

- 84問以上
- 全ステージがStage Schema v2に合格
- `id`重複なし
- D4 canonical重複なし
- `runtimeEnabled=false`
- `rankingEligible=false`
- statusは`contract-proposed-pending-approval`

## 9. テスト対象

```text
scripts/variable-stage-contract.test.js
```

次を検査する。

- 成立性manifestの84問をschema v2へ変換して全件合格
- 一意解とsolution一致
- 安定ID一致
- canonical署名一致
- エリアサイズ範囲
- 4近傍連結
- 列重複拒否
- エリア重複拒否
- 隣接solution拒否
- 不正schema・ID・difficulty拒否
- 84問未満bank拒否
- runtime・ranking有効化拒否
- validatorが生成器をimportしていないこと

## 10. 現行ゲームへの影響

本契約PRでは変更しない。

- `src/stages.js`
- 現行30問
- 公式`T001 / T011 / T021`
- ランダム練習の選出元
- ゲームロジック
- 補正タイム
- ランキング
- Supabase

## 11. 次工程

本契約が人間承認された後、別PRで次を実施する。

1. 84問より多い候補プールを生成
2. schema v2へ変換
3. 独立validatorで全件検証
4. 人間向け難易度を計測
5. 近似盤面距離とサイズ分布で84問を選別
6. iPhone実機レビュー
7. ランダム練習だけへ先行接続
8. 公式3問とランキングは維持
