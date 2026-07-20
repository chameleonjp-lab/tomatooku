# 可変盤面レビュー 第1巡（提案）

- 対象: `generated/variable-stage-candidate-pool-v2.json`
- 対象件数: 108問
- レビュー種別: AI補助による構造最適化＋盤面ペア視覚確認
- 作成日時: `2026-07-20T07:10:19Z`
- 状態: proposed / human approval pending / runtime disabled

## 1. 結果

```text
採用                         84
除外                         24
保留                          0
未判断                        0
```

### 採用84問の分布

```text
対称クラス
SC-95390462                  34
SC-be359992                  33
SC-3a178cba                  17

難易度
1                            28
2                            28
3                            28

エリアサイズ構成
4-4-5-6-6                    61
4-5-5-5-6                    23
```

## 2. 選別方針

- 84問を厳密に維持する
- 難易度1〜3を`28 / 28 / 28`で維持する
- 対称クラスを`34 / 33 / 17`で維持する
- 希少クラス`SC-3a178cba`の17問をすべて残す
- 共通2クラスでは構造距離1の同時採用を解消する
- エリアサイズ構成は`61 / 23`とし、両形式を維持する
- 24問の除外は最近傍盤面との視覚比較を行い、代表候補を1問残す

## 3. 距離1の扱い

共通2クラスでは、採用後に構造距離1の組は残りません。

希少クラス17問は総数自体が少ないため、次の9組だけを例外として残します。

| Stage A | Stage B | 距離 | クラス |
|---|---|---:|---|
| `STG-0385e52f` | `STG-8e3e7a46` | 1 | `SC-3a178cba` |
| `STG-07455e25` | `STG-c551c232` | 1 | `SC-3a178cba` |
| `STG-246317db` | `STG-8e3e7a46` | 1 | `SC-3a178cba` |
| `STG-75e7cc16` | `STG-bda38a0d` | 1 | `SC-3a178cba` |
| `STG-75e7cc16` | `STG-ee9efd5b` | 1 | `SC-3a178cba` |
| `STG-8c4df48e` | `STG-ba446d6d` | 1 | `SC-3a178cba` |
| `STG-8e3e7a46` | `STG-e48d77b6` | 1 | `SC-3a178cba` |
| `STG-a6649fc6` | `STG-edb742a5` | 1 | `SC-3a178cba` |
| `STG-bb3d9d29` | `STG-ee9efd5b` | 1 | `SC-3a178cba` |

この例外は、希少クラスを削って見かけ上の距離だけを改善しないための明示的判断です。

## 4. 除外24問

| 除外Stage | 難易度 | サイズ | クラス | 距離 | 残す代表 | 比較変換 |
|---|---:|---|---|---:|---|---|
| `STG-05453ba1` | 1 | `4-5-5-5-6` | `SC-95390462` | 1 | `STG-1e3f1e3c` | `identity` |
| `STG-0868fad9` | 1 | `4-5-5-5-6` | `SC-95390462` | 1 | `STG-6168b936` | `identity` |
| `STG-19aa2ed1` | 1 | `4-4-5-6-6` | `SC-95390462` | 1 | `STG-82b47f4f` | `identity` |
| `STG-2dfb34ab` | 2 | `4-4-5-6-6` | `SC-95390462` | 1 | `STG-a53237c1` | `identity` |
| `STG-2f78a997` | 2 | `4-5-5-5-6` | `SC-95390462` | 1 | `STG-13fc715e` | `identity` |
| `STG-36cdac4d` | 3 | `4-4-5-6-6` | `SC-be359992` | 1 | `STG-8a377eb4` | `mirrorUpDown` |
| `STG-4dc01b9a` | 1 | `4-4-5-6-6` | `SC-95390462` | 1 | `STG-a27903af` | `identity` |
| `STG-52abd430` | 3 | `4-4-5-6-6` | `SC-be359992` | 1 | `STG-f8f2d8e6` | `rotate270` |
| `STG-551b81c7` | 2 | `4-4-5-6-6` | `SC-be359992` | 2 | `STG-2580944b` | `identity` |
| `STG-5ee3f6de` | 1 | `4-4-5-6-6` | `SC-be359992` | 1 | `STG-2857ff8d` | `rotate180` |
| `STG-73718467` | 2 | `4-4-5-6-6` | `SC-95390462` | 1 | `STG-01bd306d` | `identity` |
| `STG-77567d8e` | 2 | `4-5-5-5-6` | `SC-be359992` | 1 | `STG-423cb2b0` | `identity` |
| `STG-817148dd` | 3 | `4-4-5-6-6` | `SC-be359992` | 1 | `STG-d50fa544` | `identity` |
| `STG-98aee138` | 2 | `4-5-5-5-6` | `SC-95390462` | 1 | `STG-01bd306d` | `identity` |
| `STG-a3883006` | 3 | `4-4-5-6-6` | `SC-be359992` | 1 | `STG-2580944b` | `identity` |
| `STG-aa32f47e` | 2 | `4-5-5-5-6` | `SC-be359992` | 1 | `STG-d6eb37e7` | `identity` |
| `STG-afea47be` | 3 | `4-5-5-5-6` | `SC-be359992` | 1 | `STG-1dc27319` | `identity` |
| `STG-d0df3056` | 1 | `4-4-5-6-6` | `SC-be359992` | 1 | `STG-8a377eb4` | `mirrorAntiDiagonal` |
| `STG-d2426d16` | 2 | `4-5-5-5-6` | `SC-95390462` | 1 | `STG-1bf62619` | `identity` |
| `STG-e391ea85` | 3 | `4-5-5-5-6` | `SC-be359992` | 1 | `STG-d50fa544` | `identity` |
| `STG-eb49788f` | 1 | `4-5-5-5-6` | `SC-95390462` | 1 | `STG-20357d3a` | `identity` |
| `STG-ec909e3f` | 3 | `4-5-5-5-6` | `SC-95390462` | 1 | `STG-0a930c10` | `identity` |
| `STG-fb23ec63` | 1 | `4-5-5-5-6` | `SC-95390462` | 1 | `STG-697800f8` | `identity` |
| `STG-fce49b7e` | 3 | `4-4-5-6-6` | `SC-be359992` | 2 | `STG-283aea60` | `identity` |

## 5. レビュー方法

1. 108問のD4変換・エリア名正規化後の距離グラフを構築
2. 採用84問、難易度均等、クラス分布、サイズ分布を制約として選択を最適化
3. 24問の除外候補を、残す代表盤面と横並びで視覚確認
4. 1セル差または2セル差で解法・境界構造が近いものを除外
5. 希少クラスは全17問を維持し、距離1例外を明示

本レビューはAI補助による第1巡提案です。PRのマージを人間承認とし、マージ後に完成バンク固定へ進みます。

## 6. 安全境界

```text
ACTIVE_STAGE_BANK_ID = legacy-v1
runtimeEnabled = false
rankingEligible = false
```

このレビュー結果だけではゲームへ接続しません。

- `src/stages.js`を変更しない
- 公式`T001 / T011 / T021`を変更しない
- ランダム練習の選出元を変更しない
- ランキングを変更しない
- Supabaseを変更しない

## 7. 固定成果物

```text
review/decisions/variable-stage-review-round1.json
docs/VARIABLE_STAGE_REVIEW_ROUND1.md
```

## 8. 次工程

人間承認後の別PRで、`keep`の84問だけから完成バンクmanifestを作成します。

- Stage Schema v2独立validatorへ全件投入
- 採用84問のID・canonical重複検査
- 分布fixture固定
- runtime・ranking無効のまま完成バンクを固定
- その後、別の明示承認でランダム練習だけへ接続
