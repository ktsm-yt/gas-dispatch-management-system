# 15. 年度アーカイブ運用

## 15.1 概要

本システムは3月決算（4月〜翌3月を1年度）を前提とし、年度単位でデータをアーカイブする。
アーカイブは**自動実行**され、事前に通知メールが送信される。

---

## 15.2 年度切り替えスケジュール

| 日付 | イベント | 内容 |
|------|----------|------|
| 4月1日 | 新年度開始 | 特に処理なし。現行DBで継続運用 |
| 5月15日 | 事前通知 | 「6月1日にアーカイブされます」メール送信 |
| 5月15日〜31日 | 猶予期間 | 前年度の請求・給与処理を完了させる |
| 6月1日 | 自動アーカイブ | 前年度データを別スプレッドシートに移動 |
| 6月1日 | 完了通知 | 「アーカイブ完了」メール送信 |

---

## 15.3 自動アーカイブの仕組み

### トリガー設定

GASの時間ベーストリガーで毎日実行し、日付に応じて処理を分岐。

```javascript
// Code.gs または Archive.gs
function dailyArchiveCheck() {
  const today = new Date();
  const month = today.getMonth() + 1; // 1-12
  const day = today.getDate();

  // 5月15日: 事前通知
  if (month === 5 && day === 15) {
    sendArchiveWarningEmail();
  }

  // 6月1日: 自動アーカイブ実行
  if (month === 6 && day === 1) {
    executeYearlyArchive();
  }
}
```

### トリガー登録（初回のみ）

```javascript
function setupArchiveTrigger() {
  // 既存トリガーを削除
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => {
    if (t.getHandlerFunction() === 'dailyArchiveCheck') {
      ScriptApp.deleteTrigger(t);
    }
  });

  // 毎日午前3時に実行
  ScriptApp.newTrigger('dailyArchiveCheck')
    .timeBased()
    .everyDays(1)
    .atHour(3)
    .create();
}
```

---

## 15.4 事前通知メール

### 送信タイミング

- **5月15日**（アーカイブ17日前）

### メール内容

**ポイント**: 「アーカイブ」という技術用語は使わず、ユーザーにやってほしいアクションを明確に伝える。

```
件名: 【重要】前年度（3月分まで）の請求・給与処理のご確認

お疲れ様です。{{COMPANY_NAME_SHORT}}システムからのお知らせです。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 6月1日に前年度のデータ整理が行われます
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

6月1日以降、前年度（2024年4月〜2025年3月）のデータは
「過去データ」として別の場所に移動され、編集できなくなります。

それまでに、前年度の請求書発行・給与処理を完了してください。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ 未処理の項目があります ※処理が必要です
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【未発行の請求書】X件
  ・○○建設 様（3月分）
  ・△△工業 様（3月分）

  → 請求管理画面から請求書を発行してください

【未処理の給与】X件
  ・高橋太郎（3月後半分）

  → 給与管理画面から処理を完了してください

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

■ 6月1日以降でも過去データは確認できます
  請求管理・給与管理画面で「過去年度を表示」にチェックを入れると
  前年度のデータを確認できます（確認のみ、変更はできません）

■ ご不明な点があれば
  開発担当までご連絡ください
```

**未処理がない場合のメール:**

```
件名: 【お知らせ】前年度のデータ整理について

お疲れ様です。{{COMPANY_NAME_SHORT}}システムからのお知らせです。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 6月1日に前年度のデータ整理が行われます
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

6月1日以降、前年度（2024年4月〜2025年3月）のデータは
「過去データ」として別の場所に移動され、編集できなくなります。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ 未処理の項目はありません
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

前年度の請求書・給与処理はすべて完了しています。
特に対応は必要ありません。

■ 6月1日以降でも過去データは確認できます
  請求管理・給与管理画面で「過去年度を表示」にチェックを入れると
  前年度のデータを確認できます（確認のみ、変更はできません）
```

### 実装

```javascript
function sendArchiveWarningEmail() {
  const config = getConfig();
  const previousFiscalYear = getCurrentFiscalYear() - 1;

  // 未処理項目チェック
  const pending = checkPendingItemsForYear(previousFiscalYear);

  let body = `6月1日に前年度（${previousFiscalYear}年度）データが自動アーカイブされます。\n\n`;

  body += '■ アーカイブ対象\n';
  body += `・${previousFiscalYear}年4月1日〜${previousFiscalYear + 1}年3月31日の案件・配置データ\n`;
  body += '・上記期間の請求・給与データ\n\n';

  body += '■ 未処理項目チェック\n';

  if (pending.hasItems) {
    body += '⚠️ 以下の未処理項目があります。アーカイブ前に処理を完了してください。\n\n';

    if (pending.unpaidInvoices.length > 0) {
      body += `・未発行請求書: ${pending.unpaidInvoices.length}件\n`;
      pending.unpaidInvoices.slice(0, 5).forEach(inv => {
        body += `  - ${inv.customerName}（${inv.month}月分）\n`;
      });
      if (pending.unpaidInvoices.length > 5) {
        body += `  - 他${pending.unpaidInvoices.length - 5}件\n`;
      }
      body += '\n';
    }

    if (pending.unpaidPayroll.length > 0) {
      body += `・未確定給与: ${pending.unpaidPayroll.length}件\n`;
      pending.unpaidPayroll.slice(0, 5).forEach(pay => {
        body += `  - ${pay.staffName}（${pay.period}）\n`;
      });
      if (pending.unpaidPayroll.length > 5) {
        body += `  - 他${pending.unpaidPayroll.length - 5}件\n`;
      }
      body += '\n';
    }
  } else {
    body += '✅ 未処理項目はありません。\n\n';
  }

  body += '■ アーカイブ後の参照\n';
  body += 'アーカイブ後も、請求管理・給与管理画面から「過去年度を表示」で\n';
  body += '前年度データを参照できます（参照のみ、編集不可）。\n';

  // 管理者メールアドレスに送信
  const recipients = config.ADMIN_EMAILS; // ['{{ADMIN_EMAIL}}']
  MailApp.sendEmail({
    to: recipients.join(','),
    subject: '【{{COMPANY_NAME_SHORT}}システム】年度アーカイブ予告',
    body: body
  });

  // ログ記録
  logToAudit('ARCHIVE_WARNING_SENT', 'System', null, null, {
    fiscalYear: previousFiscalYear,
    pendingItems: pending
  });
}
```

---

## 15.5 自動アーカイブ処理

### 処理フロー

```
1. アーカイブ対象年度の確認
   ↓
2. アーカイブ先スプレッドシートの作成（なければ）
   ↓
3. 各シートのデータを年度でフィルタして移動
   ├── T_Jobs（案件）
   ├── T_JobAssignments（配置）
   ├── T_Invoices（請求）
   ├── T_InvoiceLines（請求明細）
   └── T_Payouts（支払）
   ↓
4. 移動完了後、現行DBから該当データを削除
   ↓
5. 完了通知メール送信
   ↓
6. 監査ログ記録
```

### 実装

```javascript
function executeYearlyArchive() {
  const lock = LockService.getScriptLock();

  try {
    // 長時間処理のためロック取得（最大6分）
    if (!lock.tryLock(10000)) {
      Logger.log('Archive already running');
      return;
    }

    const previousFiscalYear = getCurrentFiscalYear() - 1;
    const archiveStartDate = `${previousFiscalYear}-04-01`;
    const archiveEndDate = `${previousFiscalYear + 1}-03-31`;

    Logger.log(`Starting archive for fiscal year ${previousFiscalYear}`);

    // 1. アーカイブ先スプレッドシート取得/作成
    const archiveDbId = getOrCreateArchiveDb(previousFiscalYear);
    const archiveDb = SpreadsheetApp.openById(archiveDbId);
    const currentDb = SpreadsheetApp.openById(getConfig().DB_SPREADSHEET_ID);

    // 2. 各テーブルをアーカイブ
    const tables = [
      { name: 'T_Jobs', sheetName: '案件', dateColumn: 'work_date' },
      { name: 'T_JobAssignments', sheetName: '配置', dateColumn: 'work_date', joinJob: true },
      { name: 'T_Invoices', sheetName: '請求', dateColumn: 'issue_date' },
      { name: 'T_InvoiceLines', sheetName: '請求明細', dateColumn: 'work_date' },
      { name: 'T_Payouts', sheetName: '支払', dateColumn: 'paid_date' }
    ];

    const results = {};

    tables.forEach(table => {
      const result = archiveTableData(
        currentDb,
        archiveDb,
        table,
        archiveStartDate,
        archiveEndDate
      );
      results[table.name] = result;
      Logger.log(`Archived ${table.name}: ${result.movedCount} rows`);
    });

    // 3. 完了通知
    sendArchiveCompleteEmail(previousFiscalYear, results);

    // 4. 監査ログ
    logToAudit('ARCHIVE_COMPLETED', 'System', null, null, {
      fiscalYear: previousFiscalYear,
      results: results
    });

    Logger.log('Archive completed successfully');

  } catch (e) {
    Logger.log('Archive failed: ' + e.message);
    sendArchiveErrorEmail(e);
    throw e;

  } finally {
    lock.releaseLock();
  }
}

function archiveTableData(currentDb, archiveDb, tableConfig, startDate, endDate) {
  const currentSheet = currentDb.getSheetByName(tableConfig.sheetName);
  let archiveSheet = archiveDb.getSheetByName(tableConfig.sheetName);

  // アーカイブ先シートがなければ作成（ヘッダーコピー）
  if (!archiveSheet) {
    archiveSheet = archiveDb.insertSheet(tableConfig.sheetName);
    const headers = currentSheet.getRange(1, 1, 1, currentSheet.getLastColumn()).getValues();
    archiveSheet.getRange(1, 1, 1, headers[0].length).setValues(headers);
  }

  // データ取得
  const data = currentSheet.getDataRange().getValues();
  const headers = data[0];
  const dateColIndex = headers.indexOf(tableConfig.dateColumn);

  if (dateColIndex === -1) {
    throw new Error(`Date column ${tableConfig.dateColumn} not found in ${tableConfig.sheetName}`);
  }

  // 対象行を抽出
  const rowsToArchive = [];
  const rowsToKeep = [headers]; // ヘッダーは残す

  for (let i = 1; i < data.length; i++) {
    const rowDate = data[i][dateColIndex];
    if (rowDate && isDateInRange(rowDate, startDate, endDate)) {
      rowsToArchive.push(data[i]);
    } else {
      rowsToKeep.push(data[i]);
    }
  }

  // アーカイブ先に追記
  if (rowsToArchive.length > 0) {
    const lastRow = archiveSheet.getLastRow();
    archiveSheet.getRange(lastRow + 1, 1, rowsToArchive.length, rowsToArchive[0].length)
      .setValues(rowsToArchive);
  }

  // 現行DBを上書き（残すデータのみ）
  currentSheet.clear();
  if (rowsToKeep.length > 0) {
    currentSheet.getRange(1, 1, rowsToKeep.length, rowsToKeep[0].length)
      .setValues(rowsToKeep);
  }

  return {
    movedCount: rowsToArchive.length,
    remainingCount: rowsToKeep.length - 1 // ヘッダー除く
  };
}

function isDateInRange(date, startDate, endDate) {
  const d = new Date(date);
  const start = new Date(startDate);
  const end = new Date(endDate);
  return d >= start && d <= end;
}

function getOrCreateArchiveDb(fiscalYear) {
  const props = PropertiesService.getScriptProperties();
  const propKey = `ARCHIVE_DB_${fiscalYear}`;

  let archiveDbId = props.getProperty(propKey);

  if (!archiveDbId) {
    // 新規作成
    const archiveDb = SpreadsheetApp.create(`${getConfig().PROJECT_NAME}-db-${fiscalYear}`);
    archiveDbId = archiveDb.getId();

    // 適切なフォルダに移動
    const folderId = getConfig().ARCHIVE_FOLDER_ID;
    if (folderId) {
      const file = DriveApp.getFileById(archiveDbId);
      const folder = DriveApp.getFolderById(folderId);
      file.moveTo(folder);
    }

    props.setProperty(propKey, archiveDbId);
  }

  return archiveDbId;
}

function getCurrentFiscalYear() {
  const today = new Date();
  const month = today.getMonth() + 1;
  const year = today.getFullYear();
  // 4月〜3月を1年度とする
  return month >= 4 ? year : year - 1;
}
```

---

## 15.6 アーカイブ後の過去年度参照

### UI対応

請求管理・給与管理画面に「過去年度を表示」チェックボックスを追加。

```javascript
// フロントエンド
function loadInvoices(customerId, yearMonth, includeArchive = false) {
  google.script.run
    .withSuccessHandler(onSuccess)
    .getInvoices(customerId, yearMonth, { includeArchive });
}
```

```javascript
// バックエンド
function getInvoices(customerId, yearMonth, options = {}) {
  const results = [];

  // 現行DBから取得
  const currentData = getInvoicesFromDb(getConfig().DB_SPREADSHEET_ID, customerId, yearMonth);
  results.push(...currentData);

  // 過去年度も含める場合
  if (options.includeArchive) {
    const fiscalYear = getFiscalYearFromYearMonth(yearMonth);
    const archiveDbId = PropertiesService.getScriptProperties()
      .getProperty(`ARCHIVE_DB_${fiscalYear}`);

    if (archiveDbId) {
      const archiveData = getInvoicesFromDb(archiveDbId, customerId, yearMonth);
      // アーカイブデータには参照専用フラグを付与
      archiveData.forEach(d => d._archived = true);
      results.push(...archiveData);
    }
  }

  return { ok: true, data: results };
}
```

### 編集制限

アーカイブデータは参照のみ。編集・削除を試みた場合はエラー。

```javascript
function saveInvoice(invoice, expectedUpdatedAt) {
  // アーカイブデータの編集を防止
  if (invoice._archived) {
    return {
      ok: false,
      error: {
        code: 'ARCHIVED_DATA',
        message: '過去年度のデータは編集できません。'
      }
    };
  }

  // 通常の保存処理
  // ...
}
```

---

## 15.7 手動アーカイブ（緊急時）

自動アーカイブを待たずに手動実行する場合。

### 管理画面から実行

```javascript
// 管理者のみ実行可能
function manualArchive(fiscalYear) {
  checkPermission('admin');

  // 確認ダイアログ表示後に実行
  executeYearlyArchive(fiscalYear);
}
```

### アーカイブ延期

6月1日までに処理が間に合わない場合、管理者が延期設定。

```javascript
function postponeArchive(newDate) {
  checkPermission('admin');

  PropertiesService.getScriptProperties()
    .setProperty('ARCHIVE_POSTPONE_DATE', newDate); // '2025-07-01'

  // dailyArchiveCheck内で延期日をチェック
}
```

---

## 15.8 設定値

| 設定 | デフォルト値 | 説明 |
|------|-------------|------|
| 事前通知日 | 5月15日 | アーカイブ予告メール送信日 |
| アーカイブ実行日 | 6月1日 | 自動アーカイブ実行日 |
| 通知先メール | 管理者メール | 通知メールの宛先 |
| アーカイブ先フォルダ | 設定必須 | アーカイブDBの保存先 |

### Config設定例

```javascript
const CONFIG = {
  PROD: {
    // ...
    ADMIN_EMAILS: ['{{ADMIN_EMAIL}}'],
    ARCHIVE_FOLDER_ID: 'xxxxx',
    ARCHIVE_WARNING_DATE: { month: 5, day: 15 },
    ARCHIVE_EXECUTE_DATE: { month: 6, day: 1 }
  }
};
```

---

## 15.9 トラブルシューティング

| 問題 | 原因 | 対処 |
|------|------|------|
| アーカイブが実行されない | トリガー未設定 | `setupArchiveTrigger()`を実行 |
| 通知メールが届かない | メールアドレス設定漏れ | ADMIN_EMAILSを確認 |
| アーカイブが途中で止まる | 6分タイムアウト | データ量を確認、分割処理を検討 |
| 過去年度データが見えない | archiveDbIdの設定漏れ | PropertiesServiceを確認 |

---

## 関連ドキュメント

- [05_database.md](../03_spec/05_database.md) - データベース設計
- [10_implementation_risks.md](../03_spec/10_implementation_risks.md) - 実装リスク（6分制限対策）
- [11_deployment.md](11_deployment.md) - バックアップ/復旧
