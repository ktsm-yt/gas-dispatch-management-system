# 12. コーディング規約

## 12.1 命名規則

| 対象 | 規則 | 例 |
|------|------|-----|
| 関数名 | camelCase, 動詞始まり | `getJobById`, `createCustomer` |
| 変数名 | camelCase | `jobList`, `currentUser` |
| 定数 | UPPER_SNAKE_CASE | `MAX_RESULTS`, `API_VERSION` |
| クラス名 | PascalCase | `JobService`, `CustomerData` |
| HTMLファイル | kebab-case | `job-edit-modal.html` |
| シート名 | 日本語 | 顧客, スタッフ, 案件 |
| カラム名 | snake_case | `customer_id`, `job_date` |

---

## 12.2 コメント規約

### 関数コメント（JSDoc形式）

```javascript
/**
 * ダッシュボード（対象日）を取得する
 * @param {string} date - 対象日（YYYY-MM-DD）
 * @returns {Object} { ok: boolean, data: { jobs: Job[], assignments: Assignment[] }, requestId: string }
 */
 function getDashboard(date) {
  // 実装
}
```

### インラインコメント

```javascript
// 良い例: WHYを説明
// NGスタッフを除外するため、顧客IDでフィルタ
const availableStaff = staff.filter(s => !s.ngCustomers.includes(customerId));

// 悪い例: WHATを説明（コードを読めばわかる）
// スタッフをフィルタする
const availableStaff = staff.filter(s => !s.ngCustomers.includes(customerId));
```

---

## 12.3 コード構造

### ファイル構成

```javascript
// 1. 定数定義
const SHEET_NAME = '案件';
const JOB_STATUS = {
  OPEN: 'OPEN',
  HOLD: 'HOLD',
  CANCELLED: 'CANCELLED'
};

// 2. メイン関数（外部公開）
function getDashboard(date) { ... }
function saveJob(job, expectedUpdatedAt) { ... }

// 3. ヘルパー関数（内部用）
function validateJobData_(data) { ... }
function formatJobResponse_(row) { ... }
```

### 関数の長さ

- 1関数50行以内を目安
- 複雑な処理は小さな関数に分割

---

## 12.4 エラーハンドリング

### 基本パターン

```javascript
function apiHandler_(fn) {
  return function (...args) {
    const requestId = `req_${Utilities.getUuid()}`;
    try {
      const result = fn.apply(this, args);
      return {
        ok: true,
        data: result,
        serverTime: new Date().toISOString(),
        requestId
      };
    } catch (e) {
      Logger.log(`Error in ${fn.name}: ${e.message}`);
      logToAudit('ERROR', fn.name, null, null, { error: e.message, requestId });
      return {
        ok: false,
        error: {
          code: e.name || 'SYSTEM_ERROR',
          message: e.message
        },
        requestId
      };
    }
  };
}

// 使用例
const getDashboardSafe = apiHandler_(getDashboard);
```

### カスタムエラー

```javascript
class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'VALIDATION_ERROR';
  }
}

class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NOT_FOUND';
  }
}

// 使用例
if (!data.customer_id) {
  throw new ValidationError('顧客IDは必須です');
}
```

---

## 12.5 データベース操作

### 読み取り

```javascript
function getRecords(sheetName, filters = {}) {
  const sheet = SpreadsheetApp
    .openById(getConfig().DB_SPREADSHEET_ID)
    .getSheetByName(sheetName);
  
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const rows = data.slice(1);
  
  return rows
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => obj[h] = row[i]);
      return obj;
    })
    .filter(row => {
      // フィルタ適用
      return Object.entries(filters).every(([key, value]) => 
        row[key] === value
      );
    });
}
```

### 書き込み

```javascript
function appendRecord(sheetName, data) {
  const sheet = getSheet(sheetName);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  
  const row = headers.map(h => data[h] || '');
  sheet.appendRow(row);
  
  logToAudit('CREATE', sheetName, data.id, null, data);
  return data;
}
```

---

## 12.6 フロントエンド規約

### HTML

```html
<!-- コンポーネント単位でコメント -->
<!-- Job Card -->
<div class="job-card" data-job-id="<?= jobId ?>">
  ...
</div>
```

### JavaScript

```javascript
// グローバル変数は最小限に
const App = {
  state: {
    currentDate: null,
    jobs: []
  },
  
  init() {
    this.bindEvents();
    this.loadData();
  },
  
  bindEvents() {
    document.getElementById('btn-save')
      .addEventListener('click', () => this.save());
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
```

### CSS

```css
/* BEM命名規則 */
.job-card { }
.job-card__header { }
.job-card__body { }
.job-card--pending { }
.job-card--assigned { }
```
