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
    const result = listCustomers({ activeOnly: true });
    if (result.ok) {
      // listCustomers returns { items: [...], count: N }
      return buildSuccessResponse({ customers: result.data.items || [] });
    }
    return result;
  } catch (error) {
    logErr('getCustomers', error);
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
      const errorMessages = {
        'NO_ASSIGNMENTS_FOUND': '該当期間の配置データがありません',
        'INVOICE_ALREADY_EXISTS': '既に請求書が存在します',
        'CUSTOMER_NOT_FOUND': '顧客が見つかりません'
      };
      const message = errorMessages[result.error] || result.error;
      return buildErrorResponse(errorCode, message, { existingInvoice: result.existingInvoice }, requestId);
    }

    return buildSuccessResponse(result, requestId);

  } catch (error) {
    Logger.log(`generateInvoice error: ${error.message}`);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, error.message, {}, requestId);
  }
}

/**
 * 請求書を一括生成（全アクティブ顧客）
 * @param {string} ym - 対象年月（YYYY-MM形式）
 * @param {Object} options - オプション { overwrite: false }
 * @returns {Object} APIレスポンス { success, skippedNoData, skippedExisting, failed }
 */
function bulkGenerateInvoices(ym, options = {}) {
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

    // 年月を分解
    const [year, month] = ym.split('-').map(Number);

    // Service呼び出し
    const result = InvoiceService.bulkGenerate(year, month, options || {});

    return buildSuccessResponse(result, requestId);

  } catch (error) {
    Logger.log(`bulkGenerateInvoices error: ${error.message}`);
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

    // 期限超過の請求書を自動的に「未回収」ステータスに更新
    // （sent かつ due_date < 今日 → unpaid）
    try {
      const overdueResult = InvoiceRepository.autoMarkOverdue();
      if (overdueResult.updated > 0) {
        Logger.log(`autoMarkOverdue: ${overdueResult.updated}件を未回収に更新`);
      }
    } catch (overdueError) {
      // 自動更新エラーは検索自体を妨げない
      console.warn('autoMarkOverdue error:', overdueError.message);
    }

    // Service呼び出し
    const invoices = InvoiceService.search(query || {});

    // 入金情報を一括取得（パフォーマンス最適化）
    if (invoices.length > 0) {
      const invoiceIds = invoices.map(inv => inv.invoice_id);
      const paidMap = PaymentRepository.sumByInvoiceIds(invoiceIds);

      // 各請求書に入金情報を付加
      for (const inv of invoices) {
        inv.total_paid = paidMap.get(inv.invoice_id) || 0;
        inv.outstanding = inv.total_amount - inv.total_paid;
      }
    }

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
 * 請求書ステータスを一括更新
 * @param {Array} updates - 更新対象の配列 [{ invoiceId, updatedAt }, ...]
 * @param {string} status - 新しいステータス
 * @returns {Object} APIレスポンス { success, updated, failed, errors }
 */
function bulkUpdateInvoiceStatus(updates, status) {
  const requestId = generateRequestId();

  try {
    // 認可チェック（manager以上）
    const authResult = checkPermission(ROLES.MANAGER);
    if (!authResult.allowed) {
      return buildErrorResponse(ERROR_CODES.PERMISSION_DENIED, authResult.message, {}, requestId);
    }

    // 入力検証
    if (!Array.isArray(updates) || updates.length === 0) {
      return buildErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'updates is required', {}, requestId);
    }

    if (!status) {
      return buildErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'status is required', {}, requestId);
    }

    // 有効なステータスチェック
    const validStatuses = ['unsent', 'sent', 'unpaid', 'paid'];
    if (!validStatuses.includes(status)) {
      return buildErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'Invalid status', {}, requestId);
    }

    // 入力形式を変換 (updatedAt → expectedUpdatedAt)
    const bulkUpdates = updates.map(item => ({
      invoiceId: item.invoiceId,
      expectedUpdatedAt: item.updatedAt
    }));

    // バルク更新実行（シートI/O 1回）
    const result = InvoiceRepository.bulkUpdateStatus(bulkUpdates, status);

    // 成功した請求書のupdatedAtを取得
    const updatedItems = result.invoices.map(inv => ({
      invoiceId: inv.invoice_id,
      updatedAt: inv.updated_at
    }));

    // エラー情報を抽出
    const errors = result.results
      .filter(r => !r.success)
      .map(r => ({ invoiceId: r.invoiceId, error: r.error }));

    return buildSuccessResponse({
      success: true,
      updated: result.success,
      failed: result.failed,
      updatedItems: updatedItems,
      errors: errors.length > 0 ? errors : undefined
    }, requestId);

  } catch (error) {
    Logger.log(`bulkUpdateInvoiceStatus error: ${error.message}`);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, error.message, {}, requestId);
  }
}

/**
 * 請求書エクスポート時の同名ファイル存在チェック
 * @param {string} invoiceId - 請求ID
 * @param {string} mode - 出力モード（pdf/excel/cover）
 * @param {Object} options - オプション（includeCoverPage: true で頭紙付きファイル名をチェック）
 * @returns {Object} APIレスポンス { exists: boolean, existingFile?: { id, name, url, modifiedDate } }
 */
function checkInvoiceExportFile(invoiceId, mode, options = {}) {
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

    const validModes = ['pdf', 'excel', 'cover'];
    if (!mode || !validModes.includes(mode)) {
      return buildErrorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        `mode must be one of: ${validModes.join(', ')}`,
        {},
        requestId
      );
    }

    // Service呼び出し（optionsを渡して正しいファイル名パターンをチェック）
    const result = InvoiceExportService.checkExistingFile(invoiceId, mode, options);
    return buildSuccessResponse(result, requestId);

  } catch (error) {
    Logger.log(`checkInvoiceExportFile error: ${error.message}`);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, error.message, {}, requestId);
  }
}

/**
 * 請求書を出力（PDF/Excel/編集）
 * @param {string} invoiceId - 請求ID
 * @param {string} mode - 出力モード（pdf/excel/edit）
 * @param {Object} options - オプション（action: 'overwrite'|'rename' で重複ファイル処理を指定）
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

    const validModes = ['pdf', 'excel', 'cover', 'edit'];
    if (!mode || !validModes.includes(mode)) {
      return buildErrorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        `mode must be one of: ${validModes.join(', ')}`,
        {},
        requestId
      );
    }

    // アーカイブデータのエクスポートを拒否（P2-5）
    if (options._archived) {
      return buildErrorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        '過去年度のデータは出力できません。一覧からの参照のみ可能です。',
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
      const errorMessages = {
        'NOT_FOUND': '請求書が見つかりません',
        'CANNOT_REGENERATE_ISSUED_INVOICE': '送付済みの請求書は再生成できません',
        'CANNOT_REGENERATE_SENT_INVOICE': '送付済みの請求書は再生成できません',
        'NO_ASSIGNMENTS_FOUND': '該当期間の配置データがありません'
      };
      const message = errorMessages[result.error] || result.error;
      return buildErrorResponse(ERROR_CODES.VALIDATION_ERROR, message, {}, requestId);
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
 * @param {string} format - 出力形式（xlsx/csv）。csv は @deprecated 2026-06 削除予定
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
      console.warn('[DEPRECATED] CSV出力は 2026-06 に削除予定です。xlsx形式を使用してください。');
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

    // エクスポートフォルダを取得
    const folder = InvoiceExportService._getOutputFolder();

    // ファイルを保存
    const file = folder.createFile(blob);

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
 * 請求書エクスポートフォルダのURLを取得
 * @returns {Object} APIレスポンス
 */
function getBillingExportFolderUrl() {
  const requestId = generateRequestId();

  try {
    const authResult = checkPermission(ROLES.STAFF);
    if (!authResult.allowed) {
      return buildErrorResponse(ERROR_CODES.PERMISSION_DENIED, authResult.message, {}, requestId);
    }

    const status = InvoiceExportService.getExportFolderStatus();
    return buildSuccessResponse(status, requestId);

  } catch (error) {
    Logger.log(`getBillingExportFolderUrl error: ${error.message}`);
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

/**
 * 請求書存在チェック（配置保存時の通知用）
 * 作業日から請求期間を算出し、該当期間の請求書が存在するかチェック
 * @param {string} customerId - 顧客ID
 * @param {string} workDate - 作業日（YYYY-MM-DD形式）
 * @returns {Object} APIレスポンス { exists, invoice? }
 */
function checkInvoiceExistsForJob(customerId, workDate) {
  const requestId = generateRequestId();

  try {
    // 認可チェック（staff以上）
    const authResult = checkPermission(ROLES.STAFF);
    if (!authResult.allowed) {
      return buildErrorResponse(ERROR_CODES.PERMISSION_DENIED, authResult.message, {}, requestId);
    }

    // 入力検証
    if (!customerId || !workDate) {
      return buildErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'customerId and workDate are required', {}, requestId);
    }

    // 顧客情報を取得（締め日を確認）
    const customer = getRecordById('M_Customers', 'customer_id', customerId);
    if (!customer) {
      return buildSuccessResponse({ exists: false }, requestId);
    }

    // 作業日から請求期間を算出
    const closingDay = customer.closing_day || 31;
    const workDateObj = new Date(workDate);
    const { billingYear, billingMonth } = calculateBillingPeriodFromWorkDate_(workDateObj, closingDay);

    // 該当期間の請求書を検索
    const invoices = InvoiceRepository.findByPeriod(billingYear, billingMonth, {
      customer_id: customerId
    });

    if (invoices.length === 0) {
      return buildSuccessResponse({ exists: false }, requestId);
    }

    // 最初の請求書の情報を返す
    const invoice = invoices[0];
    return buildSuccessResponse({
      exists: true,
      invoice: {
        invoice_id: invoice.invoice_id,
        invoice_number: invoice.invoice_number,
        status: invoice.status,
        billing_year: invoice.billing_year,
        billing_month: invoice.billing_month
      }
    }, requestId);

  } catch (error) {
    Logger.log(`checkInvoiceExistsForJob error: ${error.message}`);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, error.message, {}, requestId);
  }
}

/**
 * 作業日から請求期間を算出
 * @param {Date} workDate - 作業日
 * @param {number} closingDay - 締め日（1-31、31=月末）
 * @returns {Object} { billingYear, billingMonth }
 */
function calculateBillingPeriodFromWorkDate_(workDate, closingDay) {
  const year = workDate.getFullYear();
  const month = workDate.getMonth() + 1; // 1-12
  const day = workDate.getDate();

  // 月末締め（31）の場合
  if (closingDay >= 31) {
    return { billingYear: year, billingMonth: month };
  }

  // 締め日が作業日より前の場合、翌月の請求期間
  // 例: 締め日20日、作業日25日 → 翌月請求
  if (day > closingDay) {
    if (month === 12) {
      return { billingYear: year + 1, billingMonth: 1 };
    }
    return { billingYear: year, billingMonth: month + 1 };
  }

  // 締め日以前の作業日 → 当月請求
  return { billingYear: year, billingMonth: month };
}

// ============================================================
// 一括出力 API
// ============================================================

/**
 * 一括出力を開始
 * @param {Object} params - { invoiceIds: string[], exportMode: 'pdf'|'pdf_cover'|'excel' }
 * @returns {Object} APIレスポンス
 */
function startBulkExport(params) {
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
    if (!params || !params.invoiceIds || !Array.isArray(params.invoiceIds)) {
      return buildErrorResponse(
        ERROR_CODES.INVALID_INPUT,
        '出力する請求書を選択してください',
        {},
        requestId
      );
    }

    if (params.invoiceIds.length === 0) {
      return buildErrorResponse(
        ERROR_CODES.INVALID_INPUT,
        '出力する請求書を選択してください',
        {},
        requestId
      );
    }

    const validModes = ['pdf', 'pdf_cover', 'excel'];
    if (!params.exportMode || !validModes.includes(params.exportMode)) {
      return buildErrorResponse(
        ERROR_CODES.INVALID_INPUT,
        '有効な出力モードを選択してください',
        {},
        requestId
      );
    }

    // 一括出力を実行
    const result = InvoiceBulkExportService.executeBulkExport(params);

    // サービス層でエラーが発生した場合はエラーレスポンスを返す
    if (!result.success && result.error !== 'TIMEOUT_WILL_CONTINUE') {
      return buildErrorResponse(
        result.error || ERROR_CODES.SYSTEM_ERROR,
        result.message || '一括出力に失敗しました',
        {},
        requestId
      );
    }

    return buildSuccessResponse(result, requestId);

  } catch (error) {
    logErr('startBulkExport', error, requestId);
    return buildErrorResponse(
      ERROR_CODES.SYSTEM_ERROR,
      error.message,
      {},
      requestId
    );
  }
}

/**
 * 一括出力をキャンセル
 * @param {Object} params - { invoiceIds: string[], exportMode: string }
 * @returns {Object} APIレスポンス
 */
function cancelBulkExport(params) {
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

    const result = InvoiceBulkExportService.cancelExport(params);
    return buildSuccessResponse(result, requestId);

  } catch (error) {
    logErr('cancelBulkExport', error, requestId);
    return buildErrorResponse(
      ERROR_CODES.SYSTEM_ERROR,
      error.message,
      {},
      requestId
    );
  }
}

/**
 * 請求書の詳細を更新（テキスト項目のみ）
 * @param {string} invoiceId - 請求ID
 * @param {Object} headerData - ヘッダー更新データ { issue_date, due_date, notes }
 * @param {Object[]} linesData - 明細更新データ [{ line_id, item_name, time_note, site_name }]
 * @param {string} expectedUpdatedAt - 期待するupdated_at
 * @returns {Object} APIレスポンス
 */
function updateInvoiceDetails(invoiceId, headerData, linesData, expectedUpdatedAt) {
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

    if (!expectedUpdatedAt) {
      return buildErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'expectedUpdatedAt is required', {}, requestId);
    }

    // 日付形式の検証（指定されている場合）
    if (headerData) {
      if (headerData.issue_date && !/^\d{4}-\d{2}-\d{2}$/.test(headerData.issue_date)) {
        return buildErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'issue_date must be in YYYY-MM-DD format', {}, requestId);
      }
      if (headerData.due_date && !/^\d{4}-\d{2}-\d{2}$/.test(headerData.due_date)) {
        return buildErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'due_date must be in YYYY-MM-DD format', {}, requestId);
      }
    }

    // Service呼び出し
    const result = InvoiceService.updateDetails(invoiceId, headerData, linesData, expectedUpdatedAt);

    if (!result.success) {
      const errorCode = result.error === 'CONFLICT_ERROR'
        ? ERROR_CODES.CONFLICT_ERROR
        : result.error === 'NOT_FOUND'
        ? ERROR_CODES.NOT_FOUND
        : result.error === 'CANNOT_EDIT_SENT_INVOICE'
        ? ERROR_CODES.VALIDATION_ERROR
        : ERROR_CODES.SYSTEM_ERROR;

      const errorMessages = {
        'NOT_FOUND': '請求書が見つかりません',
        'CANNOT_EDIT_SENT_INVOICE': '送付済みの請求書は編集できません',
        'CONFLICT_ERROR': '他のユーザーが変更しました。画面を更新してください'
      };
      const message = errorMessages[result.error] || result.error;
      return buildErrorResponse(errorCode, message, {}, requestId);
    }

    return buildSuccessResponse(result, requestId);

  } catch (error) {
    Logger.log(`updateInvoiceDetails error: ${error.message}`);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, error.message, {}, requestId);
  }
}
