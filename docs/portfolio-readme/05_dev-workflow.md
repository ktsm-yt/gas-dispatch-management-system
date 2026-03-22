# 05. 開発ワークフロー・品質管理

---

## 1. AI分業モデル

| 役割 | 担当 | 業務内容 |
|------|------|----------|
| PM / PO / UX | 自分 | 要件定義、UI判断、進行管理、品質責任 |
| Tech Lead / Reviewer | Codex | 設計レビュー、ロジックの穴探し、実装後の品質チェック |
| Developer | Claude Code | Planモード→実装、テストコード、ドキュメント生成 |
| Scribe / Analyst | Gemini / NotebookLM | 会議の文字起こし、コンテキスト整理、図解生成 |

**Why this split:**

- **Claude**: 文脈・ニュアンスの正確な解釈、自動方向修正、skill/hook/subagent/auto-memoryによるカスタマイズ性
- **Codex**: Claudeの計画と実装の穴を発見する「切れ者レビュアー」。人間が見落とすロジックの欠陥も検出
- **Gemini**: 大コンテキスト + マルチモーダル。会議文字起こし、Canvas機能でHTML/CSS図解を生成
- **GPT**: パーソナライズした「話し相手」。感情の発露先、意思決定の壁打ち

---

## 2. AI相互レビューサイクル

```
[要件整理] → [Claude: Plan作成]
                    ↓
            [Codex: Planレビュー]
                    ↓
            [Claude: コンテクスト評価 → 実装]
                    ↓
            [Codex: 実装コードレビュー]
                    ↓
            [Claude: /learning-point → 学習ポイント抽出]
            [Claude: /gas-knowledge → GAS固有ナレッジ蓄積]
                    ↓
            [PR作成]
```

AI相互レビューにより、未経験者の技術をカバーし、ロジックの抜け漏れを防止。
PRのたびに学習を挟み、知識習得の負債を貯めないことが、未経験者が走り切るための生命線。

---

## 3. Git Worktreeモデル

```
gas-dispatch-system/                        → main（本番用、開発禁止）
gas-dispatch-system-worktrees/modal-bugs/   → fix/modal-bugs（モーダル修正）
gas-dispatch-system-worktrees/invoice/      → feature/invoice-export（請求書エクスポート）
```

**1タスク = 1 worktree = 1ブランチ = 1 PR**

**ルール:**
- mainブランチでのコード変更は絶対禁止
- 新規作業は必ず worktree を作成してから開始
- マージ戦略: 常にMerge commit（squash/rebaseは使わない）→ ブランチ履歴を保存
- コミットはConventional Commits形式（`fix:`, `feat:`, `perf:` 等）で機能単位に分割

---

## 4. テスト戦略（E2E不可 → 3層代替）

GASではE2E自動テストが事実上不可能:
- OAuth2認証が自動テストツールをBOT検知してブロック
- HtmlServiceがiframe動作のためクロスドメイン制約

### 3層代替戦略

| 層 | 手法 | 検出対象 |
|----|------|----------|
| Layer 1: ユニットテスト | GAS環境でのロジックテスト | 計算ミス、境界値エラー |
| Layer 2: AIチート検出 | /review スキルに統合（テスト品質チェック + adversarial観点） | toBeTruthy のみのアサーション、循環テスト、モック依存 |
| Layer 3: 画面検証 | デプロイ後の手動画面操作（Claude in Chromeを試みたがブラウザ接続が不安定なため手動で代替） | UI不具合、状態遷移エラー |

**テスト品質で禁止しているパターン:**
- `toBeTruthy`/`toBeFalsy`/`toBeDefined` のみのアサーション（具体値を確認せよ）
- 実装定数をコピーしたハードコード期待値
- 実装関数でexpected値を生成する循環アサーション
- 全依存モック + モック呼び出しのみ検証
- `expect()` が0個のテストブロック

---

## 5. 知識管理

### /learning-points スキル
PRマージのたびに実行。差分を解析し、ジュニアエンジニア（経験1〜2年）向けの学習ドキュメントを自動生成する。各トピックにはbefore/after比較のMermaid図を必ず含め、`~/Dev/LearningVault/` に出力。ウォッチャーがPDF変換 → Google Driveに自動配信 → GoodNotesに取り込んで手書きメモを加えながら復習する。

例: 「GASのCacheServiceは100KB制限がある → 軽量フィールドのみ保存」

**なぜ作ったか**: AI実装で動くコードは書けるが、「なぜそう書くのか」を理解しないと応用が効かない。PRのたびに学習を挟むことで、未経験者が知識の負債を溜めずに走り続けるための仕組み。

### /gas-knowledge スキル
GAS + Spreadsheet DB開発の落とし穴をナレッジベースとして蓄積し、実装時にAIにも参照させる辞書型スキル。

| トピック | 内容例 |
|----------|--------|
| プラットフォーム制約 | 6分実行制限、`google.script.run` の引数制約（Date/function不可） |
| Spreadsheet DBパターン | バルクI/O、行番号依存の回避 |
| セキュリティ・XSS | `<?= ?>` vs `<?!= ?>` の使い分け |
| パフォーマンス | CacheServiceのJSONサイズ制限、per-cellループの禁止 |
| 日付・タイムゾーン | `new Date()` のサーバーTZ依存、ISO文字列化 |

プロジェクト固有の業務知識（源泉徴収、人工割など）は意図的に除外し、GAS開発として汎用的に使えるナレッジに限定している。

---

## 6. 変更管理

### 変更要求（CR）管理
- **外部追跡**: Google Spreadsheetで管理
- **採用基準**: 工数・コスト・期限を明記、承認者を指名、影響範囲を特定
- **WIP制限**: 同時に未完了CRは最大2件
- **承認権限**:
  - 軽微UI変更（1〜2時間以内）→ 現場管理者が承認
  - DB変更・財務ロジック・請求仕様 → 社長承認

### /cr-estimate スキル — 見積もりの自動化

CRの分類・工数見積もり・スプレッドシートへの書き込みを自動化するスキル。

```
/cr-estimate <CR内容>
    ↓
1. 追跡シートからCR番号を自動採番
2. Agent(Explore, sonnet) でコードベースを軽量探索 → 影響範囲を特定
3. 分類（UI変更 / ロジック変更 / DB変更 等）と工数を算出
4. 一覧をまとめてユーザーに一括確認
5. 確認後、workspace-mcp でスプレッドシートに一括書き込み
```

複数CRをまとめて投入できる。確認はCRごとではなく一括1回のみ。再見積もり（`/cr-estimate CR-XXX`）やシート書き込みのみ（`/cr-estimate write CR-XXX`）にも対応。

### ADR（Architecture Decision Record）
重要な設計判断を6件のADRとして記録。「何を選ばなかったか」も含めて記録し、将来の判断材料を残す。

---

## 7. セキュリティ設計

| 対策 | 実装 |
|------|------|
| 認証 | Google Workspace SSO（`Session.getActiveUser()`） |
| 認可 | ドメイン許可リスト + ロール階層（admin/manager/staff） |
| XSS防止 | `<?= value ?>` (エスケープ版) のみ使用、`<?!= ?>` はユーザー入力に使用禁止 |
| 数式インジェクション防止 | `=` で始まる文字列に `'` プレフィックス付与 |
| 監査ログ | 全更新操作を T_AuditLog に記録（before/after のJSON diff） |
| 楽観ロック | `expectedUpdatedAt` による競合検出（全更新APIに必須） |

**権限階層:**

```javascript
const roleHierarchy = { 'admin': 3, 'manager': 2, 'staff': 1 };
// admin（社長）: 全機能アクセス
// manager（番頭）: ダッシュボード + マスター編集
// staff: 自分の配置情報のみ
```

---

← [04_domain-logic.md](./04_domain-logic.md) | [06_project-management-and-growth.md](./06_project-management-and-growth.md) →
