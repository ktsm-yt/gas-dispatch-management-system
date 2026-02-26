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

/**
 * 値の末尾4桁を残してマスクする（口座番号等の機密フィールド用）
 * audit_log.gs の SENSITIVE_FIELDS.partial と同じ形式
 * @param {*} value - マスク対象の値
 * @returns {string|*} マスク済み文字列、またはnull/空文字はそのまま返す
 */
function maskPartial(value) {
  if (value == null || value === '') return value;
  var s = String(value);
  return s.length > 4 ? '****' + s.slice(-4) : '****';
}

// シート名定義（TABLE_SHEET_MAP から派生）
const SHEET_NAMES = {
  CUSTOMERS: TABLE_SHEET_MAP['M_Customers'],
  STAFF: TABLE_SHEET_MAP['M_Staff'],
  SUBCONTRACTORS: TABLE_SHEET_MAP['M_Subcontractors'],
  TRANSPORT_FEE: TABLE_SHEET_MAP['M_TransportFee'],
  COMPANY: TABLE_SHEET_MAP['M_Company']
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
      const sheet = getSheetDirect(sheetName);
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
        // 更新 - バリデーション実行（正規化処理を含むため更新時にも必要）
        if (validation) {
          const validationResult = validation(data);
          if (!validationResult.valid) {
            return errorResponse('VALIDATION_ERROR', validationResult.message, validationResult.details, requestId);
          }
        }

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
      const sheet = getSheetDirect(sheetName);
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
    const sheet = getSheetDirect(sheetName);
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
  let requestId = 'unknown';
  try {
    Logger.log('listMasterRecords: sheetName=' + sheetName);
    requestId = generateRequestId();
    Logger.log('listMasterRecords: requestId=' + requestId);

    Logger.log('listMasterRecords: getting sheet');
    const sheet = getSheetDirect(sheetName);
    Logger.log('listMasterRecords: sheet found');
    const rows = getAllRows(sheet, { includeDeleted: options.includeDeleted || false });
    Logger.log('listMasterRecords: rows count=' + rows.length);

    // _rowIndex を除去し、Date型を文字列に変換
    const data = rows.map(row => {
      const { _rowIndex, ...record } = row;
      // Date型をISO文字列に変換（GASクライアント通信用）
      Object.keys(record).forEach(key => {
        if (record[key] instanceof Date) {
          record[key] = record[key].toISOString();
        }
      });
      return record;
    });

    // is_active フィルター
    let filtered = data;
    if (options.activeOnly) {
      filtered = filtered.filter(r => r.is_active === true);
    }

    Logger.log('listMasterRecords: returning success');
    return successResponse({
      items: filtered,
      count: filtered.length
    }, requestId);

  } catch (error) {
    Logger.log(`listMasterRecords error: ${error.message}`);
    Logger.log(`listMasterRecords stack: ${error.stack}`);
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

  // 同名会社の重複チェック（削除済みは除外）
  const existingCustomers = listCustomers({ activeOnly: false });
  if (existingCustomers.ok) {
    const duplicate = existingCustomers.data.items.find(c =>
      c.company_name === data.company_name.trim() &&
      c.customer_id !== data.customer_id &&
      !c.is_deleted  // 削除済みは除外
    );
    if (duplicate) {
      return {
        valid: false,
        message: `同名の会社「${data.company_name}」が既に登録されています`,
        details: { field: 'company_name', duplicateId: duplicate.customer_id }
      };
    }
  }

  return { valid: true };
}

/**
 * 顧客を保存（新規/更新）
 * 新規作成時は専用フォルダを自動作成
 * @param {Object} customer - 顧客データ
 * @param {string} expectedUpdatedAt - 楽観ロック用
 */
function saveCustomer(customer, expectedUpdatedAt) {
  requireManager();
  const isNew = !customer.customer_id;

  const result = saveMasterRecord(
    SHEET_NAMES.CUSTOMERS,
    ID_COLUMNS.CUSTOMERS,
    'M_Customers',
    customer,
    expectedUpdatedAt,
    validateCustomer
  );

  // キャッシュをクリア（CacheService + メモリ）
  if (result.ok) {
    MasterCache.invalidateCustomers();
  }

  // 新規作成成功時にフォルダを自動作成
  if (result.ok && isNew && !customer.folder_id) {
    try {
      const folderResult = CustomerFolderService.createCustomerFolder(result.data);
      if (folderResult.created) {
        CustomerFolderService._updateCustomerFolderId(
          result.data.customer_id,
          folderResult.folderId
        );
        result.data.folder_id = folderResult.folderId;
        Logger.log(`新規顧客フォルダを作成: ${result.data.company_name}`);
      }
    } catch (e) {
      // フォルダ作成失敗は警告ログのみ（顧客作成自体は成功）
      Logger.log(`Warning: 顧客フォルダ作成に失敗: ${e.message}`);
    }
  }

  return result;
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
 * 顧客検索（インクリメンタルサーチ用）
 * @param {Object} params - 検索パラメータ
 *   - search_term: 検索キーワード（会社名・支店名で部分一致）
 *   - limit: 返す最大件数（デフォルト10）
 * @returns {Object} APIレスポンス { ok: true, data: { customers: [...] } }
 */
function searchCustomers(params) {
  const requestId = generateRequestId();

  try {
    const authResult = checkPermission(ROLES.STAFF);
    if (!authResult.allowed) {
      return errorResponse('PERMISSION_DENIED', authResult.message || '権限がありません', {}, requestId);
    }

    const safeParams = params || {};
    const searchTerm = (safeParams.search_term || '').trim();
    const limit = safeParams.limit || 10;

    if (!searchTerm) {
      return successResponse({ customers: [] }, requestId);
    }

    // アクティブな顧客のみ取得
    const result = listCustomers({ activeOnly: true });
    if (!result.ok) {
      return result;
    }

    // 会社名・支店名で部分一致検索（大文字小文字を区別しない）
    const query = searchTerm.toLowerCase();
    const filtered = result.data.items.filter(customer => {
      const companyMatch = (customer.company_name || '').toLowerCase().includes(query);
      const branchMatch = (customer.branch_name || '').toLowerCase().includes(query);
      return companyMatch || branchMatch;
    });

    // 件数制限 + 必要フィールドのみ返す（PII最小化）
    const customers = filtered.slice(0, limit).map(c => ({
      customer_id: c.customer_id,
      company_name: c.company_name,
      branch_name: c.branch_name || ''
    }));

    return successResponse({ customers: customers }, requestId);

  } catch (error) {
    Logger.log('searchCustomers error: ' + error.message);
    return errorResponse('SYSTEM_ERROR', error.message, {}, requestId);
  }
}

/**
 * 顧客を削除（論理削除）
 * @param {string} customerId - 顧客ID
 * @param {string} expectedUpdatedAt - 楽観ロック用
 */
function deleteCustomer(customerId, expectedUpdatedAt) {
  requireManager();
  const result = deleteMasterRecord(
    SHEET_NAMES.CUSTOMERS,
    ID_COLUMNS.CUSTOMERS,
    'M_Customers',
    customerId,
    expectedUpdatedAt
  );
  // キャッシュをクリア（CacheService + メモリ）
  if (result.ok) {
    MasterCache.invalidateCustomers();
  }
  return result;
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

  // 口座番号バリデーション（入力がある場合のみ）
  if (data.bank_account_number != null && data.bank_account_number !== '') {
    // 全角数字→半角変換、ハイフン除去
    var normalized = String(data.bank_account_number)
      .replace(/[０-９]/g, function(ch) { return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0); })
      .replace(/[-ー－]/g, '');

    if (!/^\d+$/.test(normalized)) {
      return { valid: false, message: '口座番号は数字のみで入力してください', details: { field: 'bank_account_number' } };
    }
    if (normalized.length > 8) {
      return { valid: false, message: '口座番号は8桁以内で入力してください', details: { field: 'bank_account_number' } };
    }

    // 正規化した値で上書き（文字列型で保持 → 先頭ゼロ保護）
    data.bank_account_number = normalized;
  }

  return { valid: true };
}

/**
 * スタッフを保存（新規/更新）
 * @param {Object} staff - スタッフデータ
 * @param {string} expectedUpdatedAt - 楽観ロック用
 */
function saveStaff(staff, expectedUpdatedAt) {
  requireManager();
  // NOTE: 源泉徴収はwithholding_tax_applicable=trueのスタッフに適用（日額表甲欄・扶養0人、WithholdingTaxTable.ts）
  // デフォルト補完: 新規作成時に未設定の場合、staff_typeに応じて自動設定
  // 更新時は既存値を維持するため、補完しない（部分更新でstaff_typeが欠落するケースへの防御）
  const isNewStaff = !staff.staff_id;
  if (isNewStaff && (staff.withholding_tax_applicable === undefined || staff.withholding_tax_applicable === null || staff.withholding_tax_applicable === '') && staff.staff_type) {
    staff.withholding_tax_applicable = (staff.staff_type === 'regular' || staff.staff_type === 'student');
  }
  const result = saveMasterRecord(
    SHEET_NAMES.STAFF,
    ID_COLUMNS.STAFF,
    'M_Staff',
    staff,
    expectedUpdatedAt,
    validateStaff
  );
  // キャッシュをクリア（CacheService + メモリ）
  if (result.ok) {
    MasterCache.invalidateStaff();
  }
  return result;
}

/**
 * スタッフを取得
 * @param {string} staffId - スタッフID
 */
function getStaff(staffId) {
  const result = getMasterRecord(SHEET_NAMES.STAFF, ID_COLUMNS.STAFF, staffId);
  // staffロールには口座番号をマスクして返す
  if (result.ok && result.data) {
    const auth = checkPermission(ROLES.MANAGER);
    if (!auth.allowed) {
      result.data.bank_account_number = maskPartial(result.data.bank_account_number);
    }
  }
  return result;
}

/**
 * スタッフ一覧を取得
 * @param {Object} options - オプション
 */
function listStaff(options = {}) {
  try {
    Logger.log('listStaff called with options: ' + JSON.stringify(options));
    const result = listMasterRecords(SHEET_NAMES.STAFF, options);
    Logger.log('listStaff result: ' + JSON.stringify(result ? 'ok' : 'null'));
    // UI向けマスク（サーバー内部呼び出しには影響しない）
    if (options.maskSensitive && result.ok && result.data && result.data.items) {
      result.data.items.forEach(item => {
        item.bank_account_number = maskPartial(item.bank_account_number);
      });
    }
    return result;
  } catch (e) {
    Logger.log('listStaff error: ' + e.message);
    return errorResponse('SYSTEM_ERROR', e.message, {}, generateRequestId());
  }
}

/**
 * スタッフを削除（論理削除）
 * @param {string} staffId - スタッフID
 * @param {string} expectedUpdatedAt - 楽観ロック用
 */
function deleteStaff(staffId, expectedUpdatedAt) {
  requireManager();
  const result = deleteMasterRecord(
    SHEET_NAMES.STAFF,
    ID_COLUMNS.STAFF,
    'M_Staff',
    staffId,
    expectedUpdatedAt
  );
  // キャッシュをクリア（CacheService + メモリ）
  if (result.ok) {
    MasterCache.invalidateStaff();
  }
  return result;
}

/**
 * 作業員名簿を生成
 * @param {string[]} staffIds - スタッフIDの配列
 * @param {Object} options - オプション
 * @param {string} options.mode - 出力モード（'pdf' | 'excel' | 'edit'）
 * @param {string} options.action - 既存ファイル処理（'overwrite' | 'rename'）
 * @returns {Object} APIレスポンス
 */
function generateWorkerRoster(staffIds, options) {
  return WorkerRosterService.generate(staffIds, options);
}

/**
 * 作業員名簿の設定状況を取得
 * @returns {Object} 設定状況
 */
function getWorkerRosterConfigStatus() {
  return WorkerRosterService.getConfigStatus();
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

  // 同名会社の重複チェック（削除済みは除外）
  const existingSubcontractors = listSubcontractors({ activeOnly: false });
  if (existingSubcontractors.ok) {
    const duplicate = existingSubcontractors.data.items.find(s =>
      s.company_name === data.company_name.trim() &&
      s.subcontractor_id !== data.subcontractor_id &&
      !s.is_deleted  // 削除済みは除外
    );
    if (duplicate) {
      return {
        valid: false,
        message: `同名の外注先「${data.company_name}」が既に登録されています`,
        details: { field: 'company_name', duplicateId: duplicate.subcontractor_id }
      };
    }
  }

  return { valid: true };
}

/**
 * 外注先を保存（新規/更新）
 * @param {Object} subcontractor - 外注先データ
 * @param {string} expectedUpdatedAt - 楽観ロック用
 */
function saveSubcontractor(subcontractor, expectedUpdatedAt) {
  requireManager();
  const result = saveMasterRecord(
    SHEET_NAMES.SUBCONTRACTORS,
    ID_COLUMNS.SUBCONTRACTORS,
    'M_Subcontractors',
    subcontractor,
    expectedUpdatedAt,
    validateSubcontractor
  );
  // キャッシュをクリア（CacheService + メモリ）
  if (result.ok) {
    MasterCache.invalidateSubcontractors();
  }
  return result;
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
  requireManager();
  const result = deleteMasterRecord(
    SHEET_NAMES.SUBCONTRACTORS,
    ID_COLUMNS.SUBCONTRACTORS,
    'M_Subcontractors',
    subcontractorId,
    expectedUpdatedAt
  );
  // キャッシュをクリア（CacheService + メモリ）
  if (result.ok) {
    MasterCache.invalidateSubcontractors();
  }
  return result;
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
  requireManager();
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
      const sheet = getSheetDirect(SHEET_NAMES.TRANSPORT_FEE);
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

      // キャッシュをクリア（CacheService + メモリ）
      MasterCache.invalidateTransportFees();

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
    const sheet = getSheetDirect(SHEET_NAMES.TRANSPORT_FEE);
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
  requireManager();
  const requestId = generateRequestId();

  try {
    const lock = acquireLock();
    if (!lock) {
      return errorResponse('BUSY_ERROR', '処理が混み合っています。', {}, requestId);
    }

    try {
      const sheet = getSheetDirect(SHEET_NAMES.TRANSPORT_FEE);
      const existing = findById(sheet, ID_COLUMNS.TRANSPORT_FEE, areaCode);

      if (!existing) {
        return errorResponse('NOT_FOUND', '交通費マスターが見つかりません', { areaCode: areaCode }, requestId);
      }

      // 物理削除
      sheet.deleteRow(existing._rowIndex);
      logDelete('M_TransportFee', areaCode, existing);

      // キャッシュをクリア（CacheService + メモリ）
      MasterCache.invalidateTransportFees();

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
  if (data.fiscal_month_end !== undefined && data.fiscal_month_end !== '') {
    const m = Number(data.fiscal_month_end);
    if (!Number.isInteger(m) || m < 1 || m > 12) {
      return { valid: false, message: '決算月は1〜12の整数で指定してください', details: { field: 'fiscal_month_end' } };
    }
  }
  return { valid: true };
}

/**
 * 自社情報を保存（新規/更新）
 * 注意: 通常1レコードのみ
 * @param {Object} company - 自社情報データ
 */
function saveCompany(company) {
  requireManager();
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
      const sheet = getSheetDirect(SHEET_NAMES.COMPANY);
      const rows = getAllRows(sheet, { includeDeleted: true });
      const now = getCurrentTimestamp();

      let result;
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
        result = updatedData;
      } else {
        // 新規作成
        const newData = {
          ...company,
          company_id: generateId(),
          updated_at: now
        };
        insertRow(sheet, newData);
        logCreate('M_Company', newData.company_id, newData);
        result = newData;
      }

      // キャッシュをクリア（CacheService + メモリ）
      MasterCache.invalidateCompany();

      return successResponse(result, requestId);

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
    const sheet = getSheetDirect(SHEET_NAMES.COMPANY);
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
