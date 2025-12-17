# 9. セキュリティ設計

## 9.1 認証・認可

### 認証方式

- Google Workspaceアカウントによるシングルサインオン
- `Session.getActiveUser()` によるユーザー識別
- 許可ドメインによるアクセス制限

### 認証フロー

```
1. User Access
   Browser ---> GAS Web App

2. Google Auth
   GAS ---> Check Session.getActiveUser()
        |
        +---> No User? ---> Redirect to Google Login
        |
        +---> Has User? ---> Check Domain

3. Domain Check
   User Email ---> @{{WORKSPACE_DOMAIN}}? ---> Allow
                                        |
                                        +---> Deny (Error Page)
```

---

## 9.2 権限管理

| 権限 | ダッシュボード | マスター編集 | 請求・給与 |
|------|----------------|--------------|------------|
| admin（社長） | ○ | ○ | ○ |
| manager（番頭） | ○ | ○ | ○ |
| staff（スタッフ） | △（自分のみ） | × | × |

### 権限チェック実装

```javascript
// Auth.gs
function checkPermission(requiredRole) {
  const user = Session.getActiveUser().getEmail();
  const userRole = getUserRole(user);
  
  const roleHierarchy = {
    'admin': 3,
    'manager': 2,
    'staff': 1
  };
  
  if (roleHierarchy[userRole] < roleHierarchy[requiredRole]) {
    throw new Error('PERMISSION_DENIED');
  }
  
  return true;
}
```

---

## 9.3 監査ログ

全ての更新操作を `T_AuditLog` シートに記録する。

### ログ構造

```javascript
{
  log_id: "uuid-xxxx",
  timestamp: "2025-12-15T10:30:00+09:00",
  user_email: "user@{{WORKSPACE_DOMAIN}}",
  action: "UPDATE",
  table_name: "T_Jobs",
  record_id: "job-uuid-xxxx",
  before_data: "{...}",
  after_data: "{...}"
}
```

### ログ記録関数

```javascript
// Utils.gs
function logToAudit(action, tableName, recordId, beforeData, afterData) {
  const sheet = getSheet('ログ');
  const user = Session.getActiveUser().getEmail();
  
  sheet.appendRow([
    Utilities.getUuid(),
    new Date().toISOString(),
    user,
    action,
    tableName,
    recordId,
    JSON.stringify(beforeData || null),
    JSON.stringify(afterData || null)
  ]);
}
```

---

## 9.4 データ保護

### 同時編集対策

```javascript
function updateWithOptimisticLock(tableName, recordId, data, expectedUpdatedAt) {
  const current = getRecord(tableName, recordId);
  
  if (current.updated_at !== expectedUpdatedAt) {
    return {
      ok: false,
      error: {
        code: 'CONFLICT_ERROR',
        message: '他のユーザーが更新しました。画面を再読み込みしてください。'
      }
    };
  }
  
  // 更新処理
  data.updated_at = new Date().toISOString();
  const updated = updateRecord(tableName, recordId, data);
  return { ok: true, data: updated };
}
```

### バックアップ

- Google Driveの自動バージョン履歴を活用
- 月次で年度別シートにアーカイブ
- 重要操作前に手動バックアップ推奨

---

## 9.5 入力値検証・XSS対策

### サーバサイドバリデーション

**全ての入力値はサーバ側で検証する**（フロントエンドのバリデーションは補助）。

```javascript
// バリデーション関数は 10_implementation_risks.md に詳細記載
function validateJob(job) {
  // 必須項目、形式、範囲のチェック
  // ...
}
```

### XSS対策

GASのHtmlServiceはデフォルトでサニタイズされるが、以下に注意：

| 記法 | 動作 | 使用可否 |
|------|------|----------|
| `<?= value ?>` | HTMLエスケープあり | ユーザー入力に使用可 |
| `<?!= value ?>` | 生出力（エスケープなし） | ユーザー入力に使用禁止 |

```javascript
// 動的にHTML生成する場合のエスケープ関数
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
```

### SQLインジェクション相当の対策

スプレッドシートにはSQLインジェクションは存在しないが、**数式インジェクション**に注意：

```javascript
// 悪い例: ユーザー入力をそのままセルに
sheet.getRange(1, 1).setValue(userInput); // "=IMPORTRANGE(...)" などが実行される

// 良い例: 先頭に ' を付けてテキスト強制
function sanitizeForCell(value) {
  if (typeof value === 'string' && value.startsWith('=')) {
    return "'" + value; // 数式として解釈されない
  }
  return value;
}
```

---

## 9.6 API呼び出し制限

GASにはAPI呼び出し制限がある。通常利用では問題ないが、大量処理時は注意。

| 制限項目 | 制限値（Consumer） |
|----------|-------------------|
| スクリプト実行時間 | 6分/実行 |
| URLフェッチ呼び出し | 20,000/日 |
| メール送信 | 100/日 |
| DriveApp操作 | 制限あり（詳細は公式参照） |

### 対策

- 大量処理は分割実行（10_implementation_risks.md参照）
- 不要なAPI呼び出しを削減
- キャッシュ活用（マスターデータのみ）
