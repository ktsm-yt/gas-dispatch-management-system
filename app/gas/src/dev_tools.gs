/**
 * Development Tools
 *
 * 開発環境専用のDB切り替え・保護ユーティリティ
 */

/**
 * DEV環境に切り替え
 */
function switchToDevDb() {
  PropertiesService.getScriptProperties().setProperty('ENV', 'dev');
  REQUEST_DB_CACHE = null;
  REQUEST_DB_ID_CACHE = null;
  Object.keys(REQUEST_SHEET_CACHE).forEach(k => delete REQUEST_SHEET_CACHE[k]);
  REQUEST_RECORDS_CACHE = {};
}

/**
 * PROD環境に切り替え（参照用）
 */
function switchToProdDb() {
  PropertiesService.getScriptProperties().setProperty('ENV', 'prod');
  REQUEST_DB_CACHE = null;
  REQUEST_DB_ID_CACHE = null;
  Object.keys(REQUEST_SHEET_CACHE).forEach(k => delete REQUEST_SHEET_CACHE[k]);
  REQUEST_RECORDS_CACHE = {};
}

/**
 * ENV切り替えUI用（1回のRPCで本番スクリプト判定+ENV取得）
 * 本番スクリプトなら 'prod-deployment' を返し、UIは非表示にする
 * ENVがprodでもスクリプト自体が開発用なら切り替え可能
 * @returns {string} 'dev' | 'prod' | 'prod-deployment'
 */
function getEnvForSwitcher() {
  var prop = PropertiesService.getScriptProperties();
  var prodScriptId = prop.getProperty('PROD_SCRIPT_ID');
  // 本番スクリプトでは切り替えUI自体を出さない
  if (prodScriptId && ScriptApp.getScriptId() === prodScriptId) {
    return 'prod-deployment';
  }
  return getEnv();
}

/**
 * 現在のDBのシートタブ順を返す
 * @returns {string[]} シート名の配列（現在の並び順）
 */
function getSheetOrder() {
  return getDb().getSheets().map(function(s) { return s.getName(); });
}

/**
 * シートタブを論理的な順番に並べ替え
 * マスター → トランザクション → ログの順
 */
function reorderSheetTabs() {
  var DESIRED_ORDER = [
    'Company',
    'Customers',
    'Staff',
    'Subcontractors',
    'TransportFees',
    'Jobs',
    'JobSlots',
    'Assignments',
    'Invoices',
    'InvoiceLines',
    'InvoiceAdjustments',
    'Payouts',
    'Payments',
    'MonthlyStats',
    'AuditLog'
  ];

  var db = getDb();
  var sheets = db.getSheets();
  var sheetMap = {};
  sheets.forEach(function(s) { sheetMap[s.getName()] = s; });

  var position = 1;
  DESIRED_ORDER.forEach(function(name) {
    var sheet = sheetMap[name];
    if (sheet) {
      sheet.activate();
      db.moveActiveSheet(position);
      position++;
    }
  });

  // DESIRED_ORDERに含まれないシートは末尾に残る
  return getDb().getSheets().map(function(s) { return s.getName(); });
}

/**
 * PROD環境での破壊的操作を防止するガード
 * @param {string} caller - 呼び出し元の関数名
 * @throws {Error} PROD環境の場合
 */
function assertDevEnv(caller) {
  if (getEnv() === 'prod') {
    throw new Error('⚠️ PROD環境では ' + caller + ' の実行は禁止されています');
  }
}

/**
 * 単価種別テーブル(M_PriceTypes/M_CustomPrices)のマイグレーション実行
 * GASエディタから実行可能。冪等（何度実行しても安全）
 */
function runMigratePriceTypeTables() {
  migratePriceTypeTables_();
  Logger.log('migratePriceTypeTables_ 完了');
}

/**
 * getPriceTypeLabelMap のレスポンスをログ出力（デバッグ用）
 */
function debugPriceTypeLabelMap() {
  MasterCache.invalidatePriceTypes();
  var res = getPriceTypeLabelMap();
  Logger.log('Response keys: ' + Object.keys(res));
  Logger.log('res.ok: ' + res.ok);
  if (res.data) {
    Logger.log('Data keys: ' + Object.keys(res.data));
    Logger.log('Data: ' + JSON.stringify(res.data).substring(0, 500));
  } else {
    Logger.log('res.data is null/undefined');
    Logger.log('Full response: ' + JSON.stringify(res).substring(0, 500));
  }
}

/**
 * MasterCacheの全キャッシュをクリア（GASエディタから実行可能）
 */
function clearMasterCache() {
  MasterCache.invalidate();
  Logger.log('MasterCache: 全キャッシュをクリアしました');
}

/**
 * 重複請求書の修復（べき等）
 * 同一 customer_id + billing_year + billing_month で複数の非削除レコードがある場合、
 * 最新の1件を残し、残りを soft delete する。
 *
 * @param {boolean} dryRun - true: ログ出力のみ（変更なし）, false: 実際に修正
 * @returns {Object} { duplicateGroups, toDelete, deleted, manualReview }
 */
function fixDuplicateInvoices(dryRun) {
  if (dryRun === undefined) dryRun = true;

  var env = getEnv();
  Logger.log('=== fixDuplicateInvoices ===');
  Logger.log('ENV: ' + env);
  Logger.log('dryRun: ' + dryRun);
  Logger.log('scriptId: ' + ScriptApp.getScriptId());

  // 1. 全非削除レコードを取得
  var allInvoices = getAllRecords('T_Invoices', { includeDeleted: false });
  Logger.log('Total active invoices: ' + allInvoices.length);

  // 2. customer_id + billing_year + billing_month でグループ化
  var groups = {};
  for (var i = 0; i < allInvoices.length; i++) {
    var inv = allInvoices[i];
    var key = inv.customer_id + '_' + inv.billing_year + '_' + inv.billing_month;
    if (!groups[key]) groups[key] = [];
    groups[key].push(inv);
  }

  // 3. 重複グループ（2件以上）を抽出
  var duplicateGroups = [];
  var keys = Object.keys(groups);
  for (var k = 0; k < keys.length; k++) {
    if (groups[keys[k]].length >= 2) {
      duplicateGroups.push({ key: keys[k], invoices: groups[keys[k]] });
    }
  }
  Logger.log('Duplicate groups: ' + duplicateGroups.length);

  if (duplicateGroups.length === 0) {
    Logger.log('No duplicates found. Nothing to do.');
    return { duplicateGroups: 0, toDelete: 0, deleted: 0, manualReview: 0 };
  }

  // 4. Payment に紐づく invoice_id を事前チェック
  var allPayments = getAllRecords('T_Payments', { includeDeleted: false });
  var paymentInvoiceIds = {};
  for (var p = 0; p < allPayments.length; p++) {
    if (allPayments[p].invoice_id) {
      paymentInvoiceIds[allPayments[p].invoice_id] = true;
    }
  }

  // 5. 各グループで保持対象を決定
  var ACTIVE_STATUSES = { sent: true, paid: true, unpaid: true };
  var autoDeleteIds = [];
  var manualReviewList = [];

  for (var g = 0; g < duplicateGroups.length; g++) {
    var group = duplicateGroups[g];
    var invoices = group.invoices.slice();

    // ソート: 業務優先度で保持対象を決定
    invoices.sort(function(a, b) {
      // 優先1: アクティブステータス (sent/paid/unpaid)
      var aActive = ACTIVE_STATUSES[a.status] ? 1 : 0;
      var bActive = ACTIVE_STATUSES[b.status] ? 1 : 0;
      if (bActive !== aActive) return bActive - aActive;

      // 優先2: ファイル出力済み
      var aFile = (a.pdf_file_id || a.excel_file_id) ? 1 : 0;
      var bFile = (b.pdf_file_id || b.excel_file_id) ? 1 : 0;
      if (bFile !== aFile) return bFile - aFile;

      // 優先3: updated_at 降順
      var aTime = a.updated_at ? new Date(a.updated_at).getTime() : 0;
      var bTime = b.updated_at ? new Date(b.updated_at).getTime() : 0;
      if (bTime !== aTime) return bTime - aTime;

      // 優先4: created_at 降順
      var aCtime = a.created_at ? new Date(a.created_at).getTime() : 0;
      var bCtime = b.created_at ? new Date(b.created_at).getTime() : 0;
      return bCtime - aCtime;
    });

    var keep = invoices[0];
    var toDelete = invoices.slice(1);

    Logger.log('--- Group: ' + group.key + ' (' + invoices.length + ' records) ---');
    Logger.log('  KEEP: ' + keep.invoice_id + ' status=' + keep.status + ' pdf=' + (keep.pdf_file_id || 'none') + ' updated=' + keep.updated_at);

    for (var d = 0; d < toDelete.length; d++) {
      var del = toDelete[d];
      var hasActiveStatus = !!ACTIVE_STATUSES[del.status];
      var hasFile = !!(del.pdf_file_id || del.excel_file_id);
      var hasPayment = !!paymentInvoiceIds[del.invoice_id];

      // 安全フィルタ: アクティブステータス / ファイルID / Payment紐づきは手動確認
      if (hasActiveStatus || hasFile || hasPayment) {
        manualReviewList.push({
          invoiceId: del.invoice_id,
          customerId: del.customer_id,
          status: del.status,
          hasFile: hasFile,
          hasPayment: hasPayment,
          reason: (hasActiveStatus ? 'ACTIVE_STATUS ' : '') + (hasFile ? 'HAS_FILE ' : '') + (hasPayment ? 'HAS_PAYMENT' : '')
        });
        Logger.log('  MANUAL_REVIEW: ' + del.invoice_id + ' status=' + del.status + ' pdf=' + (del.pdf_file_id || 'none') + ' reason=' + manualReviewList[manualReviewList.length - 1].reason);
      } else {
        autoDeleteIds.push(del.invoice_id);
        Logger.log('  AUTO_DELETE: ' + del.invoice_id + ' status=' + del.status + ' pdf=' + (del.pdf_file_id || 'none'));
      }
    }
  }

  Logger.log('=== Summary ===');
  Logger.log('Duplicate groups: ' + duplicateGroups.length);
  Logger.log('Auto-delete candidates: ' + autoDeleteIds.length);
  Logger.log('Manual review required: ' + manualReviewList.length);

  // 6. dryRun でなければ実行
  var deleted = 0;
  if (!dryRun && autoDeleteIds.length > 0) {
    // InvoiceLines も同時に soft delete
    var lineResult = InvoiceLineRepository.bulkDeleteByInvoiceIds(autoDeleteIds);
    Logger.log('InvoiceLines deleted: ' + lineResult.deleted);

    var invResult = InvoiceRepository.bulkSoftDelete(autoDeleteIds);
    deleted = invResult.deleted;
    Logger.log('Invoices deleted: ' + deleted);
  } else if (!dryRun) {
    Logger.log('No auto-deletable candidates. Only manual review items exist.');
  } else {
    Logger.log('DRY RUN — no changes made. Run fixDuplicateInvoices(false) to execute.');
  }

  var result = {
    duplicateGroups: duplicateGroups.length,
    toDelete: autoDeleteIds.length,
    deleted: deleted,
    manualReview: manualReviewList.length,
    manualReviewList: manualReviewList
  };
  Logger.log('Result: ' + JSON.stringify(result));
  return result;
}

/**
 * InvoiceLine の work_date 欠落をバックフィル
 * _generateLines のグルーピングバグで空になった行を job_id から自動修復
 * 実行後、関数を削除すること
 */
function backfillInvoiceLineWorkDates() {
  var lineSheet = getSheet('T_InvoiceLines');
  var lineData = lineSheet.getDataRange().getValues();
  var lineHeaders = lineData[0];
  var lineIdCol = lineHeaders.indexOf('line_id');
  var workDateCol = lineHeaders.indexOf('work_date');
  var jobIdCol = lineHeaders.indexOf('job_id');

  // Jobs シートから job_id → work_date マップを作成
  var jobSheet = getSheet('T_Jobs');
  var jobData = jobSheet.getDataRange().getValues();
  var jobHeaders = jobData[0];
  var jIdCol = jobHeaders.indexOf('job_id');
  var jWdCol = jobHeaders.indexOf('work_date');
  var jobDateMap = {};
  for (var j = 1; j < jobData.length; j++) {
    jobDateMap[jobData[j][jIdCol]] = jobData[j][jWdCol];
  }

  Logger.log('Total lines: ' + (lineData.length - 1));

  var skipped = 0;
  var updated = 0;
  var noJob = 0;
  for (var i = 1; i < lineData.length; i++) {
    var currentWd = lineData[i][workDateCol];
    if (currentWd && String(currentWd).trim() !== '') {
      skipped++;
      continue;
    }
    var jid = lineData[i][jobIdCol];
    if (!jid || !jobDateMap[jid]) {
      noJob++;
      Logger.log('NO_JOB: row=' + (i+1) + ' line_id=' + lineData[i][lineIdCol] + ' job_id=' + jid);
      continue;
    }
    var wd = jobDateMap[jid];
    var wdStr = (wd instanceof Date) ? Utilities.formatDate(wd, 'Asia/Tokyo', 'yyyy-MM-dd') : String(wd);
    lineSheet.getRange(i + 1, workDateCol + 1).setValue(wdStr);
    updated++;
    Logger.log('UPDATED: row=' + (i+1) + ' ' + lineData[i][lineIdCol] + ' → ' + wdStr);
  }
  Logger.log('Done. skipped=' + skipped + ' updated=' + updated + ' noJob=' + noJob);
}
