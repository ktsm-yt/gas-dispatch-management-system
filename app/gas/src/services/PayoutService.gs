/**
 * Payout Service
 *
 * 支払い管理のビジネスロジック
 * 差分支払い方式: 前回支払い以降の未払い配置を集計
 *
 * ワークフロー（P2-3改善版）:
 * 1. confirmPayout() - confirmed状態で作成（Assignmentにpayout_id紐付け）
 * 2. payConfirmedPayout() - confirmed → paid に変更
 * 3. undoPayout() - 取り消し（Assignmentのpayout_idクリア）
 */

const PayoutService = {

  /**
   * スタッフの未払い配置を取得
   * @param {string} staffId - スタッフID
   * @param {string} endDate - 集計終了日（YYYY-MM-DD）
   * @returns {Object[]} 未払い配置リスト（Job情報含む）
   */
  getUnpaidAssignments: function(staffId, endDate) {
    // 1. 最後の支払いを取得（confirmed/paid両方を考慮）
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

    // 4. 該当Job内かつASSIGNEDかつpayout_id未設定の配置をフィルタリング（二重計上防止）
    const unpaidAssignments = allAssignments.filter(a =>
      !a.is_deleted &&
      a.status === 'ASSIGNED' &&
      !a.payout_id &&  // 二重計上防止: payout_idが設定されていない配置のみ
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
  calculatePayout: function(staffId, endDate, options = {}) {
    const assignments = this.getUnpaidAssignments(staffId, endDate);
    const includeAssignments = options.include_assignments !== false;

    if (assignments.length === 0) {
      return {
        assignments: includeAssignments ? [] : null,
        assignmentCount: 0,
        baseAmount: 0,
        transportAmount: 0,
        taxAmount: 0,
        totalAmount: 0,
        periodStart: null,
        periodEnd: endDate
      };
    }

    // スタッフ情報を取得
    const staff = StaffRepository.findById(staffId);

    // 金額計算
    const result = calculateMonthlyPayout_(assignments, staff);

    // 源泉徴収税を計算（STAFFで withholding_tax_applicable の場合のみ）
    const taxAmount = this._calculateWithholdingTax(staff, result.baseAmount);

    // 期間を算出
    const dates = assignments.map(a => a.work_date).filter(d => d);
    const periodStart = dates.length > 0 ? dates[0] : endDate;
    const periodEnd = endDate;

    return {
      assignments: includeAssignments ? assignments : null,
      assignmentCount: assignments.length,
      baseAmount: result.baseAmount,
      transportAmount: result.transportAmount,
      taxAmount: taxAmount,
      totalAmount: result.totalAmount - taxAmount,  // 税引き後
      periodStart: periodStart,
      periodEnd: periodEnd
    };
  },

  /**
   * 支払いを確認済みとして記録（confirmed状態で作成）
   * @param {string} staffId - スタッフID
   * @param {string} endDate - 集計終了日
   * @param {Object} options - オプション
   * @param {number} options.adjustment_amount - 調整額
   * @param {string} options.notes - 備考
   * @returns {Object} { success, payout, error }
   */
  confirmPayout: function(staffId, endDate, options = {}) {
    Logger.log(`[confirmPayout] staffId=${staffId}, endDate=${endDate}, options=${JSON.stringify(options)}`);

    // 1. 未払い計算
    const calc = this.calculatePayout(staffId, endDate);
    Logger.log(`[confirmPayout] calc result: assignmentCount=${calc.assignmentCount}, totalAmount=${calc.totalAmount}`);

    if (calc.assignmentCount === 0) {
      return {
        success: false,
        error: 'NO_UNPAID_ASSIGNMENTS',
        message: '未払いの配置がありません'
      };
    }

    // 1.5. 重複チェック（冪等性のためエラーではなくスキップ）
    const existingPayouts = PayoutRepository.findByStaffAndPeriod(
      staffId, calc.periodStart, calc.periodEnd
    );
    if (existingPayouts.length > 0) {
      Logger.log(`[confirmPayout] SKIP duplicate: ${staffId}|${calc.periodStart}|${calc.periodEnd}`);
      return {
        success: true,  // 冪等性：既存があれば成功扱い
        skipped: true,
        existingPayout: this._enrichPayout(existingPayouts[0]),
        message: `この期間（${calc.periodStart}〜${calc.periodEnd}）の支払いは既に存在します`
      };
    }

    // 2. 調整額を適用
    const adjustmentAmount = options.adjustment_amount || 0;
    const totalAmount = calc.totalAmount + adjustmentAmount;

    // 3. 支払いレコード作成（confirmed ステータスで保存）
    const payout = PayoutRepository.insert({
      payout_type: 'STAFF',
      staff_id: staffId,
      period_start: calc.periodStart,
      period_end: calc.periodEnd,
      assignment_count: calc.assignmentCount,
      base_amount: calc.baseAmount,
      transport_amount: calc.transportAmount,
      adjustment_amount: adjustmentAmount,
      tax_amount: calc.taxAmount,
      total_amount: totalAmount,
      status: 'confirmed',  // confirmed状態
      paid_date: '',
      notes: options.notes || ''
    });

    // 4. 対象Assignmentにpayout_idを設定（二重計上防止）
    this._linkAssignmentsToPayout(calc.assignments, payout.payout_id);

    // 5. 監査ログ
    try {
      logCreate('T_Payouts', payout.payout_id, payout);
    } catch (e) {
      Logger.log(`[confirmPayout] Audit log error: ${e.message}`);
    }

    // スタッフ名を付与して返す
    return {
      success: true,
      payout: this._enrichPayout(payout)
    };
  },

  /**
   * 確認済み支払いを振込完了にする
   * @param {string} payoutId - 支払ID
   * @param {Object} options - オプション
   * @param {string} options.paid_date - 支払日（省略時は本日）
   * @param {string} options.expectedUpdatedAt - 楽観ロック用
   * @returns {Object} { success, payout, error }
   */
  payConfirmedPayout: function(payoutId, options = {}) {
    Logger.log(`[payConfirmedPayout] payoutId=${payoutId}, options=${JSON.stringify(options)}`);

    const current = PayoutRepository.findById(payoutId);
    if (!current) {
      return { success: false, error: 'NOT_FOUND' };
    }

    // confirmedステータスからのみpaidに変更可能
    if (current.status !== 'confirmed') {
      return {
        success: false,
        error: 'INVALID_STATUS',
        message: `confirmed状態のみ振込完了にできます（現在: ${current.status}）`
      };
    }

    const paidDate = options.paid_date || Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');

    const result = PayoutRepository.update({
      payout_id: payoutId,
      status: 'paid',
      paid_date: paidDate
    }, options.expectedUpdatedAt);

    if (result.success) {
      // 監査ログ
      try {
        logUpdate('T_Payouts', payoutId, result.before, result.payout);
      } catch (e) {
        Logger.log(`[payConfirmedPayout] Audit log error: ${e.message}`);
      }

      return {
        success: true,
        payout: this._enrichPayout(result.payout)
      };
    }

    return result;
  },

  /**
   * 支払いを支払済として記録（直接paid - 後方互換）
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

    // 1.5. 重複チェック（冪等性のためエラーではなくスキップ）
    const existingPayouts = PayoutRepository.findByStaffAndPeriod(
      staffId, calc.periodStart, calc.periodEnd
    );
    if (existingPayouts.length > 0) {
      Logger.log(`[markAsPaid] SKIP duplicate: ${staffId}|${calc.periodStart}|${calc.periodEnd}`);
      return {
        success: true,  // 冪等性：既存があれば成功扱い
        skipped: true,
        existingPayout: this._enrichPayout(existingPayouts[0]),
        message: `この期間（${calc.periodStart}〜${calc.periodEnd}）の支払いは既に存在します`
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
      tax_amount: calc.taxAmount,
      total_amount: totalAmount,
      status: 'paid',
      paid_date: paidDate,
      notes: options.notes || ''
    });

    // 5. 対象Assignmentにpayout_idを設定（二重計上防止）
    this._linkAssignmentsToPayout(calc.assignments, payout.payout_id);

    // 6. 監査ログ
    try {
      logCreate('T_Payouts', payout.payout_id, payout);
    } catch (e) {
      Logger.log(`[markAsPaid] Audit log error: ${e.message}`);
    }

    // スタッフ名を付与して返す
    return {
      success: true,
      payout: this._enrichPayout(payout)
    };
  },

  /**
   * 複数スタッフの支払いを一括確認
   * @param {string[]} staffIds - スタッフID配列
   * @param {string} endDate - 集計終了日
   * @param {Object} options - オプション
   * @param {Object} options.adjustments - スタッフIDをキーとした調整額・備考
   * @param {Object} options.preCalculatedData - UIから送信された事前計算済みデータ（軽量モード）
   * @returns {Object} { success: number, failed: number, results: [], payouts: [] }
   */
  bulkConfirmPayouts: function(staffIds, endDate, options = {}) {
    Logger.log(`[bulkConfirmPayouts] Starting bulk confirm for ${staffIds.length} staff`);

    const adjustments = options.adjustments || {};
    const preCalculatedData = options.preCalculatedData || null;
    const results = [];
    const payoutsToInsert = [];
    const assignmentUpdates = [];
    let success = 0;
    let failed = 0;

    // ★ 軽量モード: UIから事前計算済みデータが渡された場合、再計算をスキップ
    const useLightMode = preCalculatedData !== null;
    Logger.log(`[bulkConfirmPayouts] Mode: ${useLightMode ? 'LIGHT (skip recalculation)' : 'FULL (recalculate)'}`);

    let staffCalcMap = new Map();

    if (useLightMode) {
      // ★ 軽量モード: preCalculatedDataをそのまま使用（シートI/Oなし）
      for (const staffId of staffIds) {
        const preCalc = preCalculatedData[staffId];
        if (preCalc && preCalc.assignmentIds && preCalc.assignmentIds.length > 0) {
          staffCalcMap.set(staffId, {
            assignments: preCalc.assignmentIds.map(id => ({ assignment_id: id })),
            assignmentCount: preCalc.assignmentIds.length,
            baseAmount: preCalc.baseAmount || 0,
            transportAmount: preCalc.transportAmount || 0,
            taxAmount: preCalc.taxAmount || 0,
            totalAmount: preCalc.estimatedAmount + (preCalc.taxAmount || 0),  // 税引き前に戻す
            periodStart: preCalc.periodStart,
            periodEnd: preCalc.periodEnd || endDate
          });
        } else {
          staffCalcMap.set(staffId, { assignmentCount: 0 });
        }
      }
    } else {
      // ★ フルモード: 従来通り再計算（後方互換性のため残す）

      // 1. Jobデータを事前ロード
      const jobs = JobRepository.search({ work_date_to: endDate, sort_order: 'asc' });
      const jobMap = new Map(jobs.map(j => [j.job_id, j]));
      const jobIdSet = new Set(jobs.map(j => j.job_id));
      Logger.log(`[bulkConfirmPayouts] Preloaded ${jobs.length} jobs`);

      // 2. Payoutデータを事前ロード
      const allPayouts = PayoutRepository.search({
        payout_type: 'STAFF',
        status_in: ['confirmed', 'paid']
      });
      const lastPayoutMap = new Map();
      for (const p of allPayouts) {
        if (!p.staff_id) continue;
        const existing = lastPayoutMap.get(p.staff_id);
        if (!existing) {
          lastPayoutMap.set(p.staff_id, p);
        } else {
          const existingDate = existing.paid_date || existing.period_end;
          const newDate = p.paid_date || p.period_end;
          if (newDate > existingDate) {
            lastPayoutMap.set(p.staff_id, p);
          }
        }
      }
      Logger.log(`[bulkConfirmPayouts] Preloaded ${allPayouts.length} payouts`);

      // 3. Assignmentデータを事前ロード
      const allAssignments = AssignmentRepository.search({ status: 'ASSIGNED' })
        .filter(a => !a.is_deleted && !a.payout_id);
      const assignmentsByStaff = new Map();
      for (const a of allAssignments) {
        if (!assignmentsByStaff.has(a.staff_id)) {
          assignmentsByStaff.set(a.staff_id, []);
        }
        assignmentsByStaff.get(a.staff_id).push(a);
      }
      Logger.log(`[bulkConfirmPayouts] Preloaded ${allAssignments.length} assignments`);

      const bulkCache = { jobs, jobMap, jobIdSet, lastPayoutMap, assignmentsByStaff };

      // 4. 全スタッフの未払い計算
      for (const staffId of staffIds) {
        const calc = this._calculatePayoutWithBulkCache(staffId, endDate, bulkCache);
        staffCalcMap.set(staffId, calc);
      }
    }

    // ========== Phase 2.5: 重複チェック用のSet構築 ==========
    // 対象endDateの既存Payoutを取得（全件取得を避ける）
    const existingPayouts = PayoutRepository.search({
      payout_type: 'STAFF',
      period_end_to: endDate,
      period_start_from: null,  // 全期間（開始日は不特定）
      status_in: ['draft', 'confirmed', 'paid']
    }).filter(p => p.period_end === endDate);  // endDate完全一致でフィルタ

    // キーは (staff_id, period_start, period_end) の3要素
    const existingPayoutKeys = new Set();
    for (const p of existingPayouts) {
      if (p.staff_id && p.period_start && p.period_end) {
        existingPayoutKeys.add(`${p.staff_id}|${p.period_start}|${p.period_end}`);
      }
    }
    Logger.log(`[bulkConfirmPayouts] Loaded ${existingPayouts.length} existing payouts for duplicate check`);

    // 支払いレコードを準備
    let skipped = 0;

    for (const staffId of staffIds) {
      const calc = staffCalcMap.get(staffId);

      if (!calc || calc.assignmentCount === 0) {
        results.push({
          staffId: staffId,
          success: false,
          error: 'NO_UNPAID_ASSIGNMENTS',
          message: '未払いの配置がありません'
        });
        failed++;
        continue;
      }

      // ★ 重複チェック（冪等性のためエラーではなくスキップ）
      const payoutKey = `${staffId}|${calc.periodStart}|${calc.periodEnd}`;
      if (existingPayoutKeys.has(payoutKey)) {
        Logger.log(`[bulkConfirmPayouts] SKIP duplicate: ${payoutKey}`);
        results.push({
          staffId: staffId,
          success: true,  // エラーではなく成功扱い
          skipped: true,
          message: `この期間（${calc.periodStart}〜${calc.periodEnd}）の支払いは既に存在します`
        });
        skipped++;
        continue;
      }

      // バッチ内重複防止（同じキーを追加）
      existingPayoutKeys.add(payoutKey);

      const adjustmentAmount = adjustments[staffId]?.adjustment_amount || 0;
      const notes = adjustments[staffId]?.notes || '';
      const totalAmount = calc.totalAmount + adjustmentAmount;
      const payoutId = generateId('pay');

      // 支払いレコード準備
      payoutsToInsert.push({
        payout_id: payoutId,
        payout_type: 'STAFF',
        staff_id: staffId,
        period_start: calc.periodStart,
        period_end: calc.periodEnd,
        assignment_count: calc.assignmentCount,
        base_amount: calc.baseAmount,
        transport_amount: calc.transportAmount,
        adjustment_amount: adjustmentAmount,
        tax_amount: calc.taxAmount,
        total_amount: totalAmount,
        status: 'confirmed',
        paid_date: '',
        notes: notes
      });

      // Assignment更新準備
      for (const assignment of calc.assignments) {
        assignmentUpdates.push({
          assignment_id: assignment.assignment_id,
          payout_id: payoutId
        });
      }

      results.push({
        staffId: staffId,
        success: true,
        payoutId: payoutId
      });
      success++;
    }

    // 3. 一括挿入
    let insertedPayouts = [];
    if (payoutsToInsert.length > 0) {
      insertedPayouts = PayoutRepository.insertBulk(payoutsToInsert);
      Logger.log(`[bulkConfirmPayouts] Inserted ${insertedPayouts.length} payouts`);
    }

    // 4. Assignment一括更新（失敗時はPayoutをdraftに戻す）
    let assignmentUpdateWarning = null;
    if (assignmentUpdates.length > 0) {
      try {
        const updateResult = AssignmentRepository.bulkUpdatePayoutId(assignmentUpdates);
        Logger.log(`[bulkConfirmPayouts] Updated ${updateResult.success} assignments`);
      } catch (e) {
        Logger.log(`[bulkConfirmPayouts] Assignment update failed: ${e.message}`);
        assignmentUpdateWarning = e.message;

        // 挿入済みPayoutをdraftに戻す（リカバリ）
        for (const payout of insertedPayouts) {
          try {
            PayoutRepository.update({ payout_id: payout.payout_id, status: 'draft' });
          } catch (revertErr) {
            Logger.log(`[bulkConfirmPayouts] Failed to revert payout ${payout.payout_id}: ${revertErr.message}`);
          }
        }
      }
    }

    // 5. 監査ログ（一括 - 1回のシートI/O）
    try {
      const auditRecords = insertedPayouts.map(p => ({
        recordId: p.payout_id,
        data: p
      }));
      logCreateBulk('T_Payouts', auditRecords);
    } catch (e) {
      Logger.log(`[bulkConfirmPayouts] Audit log error: ${e.message}`);
    }

    // 6. スタッフ名を付与して返す（1回のシートI/O）
    const enrichedPayouts = this._enrichPayoutsBulk(insertedPayouts);

    // 7. データ同期を強制（読み取り競合防止）
    SpreadsheetApp.flush();

    const result = {
      success: success,
      failed: failed,
      skipped: skipped,  // ★ 重複スキップ数を追加
      results: results,
      payouts: enrichedPayouts
    };

    // Assignment更新失敗時は警告を付与
    if (assignmentUpdateWarning) {
      result.warning = 'Assignment更新に失敗しました。再実行してください: ' + assignmentUpdateWarning;
    }

    Logger.log(`[bulkConfirmPayouts] Completed: success=${success}, failed=${failed}, skipped=${skipped}`);

    return result;
  },

  /**
   * 複数の確認済み支払いを一括振込完了にする
   * @param {string[]} payoutIds - 支払ID配列
   * @param {Object} options - オプション
   * @param {string} options.paid_date - 支払日
   * @param {Object} options.expectedUpdatedAtMap - 楽観ロック用 { [payoutId]: expectedUpdatedAt }
   * @returns {Object} { success: number, failed: number, results: [], payouts: [] }
   */
  bulkPayConfirmed: function(payoutIds, options = {}) {
    Logger.log(`[bulkPayConfirmed] Starting bulk update for ${payoutIds.length} payouts`);

    const paidDate = options.paid_date || Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');

    // バルク更新を使用（シートI/Oを1回に集約）
    const result = PayoutRepository.bulkUpdateStatus(payoutIds, 'paid', {
      paid_date: paidDate,
      expectedUpdatedAtMap: options.expectedUpdatedAtMap || {}
    });

    Logger.log(`[bulkPayConfirmed] Completed: success=${result.success}, failed=${result.failed}`);

    // スタッフ名を付与（1回のシートI/O）
    const enrichedPayouts = this._enrichPayoutsBulk(result.payouts);

    // 監査ログ（1回のシートI/O）
    try {
      const auditRecords = enrichedPayouts.map(p => ({
        recordId: p.payout_id,
        before: { status: 'confirmed' },
        after: p
      }));
      logUpdateBulk('T_Payouts', auditRecords);
    } catch (e) {
      Logger.log(`[bulkPayConfirmed] Audit log error: ${e.message}`);
    }

    return {
      success: result.success,
      failed: result.failed,
      results: result.results,
      payouts: enrichedPayouts
    };
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
    return this._enrichPayoutsBulk(payouts);
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
   * @param {string} status - 新ステータス（'confirmed' or 'paid'）
   * @param {string} expectedUpdatedAt - 楽観ロック用
   * @returns {Object} 更新結果
   */
  updateStatus: function(payoutId, status, expectedUpdatedAt) {
    const current = PayoutRepository.findById(payoutId);
    if (!current) {
      return { success: false, error: 'NOT_FOUND' };
    }

    // ステータス遷移の検証
    const validTransitions = {
      'confirmed': ['paid'],  // confirmed → paid
      'paid': []              // paidからは変更不可（undoPayoutを使用）
    };

    const allowedNext = validTransitions[current.status] || [];
    if (!allowedNext.includes(status)) {
      return {
        success: false,
        error: 'INVALID_STATUS',
        message: `${current.status} から ${status} への変更はできません。取り消しは undoPayout() を使用してください。`
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

    // 1. 関連Assignmentのpayout_idをクリア
    this._unlinkAssignmentsFromPayout(payoutId);

    // 2. 論理削除で取り消し
    const result = PayoutRepository.softDelete(payoutId, expectedUpdatedAt);

    // 3. 監査ログ
    if (result.success) {
      try {
        logDelete('T_Payouts', payoutId, current);
      } catch (e) {
        Logger.log(`[undoPayout] Audit log error: ${e.message}`);
      }

      // 4. 取り消し後の情報を付与（差分リロード用）
      result.undone = this._enrichPayout(current);
    }

    return result;
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
    return this._enrichPayoutsBulk(payouts);
  },

  /**
   * 確認済み支払いを取得
   * @param {Object} options - オプション
   * @returns {Object[]} confirmed状態の支払い一覧
   */
  getConfirmedPayouts: function(options = {}) {
    const query = {
      ...options,
      status: 'confirmed',
      payout_type: options.payout_type || 'STAFF'
    };
    return this.search(query);
  },

  /**
   * 指定期間終了日の確認済みPayoutを取得（集計画面の状態復元用）
   * @param {string} endDate - 期間終了日
   * @returns {Object[]} 確認済みPayout一覧（スタッフ名付き）
   */
  getConfirmedPayoutsForPeriod: function(endDate) {
    const payouts = PayoutRepository.search({
      payout_type: 'STAFF',
      status: 'confirmed'
    }).filter(p => p.period_end === endDate);

    return this._enrichPayoutsBulk(payouts);
  },

  /**
   * 期間内の支払済みレコードを取得（エクスポート用）
   * @param {string} fromDate - 開始日（YYYY-MM-DD）
   * @param {string} toDate - 終了日（YYYY-MM-DD）
   * @returns {Object[]} スタッフ/外注先名を付与した支払い配列
   */
  getPayoutReport: function(fromDate, toDate) {
    const payouts = PayoutRepository.search({
      status: 'paid',
      paid_date_from: fromDate,
      paid_date_to: toDate,
      sort_order: 'asc'  // 日付昇順でエクスポート
    });

    return this._enrichPayoutsBulk(payouts);
  },

  /**
   * 未払いがあるスタッフ一覧を取得（バルク処理版）
   * @param {string} endDate - 集計終了日
   * @param {Object} [options={}] - オプション
   * @param {string} [options.staffId] - 特定スタッフのみ取得する場合に指定
   * @returns {Object[]} { staffId, staffName, unpaidCount, estimatedAmount }
   */
  getUnpaidStaffList: function(endDate, options = {}) {
    // 1. 全データを一括取得（外注スタッフは除外 - 外注費管理タブで別途管理）
    let staffList = StaffRepository.search({ is_active: true })
      .filter(s => s.staff_type !== 'subcontract');

    // 特定スタッフ指定時はフィルタ
    if (options.staffId) {
      staffList = staffList.filter(s => s.staff_id === options.staffId);
    }

    if (staffList.length === 0) return [];

    const staffMap = new Map(staffList.map(s => [s.staff_id, s]));

    // 2. 対象期間のJobを一括取得
    const jobs = JobRepository.search({ work_date_to: endDate, sort_order: 'asc' });
    if (jobs.length === 0) return [];

    const jobMap = new Map(jobs.map(j => [j.job_id, j]));
    const jobIds = new Set(jobs.map(j => j.job_id));

    // 3. 全Assignmentsを一括取得（ASSIGNEDかつpayout_id未設定のみ）
    const allAssignments = AssignmentRepository.search({ status: 'ASSIGNED' })
      .filter(a => !a.payout_id);  // 二重計上防止

    // 4. 支払済み/確認済みPayoutsを取得
    const allPayouts = PayoutRepository.search({
      payout_type: 'STAFF',
      status_in: ['confirmed', 'paid']
    });

    // 最新Payoutをスタッフごとにマップ（paid_date優先）
    const lastPayoutMap = new Map();
    for (const p of allPayouts) {
      if (!p.staff_id) continue;
      const existing = lastPayoutMap.get(p.staff_id);
      if (!existing) {
        lastPayoutMap.set(p.staff_id, p);
      } else {
        // paid_date優先で比較、なければperiod_endで比較
        const existingDate = existing.paid_date || existing.period_end;
        const newDate = p.paid_date || p.period_end;
        if (newDate > existingDate) {
          lastPayoutMap.set(p.staff_id, p);
        }
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

      // 源泉徴収税を計算
      const taxAmount = this._calculateWithholdingTax(staff, calcResult.baseAmount);

      const dates = assignmentsWithJob.map(a => a.work_date).filter(d => d);
      const periodStart = dates.length > 0 ? dates[0] : endDate;

      results.push({
        staffId: staffId,
        staffName: staff.name,
        unpaidCount: staffAssignments.length,
        baseAmount: calcResult.baseAmount,
        transportAmount: calcResult.transportAmount,
        estimatedAmount: calcResult.totalAmount - taxAmount,
        taxAmount: taxAmount,
        periodStart: periodStart,
        periodEnd: endDate,
        // ★ bulkConfirmPayoutsで再計算をスキップするためのデータ
        assignmentIds: staffAssignments.map(a => a.assignment_id)
      });
    }

    // 金額降順でソート
    return results.sort((a, b) => b.estimatedAmount - a.estimatedAmount);
  },

  /**
   * 未払スタッフリストの差分を取得（SWR差分更新用）
   * @param {string} endDate - 集計終了日
   * @param {string} lastSyncTimestamp - 前回同期時刻（ISO形式）
   * @returns {Object} { changedStaffIds, removedStaffIds, staffList }
   */
  getUnpaidStaffListDelta: function(endDate, lastSyncTimestamp) {
    Logger.log(`[getUnpaidStaffListDelta] endDate=${endDate}, lastSync=${lastSyncTimestamp}`);

    // 1. lastSyncTimestamp以降に更新されたAssignmentを取得
    const allAssignments = AssignmentRepository.search({ status: 'ASSIGNED' });
    const changedAssignments = allAssignments.filter(a =>
      a.updated_at && a.updated_at > lastSyncTimestamp
    );

    // 2. 変更があったスタッフIDを抽出
    const changedStaffIdSet = new Set(changedAssignments.map(a => a.staff_id).filter(Boolean));

    // 3. lastSyncTimestamp以降に作成/更新されたPayoutも確認
    const recentPayouts = PayoutRepository.search({
      payout_type: 'STAFF',
      status_in: ['confirmed', 'paid', 'deleted']
    }).filter(p => p.updated_at && p.updated_at > lastSyncTimestamp);

    // PayoutのスタッフIDも追加
    for (const p of recentPayouts) {
      if (p.staff_id) changedStaffIdSet.add(p.staff_id);
    }

    const changedStaffIds = Array.from(changedStaffIdSet);
    Logger.log(`[getUnpaidStaffListDelta] ${changedStaffIds.length} staff changed since ${lastSyncTimestamp}`);

    // 4. 変更があったスタッフがいない場合は空の差分を返す
    if (changedStaffIds.length === 0) {
      return {
        changedStaffIds: [],
        removedStaffIds: [],
        staffList: []
      };
    }

    // 5. 変更があったスタッフの未払い情報を再計算
    const fullList = this.getUnpaidStaffList(endDate);

    // 変更があったスタッフのみフィルタ
    const deltaStaffList = fullList.filter(s => changedStaffIdSet.has(s.staffId));

    // 6. 削除されたスタッフを特定（変更があったが未払いリストにいない）
    const unpaidStaffIdSet = new Set(fullList.map(s => s.staffId));
    const removedStaffIds = changedStaffIds.filter(id => !unpaidStaffIdSet.has(id));

    Logger.log(`[getUnpaidStaffListDelta] delta: ${deltaStaffList.length} updated, ${removedStaffIds.length} removed`);

    return {
      changedStaffIds: changedStaffIds,
      removedStaffIds: removedStaffIds,
      staffList: deltaStaffList
    };
  },

  // ========== Private Methods ==========

  /**
   * 未払い金額を計算（フルキャッシュ使用版 - bulkConfirmPayouts用）
   * @param {string} staffId - スタッフID
   * @param {string} endDate - 集計終了日
   * @param {Object} bulkCache - { jobs, jobMap, jobIdSet, lastPayoutMap, assignmentsByStaff }
   * @returns {Object} { assignments, baseAmount, transportAmount, totalAmount, periodStart, periodEnd }
   */
  _calculatePayoutWithBulkCache: function(staffId, endDate, bulkCache) {
    const assignments = this._getUnpaidAssignmentsWithBulkCache(staffId, endDate, bulkCache);

    if (assignments.length === 0) {
      return {
        assignments: [],
        assignmentCount: 0,
        baseAmount: 0,
        transportAmount: 0,
        taxAmount: 0,
        totalAmount: 0,
        periodStart: null,
        periodEnd: endDate
      };
    }

    // スタッフ情報を取得（MasterCacheを使用）
    const allStaff = MasterCache.getStaff();
    const staff = allStaff.find(s => s.staff_id === staffId);

    // 金額計算
    const result = calculateMonthlyPayout_(assignments, staff);

    // 源泉徴収税を計算（STAFFで withholding_tax_applicable の場合のみ）
    const taxAmount = this._calculateWithholdingTax(staff, result.baseAmount);

    // 期間を算出
    const dates = assignments.map(a => a.work_date).filter(d => d);
    const periodStart = dates.length > 0 ? dates[0] : endDate;
    const periodEnd = endDate;

    return {
      assignments: assignments,
      assignmentCount: assignments.length,
      baseAmount: result.baseAmount,
      transportAmount: result.transportAmount,
      taxAmount: taxAmount,
      totalAmount: result.totalAmount - taxAmount,  // 税引き後
      periodStart: periodStart,
      periodEnd: periodEnd
    };
  },

  /**
   * スタッフの未払い配置を取得（フルキャッシュ使用版 - bulkConfirmPayouts用）
   * ★ シートI/Oゼロ: 全データは事前ロード済み
   * @param {string} staffId - スタッフID
   * @param {string} endDate - 集計終了日
   * @param {Object} bulkCache - { jobs, jobMap, jobIdSet, lastPayoutMap, assignmentsByStaff }
   * @returns {Object[]} 未払い配置リスト（Job情報含む）
   */
  _getUnpaidAssignmentsWithBulkCache: function(staffId, endDate, bulkCache) {
    const { jobs, jobMap, jobIdSet, lastPayoutMap, assignmentsByStaff } = bulkCache;

    // 1. 最後の支払いをキャッシュから取得（シートI/Oなし）
    const lastPayout = lastPayoutMap.get(staffId);
    const startDate = lastPayout ? this._addDays(lastPayout.period_end, 1) : null;

    // 2. 期間フィルタ用のJobIdSetを作成
    let filteredJobIdSet = jobIdSet;
    if (startDate) {
      filteredJobIdSet = new Set(
        jobs.filter(j => j.work_date >= startDate).map(j => j.job_id)
      );
    }

    if (filteredJobIdSet.size === 0) {
      return [];
    }

    // 3. スタッフの配置をキャッシュから取得（シートI/Oなし）
    const staffAssignments = assignmentsByStaff.get(staffId) || [];

    // 4. 該当Job内の配置をフィルタリング（Set.has()でO(1)）
    const unpaidAssignments = staffAssignments.filter(a =>
      filteredJobIdSet.has(a.job_id)
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
    }).sort((a, b) => (a.work_date || '').localeCompare(b.work_date || ''));
  },

  /**
   * 対象AssignmentsにPayoutIDを紐付け（二重計上防止）
   * @param {Object[]} assignments - 配置リスト
   * @param {string} payoutId - 支払ID
   *
   * Note: bulkUpdatePayoutIdを使用してupdated_atを更新しない
   *       （請求変更検知の誤検知防止）
   */
  _linkAssignmentsToPayout: function(assignments, payoutId) {
    if (!assignments || assignments.length === 0) {
      return;
    }

    const updates = assignments.map(a => ({
      assignment_id: a.assignment_id,
      payout_id: payoutId
    }));

    try {
      const result = AssignmentRepository.bulkUpdatePayoutId(updates);
      Logger.log(`[_linkAssignmentsToPayout] Updated ${result.success} assignments with payout_id: ${payoutId}`);
    } catch (e) {
      Logger.log(`[_linkAssignmentsToPayout] Error: ${e.message}`);
    }
  },

  /**
   * PayoutIDに紐付いたAssignmentsのpayout_idをクリア（バルク処理版）
   * @param {string} payoutId - 支払ID
   */
  _unlinkAssignmentsFromPayout: function(payoutId) {
    // payout_idで関連するAssignmentsを検索
    const allAssignments = AssignmentRepository.search({ status: 'ASSIGNED' });
    const linkedAssignments = allAssignments.filter(a => a.payout_id === payoutId);

    if (linkedAssignments.length === 0) {
      return;
    }

    // バルク更新用のデータを作成
    const updates = linkedAssignments.map(a => ({
      assignment_id: a.assignment_id,
      payout_id: ''
    }));

    try {
      // 一括でpayout_idをクリア
      AssignmentRepository.bulkUpdatePayoutId(updates);
    } catch (e) {
      Logger.log(`[_unlinkAssignmentsFromPayout] Bulk update error: ${e.message}`);
    }
  },

  /**
   * 源泉徴収税を計算
   * @param {Object} staff - スタッフ情報
   * @param {number} baseAmount - 基本給
   * @returns {number} 源泉徴収税額
   */
  _calculateWithholdingTax: function(staff, baseAmount) {
    if (!staff) return 0;

    // withholding_tax_applicable が true の場合のみ源泉徴収
    if (!staff.withholding_tax_applicable) return 0;

    // 源泉徴収税率 10.21%（復興特別所得税込み）
    const WITHHOLDING_TAX_RATE = 0.1021;
    return Math.floor(baseAmount * WITHHOLDING_TAX_RATE);
  },

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
   * 支払いにスタッフ/外注先名を一括付与（バルク版）
   * @param {Object[]} payouts - 支払いデータ配列
   * @returns {Object[]} 名前付き支払いデータ配列
   */
  _enrichPayoutsBulk: function(payouts) {
    if (!payouts || payouts.length === 0) {
      return [];
    }

    // IDを収集
    const staffIds = [];
    const subIds = [];
    for (const p of payouts) {
      if (p.payout_type === 'STAFF' && p.staff_id) {
        staffIds.push(p.staff_id);
      } else if (p.payout_type === 'SUBCONTRACTOR' && p.subcontractor_id) {
        subIds.push(p.subcontractor_id);
      }
    }

    // 1回のシートI/Oで一括取得
    const staffMap = staffIds.length > 0 ? StaffRepository.findByIds(staffIds) : new Map();
    const subMap = subIds.length > 0 ? SubcontractorRepository.findByIds(subIds) : new Map();

    // 名前を付与
    return payouts.map(p => {
      let targetName = '';
      if (p.payout_type === 'STAFF' && p.staff_id) {
        const staff = staffMap.get(p.staff_id);
        targetName = staff ? staff.name : '(不明)';
      } else if (p.payout_type === 'SUBCONTRACTOR' && p.subcontractor_id) {
        const sub = subMap.get(p.subcontractor_id);
        targetName = sub ? sub.company_name : '(不明)';
      }
      return { ...p, target_name: targetName };
    });
  },

  /**
   * 日付文字列をローカルタイムゾーンでパース（UTC解釈回避）
   * @param {string} dateStr - 日付文字列（YYYY-MM-DD形式）
   * @returns {Date|null} パースされた日付またはnull
   */
  _parseLocalDate: function(dateStr) {
    if (!dateStr) return null;

    const normalized = String(dateStr).replace(/\//g, '-');
    const parts = normalized.split('-');
    if (parts.length !== 3) return new Date(dateStr); // フォールバック

    const [y, m, d] = parts.map(Number);
    return new Date(y, m - 1, d); // ローカルタイムゾーンで作成
  },

  /**
   * 日付に日数を加算
   * @param {string} dateStr - 日付（YYYY-MM-DD）
   * @param {number} days - 加算日数
   * @returns {string} 加算後の日付
   */
  _addDays: function(dateStr, days) {
    if (!dateStr) return null;
    const date = this._parseLocalDate(dateStr);
    if (!date) return null;
    date.setDate(date.getDate() + days);
    return Utilities.formatDate(date, 'Asia/Tokyo', 'yyyy-MM-dd');
  },

  // ========== Subcontractor Payout Methods (P2-8) ==========

  /**
   * 外注先の未払い配置を取得
   * @param {string} subcontractorId - 外注先ID
   * @param {string} endDate - 集計終了日（YYYY-MM-DD）
   * @returns {Object[]} 未払い配置リスト（Job情報含む）
   */
  getUnpaidAssignmentsForSubcontractor: function(subcontractorId, endDate) {
    // 1. 最後の支払いを取得
    const lastPayout = PayoutRepository.findLastPayoutForSubcontractor(subcontractorId);
    const startDate = lastPayout ? this._addDays(lastPayout.period_end, 1) : null;
    Logger.log(`[getUnpaidAssignmentsForSubcontractor] subcontractorId=${subcontractorId}, endDate=${endDate}, lastPayout period_end=${lastPayout?.period_end}, startDate=${startDate}`);

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
    const jobIdSet = new Set(jobs.map(j => j.job_id));

    if (jobIdSet.size === 0) {
      return [];
    }

    // 3. 外注先に紐づくスタッフを取得
    const subcontractorStaff = StaffRepository.search({
      subcontractor_id: subcontractorId,
      staff_type: 'subcontract'
    });
    const staffIdSet = new Set(subcontractorStaff.map(s => s.staff_id));
    const staffMap = new Map(subcontractorStaff.map(s => [s.staff_id, s]));
    Logger.log(`[getUnpaidAssignmentsForSubcontractor] Found ${staffIdSet.size} staff for subcontractor`);

    if (staffIdSet.size === 0) {
      return [];
    }

    // 4. 外注スタッフの配置を取得（payout_id未設定のみ）
    const allAssignments = AssignmentRepository.search({ status: 'ASSIGNED' });
    const unpaidAssignments = allAssignments.filter(a =>
      !a.is_deleted &&
      !a.payout_id &&
      staffIdSet.has(a.staff_id) &&
      jobIdSet.has(a.job_id)
    );
    Logger.log(`[getUnpaidAssignmentsForSubcontractor] unpaidAssignments: ${unpaidAssignments.length}`);

    // 5. Job情報とスタッフ情報を付与して返す
    return unpaidAssignments.map(a => {
      const job = jobMap.get(a.job_id);
      const staff = staffMap.get(a.staff_id);
      return {
        ...a,
        work_date: job ? job.work_date : '',
        site_name: job ? job.site_name : '',
        customer_id: job ? job.customer_id : '',
        staff_name: staff ? staff.name : ''
      };
    }).sort((a, b) => (a.work_date || '').localeCompare(b.work_date || ''));
  },

  /**
   * 外注費を計算（プレビュー用）
   * @param {string} subcontractorId - 外注先ID
   * @param {string} endDate - 集計終了日
   * @returns {Object} { assignments, baseAmount, transportAmount, totalAmount, periodStart, periodEnd }
   */
  calculatePayoutForSubcontractor: function(subcontractorId, endDate) {
    const assignments = this.getUnpaidAssignmentsForSubcontractor(subcontractorId, endDate);

    if (assignments.length === 0) {
      return {
        assignments: [],
        assignmentCount: 0,
        baseAmount: 0,
        transportAmount: 0,
        taxAmount: 0,
        totalAmount: 0,
        periodStart: null,
        periodEnd: endDate
      };
    }

    // 金額計算（外注費は wage_rate を使用、源泉徴収なし）
    let baseAmount = 0;
    let transportAmount = 0;

    for (const asg of assignments) {
      const rate = asg.wage_rate || 0;
      baseAmount += rate;
      transportAmount += asg.transport_amount || 0;
    }

    const totalAmount = baseAmount + transportAmount;

    // 期間を算出
    const dates = assignments.map(a => a.work_date).filter(d => d);
    const periodStart = dates.length > 0 ? dates[0] : endDate;

    return {
      assignments: assignments,
      assignmentCount: assignments.length,
      baseAmount: baseAmount,
      transportAmount: transportAmount,
      taxAmount: 0,  // 外注費は源泉徴収なし
      totalAmount: totalAmount,
      periodStart: periodStart,
      periodEnd: endDate
    };
  },

  /**
   * 外注費を確認済みとして記録
   * @param {string} subcontractorId - 外注先ID
   * @param {string} endDate - 集計終了日
   * @param {Object} options - オプション
   * @returns {Object} { success, payout, error }
   */
  confirmPayoutForSubcontractor: function(subcontractorId, endDate, options = {}) {
    Logger.log(`[confirmPayoutForSubcontractor] subcontractorId=${subcontractorId}, endDate=${endDate}`);

    const calc = this.calculatePayoutForSubcontractor(subcontractorId, endDate);

    if (calc.assignmentCount === 0) {
      return {
        success: false,
        error: 'NO_UNPAID_ASSIGNMENTS',
        message: '未払いの配置がありません'
      };
    }

    const adjustmentAmount = options.adjustment_amount || 0;
    const totalAmount = calc.totalAmount + adjustmentAmount;

    const payout = PayoutRepository.insert({
      payout_type: 'SUBCONTRACTOR',
      subcontractor_id: subcontractorId,
      period_start: calc.periodStart,
      period_end: calc.periodEnd,
      assignment_count: calc.assignmentCount,
      base_amount: calc.baseAmount,
      transport_amount: calc.transportAmount,
      adjustment_amount: adjustmentAmount,
      tax_amount: 0,
      total_amount: totalAmount,
      status: 'confirmed',
      paid_date: '',
      notes: options.notes || ''
    });

    // 対象Assignmentにpayout_idを設定
    this._linkAssignmentsToPayout(calc.assignments, payout.payout_id);

    try {
      logCreate('T_Payouts', payout.payout_id, payout);
    } catch (e) {
      Logger.log(`[confirmPayoutForSubcontractor] Audit log error: ${e.message}`);
    }

    return {
      success: true,
      payout: this._enrichPayout(payout)
    };
  },

  /**
   * 外注費を支払済として記録
   * @param {string} subcontractorId - 外注先ID
   * @param {string} endDate - 集計終了日
   * @param {Object} options - オプション
   * @returns {Object} { success, payout, error }
   */
  markAsPaidForSubcontractor: function(subcontractorId, endDate, options = {}) {
    Logger.log(`[markAsPaidForSubcontractor] subcontractorId=${subcontractorId}, endDate=${endDate}`);

    const calc = this.calculatePayoutForSubcontractor(subcontractorId, endDate);

    if (calc.assignmentCount === 0) {
      return {
        success: false,
        error: 'NO_UNPAID_ASSIGNMENTS',
        message: '未払いの配置がありません'
      };
    }

    const adjustmentAmount = options.adjustment_amount || 0;
    const totalAmount = calc.totalAmount + adjustmentAmount;
    const paidDate = options.paid_date || Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');

    const payout = PayoutRepository.insert({
      payout_type: 'SUBCONTRACTOR',
      subcontractor_id: subcontractorId,
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

    this._linkAssignmentsToPayout(calc.assignments, payout.payout_id);

    try {
      logCreate('T_Payouts', payout.payout_id, payout);
    } catch (e) {
      Logger.log(`[markAsPaidForSubcontractor] Audit log error: ${e.message}`);
    }

    return {
      success: true,
      payout: this._enrichPayout(payout)
    };
  },

  /**
   * 未払いがある外注先一覧を取得
   * @param {string} endDate - 集計終了日
   * @returns {Object[]} { subcontractorId, companyName, unpaidCount, estimatedAmount }
   */
  getUnpaidSubcontractorList: function(endDate) {
    // 1. アクティブな外注先一覧を取得
    const subcontractors = SubcontractorRepository.search({ is_active: true });
    if (subcontractors.length === 0) return [];

    // 2. 対象期間のJobを一括取得
    const jobs = JobRepository.search({ work_date_to: endDate, sort_order: 'asc' });
    if (jobs.length === 0) return [];

    const jobMap = new Map(jobs.map(j => [j.job_id, j]));
    const jobIdSet = new Set(jobs.map(j => j.job_id));

    // 3. 外注スタッフ一覧を取得 & subcontractor_idでグループ化
    const allSubcontractStaff = StaffRepository.search({ staff_type: 'subcontract' });
    const staffBySubcontractor = new Map();
    const staffToSubcontractor = new Map(); // staff_id -> subcontractor_id
    for (const staff of allSubcontractStaff) {
      if (!staff.subcontractor_id) continue;
      if (!staffBySubcontractor.has(staff.subcontractor_id)) {
        staffBySubcontractor.set(staff.subcontractor_id, []);
      }
      staffBySubcontractor.get(staff.subcontractor_id).push(staff);
      staffToSubcontractor.set(staff.staff_id, staff.subcontractor_id);
    }

    // 4. 全Assignmentsを一括取得 & staff_idでグループ化（O(A)で1回のみ）
    const rawAssignments = AssignmentRepository.search({ status: 'ASSIGNED' });
    const assignmentsByStaff = new Map();
    for (const a of rawAssignments) {
      if (a.payout_id || a.is_deleted) continue;
      if (!staffToSubcontractor.has(a.staff_id)) continue; // 外注スタッフのみ
      if (!assignmentsByStaff.has(a.staff_id)) {
        assignmentsByStaff.set(a.staff_id, []);
      }
      assignmentsByStaff.get(a.staff_id).push(a);
    }

    // 5. 支払済み/確認済みPayoutsを取得 & 外注先ごとに最新をマップ
    const allPayouts = PayoutRepository.search({
      payout_type: 'SUBCONTRACTOR',
      status_in: ['confirmed', 'paid']
    });

    const lastPayoutMap = new Map();
    for (const p of allPayouts) {
      if (!p.subcontractor_id) continue;
      const existing = lastPayoutMap.get(p.subcontractor_id);
      if (!existing || p.period_end > existing.period_end) {
        lastPayoutMap.set(p.subcontractor_id, p);
      }
    }

    // 6. 外注先ごとに未払い配置を集計（O(S * staffPerSub * assignmentsPerStaff)）
    const results = [];

    for (const sub of subcontractors) {
      const subId = sub.subcontractor_id;
      const staffList = staffBySubcontractor.get(subId) || [];
      if (staffList.length === 0) continue;

      const lastPayout = lastPayoutMap.get(subId);
      const startDate = lastPayout ? this._addDays(lastPayout.period_end, 1) : null;

      // スタッフごとの配置を集約
      const subAssignments = [];
      for (const staff of staffList) {
        const staffAssignments = assignmentsByStaff.get(staff.staff_id) || [];
        for (const a of staffAssignments) {
          if (!jobIdSet.has(a.job_id)) continue;
          const job = jobMap.get(a.job_id);
          if (!job) continue;
          if (startDate && job.work_date < startDate) continue;
          subAssignments.push({ assignment: a, job });
        }
      }

      if (subAssignments.length === 0) continue;

      // 金額計算
      let baseAmount = 0;
      let transportAmount = 0;
      let minDate = endDate;
      for (const { assignment: asg, job } of subAssignments) {
        baseAmount += asg.wage_rate || 0;
        transportAmount += asg.transport_amount || 0;
        if (job.work_date && job.work_date < minDate) {
          minDate = job.work_date;
        }
      }

      results.push({
        subcontractorId: subId,
        companyName: sub.company_name,
        unpaidCount: subAssignments.length,
        estimatedAmount: baseAmount + transportAmount,
        baseAmount: baseAmount,
        transportAmount: transportAmount,
        periodStart: minDate,
        periodEnd: endDate
      });
    }

    // 金額降順でソート
    return results.sort((a, b) => b.estimatedAmount - a.estimatedAmount);
  },

  /**
   * 外注先の支払い履歴を取得
   * @param {string} subcontractorId - 外注先ID
   * @param {Object} options - オプション
   * @returns {Object[]} 支払い履歴
   */
  getSubcontractorHistory: function(subcontractorId, options = {}) {
    const payouts = PayoutRepository.findBySubcontractorId(subcontractorId, options);
    return this._enrichPayoutsBulk(payouts);
  }
};
