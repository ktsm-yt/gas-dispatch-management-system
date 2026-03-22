# 配置管理システム — Dispatch Management System

**IT業界未経験の現場作業員が、AIを参謀に年商○億企業の基幹システムを作り切った。**

建設業向けの人員配置・請求・支払・売上分析を一気通貫で処理する業務システム。
Google Apps Script + Spreadsheet という制約の中で、SPA級の操作体験を持つフルスタック WebApp を構築した。

> **Note:** 顧客情報保護のため、社名・URL・金額等は `{{...}}` プレースホルダで伏せています。

---

## プロジェクト概要

| 項目 | 内容 |
|------|------|
| **規模** | 124ソースファイル / 約51,000行 / PR 210+本 |
| **期間** | 約4ヶ月（開発） + 保守継続中 |
| **体制** | PM/PO/UX: 自分 ── 実装: Claude Code ── レビュー: Codex |
| **稼働環境** | Google Apps Script WebApp（本番: Google Workspace） |
| **DB** | Google Spreadsheet（18テーブル） |
| **成果** | 毎日6時間の手作業 → ボタンひとつ / 案件管理ミスゼロ / 保守契約獲得 |

---

## 何を解決したか

建設業の現場管理者が毎日こなしていた業務:

- 手書き/Excel で案件と人員の配置を管理（30〜50現場/日）
- 毎日6時間かけてExcelの配置表を手作業で更新
- 給与計算・源泉徴収を電卓で計算
- 売上の分析は感覚頼り

**→ これらを1つのWebアプリで一気通貫で自動化した。**

---

## 機能一覧

### 案件・配置ダッシュボード
日別6列グリッド（上棟/終日/AM/PM/夜勤/未定）でカード表示。
30秒自動更新、横断検索、重複配置警告、配置変更検知。

### 請求管理
配置データから請求書を自動生成。3種テンプレート対応、PDF/Excel出力。
100件の一括生成をバッチ処理（中断・再開対応）。

### 支払管理
4段階ワークフロー（未払→下書き→確認済→支払済）。
人工割（日当按分）対応、明細Excel出力、外注費管理。

### 売上分析
月次/企業別/年次比較のKPIダッシュボード。
税理士向け4種エクスポート。

---

## アーキテクチャ

```
Browser (Chrome)
  ├─ Dashboard / Invoices / Payouts / Analytics ... 13 screens
  └─ google.script.run (RPC)
          │
GAS Runtime (V8)
  ├─ Controllers (10)  ── 入力検証・認証・ルーティング
  ├─ Services (21)     ── ビジネスロジック
  └─ Repositories (12) ── Bulk I/O (getValues/setValues)
          │
Google Spreadsheet (18 tables)
Google Drive (テンプレート・帳票・アーカイブ)
```

**3層アーキテクチャ**（Controller → Service → Repository）を採用し、
スプレッドシートをRDBライクに扱う設計。

---

## GASの制約との戦い

このプロジェクトの技術的な面白さは、**GASの制約をどう乗り越えたか**にある。

| 制約 | 対策 |
|------|------|
| **実行6分制限** | バッチ分割 + `PropertiesService` 進捗保存で中断・再開 |
| **I/Oが遅い** | SWR的キャッシュ、差分レンダリング、Read-Once最適化 |
| **同時実行制限** | `LockService` による排他制御 |
| **E2Eテスト不可** | OAuth認証がBOT検知 → Vitest純粋関数テスト + GAS内テストスイートで補完 |
| **バニラJS/CSS** | フレームワークなしでSPA級UX（楽観的UI更新、差分リロード） |

仕様書外の独自UX設計を**23項目**実装（SWR的キャッシュ、楽観的UI、BroadcastChannel同期 等）。

---

## 技術スタック

| カテゴリ | 技術 |
|---------|------|
| Runtime | Google Apps Script V8 (ES2020) |
| Language | TypeScript + GAS (.gs) |
| Frontend | Vanilla HTML/CSS/JS (HtmlService) |
| Database | Google Spreadsheet (18 tables) |
| Storage | Google Drive API v3 |
| Test | Vitest (純粋関数 + コントローラー結合テスト) |
| Build | Node.js + tsc + bash scripts |
| Lint | ESLint + @typescript-eslint |
| Deploy | @google/clasp |
| CI | GitHub Actions (lint + type-check + Vitest) |

---

## 開発の歩み

| フェーズ | 期間 | 内容 |
|----------|------|------|
| **Phase 1** コア | 約2ヶ月 | 案件管理・配置ダッシュボード・マスター管理 |
| **Phase 2** 請求・給与 | 約2ヶ月 | 請求書生成・給与計算・帳票出力・TS移行 |
| **検収→追加開発** | 約2週間 | 追加要求50件対応（PR 64本）・単価改定交渉 |
| **保守** | 継続中 | CR対応・リファクタリング・テスト基盤整備 |

### 主な転機

- **JS→TS移行**: 25,000行規模の移行を実施。型安全がなければ納期直前の仕様変更で破綻していた
- **テスト戦略の進化**: AIが「必ず通るテスト」を書く問題を発見 → テストレビュー体制を構築
- **スコープ交渉**: 仕様書外の独自実装49項目を可視化し、変更要求の有償化と単価2倍改定を獲得

---

## 詳細ドキュメント

| ドキュメント | 内容 |
|------------|------|
| [01. システム概要](docs/portfolio-readme/01_system-overview.md) | アーキテクチャ詳細・レイヤー設計・Tech Stack |
| [02. アーキテクチャ判断](docs/portfolio-readme/02_architecture-decisions.md) | 技術選定の理由と代替案 |
| [03. パフォーマンス設計](docs/portfolio-readme/03_performance-engineering.md) | キャッシュ戦略・バッチ最適化・I/O設計 |
| [04. ドメインロジック](docs/portfolio-readme/04_domain-logic.md) | 請求・給与・人工割の業務ロジック |
| [05. 開発ワークフロー](docs/portfolio-readme/05_dev-workflow.md) | AI分業モデル・CI/CD・ビルドパイプライン |
| [06. PM と成長記録](docs/portfolio-readme/06_project-management-and-growth.md) | スコープ交渉・ステークホルダー対応・反省 |

---

## License

MIT

---

*開発者: [@KtsmD19](https://x.com/KtsmD19) — IT業界未経験からAIと共にフルスタック業務システムを構築*
