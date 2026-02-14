/**
 * Repository Layer - Sheet I/O Base Functions
 *
 * KTSM-24: マスターテーブルCRUD基盤
 *
 * スプレッドシートへの読み書きを一括処理で行う基盤層
 */

// getDb() は db.gs に統一
// @see db.gs getDb()

/**
 * シートを取得（直接シート名で検索）
 * @param {string} sheetName - シート名（英語）
 * @returns {GoogleAppsScript.Spreadsheet.Sheet}
 */
function getSheetDirect(sheetName) {
  const ss = getDb();
  const sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    throw new Error(`シート "${sheetName}" が見つかりません`);
  }

  return sheet;
}

// getHeaders() は db.gs に統一
// @see db.gs getHeaders()

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
    deleted_at: now,       // 削除日時を専用カラムに記録
    deleted_by: deletedBy, // 削除者を専用カラムに記録
    updated_at: now,
    updated_by: deletedBy
  });
}

// 以下の関数は utils.gs に統一
// @see utils.gs generateId(), getCurrentTimestamp(), generateRequestId(), getCurrentUserEmail()
// @see utils.gs buildSuccessResponse(), buildErrorResponse()

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
 * tryLock()を使用（ノンブロッキング）
 * @param {number} waitMs - 待機時間（ミリ秒）
 * @returns {GoogleAppsScript.Lock.Lock|null} ロック、取得失敗時はnull
 */
function acquireLock(waitMs = 3000) {
  const lock = LockService.getScriptLock();
  const acquired = lock.tryLock(waitMs);
  return acquired ? lock : null;
}

/**
 * ロックを解放
 * @param {GoogleAppsScript.Lock.Lock} lock - ロックオブジェクト
 */
function releaseLock(lock) {
  if (lock) {
    try {
      lock.releaseLock();
    } catch (e) {
      // ロック解放エラーは無視
    }
  }
}
