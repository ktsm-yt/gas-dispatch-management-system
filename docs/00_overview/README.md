# {{COMPANY_NAME_SHORT}} 技術仕様書（開発者向け）

**Ver 1.0** | 2025年12月15日

## ベースライン（顧客共有）
- **{{COMPANY_NAME_SHORT}}_システム仕様書_v1.3_20251216.docx** ← 仕様の正式版

## ドキュメント構成

| No | ファイル | 内容 |
|----|----------|------|
| 01 | [project_overview.md](01_project_overview.md) | プロジェクト概要・フェーズ・ステークホルダー |
| 02 | [tech_stack.md](02_tech_stack.md) | 技術スタック・制約事項 |
| 03 | [architecture.md](03_architecture.md) | システムアーキテクチャ・処理フロー・パフォーマンス |
| 04 | [project_structure.md](04_project_structure.md) | GASプロジェクト構成・ファイル一覧 |

## 詳細仕様（→ docs/03_spec/）

| No | ファイル | 内容 |
|----|----------|------|
| 05 | [05_database.md](../03_spec/05_database.md) | データベース設計・テーブル定義 |
| 06 | [06_backend.md](../03_spec/06_backend.md) | API設計・競合制御・監査ログ |
| 07 | [07_frontend.md](../03_spec/07_frontend.md) | フロントエンド設計・画面仕様 |
| 08 | [08_ui_components.md](../03_spec/08_ui_components.md) | UIコンポーネント・カラースキーム |
| 09 | [09_security.md](../03_spec/09_security.md) | セキュリティ設計・権限管理 |

## 運用（→ docs/05_ops/）

| No | ファイル | 内容 |
|----|----------|------|
| 10 | [10_development.md](../05_ops/10_development.md) | 開発環境セットアップ |
| 11 | [11_deployment.md](../05_ops/11_deployment.md) | デプロイ手順・ロールバック・バックアップ |
| 12 | [12_coding_standards.md](../05_ops/12_coding_standards.md) | コーディング規約 |
| 13 | [13_testing.md](../05_ops/13_testing.md) | テスト計画 |
| 14 | [14_troubleshooting.md](../05_ops/14_troubleshooting.md) | トラブルシューティング |

## 備考

- DBの細かな項目は先方データ到着後に更新予定
- 交通費エリア区分は「現場住所」基準（顧客本社住所ではない）
