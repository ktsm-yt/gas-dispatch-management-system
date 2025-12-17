# 16. Git運用ガイド

## 基本方針（このプロジェクトの約束）

- **作業は `git worktree` 前提**（作業ごとにフォルダを分ける）
- ブランチは作る（= worktreeに紐づく作業ラベル）が、**ブランチ切替で作業しない**
- **1作業 = 1 PR = 1 worktree = 1 ブランチ** を基本単位にする
- `main` worktree（このリポジトリ）は「レビュー/整備用」として扱い、なるべく汚さない
- **開発中のコミットは雑でOK**（Squash mergeで1つにまとまる）
- **PRタイトルとdescriptionだけ丁寧に書く**（振り返り資産になる）

> 補足: worktree は内部的にブランチを使います。禁止しているのは「同じフォルダでブランチを切り替えて作業する運用」です。

## なぜこの運用か（Worktreeとブランチの関係）

```
Worktree = 窓（特定のブランチを別フォルダで開く仕組み）
Branch   = 家（コミット履歴の実体、マージ/push/rebaseの対象）
```

- Worktreeは「便利な作業場所」、Branchは「履歴の管理単位」
- ブランチがないとコミットが迷子になる（detached HEAD）
- だから「1 worktree = 1 ブランチ」が鉄則

## ブランチ戦略

```
main          : 本番相当。安定版
└── feature/* : 機能開発用
```

小規模プロジェクトのため `develop` ブランチは設けない。

### 命名ルール

- 小文字 + `kebab-case`（例: `feature/dashboard-6columns`）
- 種別プレフィックス（例）
  - `feature/*` 新機能
  - `fix/*` バグ修正
  - `docs/*` ドキュメント
  - `chore/*` 設定/依存/雑務
  - `refactor/*` リファクタ
  - `hotfix/*` 緊急修正（本番相当）

### 開発フェーズに応じた運用

プロトタイプ→フィードバック→本実装の反復開発を想定。

| フェーズ | 目的 | ブランチ例 | 粒度 |
|----------|------|------------|------|
| **プロトタイプ** | 顧客に見せる形を作る | `feature/prototype-v1` | 1イテレーション = 1 PR |
| **FB反映** | 修正を重ねる | `feature/prototype-v2`, `v3`... | 同上 |
| **本実装** | 機能単位で整理 | `feature/job-management` | 1機能 = 1 PR |

プロト期はまとまった区切りごとにPRを出せばOK。細かく分けすぎなくていい。

### 顧客デモ（アジャイル）の回し方

「ちょっと動くものを見せる → フィードバックで再開発」を回すときは、**PRを“受け入れ単位”**として扱うと迷子になりにくい。

- **1回のデモ（=1回の受け入れ確認）につきPRを1本**が基本
- デモ前は Draft PR でOK（進捗をpushして見える化）
- デモ後の分岐
  - **OK（受け入れ）**: PRを Squash merge → `main` が「デモ済み最新版」になる
  - **修正して再デモ**: 同じPRで継続（追加コミットで積む）
  - **別の追加要望**: Issueを切って別PR（スコープを混ぜない）

#### デモに出したら「履歴を書き換えない」

顧客に見せた時点で、そのPRは「いつの状態を見せたか」を保てるようにする。

- その後は **`git push --force` をしない**
- PRの途中で `rebase -i` して整理しない（必要なら受け入れ後に次PRで整理）

#### デモの節目タグ（任意・おすすめ）

顧客に見せた状態を後から再現できるように、節目でタグを打つ（Squash merge後の `main` に打つのが簡単）。

```bash
git tag demo-20251217-invoice-format2
git push origin demo-20251217-invoice-format2
```

タグ名は `demo-YYYYMMDD-<topic>`（topicはkebab-case）を基本にする。

## コミットメッセージ規約

### 開発中のコミット（雑でOK）

Squash mergeで最終的に1コミットになるため、**開発中は深く考えなくていい**。

```bash
# こんな感じで全然OK
git commit -m "wip"
git commit -m "動いた"
git commit -m "やっぱ変更"
git commit -m "バグ直した"
```

### PRタイトル（ここだけ丁寧に）

Squash merge後、PRタイトルがmainのコミットメッセージになる。

| プレフィックス | 用途 | 例 |
|----------------|------|-----|
| `feat:` | 新機能 | `feat: ダッシュボード6列表示` |
| `fix:` | バグ修正 | `fix: 競合検知エラーハンドリング` |
| `docs:` | ドキュメント | `docs: 実装リスクドキュメント追加` |
| `refactor:` | リファクタリング | `refactor: JobService分割` |
| `style:` | フォーマット修正 | `style: インデント統一` |
| `test:` | テスト追加・修正 | `test: saveJob単体テスト追加` |
| `chore:` | ビルド・設定変更 | `chore: .gitignore更新` |

## ワークフロー

### ふだんの開発（worktree運用：必須）

`main` 用の作業ディレクトリ（このリポジトリ）を常に保持し、作業は **別フォルダのworktree** で行う。

```bash
# 0. main worktree（このフォルダ）を最新化
git switch main
git pull --ff-only

# 1. worktree作成（例: ダッシュボード6列）
git worktree add -b feature/dashboard-6columns ../gas-dispatch-system__dashboard-6columns

# 2. 作業ディレクトリへ移動（Warpなら別タブ推奨）
cd ../gas-dispatch-system__dashboard-6columns

# 3. 作業・コミット（雑でOK、細かく刻む必要なし）
git add .
git commit -m "wip"
# ... 作業を続ける ...
git add .
git commit -m "とりあえず動いた"

# 4. pushしてPR作成（GitHub上でマージ）
git push -u origin feature/dashboard-6columns
# → PRタイトルとdescriptionを丁寧に書く（テンプレあり）
```

#### Warp（ターミナル）での運用

- **worktreeごとにタブを分ける**（タブ名をブランチ名に）
- 複数worktreeで並行作業する場合、タブを見れば今どこにいるか分かる
- Claude Codeを使う場合も、タブごとに `cd` → `claude` で独立セッション

#### worktree名のおすすめ

- `../gas-dispatch-system__<branch-suffix>`（例: `../gas-dispatch-system__dashboard-6columns`）
- `../gas-dispatch-system__<yyyyMMdd>__<topic>`（例: `../gas-dispatch-system__20251217__invoice-format2`）

#### 更新（作業中に main が進んだら）

```bash
# その worktree 内で
git fetch origin
git rebase origin/main
```

rebaseでコンフリクトが起きても、最終的にSquash mergeするので途中の履歴は気にしなくていい。

#### マージ後の後片付け（必ずやる）

```bash
# main worktreeに戻る（元のフォルダ）
cd /path/to/gas-dispatch-system
git pull --ff-only

# worktree削除（フォルダごと消える）
git worktree remove ../gas-dispatch-system__dashboard-6columns

# ローカルブランチ削除（マージ済みなら消せる）
git branch -d feature/dashboard-6columns
```

#### 注意

- **同じファイルを複数worktreeで同時に触ると衝突しやすい**ので、作業の粒度を小さく保つ
- `feature/*` は「1 PR = 1 ブランチ = 1 worktree」くらいが管理しやすい
- `rm -rf` で手動削除せず、必ず `git worktree remove` を使う（参照が残るとトラブルの元）

### 小さな修正

ドキュメント修正や軽微な変更も、基本は worktree + PR を推奨。

例外として、以下を**すべて**満たす場合のみ `main` 直コミットを許可する。

- 変更が `docs/` のみ
- **1ファイル・10行以内**
- 公開情報のみ（`docs/references/` や会議メモ等は触らない）

### PR運用（ソロでも必須）

確認者が自分だけでも、PRを残すと「差分の説明」「作業単位の境界」「後からの振り返り」ができる。

#### マージ方式: Squash merge（固定）

```
開発中（PR内）              マージ後（main）
--------------------------  →  ----------------------
wip                              feat: ダッシュボード実装 (#12)
動いた
やっぱ変更
バグ直した
インデント
```

- PR内の細かいコミットが1つにまとまる
- mainの履歴がきれいに保たれる
- **だから開発中のコミットは雑でいい**

#### PRの役割（振り返り資産）

後で自分が見返したとき「何をやったか」「なぜそうしたか」「何を学んだか」が分かるようにする。

- **PRタイトル**: `<プレフィックス>: <簡潔な説明>`
- **PR description**: テンプレートに沿って記入（`.github/PULL_REQUEST_TEMPLATE.md`）

GitHub上で `Pull Requests → Closed` を見れば、作業履歴が時系列で追える。

#### PR作成前のセルフチェック

- `git status` で意図しないファイルが混ざっていない
- `.env` / `_rendered/` / `.clasp.json` / `app/gas/.clasp.json` がコミット対象に入っていない
- `docs/references/` / `docs/02_meetings/` がコミット対象に入っていない
- docsの `{{...}}` が壊れていない（必要なら `npm run render:docs` で確認）

## `.gitignore`運用

`.gitignore` は「公開してはいけないもの」を中心に定義する（詳細は `.gitignore` を参照）。

特に以下は **絶対にコミットしない**。

- `.env` / `*.key` / `service-account*.json` など機密
- `.clasp.json`（GASプロジェクト紐付け）
- `_rendered/`（実値入りのローカル生成物）
- `docs/references/`（顧客提供テンプレ等）
- `docs/02_meetings/`（会議メモ）

## やってはいけないこと

- `main` への force push
- 機密情報（`.env`、認証情報）のコミット
- 顧客資料/テンプレ等のコミット（置き場は `docs/references/` だが **gitignore対象**）
- worktreeを `rm -rf` で削除（`git worktree remove` を使う）

## クイックリファレンス

### 開発の流れ（これだけ覚える）

```bash
# 1. worktree作る
git worktree add -b feature/xxx ../gas-dispatch-system__xxx

# 2. 作業する（コミットは雑でOK）
cd ../gas-dispatch-system__xxx
git commit -m "wip"

# 3. PR出す（タイトルとdescriptionだけ丁寧に）
git push -u origin feature/xxx

# 4. Squash mergeしたら片付け
cd /path/to/gas-dispatch-system
git pull --ff-only
git worktree remove ../gas-dispatch-system__xxx
git branch -d feature/xxx
```

### 頭を使うポイント（ここだけ）

| タイミング | やること |
|------------|----------|
| PR作成時 | タイトルにプレフィックスつける |
| PR作成時 | descriptionに「何を」「なぜ」「学び」を書く |
| それ以外 | 気にしなくていい |
