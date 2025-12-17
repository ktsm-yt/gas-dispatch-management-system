# ドキュメント構成

> NOTE: 公開版は `{{...}}` 形式のプレースホルダを含みます。`.env` を用意（`npm run env:init`）してから `npm run render:docs` を実行すると、実値入り版を `_rendered/docs/` に生成できます。

## ディレクトリ構造

```
docs/
├── 00_overview/     # プロジェクト概要・オンボーディング
├── 01_requirements/ # 要件・未確定事項・論点管理
├── 02_meetings/     # 会議メモ・議事録
├── 03_spec/         # 実装仕様（どう作るか）
├── 04_adr/          # アーキテクチャ決定記録（なぜそうしたか）
├── 05_ops/          # 運用・手順書（デプロイ・障害対応）
└── references/      # 参考資料（顧客テンプレート等）
```

## 各フォルダの役割

### [00_overview/](00_overview/) - 概要
プロジェクトの全体像、技術スタック、アーキテクチャ概要。新規参加者はここから読む。

### [01_requirements/](01_requirements/) - 要件
要件定義書、変更要求管理、実装前チェックリスト。
- [要件定義書_v1.1.md](01_requirements/要件定義書_v1.1.md) - 要件定義
- [change_requests.md](01_requirements/change_requests.md) - 変更要求管理
- [00_pre_implementation_checklist.md](01_requirements/00_pre_implementation_checklist.md) - **実装前チェックリスト**

### [02_meetings/](02_meetings/) - 会議
要件会議の記録、文字起こし、議事録。

### [03_spec/](03_spec/) - 仕様
実装者向けの技術仕様。API設計、データモデル、画面仕様など。
- [10_implementation_risks.md](03_spec/10_implementation_risks.md) - 実装リスクと対策

### [04_adr/](04_adr/) - ADR
Architecture Decision Records。重要な技術的意思決定の記録。
- [ADR-001](04_adr/ADR-001_saveJob_saveAssignments.md): saveJob/saveAssignments統合API
- [ADR-002](04_adr/ADR-002_no_cache_transaction_data.md): 当日トランザクション非キャッシュ
- [ADR-003](04_adr/ADR-003_pay_unit_invoice_unit.md): pay_unit/invoice_unit分離

### [05_ops/](05_ops/) - 運用
開発環境構築、デプロイ手順、トラブルシューティング、バックアップ/復旧手順。
- [15_yearly_archive.md](05_ops/15_yearly_archive.md) - 年度アーカイブ運用（自動実行）
- [16_git_workflow.md](05_ops/16_git_workflow.md) - Git運用ガイド
- [17_env_setup_guide.md](05_ops/17_env_setup_guide.md) - **環境変数セットアップガイド**（初心者向け）

### [references/](references/) - 参考資料
顧客から提供された請求書テンプレートなどの参考資料。
- [billing_templates/](references/billing_templates/) - 請求書テンプレート（顧客別）
