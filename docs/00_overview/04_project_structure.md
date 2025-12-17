# 4. プロジェクト構成

## 4.1 GASプロジェクト構成

```
{{PROJECT_NAME}}-system/
│
├── Code.gs                 # メインエントリーポイント・ルーティング
├── Config.gs               # 設定値・定数定義
├── Auth.gs                 # 認証・権限管理
├── Database.gs             # DB操作共通関数
│
├── JobService.gs           # 案件管理ロジック
├── CustomerService.gs      # 顧客管理ロジック
├── StaffService.gs         # スタッフ管理ロジック
├── AssignmentService.gs    # 配置管理ロジック
├── InvoiceService.gs       # 請求管理ロジック (Phase2)
├── PayrollService.gs       # 給与管理ロジック (Phase2)
├── PdfService.gs           # PDF出力ロジック
├── LineTemplate.gs         # LINEテンプレート生成
├── Utils.gs                # ユーティリティ関数
│
├── index.html              # メインHTMLテンプレート
├── dashboard.html          # ダッシュボード画面
├── jobs.html               # 案件管理画面
├── customers.html          # 顧客マスター画面
├── staff.html              # スタッフマスター画面
├── assignments.html        # 配置管理画面
├── invoices.html           # 請求管理画面 (Phase2)
├── payroll.html            # 給与管理画面 (Phase2)
│
├── styles.css.html         # 共通スタイル
├── components.js.html      # 共通UIコンポーネント
└── api.js.html             # API呼び出しラッパー
```

## 4.2 スプレッドシート構成

```
{{PROJECT_NAME}}-db (メインDB)
│
├── 顧客              # M_Customers
├── スタッフ          # M_Staff
├── 外注先            # M_Subcontractors
├── 交通費            # M_TransportFee (エリア別金額マスター)
├── 案件              # T_Jobs
├── 配置              # T_JobAssignments
├── 請求              # T_Invoices (Phase2)
├── 支払              # T_Payouts (Phase2)
├── ログ              # T_AuditLog
└── 設定              # SystemConfig
```

```
{{PROJECT_NAME}}-db-YYYY (年度別アーカイブ)
│
└── 各年度の履歴データ
```

## 4.3 Google Drive構成

```
{{COMPANY_NAME_SHORT}}/
│
├── システム/
│   ├── {{PROJECT_NAME}}-db          # メインDBスプレッドシート
│   ├── {{PROJECT_NAME}}-db-2024     # 年度別アーカイブ
│   └── {{PROJECT_NAME}}-db-2025
│
├── 出力/
│   ├── 請求書/
│   │   └── YYYY-MM/             # 月別フォルダ
│   └── 給与明細/
│       └── YYYY-MM/
│
└── 顧客ファイル/
    ├── [顧客名A]/               # 顧客別フォルダ
    └── [顧客名B]/
```

## 4.4 ファイル役割一覧

| ファイル | 役割 | 依存関係 |
|----------|------|----------|
| Code.gs | doGet(), ルーティング | 全ファイル |
| Config.gs | 定数, 環境設定 | なし |
| Auth.gs | ユーザー認証, 権限チェック | Config.gs |
| Database.gs | CRUD共通処理 | Config.gs |
| JobService.gs | 案件CRUD | Database.gs, Utils.gs |
| CustomerService.gs | 顧客CRUD | Database.gs, Utils.gs |
| StaffService.gs | スタッフCRUD | Database.gs, Utils.gs |
| AssignmentService.gs | 配置CRUD | Database.gs, JobService.gs, StaffService.gs |
| Utils.gs | 日付処理, UUID生成等 | なし |
