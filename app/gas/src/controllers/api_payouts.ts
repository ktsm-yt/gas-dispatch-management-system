/**
 * Payout API Controller
 *
 * 支払い管理のAPI（google.script.run対象）
 * P2-3: 給与/支払管理システム
 */

/**
 * スタッフ一覧を取得（支払い画面用）
 * @returns { ok: true, data: { staff: [] } }
 */
function getStaffForPayouts(): unknown {
  const requestId = generateRequestId();

  try {
    const authResult = checkPermission(ROLES.STAFF);
    if (!authResult.allowed) {
      return buildErrorResponse(ERROR_CODES.PERMISSION_DENIED, authResult.message, {}, requestId);
    }

    const staffList = StaffRepository.search({ is_active: true });

    // 必要なフィールドのみ返す
    const data = staffList.map(function(s) {
      return {
        staff_id: s.staff_id as string,
        name: s.name as string,
        name_kana: (s.name_kana as string) || '',
        payment_frequency: (s.payment_frequency as string) || 'monthly'
      };
    });

    // 50音順（カナ）でソート
    data.sort(function(a, b) { return (a.name_kana || a.name).localeCompare(b.name_kana || b.name, 'ja'); });

    return buildSuccessResponse({ staff: data }, requestId);

  } catch (error: unknown) {
    logErr('getStaffForPayouts', error, requestId);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, 'システムエラーが発生しました', {}, requestId);
  }
}

/**
 * 未払いサマリーを取得
 * @param staffId - スタッフID
 * @param endDate - 集計終了日（YYYY-MM-DD）
 * @param options - オプション
 * @returns APIレスポンス
 */
function getUnpaidSummary(staffId: string, endDate: string, options: Record<string, unknown> = {}): unknown {
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
    const calcResult = PayoutService.calculatePayout(staffId, endDate, options);
    const result: Record<string, unknown> = { ...calcResult };

    // スタッフ名を付与
    const staff = StaffRepository.findById(staffId);
    result.staffName = staff ? staff.name as string : '(不明)';

    return buildSuccessResponse(result, requestId);

  } catch (error: unknown) {
    logErr('getUnpaidSummary', error, requestId);
    const msg = error instanceof Error ? error.message : String(error);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, 'システムエラーが発生しました', {}, requestId);
  }
}

/**
 * 未払い配置一覧を取得（詳細表示用）
 * @param staffId - スタッフID
 * @param endDate - 集計終了日（YYYY-MM-DD）
 * @returns APIレスポンス
 */
function getUnpaidAssignments(staffId: string, endDate: string): unknown {
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

    const assignments = PayoutService.getUnpaidAssignments(staffId, endDate);

    return buildSuccessResponse({ assignments: assignments, count: assignments.length }, requestId);

  } catch (error: unknown) {
    logErr('getUnpaidAssignments', error, requestId);
    const msg = error instanceof Error ? error.message : String(error);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, 'システムエラーが発生しました', {}, requestId);
  }
}

/**
 * 確認済みPayoutの詳細を取得（配置情報含む）
 * @param payoutId - 支払ID
 * @param options - オプション { include_assignments: boolean }
 * @returns APIレスポンス
 */
function getPayoutDetails(payoutId: string, options: { include_assignments?: boolean } = {}): unknown {
  const requestId = generateRequestId();

  try {
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

    // モーダル表示用にデータを整形
    const result: Record<string, unknown> = {
      staffId: payout.staff_id,
      staffName: (payout as PayoutRecord & { target_name?: string }).target_name || '(不明)',
      assignmentCount: payout.assignment_count || 0,
      baseAmount: payout.base_amount,
      transportAmount: payout.transport_amount,
      adjustmentAmount: payout.adjustment_amount || 0,
      totalAmount: payout.total_amount,
      periodStart: payout.period_start,
      periodEnd: payout.period_end,
      status: payout.status,
      payoutId: payout.payout_id,
      updatedAt: payout.updated_at,
      paidDate: payout.paid_date,
      notes: payout.notes
    };

    // 配置情報を取得（オプション）- payout_idで直接検索して最適化
    if (options.include_assignments !== false) {
      const linkedAssignments = AssignmentRepository.search({ payout_id: payoutId })
        .filter(function(a) { return !a.is_deleted; });

      // Job情報を付与
      const jobIds = [...new Set(linkedAssignments.map(function(a) { return a.job_id as string; }))];
      const jobs = jobIds.length > 0 ? JobRepository.search({ job_ids: jobIds }) : [];
      const jobMap = new Map(jobs.map(function(j) { return [j.job_id as string, j]; }));

      result.assignments = linkedAssignments.map(function(a) {
        const job = jobMap.get(a.job_id as string) || {};
        return {
          assignment_id: a.assignment_id as string,
          work_date: (job as Record<string, unknown>).work_date,
          site_name: ((job as Record<string, unknown>).site_name as string) || '(現場名なし)',
          pay_unit: a.pay_unit,
          invoice_unit: a.invoice_unit,
          wage_rate: a.wage_rate
        };
      });
    }

    return buildSuccessResponse(result, requestId);

  } catch (error: unknown) {
    logErr('getPayoutDetails', error, requestId);
    const msg = error instanceof Error ? error.message : String(error);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, 'システムエラーが発生しました', {}, requestId);
  }
}

/**
 * 未払いスタッフ一覧を取得
 * @param endDate - 集計終了日
 * @param options - オプション
 * @returns APIレスポンス
 */
function getUnpaidStaffList(endDate: string, options: { staffId?: string } = {}): unknown {
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
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return buildErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'endDate must be in YYYY-MM-DD format', {}, requestId);
    }

    const result = PayoutService.getUnpaidStaffList(endDate, options);

    // ★ 同じ期間の確認済みPayoutも取得（リロード後の状態復元用）
    let confirmedPayouts = PayoutService.getConfirmedPayoutsForPeriod(endDate);

    // 特定スタッフ指定時は確認済みもフィルタ
    if (options.staffId) {
      confirmedPayouts = confirmedPayouts.filter(function(p) { return p.staff_id === options.staffId; });
    }

    return buildSuccessResponse({
      endDate: endDate,
      staffId: options.staffId || null,  // 個人選択モードのフラグとして返す
      staffList: result,
      totalCount: result.length,
      totalAmount: result.reduce(function(sum: number, s: UnpaidStaffItem) { return sum + s.estimatedAmount; }, 0),
      // ★ 確認済みPayoutを追加
      confirmedPayouts: confirmedPayouts,
      confirmedCount: confirmedPayouts.length,
      confirmedAmount: confirmedPayouts.reduce(function(sum: number, p: PayoutRecord) { return sum + (p.total_amount || 0); }, 0)
    }, requestId);

  } catch (error: unknown) {
    logErr('getUnpaidStaffList', error, requestId);
    const msg = error instanceof Error ? error.message : String(error);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, 'システムエラーが発生しました', {}, requestId);
  }
}

/**
 * 未払スタッフリストの差分を取得（SWR差分更新用）
 * @param endDate - 集計終了日（YYYY-MM-DD）
 * @param lastSyncTimestamp - 前回同期時刻（ISO形式）
 * @returns APIレスポンス { changedStaffIds, staffList, confirmedPayouts, ... }
 */
function getUnpaidStaffListDelta(endDate: string, lastSyncTimestamp: string): unknown {
  const requestId = generateRequestId();

  try {
    // 認可チェック（staff以上）
    const authResult = checkPermission(ROLES.STAFF);
    if (!authResult.allowed) {
      return buildErrorResponse(ERROR_CODES.PERMISSION_DENIED, authResult.message, {}, requestId);
    }

    if (!endDate) {
      endDate = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
    }

    if (!lastSyncTimestamp) {
      // lastSyncTimestampがない場合は全件取得にフォールバック
      return getUnpaidStaffList(endDate);
    }

    // 差分取得
    const deltaResult = PayoutService.getUnpaidStaffListDelta(endDate, lastSyncTimestamp) as {
      changedStaffIds: string[];
      removedStaffIds: string[];
      staffList: UnpaidStaffItem[];
    };

    // 確認済みPayoutも差分で取得
    const confirmedPayouts = PayoutService.getConfirmedPayoutsForPeriod(endDate);

    return buildSuccessResponse({
      endDate: endDate,
      lastSyncTimestamp: lastSyncTimestamp,
      currentTimestamp: new Date().toISOString(),
      isDelta: true,
      changedStaffIds: deltaResult.changedStaffIds,
      removedStaffIds: deltaResult.removedStaffIds,
      staffList: deltaResult.staffList,
      totalCount: deltaResult.staffList.length,
      totalAmount: deltaResult.staffList.reduce(function(sum: number, s: UnpaidStaffItem) { return sum + s.estimatedAmount; }, 0),
      confirmedPayouts: confirmedPayouts,
      confirmedCount: confirmedPayouts.length,
      confirmedAmount: confirmedPayouts.reduce(function(sum: number, p: PayoutRecord) { return sum + (p.total_amount || 0); }, 0)
    }, requestId);

  } catch (error: unknown) {
    logErr('getUnpaidStaffListDelta', error, requestId);
    const msg = error instanceof Error ? error.message : String(error);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, 'システムエラーが発生しました', {}, requestId);
  }
}

/**
 * 支払いを支払済として記録
 * @param staffId - スタッフID
 * @param endDate - 集計終了日
 * @param options - オプション { adjustment_amount, notes, paid_date }
 * @returns APIレスポンス
 */
function markAsPaid(staffId: string, endDate: string, options: { adjustment_amount?: number; notes?: string; paid_date?: string } = {}): unknown {
  const requestId = generateRequestId();
  const lock = LockService.getScriptLock();
  let lockAcquired = false;

  try {
    lock.waitLock(5000);
    lockAcquired = true;

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
    const result = PayoutService.markAsPaid(staffId, endDate, options) as { success: boolean; error?: string; message?: string };

    if (!result.success) {
      return buildErrorResponse(ERROR_CODES.VALIDATION_ERROR, result.error || 'Unknown error', { message: result.message }, requestId);
    }

    return buildSuccessResponse(result, requestId);

  } catch (error: unknown) {
    if (!lockAcquired) {
      return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, '別の処理が実行中です。しばらく待ってから再度お試しください。', {}, requestId);
    }
    logErr('markAsPaid', error, requestId);
    const msg = error instanceof Error ? error.message : String(error);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, 'システムエラーが発生しました', {}, requestId);
  } finally {
    if (lockAcquired) {
      lock.releaseLock();
    }
  }
}

/**
 * 複数スタッフの支払いを一括で支払済にする
 * @param staffIds - スタッフID配列
 * @param endDate - 集計終了日
 * @param options - オプション { paid_date, adjustments: { [staffId]: { adjustment_amount, notes } } }
 * @returns APIレスポンス
 */
function bulkMarkAsPaid(staffIds: string[], endDate: string, options: { paid_date?: string; adjustments?: Record<string, { adjustment_amount?: number; notes?: string }> } = {}): unknown {
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

  } catch (error: unknown) {
    logErr('bulkMarkAsPaid', error, requestId);
    const msg = error instanceof Error ? error.message : String(error);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, 'システムエラーが発生しました', {}, requestId);
  }
}

/**
 * 支払い一覧を検索
 * @param query - 検索条件
 * @returns APIレスポンス
 */
function searchPayouts(query: PayoutSearchQuery = {}): unknown {
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

  } catch (error: unknown) {
    logErr('searchPayouts', error, requestId);
    const msg = error instanceof Error ? error.message : String(error);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, 'システムエラーが発生しました', {}, requestId);
  }
}

/**
 * 支払い詳細を取得
 * @param payoutId - 支払ID
 * @returns APIレスポンス
 */
function getPayout(payoutId: string): unknown {
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

  } catch (error: unknown) {
    logErr('getPayout', error, requestId);
    const msg = error instanceof Error ? error.message : String(error);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, 'システムエラーが発生しました', {}, requestId);
  }
}

/**
 * 支払い履歴を取得
 * @param staffId - スタッフID
 * @param options - オプション { limit }
 * @returns APIレスポンス
 */
function getPayoutHistory(staffId: string, options: { limit?: number } = {}): unknown {
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

  } catch (error: unknown) {
    logErr('getPayoutHistory', error, requestId);
    const msg = error instanceof Error ? error.message : String(error);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, 'システムエラーが発生しました', {}, requestId);
  }
}

/**
 * 支払いを取り消し（未払い状態に戻す）
 * @param payoutId - 支払ID
 * @param expectedUpdatedAt - 楽観ロック用
 * @returns APIレスポンス
 */
function undoPayout(payoutId: string, expectedUpdatedAt: string): unknown {
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
    const result = PayoutService.undoPayout(payoutId, expectedUpdatedAt) as { success: boolean; error?: string; message?: string };

    if (!result.success) {
      const errorCode = result.error === 'CONFLICT_ERROR'
        ? ERROR_CODES.CONFLICT_ERROR
        : ERROR_CODES.VALIDATION_ERROR;
      return buildErrorResponse(errorCode, result.error || 'Unknown error', { message: result.message }, requestId);
    }

    return buildSuccessResponse(result, requestId);

  } catch (error: unknown) {
    logErr('undoPayout', error, requestId);
    const msg = error instanceof Error ? error.message : String(error);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, 'システムエラーが発生しました', {}, requestId);
  }
}

/**
 * 支払いを削除（undoPayoutのエイリアス）
 * @param payoutId - 支払ID
 * @param expectedUpdatedAt - 楽観ロック用
 * @returns APIレスポンス
 */
function deletePayout(payoutId: string, expectedUpdatedAt: string): unknown {
  return undoPayout(payoutId, expectedUpdatedAt);
}

/**
 * 支払いを更新（調整額・備考）
 * @param payout - 更新データ
 * @param expectedUpdatedAt - 楽観ロック用
 * @returns APIレスポンス
 */
function savePayout(payout: Partial<PayoutRecord>, expectedUpdatedAt: string): unknown {
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

    // Service呼び出し（payout_idの存在は上で検証済み）
    const result = PayoutService.update(payout as Partial<PayoutRecord> & { payout_id: string }, expectedUpdatedAt);

    if (!result.success) {
      const errorCode = result.error === 'CONFLICT_ERROR'
        ? ERROR_CODES.CONFLICT_ERROR
        : ERROR_CODES.VALIDATION_ERROR;
      return buildErrorResponse(errorCode, result.error || 'Unknown error', {}, requestId);
    }

    return buildSuccessResponse(result, requestId);

  } catch (error: unknown) {
    logErr('savePayout', error, requestId);
    const msg = error instanceof Error ? error.message : String(error);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, 'システムエラーが発生しました', {}, requestId);
  }
}

// ========== P2-3 New APIs: Confirmed Workflow ==========

/**
 * 支払いを確認済みとして記録（confirmed状態）
 * @param staffId - スタッフID
 * @param endDate - 集計終了日
 * @param options - オプション { adjustment_amount, notes }
 * @returns APIレスポンス
 */
function confirmPayout(staffId: string, endDate: string, options: { adjustment_amount?: number; notes?: string } = {}): unknown {
  const requestId = generateRequestId();
  const lock = LockService.getScriptLock();
  let lockAcquired = false;

  try {
    lock.waitLock(5000);
    lockAcquired = true;

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
    const result = PayoutService.confirmPayout(staffId, endDate, options) as { success: boolean; error?: string; message?: string };

    if (!result.success) {
      return buildErrorResponse(ERROR_CODES.VALIDATION_ERROR, result.error || 'Unknown error', { message: result.message }, requestId);
    }

    return buildSuccessResponse(result, requestId);

  } catch (error: unknown) {
    if (!lockAcquired) {
      return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, '別の処理が実行中です。しばらく待ってから再度お試しください。', {}, requestId);
    }
    logErr('confirmPayout', error, requestId);
    const msg = error instanceof Error ? error.message : String(error);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, 'システムエラーが発生しました', {}, requestId);
  } finally {
    if (lockAcquired) {
      lock.releaseLock();
    }
  }
}

/**
 * 複数スタッフの支払いを一括確認
 * @param staffIds - スタッフID配列
 * @param endDate - 集計終了日
 * @param options - オプション { adjustments: { [staffId]: { adjustment_amount, notes } } }
 * @returns APIレスポンス
 */
function bulkConfirmPayouts(staffIds: string[], endDate: string, options: { adjustments?: Record<string, { adjustment_amount?: number; notes?: string }> } = {}): unknown {
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

  } catch (error: unknown) {
    logErr('bulkConfirmPayouts', error, requestId);
    const msg = error instanceof Error ? error.message : String(error);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, 'システムエラーが発生しました', {}, requestId);
  }
}

/**
 * 確認済み支払いを振込完了にする
 * @param payoutId - 支払ID
 * @param options - オプション { paid_date, expectedUpdatedAt }
 * @returns APIレスポンス
 */
function payConfirmedPayout(payoutId: string, options: { paid_date?: string; expectedUpdatedAt?: string; expected_updated_at?: string } = {}): unknown {
  const requestId = generateRequestId();

  try {
    // Backward compatibility for legacy snake_case option name.
    if (!options.expectedUpdatedAt && options.expected_updated_at) {
      options.expectedUpdatedAt = options.expected_updated_at;
    }

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
        return buildErrorResponse(ERROR_CODES.VALIDATION_ERROR, validationResult.error || 'Validation failed', {}, requestId);
      }
    }

    // Service呼び出し
    const result = PayoutService.payConfirmedPayout(payoutId, options) as { success: boolean; error?: string; message?: string };

    if (!result.success) {
      const errorCode = result.error === 'CONFLICT_ERROR'
        ? ERROR_CODES.CONFLICT_ERROR
        : ERROR_CODES.VALIDATION_ERROR;
      return buildErrorResponse(errorCode, result.error || 'Unknown error', { message: result.message }, requestId);
    }

    return buildSuccessResponse(result, requestId);

  } catch (error: unknown) {
    logErr('payConfirmedPayout', error, requestId);
    const msg = error instanceof Error ? error.message : String(error);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, 'システムエラーが発生しました', {}, requestId);
  }
}

/**
 * 複数の確認済み支払いを一括振込完了にする
 * @param payoutIds - 支払ID配列
 * @param options - オプション { paid_date, expectedUpdatedAtMap }
 * @returns APIレスポンス
 */
function bulkPayConfirmed(payoutIds: string[], options: { paid_date?: string; expectedUpdatedAtMap?: Record<string, string> } = {}): unknown {
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

    if (!options.expectedUpdatedAtMap || typeof options.expectedUpdatedAtMap !== 'object') {
      return buildErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'expectedUpdatedAtMap is required', {}, requestId);
    }

    const missingExpectedUpdatedAt = payoutIds.filter(function(payoutId) {
      return !options.expectedUpdatedAtMap || !options.expectedUpdatedAtMap[payoutId];
    });
    if (missingExpectedUpdatedAt.length > 0) {
      return buildErrorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        'expectedUpdatedAtMap must include all payoutIds',
        { missingPayoutIds: missingExpectedUpdatedAt },
        requestId
      );
    }

    // paid_dateのフォーマット検証
    if (options.paid_date && !/^\d{4}-\d{2}-\d{2}$/.test(options.paid_date)) {
      return buildErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'paid_date must be in YYYY-MM-DD format', {}, requestId);
    }

    // paid_dateの業務整合性検証（各payoutに対して検証）
    if (options.paid_date) {
      const validationErrors: { payoutId: string; error: string }[] = [];
      for (const payoutId of payoutIds) {
        const validationResult = _validatePaidDate(payoutId, options.paid_date);
        if (!validationResult.valid) {
          validationErrors.push({
            payoutId: payoutId,
            error: validationResult.error || 'Validation failed'
          });
        }
      }
      // 検証エラーがあれば処理を中断
      if (validationErrors.length > 0) {
        return buildErrorResponse(
          ERROR_CODES.VALIDATION_ERROR,
          'paid_date validation failed for some payouts',
          { validationErrors: validationErrors },
          requestId
        );
      }
    }

    // Service呼び出し（楽観ロックを伝播）
    const result = PayoutService.bulkPayConfirmed(payoutIds, {
      paid_date: options.paid_date,
      expectedUpdatedAtMap: options.expectedUpdatedAtMap
    });

    return buildSuccessResponse(result, requestId);

  } catch (error: unknown) {
    logErr('bulkPayConfirmed', error, requestId);
    const msg = error instanceof Error ? error.message : String(error);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, 'システムエラーが発生しました', {}, requestId);
  }
}

/**
 * 確認済み支払い一覧を取得
 * @param options - オプション { payout_type }
 * @returns APIレスポンス
 */
function getConfirmedPayouts(options: { payout_type?: PayoutType } = {}): unknown {
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
      totalAmount: payouts.reduce(function(sum: number, p: PayoutRecord) { return sum + (p.total_amount || 0); }, 0)
    }, requestId);

  } catch (error: unknown) {
    logErr('getConfirmedPayouts', error, requestId);
    const msg = error instanceof Error ? error.message : String(error);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, 'システムエラーが発生しました', {}, requestId);
  }
}

// ========== Validation Helpers ==========

/**
 * 日付文字列をローカルタイムゾーンでパース（UTC解釈回避）
 * @param dateStr - 日付文字列（YYYY-MM-DD形式）
 * @returns パースされた日付またはnull
 */
function _parseLocalDate(dateStr: string): Date | null {
  if (!dateStr) return null;

  const normalized = String(dateStr).replace(/\//g, '-');
  const parts = normalized.split('-');
  if (parts.length !== 3) return null; // 無効な形式はnullを返す

  const [y, m, d] = parts.map(Number);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return null;

  const date = new Date(y, m - 1, d); // ローカルタイムゾーンで作成
  // Invalid Date check
  if (isNaN(date.getTime())) return null;
  return date;
}

/**
 * paid_dateの業務整合性を検証
 * @param payoutId - 支払ID
 * @param paidDate - 支払日
 * @returns { valid: boolean, error?: string }
 */
function _validatePaidDate(payoutId: string, paidDate: string): { valid: boolean; error?: string } {
  const payout = PayoutRepository.findById(payoutId);
  if (!payout) {
    return { valid: false, error: 'Payout not found' };
  }

  const paidDateObj = _parseLocalDate(paidDate);
  if (!paidDateObj) {
    return { valid: false, error: 'Invalid paid_date format' };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 1. period_end以降であること
  if (payout.period_end) {
    const periodEndObj = _parseLocalDate(payout.period_end);
    if (periodEndObj && paidDateObj < periodEndObj) {
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
 * 支払いエクスポート時の同名ファイル存在チェック
 * @param fromDate - 開始日（YYYY-MM-DD）
 * @param toDate - 終了日（YYYY-MM-DD）
 * @returns APIレスポンス { exists: boolean, existingFile?: { id, name, url, modifiedDate } }
 */
function checkPayoutExportFile(fromDate: string, toDate: string): unknown {
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

    // Service呼び出し
    const result = PayoutExportService.checkExistingFile(fromDate, toDate);
    return buildSuccessResponse(result, requestId);

  } catch (error: unknown) {
    logErr('checkPayoutExportFile', error, requestId);
    const msg = error instanceof Error ? error.message : String(error);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, 'システムエラーが発生しました', {}, requestId);
  }
}

/**
 * 振込金額集計をExcelエクスポート
 * @param fromDate - 開始日（YYYY-MM-DD）
 * @param toDate - 終了日（YYYY-MM-DD）
 * @param options - オプション（action: 'overwrite'|'rename' で重複ファイル処理を指定）
 * @returns { ok: true, data: { fileId, url, fileName, recordCount } }
 */
function exportPayouts(fromDate: string, toDate: string, options: { action?: string } = {}): unknown {
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
    const result = PayoutExportService.exportToExcel(fromDate, toDate, options);

    // 監査ログ
    console.log('PAYOUT_EXPORT', JSON.stringify({
      from_date: fromDate,
      to_date: toDate,
      file_id: result.fileId,
      record_count: result.recordCount,
      action: options.action || 'default'
    }));

    return buildSuccessResponse(result, requestId);

  } catch (error: unknown) {
    logErr('exportPayouts', error, requestId);
    const msg = error instanceof Error ? error.message : String(error);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, 'システムエラーが発生しました', {}, requestId);
  }
}

/**
 * 支払エクスポートフォルダのURLを取得
 * @returns APIレスポンス
 */
function getPayoutExportFolderUrl(): unknown {
  const requestId = generateRequestId();

  try {
    const authResult = checkPermission(ROLES.STAFF);
    if (!authResult.allowed) {
      return buildErrorResponse(ERROR_CODES.PERMISSION_DENIED, authResult.message, {}, requestId);
    }

    const status = PayoutExportService.getExportFolderStatus();
    return buildSuccessResponse(status, requestId);

  } catch (error: unknown) {
    logErr('getPayoutExportFolderUrl', error, requestId);
    const msg = error instanceof Error ? error.message : String(error);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, 'システムエラーが発生しました', {}, requestId);
  }
}

// ========== Payout Detail Export API ==========

/**
 * 支払明細の同名ファイル存在チェック
 * @param payoutId - 支払ID
 * @returns APIレスポンス
 */
function checkPayoutDetailExportFile(payoutId: string): unknown {
  const requestId = generateRequestId();

  try {
    const authResult = checkPermission(ROLES.MANAGER);
    if (!authResult.allowed) {
      return buildErrorResponse(ERROR_CODES.PERMISSION_DENIED, '権限がありません', {}, requestId);
    }

    if (!payoutId) {
      return buildErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'payoutId is required', {}, requestId);
    }

    const result = PayoutDetailExportService.checkExistingFile(payoutId);
    return buildSuccessResponse(result, requestId);

  } catch (error: unknown) {
    logErr('checkPayoutDetailExportFile', error, requestId);
    const msg = error instanceof Error ? error.message : String(error);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, 'システムエラーが発生しました', {}, requestId);
  }
}

/**
 * 支払明細をExcel出力
 * @param payoutId - 支払ID
 * @param options - オプション { action: 'overwrite'|'rename' }
 * @returns APIレスポンス
 */
function exportPayoutDetail(payoutId: string, options: { action?: string } = {}): unknown {
  const requestId = generateRequestId();

  try {
    const authResult = checkPermission(ROLES.MANAGER);
    if (!authResult.allowed) {
      return buildErrorResponse(ERROR_CODES.PERMISSION_DENIED, '権限がありません', {}, requestId);
    }

    if (!payoutId) {
      return buildErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'payoutId is required', {}, requestId);
    }

    const result = PayoutDetailExportService.exportPayoutDetail(payoutId, options);

    console.log('PAYOUT_DETAIL_EXPORT', JSON.stringify({
      payout_id: payoutId,
      file_id: result.fileId,
      assignment_count: result.assignmentCount,
      action: options.action || 'default'
    }));

    return buildSuccessResponse(result, requestId);

  } catch (error: unknown) {
    logErr('exportPayoutDetail', error, requestId);
    const msg = error instanceof Error ? error.message : String(error);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, 'システムエラーが発生しました', {}, requestId);
  }
}

// ========== Subcontractor Payout APIs (P2-8) ==========

/**
 * 外注先一覧を取得（支払い画面用）
 * @returns { ok: true, data: { subcontractors: [] } }
 */
function getSubcontractorsForPayouts(): unknown {
  const requestId = generateRequestId();

  try {
    const authResult = checkPermission(ROLES.STAFF);
    if (!authResult.allowed) {
      return buildErrorResponse(ERROR_CODES.PERMISSION_DENIED, authResult.message, {}, requestId);
    }

    const subcontractors = SubcontractorRepository.search({ is_active: true });

    const data = subcontractors.map(function(s) {
      return {
        subcontractor_id: s.subcontractor_id as string,
        company_name: s.company_name as string
      };
    });

    return buildSuccessResponse({ subcontractors: data }, requestId);

  } catch (error: unknown) {
    logErr('getSubcontractorsForPayouts', error, requestId);
    const msg = error instanceof Error ? error.message : String(error);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, 'システムエラーが発生しました', {}, requestId);
  }
}

/**
 * 外注先の未払いサマリーを取得
 * @param subcontractorId - 外注先ID
 * @param endDate - 集計終了日（YYYY-MM-DD）
 * @returns APIレスポンス
 */
function getUnpaidSummaryForSubcontractor(subcontractorId: string, endDate: string): unknown {
  const requestId = generateRequestId();

  try {
    const authResult = checkPermission(ROLES.STAFF);
    if (!authResult.allowed) {
      return buildErrorResponse(ERROR_CODES.PERMISSION_DENIED, authResult.message, {}, requestId);
    }

    if (!subcontractorId) {
      return buildErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'subcontractorId is required', {}, requestId);
    }

    if (!endDate || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return buildErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'endDate must be in YYYY-MM-DD format', {}, requestId);
    }

    const calcResult = PayoutService.calculatePayoutForSubcontractor(subcontractorId, endDate);
    const result: Record<string, unknown> = { ...calcResult };

    const subcontractor = SubcontractorRepository.findById(subcontractorId);
    result.companyName = subcontractor ? subcontractor.company_name as string : '(不明)';

    return buildSuccessResponse(result, requestId);

  } catch (error: unknown) {
    logErr('getUnpaidSummaryForSubcontractor', error, requestId);
    const msg = error instanceof Error ? error.message : String(error);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, 'システムエラーが発生しました', {}, requestId);
  }
}

/**
 * 未払い外注先一覧を取得
 * @param endDate - 集計終了日
 * @returns APIレスポンス
 */
function getUnpaidSubcontractorList(endDate: string): unknown {
  const requestId = generateRequestId();

  try {
    const authResult = checkPermission(ROLES.STAFF);
    if (!authResult.allowed) {
      return buildErrorResponse(ERROR_CODES.PERMISSION_DENIED, authResult.message, {}, requestId);
    }

    if (!endDate) {
      endDate = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return buildErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'endDate must be in YYYY-MM-DD format', {}, requestId);
    }

    const result = PayoutService.getUnpaidSubcontractorList(endDate) as Record<string, unknown>[];

    return buildSuccessResponse({
      endDate: endDate,
      subcontractorList: result,
      totalCount: result.length,
      totalAmount: result.reduce(function(sum: number, s: Record<string, unknown>) { return sum + ((s.estimatedAmount as number) || 0); }, 0)
    }, requestId);

  } catch (error: unknown) {
    logErr('getUnpaidSubcontractorList', error, requestId);
    const msg = error instanceof Error ? error.message : String(error);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, 'システムエラーが発生しました', {}, requestId);
  }
}

/**
 * 外注費を確認済みにする
 * @param subcontractorId - 外注先ID
 * @param endDate - 集計終了日
 * @param options - オプション
 * @returns APIレスポンス
 */
function confirmSubcontractorPayout(subcontractorId: string, endDate: string, options: { adjustment_amount?: number; notes?: string } = {}): unknown {
  const requestId = generateRequestId();

  try {
    const authResult = checkPermission(ROLES.MANAGER);
    if (!authResult.allowed) {
      return buildErrorResponse(ERROR_CODES.PERMISSION_DENIED, authResult.message, {}, requestId);
    }

    if (!subcontractorId) {
      return buildErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'subcontractorId is required', {}, requestId);
    }

    if (!endDate || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return buildErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'endDate must be in YYYY-MM-DD format', {}, requestId);
    }

    const result = PayoutService.confirmPayoutForSubcontractor(subcontractorId, endDate, options) as { success: boolean; error?: string; message?: string };

    if (!result.success) {
      return buildErrorResponse(ERROR_CODES.BUSINESS_ERROR, result.error || 'Unknown error', { message: result.message }, requestId);
    }

    return buildSuccessResponse(result, requestId);

  } catch (error: unknown) {
    logErr('confirmSubcontractorPayout', error, requestId);
    const msg = error instanceof Error ? error.message : String(error);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, 'システムエラーが発生しました', {}, requestId);
  }
}

/**
 * 外注費を支払済にする
 * @param subcontractorId - 外注先ID
 * @param endDate - 集計終了日
 * @param options - オプション
 * @returns APIレスポンス
 */
function markSubcontractorPayoutAsPaid(subcontractorId: string, endDate: string, options: { paid_date?: string; adjustment_amount?: number; notes?: string } = {}): unknown {
  const requestId = generateRequestId();

  try {
    const authResult = checkPermission(ROLES.MANAGER);
    if (!authResult.allowed) {
      return buildErrorResponse(ERROR_CODES.PERMISSION_DENIED, authResult.message, {}, requestId);
    }

    if (!subcontractorId) {
      return buildErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'subcontractorId is required', {}, requestId);
    }

    if (!endDate || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return buildErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'endDate must be in YYYY-MM-DD format', {}, requestId);
    }

    if (options.paid_date && !/^\d{4}-\d{2}-\d{2}$/.test(options.paid_date)) {
      return buildErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'paid_date must be in YYYY-MM-DD format', {}, requestId);
    }

    const result = PayoutService.markAsPaidForSubcontractor(subcontractorId, endDate, options) as { success: boolean; error?: string; message?: string };

    if (!result.success) {
      return buildErrorResponse(ERROR_CODES.BUSINESS_ERROR, result.error || 'Unknown error', { message: result.message }, requestId);
    }

    return buildSuccessResponse(result, requestId);

  } catch (error: unknown) {
    logErr('markSubcontractorPayoutAsPaid', error, requestId);
    const msg = error instanceof Error ? error.message : String(error);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, 'システムエラーが発生しました', {}, requestId);
  }
}

/**
 * 外注先の支払い履歴を取得
 * @param subcontractorId - 外注先ID
 * @param options - オプション { limit }
 * @returns APIレスポンス
 */
function getSubcontractorPayoutHistory(subcontractorId: string, options: { limit?: number } = {}): unknown {
  const requestId = generateRequestId();

  try {
    const authResult = checkPermission(ROLES.STAFF);
    if (!authResult.allowed) {
      return buildErrorResponse(ERROR_CODES.PERMISSION_DENIED, authResult.message, {}, requestId);
    }

    if (!subcontractorId) {
      return buildErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'subcontractorId is required', {}, requestId);
    }

    const history = PayoutService.getSubcontractorHistory(subcontractorId, options);

    return buildSuccessResponse({
      subcontractorId: subcontractorId,
      history: history,
      count: history.length
    }, requestId);

  } catch (error: unknown) {
    logErr('getSubcontractorPayoutHistory', error, requestId);
    const msg = error instanceof Error ? error.message : String(error);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, 'システムエラーが発生しました', {}, requestId);
  }
}

/**
 * 外注費の支払い一覧を検索
 * @param query - 検索条件
 * @returns APIレスポンス
 */
function searchSubcontractorPayouts(query: PayoutSearchQuery = {}): unknown {
  const requestId = generateRequestId();

  try {
    const authResult = checkPermission(ROLES.STAFF);
    if (!authResult.allowed) {
      return buildErrorResponse(ERROR_CODES.PERMISSION_DENIED, authResult.message, {}, requestId);
    }

    // 外注先支払いのみを検索
    const searchQuery: PayoutSearchQuery = {
      ...query,
      limit: query.limit || 200,
      payout_type: 'SUBCONTRACTOR'
    };

    const payouts = PayoutService.search(searchQuery);

    return buildSuccessResponse({
      payouts: payouts,
      count: payouts.length
    }, requestId);

  } catch (error: unknown) {
    logErr('searchSubcontractorPayouts', error, requestId);
    const msg = error instanceof Error ? error.message : String(error);
    return buildErrorResponse(ERROR_CODES.SYSTEM_ERROR, 'システムエラーが発生しました', {}, requestId);
  }
}
