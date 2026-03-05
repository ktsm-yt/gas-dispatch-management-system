/**
 * 横断検索 API コントローラ (CR-082)
 */

function searchDashboard(params: DashboardSearchParams) {
  const requestId = generateRequestId();

  try {
    const authResult = checkPermission(ROLES.STAFF);
    if (!authResult.allowed) {
      return buildErrorResponse(
        'PERMISSION_DENIED',
        authResult.message,
        {},
        requestId
      );
    }

    const keyword = (params?.keyword || '').trim();
    if (!keyword) {
      return buildSuccessResponse({ results: [], total: 0, truncated: false }, requestId);
    }

    if (keyword.length > 100) {
      return buildErrorResponse(
        'VALIDATION_ERROR',
        'キーワードは100文字以内で入力してください',
        {},
        requestId
      );
    }

    const result = SearchService.searchByKeyword({
      keyword,
      search_type: params.search_type || 'all',
      include_archive: params.include_archive !== false,
      limit: Math.max(1, Math.min(params.limit || 50, 100))
    });

    return buildSuccessResponse(result, requestId);

  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    Logger.log(`searchDashboard error: ${errMsg}`);
    Logger.log(error instanceof Error ? error.stack : '');
    return buildErrorResponse(
      'SYSTEM_ERROR',
      'システムエラーが発生しました',
      {},
      requestId
    );
  }
}
