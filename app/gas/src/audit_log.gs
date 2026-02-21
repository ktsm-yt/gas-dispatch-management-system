/**
 * Audit Log Module
 *
 * KTSM-40: 監査ログ実装
 *
 * 全ての更新操作を T_AuditLog シートに記録する
 */

/**
 * 操作アクションの定義
 */
/**
 * 機密フィールド定義（監査ログ記録時にマスクする）
 * - partial: 末尾4桁のみ表示（例: ****5678）
 * - full: 完全マスク（例: ***）
 */
const SENSITIVE_FIELDS = {
  partial: ['bank_account_number', 'pension_number'],
  full: [
    'daily_rate_tobi', 'daily_rate_age', 'daily_rate_tobiage', 'daily_rate_half',
    'unit_price_basic', 'unit_price_tobi', 'unit_price_age', 'unit_price_tobiage',
    'unit_price_half', 'unit_price_fullday', 'unit_price_night'
  ]
};

/**
 * 機密データをマスクする（監査ログ用）
 * ディープコピーで元データを非変異に保つ
 * @param {Object} data - マスク対象データ
 * @returns {Object} マスク済みデータ（元データは変更されない）
 */
function maskPartial(value) {
  var str = String(value);
  if (str.length <= 4) return '****';
  return '****' + str.slice(-4);
}

function maskSensitiveData(data) {
  if (!data || typeof data !== 'object') return data;

  var masked = JSON.parse(JSON.stringify(data));

  for (var i = 0; i < SENSITIVE_FIELDS.partial.length; i++) {
    var partialField = SENSITIVE_FIELDS.partial[i];
    if (masked[partialField] != null && masked[partialField] !== '') {
      masked[partialField] = maskPartial(masked[partialField]);
    }
  }

  for (var j = 0; j < SENSITIVE_FIELDS.full.length; j++) {
    var fullField = SENSITIVE_FIELDS.full[j];
    if (masked[fullField] != null && masked[fullField] !== '') {
      masked[fullField] = '***';
    }
  }

  return masked;
}

const AUDIT_ACTIONS = {
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  LOGIN: 'LOGIN',
  EXPORT: 'EXPORT'
};

/**
 * 監査ログシートを取得
 * @returns {GoogleAppsScript.Spreadsheet.Sheet} ログシート
 */
function getAuditLogSheet() {
  return getSheet('T_AuditLog');
}

/**
 * UUIDを生成
 * @returns {string} UUID
 */
function generateUuid() {
  return Utilities.getUuid();
}

/**
 * 監査ログを記録
 * @param {string} action - 操作（CREATE/UPDATE/DELETE/LOGIN/EXPORT）
 * @param {string} tableName - 対象テーブル名
 * @param {string} recordId - 対象レコードID
 * @param {Object} beforeData - 変更前データ（省略可）
 * @param {Object} afterData - 変更後データ（省略可）
 * @returns {Object} 記録したログ情報
 */
function logToAudit(action, tableName, recordId, beforeData, afterData) {
  try {
    const sheet = getAuditLogSheet();
    const user = getCurrentUserEmail();
    const timestamp = new Date().toISOString();
    const logId = generateUuid();

    const logEntry = [
      logId,
      timestamp,
      user,
      action,
      tableName,
      recordId,
      beforeData ? JSON.stringify(maskSensitiveData(beforeData)) : '',
      afterData ? JSON.stringify(maskSensitiveData(afterData)) : ''
    ];

    const startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, 1, logEntry.length).setValues([logEntry]);

    return {
      log_id: logId,
      timestamp: timestamp,
      user_email: user,
      action: action,
      table_name: tableName,
      record_id: recordId
    };

  } catch (error) {
    // ログ記録の失敗は本体処理に影響させない
    Logger.log(`監査ログ記録エラー: ${error.message}`);
    return null;
  }
}

/**
 * 監査ログを一括記録
 * @param {Object[]} logs - ログ配列
 * @returns {Object[]|null} 記録したログ情報の配列（失敗時はnull）
 */
function logBatch(logs) {
  if (!logs || logs.length === 0) {
    return [];
  }

  try {
    const sheet = getAuditLogSheet();
    const user = getCurrentUserEmail();

    const rows = [];
    const results = [];

    for (const log of logs) {
      const timestamp = new Date().toISOString();
      const logId = generateUuid();

      rows.push([
        logId,
        timestamp,
        user,
        log.action,
        log.table_name,
        log.record_id,
        log.before ? JSON.stringify(maskSensitiveData(log.before)) : '',
        log.after ? JSON.stringify(maskSensitiveData(log.after)) : ''
      ]);

      results.push({
        log_id: logId,
        timestamp: timestamp,
        user_email: user,
        action: log.action,
        table_name: log.table_name,
        record_id: log.record_id
      });
    }

    const startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, rows.length, rows[0].length).setValues(rows);

    return results;

  } catch (error) {
    // ログ記録の失敗は本体処理に影響させない
    Logger.log(`監査ログ一括記録エラー: ${error.message}`);
    return null;
  }
}

/**
 * CREATE操作のログを記録
 * @param {string} tableName - テーブル名
 * @param {string} recordId - レコードID
 * @param {Object} data - 作成したデータ
 */
function logCreate(tableName, recordId, data) {
  return logToAudit(AUDIT_ACTIONS.CREATE, tableName, recordId, null, data);
}

/**
 * CREATE操作のログを一括記録（バルク版）
 * @param {string} tableName - テーブル名
 * @param {Object[]} records - レコード配列 [{ recordId, data }, ...]
 * @returns {Object[]|null} 記録したログ情報の配列
 */
function logCreateBulk(tableName, records) {
  if (!records || records.length === 0) {
    return [];
  }
  const logs = records.map(r => ({
    action: AUDIT_ACTIONS.CREATE,
    table_name: tableName,
    record_id: r.recordId,
    before: null,
    after: r.data
  }));
  return logBatch(logs);
}

/**
 * UPDATE操作のログを一括記録（バルク版）
 * @param {string} tableName - テーブル名
 * @param {Object[]} records - レコード配列 [{ recordId, before, after }, ...]
 * @returns {Object[]|null} 記録したログ情報の配列
 */
function logUpdateBulk(tableName, records) {
  if (!records || records.length === 0) {
    return [];
  }
  const logs = records.map(r => ({
    action: AUDIT_ACTIONS.UPDATE,
    table_name: tableName,
    record_id: r.recordId,
    before: r.before,
    after: r.after
  }));
  return logBatch(logs);
}

/**
 * UPDATE操作のログを記録
 * @param {string} tableName - テーブル名
 * @param {string} recordId - レコードID
 * @param {Object} beforeData - 変更前データ
 * @param {Object} afterData - 変更後データ
 */
function logUpdate(tableName, recordId, beforeData, afterData) {
  return logToAudit(AUDIT_ACTIONS.UPDATE, tableName, recordId, beforeData, afterData);
}

/**
 * DELETE操作のログを記録
 * @param {string} tableName - テーブル名
 * @param {string} recordId - レコードID
 * @param {Object} data - 削除したデータ
 */
function logDelete(tableName, recordId, data) {
  return logToAudit(AUDIT_ACTIONS.DELETE, tableName, recordId, data, null);
}

/**
 * LOGIN操作のログを記録
 */
function logLogin() {
  const user = Session.getActiveUser().getEmail();
  return logToAudit(AUDIT_ACTIONS.LOGIN, 'SESSION', user, null, { login_time: new Date().toISOString() });
}

/**
 * EXPORT操作のログを記録
 * @param {string} exportType - エクスポート種別（PDF/EXCEL/CSV等）
 * @param {string} targetInfo - 対象情報（請求書番号等）
 */
function logExport(exportType, targetInfo) {
  return logToAudit(AUDIT_ACTIONS.EXPORT, exportType, targetInfo, null, { exported_at: new Date().toISOString() });
}

/**
 * 監査ログを検索
 * @param {Object} options - 検索オプション
 * @param {string} options.action - 操作で絞り込み
 * @param {string} options.tableName - テーブル名で絞り込み
 * @param {string} options.userEmail - ユーザーで絞り込み
 * @param {Date} options.fromDate - 開始日
 * @param {Date} options.toDate - 終了日
 * @param {number} options.limit - 取得件数（デフォルト100）
 * @returns {Array} ログエントリの配列
 */
function searchAuditLogs(options = {}) {
  // 認可チェック: 監査ログ閲覧は管理者以上
  const authResult = checkPermission(ROLES.MANAGER);
  if (!authResult.allowed) {
    throw new Error('PERMISSION_DENIED: 監査ログの閲覧には管理者以上の権限が必要です');
  }

  try {
  const sheet = getAuditLogSheet();
  const totalRows = sheet.getLastRow();

  if (totalRows <= 1) {
    return []; // ヘッダーのみ
  }

  // ヘッダー取得
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  // 最新 maxRows 行のみ取得（パフォーマンス最適化）
  const limit = options.limit || 100;
  const maxRows = Math.min(totalRows - 1, limit * 3); // フィルタ余裕を持って3倍取得
  const startRow = Math.max(2, totalRows - maxRows + 1);
  const dataRows = sheet.getRange(startRow, 1, totalRows - startRow + 1, headers.length).getValues();

  let logs = dataRows.map(row => {
    const log = {};
    headers.forEach((header, index) => {
      log[header] = row[index];
    });
    return log;
  });

  // フィルタリング
  if (options.action) {
    logs = logs.filter(log => log.action === options.action);
  }

  if (options.tableName) {
    logs = logs.filter(log => log.table_name === options.tableName);
  }

  if (options.userEmail) {
    logs = logs.filter(log => log.user_email === options.userEmail);
  }

  if (options.fromDate) {
    const fromTime = new Date(options.fromDate).getTime();
    logs = logs.filter(log => new Date(log.timestamp).getTime() >= fromTime);
  }

  if (options.toDate) {
    const toTime = new Date(options.toDate).getTime();
    logs = logs.filter(log => new Date(log.timestamp).getTime() <= toTime);
  }

  // 新しい順にソート
  logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  // 件数制限（limitはL302で定義済み）
  return logs.slice(0, limit);

  } catch (error) {
    Logger.log(`searchAuditLogs error: ${error.message}`);
    return [];
  }
}

/**
 * 最新の監査ログを取得
 * @param {number} count - 取得件数（デフォルト10）
 * @returns {Array} ログエントリの配列
 */
function getRecentAuditLogs(count = 10) {
  return searchAuditLogs({ limit: count });
}

/**
 * 特定レコードの変更履歴を取得
 * @param {string} tableName - テーブル名
 * @param {string} recordId - レコードID
 * @returns {Array} ログエントリの配列
 */
function getRecordHistory(tableName, recordId) {
  // 認可チェック: 変更履歴閲覧は管理者以上
  const authResult = checkPermission(ROLES.MANAGER);
  if (!authResult.allowed) {
    throw new Error('PERMISSION_DENIED: 変更履歴の閲覧には管理者以上の権限が必要です');
  }

  try {
  const sheet = getAuditLogSheet();
  const totalRows = sheet.getLastRow();

  if (totalRows <= 1) {
    return [];
  }

  const numCols = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, numCols).getValues()[0];

  // 最新 5000 行に限定（レコード履歴は通常少ないが、全件スキャン回避）
  const maxScanRows = Math.min(totalRows - 1, 5000);
  const startRow = Math.max(2, totalRows - maxScanRows + 1);
  const dataRows = sheet.getRange(startRow, 1, totalRows - startRow + 1, numCols).getValues();

  // ヘッダーから列インデックスを動的取得（マジックナンバー排除）
  const tableNameCol = headers.indexOf('table_name');
  const recordIdCol = headers.indexOf('record_id');

  const logs = dataRows
    .filter(row => row[tableNameCol] === tableName && row[recordIdCol] === recordId)
    .map(row => {
      const log = {};
      headers.forEach((header, index) => {
        log[header] = row[index];
      });
      // JSONを解析
      if (log.before_data) {
        try { log.before_data = JSON.parse(log.before_data); } catch (_e) { /* non-JSON is kept as-is */ }
      }
      if (log.after_data) {
        try { log.after_data = JSON.parse(log.after_data); } catch (_e) { /* non-JSON is kept as-is */ }
      }
      return log;
    });

  // 時系列順にソート（古い順）
  logs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  return logs;

  } catch (error) {
    Logger.log(`getRecordHistory error: ${error.message}`);
    return [];
  }
}

/**
 * 監査ログのテスト
 */
function testAuditLog() {
  Logger.log('=== 監査ログテスト ===');

  // テストデータ
  const testRecordId = 'test-' + generateUuid().substring(0, 8);

  // CREATE
  const createLog = logCreate('M_Customers', testRecordId, {
    company_name: 'テスト株式会社',
    created_at: new Date().toISOString()
  });
  Logger.log(`CREATE: ${JSON.stringify(createLog)}`);

  // UPDATE
  const updateLog = logUpdate('M_Customers', testRecordId,
    { company_name: 'テスト株式会社' },
    { company_name: 'テスト株式会社（更新）' }
  );
  Logger.log(`UPDATE: ${JSON.stringify(updateLog)}`);

  // DELETE
  const deleteLog = logDelete('M_Customers', testRecordId, {
    company_name: 'テスト株式会社（更新）',
    deleted_at: new Date().toISOString()
  });
  Logger.log(`DELETE: ${JSON.stringify(deleteLog)}`);

  // 最新ログ取得
  Logger.log('\n最新5件のログ:');
  const recentLogs = getRecentAuditLogs(5);
  recentLogs.forEach(log => {
    Logger.log(`  ${log.timestamp} | ${log.action} | ${log.table_name} | ${log.user_email}`);
  });

  // レコード履歴取得
  Logger.log(`\nレコード ${testRecordId} の履歴:`);
  const history = getRecordHistory('M_Customers', testRecordId);
  history.forEach(log => {
    Logger.log(`  ${log.timestamp} | ${log.action}`);
  });

  Logger.log('\n✓ 監査ログテスト完了');
}
