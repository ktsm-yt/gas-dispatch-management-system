# P1-3: 案件管理 実装計画

## 概要

Phase 1の3番目として「案件管理」機能を実装する。
T_Jobs テーブルのCRUD操作とダッシュボード表示を実現する。

## 前提（P1-2で実装済み）

- `db_init.gs` - DB初期化（11テーブル）
- `auth.gs` - 認証・認可モジュール
- `audit_log.gs` - 監査ログモジュール
- `drive_init.gs` - Driveフォルダ構成

## アーキテクチャ（3層レイヤ）

```
Controller層（google.script.run対象）
    ↓
Service層（業務ロジック）
    ↓
Repository層（Sheet I/O）
```

## 実装順序

### Step 1: 共通基盤

#### 1.1 utils.gs - ユーティリティ関数
- `generateId(prefix)` - UUID生成（job_xxx, asg_xxx形式）
- `getCurrentTimestamp()` - ISO8601形式の現在時刻
- `validateRequired(obj, fields)` - 必須項目チェック
- `buildResponse(ok, data, error)` - 共通レスポンス構築

#### 1.2 db.gs - DB接続共通
- `getDb()` - 環境に応じたSpreadsheetを取得
- `getSheet(tableName)` - シート取得
- `getHeaders(sheet)` - ヘッダー行取得
- `findRowById(sheet, idColumn, id)` - ID検索

### Step 2: Repository層

#### 2.1 JobRepository.gs
```javascript
const JobRepository = {
  // 単体取得
  findById(jobId) → job | null,

  // 日付検索（ダッシュボード用）
  findByDate(date) → jobs[],

  // 条件検索
  search(query) → jobs[],

  // 作成
  insert(job) → job,

  // 更新（楽観ロック）
  update(job, expectedUpdatedAt) → job | throws CONFLICT_ERROR,

  // 論理削除
  softDelete(jobId) → void,

  // 最大updated_at取得（更新検知用）
  getMaxUpdatedAt(date) → timestamp
}
```

### Step 3: Service層

#### 3.1 JobService.gs
```javascript
const JobService = {
  // 案件取得
  get(jobId) → { job, assignments[] },

  // ダッシュボード取得
  getDashboard(date) → { jobs[], stats },

  // 更新メタ取得
  getDashboardMeta(date) → { maxUpdatedAt },

  // 案件検索
  search(query) → jobs[],

  // 案件保存（新規/更新）
  save(job, expectedUpdatedAt) → job,

  // ステータス更新
  updateStatus(jobId, status, expectedUpdatedAt) → job
}
```

### Step 4: Controller層

#### 4.1 api_jobs.gs
```javascript
// 公開API（google.script.run対象）

// ダッシュボード取得
function getDashboard(date) {
  // 1. 認可チェック
  // 2. 入力検証
  // 3. Service呼び出し
  // 4. レスポンス整形
}

// 更新検知メタ取得
function getDashboardMeta(date) { ... }

// 案件検索
function searchJobs(query) { ... }

// 案件単体取得
function getJob(jobId) { ... }

// 案件保存（新規/更新）
function saveJob(job, expectedUpdatedAt) {
  // 1. 認可チェック（manager以上）
  // 2. 入力検証
  // 3. 競合検知
  // 4. Service呼び出し
  // 5. 監査ログ記録
  // 6. レスポンス整形
}
```

## データ形式

### T_Jobs テーブル構造
| カラム | 型 | 必須 | 説明 |
|--------|-----|------|------|
| job_id | STRING | ○ | 案件ID（主キー・UUID） |
| customer_id | STRING | ○ | 顧客ID（外部キー） |
| site_name | STRING | ○ | 現場名 |
| site_address | STRING | - | 現場住所 |
| work_date | DATE | ○ | 作業日（YYYY-MM-DD） |
| time_slot | STRING | ○ | 時間区分 |
| start_time | TIME | - | 開始時間 |
| required_count | NUMBER | ○ | 必要人数 |
| job_type | STRING | ○ | 作業種別（鳶/揚げ/鳶揚げ） |
| supervisor_name | STRING | - | 担当監督名 |
| order_number | STRING | - | 発注ナンバー |
| branch_office | STRING | - | 営業所 |
| property_code | STRING | - | 物件コード |
| construction_div | STRING | - | 担当工事課 |
| status | STRING | ○ | ステータス |
| notes | STRING | - | 備考 |
| created_at | DATETIME | ○ | 作成日時 |
| created_by | STRING | ○ | 作成者 |
| updated_at | DATETIME | ○ | 更新日時 |
| updated_by | STRING | ○ | 更新者 |
| is_deleted | BOOLEAN | ○ | 論理削除フラグ |

### time_slot 値
- `jotou`: 上棟
- `shuujitsu`: 終日
- `am`: AM
- `pm`: PM
- `yakin`: 夜勤
- `mitei`: 開始時間未定

### status 値
- `pending`: 未配置
- `assigned`: 配置済
- `hold`: 保留
- `completed`: 完了
- `cancelled`: キャンセル

## API仕様

### saveJob(job, expectedUpdatedAt)

#### 入力
```javascript
{
  job: {
    job_id: "job_xxx",  // 新規はnull
    customer_id: "cus_xxx",
    site_name: "〇〇マンション",
    work_date: "2025-12-15",
    time_slot: "am",
    required_count: 3,
    job_type: "揚げ",
    // ... 他フィールド
  },
  expectedUpdatedAt: "2025-12-15T10:00:00+09:00"  // 新規はnull
}
```

#### 出力（成功）
```javascript
{
  ok: true,
  data: { job: { ... } },
  serverTime: "2025-12-15T10:05:00+09:00",
  requestId: "req_xxx"
}
```

#### 出力（失敗）
```javascript
{
  ok: false,
  error: {
    code: "CONFLICT_ERROR",
    message: "他のユーザーによって更新されています",
    details: { currentUpdatedAt: "..." }
  },
  requestId: "req_xxx"
}
```

### getDashboard(date)

#### 入力
```javascript
{ date: "2025-12-15" }
```

#### 出力
```javascript
{
  ok: true,
  data: {
    date: "2025-12-15",
    jobs: [
      {
        job_id: "job_xxx",
        customer_name: "○○建設",
        site_name: "△△マンション",
        time_slot: "am",
        job_type: "揚げ",
        required_count: 3,
        assigned_count: 2,
        status: "assigned",
        staff_names: ["高橋", "田中"]
      }
    ],
    stats: {
      total: 43,
      assigned: 41,
      pending: 2,
      byTimeSlot: {
        jotou: { total: 10, shortage: -2 },
        shuujitsu: { total: 3, shortage: 0 },
        am: { total: 22, shortage: 1 },
        pm: { total: 6, shortage: -1 },
        yakin: { total: 0, shortage: 0 },
        mitei: { total: 2, shortage: 0 }
      }
    }
  },
  serverTime: "2025-12-15T10:00:00+09:00",
  requestId: "req_xxx"
}
```

## ファイル構成（実装後）

```
app/gas/src/
├── config.gs          # 設定
├── utils.gs           # ユーティリティ（新規）
├── db.gs              # DB接続共通（新規）
├── auth.gs            # 認証・認可
├── audit_log.gs       # 監査ログ
├── db_init.gs         # DB初期化
├── drive_init.gs      # Drive初期化
├── repositories/
│   └── JobRepository.gs    # 案件Repository（新規）
├── services/
│   └── JobService.gs       # 案件Service（新規）
└── controllers/
    └── api_jobs.gs         # 案件API（新規）
```

## テスト計画

### 単体テスト
1. JobRepository
   - findById: 存在/非存在/論理削除済み
   - findByDate: 複数件/0件
   - insert: 新規作成
   - update: 正常/競合エラー

2. JobService
   - get: 案件取得
   - getDashboard: 日別取得
   - save: 新規/更新/競合

3. API
   - saveJob: 認可/バリデーション/成功/競合

### 統合テスト
1. 案件新規作成→取得→更新→削除の一連フロー
2. 競合検知（同時編集シナリオ）
3. ダッシュボード取得と件数集計

## 関連ドキュメント

- [06_backend.md](../docs/03_spec/06_backend.md) - バックエンド設計
- [05_database.md](../docs/03_spec/05_database.md) - データベース設計
- [07_frontend.md](../docs/03_spec/07_frontend.md) - フロントエンド設計

## 実装タスク（Linear連携用）

- [ ] KTSM-41: utils.gs - ユーティリティ関数
- [ ] KTSM-42: db.gs - DB接続共通
- [ ] KTSM-43: JobRepository.gs - 案件Repository
- [ ] KTSM-44: JobService.gs - 案件Service
- [ ] KTSM-45: api_jobs.gs - 案件API
- [ ] KTSM-46: 案件管理の単体テスト
- [ ] KTSM-47: 案件管理の統合テスト
