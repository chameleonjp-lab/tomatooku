# 可変エリア84問 完成バンク

- 対象リポジトリ: `chameleonjp-lab/tomatooku`
- 完成バンクID: `candidate-v2-variable-4-6-final`
- manifest: `generated/variable-stage-bank-v2.json`
- Stage Schema: v2
- Bank Schema: v1
- 状態: completed / runtime approval pending
- 更新日: 2026-07-20

## 1. 目的

可変エリア4〜6マスの候補108問と、承認済みレビュー第1巡の判断から、ランダム練習へ接続可能な84問の完成バンクを決定論的に固定する。

本成果物は問題内容として完成しているが、ゲーム実行経路への接続は未承認である。

```text
ACTIVE_STAGE_BANK_ID = legacy-v1
final.runtimeEnabled = false
final.rankingEligible = false
```

## 2. 生成元

### 候補プール

```text
generated/variable-stage-candidate-pool-v2.json
```

- raw候補: 185問
- レビュー対象: 108問
- generator version: `2.6.0-variable-pool.1`

### 承認済みレビュー

```text
review/decisions/variable-stage-review-round1.json
```

- keep: 84問
- reject: 24問
- hold: 0問
- 未判断: 0問

完成バンク生成器は`keep`だけを採用し、`reject`を含めない。

manifestには候補プールとレビューJSONのSHA-256を記録する。生成元が1 byteでも変化した場合、再生成manifestにも差分が発生する。

## 3. 完成バンク契約

```json
{
  "schemaVersion": 1,
  "id": "candidate-v2-variable-4-6-final",
  "status": "completed-bank-pending-runtime-approval",
  "runtimeEnabled": false,
  "rankingEligible": false,
  "stageSchemaVersion": 2,
  "generatorVersion": "2.7.0-variable-final-bank.1",
  "stageCount": 84,
  "rejectedStageCount": 24
}
```

必須条件:

- Stage Schema v2へ全件合格
- 84問ちょうど
- レビュー`keep`のID集合と完全一致
- ID重複なし
- D4 canonical重複なし
- 各盤面が一意解
- runtime無効
- ranking無効
- 出典SHA-256を保持
- 決定論的再生成

## 4. 分布

### 対称クラス

```text
SC-95390462    34問
SC-be359992    33問
SC-3a178cba    17問
```

希少クラス`SC-3a178cba`は候補17問をすべて維持する。

### 難易度

```text
難易度1    28問
難易度2    28問
難易度3    28問
```

自動難易度は制約伝播、残候補、分岐数、最大仮定深さに基づく相対評価である。

### エリアサイズ構成

```text
4-4-5-6-6    61問
4-5-5-5-6    23問
```

## 5. 構造距離

完成バンクの最小構造距離は1である。

距離1関係は、希少対称クラスを全件維持するために明示承認した9組だけである。

```text
STG-0385e52f / STG-8e3e7a46
STG-07455e25 / STG-c551c232
STG-246317db / STG-8e3e7a46
STG-75e7cc16 / STG-bda38a0d
STG-75e7cc16 / STG-ee9efd5b
STG-8c4df48e / STG-ba446d6d
STG-8e3e7a46 / STG-e48d77b6
STG-a6649fc6 / STG-edb742a5
STG-bb3d9d29 / STG-ee9efd5b
```

共通2クラスには距離1の同時採用を残さない。

## 6. 生成コマンド

```bash
npm run gen:v2:variable-final-bank
```

実装:

```text
scripts/generator-v2/variable-final-bank.js
scripts/generate_variable_stage_bank_v2.js
```

生成先:

```text
generated/variable-stage-bank-v2.json
```

## 7. 検証

```bash
npm run test:variable-stage-final-bank
```

検証内容:

- レビューkeep 84問とのID完全一致
- 完成バンク専用status
- runtime・ranking無効
- 候補プールSHA-256
- レビューJSON SHA-256
- Stage Schema v2独立validator
- 分布fixture
- 距離1例外9組
- metadata完全性
- bank catalog登録
- 再生成結果のJSON完全一致

CIでは次も行う。

```bash
npm run gen:v2:variable-final-bank
git diff --exit-code -- generated/variable-stage-bank-v2.json
```

## 8. Bank Catalog

```text
candidate-v2-variable-4-6-final.status
= completed-bank-pending-runtime-approval

candidate-v2-variable-4-6-final.runtimeEnabled
= false

candidate-v2-variable-4-6-final.rankingEligible
= false
```

`ACTIVE_STAGE_BANK_ID`は`legacy-v1`のままとする。

## 9. 変更禁止範囲

完成バンク固定PRでは次を変更しない。

- `index.html`
- `src/stages.js`
- 現行30問
- 公式`T001 / T011 / T021`
- 現行ランダム練習の選出元
- ゲームロジック
- 補正タイム
- ランキング
- Supabase

## 10. 次の人間判断ゲート

次工程はランダム練習への先行接続である。

接続PRを開始するには、完成バンクの内容と状態について明示承認を必要とする。

接続時の必須条件:

- 公式3問は現行のまま
- 公式ランキング契約は現行のまま
- ランダム練習だけを84問完成バンクへ切替
- 旧`legacy-v1`へ即時ロールバック可能
- 完成バンク読込失敗時は開始を拒否または旧バンクへ安全に戻す
- runtime有効化とranking対象化を混同しない
- 完成バンクはランキング対象外

本PRでは接続を行わない。
