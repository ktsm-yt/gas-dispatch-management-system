/**
 * Job Service
 *
 * 案件管理の業務ロジック
 */

const JobService = {
  /**
   * 案件を取得（配置情報付き）
   * @param {string} jobId - 案件ID
   * @returns {Object|null} { job, assignments[] } または null
   */
  get: function(jobId) {
    const job = JobRepository.findById(jobId);

    if (!job) {
      return null;
    }

    // 顧客名を追加
    const customerMap = this._getCustomerMap();
    const jobWithCustomer = {
      ...job,
      customer_name: customerMap[job.customer_id] || ''
    };

    // TODO: 配置情報取得（P1-4で実装）
    const assignments = [];

    return {
      job: jobWithCustomer,
      assignments: assignments
    };
  },

  /**
   * ダッシュボードデータを取得
   * @param {string} date - 日付（YYYY-MM-DD形式）
   * @returns {Object} { jobs[], stats }
   */
  getDashboard: function(date) {
    // 日付バリデーション
    if (!isValidDate(date)) {
      throw new Error('Invalid date format. Expected YYYY-MM-DD');
    }

    const jobs = JobRepository.findByDate(date);

    // 顧客マスターを取得してマップ作成
    const customerMap = this._getCustomerMap();

    // 配置データを取得
    const allAssignments = AssignmentRepository.findByDate(date);

    // スタッフマスターを取得してマップ作成
    const allStaff = getAllRecords('M_Staff');
    const staffMap = {};
    for (const staff of allStaff) {
      if (staff.staff_id && !staff.is_deleted) {
        staffMap[staff.staff_id] = staff.name;
      }
    }

    // 案件ごとの配置をグループ化
    const assignmentsByJob = {};
    for (const a of allAssignments) {
      if (!assignmentsByJob[a.job_id]) {
        assignmentsByJob[a.job_id] = [];
      }
      assignmentsByJob[a.job_id].push(a);
    }

    // 顧客名と配置情報をJOIN
    const jobsWithCustomer = jobs.map(job => {
      const jobAssignments = assignmentsByJob[job.job_id] || [];
      const activeAssignments = jobAssignments.filter(a => a.status !== 'CANCELLED');

      // 一意なスタッフIDでカウント（重複レコードがあっても正しくカウント）
      const uniqueStaffIds = new Set(activeAssignments.map(a => a.staff_id));
      const staffNames = Array.from(uniqueStaffIds).map(id => staffMap[id] || '（削除済み）');

      return {
        job_id: job.job_id,
        customer_id: job.customer_id,
        customer_name: customerMap[job.customer_id] || '',
        site_name: job.site_name,
        site_address: job.site_address || '',
        time_slot: job.time_slot,
        start_time: job.start_time,
        job_type: job.job_type,
        required_count: job.required_count,
        assigned_count: uniqueStaffIds.size,
        status: job.status,
        supervisor_name: job.supervisor_name || '',
        notes: job.notes || '',
        staff_names: staffNames,
        updated_at: job.updated_at
      };
    });

    // 統計情報（配置情報付きのjobsWithCustomerを使用）
    const stats = this._calculateStats(jobsWithCustomer);

    return {
      date: date,
      jobs: jobsWithCustomer,
      stats: stats
    };
  },

  /**
   * ダッシュボード更新メタ情報を取得
   * @param {string} date - 日付（YYYY-MM-DD形式）
   * @returns {Object} { maxUpdatedAt }
   */
  getDashboardMeta: function(date) {
    if (!isValidDate(date)) {
      throw new Error('Invalid date format. Expected YYYY-MM-DD');
    }

    const maxUpdatedAt = JobRepository.getMaxUpdatedAt(date);

    return {
      date: date,
      maxUpdatedAt: maxUpdatedAt
    };
  },

  /**
   * 案件を検索
   * @param {Object} query - 検索条件
   * @returns {Object[]} 案件配列（顧客名・配置数付き）
   */
  search: function(query) {
    const jobs = JobRepository.search(query);

    // 顧客マスターを取得してマップ作成
    const customerMap = this._getCustomerMap();

    // 全配置を取得して案件ごとに一意なスタッフIDをグループ化
    const allAssignments = getAllRecords('T_JobAssignments');
    const staffIdsByJob = {};
    for (const a of allAssignments) {
      if (!a.is_deleted && a.status !== 'CANCELLED') {
        if (!staffIdsByJob[a.job_id]) {
          staffIdsByJob[a.job_id] = new Set();
        }
        staffIdsByJob[a.job_id].add(a.staff_id);
      }
    }

    // 顧客名と配置数をJOIN（一意なスタッフ数）
    let result = jobs.map(job => ({
      ...job,
      customer_name: customerMap[job.customer_id] || '',
      assigned_count: staffIdsByJob[job.job_id] ? staffIdsByJob[job.job_id].size : 0
    }));

    // 検索ワードで絞り込み（顧客名・現場名の両方を検索）
    if (query.search_term) {
      const term = query.search_term.toLowerCase();
      result = result.filter(job =>
        (job.customer_name && job.customer_name.toLowerCase().includes(term)) ||
        (job.site_name && job.site_name.toLowerCase().includes(term))
      );
    }

    // 顧客名で絞り込み（部分一致）- 後方互換性
    if (query.customer_name) {
      const term = query.customer_name.toLowerCase();
      result = result.filter(job =>
        job.customer_name && job.customer_name.toLowerCase().includes(term)
      );
    }

    return result;
  },

  /**
   * 顧客IDから会社名へのマップを作成
   * @returns {Object} { customer_id: company_name }
   */
  _getCustomerMap: function() {
    try {
      const customers = getAllRecords('M_Customers');
      const map = {};
      for (const c of customers) {
        if (c.customer_id && !c.is_deleted) {
          map[c.customer_id] = c.company_name + (c.branch_name ? ' ' + c.branch_name : '');
        }
      }
      return map;
    } catch (e) {
      Logger.log('_getCustomerMap error: ' + e.message);
      return {};
    }
  },

  /**
   * 案件を保存（新規/更新）
   * @param {Object} job - 案件データ
   * @param {string|null} expectedUpdatedAt - 期待するupdated_at（更新時）
   * @returns {Object} { success, job?, error? }
   */
  save: function(job, expectedUpdatedAt) {
    // バリデーション（validation.js の validateJob_ を使用）
    try {
      validateJob_(job, !job.job_id);
    } catch (e) {
      if (e instanceof ValidationError) {
        return {
          success: false,
          error: 'VALIDATION_ERROR',
          details: { message: e.message }
        };
      }
      throw e;
    }

    // 新規作成
    if (!job.job_id) {
      const newJob = JobRepository.insert(job);

      // 監査ログ
      logCreate('T_Jobs', newJob.job_id, newJob);

      return {
        success: true,
        job: newJob
      };
    }

    // 更新
    const result = JobRepository.update(job, expectedUpdatedAt);

    if (!result.success) {
      return result;
    }

    // 監査ログ（差分のみ記録）
    const diff = getDiff(result.before, result.job);
    logUpdate('T_Jobs', job.job_id, diff.before, diff.after);

    return {
      success: true,
      job: result.job
    };
  },

  /**
   * ステータスを更新
   * @param {string} jobId - 案件ID
   * @param {string} status - 新しいステータス
   * @param {string} expectedUpdatedAt - 期待するupdated_at
   * @returns {Object} { success, job?, error? }
   */
  updateStatus: function(jobId, status, expectedUpdatedAt) {
    // validation.js の JOB_STATUSES を使用
    const validStatuses = Object.values(JOB_STATUSES);
    if (!validStatuses.includes(status)) {
      return {
        success: false,
        error: 'VALIDATION_ERROR',
        details: { status: `Invalid status: ${status}` }
      };
    }

    return this.save({ job_id: jobId, status: status }, expectedUpdatedAt);
  },

  /**
   * 統計情報を計算
   * @param {Object[]} jobs - 案件配列
   * @returns {Object} 統計情報
   */
  _calculateStats: function(jobs) {
    const byTimeSlot = {
      jotou: { total: 0, required: 0, assigned: 0, shortage: 0 },
      shuujitsu: { total: 0, required: 0, assigned: 0, shortage: 0 },
      am: { total: 0, required: 0, assigned: 0, shortage: 0 },
      pm: { total: 0, required: 0, assigned: 0, shortage: 0 },
      yakin: { total: 0, required: 0, assigned: 0, shortage: 0 },
      mitei: { total: 0, required: 0, assigned: 0, shortage: 0 }
    };

    let total = 0;
    let assigned = 0;
    let pending = 0;

    for (const job of jobs) {
      total++;

      if (job.status === 'assigned' || job.status === 'completed') {
        assigned++;
      } else if (job.status === 'pending') {
        pending++;
      }

      const slot = job.time_slot;
      if (byTimeSlot[slot]) {
        byTimeSlot[slot].total++;
        byTimeSlot[slot].required += Number(job.required_count) || 0;
        byTimeSlot[slot].assigned += Number(job.assigned_count) || 0;
      }
    }

    // 過不足計算（shortage = required - assigned）
    for (const slot of Object.keys(byTimeSlot)) {
      byTimeSlot[slot].shortage = byTimeSlot[slot].required - byTimeSlot[slot].assigned;
    }

    return {
      total: total,
      assigned: assigned,
      pending: pending,
      byTimeSlot: byTimeSlot
    };
  }
};
