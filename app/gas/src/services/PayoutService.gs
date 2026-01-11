/**
 * Payout Service
 *
 * 支払い管理のビジネスロジック
 * 差分支払い方式: 前回支払い以降の未払い配置を集計
 */

const PayoutService = {

  /**
   * スタッフの未払い配置を取得
   * @param {string} staffId - スタッフID
   * @param {string} endDate - 集計終了日（YYYY-MM-DD）
   * @returns {Object[]} 未払い配置リスト（Job情報含む）
   */
  getUnpaidAssignments: function(staffId, endDate) {
    // 1. 最後の支払いを取得
    const lastPayout = PayoutRepository.findLastPayout(staffId);
    const startDate = lastPayout ? this._addDays(lastPayout.period_end, 1) : null;
    Logger.log(`[getUnpaidAssignments] staffId=${staffId}, endDate=${endDate}, lastPayout period_end=${lastPayout?.period_end}, startDate=${startDate}`);

    // 2. 該当期間のJobを取得
    const jobQuery = {
      work_date_to: endDate,
      sort_order: 'asc'
    };
    if (startDate) {
      jobQuery.work_date_from = startDate;
    }
    const jobs = JobRepository.search(jobQuery);
    const jobMap = new Map(jobs.map(j => [j.job_id, j]));
    const jobIds = jobs.map(j => j.job_id);
    Logger.log(`[getUnpaidAssignments] jobs found: ${jobs.length}, jobQuery=${JSON.stringify(jobQuery)}`);

    if (jobIds.length === 0) {
      return [];
    }

    // 3. スタッフの配置を取得
    const allAssignments = AssignmentRepository.findByStaffId(staffId);
    Logger.log(`[getUnpaidAssignments] allAssignments for staff: ${allAssignments.length}`);

    // 4. 該当Job内かつASSIGNEDの配置をフィルタリング
    const unpaidAssignments = allAssignments.filter(a =>
      !a.is_deleted &&
      a.status === 'ASSIGNED' &&
      jobIds.includes(a.job_id)
    );
    Logger.log(`[getUnpaidAssignments] unpaidAssignments after filter: ${unpaidAssignments.length}`);

    // 5. Job情報を付与して返す
    return unpaidAssignments.map(a => {
      const job = jobMap.get(a.job_id);
      return {
        ...a,
        work_date: job ? job.work_date : '',
        site_name: job ? job.site_name : '',
        customer_id: job ? job.customer_id : ''
      };
    }).sort((a, b) => {
      // work_date昇順でソート
      return (a.work_date || '').localeCompare(b.work_date || '');
    });
  },

  /**
   * 未払い金額を計算（プレビュー用）
   * @param {string} staffId - スタッフID
   * @param {string} endDate - 集計終了日
   * @returns {Object} { assignments, baseAmount, transportAmount, totalAmount, periodStart, periodEnd }
   */
  calculatePayout: function(staffId, endDate) {
    const assignments = this.getUnpaidAssignments(staffId, endDate);

    if (assignments.length === 0) {
      return {
        assignments: [],
        assignmentCount: 0,
        baseAmount: 0,
        transportAmount: 0,
        totalAmount: 0,
        periodStart: null,
        periodEnd: endDate
      };
    }

    // スタッフ情報を取得
    const staff = StaffRepository.findById(staffId);

    // 金額計算
    const result = calculateMonthlyPayout_(assignments, staff);

    // 期間を算出
    const dates = assignments.map(a => a.work_date).filter(d => d);
    const periodStart = dates.length > 0 ? dates[0] : endDate;
    const periodEnd = endDate;

    return {
      assignments: assignments,
      assignmentCount: assignments.length,
      baseAmount: result.baseAmount,
      transportAmount: result.transportAmount,
      totalAmount: result.totalAmount,
      periodStart: periodStart,
      periodEnd: periodEnd
    };
  },

  /**
   * 支払いを支払済として記録
   * @param {string} staffId - スタッフID
   * @param {string} endDate - 集計終了日
   * @param {Object} options - オプション
   * @param {number} options.adjustment_amount - 調整額
   * @param {string} options.notes - 備考
   * @param {string} options.paid_date - 支払日（省略時は本日）
   * @returns {Object} { success, payout, error }
   */
  markAsPaid: function(staffId, endDate, options = {}) {
    Logger.log(`[markAsPaid] staffId=${staffId}, endDate=${endDate}, options=${JSON.stringify(options)}`);

    // 1. 未払い計算
    const calc = this.calculatePayout(staffId, endDate);
    Logger.log(`[markAsPaid] calc result: assignmentCount=${calc.assignmentCount}, totalAmount=${calc.totalAmount}`);

    if (calc.assignmentCount === 0) {
      return {
        success: false,
        error: 'NO_UNPAID_ASSIGNMENTS',
        message: '未払いの配置がありません'
      };
    }

    // 2. 調整額を適用
    const adjustmentAmount = options.adjustment_amount || 0;
    const totalAmount = calc.totalAmount + adjustmentAmount;

    // 3. 支払日を決定
    const paidDate = options.paid_date || Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');

    // 4. 支払いレコード作成（直接 paid ステータスで保存）
    const payout = PayoutRepository.insert({
      payout_type: 'STAFF',
      staff_id: staffId,
      period_start: calc.periodStart,
      period_end: calc.periodEnd,
      assignment_count: calc.assignmentCount,
      base_amount: calc.baseAmount,
      transport_amount: calc.transportAmount,
      adjustment_amount: adjustmentAmount,
      tax_amount: 0,
      total_amount: totalAmount,
      status: 'paid',
      paid_date: paidDate,
      notes: options.notes || ''
    });

    // スタッフ名を付与して返す
    return {
      success: true,
      payout: this._enrichPayout(payout)
    };
  },

  /**
   * 支払いを生成（後方互換性のため残す - markAsPaidを使用推奨）
   * @deprecated markAsPaid() を使用してください
   */
  generatePayout: function(staffId, endDate, options = {}) {
    return this.markAsPaid(staffId, endDate, options);
  },

  /**
   * 複数スタッフの支払いを一括で支払済にする
   * @param {string[]} staffIds - スタッフID配列
   * @param {string} endDate - 集計終了日
   * @param {Object} options - オプション
   * @param {string} options.paid_date - 支払日（省略時は本日）
   * @param {Object} options.adjustments - スタッフIDをキーとした調整額・備考 { [staffId]: { adjustment_amount, notes } }
   * @returns {Object} { success: number, failed: number, results: [] }
   */
  bulkMarkAsPaid: function(staffIds, endDate, options = {}) {
    const results = [];
    const payouts = [];  // 成功した payout を収集
    let success = 0;
    let failed = 0;

    const paidDate = options.paid_date || Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
    const adjustments = options.adjustments || {};

    for (const staffId of staffIds) {
      const staffOptions = {
        paid_date: paidDate,
        adjustment_amount: adjustments[staffId]?.adjustment_amount || 0,
        notes: adjustments[staffId]?.notes || ''
      };

      const result = this.markAsPaid(staffId, endDate, staffOptions);
      results.push({
        staffId: staffId,
        ...result
      });

      if (result.success) {
        success++;
        payouts.push(result.payout);  // 成功した payout を追加
      } else {
        failed++;
      }
    }

    return {
      success: success,
      failed: failed,
      results: results,
      payouts: payouts  // 差分リロード用に追加
    };
  },

  /**
   * 複数スタッフの支払いを一括生成（後方互換性のため残す）
   * @deprecated bulkMarkAsPaid() を使用してください
   */
  bulkGenerate: function(staffIds, endDate) {
    return this.bulkMarkAsPaid(staffIds, endDate);
  },

  /**
   * 支払いを取得（スタッフ名付き）
   * @param {string} payoutId - 支払ID
   * @returns {Object|null} 支払い詳細
   */
  get: function(payoutId) {
    const payout = PayoutRepository.findById(payoutId);
    if (!payout) return null;

    return this._enrichPayout(payout);
  },

  /**
   * 支払いを検索（スタッフ名付き）
   * @param {Object} query - 検索条件
   * @returns {Object[]} 支払い配列
   */
  search: function(query = {}) {
    const payouts = PayoutRepository.search(query);
    return payouts.map(p => this._enrichPayout(p));
  },

  /**
   * 支払いを更新
   * @param {Object} payout - 更新データ
   * @param {string} expectedUpdatedAt - 楽観ロック用
   * @returns {Object} 更新結果
   */
  update: function(payout, expectedUpdatedAt) {
    return PayoutRepository.update(payout, expectedUpdatedAt);
  },

  /**
   * ステータスを更新（簡素化版 - paid のみサポート）
   * @param {string} payoutId - 支払ID
   * @param {string} status - 新ステータス（'paid' のみ）
   * @param {string} expectedUpdatedAt - 楽観ロック用
   * @returns {Object} 更新結果
   */
  updateStatus: function(payoutId, status, expectedUpdatedAt) {
    const current = PayoutRepository.findById(payoutId);
    if (!current) {
      return { success: false, error: 'NOT_FOUND' };
    }

    // 簡素化: paid への変更のみ許可
    if (status !== 'paid') {
      return {
        success: false,
        error: 'INVALID_STATUS',
        message: 'ステータスは paid のみ設定可能です。取り消しは undoPayout() を使用してください。'
      };
    }

    return PayoutRepository.updateStatus(payoutId, status, expectedUpdatedAt);
  },

  /**
   * 支払いを取り消し（未払い状態に戻す）
   * @param {string} payoutId - 支払ID
   * @param {string} expectedUpdatedAt - 楽観ロック用
   * @returns {Object} 取り消し結果
   */
  undoPayout: function(payoutId, expectedUpdatedAt) {
    const current = PayoutRepository.findById(payoutId);
    if (!current) {
      return { success: false, error: 'NOT_FOUND' };
    }

    // 論理削除で取り消し（どのステータスからでも取り消し可能）
    return PayoutRepository.softDelete(payoutId, expectedUpdatedAt);
  },

  /**
   * 支払いを削除（undoPayoutのエイリアス）
   * @param {string} payoutId - 支払ID
   * @param {string} expectedUpdatedAt - 楽観ロック用
   * @returns {Object} 削除結果
   */
  delete: function(payoutId, expectedUpdatedAt) {
    return this.undoPayout(payoutId, expectedUpdatedAt);
  },

  /**
   * スタッフの支払い履歴を取得
   * @param {string} staffId - スタッフID
   * @param {Object} options - オプション
   * @returns {Object[]} 支払い履歴
   */
  getHistory: function(staffId, options = {}) {
    const payouts = PayoutRepository.findByStaffId(staffId, options);
    return payouts.map(p => this._enrichPayout(p));
  },

  /**
   * 未払いがあるスタッフ一覧を取得（バルク処理版）
   * @param {string} endDate - 集計終了日
   * @returns {Object[]} { staffId, staffName, unpaidCount, estimatedAmount }
   */
  getUnpaidStaffList: function(endDate) {
    // 1. 全データを一括取得
    const staffList = StaffRepository.search({ is_active: true });
    if (staffList.length === 0) return [];

    const staffMap = new Map(staffList.map(s => [s.staff_id, s]));

    // 2. 対象期間のJobを一括取得
    const jobs = JobRepository.search({ work_date_to: endDate, sort_order: 'asc' });
    if (jobs.length === 0) return [];

    const jobMap = new Map(jobs.map(j => [j.job_id, j]));
    const jobIds = new Set(jobs.map(j => j.job_id));

    // 3. 全Assignmentsを一括取得（ASSIGNEDのみ）
    const allAssignments = AssignmentRepository.search({ status: 'ASSIGNED' });

    // 4. 支払済みPayoutsのみを取得（status: 'paid'のみ考慮）
    const allPayouts = PayoutRepository.search({ payout_type: 'STAFF', status: 'paid' });

    // 最新Payoutをスタッフごとにマップ
    const lastPayoutMap = new Map();
    for (const p of allPayouts) {
      if (!p.staff_id) continue;
      const existing = lastPayoutMap.get(p.staff_id);
      if (!existing || (p.period_end && p.period_end > existing.period_end)) {
        lastPayoutMap.set(p.staff_id, p);
      }
    }

    // 5. スタッフごとに未払い配置を集計
    const results = [];

    for (const staff of staffList) {
      const staffId = staff.staff_id;
      const lastPayout = lastPayoutMap.get(staffId);
      const startDate = lastPayout ? this._addDays(lastPayout.period_end, 1) : null;

      // このスタッフの対象Assignmentsをフィルタ
      const staffAssignments = allAssignments.filter(a => {
        if (a.staff_id !== staffId) return false;
        if (!jobIds.has(a.job_id)) return false;

        const job = jobMap.get(a.job_id);
        if (!job) return false;

        // 開始日チェック
        if (startDate && job.work_date < startDate) return false;

        return true;
      });

      if (staffAssignments.length === 0) continue;

      // Job情報を付与
      const assignmentsWithJob = staffAssignments.map(a => {
        const job = jobMap.get(a.job_id);
        return { ...a, work_date: job?.work_date || '' };
      }).sort((a, b) => (a.work_date || '').localeCompare(b.work_date || ''));

      // 金額計算
      const calcResult = calculateMonthlyPayout_(assignmentsWithJob, staff);

      const dates = assignmentsWithJob.map(a => a.work_date).filter(d => d);
      const periodStart = dates.length > 0 ? dates[0] : endDate;

      results.push({
        staffId: staffId,
        staffName: staff.name,
        unpaidCount: staffAssignments.length,
        estimatedAmount: calcResult.totalAmount,
        periodStart: periodStart,
        periodEnd: endDate
      });
    }

    // 金額降順でソート
    return results.sort((a, b) => b.estimatedAmount - a.estimatedAmount);
  },

  // ========== Private Methods ==========

  /**
   * 支払いにスタッフ/外注先名を付与
   * @param {Object} payout - 支払いデータ
   * @returns {Object} 名前付き支払いデータ
   */
  _enrichPayout: function(payout) {
    let targetName = '';

    if (payout.payout_type === 'STAFF' && payout.staff_id) {
      const staff = StaffRepository.findById(payout.staff_id);
      targetName = staff ? staff.name : '(不明)';
    } else if (payout.payout_type === 'SUBCONTRACTOR' && payout.subcontractor_id) {
      const sub = SubcontractorRepository.findById(payout.subcontractor_id);
      targetName = sub ? sub.company_name : '(不明)';
    }

    return {
      ...payout,
      target_name: targetName
    };
  },

  /**
   * 日付に日数を加算
   * @param {string} dateStr - 日付（YYYY-MM-DD）
   * @param {number} days - 加算日数
   * @returns {string} 加算後の日付
   */
  _addDays: function(dateStr, days) {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    date.setDate(date.getDate() + days);
    return Utilities.formatDate(date, 'Asia/Tokyo', 'yyyy-MM-dd');
  }
};
