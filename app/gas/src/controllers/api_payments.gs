/**
 * Payment API Controller
 *
 * 入金管理のAPI（google.script.run対象）
 * 売掛金管理の完結を目的とした入金記録機能
 */

/**
 * 入金を記録
 * @param {string} invoiceId - 請求書ID
 * @param {Object} paymentData - 入金データ
 * @param {string} paymentData.payment_date - 入金日（YYYY-MM-DD）
 * @param {number} paymentData.amount - 入金額
 * @param {string} paymentData.payment_method - 入金方法（bank_transfer/cash/other）
 * @param {string} [paymentData.bank_ref] - 銀行参照番号
 * @param {string} [paymentData.notes] - 備考
 * @param {string} expectedUpdatedAt - 請求書の期待するupdated_at（楽観ロック）
 * @returns {Object} APIレスポンス
 */
function recordPayment(invoiceId, paymentData, expectedUpdatedAt) {
  const requestId = generateRequestId();

  try {
    // 1. 認可チェック（manager以上）
    const authResult = checkPermission(ROLES.MANAGER);
    if (!authResult.allowed) {
      return buildErrorResponse(
        ERROR_CODES.PERMISSION_DENIED,
        authResult.message,
        {},
        requestId
      );
    }

    // 2. 入力検証
    if (!invoiceId) {
      return buildErrorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        'invoiceId is required',
        {},
        requestId
      );
    }

    if (!paymentData) {
      return buildErrorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        'paymentData is required',
        {},
        requestId
      );
    }

    const amount = parseFloat(paymentData.amount);
    if (isNaN(amount) || amount <= 0) {
      return buildErrorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        '入金額は0より大きい値を入力してください',
        {},
        requestId
      );
    }

    // 日付形式チェック
    if (paymentData.payment_date && !/^\d{4}-\d{2}-\d{2}$/.test(paymentData.payment_date)) {
      return buildErrorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        '入金日はYYYY-MM-DD形式で入力してください',
        {},
        requestId
      );
    }

    // 入金方法チェック
    const validMethods = ['bank_transfer', 'cash', 'other'];
    if (paymentData.payment_method && !validMethods.includes(paymentData.payment_method)) {
      return buildErrorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        '無効な入金方法です',
        {},
        requestId
      );
    }

    // 3. Service呼び出し
    const result = PaymentService.recordPayment(invoiceId, paymentData, expectedUpdatedAt);

    if (!result.success) {
      const errorCode = result.error === 'CONFLICT' ? ERROR_CODES.CONFLICT_ERROR : ERROR_CODES.VALIDATION_ERROR;
      return buildErrorResponse(errorCode, result.message || result.error, result, requestId);
    }

    return buildSuccessResponse(result, requestId);

  } catch (error) {
    Logger.log(`recordPayment error: ${error.message}`);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, error.message, {}, requestId);
  }
}

/**
 * 入金履歴を取得
 * @param {string} invoiceId - 請求書ID
 * @returns {Object} APIレスポンス { payments, totalPaid, outstanding }
 */
function getPaymentsByInvoice(invoiceId) {
  const requestId = generateRequestId();

  try {
    // 1. 認可チェック（staff以上）
    const authResult = checkPermission(ROLES.STAFF);
    if (!authResult.allowed) {
      return buildErrorResponse(
        ERROR_CODES.PERMISSION_DENIED,
        authResult.message,
        {},
        requestId
      );
    }

    // 2. 入力検証
    if (!invoiceId) {
      return buildErrorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        'invoiceId is required',
        {},
        requestId
      );
    }

    // 3. Service呼び出し
    const result = PaymentService.getPaymentsByInvoice(invoiceId);

    if (!result.success) {
      return buildErrorResponse(ERROR_CODES.NOT_FOUND, result.message || result.error, {}, requestId);
    }

    return buildSuccessResponse(result, requestId);

  } catch (error) {
    Logger.log(`getPaymentsByInvoice error: ${error.message}`);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, error.message, {}, requestId);
  }
}

/**
 * 入金を削除（論理削除）
 * @param {string} paymentId - 入金ID
 * @param {string} invoiceExpectedUpdatedAt - 請求書の期待するupdated_at（楽観ロック）
 * @returns {Object} APIレスポンス
 */
function deletePayment(paymentId, invoiceExpectedUpdatedAt) {
  const requestId = generateRequestId();

  try {
    // 1. 認可チェック（manager以上）
    const authResult = checkPermission(ROLES.MANAGER);
    if (!authResult.allowed) {
      return buildErrorResponse(
        ERROR_CODES.PERMISSION_DENIED,
        authResult.message,
        {},
        requestId
      );
    }

    // 2. 入力検証
    if (!paymentId) {
      return buildErrorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        'paymentId is required',
        {},
        requestId
      );
    }

    // 3. Service呼び出し
    const result = PaymentService.deletePayment(paymentId, invoiceExpectedUpdatedAt);

    if (!result.success) {
      const errorCode = result.error === 'CONFLICT' ? ERROR_CODES.CONFLICT_ERROR : ERROR_CODES.VALIDATION_ERROR;
      return buildErrorResponse(errorCode, result.message || result.error, result, requestId);
    }

    return buildSuccessResponse(result, requestId);

  } catch (error) {
    Logger.log(`deletePayment error: ${error.message}`);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, error.message, {}, requestId);
  }
}
