from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"{label} anchor not found")
    return text.replace(old, new, 1)


readme_path = Path("README.md")
readme = readme_path.read_text()

slice_anchor = """現行30問、公式3問、ランダム練習には接続していません。

詳細:
"""
slice_section = """### Slice 7：人間レビュー基盤

108問候補プールを1組ずつ最近傍と比較し、採用・除外・保留を記録できる開発専用ページを追加しました。

```text
review/variable-stage-review.html
```

主な機能:

- D4整列後の最近傍盤面比較
- 差分セル強調
- 正解表示切替
- 難易度・対称クラス・サイズ・分岐指標
- 判断・距離・難易度・クラス・サイズ・IDフィルター
- 採用・除外・保留・理由・メモ
- `localStorage["tomatooku.variableStageReview.v1"]`へ中断状態を保存
- レビューJSONの書き出し・読み込み
- iPhone SE相当320px対応

```text
http://localhost:8080/review/variable-stage-review.html
```

レビュー画面は公開ゲームの`index.html`からリンクせず、Supabase・ランキングへ送信しません。実レビューと完成バンク選別は未完了です。

現行30問、公式3問、ランダム練習には接続していません。

詳細:
"""
readme = replace_once(readme, slice_anchor, slice_section, "README Slice 7")
readme = replace_once(
    readme,
    "- `docs/VARIABLE_STAGE_CANDIDATE_POOL.md`\n",
    "- `docs/VARIABLE_STAGE_CANDIDATE_POOL.md`\n- `docs/VARIABLE_STAGE_REVIEW_TOOL.md`\n",
    "README details",
)
readme = replace_once(
    readme,
    "npm run test:variable-stage-contract      # 独立stage schema v2・bank契約\nnpm run e2e",
    "npm run test:variable-stage-contract      # 独立stage schema v2・bank契約\nnpm run test:variable-stage-review        # レビュー画面・108問距離再計算契約\nnpm run e2e                              # 公開ゲームPlaywrightブラウザテスト\nnpm run e2e:review                       # レビュー画面iPhone SE相当E2E\n# npm run e2e",
    "README commands placeholder",
)
# The previous replacement leaves a commented duplicate marker. Remove it deterministically.
readme = readme.replace("\n# npm run e2e                              # Playwrightブラウザテスト", "", 1)
readme = replace_once(
    readme,
    "variable-stage-candidate-pool-v2.json\nindex.html",
    "variable-stage-candidate-pool-v2.json\nreview/\n  variable-stage-review.html\n  variable-stage-review.css\n  variable-stage-review.js\nindex.html",
    "README review tree",
)
readme = replace_once(
    readme,
    "  variable-stage-contract.test.js\n  generate_stages.js",
    "  variable-stage-contract.test.js\n  variable-stage-review.test.js\n  variable-stage-review.e2e.js\n  generate_stages.js",
    "README scripts tree",
)
readme = replace_once(
    readme,
    "  VARIABLE_STAGE_CANDIDATE_POOL.md\n```",
    "  VARIABLE_STAGE_CANDIDATE_POOL.md\n  VARIABLE_STAGE_REVIEW_TOOL.md\n```",
    "README docs tree",
)
readme_path.write_text(readme)


plan_path = Path("docs/IMPLEMENTATION_PLAN_v2.md")
plan = plan_path.read_text()
plan = replace_once(
    plan,
    "現在状態: 公式ランキング公開済み／可変エリアStage Schema v2承認済み／レビュー用108問候補プール生成済み／完成バンク選別待ち",
    "現在状態: 公式ランキング公開済み／可変エリアStage Schema v2承認済み／108問候補プール生成済み／人間レビュー基盤実装済み／レビュー実施・完成バンク選別待ち",
    "plan state",
)
plan_anchor = """generated/variable-stage-candidate-pool-v2.json
scripts/generator-v2/variable-pool.js
scripts/generator-v2/variable-pool.test.js
docs/VARIABLE_STAGE_CANDIDATE_POOL.md
```

## 5. 現在のバンク契約
"""
plan_insert = """generated/variable-stage-candidate-pool-v2.json
scripts/generator-v2/variable-pool.js
scripts/generator-v2/variable-pool.test.js
docs/VARIABLE_STAGE_CANDIDATE_POOL.md
```

### 4-7. Slice 7：人間レビュー基盤

状態: **completed / REVIEW EXECUTION PENDING**

実装:

- 候補と最近傍のD4整列比較
- 差分セル強調
- 正解表示切替
- 108問最近傍距離の独立再計算
- 判断・距離・難易度・クラス・サイズ・IDフィルター
- 採用・除外・保留・理由・メモ
- localStorageによる中断・再開
- JSON書き出し・読み込み
- URLによるStage ID直接指定
- iPhone SE相当320px対応
- Supabase・ランキング通信なし

固定成果物:

```text
review/variable-stage-review.html
review/variable-stage-review.css
review/variable-stage-review.js
scripts/variable-stage-review.test.js
scripts/variable-stage-review.e2e.js
docs/VARIABLE_STAGE_REVIEW_TOOL.md
```

レビュー基盤の実装完了は、108問の採否レビュー完了を意味しない。完成バンク選別はレビューJSONを取得した後の別work packageとする。

## 5. 現在のバンク契約
"""
plan = replace_once(plan, plan_anchor, plan_insert, "plan Slice 7")
plan = replace_once(
    plan,
    "次を正式決定するまで108問候補プールから完成バンクを選別・ゲーム接続しない。",
    "108問の人間レビュー結果を確定し、完成バンクを別PRで固定するまでゲーム接続しない。",
    "plan gate intro",
)
plan = replace_once(
    plan,
    "### 7-3. 難易度・近似選別\n\n- 候補削除",
    "### 7-3. 難易度・近似選別（自動指標completed / 人間判断pending）\n\n- 候補削除",
    "plan 7-3",
)
plan = replace_once(
    plan,
    "### 7-4. 人間レビュー\n\n- iPhone SE",
    "### 7-4. 人間レビュー（基盤completed / 実施pending）\n\nレビュー画面:\n\n```text\nreview/variable-stage-review.html\n```\n\nレビュー順:\n\n- 距離1の59問\n- 距離2の33問\n- 距離3以上の16問\n\n確認端末・観点:\n\n- iPhone SE",
    "plan 7-4",
)
plan = replace_once(
    plan,
    "- 似た盤面の体感\n\n### 7-5. 練習モード先行切替",
    "- 似た盤面の体感\n- レビューJSONの保存\n- 採用84問以上の確保\n\n### 7-5. 完成バンク固定（pending）\n\n- レビューJSONを入力として採用Stage IDを固定\n- 未判断を自動採用しない\n- 採用84問未満なら生成・選別条件を再検討\n- 完成バンクを独立validatorへ再投入\n- runtime・rankingは引き続き無効\n\n### 7-6. 練習モード先行切替",
    "plan completion package",
)
plan = replace_once(
    plan,
    "現時点では、ゲーム公開部分は完成状態です。生成器v2は可変4〜6マスで84問成立まで確認済みですが、仕様採用とゲーム接続は未承認です。",
    "現時点では、ゲーム公開部分、可変4〜6マス契約、108問候補プール、人間レビュー基盤まで完成しています。残工程は108問の実レビュー、完成バンク固定、人間承認後のランダム練習先行切替です。",
    "plan final state",
)
plan_path.write_text(plan)
