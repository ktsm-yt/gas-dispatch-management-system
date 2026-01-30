/**
 * Database Connection Module
 *
 * DB接続・シート操作の共通処理
 */

/**
 * テーブル名とシート名のマッピング
 */
const TABLE_SHEET_MAP = {
  'M_Customers': '顧客',
  'M_Staff': 'スタッフ',
  'M_Subcontractors': '外注先',
  'M_TransportFee': '交通費',
  'M_Company': '自社情報',
  'T_Jobs': '案件',
  'T_JobSlots': '案件枠',  // 枠システム用
  'T_JobAssignments': '配置',
  'T_Invoices': '請求',
  'T_InvoiceLines': '請求明細',
  'T_Payouts': '支払',
  'T_MonthlyStats': '月次統計',  // P2-6: 売上分析ダッシュボード用
  'T_Payments': '入金記録',  // P2: 入金管理機能
  'T_AuditLog': 'ログ'
};

/**
 * DB Spreadsheetを取得
 * @returns {GoogleAppsScript.Spreadsheet.Spreadsheet} Spreadsheetオブジェクト
 */
function getDb() {
  const prop = PropertiesService.getScriptProperties();
  const env = prop.getProperty('ENV') || 'dev';
  const spreadsheetId = env === 'prod'
    ? prop.getProperty('SPREADSHEET_ID_PROD')
    : prop.getProperty('SPREADSHEET_ID_DEV');

  if (!spreadsheetId) {
    throw new Error(`DB Spreadsheet ID が設定されていません (ENV=${env})`);
  }

  return SpreadsheetApp.openById(spreadsheetId);
}

/**
 * 現在の環境を取得
 * @returns {string} 環境名（dev/prod）
 */
function getEnv() {
  const prop = PropertiesService.getScriptProperties();
  return prop.getProperty('ENV') || 'dev';
}

/**
 * シートを取得
 * @param {string} tableName - テーブル名（M_Customers, T_Jobs等）
 * @returns {GoogleAppsScript.Spreadsheet.Sheet} シートオブジェクト
 */
function getSheet(tableName) {
  const sheetName = TABLE_SHEET_MAP[tableName];
  if (!sheetName) {
    throw new Error(`不明なテーブル名: ${tableName}`);
  }

  const db = getDb();
  const sheet = db.getSheetByName(sheetName);

  if (!sheet) {
    throw new Error(`シートが見つかりません: ${sheetName}`);
  }

  return sheet;
}

/**
 * シートのヘッダー行を取得
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - シート
 * @returns {string[]} ヘッダー配列
 */
function getHeaders(sheet) {
  const lastCol = sheet.getLastColumn();
  if (lastCol === 0) return [];
  return sheet.getRange(1, 1, 1, lastCol).getValues()[0];
}

/**
 * ヘッダーとカラムインデックスのマップを取得
 * @param {string[]} headers - ヘッダー配列
 * @returns {Object} { columnName: index, ... }
 */
function getColumnMap(headers) {
  const map = {};
  headers.forEach((header, index) => {
    map[header] = index;
  });
  return map;
}

/**
 * IDでレコードの行番号を検索
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - シート
 * @param {string} idColumn - IDカラム名
 * @param {string} id - 検索するID
 * @returns {number|null} 行番号（1-indexed）、見つからない場合はnull
 */
function findRowById(sheet, idColumn, id) {
  const headers = getHeaders(sheet);
  const columnMap = getColumnMap(headers);
  const idColIndex = columnMap[idColumn];

  if (idColIndex === undefined) {
    throw new Error(`カラムが見つかりません: ${idColumn}`);
  }

  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return null; // ヘッダーのみ
  }

  const data = sheet.getRange(2, idColIndex + 1, lastRow - 1, 1).getValues();

  for (let i = 0; i < data.length; i++) {
    if (data[i][0] === id) {
      return i + 2; // 1-indexed + ヘッダー行
    }
  }

  return null;
}

/**
 * 行データをオブジェクトに変換
 * @param {string[]} headers - ヘッダー配列
 * @param {Array} row - 行データ配列
 * @returns {Object} オブジェクト
 */
function rowToObject(headers, row) {
  const obj = {};
  headers.forEach((header, index) => {
    obj[header] = row[index];
  });
  return obj;
}

/**
 * オブジェクトを行データに変換
 * @param {string[]} headers - ヘッダー配列
 * @param {Object} obj - オブジェクト
 * @returns {Array} 行データ配列
 */
function objectToRow(headers, obj) {
  return headers.map(header => {
    const value = obj[header];
    return value !== undefined ? value : '';
  });
}

/**
 * 全データを取得（論理削除を除外）
 * @param {string} tableName - テーブル名
 * @param {Object} options - オプション
 * @param {boolean} options.includeDeleted - 論理削除済みを含むか
 * @returns {Object[]} レコード配列
 */
function getAllRecords(tableName, options = {}) {
  const sheet = getSheet(tableName);
  const lastRow = sheet.getLastRow();

  if (lastRow <= 1) {
    return []; // ヘッダーのみ
  }

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const columnMap = getColumnMap(headers);
  const isDeletedIndex = columnMap['is_deleted'];

  let records = data.slice(1).map(row => rowToObject(headers, row));

  // 論理削除済みを除外
  if (!options.includeDeleted && isDeletedIndex !== undefined) {
    records = records.filter(record => !record.is_deleted);
  }

  return records;
}

/**
 * IDで単一レコードを取得
 * @param {string} tableName - テーブル名
 * @param {string} idColumn - IDカラム名
 * @param {string} id - ID
 * @returns {Object|null} レコードまたはnull
 */
function getRecordById(tableName, idColumn, id) {
  const sheet = getSheet(tableName);
  const rowNum = findRowById(sheet, idColumn, id);

  if (!rowNum) {
    return null;
  }

  const headers = getHeaders(sheet);
  const row = sheet.getRange(rowNum, 1, 1, headers.length).getValues()[0];

  const record = rowToObject(headers, row);

  // 論理削除済みはnullを返す
  if (record.is_deleted) {
    return null;
  }

  return record;
}

/**
 * レコードを挿入
 * @param {string} tableName - テーブル名
 * @param {Object} record - レコードオブジェクト
 * @returns {Object} 挿入したレコード
 */
function insertRecord(tableName, record) {
  const sheet = getSheet(tableName);
  const headers = getHeaders(sheet);
  const row = objectToRow(headers, record);

  sheet.appendRow(row);

  return record;
}

/**
 * レコードを一括挿入
 * @param {string} tableName - テーブル名
 * @param {Object[]} records - レコード配列
 * @returns {Object[]} 挿入したレコード配列
 */
function insertRecords(tableName, records) {
  if (!records || records.length === 0) {
    return [];
  }

  const sheet = getSheet(tableName);
  const headers = getHeaders(sheet);
  const rows = records.map(record => objectToRow(headers, record));

  const lastRow = sheet.getLastRow();
  sheet.getRange(lastRow + 1, 1, rows.length, headers.length).setValues(rows);

  return records;
}

/**
 * レコードを更新
 * @param {string} tableName - テーブル名
 * @param {string} idColumn - IDカラム名
 * @param {string} id - ID
 * @param {Object} updates - 更新データ
 * @returns {Object|null} 更新後のレコードまたはnull（見つからない場合）
 */
function updateRecord(tableName, idColumn, id, updates) {
  const sheet = getSheet(tableName);
  const rowNum = findRowById(sheet, idColumn, id);

  if (!rowNum) {
    return null;
  }

  const headers = getHeaders(sheet);
  const currentRow = sheet.getRange(rowNum, 1, 1, headers.length).getValues()[0];
  const currentRecord = rowToObject(headers, currentRow);

  // 更新を適用
  const updatedRecord = { ...currentRecord, ...updates };
  const newRow = objectToRow(headers, updatedRecord);

  sheet.getRange(rowNum, 1, 1, headers.length).setValues([newRow]);

  return updatedRecord;
}

/**
 * 複数条件でレコードを検索
 * @param {string} tableName - テーブル名
 * @param {Object} conditions - 検索条件 { columnName: value, ... }
 * @param {Object} options - オプション
 * @param {boolean} options.includeDeleted - 論理削除済みを含むか
 * @returns {Object[]} マッチしたレコード配列
 */
function findRecords(tableName, conditions, options = {}) {
  let records = getAllRecords(tableName, options);

  for (const [column, value] of Object.entries(conditions)) {
    records = records.filter(record => record[column] === value);
  }

  return records;
}

// ロック取得関数は repository.gs に統一
// @see repository.gs acquireLock()
// 注意: waitLock()ではなくtryLock()を使用（ノンブロッキング）
