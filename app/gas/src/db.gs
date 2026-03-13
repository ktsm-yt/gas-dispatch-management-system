/**
 * Database Connection Module
 *
 * DB接続・シート操作の共通処理
 */

/**
 * テーブル名とシート名のマッピング（英語統一）
 */
const TABLE_SHEET_MAP = {
  'M_Customers': 'Customers',
  'M_Staff': 'Staff',
  'M_Subcontractors': 'Subcontractors',
  'M_TransportFee': 'TransportFees',
  'M_Company': 'Company',
  'T_Jobs': 'Jobs',
  'T_JobSlots': 'JobSlots',
  'T_JobAssignments': 'Assignments',
  'T_Invoices': 'Invoices',
  'T_InvoiceLines': 'InvoiceLines',
  'T_Payouts': 'Payouts',
  'T_MonthlyStats': 'MonthlyStats',
  'T_Payments': 'Payments',
  'T_AuditLog': 'AuditLog',
  'T_InvoiceAdjustments': 'InvoiceAdjustments',
  'M_WorkDetails': 'WorkDetails',
  'M_PriceTypes': 'PriceTypes',
  'M_CustomPrices': 'CustomPrices'
};

// リクエスト内キャッシュ（同一実行内でのopenById/getSheetByName重複を削減）
let REQUEST_DB_CACHE = null;
let REQUEST_DB_ID_CACHE = null;
const REQUEST_SHEET_CACHE = {};

// getAllRecords用の実行内キャッシュ（同一リクエスト内でのシートフルスキャン重複を削減）
var REQUEST_RECORDS_CACHE = {};

/**
 * DB Spreadsheetを取得
 * ID取得は config.ts::getSpreadsheetId() に委譲
 * ENV切り替え時のキャッシュ不整合を防止するためID検証付き
 * @returns {GoogleAppsScript.Spreadsheet.Spreadsheet} Spreadsheetオブジェクト
 */
function getDb() {
  const expectedId = REQUEST_DB_ID_CACHE || getSpreadsheetId();
  if (REQUEST_DB_CACHE && REQUEST_DB_ID_CACHE === expectedId) {
    return REQUEST_DB_CACHE;
  }
  // ENV切り替え後やインスタンス再利用時にDB参照がずれるのを防止
  if (REQUEST_DB_CACHE) {
    Object.keys(REQUEST_SHEET_CACHE).forEach(k => delete REQUEST_SHEET_CACHE[k]);
    REQUEST_RECORDS_CACHE = {};
  }
  REQUEST_DB_ID_CACHE = expectedId;
  REQUEST_DB_CACHE = SpreadsheetApp.openById(expectedId);
  return REQUEST_DB_CACHE;
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
  if (REQUEST_SHEET_CACHE[tableName]) {
    return REQUEST_SHEET_CACHE[tableName];
  }

  const sheetName = TABLE_SHEET_MAP[tableName];
  if (!sheetName) {
    throw new Error(`不明なテーブル名: ${tableName}`);
  }

  const db = getDb();
  const sheet = db.getSheetByName(sheetName);

  if (!sheet) {
    throw new Error(`シートが見つかりません: ${sheetName}`);
  }

  REQUEST_SHEET_CACHE[tableName] = sheet;
  return sheet;
}

/**
 * 任意のSpreadsheetからシートを検索（null返却版）
 * シート未存在を許容する場面用（ArchiveService等）
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} db - 対象Spreadsheet
 * @param {string} tableName - テーブル名（T_Jobs等）
 * @returns {GoogleAppsScript.Spreadsheet.Sheet|null} シートまたはnull
 */
function findSheetFromDb(db, tableName) {
  const sheetName = TABLE_SHEET_MAP[tableName];
  if (!sheetName) return null;

  return db.getSheetByName(sheetName);
}

/**
 * 任意のSpreadsheetからシートを取得（throw版）
 * シートが必ず存在すべき場面用（Repository等）
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} db - 対象Spreadsheet
 * @param {string} tableName - テーブル名（T_Jobs等）
 * @returns {GoogleAppsScript.Spreadsheet.Sheet} シートオブジェクト
 */
function getSheetFromDb(db, tableName) {
  const sheet = findSheetFromDb(db, tableName);
  if (!sheet) {
    const sheetName = TABLE_SHEET_MAP[tableName] || tableName;
    throw new Error(`シートが見つかりません: ${sheetName} (DB: ${db.getName()})`);
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
  var cacheKey = tableName + (options.includeDeleted ? ':all' : ':active');
  if (REQUEST_RECORDS_CACHE[cacheKey]) {
    return REQUEST_RECORDS_CACHE[cacheKey].map(function(r) { return Object.assign({}, r); });
  }

  const sheet = getSheet(tableName);
  const lastRow = sheet.getLastRow();

  if (lastRow <= 1) {
    REQUEST_RECORDS_CACHE[cacheKey] = [];
    return [];
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

  REQUEST_RECORDS_CACHE[cacheKey] = records;
  return records.map(function(r) { return Object.assign({}, r); });
}

/**
 * 実行内キャッシュを無効化
 * @param {string} [tableName] - テーブル名（省略時は全キャッシュクリア）
 */
function invalidateExecutionCache(tableName) {
  if (!tableName) {
    REQUEST_RECORDS_CACHE = {};
    return;
  }
  Object.keys(REQUEST_RECORDS_CACHE).forEach(function(key) {
    if (key.indexOf(tableName) === 0) {
      delete REQUEST_RECORDS_CACHE[key];
    }
  });
}

/**
 * IDで単一レコードを取得
 * @param {string} tableName - テーブル名
 * @param {string} idColumn - IDカラム名
 * @param {string} id - ID
 * @returns {Object|null} レコードまたはnull
 */
function getRecordById(tableName, idColumn, id, options) {
  const sheet = getSheet(tableName);
  const rowNum = findRowById(sheet, idColumn, id);

  if (!rowNum) {
    return null;
  }

  const headers = getHeaders(sheet);
  const row = sheet.getRange(rowNum, 1, 1, headers.length).getValues()[0];

  const record = rowToObject(headers, row);

  // 論理削除済みはnullを返す（includeDeleted指定時はスキップ）
  if (record.is_deleted && !(options && options.includeDeleted)) {
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
  invalidateExecutionCache(tableName);

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
  invalidateExecutionCache(tableName);

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
  invalidateExecutionCache(tableName);

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
