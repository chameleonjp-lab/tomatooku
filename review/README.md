# 可変盤面レビュー画面

開発専用のレビュー画面です。

```text
review/variable-stage-review.html
```

## データ境界

- 盤面とメタデータは`generated/variable-stage-candidate-pool-v2.json`から毎回読み込む
- `localStorage`へ保存するのは採用・除外・保留、理由、メモ、日時だけ
- 盤面データ、正解、候補manifestは`localStorage`へ複製しない
- Supabase、ランキングRPC、外部APIへレビュー結果を送信しない
- 公開ゲームの`index.html`から自動リンクしない

詳細は`docs/VARIABLE_STAGE_REVIEW_TOOL.md`を参照してください。
