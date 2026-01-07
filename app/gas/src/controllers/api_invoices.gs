/**
 * Invoice API Controller
 *
 * 請求管理のAPI（google.script.run対象）
 * KTSM-86: Phase 2 請求管理機能
 */

/**
 * 顧客一覧を取得（請求画面用）
 * @returns {Object} { ok: true, data: { customers: [] } }
 */
function getCustomers() {
  try {
    const result = listCustomers({ includeInactive: false });
    if (result.ok) {
      // listCustomers returns { items: [...], count: N }
      return buildSuccessResponse({ customers: result.data.items || [] });
    }
    return result;
  } catch (error) {
    console.error('getCustomers error:', error);
    return buildErrorResponse('SYSTEM_ERROR', error.message);
  }
}

/**
 * 請求書を生成
 * @param {string} customerId - 顧客ID
 * @param {string} ym - 対象年月（YYYY-MM形式）
 * @param {Object} options - オプション
 * @returns {Object} APIレスポンス
 */
function generateInvoice(customerId, ym, options = {}) {
  const requestId = generateRequestId();

  try {
    // 認可チェック（manager以上）
    const authResult = checkPermission(ROLES.MANAGER);
    if (!authResult.allowed) {
      return buildErrorResponse(
        ERROR_CODES.PERMISSION_DENIED,
        authResult.message,
        {},
        requestId
      );
    }

    // 入力検証
    if (!customerId) {
      return buildErrorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        'customerId is required',
        {},
        requestId
      );
    }

    if (!ym || !/^\d{4}-\d{2}$/.test(ym)) {
      return buildErrorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        'ym must be in YYYY-MM format',
        {},
        requestId
      );
    }

    // 年月を分解
    const [year, month] = ym.split('-').map(Number);

    // Service呼び出し
    const result = InvoiceService.generate(customerId, year, month, options);

    if (!result.success) {
      const errorCode = result.error === 'INVOICE_ALREADY_EXISTS'
        ? ERROR_CODES.CONFLICT_ERROR
        : ERROR_CODES.VALIDATION_ERROR;
      return buildErrorResponse(errorCode, result.error, { existingInvoice: result.existingInvoice }, requestId);
    }

    return buildSuccessResponse(result, requestId);

  } catch (error) {
    Logger.log(`generateInvoice error: ${error.message}`);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, error.message, {}, requestId);
  }
}

/**
 * 請求書一覧を検索
 * @param {Object} query - 検索条件
 * @returns {Object} APIレスポンス
 */
function searchInvoices(query) {
  const requestId = generateRequestId();

  try {
    // 認可チェック（staff以上）
    const authResult = checkPermission(ROLES.STAFF);
    if (!authResult.allowed) {
      return buildErrorResponse(ERROR_CODES.PERMISSION_DENIED, authResult.message, {}, requestId);
    }

    // Service呼び出し
    const invoices = InvoiceService.search(query || {});

    return buildSuccessResponse({ invoices: invoices }, requestId);

  } catch (error) {
    Logger.log(`searchInvoices error: ${error.message}`);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, error.message, {}, requestId);
  }
}

/**
 * 請求書を取得（明細付き）
 * @param {string} invoiceId - 請求ID
 * @returns {Object} APIレスポンス
 */
function getInvoice(invoiceId) {
  const requestId = generateRequestId();

  try {
    // 認可チェック（staff以上）
    const authResult = checkPermission(ROLES.STAFF);
    if (!authResult.allowed) {
      return buildErrorResponse(ERROR_CODES.PERMISSION_DENIED, authResult.message, {}, requestId);
    }

    // 入力検証
    if (!invoiceId) {
      return buildErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'invoiceId is required', {}, requestId);
    }

    // Service呼び出し
    const invoice = InvoiceService.get(invoiceId);

    if (!invoice) {
      return buildErrorResponse(ERROR_CODES.NOT_FOUND, 'Invoice not found', {}, requestId);
    }

    return buildSuccessResponse(invoice, requestId);

  } catch (error) {
    Logger.log(`getInvoice error: ${error.message}`);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, error.message, {}, requestId);
  }
}

/**
 * 請求書を保存
 * @param {Object} invoice - 請求書データ
 * @param {Object[]} lines - 明細データ
 * @param {string} expectedUpdatedAt - 期待するupdated_at
 * @returns {Object} APIレスポンス
 */
function saveInvoice(invoice, lines, expectedUpdatedAt) {
  const requestId = generateRequestId();

  try {
    // 認可チェック（manager以上）
    const authResult = checkPermission(ROLES.MANAGER);
    if (!authResult.allowed) {
      return buildErrorResponse(ERROR_CODES.PERMISSION_DENIED, authResult.message, {}, requestId);
    }

    // 入力検証
    if (!invoice || !invoice.invoice_id) {
      return buildErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'invoice.invoice_id is required', {}, requestId);
    }

    // Service呼び出し
    const result = InvoiceService.save(invoice, lines, expectedUpdatedAt);

    if (!result.success) {
      const errorCode = result.error === 'CONFLICT_ERROR'
        ? ERROR_CODES.CONFLICT_ERROR
        : ERROR_CODES.VALIDATION_ERROR;
      return buildErrorResponse(errorCode, result.error, {}, requestId);
    }

    return buildSuccessResponse(result, requestId);

  } catch (error) {
    Logger.log(`saveInvoice error: ${error.message}`);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, error.message, {}, requestId);
  }
}

/**
 * 請求書ステータスを更新
 * @param {string} invoiceId - 請求ID
 * @param {string} status - 新しいステータス
 * @param {string} expectedUpdatedAt - 期待するupdated_at
 * @returns {Object} APIレスポンス
 */
function updateInvoiceStatus(invoiceId, status, expectedUpdatedAt) {
  const requestId = generateRequestId();

  try {
    // 認可チェック（manager以上）
    const authResult = checkPermission(ROLES.MANAGER);
    if (!authResult.allowed) {
      return buildErrorResponse(ERROR_CODES.PERMISSION_DENIED, authResult.message, {}, requestId);
    }

    // 入力検証
    if (!invoiceId) {
      return buildErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'invoiceId is required', {}, requestId);
    }

    if (!status) {
      return buildErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'status is required', {}, requestId);
    }

    // Service呼び出し
    const result = InvoiceService.updateStatus(invoiceId, status, expectedUpdatedAt);

    if (!result.success) {
      const errorCode = result.error === 'CONFLICT_ERROR'
        ? ERROR_CODES.CONFLICT_ERROR
        : result.error === 'NOT_FOUND'
        ? ERROR_CODES.NOT_FOUND
        : ERROR_CODES.VALIDATION_ERROR;
      return buildErrorResponse(errorCode, result.error, {}, requestId);
    }

    return buildSuccessResponse(result, requestId);

  } catch (error) {
    Logger.log(`updateInvoiceStatus error: ${error.message}`);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, error.message, {}, requestId);
  }
}

/**
 * 請求書を出力（PDF/Excel/編集）
 * @param {string} invoiceId - 請求ID
 * @param {string} mode - 出力モード（pdf/excel/edit）
 * @param {Object} options - オプション
 * @returns {Object} APIレスポンス { fileId, url }
 */
function exportInvoice(invoiceId, mode, options = {}) {
  const requestId = generateRequestId();

  try {
    // 認可チェック（manager以上）
    const authResult = checkPermission(ROLES.MANAGER);
    if (!authResult.allowed) {
      return buildErrorResponse(ERROR_CODES.PERMISSION_DENIED, authResult.message, {}, requestId);
    }

    // 入力検証
    if (!invoiceId) {
      return buildErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'invoiceId is required', {}, requestId);
    }

    const validModes = ['pdf', 'excel', 'edit'];
    if (!mode || !validModes.includes(mode)) {
      return buildErrorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        `mode must be one of: ${validModes.join(', ')}`,
        {},
        requestId
      );
    }

    // Service呼び出し
    const result = InvoiceExportService.export(invoiceId, mode, options);

    if (!result.success) {
      return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, result.error, {}, requestId);
    }

    return buildSuccessResponse(result, requestId);

  } catch (error) {
    Logger.log(`exportInvoice error: ${error.message}`);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, error.message, {}, requestId);
  }
}

/**
 * 請求書を削除
 * @param {string} invoiceId - 請求ID
 * @param {string} expectedUpdatedAt - 期待するupdated_at
 * @returns {Object} APIレスポンス
 */
function deleteInvoice(invoiceId, expectedUpdatedAt) {
  const requestId = generateRequestId();

  try {
    // 認可チェック（manager以上）
    const authResult = checkPermission(ROLES.MANAGER);
    if (!authResult.allowed) {
      return buildErrorResponse(ERROR_CODES.PERMISSION_DENIED, authResult.message, {}, requestId);
    }

    // 入力検証
    if (!invoiceId) {
      return buildErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'invoiceId is required', {}, requestId);
    }

    // Service呼び出し
    const result = InvoiceService.delete(invoiceId, expectedUpdatedAt);

    if (!result.success) {
      const errorCode = result.error === 'NOT_FOUND'
        ? ERROR_CODES.NOT_FOUND
        : result.error === 'CANNOT_DELETE_ISSUED_INVOICE'
        ? ERROR_CODES.VALIDATION_ERROR
        : ERROR_CODES.SYSTEM_ERROR;
      return buildErrorResponse(errorCode, result.error, {}, requestId);
    }

    return buildSuccessResponse({ deleted: true }, requestId);

  } catch (error) {
    Logger.log(`deleteInvoice error: ${error.message}`);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, error.message, {}, requestId);
  }
}

/**
 * 請求書を再生成
 * @param {string} invoiceId - 請求ID
 * @returns {Object} APIレスポンス
 */
function regenerateInvoice(invoiceId) {
  const requestId = generateRequestId();

  try {
    // 認可チェック（manager以上）
    const authResult = checkPermission(ROLES.MANAGER);
    if (!authResult.allowed) {
      return buildErrorResponse(ERROR_CODES.PERMISSION_DENIED, authResult.message, {}, requestId);
    }

    // 入力検証
    if (!invoiceId) {
      return buildErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'invoiceId is required', {}, requestId);
    }

    // Service呼び出し
    const result = InvoiceService.regenerate(invoiceId);

    if (!result.success) {
      return buildErrorResponse(ERROR_CODES.VALIDATION_ERROR, result.error, {}, requestId);
    }

    return buildSuccessResponse(result, requestId);

  } catch (error) {
    Logger.log(`regenerateInvoice error: ${error.message}`);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, error.message, {}, requestId);
  }
}

/**
 * 請求データをエクスポート（集計データ）
 * @param {string} ym - 対象年月（YYYY-MM形式）
 * @param {string} format - 出力形式（xlsx/csv）
 * @returns {Object} APIレスポンス { fileId, url }
 */
function exportBillingData(ym, format = 'xlsx') {
  const requestId = generateRequestId();

  try {
    // 認可チェック（manager以上）
    const authResult = checkPermission(ROLES.MANAGER);
    if (!authResult.allowed) {
      return buildErrorResponse(ERROR_CODES.PERMISSION_DENIED, authResult.message, {}, requestId);
    }

    // 入力検証
    if (!ym || !/^\d{4}-\d{2}$/.test(ym)) {
      return buildErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'ym must be in YYYY-MM format', {}, requestId);
    }

    const validFormats = ['xlsx', 'csv'];
    if (!validFormats.includes(format)) {
      return buildErrorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        `format must be one of: ${validFormats.join(', ')}`,
        {},
        requestId
      );
    }

    // 年月を分解
    const [year, month] = ym.split('-').map(Number);

    // 対象期間の請求書を取得
    const invoices = InvoiceService.search({
      billing_year: year,
      billing_month: month
    });

    // 集計データを作成
    const data = invoices.map(inv => ({
      請求番号: inv.invoice_number,
      顧客名: inv.customer?.company_name || '',
      請求年月: `${inv.billing_year}/${inv.billing_month}`,
      発行日: inv.issue_date,
      支払期限: inv.due_date,
      小計: inv.subtotal,
      諸経費: inv.expense_amount,
      消費税: inv.tax_amount,
      合計: inv.total_amount,
      ステータス: inv.status,
      書式: inv.invoice_format
    }));

    // スプレッドシートを作成
    const spreadsheet = SpreadsheetApp.create(`請求データ_${ym}`);
    const sheet = spreadsheet.getActiveSheet();

    // ヘッダー
    if (data.length > 0) {
      const headers = Object.keys(data[0]);
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

      // データ
      const rows = data.map(row => headers.map(h => row[h]));
      sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
    }

    SpreadsheetApp.flush();

    // フォーマットに応じて出力
    let blob;
    let fileName;
    const spreadsheetId = spreadsheet.getId();

    if (format === 'csv') {
      const csvContent = this._convertToCSV(data);
      blob = Utilities.newBlob(csvContent, 'text/csv');
      fileName = `請求データ_${ym}.csv`;
    } else {
      const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=xlsx`;
      const token = ScriptApp.getOAuthToken();
      const response = UrlFetchApp.fetch(url, {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      blob = response.getBlob();
      fileName = `請求データ_${ym}.xlsx`;
    }

    blob.setName(fileName);

    // ファイルを保存
    const file = DriveApp.createFile(blob);

    // 一時スプレッドシートを削除
    DriveApp.getFileById(spreadsheetId).setTrashed(true);

    return buildSuccessResponse({
      fileId: file.getId(),
      url: file.getUrl()
    }, requestId);

  } catch (error) {
    Logger.log(`exportBillingData error: ${error.message}`);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, error.message, {}, requestId);
  }
}

/**
 * 配列をCSV形式に変換
 * @param {Object[]} data - データ配列
 * @returns {string} CSV文字列
 */
function _convertToCSV(data) {
  if (!data || data.length === 0) return '';

  const headers = Object.keys(data[0]);
  const rows = data.map(row =>
    headers.map(h => {
      const value = row[h];
      // カンマや改行を含む場合はダブルクォートで囲む
      if (String(value).includes(',') || String(value).includes('\n')) {
        return `"${String(value).replace(/"/g, '""')}"`;
      }
      return value;
    }).join(',')
  );

  return [headers.join(','), ...rows].join('\n');
}
