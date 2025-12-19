/**
 * Master Table Service Layer
 *
 * KTSM-24: マスターテーブルCRUD機能
 *
 * 各マスターテーブルのビジネスロジックを提供
 * - M_Customers (顧客)
 * - M_Staff (スタッフ)
 * - M_Subcontractors (外注先)
 * - M_TransportFee (交通費)
 * - M_Company (自社情報)
 */

// シート名定義
const SHEET_NAMES = {
  CUSTOMERS: '顧客',
  STAFF: 'スタッフ',
  SUBCONTRACTORS: '外注先',
  TRANSPORT_FEE: '交通費',
  COMPANY: '自社情報'
};

// ID列名定義
const ID_COLUMNS = {
  CUSTOMERS: 'customer_id',
  STAFF: 'staff_id',
  SUBCONTRACTORS: 'subcontractor_id',
  TRANSPORT_FEE: 'area_code',
  COMPANY: 'company_id'
};

// ========================================
// 共通ヘルパー
// ========================================

/**
 * マスターテーブル共通の保存処理
 * @param {string} sheetName - シート名
 * @param {string} idColumn - IDカラム名
 * @param {string} tableName - テーブル名（ログ用）
 * @param {Object} data - 保存するデータ
 * @param {string} expectedUpdatedAt - 楽観ロック用
 * @param {Object} validation - バリデーション関数
 * @returns {Object} レスポンス
 */
function saveMasterRecord(sheetName, idColumn, tableName, data, expectedUpdatedAt, validation) {
  const requestId = generateRequestId();

  try {
    const isNew = !data[idColumn];

    // ロック取得
    const lock = acquireLock();
    if (!lock) {
      return errorResponse('BUSY_ERROR', '処理が混み合っています。しばらく待ってから再試行してください。', {}, requestId);
    }

    try {
      const sheet = getSheet(sheetName);
      const now = getCurrentTimestamp();
      const user = getCurrentUserEmail();

      if (isNew) {
        // 新規作成 - バリデーション実行
        if (validation) {
          const validationResult = validation(data);
          if (!validationResult.valid) {
            return errorResponse('VALIDATION_ERROR', validationResult.message, validationResult.details, requestId);
          }
        }

        const newId = generateId();
        const newData = {
          ...data,
          [idColumn]: newId,
          created_at: now,
          created_by: user,
          updated_at: now,
          updated_by: user,
          is_active: data.is_active !== undefined ? data.is_active : true,
          is_deleted: false
        };

        insertRow(sheet, newData);
        logCreate(tableName, newId, newData);

        return successResponse(newData, requestId);

      } else {
        // 更新
        const existing = findById(sheet, idColumn, data[idColumn]);

        if (!existing) {
          return errorResponse('NOT_FOUND', `${tableName} が見つかりません`, { id: data[idColumn] }, requestId);
        }

        if (existing.is_deleted) {
          return errorResponse('NOT_FOUND', `${tableName} は削除されています`, { id: data[idColumn] }, requestId);
        }

        // 楽観ロックチェック
        if (!checkOptimisticLock(existing, expectedUpdatedAt)) {
          return errorResponse('CONFLICT_ERROR', '他のユーザーによって更新されています。画面を再読み込みしてください。', {
            currentUpdatedAt: existing.updated_at,
            expectedUpdatedAt: expectedUpdatedAt
          }, requestId);
        }

        const updatedData = {
          ...data,
          updated_at: now,
          updated_by: user
        };

        // _rowIndex を除去してから更新
        const { _rowIndex, ...cleanData } = updatedData;
        const result = updateRow(sheet, existing._rowIndex, cleanData);

        // 変更前後のデータでログ記録
        const beforeData = {};
        const afterData = {};
        Object.keys(cleanData).forEach(key => {
          if (existing[key] !== cleanData[key]) {
            beforeData[key] = existing[key];
            afterData[key] = cleanData[key];
          }
        });

        if (Object.keys(beforeData).length > 0) {
          logUpdate(tableName, data[idColumn], beforeData, afterData);
        }

        return successResponse(result, requestId);
      }

    } finally {
      lock.releaseLock();
    }

  } catch (error) {
    Logger.log(`saveMasterRecord error: ${error.message}`);
    return errorResponse('SYSTEM_ERROR', error.message, {}, requestId);
  }
}

/**
 * マスターテーブル共通の削除処理（論理削除）
 * @param {string} sheetName - シート名
 * @param {string} idColumn - IDカラム名
 * @param {string} tableName - テーブル名（ログ用）
 * @param {string} id - 削除するID
 * @param {string} expectedUpdatedAt - 楽観ロック用
 * @returns {Object} レスポンス
 */
function deleteMasterRecord(sheetName, idColumn, tableName, id, expectedUpdatedAt) {
  const requestId = generateRequestId();

  try {
    const lock = acquireLock();
    if (!lock) {
      return errorResponse('BUSY_ERROR', '処理が混み合っています。しばらく待ってから再試行してください。', {}, requestId);
    }

    try {
      const sheet = getSheet(sheetName);
      const existing = findById(sheet, idColumn, id);

      if (!existing) {
        return errorResponse('NOT_FOUND', `${tableName} が見つかりません`, { id: id }, requestId);
      }

      if (existing.is_deleted) {
        return errorResponse('NOT_FOUND', `${tableName} は既に削除されています`, { id: id }, requestId);
      }

      // 楽観ロックチェック
      if (!checkOptimisticLock(existing, expectedUpdatedAt)) {
        return errorResponse('CONFLICT_ERROR', '他のユーザーによって更新されています。画面を再読み込みしてください。', {
          currentUpdatedAt: existing.updated_at,
          expectedUpdatedAt: expectedUpdatedAt
        }, requestId);
      }

      const user = getCurrentUserEmail();
      const result = softDeleteRow(sheet, existing._rowIndex, user);

      logDelete(tableName, id, existing);

      return successResponse({ deleted: true, id: id }, requestId);

    } finally {
      lock.releaseLock();
    }

  } catch (error) {
    Logger.log(`deleteMasterRecord error: ${error.message}`);
    return errorResponse('SYSTEM_ERROR', error.message, {}, requestId);
  }
}

/**
 * マスターテーブル共通の取得処理
 * @param {string} sheetName - シート名
 * @param {string} idColumn - IDカラム名
 * @param {string} id - 取得するID
 * @returns {Object} レスポンス
 */
function getMasterRecord(sheetName, idColumn, id) {
  const requestId = generateRequestId();

  try {
    const sheet = getSheet(sheetName);
    const record = findById(sheet, idColumn, id);

    if (!record || record.is_deleted) {
      return errorResponse('NOT_FOUND', 'レコードが見つかりません', { id: id }, requestId);
    }

    // _rowIndex を除去
    const { _rowIndex, ...data } = record;
    return successResponse(data, requestId);

  } catch (error) {
    Logger.log(`getMasterRecord error: ${error.message}`);
    return errorResponse('SYSTEM_ERROR', error.message, {}, requestId);
  }
}

/**
 * マスターテーブル共通の一覧取得処理
 * @param {string} sheetName - シート名
 * @param {Object} options - オプション
 * @returns {Object} レスポンス
 */
function listMasterRecords(sheetName, options = {}) {
  const requestId = generateRequestId();

  try {
    const sheet = getSheet(sheetName);
    const rows = getAllRows(sheet, { includeDeleted: options.includeDeleted || false });

    // _rowIndex を除去
    const data = rows.map(row => {
      const { _rowIndex, ...record } = row;
      return record;
    });

    // is_active フィルター
    let filtered = data;
    if (options.activeOnly) {
      filtered = filtered.filter(r => r.is_active === true);
    }

    return successResponse({
      items: filtered,
      count: filtered.length
    }, requestId);

  } catch (error) {
    Logger.log(`listMasterRecords error: ${error.message}`);
    return errorResponse('SYSTEM_ERROR', error.message, {}, requestId);
  }
}

// ========================================
// M_Customers (顧客)
// ========================================

/**
 * 顧客バリデーション
 */
function validateCustomer(data) {
  if (!data.company_name || data.company_name.trim() === '') {
    return { valid: false, message: '会社名は必須です', details: { field: 'company_name' } };
  }
  return { valid: true };
}

/**
 * 顧客を保存（新規/更新）
 * @param {Object} customer - 顧客データ
 * @param {string} expectedUpdatedAt - 楽観ロック用
 */
function saveCustomer(customer, expectedUpdatedAt) {
  return saveMasterRecord(
    SHEET_NAMES.CUSTOMERS,
    ID_COLUMNS.CUSTOMERS,
    'M_Customers',
    customer,
    expectedUpdatedAt,
    validateCustomer
  );
}

/**
 * 顧客を取得
 * @param {string} customerId - 顧客ID
 */
function getCustomer(customerId) {
  return getMasterRecord(SHEET_NAMES.CUSTOMERS, ID_COLUMNS.CUSTOMERS, customerId);
}

/**
 * 顧客一覧を取得
 * @param {Object} options - オプション
 */
function listCustomers(options = {}) {
  return listMasterRecords(SHEET_NAMES.CUSTOMERS, options);
}

/**
 * 顧客を削除（論理削除）
 * @param {string} customerId - 顧客ID
 * @param {string} expectedUpdatedAt - 楽観ロック用
 */
function deleteCustomer(customerId, expectedUpdatedAt) {
  return deleteMasterRecord(
    SHEET_NAMES.CUSTOMERS,
    ID_COLUMNS.CUSTOMERS,
    'M_Customers',
    customerId,
    expectedUpdatedAt
  );
}

// ========================================
// M_Staff (スタッフ)
// ========================================

/**
 * スタッフバリデーション
 */
function validateStaff(data) {
  if (!data.name || data.name.trim() === '') {
    return { valid: false, message: '名前は必須です', details: { field: 'name' } };
  }
  return { valid: true };
}

/**
 * スタッフを保存（新規/更新）
 * @param {Object} staff - スタッフデータ
 * @param {string} expectedUpdatedAt - 楽観ロック用
 */
function saveStaff(staff, expectedUpdatedAt) {
  return saveMasterRecord(
    SHEET_NAMES.STAFF,
    ID_COLUMNS.STAFF,
    'M_Staff',
    staff,
    expectedUpdatedAt,
    validateStaff
  );
}

/**
 * スタッフを取得
 * @param {string} staffId - スタッフID
 */
function getStaff(staffId) {
  return getMasterRecord(SHEET_NAMES.STAFF, ID_COLUMNS.STAFF, staffId);
}

/**
 * スタッフ一覧を取得
 * @param {Object} options - オプション
 */
function listStaff(options = {}) {
  return listMasterRecords(SHEET_NAMES.STAFF, options);
}

/**
 * スタッフを削除（論理削除）
 * @param {string} staffId - スタッフID
 * @param {string} expectedUpdatedAt - 楽観ロック用
 */
function deleteStaff(staffId, expectedUpdatedAt) {
  return deleteMasterRecord(
    SHEET_NAMES.STAFF,
    ID_COLUMNS.STAFF,
    'M_Staff',
    staffId,
    expectedUpdatedAt
  );
}

// ========================================
// M_Subcontractors (外注先)
// ========================================

/**
 * 外注先バリデーション
 */
function validateSubcontractor(data) {
  if (!data.company_name || data.company_name.trim() === '') {
    return { valid: false, message: '会社名は必須です', details: { field: 'company_name' } };
  }
  return { valid: true };
}

/**
 * 外注先を保存（新規/更新）
 * @param {Object} subcontractor - 外注先データ
 * @param {string} expectedUpdatedAt - 楽観ロック用
 */
function saveSubcontractor(subcontractor, expectedUpdatedAt) {
  return saveMasterRecord(
    SHEET_NAMES.SUBCONTRACTORS,
    ID_COLUMNS.SUBCONTRACTORS,
    'M_Subcontractors',
    subcontractor,
    expectedUpdatedAt,
    validateSubcontractor
  );
}

/**
 * 外注先を取得
 * @param {string} subcontractorId - 外注先ID
 */
function getSubcontractor(subcontractorId) {
  return getMasterRecord(SHEET_NAMES.SUBCONTRACTORS, ID_COLUMNS.SUBCONTRACTORS, subcontractorId);
}

/**
 * 外注先一覧を取得
 * @param {Object} options - オプション
 */
function listSubcontractors(options = {}) {
  return listMasterRecords(SHEET_NAMES.SUBCONTRACTORS, options);
}

/**
 * 外注先を削除（論理削除）
 * @param {string} subcontractorId - 外注先ID
 * @param {string} expectedUpdatedAt - 楽観ロック用
 */
function deleteSubcontractor(subcontractorId, expectedUpdatedAt) {
  return deleteMasterRecord(
    SHEET_NAMES.SUBCONTRACTORS,
    ID_COLUMNS.SUBCONTRACTORS,
    'M_Subcontractors',
    subcontractorId,
    expectedUpdatedAt
  );
}

// ========================================
// M_TransportFee (交通費)
// ========================================

/**
 * 交通費バリデーション
 */
function validateTransportFee(data) {
  if (!data.area_code || data.area_code.trim() === '') {
    return { valid: false, message: 'エリアコードは必須です', details: { field: 'area_code' } };
  }
  if (!data.area_name || data.area_name.trim() === '') {
    return { valid: false, message: 'エリア名は必須です', details: { field: 'area_name' } };
  }
  if (data.default_fee === undefined || data.default_fee === null) {
    return { valid: false, message: 'デフォルト料金は必須です', details: { field: 'default_fee' } };
  }
  return { valid: true };
}

/**
 * 交通費マスターを保存（新規/更新）
 * 注意: M_TransportFeeはcreated_at等の監査カラムがないシンプル構造
 * @param {Object} transportFee - 交通費データ
 */
function saveTransportFee(transportFee) {
  const requestId = generateRequestId();

  try {
    const validationResult = validateTransportFee(transportFee);
    if (!validationResult.valid) {
      return errorResponse('VALIDATION_ERROR', validationResult.message, validationResult.details, requestId);
    }

    const lock = acquireLock();
    if (!lock) {
      return errorResponse('BUSY_ERROR', '処理が混み合っています。', {}, requestId);
    }

    try {
      const sheet = getSheet(SHEET_NAMES.TRANSPORT_FEE);
      const existing = findById(sheet, ID_COLUMNS.TRANSPORT_FEE, transportFee.area_code);

      if (existing) {
        // 更新
        updateRow(sheet, existing._rowIndex, transportFee);
        logUpdate('M_TransportFee', transportFee.area_code, existing, transportFee);
      } else {
        // 新規
        insertRow(sheet, transportFee);
        logCreate('M_TransportFee', transportFee.area_code, transportFee);
      }

      return successResponse(transportFee, requestId);

    } finally {
      lock.releaseLock();
    }

  } catch (error) {
    Logger.log(`saveTransportFee error: ${error.message}`);
    return errorResponse('SYSTEM_ERROR', error.message, {}, requestId);
  }
}

/**
 * 交通費マスターを取得
 * @param {string} areaCode - エリアコード
 */
function getTransportFee(areaCode) {
  return getMasterRecord(SHEET_NAMES.TRANSPORT_FEE, ID_COLUMNS.TRANSPORT_FEE, areaCode);
}

/**
 * 交通費マスター一覧を取得
 */
function listTransportFees() {
  const requestId = generateRequestId();

  try {
    const sheet = getSheet(SHEET_NAMES.TRANSPORT_FEE);
    const rows = getAllRows(sheet, { includeDeleted: true });

    const data = rows.map(row => {
      const { _rowIndex, ...record } = row;
      return record;
    });

    return successResponse({
      items: data,
      count: data.length
    }, requestId);

  } catch (error) {
    Logger.log(`listTransportFees error: ${error.message}`);
    return errorResponse('SYSTEM_ERROR', error.message, {}, requestId);
  }
}

/**
 * 交通費マスターを削除（物理削除）
 * @param {string} areaCode - エリアコード
 */
function deleteTransportFee(areaCode) {
  const requestId = generateRequestId();

  try {
    const lock = acquireLock();
    if (!lock) {
      return errorResponse('BUSY_ERROR', '処理が混み合っています。', {}, requestId);
    }

    try {
      const sheet = getSheet(SHEET_NAMES.TRANSPORT_FEE);
      const existing = findById(sheet, ID_COLUMNS.TRANSPORT_FEE, areaCode);

      if (!existing) {
        return errorResponse('NOT_FOUND', '交通費マスターが見つかりません', { areaCode: areaCode }, requestId);
      }

      // 物理削除
      sheet.deleteRow(existing._rowIndex);
      logDelete('M_TransportFee', areaCode, existing);

      return successResponse({ deleted: true, areaCode: areaCode }, requestId);

    } finally {
      lock.releaseLock();
    }

  } catch (error) {
    Logger.log(`deleteTransportFee error: ${error.message}`);
    return errorResponse('SYSTEM_ERROR', error.message, {}, requestId);
  }
}

// ========================================
// M_Company (自社情報)
// ========================================

/**
 * 自社情報バリデーション
 */
function validateCompany(data) {
  if (!data.company_name || data.company_name.trim() === '') {
    return { valid: false, message: '会社名は必須です', details: { field: 'company_name' } };
  }
  return { valid: true };
}

/**
 * 自社情報を保存（新規/更新）
 * 注意: 通常1レコードのみ
 * @param {Object} company - 自社情報データ
 */
function saveCompany(company) {
  const requestId = generateRequestId();

  try {
    const validationResult = validateCompany(company);
    if (!validationResult.valid) {
      return errorResponse('VALIDATION_ERROR', validationResult.message, validationResult.details, requestId);
    }

    const lock = acquireLock();
    if (!lock) {
      return errorResponse('BUSY_ERROR', '処理が混み合っています。', {}, requestId);
    }

    try {
      const sheet = getSheet(SHEET_NAMES.COMPANY);
      const rows = getAllRows(sheet, { includeDeleted: true });
      const now = getCurrentTimestamp();

      if (rows.length > 0) {
        // 既存レコードを更新（最初の1件）
        const existing = rows[0];
        const updatedData = {
          ...company,
          company_id: existing.company_id || generateId(),
          updated_at: now
        };
        updateRow(sheet, existing._rowIndex, updatedData);
        logUpdate('M_Company', updatedData.company_id, existing, updatedData);
        return successResponse(updatedData, requestId);
      } else {
        // 新規作成
        const newData = {
          ...company,
          company_id: generateId(),
          updated_at: now
        };
        insertRow(sheet, newData);
        logCreate('M_Company', newData.company_id, newData);
        return successResponse(newData, requestId);
      }

    } finally {
      lock.releaseLock();
    }

  } catch (error) {
    Logger.log(`saveCompany error: ${error.message}`);
    return errorResponse('SYSTEM_ERROR', error.message, {}, requestId);
  }
}

/**
 * 自社情報を取得
 */
function getCompany() {
  const requestId = generateRequestId();

  try {
    const sheet = getSheet(SHEET_NAMES.COMPANY);
    const rows = getAllRows(sheet, { includeDeleted: true });

    if (rows.length === 0) {
      return successResponse(null, requestId);
    }

    const { _rowIndex, ...data } = rows[0];
    return successResponse(data, requestId);

  } catch (error) {
    Logger.log(`getCompany error: ${error.message}`);
    return errorResponse('SYSTEM_ERROR', error.message, {}, requestId);
  }
}
