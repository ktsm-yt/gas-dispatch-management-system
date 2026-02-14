/**
 * Job Service
 *
 * 案件管理の業務ロジック
 */

const JobService = {
  /**
   * 案件を取得（配置情報・枠情報付き）
   * @param {string} jobId - 案件ID
   * @returns {Object|null} { job, assignments[], slots[], slotStatus } または null
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

    // 配置情報取得
    const assignmentsData = AssignmentService.getAssignmentsByJobId(jobId);
    const assignments = assignmentsData.assignments || [];

    // 枠情報取得
    const slotsData = SlotService.getSlotsByJobId(jobId);
    const slots = slotsData.slots || [];

    // 枠充足状況を取得（枠がある場合のみ）
    let slotStatus = null;
    if (slots.length > 0) {
      slotStatus = SlotService.getSlotStatus(jobId);
    }

    return {
      job: jobWithCustomer,
      assignments: assignments,
      slots: slots,
      slotStatus: slotStatus
    };
  },

  /**
   * 案件編集モーダル向けの軽量データを取得（配置情報なし）
   * @param {string} jobId - 案件ID
   * @returns {Object|null} { job, slots[] } または null
   */
  getForEdit: function(jobId) {
    const job = JobRepository.findById(jobId);

    if (!job) {
      return null;
    }

    const customerMap = this._getCustomerMap();
    const jobWithCustomer = {
      ...job,
      customer_name: customerMap[job.customer_id] || ''
    };

    const slotsData = SlotService.getSlotsByJobId(jobId);
    const slots = slotsData.slots || [];

    return {
      job: jobWithCustomer,
      slots: slots
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

    // 案件IDを抽出（後続処理で再利用）
    const jobIds = jobs.map(j => j.job_id);

    // 顧客マスターを取得してマップ作成
    const customerMap = this._getCustomerMap();

    // 配置データを取得（jobIdsを渡して二重呼び出し防止）
    const allAssignments = AssignmentRepository.findByDate(date, jobIds);

    // スタッフマスターを取得（MasterCacheでキャッシュ）
    const staffMapFull = MasterCache.getStaffMap();

    // 案件ごとの配置をグループ化
    const assignmentsByJob = {};
    let maxUpdatedAt = null;
    for (const a of allAssignments) {
      if (!assignmentsByJob[a.job_id]) {
        assignmentsByJob[a.job_id] = [];
      }
      assignmentsByJob[a.job_id].push(a);
      if (a.updated_at && (!maxUpdatedAt || a.updated_at > maxUpdatedAt)) {
        maxUpdatedAt = a.updated_at;
      }
    }

    // スロットデータを一括取得（jobIdsは上で既に取得済み）
    const slotsByJob = SlotRepository.findByJobIds(jobIds);

    // 顧客名と配置情報をJOIN
    const jobsWithCustomer = jobs.map(job => {
      const jobAssignments = assignmentsByJob[job.job_id] || [];

      // ダッシュボード用の軽量配置データ
      // モーダルの詳細編集は getJob で最新の完全データを取得する。
      const dashboardAssignments = jobAssignments.map(a => {
        const staff = staffMapFull[a.staff_id];
        return {
          assignment_id: a.assignment_id,
          job_id: a.job_id,
          staff_id: a.staff_id,
          staff_name: staff ? staff.name : '（削除済み）',
          staff_phone: staff ? staff.phone : '',
          slot_id: a.slot_id || null,
          pay_unit: a.pay_unit || '',
          invoice_unit: a.invoice_unit || '',
          transport_station: a.transport_station || '',
          assignment_role: a.assignment_role || null,
          is_leader: a.is_leader || false,
          status: a.status,
          updated_at: a.updated_at
        };
      });

      // アクティブな配置でカウント
      const activeAssignments = dashboardAssignments.filter(a => a.status !== 'CANCELLED');
      const uniqueStaffIds = new Set(activeAssignments.map(a => a.staff_id));
      const staffNames = activeAssignments.map(a => a.staff_name);

      // スロットデータを含める
      const jobSlots = slotsByJob[job.job_id] || [];
      if (job.updated_at && (!maxUpdatedAt || job.updated_at > maxUpdatedAt)) {
        maxUpdatedAt = job.updated_at;
      }

      return {
        job_id: job.job_id,
        customer_id: job.customer_id,
        customer_name: customerMap[job.customer_id] || '',
        site_name: job.site_name,
        site_address: job.site_address || '',
        work_date: date,
        time_slot: job.time_slot,
        start_time: job.start_time,
        work_category: job.work_category,
        work_detail: job.work_detail || '',
        work_detail_other_text: job.work_detail_other_text || '',
        required_count: job.required_count,
        pay_unit: job.pay_unit || '',
        assigned_count: uniqueStaffIds.size,
        status: job.status,
        supervisor_name: job.supervisor_name || '',
        supervisor_phone: job.supervisor_phone || '',
        order_number: job.order_number || '',
        branch_office: job.branch_office || '',
        property_code: job.property_code || '',
        construction_div: job.construction_div || '',
        notes: job.notes || '',
        staff_names: staffNames,
        assignments: dashboardAssignments,
        updated_at: job.updated_at,
        slots: jobSlots
      };
    });

    // 統計情報（配置情報付きのjobsWithCustomerを使用）
    const stats = this._calculateStats(jobsWithCustomer);

    return {
      date: date,
      jobs: jobsWithCustomer,
      stats: stats,
      maxUpdatedAt: maxUpdatedAt,
      hasFullAssignments: true  // 配置データはモーダル初期表示・競合チェックに十分なフィールドを含む
    };
  },

  /**
   * ダッシュボード更新メタ情報を取得（Job + Assignment の両方を検知）
   * @param {string} date - 日付（YYYY-MM-DD形式）
   * @returns {Object} { maxUpdatedAt }
   */
  getDashboardMeta: function(date) {
    if (!isValidDate(date)) {
      throw new Error('Invalid date format. Expected YYYY-MM-DD');
    }

    // Jobの最大updated_at
    let maxUpdatedAt = JobRepository.getMaxUpdatedAt(date);

    // Assignmentの最大updated_atも考慮（配置のみ変更されたケースを検知）
    const jobs = JobRepository.findByDate(date);
    const jobIds = jobs.map(j => j.job_id);
    if (jobIds.length > 0) {
      const assignments = AssignmentRepository.findByDate(date, jobIds);
      for (const a of assignments) {
        if (a.updated_at && (!maxUpdatedAt || a.updated_at > maxUpdatedAt)) {
          maxUpdatedAt = a.updated_at;
        }
      }
    }

    return {
      date: date,
      maxUpdatedAt: maxUpdatedAt || null
    };
  },

  /**
   * 案件を検索
   * @param {Object} query - 検索条件
   * @returns {Object[]} 案件配列（顧客名・配置数・スロット付き）
   */
  search: function(query) {
    const jobs = JobRepository.search(query);

    // 対象ジョブIDを先に抽出（後続の処理で再利用）
    const jobIds = jobs.map(j => j.job_id);
    const jobIdSet = new Set(jobIds);

    // 顧客マスターを取得してマップ作成
    const customerMap = this._getCustomerMap();

    // 全配置を取得して、対象ジョブIDのみフィルタリング（早期スキップで最適化）
    const allAssignments = getAllRecords('T_JobAssignments');
    const staffIdsByJob = {};
    for (const a of allAssignments) {
      // 対象外のジョブIDは早期スキップ
      if (!jobIdSet.has(a.job_id)) continue;
      if (a.is_deleted || a.status === 'CANCELLED') continue;

      if (!staffIdsByJob[a.job_id]) {
        staffIdsByJob[a.job_id] = new Set();
      }
      staffIdsByJob[a.job_id].add(a.staff_id);
    }

    // スロットデータを一括取得
    const slotsByJob = SlotRepository.findByJobIds(jobIds);

    // 顧客名と配置数をJOIN（一意なスタッフ数）
    let result = jobs.map(job => ({
      ...job,
      customer_name: customerMap[job.customer_id] || '',
      assigned_count: staffIdsByJob[job.job_id] ? staffIdsByJob[job.job_id].size : 0,
      slots: slotsByJob[job.job_id] || []
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
      const customers = MasterCache.getCustomerMap();
      const map = {};
      for (const customerId in customers) {
        const c = customers[customerId];
        if (c.customer_id && !c.is_deleted) {
          map[c.customer_id] = (c.company_name || '') + (c.branch_name ? ' ' + c.branch_name : '');
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
   * @param {Object[]} slots - 枠データ（オプション）
   * @returns {Object} { success, job?, slots?, error? }
   */
  save: function(job, expectedUpdatedAt, slots) {
    // 枠データがある場合、required_countとpay_unitのデフォルト値を設定
    // （詳細モードでは案件レベルのこれらのフィールドは枠で管理されるため）
    if (slots && Array.isArray(slots) && slots.length > 0) {
      // required_count: 枠の合計人数
      const totalCount = slots.reduce((sum, slot) => sum + (Number(slot.slot_count) || 1), 0);
      if (!job.required_count) {
        job.required_count = totalCount;
      }
      // pay_unit: 最初の枠の単価区分（バリデーション用のデフォルト）
      if (!job.pay_unit && slots[0].slot_pay_unit) {
        job.pay_unit = slots[0].slot_pay_unit;
      } else if (!job.pay_unit) {
        job.pay_unit = 'basic'; // フォールバック
      }
    }

    // 新規作成時のデフォルト値設定
    if (!job.job_id && !job.status) {
      job.status = 'pending';
    }

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

      // 枠が指定されていれば保存
      let savedSlots = [];
      if (slots && Array.isArray(slots) && slots.length > 0) {
        const slotResult = SlotService.saveSlots(newJob.job_id, slots, null);
        if (slotResult.ok) {
          savedSlots = slotResult.data.slots || [];
          // 枠合計で required_count を更新（DBにも反映済み）
        } else {
          // スロット保存失敗 - エラーを返す
          // 注: 案件は既に作成されているが、スロットがないため不整合状態
          // より厳密には、案件も削除してロールバックすべきだが、
          // GASの制約上トランザクション制御が困難なため、エラーで通知
          return {
            success: false,
            error: 'SLOT_SAVE_ERROR',
            details: {
              message: slotResult.error?.message || 'スロットの保存に失敗しました',
              jobId: newJob.job_id,
              jobCreated: true // 案件は作成済み
            }
          };
        }
      }

      // 最新のjobを取得（スロット保存でrequired_countが更新されている可能性）
      const createdJob = JobRepository.findById(newJob.job_id);

      return {
        success: true,
        job: createdJob,
        slots: savedSlots
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

    // 枠が指定されていれば保存
    let savedSlots = [];
    if (slots && Array.isArray(slots)) {
      // 空配列は「枠をすべて削除」を意味する
      const slotResult = SlotService.saveSlots(job.job_id, slots, result.job.updated_at);
      if (slotResult.ok) {
        savedSlots = slotResult.data.slots || [];
        // required_countはSlotService.saveSlotsで既に更新済み
      } else {
        // スロット保存失敗 - エラーを返す
        // 注: 案件は既に更新されているが、スロットは古いまま不整合状態
        return {
          success: false,
          error: 'SLOT_SAVE_ERROR',
          details: {
            message: slotResult.error?.message || 'スロットの保存に失敗しました',
            jobId: job.job_id,
            jobUpdated: true // 案件は更新済み
          }
        };
      }
    }

    // 最新の job を取得
    const updatedJob = JobRepository.findById(job.job_id);

    return {
      success: true,
      job: updatedJob,
      slots: savedSlots
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

    // アーカイブフラグ補完
    const jobData = { job_id: jobId, status: status };
    const current = JobRepository.findById(jobId);
    if (current && current._archived) {
      jobData._archived = current._archived;
      jobData._archiveFiscalYear = current._archiveFiscalYear;
    }
    return this.save(jobData, expectedUpdatedAt);
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
    let requiredTotal = 0;
    let assignedTotal = 0;

    for (const job of jobs) {
      total++;

      if (job.status === 'assigned') {
        assigned++;
      } else if (job.status === 'pending') {
        pending++;
      }

      // 全体の人数を集計
      requiredTotal += Number(job.required_count) || 0;
      assignedTotal += Number(job.assigned_count) || 0;

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
      requiredTotal: requiredTotal,
      assignedTotal: assignedTotal,
      byTimeSlot: byTimeSlot
    };
  }
};
