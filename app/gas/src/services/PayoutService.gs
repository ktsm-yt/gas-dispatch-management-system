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

    if (jobIds.length === 0) {
      return [];
    }

    // 3. スタッフの配置を取得
    const allAssignments = AssignmentRepository.findByStaffId(staffId);

    // 4. 該当Job内かつASSIGNEDの配置をフィルタリング
    const unpaidAssignments = allAssignments.filter(a =>
      !a.is_deleted &&
      a.status === 'ASSIGNED' &&
      jobIds.includes(a.job_id)
    );

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
   * 支払いを生成
   * @param {string} staffId - スタッフID
   * @param {string} endDate - 集計終了日
   * @param {Object} options - オプション
   * @param {number} options.adjustment_amount - 調整額
   * @param {string} options.notes - 備考
   * @returns {Object} { success, payout, error }
   */
  generatePayout: function(staffId, endDate, options = {}) {
    // 1. 未払い計算
    const calc = this.calculatePayout(staffId, endDate);

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

    // 3. 支払いレコード作成
    const payout = PayoutRepository.insert({
      payout_type: 'STAFF',
      staff_id: staffId,
      period_start: calc.periodStart,
      period_end: calc.periodEnd,
      assignment_count: calc.assignmentCount,
      base_amount: calc.baseAmount,
      transport_amount: calc.transportAmount,
      adjustment_amount: adjustmentAmount,
      tax_amount: 0,  // スタッフへの支払いは税計算なし（源泉徴収は別途）
      total_amount: totalAmount,
      status: 'draft',
      notes: options.notes || ''
    });

    return {
      success: true,
      payout: payout
    };
  },

  /**
   * 複数スタッフの支払いを一括生成
   * @param {string[]} staffIds - スタッフID配列
   * @param {string} endDate - 集計終了日
   * @returns {Object} { success: number, failed: number, results: [] }
   */
  bulkGenerate: function(staffIds, endDate) {
    const results = [];
    let success = 0;
    let failed = 0;

    for (const staffId of staffIds) {
      const result = this.generatePayout(staffId, endDate);
      results.push({
        staffId: staffId,
        ...result
      });

      if (result.success) {
        success++;
      } else {
        failed++;
      }
    }

    return {
      success: success,
      failed: failed,
      results: results
    };
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
   * ステータスを更新
   * @param {string} payoutId - 支払ID
   * @param {string} status - 新ステータス
   * @param {string} expectedUpdatedAt - 楽観ロック用
   * @returns {Object} 更新結果
   */
  updateStatus: function(payoutId, status, expectedUpdatedAt) {
    // ステータス遷移チェック
    const current = PayoutRepository.findById(payoutId);
    if (!current) {
      return { success: false, error: 'NOT_FOUND' };
    }

    const validTransitions = {
      'draft': ['confirmed', 'draft'],
      'confirmed': ['paid', 'draft'],
      'paid': []  // paidからは変更不可
    };

    if (!validTransitions[current.status]?.includes(status)) {
      return {
        success: false,
        error: 'INVALID_STATUS_TRANSITION',
        message: `${current.status} から ${status} への変更はできません`
      };
    }

    return PayoutRepository.updateStatus(payoutId, status, expectedUpdatedAt);
  },

  /**
   * 支払いを削除
   * @param {string} payoutId - 支払ID
   * @param {string} expectedUpdatedAt - 楽観ロック用
   * @returns {Object} 削除結果
   */
  delete: function(payoutId, expectedUpdatedAt) {
    const current = PayoutRepository.findById(payoutId);
    if (!current) {
      return { success: false, error: 'NOT_FOUND' };
    }

    // paidは削除不可
    if (current.status === 'paid') {
      return {
        success: false,
        error: 'CANNOT_DELETE_PAID',
        message: '支払い済みのレコードは削除できません'
      };
    }

    return PayoutRepository.softDelete(payoutId, expectedUpdatedAt);
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
   * 未払いがあるスタッフ一覧を取得
   * @param {string} endDate - 集計終了日
   * @returns {Object[]} { staffId, staffName, unpaidCount, estimatedAmount }
   */
  getUnpaidStaffList: function(endDate) {
    // アクティブなスタッフを取得
    const staffList = StaffRepository.search({ is_active: true });
    const results = [];

    for (const staff of staffList) {
      const calc = this.calculatePayout(staff.staff_id, endDate);

      if (calc.assignmentCount > 0) {
        results.push({
          staffId: staff.staff_id,
          staffName: staff.name,
          unpaidCount: calc.assignmentCount,
          estimatedAmount: calc.totalAmount,
          periodStart: calc.periodStart,
          periodEnd: calc.periodEnd
        });
      }
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
