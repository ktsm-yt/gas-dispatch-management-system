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

interface PayoutCalcResult {
  assignments: Record<string, unknown>[] | null;
  assignmentCount: number;
  baseAmount: number;
  transportAmount: number;
  taxAmount: number;
  totalAmount: number;
  periodStart: string | null;
  periodEnd: string;
}

interface PayoutConfirmResult {
  success: boolean;
  payout?: PayoutRecord & { target_name: string };
  skipped?: boolean;
  existingPayout?: PayoutRecord & { target_name: string };
  error?: string;
  message?: string;
}

interface BulkConfirmResult {
  success: number;
  failed: number;
  skipped?: number;
  results: { staffId: string; success: boolean; payoutId?: string; skipped?: boolean; error?: string; message?: string }[];
  payouts: (PayoutRecord & { target_name: string })[];
  warning?: string;
}

interface BulkPayConfirmedResult {
  success: number;
  failed: number;
  results: { payoutId: string; success: boolean; error?: string; message?: string; currentUpdatedAt?: string }[];
  payouts: (PayoutRecord & { target_name: string })[];
}

interface BulkPayoutCache {
  jobs: Record<string, unknown>[];
  jobMap: Map<string, Record<string, unknown>>;
  jobIdSet: Set<string>;
  lastPayoutMap: Map<string, PayoutRecord>;
  assignmentsByStaff: Map<string, Record<string, unknown>[]>;
}

interface PreCalculatedStaffData {
  assignmentIds: string[];
  baseAmount: number;
  transportAmount: number;
  taxAmount: number;
  estimatedAmount: number;
  periodStart: string;
  periodEnd: string;
}

const PayoutService = {

  /**
   * スタッフの未払い配置を取得
   * @param staffId - スタッフID
   * @param endDate - 集計終了日（YYYY-MM-DD）
   * @returns 未払い配置リスト（Job情報含む）
   */
  getUnpaidAssignments: function(staffId: string, endDate: string): Record<string, unknown>[] {
    // 1. 最後の支払いを取得（confirmed/paid両方を考慮）
    const lastPayout = PayoutRepository.findLastPayout(staffId);
    const startDate = lastPayout ? this._addDays(lastPayout.period_end, 1) : null;
    Logger.log(`[getUnpaidAssignments] staffId=${staffId}, endDate=${endDate}, lastPayout period_end=${lastPayout?.period_end}, startDate=${startDate}`);

    // 2. 該当期間のJobを取得
    const jobQuery: Record<string, unknown> = {
      work_date_to: endDate,
      sort_order: 'asc'
    };
    if (startDate) {
      jobQuery.work_date_from = startDate;
    }
    const jobs = JobRepository.search(jobQuery);
    const jobMap = new Map(jobs.map(j => [j.job_id as string, j]));
    const jobIds = jobs.map(j => j.job_id as string);
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
      jobIds.includes(a.job_id as string)
    );
    Logger.log(`[getUnpaidAssignments] unpaidAssignments after filter: ${unpaidAssignments.length}`);

    // 5. Job情報を付与して返す
    return unpaidAssignments.map(a => {
      const job = jobMap.get(a.job_id as string);
      return {
        ...a,
        work_date: job ? job.work_date : '',
        site_name: job ? job.site_name : '',
        customer_id: job ? job.customer_id : ''
      };
    }).sort((a, b) => {
      // work_date昇順でソート
      return ((a.work_date as string) || '').localeCompare((b.work_date as string) || '');
    });
  },

  /**
   * 未払い金額を計算（プレビュー用）
   * @param staffId - スタッフID
   * @param endDate - 集計終了日
   * @param options - オプション
   * @returns 計算結果
   */
  calculatePayout: function(staffId: string, endDate: string, options: { include_assignments?: boolean } = {}): PayoutCalcResult {
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
    const dates = assignments.map(a => a.work_date as string).filter(d => d);
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
   * @param staffId - スタッフID
   * @param endDate - 集計終了日
   * @param options - オプション
   * @returns 確認結果
   */
  confirmPayout: function(staffId: string, endDate: string, options: { adjustment_amount?: number; notes?: string } = {}): PayoutConfirmResult {
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
      staffId, calc.periodStart!, calc.periodEnd
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
      period_start: calc.periodStart!,
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
    this._linkAssignmentsToPayout(calc.assignments!, payout.payout_id);

    // 5. 監査ログ
    try {
      logCreate('T_Payouts', payout.payout_id, payout);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      Logger.log(`[confirmPayout] Audit log error: ${msg}`);
    }

    // スタッフ名を付与して返す
    return {
      success: true,
      payout: this._enrichPayout(payout)
    };
  },

  /**
   * 確認済み支払いを振込完了にする
   * @param payoutId - 支払ID
   * @param options - オプション
   * @returns 結果
   */
  payConfirmedPayout: function(payoutId: string, options: { paid_date?: string; expectedUpdatedAt?: string } = {}): PayoutConfirmResult {
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

    const updateData: Partial<PayoutRecord> & Record<string, unknown> & { payout_id: string } = {
      payout_id: payoutId,
      status: 'paid' as PayoutStatus,
      paid_date: paidDate
    };
    if (current._archived) {
      updateData._archived = current._archived;
      updateData._archiveFiscalYear = current._archiveFiscalYear;
    }
    const result = PayoutRepository.update(updateData, options.expectedUpdatedAt);

    if (result.success) {
      // 監査ログ
      try {
        logUpdate('T_Payouts', payoutId, result.before, result.payout);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        Logger.log(`[payConfirmedPayout] Audit log error: ${msg}`);
      }

      return {
        success: true,
        payout: this._enrichPayout(result.payout!)
      };
    }

    return result as PayoutConfirmResult;
  },

  /**
   * 支払いを支払済として記録（直接paid - 後方互換）
   * @param staffId - スタッフID
   * @param endDate - 集計終了日
   * @param options - オプション
   * @returns 結果
   */
  markAsPaid: function(staffId: string, endDate: string, options: { adjustment_amount?: number; notes?: string; paid_date?: string } = {}): PayoutConfirmResult {
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
      staffId, calc.periodStart!, calc.periodEnd
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
      period_start: calc.periodStart!,
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
    this._linkAssignmentsToPayout(calc.assignments!, payout.payout_id);

    // 6. 監査ログ
    try {
      logCreate('T_Payouts', payout.payout_id, payout);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      Logger.log(`[markAsPaid] Audit log error: ${msg}`);
    }

    // スタッフ名を付与して返す
    return {
      success: true,
      payout: this._enrichPayout(payout)
    };
  },

  /**
   * 複数スタッフの支払いを一括確認
   * @param staffIds - スタッフID配列
   * @param endDate - 集計終了日
   * @param options - オプション
   * @returns バルク確認結果
   */
  bulkConfirmPayouts: function(staffIds: string[], endDate: string, options: { adjustments?: Record<string, { adjustment_amount?: number; notes?: string }>; preCalculatedData?: Record<string, PreCalculatedStaffData> | null } = {}): BulkConfirmResult {
    Logger.log(`[bulkConfirmPayouts] Starting bulk confirm for ${staffIds.length} staff`);

    const adjustments = options.adjustments || {};
    const preCalculatedData = options.preCalculatedData || null;
    const results: BulkConfirmResult['results'] = [];
    const payoutsToInsert: Partial<PayoutRecord>[] = [];
    const assignmentUpdates: { assignment_id: string; payout_id: string | null }[] = [];
    let success = 0;
    let failed = 0;

    // ★ 軽量モード: UIから事前計算済みデータが渡された場合、再計算をスキップ
    const useLightMode = preCalculatedData !== null;
    Logger.log(`[bulkConfirmPayouts] Mode: ${useLightMode ? 'LIGHT (skip recalculation)' : 'FULL (recalculate)'}`);

    const staffCalcMap = new Map<string, PayoutCalcResult>();

    if (useLightMode) {
      // ★ 軽量モード: preCalculatedDataをそのまま使用（シートI/Oなし）
      for (const staffId of staffIds) {
        const preCalc = preCalculatedData![staffId];
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
          staffCalcMap.set(staffId, { assignments: [], assignmentCount: 0, baseAmount: 0, transportAmount: 0, taxAmount: 0, totalAmount: 0, periodStart: null, periodEnd: endDate });
        }
      }
    } else {
      // ★ フルモード: 従来通り再計算（後方互換性のため残す）

      // 1. Jobデータを事前ロード
      const jobs = JobRepository.search({ work_date_to: endDate, sort_order: 'asc' });
      const jobMap = new Map(jobs.map(j => [j.job_id as string, j]));
      const jobIdSet = new Set(jobs.map(j => j.job_id as string));
      Logger.log(`[bulkConfirmPayouts] Preloaded ${jobs.length} jobs`);

      // 2. Payoutデータを事前ロード
      const allPayouts = PayoutRepository.search({
        payout_type: 'STAFF',
        status_in: ['confirmed', 'paid']
      });
      const lastPayoutMap = new Map<string, PayoutRecord>();
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
      const assignmentsByStaff = new Map<string, Record<string, unknown>[]>();
      for (const a of allAssignments) {
        const sid = a.staff_id as string;
        if (!assignmentsByStaff.has(sid)) {
          assignmentsByStaff.set(sid, []);
        }
        assignmentsByStaff.get(sid)!.push(a);
      }
      Logger.log(`[bulkConfirmPayouts] Preloaded ${allAssignments.length} assignments`);

      const bulkCache: BulkPayoutCache = { jobs, jobMap, jobIdSet, lastPayoutMap, assignmentsByStaff };

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
    const existingPayoutKeys = new Set<string>();
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
        period_start: calc.periodStart!,
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
      for (const assignment of calc.assignments!) {
        assignmentUpdates.push({
          assignment_id: assignment.assignment_id as string,
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
    let insertedPayouts: PayoutRecord[] = [];
    if (payoutsToInsert.length > 0) {
      insertedPayouts = PayoutRepository.insertBulk(payoutsToInsert);
      Logger.log(`[bulkConfirmPayouts] Inserted ${insertedPayouts.length} payouts`);
    }

    // 4. Assignment一括更新（失敗時はPayoutをdraftに戻す）
    let assignmentUpdateWarning: string | null = null;
    if (assignmentUpdates.length > 0) {
      try {
        const updateResult = AssignmentRepository.bulkUpdatePayoutId(assignmentUpdates);
        Logger.log(`[bulkConfirmPayouts] Updated ${updateResult.success} assignments`);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        Logger.log(`[bulkConfirmPayouts] Assignment update failed: ${msg}`);
        assignmentUpdateWarning = msg;

        // 挿入済みPayoutをdraftに戻す（リカバリ）
        for (const payout of insertedPayouts) {
          try {
            PayoutRepository.update({ payout_id: payout.payout_id, status: 'draft' });
          } catch (revertErr: unknown) {
            const revertMsg = revertErr instanceof Error ? revertErr.message : String(revertErr);
            Logger.log(`[bulkConfirmPayouts] Failed to revert payout ${payout.payout_id}: ${revertMsg}`);
          }
        }
      }
    }

    // 5. 監査ログ（一括 - 1回のシートI/O）
    try {
      const auditRecords = insertedPayouts.map(p => ({
        recordId: p.payout_id,
        data: p as unknown
      }));
      logCreateBulk('T_Payouts', auditRecords);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      Logger.log(`[bulkConfirmPayouts] Audit log error: ${msg}`);
    }

    // 6. スタッフ名を付与して返す（1回のシートI/O）
    const enrichedPayouts = this._enrichPayoutsBulk(insertedPayouts);

    // 7. データ同期を強制（読み取り競合防止）
    SpreadsheetApp.flush();

    const bulkResult: BulkConfirmResult = {
      success: success,
      failed: failed,
      skipped: skipped,  // ★ 重複スキップ数を追加
      results: results,
      payouts: enrichedPayouts
    };

    // Assignment更新失敗時は警告を付与
    if (assignmentUpdateWarning) {
      bulkResult.warning = 'Assignment更新に失敗しました。再実行してください: ' + assignmentUpdateWarning;
    }

    Logger.log(`[bulkConfirmPayouts] Completed: success=${success}, failed=${failed}, skipped=${skipped}`);

    return bulkResult;
  },

  /**
   * 複数の確認済み支払いを一括振込完了にする
   * @param payoutIds - 支払ID配列
   * @param options - オプション
   * @returns バルク更新結果
   */
  bulkPayConfirmed: function(payoutIds: string[], options: { paid_date?: string; expectedUpdatedAtMap?: Record<string, string> } = {}): BulkPayConfirmedResult {
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
        before: { status: 'confirmed' } as unknown,
        after: p as unknown
      }));
      logUpdateBulk('T_Payouts', auditRecords);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      Logger.log(`[bulkPayConfirmed] Audit log error: ${msg}`);
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
   * @param staffIds - スタッフID配列
   * @param endDate - 集計終了日
   * @param options - オプション
   * @returns バルク結果
   */
  bulkMarkAsPaid: function(staffIds: string[], endDate: string, options: { paid_date?: string; adjustments?: Record<string, { adjustment_amount?: number; notes?: string }> } = {}): BulkConfirmResult {
    const results: BulkConfirmResult['results'] = [];
    const payouts: (PayoutRecord & { target_name: string })[] = [];
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
      } as BulkConfirmResult['results'][number]);

      if (result.success) {
        success++;
        if (result.payout) {
          payouts.push(result.payout);
        }
      } else {
        failed++;
      }
    }

    return {
      success: success,
      failed: failed,
      results: results,
      payouts: payouts
    };
  },

  /**
   * 支払いを取得（スタッフ名付き）
   * @param payoutId - 支払ID
   * @returns 支払い詳細
   */
  get: function(payoutId: string): (PayoutRecord & { target_name: string }) | null {
    const payout = PayoutRepository.findById(payoutId);
    if (!payout) return null;

    return this._enrichPayout(payout);
  },

  /**
   * 支払いを検索（スタッフ名付き）
   * @param query - 検索条件
   * @returns 支払い配列
   */
  search: function(query: PayoutSearchQuery = {}): (PayoutRecord & { target_name: string })[] {
    const payouts = PayoutRepository.search(query);
    return this._enrichPayoutsBulk(payouts);
  },

  /**
   * 支払いを更新
   * @param payout - 更新データ
   * @param expectedUpdatedAt - 楽観ロック用
   * @returns 更新結果
   */
  update: function(payout: Partial<PayoutRecord> & { payout_id: string }, expectedUpdatedAt?: string): PayoutUpdateResult {
    return PayoutRepository.update(payout, expectedUpdatedAt);
  },

  /**
   * ステータスを更新
   * @param payoutId - 支払ID
   * @param status - 新ステータス（'confirmed' or 'paid'）
   * @param expectedUpdatedAt - 楽観ロック用
   * @returns 更新結果
   */
  updateStatus: function(payoutId: string, status: PayoutStatus, expectedUpdatedAt?: string): PayoutUpdateResult {
    const current = PayoutRepository.findById(payoutId);
    if (!current) {
      return { success: false, error: 'NOT_FOUND' };
    }

    // ステータス遷移の検証
    const validTransitions: Record<string, PayoutStatus[]> = {
      'confirmed': ['paid'],  // confirmed → paid
      'paid': []              // paidからは変更不可（undoPayoutを使用）
    };

    const allowedNext = validTransitions[current.status] || [];
    if (!allowedNext.includes(status)) {
      return {
        success: false,
        error: 'INVALID_STATUS'
      };
    }

    // アーカイブフラグ補完
    if (current._archived) {
      const updateData: Partial<PayoutRecord> & Record<string, unknown> & { payout_id: string } = {
        payout_id: payoutId,
        status: status,
        _archived: current._archived,
        _archiveFiscalYear: current._archiveFiscalYear
      };
      if (status === 'paid') {
        updateData.paid_date = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
      }
      return PayoutRepository.update(updateData, expectedUpdatedAt);
    }

    return PayoutRepository.updateStatus(payoutId, status, expectedUpdatedAt);
  },

  /**
   * 支払いを取り消し（未払い状態に戻す）
   * @param payoutId - 支払ID
   * @param expectedUpdatedAt - 楽観ロック用
   * @returns 取り消し結果
   */
  undoPayout: function(payoutId: string, expectedUpdatedAt?: string): PayoutUpdateResult & { undone?: PayoutRecord & { target_name: string } } {
    const current = PayoutRepository.findById(payoutId);
    if (!current) {
      return { success: false, error: 'NOT_FOUND' };
    }

    // 1. 関連Assignmentのpayout_idをクリア
    this._unlinkAssignmentsFromPayout(payoutId);

    // 2. 論理削除で取り消し
    const result = PayoutRepository.softDelete(payoutId, expectedUpdatedAt) as PayoutUpdateResult & { undone?: PayoutRecord & { target_name: string } };

    // 3. 監査ログ
    if (result.success) {
      try {
        logDelete('T_Payouts', payoutId, current);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        Logger.log(`[undoPayout] Audit log error: ${msg}`);
      }

      // 4. 取り消し後の情報を付与（差分リロード用）
      result.undone = this._enrichPayout(current);
    }

    return result;
  },

  /**
   * 支払いを削除（undoPayoutのエイリアス）
   * @param payoutId - 支払ID
   * @param expectedUpdatedAt - 楽観ロック用
   * @returns 削除結果
   */
  delete: function(payoutId: string, expectedUpdatedAt?: string): PayoutUpdateResult & { undone?: PayoutRecord & { target_name: string } } {
    return this.undoPayout(payoutId, expectedUpdatedAt);
  },

  /**
   * スタッフの支払い履歴を取得
   * @param staffId - スタッフID
   * @param options - オプション
   * @returns 支払い履歴
   */
  getHistory: function(staffId: string, options: { limit?: number } = {}): (PayoutRecord & { target_name: string })[] {
    const payouts = PayoutRepository.findByStaffId(staffId, options);
    return this._enrichPayoutsBulk(payouts);
  },

  /**
   * 確認済み支払いを取得
   * @param options - オプション
   * @returns confirmed状態の支払い一覧
   */
  getConfirmedPayouts: function(options: { payout_type?: PayoutType } = {}): (PayoutRecord & { target_name: string })[] {
    const query: PayoutSearchQuery = {
      ...options,
      status: 'confirmed',
      payout_type: options.payout_type || 'STAFF'
    };
    return this.search(query);
  },

  /**
   * 指定期間終了日の確認済みPayoutを取得（集計画面の状態復元用）
   * @param endDate - 期間終了日
   * @returns 確認済みPayout一覧（スタッフ名付き）
   */
  getConfirmedPayoutsForPeriod: function(endDate: string): (PayoutRecord & { target_name: string })[] {
    const payouts = PayoutRepository.search({
      payout_type: 'STAFF',
      status: 'confirmed'
    }).filter(p => p.period_end === endDate);

    return this._enrichPayoutsBulk(payouts);
  },

  /**
   * 期間内の支払済みレコードを取得（エクスポート用）
   * @param fromDate - 開始日（YYYY-MM-DD）
   * @param toDate - 終了日（YYYY-MM-DD）
   * @returns スタッフ/外注先名を付与した支払い配列
   */
  getPayoutReport: function(fromDate: string, toDate: string): (PayoutRecord & { target_name: string })[] {
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
   * @param endDate - 集計終了日
   * @param options - オプション
   * @returns 未払いスタッフ一覧
   */
  getUnpaidStaffList: function(endDate: string, options: { staffId?: string } = {}): UnpaidStaffItem[] {
    // 1. 全データを一括取得（外注スタッフは除外 - 外注費管理タブで別途管理）
    let staffList = StaffRepository.search({ is_active: true })
      .filter(s => s.staff_type !== 'subcontract');

    // 特定スタッフ指定時はフィルタ
    if (options.staffId) {
      staffList = staffList.filter(s => s.staff_id === options.staffId);
    }

    if (staffList.length === 0) return [];

    const staffMap = new Map(staffList.map(s => [s.staff_id as string, s]));

    // 2. 対象期間のJobを一括取得
    const jobs = JobRepository.search({ work_date_to: endDate, sort_order: 'asc' });
    if (jobs.length === 0) return [];

    const jobMap = new Map(jobs.map(j => [j.job_id as string, j]));
    const jobIds = new Set(jobs.map(j => j.job_id as string));

    // 3. 全Assignmentsを一括取得（ASSIGNEDかつpayout_id未設定のみ）
    const allAssignments = AssignmentRepository.search({ status: 'ASSIGNED' })
      .filter(a => !a.payout_id);  // 二重計上防止

    // 4. 支払済み/確認済みPayoutsを取得
    const allPayouts = PayoutRepository.search({
      payout_type: 'STAFF',
      status_in: ['confirmed', 'paid']
    });

    // 最新Payoutをスタッフごとにマップ（paid_date優先）
    const lastPayoutMap = new Map<string, PayoutRecord>();
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
    const results: UnpaidStaffItem[] = [];

    for (const staff of staffList) {
      const staffId = staff.staff_id as string;
      const lastPayout = lastPayoutMap.get(staffId);
      const startDate = lastPayout ? this._addDays(lastPayout.period_end, 1) : null;

      // このスタッフの対象Assignmentsをフィルタ
      const staffAssignments = allAssignments.filter(a => {
        if (a.staff_id !== staffId) return false;
        if (!jobIds.has(a.job_id as string)) return false;

        const job = jobMap.get(a.job_id as string);
        if (!job) return false;

        // 開始日チェック
        if (startDate && (job.work_date as string) < startDate) return false;

        return true;
      });

      if (staffAssignments.length === 0) continue;

      // Job情報を付与
      const assignmentsWithJob = staffAssignments.map(a => {
        const job = jobMap.get(a.job_id as string);
        return { ...a, work_date: (job?.work_date as string) || '' };
      }).sort((a, b) => ((a.work_date as string) || '').localeCompare((b.work_date as string) || ''));

      // 金額計算
      const calcResult = calculateMonthlyPayout_(assignmentsWithJob, staff);

      // 源泉徴収税を計算
      const taxAmount = this._calculateWithholdingTax(staff, calcResult.baseAmount);

      const dates = assignmentsWithJob.map(a => a.work_date as string).filter(d => d);
      const periodStart = dates.length > 0 ? dates[0] : endDate;

      results.push({
        staffId: staffId,
        staffName: staff.name as string,
        unpaidCount: staffAssignments.length,
        baseAmount: calcResult.baseAmount,
        transportAmount: calcResult.transportAmount,
        estimatedAmount: calcResult.totalAmount - taxAmount,
        taxAmount: taxAmount,
        periodStart: periodStart,
        periodEnd: endDate,
        // ★ bulkConfirmPayoutsで再計算をスキップするためのデータ
        assignmentIds: staffAssignments.map(a => a.assignment_id as string)
      });
    }

    // 金額降順でソート
    return results.sort((a, b) => b.estimatedAmount - a.estimatedAmount);
  },

  /**
   * 未払スタッフリストの差分を取得（SWR差分更新用）
   * @param endDate - 集計終了日
   * @param lastSyncTimestamp - 前回同期時刻（ISO形式）
   * @returns 差分データ
   */
  getUnpaidStaffListDelta: function(endDate: string, lastSyncTimestamp: string): { changedStaffIds: string[]; removedStaffIds: string[]; staffList: UnpaidStaffItem[] } {
    Logger.log(`[getUnpaidStaffListDelta] endDate=${endDate}, lastSync=${lastSyncTimestamp}`);

    // 1. lastSyncTimestamp以降に更新されたAssignmentを取得
    const allAssignments = AssignmentRepository.search({ status: 'ASSIGNED' });
    const changedAssignments = allAssignments.filter(a =>
      a.updated_at && (a.updated_at as string) > lastSyncTimestamp
    );

    // 2. 変更があったスタッフIDを抽出
    const changedStaffIdSet = new Set(changedAssignments.map(a => a.staff_id as string).filter(Boolean));

    // 3. lastSyncTimestamp以降に作成/更新されたPayoutも確認
    const recentPayouts = PayoutRepository.search({
      payout_type: 'STAFF',
      status_in: ['confirmed', 'paid']
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
   * @param staffId - スタッフID
   * @param endDate - 集計終了日
   * @param bulkCache - バルクキャッシュ
   * @returns 計算結果
   */
  _calculatePayoutWithBulkCache: function(staffId: string, endDate: string, bulkCache: BulkPayoutCache): PayoutCalcResult {
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
    const staff = allStaff.find(s => s.staff_id === staffId) || null;

    // 金額計算
    const result = calculateMonthlyPayout_(assignments, staff);

    // 源泉徴収税を計算（STAFFで withholding_tax_applicable の場合のみ）
    const taxAmount = this._calculateWithholdingTax(staff, result.baseAmount);

    // 期間を算出
    const dates = assignments.map(a => a.work_date as string).filter(d => d);
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
   * @param staffId - スタッフID
   * @param endDate - 集計終了日
   * @param bulkCache - バルクキャッシュ
   * @returns 未払い配置リスト（Job情報含む）
   */
  _getUnpaidAssignmentsWithBulkCache: function(staffId: string, endDate: string, bulkCache: BulkPayoutCache): Record<string, unknown>[] {
    const { jobs, jobMap, jobIdSet, lastPayoutMap, assignmentsByStaff } = bulkCache;

    // 1. 最後の支払いをキャッシュから取得（シートI/Oなし）
    const lastPayout = lastPayoutMap.get(staffId);
    const startDate = lastPayout ? this._addDays(lastPayout.period_end, 1) : null;

    // 2. 期間フィルタ用のJobIdSetを作成
    let filteredJobIdSet = jobIdSet;
    if (startDate) {
      filteredJobIdSet = new Set(
        jobs.filter(j => (j.work_date as string) >= startDate).map(j => j.job_id as string)
      );
    }

    if (filteredJobIdSet.size === 0) {
      return [];
    }

    // 3. スタッフの配置をキャッシュから取得（シートI/Oなし）
    const staffAssignments = assignmentsByStaff.get(staffId) || [];

    // 4. 該当Job内の配置をフィルタリング（Set.has()でO(1)）
    const unpaidAssignments = staffAssignments.filter(a =>
      filteredJobIdSet.has(a.job_id as string)
    );

    // 5. Job情報を付与して返す
    return unpaidAssignments.map(a => {
      const job = jobMap.get(a.job_id as string);
      return {
        ...a,
        work_date: job ? job.work_date : '',
        site_name: job ? job.site_name : '',
        customer_id: job ? job.customer_id : ''
      };
    }).sort((a, b) => ((a.work_date as string) || '').localeCompare((b.work_date as string) || ''));
  },

  /**
   * 対象AssignmentsにPayoutIDを紐付け（二重計上防止）
   * @param assignments - 配置リスト
   * @param payoutId - 支払ID
   */
  _linkAssignmentsToPayout: function(assignments: Record<string, unknown>[], payoutId: string): void {
    if (!assignments || assignments.length === 0) {
      return;
    }

    const updates = assignments.map(a => ({
      assignment_id: a.assignment_id as string,
      payout_id: payoutId as string | null
    }));

    try {
      const result = AssignmentRepository.bulkUpdatePayoutId(updates);
      Logger.log(`[_linkAssignmentsToPayout] Updated ${result.success} assignments with payout_id: ${payoutId}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      Logger.log(`[_linkAssignmentsToPayout] Error: ${msg}`);
    }
  },

  /**
   * PayoutIDに紐付いたAssignmentsのpayout_idをクリア（バルク処理版）
   * @param payoutId - 支払ID
   */
  _unlinkAssignmentsFromPayout: function(payoutId: string): void {
    // payout_idで関連するAssignmentsを検索
    const allAssignments = AssignmentRepository.search({ status: 'ASSIGNED' });
    const linkedAssignments = allAssignments.filter(a => a.payout_id === payoutId);

    if (linkedAssignments.length === 0) {
      return;
    }

    // バルク更新用のデータを作成
    const updates = linkedAssignments.map(a => ({
      assignment_id: a.assignment_id as string,
      payout_id: '' as string | null
    }));

    try {
      // 一括でpayout_idをクリア
      AssignmentRepository.bulkUpdatePayoutId(updates);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      Logger.log(`[_unlinkAssignmentsFromPayout] Bulk update error: ${msg}`);
    }
  },

  /**
   * 源泉徴収税を計算
   * @param staff - スタッフ情報
   * @param baseAmount - 基本給
   * @returns 源泉徴収税額
   */
  _calculateWithholdingTax: function(staff: Record<string, unknown> | null, baseAmount: number): number {
    if (!staff) return 0;

    // withholding_tax_applicable が true の場合のみ源泉徴収
    if (!staff.withholding_tax_applicable) return 0;

    // 源泉徴収税率 10.21%（復興特別所得税込み）
    const WITHHOLDING_TAX_RATE = 0.1021;
    return Math.floor(baseAmount * WITHHOLDING_TAX_RATE);
  },

  /**
   * 支払いにスタッフ/外注先名を付与
   * @param payout - 支払いデータ
   * @returns 名前付き支払いデータ
   */
  _enrichPayout: function(payout: PayoutRecord): PayoutRecord & { target_name: string } {
    let targetName = '';

    if (payout.payout_type === 'STAFF' && payout.staff_id) {
      const staff = StaffRepository.findById(payout.staff_id);
      targetName = staff ? (staff.name as string) : '(不明)';
    } else if (payout.payout_type === 'SUBCONTRACTOR' && payout.subcontractor_id) {
      const sub = SubcontractorRepository.findById(payout.subcontractor_id);
      targetName = sub ? (sub.company_name as string) : '(不明)';
    }

    return {
      ...payout,
      target_name: targetName
    };
  },

  /**
   * 支払いにスタッフ/外注先名を一括付与（バルク版）
   * @param payouts - 支払いデータ配列
   * @returns 名前付き支払いデータ配列
   */
  _enrichPayoutsBulk: function(payouts: PayoutRecord[]): (PayoutRecord & { target_name: string })[] {
    if (!payouts || payouts.length === 0) {
      return [];
    }

    // IDを収集
    const staffIds: string[] = [];
    const subIds: string[] = [];
    for (const p of payouts) {
      if (p.payout_type === 'STAFF' && p.staff_id) {
        staffIds.push(p.staff_id);
      } else if (p.payout_type === 'SUBCONTRACTOR' && p.subcontractor_id) {
        subIds.push(p.subcontractor_id);
      }
    }

    // 1回のシートI/Oで一括取得
    const staffMap = staffIds.length > 0 ? StaffRepository.findByIds(staffIds) : new Map<string, Record<string, unknown>>();
    const subMap = subIds.length > 0 ? SubcontractorRepository.findByIds(subIds) : new Map<string, Record<string, unknown>>();

    // 名前を付与
    return payouts.map(p => {
      let targetName = '';
      if (p.payout_type === 'STAFF' && p.staff_id) {
        const staff = staffMap.get(p.staff_id);
        targetName = staff ? (staff.name as string) : '(不明)';
      } else if (p.payout_type === 'SUBCONTRACTOR' && p.subcontractor_id) {
        const sub = subMap.get(p.subcontractor_id);
        targetName = sub ? (sub.company_name as string) : '(不明)';
      }
      return { ...p, target_name: targetName };
    });
  },

  /**
   * 日付文字列をローカルタイムゾーンでパース（UTC解釈回避）
   * @param dateStr - 日付文字列（YYYY-MM-DD形式）
   * @returns パースされた日付またはnull
   */
  _parseLocalDate: function(dateStr: string | null | undefined): Date | null {
    if (!dateStr) return null;

    const normalized = String(dateStr).replace(/\//g, '-');
    const parts = normalized.split('-');
    if (parts.length !== 3) return new Date(dateStr); // フォールバック

    const [y, m, d] = parts.map(Number);
    return new Date(y, m - 1, d); // ローカルタイムゾーンで作成
  },

  /**
   * 日付に日数を加算
   * @param dateStr - 日付（YYYY-MM-DD）
   * @param days - 加算日数
   * @returns 加算後の日付
   */
  _addDays: function(dateStr: string | null | undefined, days: number): string | null {
    if (!dateStr) return null;
    const date = this._parseLocalDate(dateStr);
    if (!date) return null;
    date.setDate(date.getDate() + days);
    return Utilities.formatDate(date, 'Asia/Tokyo', 'yyyy-MM-dd');
  },

  // ========== Subcontractor Payout Methods (P2-8) ==========

  /**
   * 外注先の未払い配置を取得
   * @param subcontractorId - 外注先ID
   * @param endDate - 集計終了日（YYYY-MM-DD）
   * @returns 未払い配置リスト（Job情報含む）
   */
  getUnpaidAssignmentsForSubcontractor: function(subcontractorId: string, endDate: string): Record<string, unknown>[] {
    // 1. 最後の支払いを取得
    const lastPayout = PayoutRepository.findLastPayoutForSubcontractor(subcontractorId);
    const startDate = lastPayout ? this._addDays(lastPayout.period_end, 1) : null;
    Logger.log(`[getUnpaidAssignmentsForSubcontractor] subcontractorId=${subcontractorId}, endDate=${endDate}, lastPayout period_end=${lastPayout?.period_end}, startDate=${startDate}`);

    // 2. 該当期間のJobを取得
    const jobQuery: Record<string, unknown> = {
      work_date_to: endDate,
      sort_order: 'asc'
    };
    if (startDate) {
      jobQuery.work_date_from = startDate;
    }
    const jobs = JobRepository.search(jobQuery);
    const jobMap = new Map(jobs.map(j => [j.job_id as string, j]));
    const jobIdSet = new Set(jobs.map(j => j.job_id as string));

    if (jobIdSet.size === 0) {
      return [];
    }

    // 3. 外注先に紐づくスタッフを取得
    const subcontractorStaff = StaffRepository.search({
      subcontractor_id: subcontractorId,
      staff_type: 'subcontract'
    });
    const staffIdSet = new Set(subcontractorStaff.map(s => s.staff_id as string));
    const staffMap = new Map(subcontractorStaff.map(s => [s.staff_id as string, s]));
    Logger.log(`[getUnpaidAssignmentsForSubcontractor] Found ${staffIdSet.size} staff for subcontractor`);

    if (staffIdSet.size === 0) {
      return [];
    }

    // 4. 外注スタッフの配置を取得（payout_id未設定のみ）
    const allAssignments = AssignmentRepository.search({ status: 'ASSIGNED' });
    const unpaidAssignments = allAssignments.filter(a =>
      !a.is_deleted &&
      !a.payout_id &&
      staffIdSet.has(a.staff_id as string) &&
      jobIdSet.has(a.job_id as string)
    );
    Logger.log(`[getUnpaidAssignmentsForSubcontractor] unpaidAssignments: ${unpaidAssignments.length}`);

    // 5. Job情報とスタッフ情報を付与して返す
    return unpaidAssignments.map(a => {
      const job = jobMap.get(a.job_id as string);
      const staff = staffMap.get(a.staff_id as string);
      return {
        ...a,
        work_date: job ? job.work_date : '',
        site_name: job ? job.site_name : '',
        customer_id: job ? job.customer_id : '',
        staff_name: staff ? staff.name : ''
      };
    }).sort((a, b) => ((a.work_date as string) || '').localeCompare((b.work_date as string) || ''));
  },

  /**
   * 外注費を計算（プレビュー用）
   * @param subcontractorId - 外注先ID
   * @param endDate - 集計終了日
   * @returns 計算結果
   */
  calculatePayoutForSubcontractor: function(subcontractorId: string, endDate: string): PayoutCalcResult {
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
      const rate = (asg.wage_rate as number) || 0;
      baseAmount += rate;
      transportAmount += (asg.transport_amount as number) || 0;
    }

    const totalAmount = baseAmount + transportAmount;

    // 期間を算出
    const dates = assignments.map(a => a.work_date as string).filter(d => d);
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
   * @param subcontractorId - 外注先ID
   * @param endDate - 集計終了日
   * @param options - オプション
   * @returns 結果
   */
  confirmPayoutForSubcontractor: function(subcontractorId: string, endDate: string, options: { adjustment_amount?: number; notes?: string } = {}): PayoutConfirmResult {
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
      period_start: calc.periodStart!,
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
    this._linkAssignmentsToPayout(calc.assignments as Record<string, unknown>[], payout.payout_id);

    try {
      logCreate('T_Payouts', payout.payout_id, payout);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      Logger.log(`[confirmPayoutForSubcontractor] Audit log error: ${msg}`);
    }

    return {
      success: true,
      payout: this._enrichPayout(payout)
    };
  },

  /**
   * 外注費を支払済として記録
   * @param subcontractorId - 外注先ID
   * @param endDate - 集計終了日
   * @param options - オプション
   * @returns 結果
   */
  markAsPaidForSubcontractor: function(subcontractorId: string, endDate: string, options: { adjustment_amount?: number; notes?: string; paid_date?: string } = {}): PayoutConfirmResult {
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
      period_start: calc.periodStart!,
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

    this._linkAssignmentsToPayout(calc.assignments as Record<string, unknown>[], payout.payout_id);

    try {
      logCreate('T_Payouts', payout.payout_id, payout);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      Logger.log(`[markAsPaidForSubcontractor] Audit log error: ${msg}`);
    }

    return {
      success: true,
      payout: this._enrichPayout(payout)
    };
  },

  /**
   * 未払いがある外注先一覧を取得
   * @param endDate - 集計終了日
   * @returns 外注先ごとの未払い情報
   */
  getUnpaidSubcontractorList: function(endDate: string): { subcontractorId: string; companyName: string; unpaidCount: number; estimatedAmount: number; baseAmount: number; transportAmount: number; periodStart: string; periodEnd: string }[] {
    // 1. アクティブな外注先一覧を取得
    const subcontractors = SubcontractorRepository.search({ is_active: true });
    if (subcontractors.length === 0) return [];

    // 2. 対象期間のJobを一括取得
    const jobs = JobRepository.search({ work_date_to: endDate, sort_order: 'asc' });
    if (jobs.length === 0) return [];

    const jobMap = new Map(jobs.map(j => [j.job_id as string, j]));
    const jobIdSet = new Set(jobs.map(j => j.job_id as string));

    // 3. 外注スタッフ一覧を取得 & subcontractor_idでグループ化
    const allSubcontractStaff = StaffRepository.search({ staff_type: 'subcontract' });
    const staffBySubcontractor = new Map<string, Record<string, unknown>[]>();
    const staffToSubcontractor = new Map<string, string>(); // staff_id -> subcontractor_id
    for (const staff of allSubcontractStaff) {
      if (!staff.subcontractor_id) continue;
      const subId = staff.subcontractor_id as string;
      if (!staffBySubcontractor.has(subId)) {
        staffBySubcontractor.set(subId, []);
      }
      staffBySubcontractor.get(subId)!.push(staff);
      staffToSubcontractor.set(staff.staff_id as string, subId);
    }

    // 4. 全Assignmentsを一括取得 & staff_idでグループ化（O(A)で1回のみ）
    const rawAssignments = AssignmentRepository.search({ status: 'ASSIGNED' });
    const assignmentsByStaff = new Map<string, Record<string, unknown>[]>();
    for (const a of rawAssignments) {
      if (a.payout_id || a.is_deleted) continue;
      const sid = a.staff_id as string;
      if (!staffToSubcontractor.has(sid)) continue; // 外注スタッフのみ
      if (!assignmentsByStaff.has(sid)) {
        assignmentsByStaff.set(sid, []);
      }
      assignmentsByStaff.get(sid)!.push(a);
    }

    // 5. 支払済み/確認済みPayoutsを取得 & 外注先ごとに最新をマップ
    const allPayouts = PayoutRepository.search({
      payout_type: 'SUBCONTRACTOR',
      status_in: ['confirmed', 'paid']
    });

    const lastPayoutMap = new Map<string, PayoutRecord>();
    for (const p of allPayouts) {
      if (!p.subcontractor_id) continue;
      const existing = lastPayoutMap.get(p.subcontractor_id);
      if (!existing || p.period_end > existing.period_end) {
        lastPayoutMap.set(p.subcontractor_id, p);
      }
    }

    // 6. 外注先ごとに未払い配置を集計（O(S * staffPerSub * assignmentsPerStaff)）
    const results: { subcontractorId: string; companyName: string; unpaidCount: number; estimatedAmount: number; baseAmount: number; transportAmount: number; periodStart: string; periodEnd: string }[] = [];

    for (const sub of subcontractors) {
      const subId = sub.subcontractor_id as string;
      const staffList = staffBySubcontractor.get(subId) || [];
      if (staffList.length === 0) continue;

      const lastPayout = lastPayoutMap.get(subId);
      const startDate = lastPayout ? this._addDays(lastPayout.period_end, 1) : null;

      // スタッフごとの配置を集約
      const subAssignments: { assignment: Record<string, unknown>; job: Record<string, unknown> }[] = [];
      for (const staff of staffList) {
        const staffAssignments = assignmentsByStaff.get(staff.staff_id as string) || [];
        for (const a of staffAssignments) {
          if (!jobIdSet.has(a.job_id as string)) continue;
          const job = jobMap.get(a.job_id as string);
          if (!job) continue;
          if (startDate && (job.work_date as string) < startDate) continue;
          subAssignments.push({ assignment: a, job });
        }
      }

      if (subAssignments.length === 0) continue;

      // 金額計算
      let baseAmount = 0;
      let transportAmount = 0;
      let minDate = endDate;
      for (const { assignment: asg, job } of subAssignments) {
        baseAmount += (asg.wage_rate as number) || 0;
        transportAmount += (asg.transport_amount as number) || 0;
        if (job.work_date && (job.work_date as string) < minDate) {
          minDate = job.work_date as string;
        }
      }

      results.push({
        subcontractorId: subId,
        companyName: sub.company_name as string,
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
   * @param subcontractorId - 外注先ID
   * @param options - オプション
   * @returns 支払い履歴
   */
  getSubcontractorHistory: function(subcontractorId: string, options: { limit?: number } = {}): (PayoutRecord & { target_name: string })[] {
    const payouts = PayoutRepository.findBySubcontractorId(subcontractorId, options);
    return this._enrichPayoutsBulk(payouts);
  }
};
