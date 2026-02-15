/**
 * Job API Controller
 *
 * 案件管理のAPI（google.script.run対象）
 * KTSM-30: saveJob / searchJobs / getJob
 * KTSM-32: getDashboard / getDashboardMeta
 */

/**
 * ダッシュボードデータを取得
 * @param {string} date - 日付（YYYY-MM-DD形式）
 * @returns {Object} APIレスポンス
 */
function getDashboard(date) {
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

    // 入力検証
    if (!date) {
      return buildErrorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        'date is required',
        {},
        requestId
      );
    }

    // Service呼び出し
    const result = JobService.getDashboard(date);

    return buildSuccessResponse(result, requestId);

  } catch (error) {
    Logger.log(`getDashboard error: ${error.message}`);
    return buildErrorResponse(
      ERROR_CODES.SYSTEM_ERROR,
      error.message,
      {},
      requestId
    );
  }
}

/**
 * ダッシュボード更新メタ情報を取得（更新検知用）
 * @param {string} date - 日付（YYYY-MM-DD形式）
 * @returns {Object} APIレスポンス
 */
function getDashboardMeta(date) {
  const requestId = generateRequestId();

  try {
    const authResult = checkPermission(ROLES.STAFF);
    if (!authResult.allowed) {
      return buildErrorResponse(ERROR_CODES.PERMISSION_DENIED, authResult.message, {}, requestId);
    }

    if (!date) {
      return buildErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'date is required', {}, requestId);
    }

    const result = JobService.getDashboardMeta(date);
    return buildSuccessResponse(result, requestId);

  } catch (error) {
    Logger.log(`getDashboardMeta error: ${error.message}`);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, error.message, {}, requestId);
  }
}

/**
 * 案件を検索
 * @param {Object} query - 検索条件
 * @returns {Object} APIレスポンス
 */
function searchJobs(query) {
  try {
    Logger.log('searchJobs called with: ' + JSON.stringify(query));
    const requestId = generateRequestId();

    // 認可チェック
    const authResult = checkPermission(ROLES.STAFF);
    Logger.log('authResult: ' + JSON.stringify(authResult));
    if (!authResult.allowed) {
      return buildErrorResponse(
        ERROR_CODES.PERMISSION_DENIED,
        authResult.message,
        {},
        requestId
      );
    }

    // Service呼び出し
    const jobs = JobService.search(query || {});
    Logger.log('jobs count: ' + jobs.length);

    const response = buildSuccessResponse({ jobs: jobs }, requestId);
    Logger.log('response built successfully');

    return response;

  } catch (error) {
    Logger.log(`searchJobs error: ${error.message}`);
    Logger.log(error.stack);
    return buildErrorResponse(
      ERROR_CODES.SYSTEM_ERROR,
      error.message,
      {},
      'req_error'
    );
  }
}

/**
 * 案件単体を取得
 * @param {string} jobId - 案件ID
 * @returns {Object} APIレスポンス
 */
function getJob(jobId) {
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
    if (!jobId) {
      return buildErrorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        'jobId is required',
        {},
        requestId
      );
    }

    // Service呼び出し
    const result = JobService.get(jobId);

    if (!result) {
      return buildErrorResponse(
        ERROR_CODES.NOT_FOUND,
        `Job not found: ${jobId}`,
        {},
        requestId
      );
    }

    return buildSuccessResponse(result, requestId);

  } catch (error) {
    Logger.log(`getJob error: ${error.message}`);
    return buildErrorResponse(
      ERROR_CODES.SYSTEM_ERROR,
      error.message,
      {},
      requestId
    );
  }
}

/**
 * 案件編集モーダル向けに案件単体を取得（軽量: 配置情報なし）
 * @param {string} jobId - 案件ID
 * @returns {Object} APIレスポンス
 */
function getJobForEdit(jobId) {
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
    if (!jobId) {
      return buildErrorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        'jobId is required',
        {},
        requestId
      );
    }

    // Service呼び出し
    const result = JobService.getForEdit(jobId);

    if (!result) {
      return buildErrorResponse(
        ERROR_CODES.NOT_FOUND,
        `Job not found: ${jobId}`,
        {},
        requestId
      );
    }

    return buildSuccessResponse(result, requestId);

  } catch (error) {
    Logger.log(`getJobForEdit error: ${error.message}`);
    return buildErrorResponse(
      ERROR_CODES.SYSTEM_ERROR,
      error.message,
      {},
      requestId
    );
  }
}

/**
 * 案件を保存（新規/更新）
 * @param {Object} job - 案件データ
 * @param {string|null} expectedUpdatedAt - 期待するupdated_at（更新時）
 * @param {Object[]} slots - 枠データ（オプション）
 * @returns {Object} APIレスポンス
 */
function saveJob(job, expectedUpdatedAt, slots) {
  const requestId = generateRequestId();
  let lock = null;

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
    if (!job || typeof job !== 'object') {
      return buildErrorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        'job object is required',
        {},
        requestId
      );
    }

    // ロック取得
    lock = acquireLock(3000);
    if (!lock) {
      return buildErrorResponse(
        ERROR_CODES.BUSY_ERROR,
        '他のユーザーが編集中です。しばらく待ってから再度お試しください。',
        {},
        requestId
      );
    }

    // アーカイブフラグ補完（UIからは_archivedが送られないため、DBから取得して付与）
    if (job.job_id && !job._archived) {
      const current = JobRepository.findById(job.job_id);
      if (current && current._archived) {
        job._archived = current._archived;
        job._archiveFiscalYear = current._archiveFiscalYear;
      }
    }

    // Service呼び出し（枠データも渡す）
    Logger.log('saveJob: job data = ' + JSON.stringify(job));
    Logger.log('saveJob: slots data = ' + JSON.stringify(slots));
    const result = JobService.save(job, expectedUpdatedAt, slots);
    Logger.log('saveJob: result = ' + JSON.stringify(result));

    if (!result.success) {
      // エラーコード変換
      let errorCode = ERROR_CODES.SYSTEM_ERROR;
      let message = result.error;

      if (result.error === 'VALIDATION_ERROR') {
        errorCode = ERROR_CODES.VALIDATION_ERROR;
        // 詳細なバリデーションエラーメッセージを返す
        message = result.details?.message || 'Validation failed';
        Logger.log('saveJob: validation error details = ' + JSON.stringify(result.details));
      } else if (result.error === 'CONFLICT_ERROR') {
        errorCode = ERROR_CODES.CONFLICT_ERROR;
        message = '他のユーザーによって更新されています。画面を再読み込みしてください。';
      } else if (result.error === 'NOT_FOUND') {
        errorCode = ERROR_CODES.NOT_FOUND;
        message = '案件が見つかりません';
      }

      return buildErrorResponse(
        errorCode,
        message,
        result.details || { currentUpdatedAt: result.currentUpdatedAt },
        requestId
      );
    }

    return buildSuccessResponse({
      job: result.job,
      slots: result.slots || []
    }, requestId);

  } catch (error) {
    Logger.log(`saveJob error: ${error.message}`);
    return buildErrorResponse(
      ERROR_CODES.SYSTEM_ERROR,
      error.message,
      {},
      requestId
    );

  } finally {
    releaseLock(lock);
  }
}

/**
 * 案件ステータスを更新
 * @param {string} jobId - 案件ID
 * @param {string} status - 新しいステータス
 * @param {string} expectedUpdatedAt - 期待するupdated_at
 * @returns {Object} APIレスポンス
 */
/**
 * 案件を削除（論理削除）
 * @param {string} jobId - 案件ID
 * @param {string} expectedUpdatedAt - 期待するupdated_at
 * @returns {Object} APIレスポンス
 */
function deleteJob(jobId, expectedUpdatedAt) {
  const requestId = generateRequestId();
  let lock = null;

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
    if (!jobId) {
      return buildErrorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        'jobId is required',
        {},
        requestId
      );
    }

    // ロック取得
    lock = acquireLock(3000);
    if (!lock) {
      return buildErrorResponse(
        ERROR_CODES.BUSY_ERROR,
        '他のユーザーが編集中です。しばらく待ってから再度お試しください。',
        {},
        requestId
      );
    }

    // 案件を取得
    const sheet = getSheetDirect('Jobs');
    const existing = findById(sheet, 'job_id', jobId);

    if (!existing) {
      return buildErrorResponse(
        ERROR_CODES.NOT_FOUND,
        '案件が見つかりません',
        { jobId: jobId },
        requestId
      );
    }

    if (existing.is_deleted) {
      return buildErrorResponse(
        ERROR_CODES.NOT_FOUND,
        '案件は既に削除されています',
        { jobId: jobId },
        requestId
      );
    }

    // 楽観ロックチェック
    if (!checkOptimisticLock(existing, expectedUpdatedAt)) {
      return buildErrorResponse(
        ERROR_CODES.CONFLICT_ERROR,
        '他のユーザーによって更新されています。画面を再読み込みしてください。',
        {
          currentUpdatedAt: existing.updated_at,
          expectedUpdatedAt: expectedUpdatedAt
        },
        requestId
      );
    }

    // 関連する配置データの存在チェック（Repositoryを使用）
    const relatedAssignments = AssignmentRepository.findByJobId(jobId);

    if (relatedAssignments.length > 0) {
      return buildErrorResponse(
        'HAS_ASSIGNMENTS',
        `この案件には${relatedAssignments.length}件の配置データが存在するため削除できません。先に配置を削除してください。`,
        { assignmentCount: relatedAssignments.length },
        requestId
      );
    }

    // 論理削除実行
    const user = getCurrentUserEmail();
    softDeleteRow(sheet, existing._rowIndex, user);

    // 監査ログ
    logDelete('T_Jobs', jobId, existing);

    return buildSuccessResponse({ deleted: true, jobId: jobId }, requestId);

  } catch (error) {
    Logger.log(`deleteJob error: ${error.message}`);
    return buildErrorResponse(
      ERROR_CODES.SYSTEM_ERROR,
      error.message,
      {},
      requestId
    );

  } finally {
    releaseLock(lock);
  }
}

function updateJobStatus(jobId, status, expectedUpdatedAt) {
  const requestId = generateRequestId();
  let lock = null;

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
    if (!jobId || !status) {
      return buildErrorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        'jobId and status are required',
        {},
        requestId
      );
    }

    // ロック取得
    lock = acquireLock(3000);
    if (!lock) {
      return buildErrorResponse(
        ERROR_CODES.BUSY_ERROR,
        '他のユーザーが編集中です',
        {},
        requestId
      );
    }

    // Service呼び出し
    const result = JobService.updateStatus(jobId, status, expectedUpdatedAt);

    if (!result.success) {
      let errorCode = ERROR_CODES.SYSTEM_ERROR;
      if (result.error === 'VALIDATION_ERROR') {
        errorCode = ERROR_CODES.VALIDATION_ERROR;
      } else if (result.error === 'CONFLICT_ERROR') {
        errorCode = ERROR_CODES.CONFLICT_ERROR;
      } else if (result.error === 'NOT_FOUND') {
        errorCode = ERROR_CODES.NOT_FOUND;
      }

      return buildErrorResponse(
        errorCode,
        result.error,
        result.details || {},
        requestId
      );
    }

    return buildSuccessResponse({ job: result.job }, requestId);

  } catch (error) {
    Logger.log(`updateJobStatus error: ${error.message}`);
    return buildErrorResponse(
      ERROR_CODES.SYSTEM_ERROR,
      error.message,
      {},
      requestId
    );

  } finally {
    releaseLock(lock);
  }
}
