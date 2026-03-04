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
 * MasterCacheの全キャッシュをクリア（GASエディタから実行可能）
 */
function clearMasterCache() {
  MasterCache.invalidate();
  Logger.log('MasterCache: 全キャッシュをクリアしました');
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
