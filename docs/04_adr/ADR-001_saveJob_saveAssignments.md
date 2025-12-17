# ADR-001: saveJob/saveAssignments 統合API採用

## ステータス

承認済み

## コンテキスト

案件（Job）と配置（Assignment）の作成・更新・削除を行うAPIを設計する際、以下の選択肢があった：

1. CRUD分離方式: `createJob`, `updateJob`, `deleteJob`, `createAssignment`, `updateAssignment`, `deleteAssignment`
2. 統合方式: `saveJob`, `saveAssignments`（upsert + 差分削除）

## 決定

**統合方式（`saveJob` / `saveAssignments`）を採用する。**

## 理由

- **API関数数の削減**: GASの`google.script.run`呼び出しを最小化
- **競合検知の統一**: `expectedUpdatedAt`による楽観ロックを1箇所で管理
- **一括操作**: 配置の複数同時変更を1リクエストで処理（upserts + deletes）
- **シンプルなフロントエンド実装**: 作成/更新の分岐ロジックがサーバ側に集約

## 詳細

詳細な仕様は以下を参照：
- [06_backend.md](../03_spec/06_backend.md) - API仕様・競合制御（expectedUpdatedAt）

## 影響

- フロントエンドは新規/更新を意識せず、常に`save`系APIを呼ぶ
- `job_id`/`assignment_id`の有無でサーバが新規/更新を判定
- 監査ログは全更新操作をbefore/afterで記録
