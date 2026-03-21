/**
 * api_stats_testable.ts
 *
 * Extracted implementations of recalculateMonthlyStats and getYearlyCustomerStats
 * for Vitest unit testing. GAS globals (generateRequestId, checkPermission, ROLES,
 * ERROR_CODES, buildSuccessResponse, buildErrorResponse, StatsService, CacheService,
 * Logger) are injected via globalThis stubs in tests.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * 指定月の統計を再計算・保存
 * @param year - 年
 * @param month - 月
 * @returns APIレスポンス
 */
export function recalculateMonthlyStats_impl(year: any, month: any): any {
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

    // 年次顧客統計のサーバーキャッシュを無効化（再計算でデータが変わるため）
    try {
      CacheService.getScriptCache().remove('yearly_customer_stats_v2');
    } catch (cacheError) {
      Logger.log('recalculateMonthlyStats: yearly cache invalidation failed: ' + cacheError);
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
 * 年次比較データを取得（企業別×過去5年度の売上）
 * 年次比較タブから遅延呼び出し。CacheServiceで6時間キャッシュ。
 * @returns APIレスポンス
 */
export function getYearlyCustomerStats_impl(): any {
  var requestId = generateRequestId();

  try {
    var authResult = checkPermission(ROLES.STAFF);
    if (!authResult.allowed) {
      return buildErrorResponse(ERROR_CODES.PERMISSION_DENIED, authResult.message, {}, requestId);
    }

    var cacheKey = 'yearly_customer_stats_v2';
    var cached = CacheService.getScriptCache().get(cacheKey);
    if (cached) {
      return buildSuccessResponse(JSON.parse(cached), requestId);
    }

    var result = StatsService._aggregateByCustomerYearly(5);

    // CacheService最大100KB、最大6時間（21600秒）
    try {
      CacheService.getScriptCache().put(cacheKey, JSON.stringify(result), 21600);
    } catch (e: any) {
      Logger.log('年次比較キャッシュ保存エラー（データサイズ超過の可能性）: ' + e.message);
    }

    return buildSuccessResponse(result, requestId);

  } catch (error) {
    var errMsg = error instanceof Error ? error.message : String(error);
    Logger.log('getYearlyCustomerStats error: ' + errMsg);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, 'システムエラーが発生しました', {}, requestId);
  }
}
