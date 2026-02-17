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
function recordPayment(invoiceId: string, paymentData: Record<string, unknown>, expectedUpdatedAt: string) {
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

    if (!expectedUpdatedAt) {
      return buildErrorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        'expectedUpdatedAt is required',
        {},
        requestId
      );
    }

    if (!paymentData.payment_date) {
      return buildErrorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        '入金日は必須です',
        {},
        requestId
      );
    }

    const amount = parseFloat(String(paymentData.amount));
    if (isNaN(amount) || amount <= 0) {
      return buildErrorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        '入金額は0より大きい値を入力してください',
        {},
        requestId
      );
    }

    // 日付形式チェック
    if (paymentData.payment_date && !/^\d{4}-\d{2}-\d{2}$/.test(String(paymentData.payment_date))) {
      return buildErrorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        '入金日はYYYY-MM-DD形式で入力してください',
        {},
        requestId
      );
    }

    // 入金方法チェック
    const validMethods = ['bank_transfer', 'cash', 'other'];
    if (paymentData.payment_method && !validMethods.includes(String(paymentData.payment_method))) {
      return buildErrorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        '無効な入金方法です',
        {},
        requestId
      );
    }

    const paymentInput: PaymentInput = {
      payment_date: String(paymentData.payment_date),
      amount: amount,
      payment_method: paymentData.payment_method ? String(paymentData.payment_method) : 'bank_transfer',
      bank_ref: paymentData.bank_ref ? String(paymentData.bank_ref) : '',
      notes: paymentData.notes ? String(paymentData.notes) : ''
    };

    // 3. Service呼び出し
    const result = PaymentService.recordPayment(invoiceId, paymentInput, expectedUpdatedAt);

    if (!result.success) {
      const errorCode = result.error === 'CONFLICT' ? ERROR_CODES.CONFLICT_ERROR : ERROR_CODES.VALIDATION_ERROR;
      return buildErrorResponse(errorCode, result.message || result.error || "エラー", result, requestId);
    }

    return buildSuccessResponse(result, requestId);

  } catch (error) {
    Logger.log(`recordPayment error: ${(error instanceof Error) ? error.message : String(error)}`);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, '予期しないエラーが発生しました。しばらくしてから再度お試しください。', {}, requestId);
  }
}

/**
 * 入金履歴を取得
 * @param {string} invoiceId - 請求書ID
 * @returns {Object} APIレスポンス { payments, totalPaid, outstanding }
 */
function getPaymentsByInvoice(invoiceId: string) {
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
      return buildErrorResponse(ERROR_CODES.NOT_FOUND, result.message || result.error || "エラー", {}, requestId);
    }

    return buildSuccessResponse(result, requestId);

  } catch (error) {
    Logger.log(`getPaymentsByInvoice error: ${(error instanceof Error) ? error.message : String(error)}`);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, '予期しないエラーが発生しました。しばらくしてから再度お試しください。', {}, requestId);
  }
}

/**
 * 入金を削除（論理削除）
 * @param {string} paymentId - 入金ID
 * @param {string} invoiceExpectedUpdatedAt - 請求書の期待するupdated_at（楽観ロック）
 * @returns {Object} APIレスポンス
 */
function deletePayment(paymentId: string, invoiceExpectedUpdatedAt: string) {
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

    if (!invoiceExpectedUpdatedAt) {
      return buildErrorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        'invoiceExpectedUpdatedAt is required',
        {},
        requestId
      );
    }

    // 3. Service呼び出し
    const result = PaymentService.deletePayment(paymentId, invoiceExpectedUpdatedAt);

    if (!result.success) {
      const errorCode = result.error === 'CONFLICT' ? ERROR_CODES.CONFLICT_ERROR : ERROR_CODES.VALIDATION_ERROR;
      return buildErrorResponse(errorCode, result.message || result.error || "エラー", result, requestId);
    }

    return buildSuccessResponse(result, requestId);

  } catch (error) {
    Logger.log(`deletePayment error: ${(error instanceof Error) ? error.message : String(error)}`);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, '予期しないエラーが発生しました。しばらくしてから再度お試しください。', {}, requestId);
  }
}
