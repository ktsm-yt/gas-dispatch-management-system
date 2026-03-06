/**
 * Stats API Controller
 *
 * P2-6: 売上分析ダッシュボード用API（google.script.run対象）
 */

/**
 * ダッシュボードデータを取得
 * @param {Object} options - オプション
 * @param {string} options.period - 期間（thisMonth/lastMonth/thisYear/lastYear/custom）
 * @param {number} options.startYear - カスタム開始年
 * @param {number} options.startMonth - カスタム開始月
 * @param {number} options.endYear - カスタム終了年
 * @param {number} options.endMonth - カスタム終了月
 * @returns {Object} APIレスポンス
 */
function getDashboardStats(options = {}) {
  const requestId = generateRequestId();

  try {
    // 認可チェック（staff以上）
    const authResult = checkPermission(ROLES.STAFF);
    if (!authResult.allowed) {
      return buildErrorResponse(
        ERROR_CODES.PERMISSION_DENIED,
        authResult.message,
        {},
        requestId
      );
    }

    const data = StatsService.getDashboardData(options);

    return buildSuccessResponse(data, requestId);

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    Logger.log(`getDashboardStats error: ${errMsg}`);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, 'システムエラーが発生しました', {}, requestId);
  }
}

/**
 * 指定月の統計を取得
 * @param {number} year - 年
 * @param {number} month - 月
 * @returns {Object} APIレスポンス
 */
function getMonthlyStats(year, month) {
  const requestId = generateRequestId();

  try {
    // 認可チェック
    const authResult = checkPermission(ROLES.STAFF);
    if (!authResult.allowed) {
      return buildErrorResponse(
        ERROR_CODES.PERMISSION_DENIED,
        authResult.message,
        {},
        requestId
      );
    }

    // 入力検証
    if (!year || !month) {
      return buildErrorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        'year and month are required',
        {},
        requestId
      );
    }

    const stats = StatsRepository.findByPeriod(Number(year), Number(month));

    if (!stats) {
      // 統計がない場合は計算して返す（保存はしない）
      const calculated = StatsService.calculateMonthlyStats(Number(year), Number(month));
      return buildSuccessResponse({
        stats: calculated,
        source: 'calculated'
      }, requestId);
    }

    return buildSuccessResponse({
      stats: stats,
      source: 'stored'
    }, requestId);

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    Logger.log(`getMonthlyStats error: ${errMsg}`);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, 'システムエラーが発生しました', {}, requestId);
  }
}

/**
 * 年度サマリーを取得
 * @param {number} fiscalYear - 会計年度
 * @returns {Object} APIレスポンス
 */
function getYearlyStatsSummary(fiscalYear) {
  const requestId = generateRequestId();

  try {
    // 認可チェック
    const authResult = checkPermission(ROLES.STAFF);
    if (!authResult.allowed) {
      return buildErrorResponse(
        ERROR_CODES.PERMISSION_DENIED,
        authResult.message,
        {},
        requestId
      );
    }

    if (!fiscalYear) {
      // デフォルトは現在の会計年度
      fiscalYear = getFiscalYear_(new Date());
    }

    const summary = StatsService.getYearlySummary(Number(fiscalYear));

    return buildSuccessResponse({ summary }, requestId);

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    Logger.log(`getYearlyStatsSummary error: ${errMsg}`);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, 'システムエラーが発生しました', {}, requestId);
  }
}

/**
 * 指定月の統計を再計算・保存
 * @param {number} year - 年
 * @param {number} month - 月
 * @returns {Object} APIレスポンス
 */
function recalculateMonthlyStats(year, month) {
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
    if (!year || !month) {
      return buildErrorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        'year and month are required',
        {},
        requestId
      );
    }

    const result = StatsService.updateMonthlyStats(Number(year), Number(month));

    if (!result.success) {
      if (result.error === 'ALREADY_FINALIZED') {
        return buildErrorResponse(
          ERROR_CODES.VALIDATION_ERROR,
          '確定済みの月は再計算できません',
          { stats: result.stats },
          requestId
        );
      }
      Logger.log(`recalculateMonthlyStats service error: ${result.error}`);
      return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, 'システムエラーが発生しました', {}, requestId);
    }

    return buildSuccessResponse({
      stats: result.stats,
      created: result.created
    }, requestId);

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    Logger.log(`recalculateMonthlyStats error: ${errMsg}`);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, 'システムエラーが発生しました', {}, requestId);
  }
}

/**
 * 指定月の統計を確定
 * @param {number} year - 年
 * @param {number} month - 月
 * @returns {Object} APIレスポンス
 */
function finalizeMonthlyStats(year, month) {
  const requestId = generateRequestId();

  try {
    // 認可チェック（admin以上）
    const authResult = checkPermission(ROLES.ADMIN);
    if (!authResult.allowed) {
      return buildErrorResponse(
        ERROR_CODES.PERMISSION_DENIED,
        authResult.message,
        {},
        requestId
      );
    }

    // 入力検証
    if (!year || !month) {
      return buildErrorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        'year and month are required',
        {},
        requestId
      );
    }

    const result = StatsService.finalizeMonthStats(Number(year), Number(month));

    if (!result.success) {
      return buildErrorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        result.error,
        {},
        requestId
      );
    }

    return buildSuccessResponse({
      stats: result.stats,
      finalized: true
    }, requestId);

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    Logger.log(`finalizeMonthlyStats error: ${errMsg}`);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, 'システムエラーが発生しました', {}, requestId);
  }
}

/**
 * 日別売上集計データを取得
 * @param {Object} options - { startDate: 'yyyy-MM-dd', endDate: 'yyyy-MM-dd' }
 * @returns {Object} APIレスポンス
 */
function getDailySalesStats(options) {
  var requestId = generateRequestId();

  try {
    var authResult = checkPermission(ROLES.STAFF);
    if (!authResult.allowed) {
      return buildErrorResponse(ERROR_CODES.PERMISSION_DENIED, authResult.message, {}, requestId);
    }

    if (!options || !options.startDate || !options.endDate) {
      return buildErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'startDate, endDate は必須です', {}, requestId);
    }

    var data = StatsService.getDailySalesData(options.startDate, options.endDate);

    return buildSuccessResponse(data, requestId);

  } catch (error) {
    var errMsg = error instanceof Error ? error.message : String(error);
    Logger.log('getDailySalesStats error: ' + errMsg);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, 'システムエラーが発生しました', {}, requestId);
  }
}

/**
 * 年次比較データを取得（企業別×過去5年度の売上）
 * 年次比較タブから遅延呼び出し。CacheServiceで6時間キャッシュ。
 * @returns {Object} APIレスポンス
 */
function getYearlyCustomerStats() {
  var requestId = generateRequestId();

  try {
    var authResult = checkPermission(ROLES.STAFF);
    if (!authResult.allowed) {
      return buildErrorResponse(ERROR_CODES.PERMISSION_DENIED, authResult.message, {}, requestId);
    }

    var cacheKey = 'yearly_customer_stats';
    var cached = CacheService.getScriptCache().get(cacheKey);
    if (cached) {
      return buildSuccessResponse(JSON.parse(cached), requestId);
    }

    var result = StatsService._aggregateByCustomerYearly(5);

    // CacheService最大100KB、最大6時間（21600秒）
    try {
      CacheService.getScriptCache().put(cacheKey, JSON.stringify(result), 21600);
    } catch (e) {
      Logger.log('年次比較キャッシュ保存エラー（データサイズ超過の可能性）: ' + e.message);
    }

    return buildSuccessResponse(result, requestId);

  } catch (error) {
    var errMsg = error instanceof Error ? error.message : String(error);
    Logger.log('getYearlyCustomerStats error: ' + errMsg);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, 'システムエラーが発生しました', {}, requestId);
  }
}

/**
 * 全月の統計一覧を取得
 * @returns {Object} APIレスポンス
 */
function listAllStats() {
  const requestId = generateRequestId();

  try {
    // 認可チェック
    const authResult = checkPermission(ROLES.STAFF);
    if (!authResult.allowed) {
      return buildErrorResponse(
        ERROR_CODES.PERMISSION_DENIED,
        authResult.message,
        {},
        requestId
      );
    }

    const stats = StatsRepository.findAll();

    return buildSuccessResponse({
      stats: stats,
      count: stats.length
    }, requestId);

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    Logger.log(`listAllStats error: ${errMsg}`);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, 'システムエラーが発生しました', {}, requestId);
  }
}
