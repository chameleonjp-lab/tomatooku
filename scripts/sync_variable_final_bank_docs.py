from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"{label} anchor not found")
    return text.replace(old, new, 1)


readme_path = Path("README.md")
readme = readme_path.read_text()
readme = replace_once(
    readme,
    """レビュー画面は公開ゲームの`index.html`からリンクせず、Supabase・ランキングへ送信しません。実レビューと完成バンク選別は未完了です。

現行30問、公式3問、ランダム練習には接続していません。

詳細:
""",
    """レビュー画面は公開ゲームの`index.html`からリンクせず、Supabase・ランキングへ送信しません。

### Slice 8：レビュー第1巡

108問を完全判断し、PR #18のマージを人間承認として採用84問・除外24問を固定しました。

```text
採用                         84問
除外                         24問
保留                          0問
未判断                        0問
対称クラス分布                34 / 33 / 17
難易度分布                    28 / 28 / 28
サイズ分布                    61 / 23
```

```text
review/decisions/variable-stage-review-round1.json
```

### Slice 9：可変エリア84問完成バンク

承認済みレビューの`keep`84問だけから、出典SHA-256を保持する完成バンクを決定論的に生成しました。

```text
generated/variable-stage-bank-v2.json
candidate-v2-variable-4-6-final.status = completed-bank-pending-runtime-approval
candidate-v2-variable-4-6-final.runtimeEnabled = false
candidate-v2-variable-4-6-final.rankingEligible = false
ACTIVE_STAGE_BANK_ID = legacy-v1
```

完成バンクは問題内容として固定済みですが、ゲーム実行経路への接続は未承認です。

現行30問、公式3問、ランダム練習には接続していません。

詳細:
""",
    "README slices 8-9",
)
readme = replace_once(
    readme,
    "- `docs/VARIABLE_STAGE_REVIEW_TOOL.md`\n",
    "- `docs/VARIABLE_STAGE_REVIEW_TOOL.md`\n- `docs/VARIABLE_STAGE_REVIEW_ROUND1.md`\n- `docs/VARIABLE_STAGE_FINAL_BANK.md`\n",
    "README detail docs",
)
readme = replace_once(
    readme,
    "npm run gen:v2:variable-pool             # 可変4〜6マス108問候補プールを再生成\n",
    "npm run gen:v2:variable-pool             # 可変4〜6マス108問候補プールを再生成\nnpm run gen:v2:variable-final-bank        # 承認済み84問完成バンクを再生成\n",
    "README generator command",
)
readme = replace_once(
    readme,
    "npm run test:variable-stage-review        # レビュー画面・108問距離再計算契約\n",
    "npm run test:variable-stage-review        # レビュー画面・108問距離再計算契約\nnpm run test:variable-stage-review-round1 # 採用84・除外24レビュー契約\nnpm run test:variable-stage-final-bank    # 84問完成バンク・出典SHA・分布契約\n",
    "README test commands",
)
readme = replace_once(
    readme,
    "  variable-stage-candidate-pool-v2.json\n",
    "  variable-stage-candidate-pool-v2.json\n  variable-stage-bank-v2.json\n",
    "README generated tree",
)
readme = replace_once(
    readme,
    "review/\n  variable-stage-review.html",
    "review/\n  decisions/\n    variable-stage-review-round1.json\n  variable-stage-review.html",
    "README review tree",
)
readme = replace_once(
    readme,
    "    variable-pool.test.js\n",
    "    variable-pool.test.js\n    variable-final-bank.js\n",
    "README generator tree",
)
readme = replace_once(
    readme,
    "  variable-stage-review.e2e.js\n  generate_stages.js",
    "  variable-stage-review.e2e.js\n  variable-stage-review-round1.test.js\n  variable-stage-final-bank.test.js\n  generate_stages.js",
    "README scripts tree tests",
)
readme = replace_once(
    readme,
    "  generate_variable_stage_pool_v2.js\n",
    "  generate_variable_stage_pool_v2.js\n  generate_variable_stage_bank_v2.js\n",
    "README scripts tree generator",
)
readme = replace_once(
    readme,
    "  VARIABLE_STAGE_REVIEW_TOOL.md\n```",
    "  VARIABLE_STAGE_REVIEW_TOOL.md\n  VARIABLE_STAGE_REVIEW_ROUND1.md\n  VARIABLE_STAGE_FINAL_BANK.md\n```",
    "README docs tree",
)
readme_path.write_text(readme)


plan_path = Path("docs/IMPLEMENTATION_PLAN_v2.md")
plan = plan_path.read_text()
plan = replace_once(
    plan,
    "現在状態: 公式ランキング公開済み／可変エリアStage Schema v2承認済み／108問候補プール生成済み／人間レビュー基盤実装済み／レビュー実施・完成バンク選別待ち",
    "現在状態: 公式ランキング公開済み／可変エリアStage Schema v2承認済み／レビュー第1巡承認済み／84問完成バンク固定済み／ランダム練習接続承認待ち",
    "plan current state",
)
plan = replace_once(
    plan,
    """レビュー基盤の実装完了は、108問の採否レビュー完了を意味しない。完成バンク選別はレビューJSONを取得した後の別work packageとする。

## 5. 現在のバンク契約
""",
    """レビュー基盤の実装完了は、108問の採否レビュー完了を意味しない。

### 4-8. Slice 8：レビュー第1巡

状態: **completed / HUMAN APPROVED**

実測結果:

```text
採用                         84
除外                         24
保留                          0
未判断                        0
対称クラス分布               34 / 33 / 17
難易度分布                   28 / 28 / 28
サイズ分布                   61 / 23
```

固定成果物:

```text
review/decisions/variable-stage-review-round1.json
docs/VARIABLE_STAGE_REVIEW_ROUND1.md
scripts/variable-stage-review-round1.test.js
```

### 4-9. Slice 9：84問完成バンク

状態: **completed / RUNTIME APPROVAL PENDING**

実装:

- レビュー`keep`84問だけを抽出
- 候補プールとレビューJSONのSHA-256を記録
- Stage Schema v2独立validator全件合格
- 分布fixture固定
- 距離1例外9組を固定
- 決定論的再生成
- runtime・ranking無効

固定成果物:

```text
generated/variable-stage-bank-v2.json
scripts/generator-v2/variable-final-bank.js
scripts/generate_variable_stage_bank_v2.js
scripts/variable-stage-final-bank.test.js
docs/VARIABLE_STAGE_FINAL_BANK.md
```

## 5. 現在のバンク契約
""",
    "plan slices 8-9",
)
plan = replace_once(
    plan,
    "candidate-v2-variable-4-6-pool.rankingEligible = false\n```",
    "candidate-v2-variable-4-6-pool.rankingEligible = false\n\ncandidate-v2-variable-4-6-final.status = completed-bank-pending-runtime-approval\ncandidate-v2-variable-4-6-final.runtimeEnabled = false\ncandidate-v2-variable-4-6-final.rankingEligible = false\n```",
    "plan bank contract",
)
plan = replace_once(
    plan,
    "108問の人間レビュー結果を確定し、完成バンクを別PRで固定するまでゲーム接続しない。",
    "84問完成バンクは固定済み。明示承認を得てランダム練習接続PRを作成するまでゲーム接続しない。",
    "plan gate",
)
plan = replace_once(
    plan,
    "### 決定3：108問候補プールの完成バンク選別基準\n\n108問候補プールはレビュー用であり、完成バンクではない。次の選別が必要。\n\n- 人間向け難易度\n- 近似盤面距離\n- 正解配置分布\n- サイズプロファイル分布\n- iPhoneでの色境界識別性",
    "### 決定3：108問候補プールの完成バンク選別（resolved）\n\nPR #18で採用84問・除外24問を承認済み。\n\n### 決定4：ランダム練習への接続\n\n推奨:\n\n- 公式3問は現行のまま\n- ランダム練習だけ84問完成バンクへ切替\n- 完成バンクはランキング対象外\n- 読込失敗時は旧`legacy-v1`へ安全に戻す\n- 即時ロールバック可能なfeature gateを使用",
    "plan decision 3-4",
)
plan = replace_once(
    plan,
    "### 7-3. 難易度・近似選別（自動指標completed / 人間判断pending）",
    "### 7-3. 難易度・近似選別（completed）",
    "plan 7-3 status",
)
plan = replace_once(
    plan,
    "### 7-4. 人間レビュー（基盤completed / 実施pending）",
    "### 7-4. 人間レビュー（completed）",
    "plan 7-4 status",
)
plan = replace_once(
    plan,
    "### 7-5. 完成バンク固定（pending）",
    "### 7-5. 完成バンク固定（completed）",
    "plan 7-5 status",
)
plan = replace_once(
    plan,
    "- runtime・rankingは引き続き無効\n\n### 7-6. 練習モード先行切替",
    "- runtime・rankingは引き続き無効\n- `generated/variable-stage-bank-v2.json`へ固定済み\n\n### 7-6. 練習モード先行切替（pending）",
    "plan 7-6 status",
)
plan = replace_once(
    plan,
    "現時点では、ゲーム公開部分、可変4〜6マス契約、108問候補プール、人間レビュー基盤まで完成しています。残工程は108問の実レビュー、完成バンク固定、人間承認後のランダム練習先行切替です。",
    "現時点では、ゲーム公開部分、可変4〜6マス契約、108問候補プール、レビュー第1巡、84問完成バンク固定まで完了しています。残工程は明示承認後のランダム練習先行切替と実機確認です。",
    "plan final state",
)
plan_path.write_text(plan)
