# トマトオク GitHub Pages自動公開

- 文書種別: GitHub `main`からGitHub Pagesへの公開契約
- 対象: `chameleonjp-lab/tomatooku`
- 公開URL: `https://chameleonjp-lab.github.io/tomatooku/`
- 更新日: 2026-07-28
- 状態: **implemented / repository setting pending**

## 1. 目的

GitHubの`main`を正式な開発基準とし、更新された公開用ファイルだけをGitHub Pagesへ反映する。開発文書、テスト、レビュー画面、設定資料は公開物へ混ぜない。Codebergへの送信処理は使用しない。

## 2. 公開対象

```text
index.html
src/
generated/variable-stage-bank-v2.json
```

練習モードは実行時に`generated/variable-stage-bank-v2.json`を取得するため、このJSONが欠けた公開物は不合格とする。

次は公開しない。

```text
.github/
docs/
review/
scripts/
package.json
package-lock.json
playwright.config.js
Supabaseの設定資料
アクセストークン
```

`scripts/prepare-github-pages.js`が公開物を`_site`へ作り、HTML、CSS、JavaScriptから参照するローカルファイルが欠けていないことを検査する。GitHub Pagesのリポジトリパスを外れる`/`始まりの参照も拒否する。`scripts/github-pages.test.js`は公開対象、84問バンク、権限、公開先、旧Codeberg処理の撤去を固定する。

## 3. 起動条件

```text
GitHub mainへのpush
GitHub Actions画面からの手動実行
```

Pull Requestでは公開ワークフローを起動しない。通常のCIが同じ公開契約テストを実行するため、Draft PRの検査中に公開版は変わらない。

## 4. 初回だけ必要なリポジトリ設定

**ユーザーのマージ前に確認する必須条件**。権限のある本人・管理者が既存Source/公開commit/環境制限を控え、次を読み戻し確認する。legacyのままマージすると旧branch配信がCIを迂回する恐れがあるため、確認不能ならマージしない。既存承認/ブランチ保護は維持する。本PRは設定変更を行わない。

2026-11-02 JST現在、接続ツールのPages設定読取は非対応400で最新Sourceは未確認。過去のlegacy記録は現在値の証明ではない。現在の成功版を保持できる切替を管理者が確認できない場合も保留する。

GitHubのリポジトリ画面で、必要なら管理者が次を設定する。

```text
Settings
→ Pages
→ Build and deployment
→ Source
→ GitHub Actions
```

Codebergリポジトリ、Pages通知、アクセストークン、`CODEBERG_USERNAME`、`CODEBERG_TOKEN`は不要である。GitHub Repository Secretsは不要。

## 5. 公開方法と権限

`.github/workflows/deploy-github-pages.yml`は次の順で処理する。

1. mainへのpushまたはmainの手動実行で、同じcommitの既存CI（静的・契約・全feasibility・生成物再現性・Chromium/WebKit）を再利用する。失敗/skip/cancelなら以後は動かない。
2. 検証した `${{ github.sha }}` をcheckoutし、読取専用gateでSource=workflowと現在mainのSHA一致を確認する。Node.js 20で依存関係を固定取得する。
3. 静的・契約テストをすべて実行する。
4. 公開用14ファイルを`_site`へ作る。
5. `actions/upload-pages-artifact`でGitHub Pages用成果物を登録する。
6. Sourceと現在main SHAをもう一度確認してから `actions/deploy-pages` で同じrunの成果物を`github-pages`環境へ公開する。main以外の手動実行、Source読取失敗、legacy、不明値、古いcommitは停止する。

ワークフロー権限は次だけを使う。

```text
contents: read
pages: write
id-token: write
```

外部リポジトリへのpush、強制push、公開専用ブランチ、独自アクセストークンは使わない。

## 6. 失敗時

- Pagesの公開元がGitHub Actionsでない、読取失敗、不明の場合は停止する。自動で設定を変更せず管理者へ引き継ぐ。マージ前の確認が済むまでマージしない。
- 公開必須ファイル、84問バンク、参照先が欠けていれば、成果物登録前に失敗する。
- 静的・契約テストが失敗した版は公開しない。
- 公開内容を戻す場合はGitHubで復元用PRを作り、`main`へ統合後に通常の公開を行う。

## 7. 完了条件

- GitHub Pages公開契約テストが成功する。
- PagesのSourceが`GitHub Actions`になっている。
- `main`更新後の公開ワークフローが成功する。
- 公開URLが`index.html`と84問JSONを返す。
- 公開物が14ファイルに限られ、文書、テスト、秘密情報を含まない。
- ゲーム内の共有先と、Supabaseへ再登録済みの`game_url`がGitHub Pagesを指す。

実機確認とSupabaseランキングの運用確認は、この自動公開契約とは別の工程として扱う。
