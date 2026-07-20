from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"{label} anchor not found")
    return text.replace(old, new, 1)


readme_path = Path("README.md")
readme = readme_path.read_text()
readme = replace_once(
    readme,
    """generated/variable-stage-bank-v2.json
candidate-v2-variable-4-6-final.status = completed-bank-pending-runtime-approval
candidate-v2-variable-4-6-final.runtimeEnabled = false
candidate-v2-variable-4-6-final.rankingEligible = false
ACTIVE_STAGE_BANK_ID = legacy-v1
```

完成バンクは問題内容として固定済みですが、ゲーム実行経路への接続は未承認です。

現行30問、公式3問、ランダム練習には接続していません。

詳細:
""",
    """generated/variable-stage-bank-v2.json
candidate-v2-variable-4-6-final.status = active-practice-only
candidate-v2-variable-4-6-final.runtimeEnabled = true
candidate-v2-variable-4-6-final.rankingEligible = false
ACTIVE_STAGE_BANK_ID = legacy-v1
ACTIVE_PRACTICE_STAGE_BANK_ID = candidate-v2-variable-4-6-final
```

### Slice 10：ランダム練習への先行接続

84問完成バンクをランダム練習だけへ接続しました。

- 公式3問は`T001 / T011 / T021`のまま
- 公式開始時は完成バンクJSONを取得しない
- 練習は84問から難易度1→2→3を出題
- 練習結果はランキング対象外
- JSON取得・schema検証失敗時は旧30問へ自動fallback
- feature gateを無効化すると即時に旧30問へ戻せる

```text
PRACTICE_STAGE_BANK_FEATURE.enabled = true
primary = candidate-v2-variable-4-6-final
fallback = legacy-v1
```

接続実装と自動テストは完了しています。残る工程はCodeberg Pages反映後の実機確認です。

詳細:
""",
    "README practice connection",
)
readme = replace_once(
    readme,
    "- `docs/VARIABLE_STAGE_FINAL_BANK.md`\n",
    "- `docs/VARIABLE_STAGE_FINAL_BANK.md`\n- `docs/PRACTICE_STAGE_BANK_ROLLOUT.md`\n",
    "README rollout doc",
)
readme = replace_once(
    readme,
    "npm run test:variable-stage-final-bank    # 84問完成バンク・出典SHA・分布契約\n",
    "npm run test:variable-stage-final-bank    # 84問完成バンク・出典SHA・分布契約\nnpm run test:practice-stage-bank          # 練習bank routing・fallback契約\n",
    "README practice static command",
)
readme = replace_once(
    readme,
    "npm run e2e:review                       # レビュー画面iPhone SE相当E2E\n",
    "npm run e2e:review                       # レビュー画面iPhone SE相当E2E\nnpm run e2e:practice-bank                 # 公式隔離・練習84問・fallback E2E\n",
    "README practice e2e command",
)
readme = replace_once(
    readme,
    "  main.js\n  ranking-config.js",
    "  main.js\n  practice-stage-bank.js\n  ranking-config.js",
    "README source tree",
)
readme = replace_once(
    readme,
    "  variable-stage-final-bank.test.js\n  generate_stages.js",
    "  variable-stage-final-bank.test.js\n  practice-stage-bank.test.js\n  practice-stage-bank.e2e.js\n  generate_stages.js",
    "README test tree",
)
readme = replace_once(
    readme,
    "  VARIABLE_STAGE_FINAL_BANK.md\n```",
    "  VARIABLE_STAGE_FINAL_BANK.md\n  PRACTICE_STAGE_BANK_ROLLOUT.md\n```",
    "README docs tree",
)
readme_path.write_text(readme)


plan_path = Path("docs/IMPLEMENTATION_PLAN_v2.md")
plan = plan_path.read_text()
plan = replace_once(
    plan,
    "現在状態: 公式ランキング公開済み／可変エリアStage Schema v2承認済み／レビュー第1巡承認済み／84問完成バンク固定済み／ランダム練習接続承認待ち",
    "現在状態: 公式ランキング公開済み／84問完成バンク固定済み／ランダム練習接続実装済み／公式・ランキング隔離済み／公開後実機確認待ち",
    "plan current state",
)
plan = replace_once(
    plan,
    """### 4-9. Slice 9：84問完成バンク

状態: **completed / RUNTIME APPROVAL PENDING**
""",
    """### 4-9. Slice 9：84問完成バンク

状態: **completed / ACTIVE FOR PRACTICE ONLY**
""",
    "plan slice9 status",
)
plan = replace_once(
    plan,
    "- runtime・ranking無効\n\n固定成果物:",
    "- runtimeは練習専用で有効\n- rankingは無効\n\n固定成果物:",
    "plan slice9 flags",
)
plan = replace_once(
    plan,
    """docs/VARIABLE_STAGE_FINAL_BANK.md
```

## 5. 現在のバンク契約
""",
    """docs/VARIABLE_STAGE_FINAL_BANK.md
```

### 4-10. Slice 10：ランダム練習先行接続

状態: **implemented / RELEASE DEVICE CHECK PENDING**

実装:

- 公式active bankと練習active bankを分離
- 練習開始時だけ84問JSONを遅延取得
- Stage Schema v2 runtime検証
- 読込失敗時は旧30問へ自動fallback
- feature gateによる即時ロールバック
- 公式開始時の完成bank取得を禁止
- 練習結果のランキング送信を禁止
- 盤面へbank IDとfallback状態を記録

固定成果物:

```text
src/practice-stage-bank.js
scripts/practice-stage-bank.test.js
scripts/practice-stage-bank.e2e.js
docs/PRACTICE_STAGE_BANK_ROLLOUT.md
```

## 5. 現在のバンク契約
""",
    "plan slice10",
)
plan = replace_once(
    plan,
    "candidate-v2-variable-4-6-final.status = completed-bank-pending-runtime-approval\ncandidate-v2-variable-4-6-final.runtimeEnabled = false\ncandidate-v2-variable-4-6-final.rankingEligible = false",
    "candidate-v2-variable-4-6-final.status = active-practice-only\ncandidate-v2-variable-4-6-final.runtimeEnabled = true\ncandidate-v2-variable-4-6-final.rankingEligible = false\n\nACTIVE_PRACTICE_STAGE_BANK_ID = candidate-v2-variable-4-6-final\nPRACTICE_STAGE_BANK_FEATURE.fallbackBankId = legacy-v1",
    "plan bank contract",
)
plan = replace_once(
    plan,
    "84問完成バンクは固定済み。明示承認を得てランダム練習接続PRを作成するまでゲーム接続しない。",
    "ランダム練習接続は実装済み。マージ・公開後の実機確認が完了するまで、feature gateと旧30問fallbackを維持する。",
    "plan human gate",
)
plan = replace_once(
    plan,
    "### 決定4：ランダム練習への接続\n\n推奨:",
    "### 決定4：ランダム練習への接続（resolved）\n\n採用内容:",
    "plan decision4",
)
plan = replace_once(
    plan,
    "### 7-6. 練習モード先行切替（pending）\n\n人間承認後のみ:",
    "### 7-6. 練習モード先行切替（implemented / device check pending）\n\n実装済み:",
    "plan 7-6 status",
)
plan = replace_once(
    plan,
    "- 可変サイズvalidatorをゲームへ接続\n- 練習用バンクを切替\n- 公式3問は維持\n- ランキングは維持\n- 即時ロールバック可能にする",
    "- 可変サイズvalidatorを練習loaderへ接続\n- 練習用バンクを84問へ切替\n- 公式3問は維持\n- ランキングは維持\n- feature gateで即時ロールバック可能\n- 読込失敗時は旧30問へ自動fallback\n- 専用iPhone SE相当E2Eを追加",
    "plan 7-6 implementation",
)
plan = replace_once(
    plan,
    "現時点では、ゲーム公開部分、可変4〜6マス契約、108問候補プール、レビュー第1巡、84問完成バンク固定まで完了しています。残工程は明示承認後のランダム練習先行切替と実機確認です。",
    "現時点では、ゲーム公開部分、84問完成バンク、ランダム練習先行接続、公式・ランキング隔離、fallbackとロールバック契約まで実装済みです。残工程はCodeberg Pages反映後のiPhone 17 Pro等による実機確認です。",
    "plan final state",
)
plan_path.write_text(plan)
