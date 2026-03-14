/**
 * Accounting Report API Controller
 *
 * 税理士向けレポートのExcelエクスポートAPI（google.script.run対象）
 * CR-100: 企業別売上, CR-101: 区分別支払, CR-102: スタッフ別支払
 */

// ========== CR-100: 企業別売上 ==========

/**
 * 企業別売上の月別エクスポート
 * @param fiscalYear - 年度
 * @param month - 月（1-12）
 * @param options - { action?: 'overwrite' | 'rename' }
 */
function exportSalesByCustomerMonthly(fiscalYear: number, month: number, options: { action?: string } = {}): unknown {
  const requestId = generateRequestId();
  try {
    const authResult = checkPermission(ROLES.MANAGER);
    if (!authResult.allowed) {
      return buildErrorResponse(ERROR_CODES.PERMISSION_DENIED, '権限がありません', {}, requestId);
    }

    if (!fiscalYear || !month || month < 1 || month > 12) {
      return buildErrorResponse(ERROR_CODES.VALIDATION_ERROR, '年度と月（1-12）を指定してください', {}, requestId);
    }

    const result = SalesByCustomerExportService.exportMonthly(fiscalYear, month, options as ExcelExportOptions);

    console.log('SALES_EXPORT_MONTHLY', JSON.stringify({
      fiscal_year: fiscalYear,
      month: month,
      file_count: result.files.length,
      record_count: result.totalRecords
    }));

    return buildSuccessResponse(result, requestId);
  } catch (error: unknown) {
    logErr('exportSalesByCustomerMonthly', error, requestId);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, 'システムエラーが発生しました', {}, requestId);
  }
}

/**
 * 企業別売上の年度エクスポート
 * @param fiscalYear - 年度
 * @param options - { action?: 'overwrite' | 'rename' }
 */
function exportSalesByCustomerYearly(fiscalYear: number, options: { action?: string } = {}): unknown {
  const requestId = generateRequestId();
  try {
    const authResult = checkPermission(ROLES.MANAGER);
    if (!authResult.allowed) {
      return buildErrorResponse(ERROR_CODES.PERMISSION_DENIED, '権限がありません', {}, requestId);
    }

    if (!fiscalYear) {
      return buildErrorResponse(ERROR_CODES.VALIDATION_ERROR, '年度を指定してください', {}, requestId);
    }

    const result = SalesByCustomerExportService.exportYearly(fiscalYear, options as ExcelExportOptions);

    console.log('SALES_EXPORT_YEARLY', JSON.stringify({
      fiscal_year: fiscalYear,
      file_count: result.files.length,
      record_count: result.totalRecords
    }));

    return buildSuccessResponse(result, requestId);
  } catch (error: unknown) {
    logErr('exportSalesByCustomerYearly', error, requestId);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, 'システムエラーが発生しました', {}, requestId);
  }
}

/**
 * 企業別売上の月別ファイル存在チェック
 */
function checkSalesMonthlyExportFile(fiscalYear: number, month: number): unknown {
  const requestId = generateRequestId();
  try {
    const authResult = checkPermission(ROLES.MANAGER);
    if (!authResult.allowed) {
      return buildErrorResponse(ERROR_CODES.PERMISSION_DENIED, '権限がありません', {}, requestId);
    }
    const result = SalesByCustomerExportService.checkExistingMonthlyFile(fiscalYear, month);
    return buildSuccessResponse(result, requestId);
  } catch (error: unknown) {
    logErr('checkSalesMonthlyExportFile', error, requestId);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, 'システムエラーが発生しました', {}, requestId);
  }
}

/**
 * 企業別売上の年度ファイル存在チェック
 */
function checkSalesYearlyExportFile(fiscalYear: number): unknown {
  const requestId = generateRequestId();
  try {
    const authResult = checkPermission(ROLES.MANAGER);
    if (!authResult.allowed) {
      return buildErrorResponse(ERROR_CODES.PERMISSION_DENIED, '権限がありません', {}, requestId);
    }
    const result = SalesByCustomerExportService.checkExistingYearlyFile(fiscalYear);
    return buildSuccessResponse(result, requestId);
  } catch (error: unknown) {
    logErr('checkSalesYearlyExportFile', error, requestId);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, 'システムエラーが発生しました', {}, requestId);
  }
}

// ========== CR-101: 区分別支払 ==========

/**
 * 区分別支払一覧のエクスポート（スタッフ用 + 外注用の2ファイル）
 * @param fiscalYear - 年度
 * @param options - { action?: 'overwrite' | 'rename' }
 */
function exportPayoutsByType(fiscalYear: number, options: { action?: string } = {}): unknown {
  const requestId = generateRequestId();
  try {
    const authResult = checkPermission(ROLES.MANAGER);
    if (!authResult.allowed) {
      return buildErrorResponse(ERROR_CODES.PERMISSION_DENIED, '権限がありません', {}, requestId);
    }

    if (!fiscalYear) {
      return buildErrorResponse(ERROR_CODES.VALIDATION_ERROR, '年度を指定してください', {}, requestId);
    }

    const result = PayoutByTypeExportService.exportToExcel(fiscalYear, options as ExcelExportOptions);

    console.log('PAYOUT_BY_TYPE_EXPORT', JSON.stringify({
      fiscal_year: fiscalYear,
      file_count: result.files.length,
      record_count: result.totalRecords
    }));

    return buildSuccessResponse(result, requestId);
  } catch (error: unknown) {
    logErr('exportPayoutsByType', error, requestId);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, 'システムエラーが発生しました', {}, requestId);
  }
}

/**
 * 区分別支払ファイルの存在チェック
 */
function checkPayoutsByTypeExportFiles(fiscalYear: number): unknown {
  const requestId = generateRequestId();
  try {
    const authResult = checkPermission(ROLES.MANAGER);
    if (!authResult.allowed) {
      return buildErrorResponse(ERROR_CODES.PERMISSION_DENIED, '権限がありません', {}, requestId);
    }
    const results = PayoutByTypeExportService.checkExistingFiles(fiscalYear);
    return buildSuccessResponse(results, requestId);
  } catch (error: unknown) {
    logErr('checkPayoutsByTypeExportFiles', error, requestId);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, 'システムエラーが発生しました', {}, requestId);
  }
}

// ========== CR-102: スタッフ別支払 ==========

/**
 * スタッフ別年間支払一覧のエクスポート
 * @param fiscalYear - 年度
 * @param options - { action?: 'overwrite' | 'rename' }
 */
function exportPayoutsByStaff(fiscalYear: number, options: { action?: string } = {}): unknown {
  const requestId = generateRequestId();
  try {
    const authResult = checkPermission(ROLES.MANAGER);
    if (!authResult.allowed) {
      return buildErrorResponse(ERROR_CODES.PERMISSION_DENIED, '権限がありません', {}, requestId);
    }

    if (!fiscalYear) {
      return buildErrorResponse(ERROR_CODES.VALIDATION_ERROR, '年度を指定してください', {}, requestId);
    }

    const result = PayoutByStaffExportService.exportToExcel(fiscalYear, options as ExcelExportOptions);

    console.log('PAYOUT_BY_STAFF_EXPORT', JSON.stringify({
      fiscal_year: fiscalYear,
      file_count: result.files.length,
      record_count: result.totalRecords
    }));

    return buildSuccessResponse(result, requestId);
  } catch (error: unknown) {
    logErr('exportPayoutsByStaff', error, requestId);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, 'システムエラーが発生しました', {}, requestId);
  }
}

/**
 * スタッフ別支払ファイルの存在チェック
 */
function checkPayoutsByStaffExportFiles(fiscalYear: number): unknown {
  const requestId = generateRequestId();
  try {
    const authResult = checkPermission(ROLES.MANAGER);
    if (!authResult.allowed) {
      return buildErrorResponse(ERROR_CODES.PERMISSION_DENIED, '権限がありません', {}, requestId);
    }
    const results = PayoutByStaffExportService.checkExistingFiles(fiscalYear);
    return buildSuccessResponse(results, requestId);
  } catch (error: unknown) {
    logErr('checkPayoutsByStaffExportFiles', error, requestId);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, 'システムエラーが発生しました', {}, requestId);
  }
}

// ========== 共通: フォルダ情報 ==========

/**
 * 税理士レポートのエクスポートフォルダURL取得
 */
function getTaxReportExportFolderUrl(): unknown {
  const requestId = generateRequestId();
  try {
    const authResult = checkPermission(ROLES.STAFF);
    if (!authResult.allowed) {
      return buildErrorResponse(ERROR_CODES.PERMISSION_DENIED, authResult.message, {}, requestId);
    }

    const status = ExcelExportUtil.getExportFolderStatus_(TAX_REPORT_FOLDER_KEY);
    return buildSuccessResponse(status, requestId);
  } catch (error: unknown) {
    logErr('getTaxReportExportFolderUrl', error, requestId);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, 'システムエラーが発生しました', {}, requestId);
  }
}
