/**
 * Assignment API Controller
 *
 * 配置管理のAPIエンドポイント
 * フロントエンドから google.script.run 経由で呼び出される
 */

/**
 * 配置を保存（追加/更新/削除の差分処理）
 *
 * @param {string} jobId - 案件ID
 * @param {Object} changes - 変更内容
 * @param {Object[]} changes.upserts - 追加/更新する配置データ
 * @param {string[]} changes.deletes - 削除する配置ID配列
 * @param {string} expectedUpdatedAt - 期待する案件のupdated_at（楽観ロック）
 * @returns {Object} APIレスポンス
 *
 * @example
 * // 新規配置の追加
 * saveAssignments('job_xxx', {
 *   upserts: [{
 *     staff_id: 'stf_xxx',
 *     pay_unit: 'FULLDAY',
 *     invoice_unit: 'FULLDAY',
 *     display_time_slot: 'jotou',
 *     transport_area: '23ku_inner'
 *   }],
 *   deletes: []
 * }, '2025-12-18T10:00:00.000Z');
 *
 * @example
 * // 配置の更新
 * saveAssignments('job_xxx', {
 *   upserts: [{
 *     assignment_id: 'asg_xxx',
 *     transport_amount: 1500,
 *     transport_is_manual: true
 *   }],
 *   deletes: []
 * }, '2025-12-18T10:00:00.000Z');
 *
 * @example
 * // 配置の削除
 * saveAssignments('job_xxx', {
 *   upserts: [],
 *   deletes: ['asg_xxx', 'asg_yyy']
 * }, '2025-12-18T10:00:00.000Z');
 */
function saveAssignments(jobId, changes, expectedUpdatedAt) {
  const requestId = generateRequestId();

  try {
    // 認可チェック
    const authResult = checkPermission(ROLES.MANAGER);
    if (!authResult.allowed) {
      return buildErrorResponse(
        ERROR_CODES.PERMISSION_DENIED,
        authResult.message || '権限がありません',
        {},
        requestId
      );
    }

    // 入力検証
    if (!jobId) {
      return buildErrorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        '案件IDは必須です',
        { field: 'jobId' },
        requestId
      );
    }

    if (!changes || ((!changes.upserts || changes.upserts.length === 0) &&
                     (!changes.deletes || changes.deletes.length === 0))) {
      return buildErrorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        '変更内容が指定されていません',
        {},
        requestId
      );
    }

    // サービス呼び出し
    return AssignmentService.saveAssignments(jobId, changes, expectedUpdatedAt);

  } catch (e) {
    logErr('saveAssignments', e, requestId);
    return buildErrorResponse(
      ERROR_CODES.SYSTEM_ERROR,
      'システムエラーが発生しました',
      { message: e.message },
      requestId
    );
  }
}

/**
 * 案件の配置一覧を取得
 *
 * @param {string} jobId - 案件ID
 * @returns {Object} APIレスポンス { ok: true, data: { job, assignments } }
 */
function getAssignments(jobId) {
  const requestId = generateRequestId();

  try {
    // 認可チェック
    const authResult = checkPermission(ROLES.STAFF);
    if (!authResult.allowed) {
      return buildErrorResponse(
        ERROR_CODES.PERMISSION_DENIED,
        authResult.message || '権限がありません',
        {},
        requestId
      );
    }

    // 入力検証
    if (!jobId) {
      return buildErrorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        '案件IDは必須です',
        { field: 'jobId' },
        requestId
      );
    }

    const result = AssignmentService.getAssignmentsByJobId(jobId);

    return buildSuccessResponse(result, requestId);

  } catch (e) {
    logErr('getAssignments', e, requestId);

    if (e.message === '案件が見つかりません') {
      return buildErrorResponse(
        ERROR_CODES.NOT_FOUND,
        e.message,
        { jobId: jobId },
        requestId
      );
    }

    return buildErrorResponse(
      ERROR_CODES.SYSTEM_ERROR,
      'システムエラーが発生しました',
      { message: e.message },
      requestId
    );
  }
}

/**
 * 案件の過不足情報を取得
 *
 * @param {string} jobId - 案件ID
 * @returns {Object} APIレスポンス { ok: true, data: { required, assigned, shortage } }
 */
function getJobShortage(jobId) {
  const requestId = generateRequestId();

  try {
    // 認可チェック
    const authResult = checkPermission(ROLES.STAFF);
    if (!authResult.allowed) {
      return buildErrorResponse(
        ERROR_CODES.PERMISSION_DENIED,
        authResult.message || '権限がありません',
        {},
        requestId
      );
    }

    if (!jobId) {
      return buildErrorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        '案件IDは必須です',
        { field: 'jobId' },
        requestId
      );
    }

    const shortage = AssignmentService.getShortage(jobId);

    return buildSuccessResponse(shortage, requestId);

  } catch (e) {
    logErr('getJobShortage', e, requestId);
    return buildErrorResponse(
      ERROR_CODES.SYSTEM_ERROR,
      'システムエラーが発生しました',
      { message: e.message },
      requestId
    );
  }
}

/**
 * 日付ごとの過不足サマリーを取得
 *
 * @param {string} date - 日付（YYYY-MM-DD形式）
 * @returns {Object} APIレスポンス { ok: true, data: { jotou, shuujitsu, am, pm, yakin, mitei, total } }
 */
function getShortageByDate(date) {
  const requestId = generateRequestId();

  try {
    // 認可チェック
    const authResult = checkPermission(ROLES.STAFF);
    if (!authResult.allowed) {
      return buildErrorResponse(
        ERROR_CODES.PERMISSION_DENIED,
        authResult.message || '権限がありません',
        {},
        requestId
      );
    }

    // 日付のバリデーション
    if (!date || !isValidDate(date)) {
      return buildErrorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        '有効な日付を指定してください（YYYY-MM-DD形式）',
        { field: 'date' },
        requestId
      );
    }

    const summary = AssignmentService.getShortageByDate(date);

    return buildSuccessResponse(summary, requestId);

  } catch (e) {
    logErr('getShortageByDate', e, requestId);
    return buildErrorResponse(
      ERROR_CODES.SYSTEM_ERROR,
      'システムエラーが発生しました',
      { message: e.message },
      requestId
    );
  }
}

/**
 * スタッフの配置可能性をチェック
 *
 * @param {string} staffId - スタッフID
 * @param {string} jobId - 案件ID
 * @returns {Object} APIレスポンス { ok: true, data: { available, reason? } }
 */
function checkStaffAvailability(staffId, jobId) {
  const requestId = generateRequestId();

  try {
    // 認可チェック
    const authResult = checkPermission(ROLES.MANAGER);
    if (!authResult.allowed) {
      return buildErrorResponse(
        ERROR_CODES.PERMISSION_DENIED,
        authResult.message || '権限がありません',
        {},
        requestId
      );
    }

    // 入力検証
    if (!staffId || !jobId) {
      return buildErrorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        'スタッフIDと案件IDは必須です',
        {},
        requestId
      );
    }

    const result = AssignmentService.checkStaffAvailability(staffId, jobId);

    return buildSuccessResponse(result, requestId);

  } catch (e) {
    logErr('checkStaffAvailability', e, requestId);
    return buildErrorResponse(
      ERROR_CODES.SYSTEM_ERROR,
      'システムエラーが発生しました',
      { message: e.message },
      requestId
    );
  }
}

/**
 * スタッフ一覧を取得（配置画面用、フィルタリング付き）
 *
 * @param {Object} options - オプション
 * @param {string} options.jobId - 案件ID（NG顧客フィルタ用）
 * @param {string} options.skill - スキルフィルタ（鳶/揚げ/鳶揚げ）
 * @param {boolean} options.excludeAssigned - 既に配置済みのスタッフを除外
 * @returns {Object} APIレスポンス { ok: true, data: { staff: [] } }
 */
function getAvailableStaff(options = {}) {
  const requestId = generateRequestId();

  try {
    // 認可チェック
    const authResult = checkPermission(ROLES.STAFF);
    if (!authResult.allowed) {
      return buildErrorResponse(
        ERROR_CODES.PERMISSION_DENIED,
        authResult.message || '権限がありません',
        {},
        requestId
      );
    }

    // スタッフ一覧を取得（MasterCacheでキャッシュ）
    let staff = MasterCache.getStaff().filter(s => s.is_active);

    // 案件が指定されている場合
    let job = null;
    let assignedStaffIds = [];

    if (options.jobId) {
      job = JobRepository.findById(options.jobId);

      if (job) {
        // NG顧客フィルタ
        staff = staff.filter(s => {
          if (!s.ng_customers) return true;
          const ngCustomers = s.ng_customers.split(',').map(c => c.trim());
          return !ngCustomers.includes(job.customer_id);
        });

        // 既に配置済みのスタッフを取得
        if (options.excludeAssigned) {
          const assignments = AssignmentRepository.findByJobId(options.jobId);
          assignedStaffIds = assignments
            .filter(a => a.status !== 'CANCELLED')
            .map(a => a.staff_id);
        }
      }
    }

    // 既に配置済みのスタッフを除外
    if (options.excludeAssigned && assignedStaffIds.length > 0) {
      staff = staff.filter(s => !assignedStaffIds.includes(s.staff_id));
    }

    // スキルフィルタ
    if (options.skill) {
      staff = staff.filter(s => {
        if (!s.skills) return false;
        const skills = s.skills.split(',').map(sk => sk.trim());
        return skills.includes(options.skill);
      });
    }

    // 名前順でソート
    staff.sort((a, b) => {
      const nameA = a.name_kana || a.name || '';
      const nameB = b.name_kana || b.name || '';
      return nameA.localeCompare(nameB, 'ja');
    });

    // 必要な情報のみ返す
    const staffList = staff.map(s => ({
      staff_id: s.staff_id,
      name: s.name,
      name_kana: s.name_kana,
      phone: s.phone,
      ng_customers: s.ng_customers,
      skills: s.skills,
      has_motorbike: s.has_motorbike,
      staff_type: s.staff_type,
      daily_rate_half: s.daily_rate_half,
      daily_rate_basic: s.daily_rate_basic,
      daily_rate_fullday: s.daily_rate_fullday,
      daily_rate_night: s.daily_rate_night,
      daily_rate_tobi: s.daily_rate_tobi
    }));

    return buildSuccessResponse({ staff: staffList }, requestId);

  } catch (e) {
    logErr('getAvailableStaff', e, requestId);
    return buildErrorResponse(
      ERROR_CODES.SYSTEM_ERROR,
      'システムエラーが発生しました',
      { message: e.message },
      requestId
    );
  }
}

/**
 * 交通費マスターを取得
 *
 * @returns {Object} APIレスポンス { ok: true, data: { areas: [] } }
 */
function getTransportFeeAreas() {
  const requestId = generateRequestId();

  try {
    // 認可チェック
    const authResult = checkPermission(ROLES.STAFF);
    if (!authResult.allowed) {
      return buildErrorResponse(
        ERROR_CODES.PERMISSION_DENIED,
        authResult.message || '権限がありません',
        {},
        requestId
      );
    }

    const areas = getAllRecords('M_TransportFee');

    return buildSuccessResponse({ areas: areas }, requestId);

  } catch (e) {
    logErr('getTransportFeeAreas', e, requestId);
    return buildErrorResponse(
      ERROR_CODES.SYSTEM_ERROR,
      'システムエラーが発生しました',
      { message: e.message },
      requestId
    );
  }
}

/**
 * 案件の枠一覧を取得
 *
 * @param {string} jobId - 案件ID
 * @returns {Object} APIレスポンス { ok: true, data: { slots, totalCount } }
 */
function getJobSlots(jobId) {
  const requestId = generateRequestId();

  try {
    // 認可チェック
    const authResult = checkPermission(ROLES.STAFF);
    if (!authResult.allowed) {
      return buildErrorResponse(
        ERROR_CODES.PERMISSION_DENIED,
        authResult.message || '権限がありません',
        {},
        requestId
      );
    }

    // 入力検証
    if (!jobId) {
      return buildErrorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        '案件IDは必須です',
        { field: 'jobId' },
        requestId
      );
    }

    const result = SlotService.getSlotsByJobId(jobId);

    return buildSuccessResponse(result, requestId);

  } catch (e) {
    logErr('getJobSlots', e, requestId);
    return buildErrorResponse(
      ERROR_CODES.SYSTEM_ERROR,
      'システムエラーが発生しました',
      { message: e.message },
      requestId
    );
  }
}

/**
 * 案件の枠充足状況を取得
 *
 * @param {string} jobId - 案件ID
 * @returns {Object} APIレスポンス { ok: true, data: { slotStatuses, total } }
 */
function getSlotStatus(jobId) {
  const requestId = generateRequestId();

  try {
    // 認可チェック
    const authResult = checkPermission(ROLES.STAFF);
    if (!authResult.allowed) {
      return buildErrorResponse(
        ERROR_CODES.PERMISSION_DENIED,
        authResult.message || '権限がありません',
        {},
        requestId
      );
    }

    // 入力検証
    if (!jobId) {
      return buildErrorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        '案件IDは必須です',
        { field: 'jobId' },
        requestId
      );
    }

    const result = SlotService.getSlotStatus(jobId);

    return buildSuccessResponse(result, requestId);

  } catch (e) {
    logErr('getSlotStatus', e, requestId);
    return buildErrorResponse(
      ERROR_CODES.SYSTEM_ERROR,
      'システムエラーが発生しました',
      { message: e.message },
      requestId
    );
  }
}

/**
 * 配置を枠に割り当て
 *
 * @param {string} assignmentId - 配置ID
 * @param {string} slotId - 枠ID
 * @param {string} expectedUpdatedAt - 期待するupdated_at
 * @returns {Object} APIレスポンス
 */
function assignToSlot(assignmentId, slotId, expectedUpdatedAt) {
  const requestId = generateRequestId();

  try {
    // 認可チェック
    const authResult = checkPermission(ROLES.MANAGER);
    if (!authResult.allowed) {
      return buildErrorResponse(
        ERROR_CODES.PERMISSION_DENIED,
        authResult.message || '権限がありません',
        {},
        requestId
      );
    }

    // 入力検証
    if (!assignmentId || !slotId) {
      return buildErrorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        '配置IDと枠IDは必須です',
        {},
        requestId
      );
    }

    // サービス呼び出し
    return SlotService.assignToSlot(assignmentId, slotId, expectedUpdatedAt);

  } catch (e) {
    logErr('assignToSlot', e, requestId);
    return buildErrorResponse(
      ERROR_CODES.SYSTEM_ERROR,
      'システムエラーが発生しました',
      { message: e.message },
      requestId
    );
  }
}

/**
 * 日付ごとの枠充足状況サマリーを取得
 *
 * @param {string} date - 日付（YYYY-MM-DD形式）
 * @returns {Object} APIレスポンス
 */
function getSlotStatusByDate(date) {
  const requestId = generateRequestId();

  try {
    // 認可チェック
    const authResult = checkPermission(ROLES.STAFF);
    if (!authResult.allowed) {
      return buildErrorResponse(
        ERROR_CODES.PERMISSION_DENIED,
        authResult.message || '権限がありません',
        {},
        requestId
      );
    }

    // 日付のバリデーション
    if (!date || !isValidDate(date)) {
      return buildErrorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        '有効な日付を指定してください（YYYY-MM-DD形式）',
        { field: 'date' },
        requestId
      );
    }

    const result = SlotService.getSlotStatusByDate(date);

    return buildSuccessResponse(result, requestId);

  } catch (e) {
    logErr('getSlotStatusByDate', e, requestId);
    return buildErrorResponse(
      ERROR_CODES.SYSTEM_ERROR,
      'システムエラーが発生しました',
      { message: e.message },
      requestId
    );
  }
}

/**
 * 日付ごとの全配置を取得（競合チェック用）
 *
 * モーダル開時に呼び出し、その日の全配置をJob情報付きで一括取得。
 * クライアント側でキャッシュし、スタッフ選択時の競合チェックに使用。
 *
 * @param {string} date - 日付（YYYY-MM-DD形式）
 * @returns {Object} APIレスポンス { ok: true, data: { assignments: [] } }
 */
function getDayAssignmentsForConflictCheck(date) {
  const requestId = generateRequestId();

  try {
    // 認可チェック
    const authResult = checkPermission(ROLES.STAFF);
    if (!authResult.allowed) {
      return buildErrorResponse(
        ERROR_CODES.PERMISSION_DENIED,
        authResult.message || '権限がありません',
        {},
        requestId
      );
    }

    // 日付のバリデーション
    if (!date || !isValidDate(date)) {
      return buildErrorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        '有効な日付を指定してください（YYYY-MM-DD形式）',
        { field: 'date' },
        requestId
      );
    }

    const assignments = AssignmentService.getDayAssignmentsForConflictCheck(date);

    return buildSuccessResponse({ assignments: assignments }, requestId);

  } catch (e) {
    logErr('getDayAssignmentsForConflictCheck', e, requestId);
    return buildErrorResponse(
      ERROR_CODES.SYSTEM_ERROR,
      'システムエラーが発生しました',
      { message: e.message },
      requestId
    );
  }
}

/**
 * ダッシュボード用の配置情報を取得（案件＋配置＋過不足）
 *
 * @param {string} date - 日付（YYYY-MM-DD形式）
 * @returns {Object} APIレスポンス
 */
function getDashboardAssignments(date) {
  const requestId = generateRequestId();

  try {
    // 認可チェック
    const authResult = checkPermission(ROLES.STAFF);
    if (!authResult.allowed) {
      return buildErrorResponse(
        ERROR_CODES.PERMISSION_DENIED,
        authResult.message || '権限がありません',
        {},
        requestId
      );
    }

    // 日付のバリデーション
    if (!date || !isValidDate(date)) {
      return buildErrorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        '有効な日付を指定してください（YYYY-MM-DD形式）',
        { field: 'date' },
        requestId
      );
    }

    // 案件を取得
    const jobs = JobRepository.findByDate(date);

    // 配置を取得
    const assignments = AssignmentRepository.findByDate(date);

    // 顧客情報を取得（MasterCacheでキャッシュ）
    const customerMapFull = MasterCache.getCustomerMap();
    const customerCache = {};
    for (const customerId in customerMapFull) {
      const customer = customerMapFull[customerId];
      customerCache[customerId] = customer.company_name + (customer.branch_name ? ' ' + customer.branch_name : '');
    }

    // スタッフ情報を取得（MasterCacheでキャッシュ）
    const staffCache = MasterCache.getStaffMap();

    // 配置にスタッフ名を付加
    const enrichedAssignments = assignments.map(a => {
      const staff = staffCache[a.staff_id];
      return {
        ...a,
        staff_name: staff ? staff.name : '（削除済み）'
      };
    });

    // 案件ごとに配置をグループ化（一意なスタッフIDでカウント）
    const jobsWithAssignments = jobs.map(job => {
      const jobAssignments = enrichedAssignments.filter(a => a.job_id === job.job_id);
      const activeAssignments = jobAssignments.filter(a => a.status !== 'CANCELLED');
      const uniqueStaffIds = new Set(activeAssignments.map(a => a.staff_id));
      const assignedCount = uniqueStaffIds.size;

      return {
        ...job,
        customer_name: customerCache[job.customer_id] || '',
        assignments: jobAssignments,
        assigned_count: assignedCount,
        shortage: (Number(job.required_count) || 0) - assignedCount
      };
    });

    // 過不足サマリーを計算（案件データから直接計算）
    const summary = {
      jotou: { required: 0, assigned: 0, shortage: 0 },
      shuujitsu: { required: 0, assigned: 0, shortage: 0 },
      am: { required: 0, assigned: 0, shortage: 0 },
      pm: { required: 0, assigned: 0, shortage: 0 },
      yakin: { required: 0, assigned: 0, shortage: 0 },
      mitei: { required: 0, assigned: 0, shortage: 0 },
      total: { required: 0, assigned: 0, shortage: 0 }
    };

    // 案件データから直接サマリーを計算
    for (const job of jobsWithAssignments) {
      if (job.status === 'cancelled') continue;

      const slot = job.time_slot;
      const required = Number(job.required_count) || 0;
      const assigned = Number(job.assigned_count) || 0;
      const shortage = required - assigned;

      if (summary[slot]) {
        summary[slot].required += required;
        summary[slot].assigned += assigned;
        summary[slot].shortage += shortage;
      }

      summary.total.required += required;
      summary.total.assigned += assigned;
      summary.total.shortage += shortage;
    }

    const shortageSummary = summary;

    return buildSuccessResponse({
      jobs: jobsWithAssignments,
      summary: shortageSummary,
      date: date
    }, requestId);

  } catch (e) {
    logErr('getDashboardAssignments', e, requestId);
    return buildErrorResponse(
      ERROR_CODES.SYSTEM_ERROR,
      'システムエラーが発生しました',
      { message: e.message },
      requestId
    );
  }
}
