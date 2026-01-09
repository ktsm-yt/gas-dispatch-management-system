/**
 * Payout API Controller
 *
 * 支払い管理のAPI（google.script.run対象）
 * P2-3: 給与/支払管理システム
 */

/**
 * スタッフ一覧を取得（支払い画面用）
 * @returns {Object} { ok: true, data: { staff: [] } }
 */
function getStaffForPayouts() {
  const requestId = generateRequestId();

  try {
    const staffList = StaffRepository.search({ is_active: true });

    // 必要なフィールドのみ返す
    const data = staffList.map(s => ({
      staff_id: s.staff_id,
      name: s.name,
      payment_frequency: s.payment_frequency || 'monthly'
    }));

    return buildSuccessResponse({ staff: data }, requestId);

  } catch (error) {
    console.error('getStaffForPayouts error:', error);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, error.message, {}, requestId);
  }
}

/**
 * 未払いサマリーを取得
 * @param {string} staffId - スタッフID
 * @param {string} endDate - 集計終了日（YYYY-MM-DD）
 * @returns {Object} APIレスポンス
 */
function getUnpaidSummary(staffId, endDate) {
  const requestId = generateRequestId();

  try {
    // 認可チェック
    const authResult = checkPermission(ROLES.STAFF);
    if (!authResult.allowed) {
      return buildErrorResponse(ERROR_CODES.PERMISSION_DENIED, authResult.message, {}, requestId);
    }

    // 入力検証
    if (!staffId) {
      return buildErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'staffId is required', {}, requestId);
    }

    if (!endDate || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return buildErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'endDate must be in YYYY-MM-DD format', {}, requestId);
    }

    // Service呼び出し
    const result = PayoutService.calculatePayout(staffId, endDate);

    // スタッフ名を付与
    const staff = StaffRepository.findById(staffId);
    result.staffName = staff ? staff.name : '(不明)';

    return buildSuccessResponse(result, requestId);

  } catch (error) {
    console.error('getUnpaidSummary error:', error);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, error.message, {}, requestId);
  }
}

/**
 * 未払いスタッフ一覧を取得
 * @param {string} endDate - 集計終了日
 * @returns {Object} APIレスポンス
 */
function getUnpaidStaffList(endDate) {
  const requestId = generateRequestId();

  try {
    // 認可チェック
    const authResult = checkPermission(ROLES.STAFF);
    if (!authResult.allowed) {
      return buildErrorResponse(ERROR_CODES.PERMISSION_DENIED, authResult.message, {}, requestId);
    }

    if (!endDate) {
      // デフォルトは今日
      endDate = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
    }

    const result = PayoutService.getUnpaidStaffList(endDate);

    return buildSuccessResponse({
      endDate: endDate,
      staffList: result,
      totalCount: result.length,
      totalAmount: result.reduce((sum, s) => sum + s.estimatedAmount, 0)
    }, requestId);

  } catch (error) {
    console.error('getUnpaidStaffList error:', error);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, error.message, {}, requestId);
  }
}

/**
 * 支払いを生成
 * @param {string} staffId - スタッフID
 * @param {string} endDate - 集計終了日
 * @param {Object} options - オプション { adjustment_amount, notes }
 * @returns {Object} APIレスポンス
 */
function generatePayout(staffId, endDate, options = {}) {
  const requestId = generateRequestId();

  try {
    // 認可チェック（manager以上）
    const authResult = checkPermission(ROLES.MANAGER);
    if (!authResult.allowed) {
      return buildErrorResponse(ERROR_CODES.PERMISSION_DENIED, authResult.message, {}, requestId);
    }

    // 入力検証
    if (!staffId) {
      return buildErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'staffId is required', {}, requestId);
    }

    if (!endDate || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return buildErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'endDate must be in YYYY-MM-DD format', {}, requestId);
    }

    // Service呼び出し
    const result = PayoutService.generatePayout(staffId, endDate, options);

    if (!result.success) {
      return buildErrorResponse(ERROR_CODES.VALIDATION_ERROR, result.error, { message: result.message }, requestId);
    }

    return buildSuccessResponse(result, requestId);

  } catch (error) {
    console.error('generatePayout error:', error);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, error.message, {}, requestId);
  }
}

/**
 * 複数スタッフの支払いを一括生成
 * @param {string[]} staffIds - スタッフID配列
 * @param {string} endDate - 集計終了日
 * @returns {Object} APIレスポンス
 */
function bulkGeneratePayouts(staffIds, endDate) {
  const requestId = generateRequestId();

  try {
    // 認可チェック（manager以上）
    const authResult = checkPermission(ROLES.MANAGER);
    if (!authResult.allowed) {
      return buildErrorResponse(ERROR_CODES.PERMISSION_DENIED, authResult.message, {}, requestId);
    }

    // 入力検証
    if (!staffIds || !Array.isArray(staffIds) || staffIds.length === 0) {
      return buildErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'staffIds array is required', {}, requestId);
    }

    if (!endDate || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return buildErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'endDate must be in YYYY-MM-DD format', {}, requestId);
    }

    // Service呼び出し
    const result = PayoutService.bulkGenerate(staffIds, endDate);

    return buildSuccessResponse(result, requestId);

  } catch (error) {
    console.error('bulkGeneratePayouts error:', error);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, error.message, {}, requestId);
  }
}

/**
 * 支払い一覧を検索
 * @param {Object} query - 検索条件
 * @returns {Object} APIレスポンス
 */
function searchPayouts(query = {}) {
  const requestId = generateRequestId();

  try {
    // 認可チェック
    const authResult = checkPermission(ROLES.STAFF);
    if (!authResult.allowed) {
      return buildErrorResponse(ERROR_CODES.PERMISSION_DENIED, authResult.message, {}, requestId);
    }

    // Service呼び出し
    const payouts = PayoutService.search(query);

    return buildSuccessResponse({
      payouts: payouts,
      count: payouts.length
    }, requestId);

  } catch (error) {
    console.error('searchPayouts error:', error);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, error.message, {}, requestId);
  }
}

/**
 * 支払い詳細を取得
 * @param {string} payoutId - 支払ID
 * @returns {Object} APIレスポンス
 */
function getPayout(payoutId) {
  const requestId = generateRequestId();

  try {
    // 認可チェック
    const authResult = checkPermission(ROLES.STAFF);
    if (!authResult.allowed) {
      return buildErrorResponse(ERROR_CODES.PERMISSION_DENIED, authResult.message, {}, requestId);
    }

    if (!payoutId) {
      return buildErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'payoutId is required', {}, requestId);
    }

    const payout = PayoutService.get(payoutId);

    if (!payout) {
      return buildErrorResponse(ERROR_CODES.NOT_FOUND, 'Payout not found', {}, requestId);
    }

    return buildSuccessResponse({ payout: payout }, requestId);

  } catch (error) {
    console.error('getPayout error:', error);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, error.message, {}, requestId);
  }
}

/**
 * 支払い履歴を取得
 * @param {string} staffId - スタッフID
 * @param {Object} options - オプション { limit }
 * @returns {Object} APIレスポンス
 */
function getPayoutHistory(staffId, options = {}) {
  const requestId = generateRequestId();

  try {
    // 認可チェック
    const authResult = checkPermission(ROLES.STAFF);
    if (!authResult.allowed) {
      return buildErrorResponse(ERROR_CODES.PERMISSION_DENIED, authResult.message, {}, requestId);
    }

    if (!staffId) {
      return buildErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'staffId is required', {}, requestId);
    }

    const history = PayoutService.getHistory(staffId, options);

    return buildSuccessResponse({
      staffId: staffId,
      history: history,
      count: history.length
    }, requestId);

  } catch (error) {
    console.error('getPayoutHistory error:', error);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, error.message, {}, requestId);
  }
}

/**
 * 支払いステータスを更新
 * @param {string} payoutId - 支払ID
 * @param {string} status - 新ステータス（draft/confirmed/paid）
 * @param {string} expectedUpdatedAt - 楽観ロック用
 * @returns {Object} APIレスポンス
 */
function updatePayoutStatus(payoutId, status, expectedUpdatedAt) {
  const requestId = generateRequestId();

  try {
    // 認可チェック（manager以上）
    const authResult = checkPermission(ROLES.MANAGER);
    if (!authResult.allowed) {
      return buildErrorResponse(ERROR_CODES.PERMISSION_DENIED, authResult.message, {}, requestId);
    }

    // 入力検証
    if (!payoutId) {
      return buildErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'payoutId is required', {}, requestId);
    }

    const validStatuses = ['draft', 'confirmed', 'paid'];
    if (!validStatuses.includes(status)) {
      return buildErrorResponse(ERROR_CODES.VALIDATION_ERROR, `status must be one of: ${validStatuses.join(', ')}`, {}, requestId);
    }

    // Service呼び出し
    const result = PayoutService.updateStatus(payoutId, status, expectedUpdatedAt);

    if (!result.success) {
      const errorCode = result.error === 'CONFLICT_ERROR'
        ? ERROR_CODES.CONFLICT_ERROR
        : ERROR_CODES.VALIDATION_ERROR;
      return buildErrorResponse(errorCode, result.error, { message: result.message }, requestId);
    }

    return buildSuccessResponse(result, requestId);

  } catch (error) {
    console.error('updatePayoutStatus error:', error);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, error.message, {}, requestId);
  }
}

/**
 * 支払いを削除
 * @param {string} payoutId - 支払ID
 * @param {string} expectedUpdatedAt - 楽観ロック用
 * @returns {Object} APIレスポンス
 */
function deletePayout(payoutId, expectedUpdatedAt) {
  const requestId = generateRequestId();

  try {
    // 認可チェック（manager以上）
    const authResult = checkPermission(ROLES.MANAGER);
    if (!authResult.allowed) {
      return buildErrorResponse(ERROR_CODES.PERMISSION_DENIED, authResult.message, {}, requestId);
    }

    if (!payoutId) {
      return buildErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'payoutId is required', {}, requestId);
    }

    // Service呼び出し
    const result = PayoutService.delete(payoutId, expectedUpdatedAt);

    if (!result.success) {
      const errorCode = result.error === 'CONFLICT_ERROR'
        ? ERROR_CODES.CONFLICT_ERROR
        : ERROR_CODES.VALIDATION_ERROR;
      return buildErrorResponse(errorCode, result.error, { message: result.message }, requestId);
    }

    return buildSuccessResponse(result, requestId);

  } catch (error) {
    console.error('deletePayout error:', error);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, error.message, {}, requestId);
  }
}

/**
 * 支払いを更新（調整額・備考）
 * @param {Object} payout - 更新データ
 * @param {string} expectedUpdatedAt - 楽観ロック用
 * @returns {Object} APIレスポンス
 */
function savePayout(payout, expectedUpdatedAt) {
  const requestId = generateRequestId();

  try {
    // 認可チェック（manager以上）
    const authResult = checkPermission(ROLES.MANAGER);
    if (!authResult.allowed) {
      return buildErrorResponse(ERROR_CODES.PERMISSION_DENIED, authResult.message, {}, requestId);
    }

    if (!payout || !payout.payout_id) {
      return buildErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'payout.payout_id is required', {}, requestId);
    }

    // total_amountを再計算
    if (payout.adjustment_amount !== undefined) {
      const current = PayoutRepository.findById(payout.payout_id);
      if (current) {
        payout.total_amount = current.base_amount + current.transport_amount +
          (Number(payout.adjustment_amount) || 0) - (Number(payout.tax_amount) || current.tax_amount || 0);
      }
    }

    // Service呼び出し
    const result = PayoutService.update(payout, expectedUpdatedAt);

    if (!result.success) {
      const errorCode = result.error === 'CONFLICT_ERROR'
        ? ERROR_CODES.CONFLICT_ERROR
        : ERROR_CODES.VALIDATION_ERROR;
      return buildErrorResponse(errorCode, result.error, {}, requestId);
    }

    return buildSuccessResponse(result, requestId);

  } catch (error) {
    console.error('savePayout error:', error);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, error.message, {}, requestId);
  }
}
