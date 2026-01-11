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
 * 支払いを支払済として記録
 * @param {string} staffId - スタッフID
 * @param {string} endDate - 集計終了日
 * @param {Object} options - オプション { adjustment_amount, notes, paid_date }
 * @returns {Object} APIレスポンス
 */
function markAsPaid(staffId, endDate, options = {}) {
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

    // paid_dateの検証（指定された場合）
    if (options.paid_date && !/^\d{4}-\d{2}-\d{2}$/.test(options.paid_date)) {
      return buildErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'paid_date must be in YYYY-MM-DD format', {}, requestId);
    }

    // Service呼び出し
    const result = PayoutService.markAsPaid(staffId, endDate, options);

    if (!result.success) {
      return buildErrorResponse(ERROR_CODES.VALIDATION_ERROR, result.error, { message: result.message }, requestId);
    }

    return buildSuccessResponse(result, requestId);

  } catch (error) {
    console.error('markAsPaid error:', error);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, error.message, {}, requestId);
  }
}

/**
 * 支払いを生成（後方互換性のため残す - markAsPaidを使用推奨）
 * @deprecated markAsPaid() を使用してください
 */
function generatePayout(staffId, endDate, options = {}) {
  return markAsPaid(staffId, endDate, options);
}

/**
 * 複数スタッフの支払いを一括で支払済にする
 * @param {string[]} staffIds - スタッフID配列
 * @param {string} endDate - 集計終了日
 * @param {Object} options - オプション { paid_date, adjustments: { [staffId]: { adjustment_amount, notes } } }
 * @returns {Object} APIレスポンス
 */
function bulkMarkAsPaid(staffIds, endDate, options = {}) {
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

    // paid_dateの検証（指定された場合）
    if (options.paid_date && !/^\d{4}-\d{2}-\d{2}$/.test(options.paid_date)) {
      return buildErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'paid_date must be in YYYY-MM-DD format', {}, requestId);
    }

    // Service呼び出し
    const result = PayoutService.bulkMarkAsPaid(staffIds, endDate, options);

    return buildSuccessResponse(result, requestId);

  } catch (error) {
    console.error('bulkMarkAsPaid error:', error);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, error.message, {}, requestId);
  }
}

/**
 * 複数スタッフの支払いを一括生成（後方互換性のため残す）
 * @deprecated bulkMarkAsPaid() を使用してください
 */
function bulkGeneratePayouts(staffIds, endDate) {
  return bulkMarkAsPaid(staffIds, endDate);
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
 * 支払いステータスを更新（簡素化版 - paid のみ）
 * @param {string} payoutId - 支払ID
 * @param {string} status - 新ステータス（paid のみ）
 * @param {string} expectedUpdatedAt - 楽観ロック用
 * @returns {Object} APIレスポンス
 * @deprecated 通常は markAsPaid() で直接 paid ステータスで作成するため、このAPIは使用しません
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

    // 簡素化: paid のみ許可
    if (status !== 'paid') {
      return buildErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'status must be "paid". Use undoPayout() to cancel.', {}, requestId);
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
 * 支払いを取り消し（未払い状態に戻す）
 * @param {string} payoutId - 支払ID
 * @param {string} expectedUpdatedAt - 楽観ロック用
 * @returns {Object} APIレスポンス
 */
function undoPayout(payoutId, expectedUpdatedAt) {
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
    const result = PayoutService.undoPayout(payoutId, expectedUpdatedAt);

    if (!result.success) {
      const errorCode = result.error === 'CONFLICT_ERROR'
        ? ERROR_CODES.CONFLICT_ERROR
        : ERROR_CODES.VALIDATION_ERROR;
      return buildErrorResponse(errorCode, result.error, { message: result.message }, requestId);
    }

    return buildSuccessResponse(result, requestId);

  } catch (error) {
    console.error('undoPayout error:', error);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, error.message, {}, requestId);
  }
}

/**
 * 支払いを削除（undoPayoutのエイリアス）
 * @param {string} payoutId - 支払ID
 * @param {string} expectedUpdatedAt - 楽観ロック用
 * @returns {Object} APIレスポンス
 */
function deletePayout(payoutId, expectedUpdatedAt) {
  return undoPayout(payoutId, expectedUpdatedAt);
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

// ========== P2-3 New APIs: Confirmed Workflow ==========

/**
 * 支払いを確認済みとして記録（confirmed状態）
 * @param {string} staffId - スタッフID
 * @param {string} endDate - 集計終了日
 * @param {Object} options - オプション { adjustment_amount, notes }
 * @returns {Object} APIレスポンス
 */
function confirmPayout(staffId, endDate, options = {}) {
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
    const result = PayoutService.confirmPayout(staffId, endDate, options);

    if (!result.success) {
      return buildErrorResponse(ERROR_CODES.VALIDATION_ERROR, result.error, { message: result.message }, requestId);
    }

    return buildSuccessResponse(result, requestId);

  } catch (error) {
    console.error('confirmPayout error:', error);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, error.message, {}, requestId);
  }
}

/**
 * 複数スタッフの支払いを一括確認
 * @param {string[]} staffIds - スタッフID配列
 * @param {string} endDate - 集計終了日
 * @param {Object} options - オプション { adjustments: { [staffId]: { adjustment_amount, notes } } }
 * @returns {Object} APIレスポンス
 */
function bulkConfirmPayouts(staffIds, endDate, options = {}) {
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
    const result = PayoutService.bulkConfirmPayouts(staffIds, endDate, options);

    return buildSuccessResponse(result, requestId);

  } catch (error) {
    console.error('bulkConfirmPayouts error:', error);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, error.message, {}, requestId);
  }
}

/**
 * 確認済み支払いを振込完了にする
 * @param {string} payoutId - 支払ID
 * @param {Object} options - オプション { paid_date, expectedUpdatedAt }
 * @returns {Object} APIレスポンス
 */
function payConfirmedPayout(payoutId, options = {}) {
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

    // paid_dateのフォーマット検証
    if (options.paid_date && !/^\d{4}-\d{2}-\d{2}$/.test(options.paid_date)) {
      return buildErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'paid_date must be in YYYY-MM-DD format', {}, requestId);
    }

    // paid_dateの業務整合性検証
    if (options.paid_date) {
      const validationResult = _validatePaidDate(payoutId, options.paid_date);
      if (!validationResult.valid) {
        return buildErrorResponse(ERROR_CODES.VALIDATION_ERROR, validationResult.error, {}, requestId);
      }
    }

    // Service呼び出し
    const result = PayoutService.payConfirmedPayout(payoutId, options);

    if (!result.success) {
      const errorCode = result.error === 'CONFLICT_ERROR'
        ? ERROR_CODES.CONFLICT_ERROR
        : ERROR_CODES.VALIDATION_ERROR;
      return buildErrorResponse(errorCode, result.error, { message: result.message }, requestId);
    }

    return buildSuccessResponse(result, requestId);

  } catch (error) {
    console.error('payConfirmedPayout error:', error);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, error.message, {}, requestId);
  }
}

/**
 * 複数の確認済み支払いを一括振込完了にする
 * @param {string[]} payoutIds - 支払ID配列
 * @param {Object} options - オプション { paid_date }
 * @returns {Object} APIレスポンス
 */
function bulkPayConfirmed(payoutIds, options = {}) {
  const requestId = generateRequestId();

  try {
    // 認可チェック（manager以上）
    const authResult = checkPermission(ROLES.MANAGER);
    if (!authResult.allowed) {
      return buildErrorResponse(ERROR_CODES.PERMISSION_DENIED, authResult.message, {}, requestId);
    }

    // 入力検証
    if (!payoutIds || !Array.isArray(payoutIds) || payoutIds.length === 0) {
      return buildErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'payoutIds array is required', {}, requestId);
    }

    // paid_dateのフォーマット検証
    if (options.paid_date && !/^\d{4}-\d{2}-\d{2}$/.test(options.paid_date)) {
      return buildErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'paid_date must be in YYYY-MM-DD format', {}, requestId);
    }

    // Service呼び出し
    const result = PayoutService.bulkPayConfirmed(payoutIds, options);

    return buildSuccessResponse(result, requestId);

  } catch (error) {
    console.error('bulkPayConfirmed error:', error);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, error.message, {}, requestId);
  }
}

/**
 * 確認済み支払い一覧を取得
 * @param {Object} options - オプション { payout_type }
 * @returns {Object} APIレスポンス
 */
function getConfirmedPayouts(options = {}) {
  const requestId = generateRequestId();

  try {
    // 認可チェック
    const authResult = checkPermission(ROLES.STAFF);
    if (!authResult.allowed) {
      return buildErrorResponse(ERROR_CODES.PERMISSION_DENIED, authResult.message, {}, requestId);
    }

    const payouts = PayoutService.getConfirmedPayouts(options);

    return buildSuccessResponse({
      payouts: payouts,
      count: payouts.length,
      totalAmount: payouts.reduce((sum, p) => sum + (p.total_amount || 0), 0)
    }, requestId);

  } catch (error) {
    console.error('getConfirmedPayouts error:', error);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, error.message, {}, requestId);
  }
}

// ========== Validation Helpers ==========

/**
 * paid_dateの業務整合性を検証
 * @param {string} payoutId - 支払ID
 * @param {string} paidDate - 支払日
 * @returns {Object} { valid: boolean, error?: string }
 */
function _validatePaidDate(payoutId, paidDate) {
  const payout = PayoutRepository.findById(payoutId);
  if (!payout) {
    return { valid: false, error: 'Payout not found' };
  }

  const paidDateObj = new Date(paidDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 1. period_end以降であること
  if (payout.period_end) {
    const periodEndObj = new Date(payout.period_end);
    if (paidDateObj < periodEndObj) {
      return {
        valid: false,
        error: `paid_date must be on or after period_end (${payout.period_end})`
      };
    }
  }

  // 2. 未来日は30日以内であること
  const maxFutureDate = new Date(today);
  maxFutureDate.setDate(maxFutureDate.getDate() + 30);

  if (paidDateObj > maxFutureDate) {
    return {
      valid: false,
      error: 'paid_date cannot be more than 30 days in the future'
    };
  }

  return { valid: true };
}

// ========== Export API ==========

/**
 * 振込金額集計をExcelエクスポート
 * @param {string} fromDate - 開始日（YYYY-MM-DD）
 * @param {string} toDate - 終了日（YYYY-MM-DD）
 * @returns {Object} { ok: true, data: { fileId, url, fileName, recordCount } }
 */
function exportPayouts(fromDate, toDate) {
  const requestId = generateRequestId();

  try {
    // 認可チェック（MANAGER以上）
    const authResult = checkPermission(ROLES.MANAGER);
    if (!authResult.allowed) {
      return buildErrorResponse(ERROR_CODES.PERMISSION_DENIED, '権限がありません', {}, requestId);
    }

    // 日付検証
    if (!fromDate || !toDate) {
      return buildErrorResponse(ERROR_CODES.VALIDATION_ERROR, '開始日と終了日を指定してください', {}, requestId);
    }

    // 日付形式検証
    const fromDateObj = new Date(fromDate);
    const toDateObj = new Date(toDate);

    if (isNaN(fromDateObj.getTime()) || isNaN(toDateObj.getTime())) {
      return buildErrorResponse(ERROR_CODES.VALIDATION_ERROR, '日付形式が不正です', {}, requestId);
    }

    if (fromDateObj > toDateObj) {
      return buildErrorResponse(ERROR_CODES.VALIDATION_ERROR, '開始日は終了日以前を指定してください', {}, requestId);
    }

    // エクスポート実行
    const result = PayoutExportService.exportToExcel(fromDate, toDate);

    // 監査ログ
    AuditLogger.log('PAYOUT_EXPORT', {
      from_date: fromDate,
      to_date: toDate,
      file_id: result.fileId,
      record_count: result.recordCount
    });

    return buildSuccessResponse(result, requestId);

  } catch (error) {
    console.error('exportPayouts error:', error);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, error.message, {}, requestId);
  }
}
