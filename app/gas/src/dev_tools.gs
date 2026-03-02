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
}

/**
 * PROD環境に切り替え（参照用）
 */
function switchToProdDb() {
  PropertiesService.getScriptProperties().setProperty('ENV', 'prod');
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
