/**
 * Repository Layer - Sheet I/O Base Functions
 *
 * KTSM-24: マスターテーブルCRUD基盤
 *
 * スプレッドシートへの読み書きを一括処理で行う基盤層
 */

/**
 * DB Spreadsheet を取得
 * @returns {GoogleAppsScript.Spreadsheet.Spreadsheet}
 */
function getDatabase() {
  const prop = PropertiesService.getScriptProperties();
  const env = prop.getProperty('ENV') || 'dev';
  const spreadsheetId = env === 'prod'
    ? prop.getProperty('SPREADSHEET_ID_PROD')
    : prop.getProperty('SPREADSHEET_ID_DEV');

  if (!spreadsheetId) {
    throw new Error('DB Spreadsheet ID が設定されていません');
  }

  return SpreadsheetApp.openById(spreadsheetId);
}

/**
 * シートを取得（直接シート名で検索）
 * @param {string} sheetName - シート名（日本語）
 * @returns {GoogleAppsScript.Spreadsheet.Sheet}
 */
function getSheetDirect(sheetName) {
  const ss = getDatabase();
  const sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    throw new Error(`シート "${sheetName}" が見つかりません`);
  }

  return sheet;
}

/**
 * シートからヘッダー行を取得
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @returns {string[]} ヘッダー配列
 */
function getHeaders(sheet) {
  const lastCol = sheet.getLastColumn();
  if (lastCol === 0) return [];
  return sheet.getRange(1, 1, 1, lastCol).getValues()[0];
}

/**
 * シートから全データを取得（オブジェクト配列）
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {Object} options - オプション
 * @param {boolean} options.includeDeleted - 論理削除済みを含むか（デフォルト: false）
 * @returns {Object[]} データ配列
 */
function getAllRows(sheet, options = {}) {
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();

  if (lastRow <= 1 || lastCol === 0) {
    return [];
  }

  const headers = getHeaders(sheet);
  const data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

  let rows = data.map((row, index) => {
    const obj = { _rowIndex: index + 2 };
    headers.forEach((header, colIndex) => {
      obj[header] = row[colIndex];
    });
    return obj;
  });

  if (!options.includeDeleted) {
    rows = rows.filter(row => !row.is_deleted);
  }

  return rows;
}

/**
 * IDでレコードを検索
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {string} idColumn - IDカラム名
 * @param {string} id - 検索するID
 * @returns {Object|null} 見つかったレコード、なければnull
 */
function findById(sheet, idColumn, id) {
  const rows = getAllRows(sheet, { includeDeleted: true });
  return rows.find(row => row[idColumn] === id) || null;
}

/**
 * 条件でレコードを検索
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {Object} conditions - 検索条件
 * @param {Object} options - オプション
 * @returns {Object[]} マッチしたレコード配列
 */
function findByConditions(sheet, conditions, options = {}) {
  const rows = getAllRows(sheet, options);

  return rows.filter(row => {
    return Object.entries(conditions).every(([key, value]) => {
      if (value === undefined || value === null) return true;
      return row[key] === value;
    });
  });
}

/**
 * 新規レコードを挿入
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {Object} data - 挿入するデータ
 * @returns {Object} 挿入したデータ（行番号付き）
 */
function insertRow(sheet, data) {
  const headers = getHeaders(sheet);
  const row = headers.map(header => data[header] !== undefined ? data[header] : '');

  sheet.appendRow(row);

  const newRowIndex = sheet.getLastRow();
  return { ...data, _rowIndex: newRowIndex };
}

/**
 * レコードを更新
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} rowIndex - 行番号（1-indexed）
 * @param {Object} data - 更新するデータ（部分更新対応）
 * @returns {Object} 更新後のデータ
 */
function updateRow(sheet, rowIndex, data) {
  const headers = getHeaders(sheet);

  const currentRow = sheet.getRange(rowIndex, 1, 1, headers.length).getValues()[0];
  const currentData = {};
  headers.forEach((header, index) => {
    currentData[header] = currentRow[index];
  });

  const mergedData = { ...currentData, ...data };

  const newRow = headers.map(header => mergedData[header] !== undefined ? mergedData[header] : '');
  sheet.getRange(rowIndex, 1, 1, headers.length).setValues([newRow]);

  return { ...mergedData, _rowIndex: rowIndex };
}

/**
 * レコードを論理削除
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} rowIndex - 行番号（1-indexed）
 * @param {string} deletedBy - 削除者
 * @returns {Object} 削除後のデータ
 */
function softDeleteRow(sheet, rowIndex, deletedBy) {
  const now = new Date().toISOString();
  return updateRow(sheet, rowIndex, {
    is_deleted: true,
    updated_at: now,
    updated_by: deletedBy
  });
}

// NOTE: generateId, getCurrentTimestamp, getCurrentUserEmail, generateRequestId は
// utils.gs で定義されているため、ここでは削除（重複回避）

/**
 * 成功レスポンスを生成
 * @param {Object} data - データ
 * @param {string} requestId - リクエストID
 * @returns {Object} レスポンス
 */
function successResponse(data, requestId) {
  return {
    ok: true,
    data: data,
    serverTime: getCurrentTimestamp(),
    requestId: requestId
  };
}

/**
 * エラーレスポンスを生成
 * @param {string} code - エラーコード
 * @param {string} message - エラーメッセージ
 * @param {Object} details - 詳細情報
 * @param {string} requestId - リクエストID
 * @returns {Object} レスポンス
 */
function errorResponse(code, message, details, requestId) {
  return {
    ok: false,
    error: {
      code: code,
      message: message,
      details: details || {}
    },
    requestId: requestId
  };
}

/**
 * 楽観ロックチェック
 * @param {Object} record - 現在のレコード
 * @param {string} expectedUpdatedAt - 期待するupdated_at
 * @returns {boolean} 一致すればtrue
 */
function checkOptimisticLock(record, expectedUpdatedAt) {
  if (!expectedUpdatedAt) return true;
  if (!record.updated_at) return true;

  const recordTime = new Date(record.updated_at).getTime();
  const expectedTime = new Date(expectedUpdatedAt).getTime();

  return recordTime === expectedTime;
}

/**
 * スクリプトロックを取得
 * @param {number} waitMs - 待機時間（ミリ秒）
 * @returns {GoogleAppsScript.Lock.Lock|null} ロック、取得失敗時はnull
 */
function acquireLock(waitMs = 3000) {
  const lock = LockService.getScriptLock();
  const acquired = lock.tryLock(waitMs);
  return acquired ? lock : null;
}
