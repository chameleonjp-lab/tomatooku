from pathlib import Path


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f"{label} anchor not found")
    return text.replace(old, new, 1)


readme_path = Path("README.md")
readme = readme_path.read_text()
anchor = """成立確認と契約定義は仕様採用を意味しません。現行30問、公式3問、ランダム練習には接続していません。

詳細:"""
section = """### Slice 6：可変エリア候補プール

3つのD4正解配置クラスを横断してraw候補185問を生成し、構造距離・サイズプロファイル・自動難易度を使って108問を選出しました。

```text
raw候補                       185問
選出候補                      108問
対称クラス分布                46 / 45 / 17
サイズ分布                    73 / 35
難易度分布                    36 / 36 / 36
最短構造距離                  1
```

希少クラス`SC-3a178cba`はraw候補が17問しか存在しないため、当初の均等36問配分は行っていません。17問をすべて保持し、残りを他2クラスへ配分しています。

最短距離1の候補が59問あるため、これは完成バンクではなく人間レビュー用の候補プールです。

```text
generated/variable-stage-candidate-pool-v2.json
candidate-v2-variable-4-6-pool.status = candidate-pool-ready-for-review
candidate-v2-variable-4-6-pool.runtimeEnabled = false
candidate-v2-variable-4-6-pool.rankingEligible = false
```

現行30問、公式3問、ランダム練習には接続していません。

詳細:"""
readme = replace_once(readme, anchor, section, "README Slice 6")
readme = replace_once(
    readme,
    "- `docs/VARIABLE_REGION_STAGE_CONTRACT.md`",
    "- `docs/VARIABLE_REGION_STAGE_CONTRACT.md`\n- `docs/VARIABLE_STAGE_CANDIDATE_POOL.md`",
    "README docs list",
)
readme = replace_once(
    readme,
    "npm run gen:v2:candidates                # v2固定5マス候補manifestを再生成",
    "npm run gen:v2:candidates                # v2固定5マス候補manifestを再生成\nnpm run gen:v2:variable-pool             # 可変4〜6マス108問候補プールを再生成",
    "README generation command",
)
readme = replace_once(
    readme,
    "npm run test:generator-v2:variable-regions # 可変4〜6マス成立性契約",
    "npm run test:generator-v2:variable-regions # 可変4〜6マス成立性契約\nnpm run test:generator-v2:variable-pool  # 108問候補プール・分布・距離契約",
    "README test command",
)
readme = replace_once(
    readme,
    "  stage-bank-variable-feasibility-v2.json\nindex.html",
    "  stage-bank-variable-feasibility-v2.json\n  variable-stage-candidate-pool-v2.json\nindex.html",
    "README generated tree",
)
readme = replace_once(
    readme,
    "    variable-feasibility.test.js\n  accessibility.test.js",
    "    variable-feasibility.test.js\n    variable-pool.js\n    variable-pool.test.js\n  accessibility.test.js",
    "README generator tree",
)
readme = replace_once(
    readme,
    "  generate_stage_candidates_v2.js\n  game.test.js",
    "  generate_stage_candidates_v2.js\n  generate_variable_stage_pool_v2.js\n  game.test.js",
    "README script tree",
)
readme = replace_once(
    readme,
    "  VARIABLE_REGION_STAGE_CONTRACT.md\n```",
    "  VARIABLE_REGION_STAGE_CONTRACT.md\n  VARIABLE_STAGE_CANDIDATE_POOL.md\n```",
    "README doc tree",
)
readme_path.write_text(readme)

plan_path = Path("docs/IMPLEMENTATION_PLAN_v2.md")
plan = plan_path.read_text()
plan = replace_once(
    plan,
    "現在状態: 公式ランキング公開済み／可変エリア4〜6マスで84問成立確認済み／stage schema v2提案済み／契約承認待ち",
    "現在状態: 公式ランキング公開済み／可変エリアStage Schema v2承認済み／レビュー用108問候補プール生成済み／完成バンク選別待ち",
    "plan current state",
)
plan = replace_once(
    plan,
    "状態: **completed / CONTRACT PROPOSED / APPROVAL PENDING**",
    "状態: **completed / CONTRACT APPROVED**",
    "plan Slice 5 status",
)
plan_anchor = """84問成立性manifestの全ステージは独立validatorへ合格する。生成器コードはvalidatorからimportしない。

## 5. 現在のバンク契約"""
plan_section = """84問成立性manifestの全ステージは独立validatorへ合格する。生成器コードはvalidatorからimportしない。

### 4-6. Slice 6：可変エリア候補プール

状態: **completed / CANDIDATE POOL READY FOR REVIEW**

実装:

- 3つのD4正解配置クラスを対象化
- クラスごとのraw候補生成
- 独立Stage Schema v2 validator
- エリアサイズプロファイルquota
- farthest-first構造距離選出
- 伝播・分岐による自動難易度
- 難易度1〜3の均等割当
- 決定論的再生成

実測結果:

```text
raw候補                      185
選出候補                     108
対称クラス分布               46 / 45 / 17
サイズ分布                   73 / 35
難易度分布                   36 / 36 / 36
最短構造距離                 1
```

希少クラス`SC-3a178cba`はraw候補17問をすべて保持した。最短距離1が59問あるため、候補プールは完成バンクとして利用しない。

固定成果物:

```text
generated/variable-stage-candidate-pool-v2.json
scripts/generator-v2/variable-pool.js
scripts/generator-v2/variable-pool.test.js
docs/VARIABLE_STAGE_CANDIDATE_POOL.md
```

## 5. 現在のバンク契約"""
plan = replace_once(plan, plan_anchor, plan_section, "plan Slice 6")
plan = replace_once(
    plan,
    "candidate-v2-variable-4-6.rankingEligible = false\n```",
    "candidate-v2-variable-4-6.rankingEligible = false\n\ncandidate-v2-variable-4-6-pool.status = candidate-pool-ready-for-review\ncandidate-v2-variable-4-6-pool.runtimeEnabled = false\ncandidate-v2-variable-4-6-pool.rankingEligible = false\n```",
    "plan bank catalog",
)
plan = replace_once(
    plan,
    "次を正式決定するまで可変サイズ候補プールの生成・選別・ゲーム接続を開始しない。",
    "次を正式決定するまで108問候補プールから完成バンクを選別・ゲーム接続しない。",
    "plan decision gate",
)
plan = replace_once(
    plan,
    "### 決定1：可変サイズ契約の採用",
    "### 決定1：可変サイズ契約の採用（resolved）",
    "plan decision 1",
)
plan = replace_once(
    plan,
    "### 決定3：84問の選別基準",
    "### 決定3：108問候補プールの完成バンク選別基準",
    "plan decision 3",
)
plan = replace_once(
    plan,
    "監査manifestの84問は存在証拠であり、完成バンクではない。次の選別が必要。",
    "108問候補プールはレビュー用であり、完成バンクではない。次の選別が必要。",
    "plan decision 3 body",
)
old_72 = """### 7-2. 候補プール生成

- 84問より多い候補を生成
- 14正解配置を可能な範囲で利用
- seed再現性
- 生成上限
- 独立validator"""
new_72 = """### 7-2. 候補プール生成（completed）

- 108問を選出
- 3対称クラスを`46 / 45 / 17`で利用
- 決定論的再現
- raw容量と探索結果を記録
- 独立validator全件合格
- runtime・ranking無効"""
plan = replace_once(plan, old_72, new_72, "plan 7-2")
plan_path.write_text(plan)
