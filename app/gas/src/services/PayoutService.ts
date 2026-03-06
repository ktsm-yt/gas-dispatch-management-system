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
  ninkuCoefficient: number;
  ninkuAdjustmentAmount: number;
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
  jobs: JobRecord[];
  jobMap: Map<string, JobRecord>;
  jobIdSet: Set<string>;
  lastPayoutMap: Map<string, PayoutRecord>;
  assignmentsByStaff: Map<string, Record<string, unknown>[]>;
  assignmentCountByJob?: Map<string, number>;  // 人工割: job_idごとの全ASSIGNED配置数
}

interface PreCalculatedStaffData {
  assignmentIds: string[];
  baseAmount: number;
  transportAmount: number;
  ninkuCoefficient: number;
  ninkuAdjustmentAmount: number;
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
    const jobIdSet = new Set(jobs.map(j => j.job_id as string));
    Logger.log(`[getUnpaidAssignments] jobs found: ${jobs.length}, jobQuery=${JSON.stringify(jobQuery)}`);

    if (jobIdSet.size === 0) {
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
      jobIdSet.has(a.job_id as string)
    );
    Logger.log(`[getUnpaidAssignments] unpaidAssignments after filter: ${unpaidAssignments.length}`);

    // 5. Job情報+計算済み賃金+人工割反映後単価を付与して返す
    const assignmentCountByJob = this._buildAssignmentCountByJob(jobIdSet);

    // スタッフ情報を取得（calculateWage_に必要）
    const allStaff = MasterCache.getStaff();
    const staff = allStaff.find(s => s.staff_id === staffId) || {};

    return unpaidAssignments.map(a => {
      const job = jobMap.get(a.job_id as string);
      const payUnit = resolveEffectiveUnit_(a.pay_unit as string, job);

      // calculateWage_で正確な賃金を計算（マスタ解決含む）
      const calculatedWage = calculateWage_(a as any, staff as any, payUnit);

      // 人工割反映後の単価
      const requiredCount = job ? Number(job.required_count) || 0 : 0;
      const actualCount = assignmentCountByJob.get(a.job_id as string) || 0;
      const coefficient = calculateNinkuCoefficient_(requiredCount, actualCount);
      const adjustedWage = coefficient !== 1.0
        ? applyRounding_(calculatedWage * coefficient, RoundingMode.FLOOR)
        : calculatedWage;

      return {
        ...a,
        work_date: job ? job.work_date : '',
        site_name: job ? job.site_name : '',
        customer_id: job ? job.customer_id : '',
        calculated_wage: adjustedWage
      };
    }).sort((a, b) => {
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
        ninkuCoefficient: 0,
        ninkuAdjustmentAmount: 0,
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

    // 人工割計算（CR-029）
    const jobIds = new Set(assignments.map(a => a.job_id as string).filter(Boolean));
    const jobs = JobRepository.search({ work_date_to: endDate, sort_order: 'asc' });
    const jobMap = new Map(jobs.map(j => [j.job_id as string, j]));
    const assignmentCountByJob = this._buildAssignmentCountByJob(jobIds);
    const ninku = this._calculateNinkuAdjustments(assignments, staff, jobMap, assignmentCountByJob);

    // 交通費は請求書のみに反映。スタッフ支払いには含めない（調整額で別途対応）
    const adjustedTransport = 0;

    // 源泉徴収税を計算（配置単位で個別テーブル参照 → 月合計）
    const taxAmount = this._calculateWithholdingTaxTotal(assignments, staff, jobMap, assignmentCountByJob);

    // 期間を算出
    const dates = assignments.map(a => a.work_date as string).filter(d => d);
    const periodStart = dates.length > 0 ? dates[0] : endDate;
    const periodEnd = endDate;

    return {
      assignments: includeAssignments ? assignments : null,
      assignmentCount: assignments.length,
      baseAmount: result.baseAmount,
      transportAmount: 0,  // 交通費除外
      ninkuCoefficient: ninku.avgCoefficient,
      ninkuAdjustmentAmount: ninku.totalAdjustment,
      taxAmount: taxAmount,
      totalAmount: result.baseAmount + ninku.totalAdjustment - taxAmount,
      periodStart: periodStart,
      periodEnd: periodEnd
    };
  },

  /**
   * 調整額・備考を下書き保存（Assignmentへの紐付けなし）
   * 既存draftがあればupdate、なければinsert
   */
  saveDraft: function(staffId: string, endDate: string, options: { adjustment_amount?: number; notes?: string; expectedUpdatedAt?: string } = {}): { success: boolean; payout?: PayoutRecord & { target_name: string }; error?: string } {
    Logger.log(`[saveDraft] staffId=${staffId}, endDate=${endDate}, options=${JSON.stringify(options)}`);

    // 金額計算（プレビュー用の計算結果を取得）
    const calc = this.calculatePayout(staffId, endDate, { include_assignments: false });
    const adjustmentAmount = options.adjustment_amount || 0;
    const totalAmount = calc.totalAmount + adjustmentAmount;

    // 既存draftを検索（締日不問 — 調整額を引き継ぐため）
    const existingDraft = PayoutRepository.findDraftByStaff(staffId);

    if (existingDraft) {
      // 既存draftを更新
      const result = PayoutRepository.update({
        payout_id: existingDraft.payout_id,
        period_start: calc.periodStart || existingDraft.period_start,
        period_end: endDate,
        assignment_count: calc.assignmentCount,
        base_amount: calc.baseAmount,
        transport_amount: calc.transportAmount,
        adjustment_amount: adjustmentAmount,
        ninku_coefficient: calc.ninkuCoefficient,
        ninku_adjustment_amount: calc.ninkuAdjustmentAmount,
        tax_amount: calc.taxAmount,
        total_amount: totalAmount,
        notes: options.notes || ''
      }, options.expectedUpdatedAt);

      if (!result.success) {
        return { success: false, error: result.error || 'UPDATE_FAILED' };
      }

      return { success: true, payout: this._enrichPayout(result.payout!) };
    }

    // 新規draft作成
    const payout = PayoutRepository.insert({
      payout_type: 'STAFF',
      staff_id: staffId,
      period_start: calc.periodStart || endDate,
      period_end: endDate,
      assignment_count: calc.assignmentCount,
      base_amount: calc.baseAmount,
      transport_amount: calc.transportAmount,
      adjustment_amount: adjustmentAmount,
      ninku_coefficient: calc.ninkuCoefficient,
      ninku_adjustment_amount: calc.ninkuAdjustmentAmount,
      tax_amount: calc.taxAmount,
      total_amount: totalAmount,
      status: 'draft',
      notes: options.notes || ''
    });

    try {
      logCreate('T_Payouts', payout.payout_id, payout);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      Logger.log(`[saveDraft] Audit log error: ${msg}`);
    }

    return { success: true, payout: this._enrichPayout(payout) };
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
    const nonDrafts = existingPayouts.filter(p => p.status !== 'draft');
    const drafts = existingPayouts.filter(p => p.status === 'draft');

    if (nonDrafts.length > 0) {
      Logger.log(`[confirmPayout] SKIP duplicate: ${staffId}|${calc.periodStart}|${calc.periodEnd}`);
      return {
        success: true,  // 冪等性：既存があれば成功扱い
        skipped: true,
        existingPayout: this._enrichPayout(nonDrafts[0]),
        message: `この期間（${calc.periodStart}〜${calc.periodEnd}）の支払いは既に存在します`
      };
    }

    // 2. 調整額を適用
    const adjustmentAmount = options.adjustment_amount || 0;
    const totalAmount = calc.totalAmount + adjustmentAmount;

    // 3. 支払いレコード作成（draftがあればアップグレード、なければ新規挿入）
    let payout: PayoutRecord;
    if (drafts.length > 0) {
      // Draft → confirmed アップグレード
      const draft = drafts[0];
      Logger.log(`[confirmPayout] Upgrading draft ${draft.payout_id} to confirmed`);
      const updateResult = PayoutRepository.update({
        payout_id: draft.payout_id,
        period_start: calc.periodStart!,
        period_end: calc.periodEnd,
        assignment_count: calc.assignmentCount,
        base_amount: calc.baseAmount,
        transport_amount: calc.transportAmount,
        adjustment_amount: adjustmentAmount,
        ninku_coefficient: calc.ninkuCoefficient,
        ninku_adjustment_amount: calc.ninkuAdjustmentAmount,
        tax_amount: calc.taxAmount,
        total_amount: totalAmount,
        status: 'confirmed' as PayoutStatus,
        paid_date: '',
        notes: options.notes ?? draft.notes ?? ''
      });
      if (!updateResult.success) {
        return { success: false, error: updateResult.error || 'DRAFT_UPGRADE_FAILED', message: 'Draft→Confirmed更新に失敗しました' };
      }
      payout = updateResult.payout!;
    } else {
      payout = PayoutRepository.insert({
        payout_type: 'STAFF',
        staff_id: staffId,
        period_start: calc.periodStart!,
        period_end: calc.periodEnd,
        assignment_count: calc.assignmentCount,
        base_amount: calc.baseAmount,
        transport_amount: calc.transportAmount,
        adjustment_amount: adjustmentAmount,
        ninku_coefficient: calc.ninkuCoefficient,
        ninku_adjustment_amount: calc.ninkuAdjustmentAmount,
        tax_amount: calc.taxAmount,
        total_amount: totalAmount,
        status: 'confirmed',  // confirmed状態
        paid_date: '',
        notes: options.notes || ''
      });
    }

    // 4. 対象Assignmentにpayout_idを設定（二重計上防止）
    const linked = this._linkAssignmentsToPayout(calc.assignments!, payout.payout_id);
    if (!linked) {
      try {
        PayoutRepository.softDelete(payout.payout_id, payout.updated_at);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        Logger.log(`[confirmPayout] Rollback failed: ${msg}`);
      }
      return {
        success: false,
        error: 'ASSIGNMENT_LINK_FAILED',
        message: '配置データの紐付けに失敗しました'
      };
    }

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
    const linked = this._linkAssignmentsToPayout(calc.assignments!, payout.payout_id);
    if (!linked) {
      try {
        PayoutRepository.softDelete(payout.payout_id, payout.updated_at);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        Logger.log(`[markAsPaid] Rollback failed: ${msg}`);
      }
      return {
        success: false,
        error: 'ASSIGNMENT_LINK_FAILED',
        message: '配置データの紐付けに失敗しました'
      };
    }

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
            transportAmount: 0,  // 交通費除外（クライアント由来の値を信用しない）
            ninkuCoefficient: preCalc.ninkuCoefficient || 0,
            ninkuAdjustmentAmount: preCalc.ninkuAdjustmentAmount || 0,
            taxAmount: preCalc.taxAmount || 0,
            totalAmount: preCalc.estimatedAmount + (preCalc.taxAmount || 0),  // 税引き前に戻す
            periodStart: preCalc.periodStart,
            periodEnd: preCalc.periodEnd || endDate
          });
        } else {
          staffCalcMap.set(staffId, { assignments: [], assignmentCount: 0, baseAmount: 0, transportAmount: 0, ninkuCoefficient: 0, ninkuAdjustmentAmount: 0, taxAmount: 0, totalAmount: 0, periodStart: null, periodEnd: endDate });
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
      const allAssignmentsRaw = AssignmentRepository.search({ status: 'ASSIGNED' })
        .filter(a => !a.is_deleted);

      // 人工割用: job_idごとの全ASSIGNED配置数（外注も含めてカウント）
      const assignmentCountByJob = new Map<string, number>();
      for (const a of allAssignmentsRaw) {
        const jid = a.job_id as string;
        if (jid && jobIdSet.has(jid)) {
          assignmentCountByJob.set(jid, (assignmentCountByJob.get(jid) || 0) + 1);
        }
      }

      // 未払い配置のみフィルタ
      const allAssignments = allAssignmentsRaw.filter(a => !a.payout_id);
      const assignmentsByStaff = new Map<string, Record<string, unknown>[]>();
      for (const a of allAssignments) {
        const sid = a.staff_id as string;
        if (!assignmentsByStaff.has(sid)) {
          assignmentsByStaff.set(sid, []);
        }
        assignmentsByStaff.get(sid)!.push(a);
      }
      Logger.log(`[bulkConfirmPayouts] Preloaded ${allAssignmentsRaw.length} assignments (${allAssignments.length} unpaid)`);

      const bulkCache: BulkPayoutCache = { jobs, jobMap, jobIdSet, lastPayoutMap, assignmentsByStaff, assignmentCountByJob };

      // 4. 全スタッフの未払い計算
      for (const staffId of staffIds) {
        const calc = this._calculatePayoutWithBulkCache(staffId, endDate, bulkCache);
        staffCalcMap.set(staffId, calc);
      }
    }

    // ========== Phase 2.5: 重複チェック用のSet構築 ==========
    // confirmed/paid: endDate一致のみ取得（重複スキップ用）
    const confirmedPaidPayouts = PayoutRepository.search({
      payout_type: 'STAFF',
      period_end_to: endDate,
      period_start_from: null,
      status_in: ['confirmed', 'paid']
    }).filter(p => p.period_end === endDate);

    // draft: 締日不問で全draft取得（調整額引き継ぎのため）
    const allDrafts = PayoutRepository.search({
      payout_type: 'STAFF',
      status: 'draft'
    });

    // confirmed/paidの重複キー（スキップ対象）— 3部キー
    const confirmedPayoutKeys = new Set<string>();
    for (const p of confirmedPaidPayouts) {
      if (p.staff_id && p.period_start && p.period_end) {
        confirmedPayoutKeys.add(`${p.staff_id}|${p.period_start}|${p.period_end}`);
      }
    }

    // draftのマップ（アップグレード対象）— staffIdキー（締日不問）
    const draftPayoutMap = new Map<string, PayoutRecord>();
    // updated_at降順ソートで最新draftを優先
    allDrafts.sort((a, b) => {
      const dateA = new Date(a.updated_at as string).getTime() || 0;
      const dateB = new Date(b.updated_at as string).getTime() || 0;
      return dateB - dateA;
    });
    for (const p of allDrafts) {
      if (p.staff_id && !draftPayoutMap.has(p.staff_id)) {
        draftPayoutMap.set(p.staff_id, p);
      }
    }
    Logger.log(`[bulkConfirmPayouts] Loaded ${confirmedPaidPayouts.length} confirmed/paid, ${draftPayoutMap.size} drafts (from ${allDrafts.length} total drafts)`);

    // 支払いレコードを準備
    let skipped = 0;
    const draftsToUpgrade: { staffId: string; draft: PayoutRecord; calc: PayoutCalcResult; adjustmentAmount: number; notes: string; payoutId: string }[] = [];

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

      // ★ 重複チェック（confirmed/paidのみスキップ、draftはアップグレード）
      const payoutKey = `${staffId}|${calc.periodStart}|${calc.periodEnd}`;
      if (confirmedPayoutKeys.has(payoutKey)) {
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
      confirmedPayoutKeys.add(payoutKey);

      const adjustmentAmount = adjustments[staffId]?.adjustment_amount || 0;
      const notes = adjustments[staffId]?.notes || '';
      const totalAmount = calc.totalAmount + adjustmentAmount;

      // Draftが存在する場合はアップグレード対象に（staffIdキーで検索 — 締日不問）
      const existingDraft = draftPayoutMap.get(staffId);
      if (existingDraft) {
        const payoutId = existingDraft.payout_id;
        draftsToUpgrade.push({ staffId, draft: existingDraft, calc, adjustmentAmount, notes, payoutId });
        continue;
      }

      const payoutId = generateId('pay');

      // 支払いレコード準備（新規挿入）
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
        ninku_coefficient: calc.ninkuCoefficient,
        ninku_adjustment_amount: calc.ninkuAdjustmentAmount,
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

    // 3a. Draft → confirmed アップグレード（個別update）
    const upgradedPayouts: PayoutRecord[] = [];
    for (const { staffId, draft, calc, adjustmentAmount, notes } of draftsToUpgrade) {
      const totalAmount = calc.totalAmount + adjustmentAmount;
      const updateResult = PayoutRepository.update({
        payout_id: draft.payout_id,
        period_start: calc.periodStart!,
        period_end: calc.periodEnd,
        assignment_count: calc.assignmentCount,
        base_amount: calc.baseAmount,
        transport_amount: calc.transportAmount,
        adjustment_amount: adjustmentAmount,
        ninku_coefficient: calc.ninkuCoefficient,
        ninku_adjustment_amount: calc.ninkuAdjustmentAmount,
        tax_amount: calc.taxAmount,
        total_amount: totalAmount,
        status: 'confirmed' as PayoutStatus,
        paid_date: '',
        notes: notes
      });
      if (updateResult.success && updateResult.payout) {
        upgradedPayouts.push(updateResult.payout);
        for (const assignment of calc.assignments!) {
          assignmentUpdates.push({
            assignment_id: assignment.assignment_id as string,
            payout_id: draft.payout_id
          });
        }
        results.push({
          staffId: staffId,
          success: true,
          payoutId: draft.payout_id
        });
        success++;
      } else {
        Logger.log(`[bulkConfirmPayouts] Draft upgrade failed: ${draft.payout_id} - ${updateResult.error}`);
        results.push({
          staffId: staffId,
          success: false,
          error: updateResult.error || 'DRAFT_UPGRADE_FAILED',
          message: 'Draft→Confirmed更新に失敗しました'
        });
        failed++;
      }
    }
    if (draftsToUpgrade.length > 0) {
      Logger.log(`[bulkConfirmPayouts] Upgraded ${upgradedPayouts.length}/${draftsToUpgrade.length} drafts to confirmed`);
    }

    // 3b. 新規一括挿入
    let insertedPayouts: PayoutRecord[] = [];
    if (payoutsToInsert.length > 0) {
      insertedPayouts = PayoutRepository.insertBulk(payoutsToInsert);
      Logger.log(`[bulkConfirmPayouts] Inserted ${insertedPayouts.length} payouts`);
    }

    // 両方を結合
    const allConfirmedPayouts = [...upgradedPayouts, ...insertedPayouts];

    // 4. Assignment一括更新（失敗時はPayoutをdraftに戻す）
    let assignmentUpdateWarning: string | null = null;
    if (assignmentUpdates.length > 0) {
      try {
        const updateResult = AssignmentRepository.bulkUpdatePayoutId(assignmentUpdates) as { success: number; failed?: number };
        Logger.log(`[bulkConfirmPayouts] Updated ${updateResult.success} assignments`);
        const failedCount = Number(updateResult.failed || 0);
        if (failedCount > 0) {
          throw new Error(`ASSIGNMENT_LINK_PARTIAL_FAILED: ${failedCount}/${assignmentUpdates.length}`);
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        Logger.log(`[bulkConfirmPayouts] Assignment update failed: ${msg}`);
        assignmentUpdateWarning = msg;

        // confirmed化した全Payoutをdraftに戻す（リカバリ）
        for (const payout of allConfirmedPayouts) {
          try {
            PayoutRepository.update({ payout_id: payout.payout_id, status: 'draft' });
            const unlinkOk = this._unlinkAssignmentsFromPayout(payout.payout_id);
            if (!unlinkOk) {
              Logger.log(`[bulkConfirmPayouts] Failed to unlink assignments for payout ${payout.payout_id}`);
            }
          } catch (revertErr: unknown) {
            const revertMsg = revertErr instanceof Error ? revertErr.message : String(revertErr);
            Logger.log(`[bulkConfirmPayouts] Failed to revert payout ${payout.payout_id}: ${revertMsg}`);
          }
        }
      }
    }

    // 5. 監査ログ（一括 - 1回のシートI/O）
    try {
      const auditRecords = allConfirmedPayouts.map(p => ({
        recordId: p.payout_id,
        data: p as unknown
      }));
      logCreateBulk('T_Payouts', auditRecords);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      Logger.log(`[bulkConfirmPayouts] Audit log error: ${msg}`);
    }

    // 6. スタッフ名を付与して返す（1回のシートI/O）
    const enrichedPayouts = this._enrichPayoutsBulk(allConfirmedPayouts);

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

    const expectedUpdatedAtMap = options.expectedUpdatedAtMap || {};
    const missingExpected = payoutIds.filter(payoutId => !expectedUpdatedAtMap[payoutId]);
    if (missingExpected.length > 0) {
      return {
        success: 0,
        failed: payoutIds.length,
        results: payoutIds.map(payoutId => ({
          payoutId: payoutId,
          success: false,
          error: 'EXPECTED_UPDATED_AT_REQUIRED',
          message: 'expectedUpdatedAt is required'
        })),
        payouts: []
      };
    }

    const paidDate = options.paid_date || Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');

    // バルク更新を使用（シートI/Oを1回に集約）
    const result = PayoutRepository.bulkUpdateStatus(payoutIds, 'paid', {
      paid_date: paidDate,
      expectedUpdatedAtMap: expectedUpdatedAtMap
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
    const unlinked = this._unlinkAssignmentsFromPayout(payoutId);
    if (!unlinked) {
      return {
        success: false,
        error: 'ASSIGNMENT_UNLINK_FAILED'
      };
    }

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
   * 全draft Payoutを取得（締日不問 — 調整額は締日変更時も引き継ぐ）
   * @param endDate - 互換性のため引数を残すが内部では未使用
   */
  getDraftPayoutsForPeriod: function(_endDate?: string): (PayoutRecord & { target_name: string })[] {
    const payouts = PayoutRepository.search({
      payout_type: 'STAFF',
      status: 'draft'
    });

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
      .filter(s => !isSubcontract_(s));

    // 特定スタッフ指定時はフィルタ
    if (options.staffId) {
      staffList = staffList.filter(s => s.staff_id === options.staffId);
    }

    if (staffList.length === 0) return [];

    // 2. 対象期間のJobを一括取得
    const jobs = JobRepository.search({ work_date_to: endDate, sort_order: 'asc' });
    if (jobs.length === 0) return [];

    const jobMap = new Map(jobs.map(j => [j.job_id as string, j]));
    const jobIds = new Set(jobs.map(j => j.job_id as string));

    // 3. 全Assignmentsを一括取得
    const allAssignmentsRaw = AssignmentRepository.search({ status: 'ASSIGNED' });

    // 人工割用: job_idごとの全ASSIGNED配置数（外注も含めてカウント）
    const assignmentCountByJob = new Map<string, number>();
    for (const a of allAssignmentsRaw) {
      if (a.is_deleted) continue;
      const jid = a.job_id as string;
      if (jid && jobIds.has(jid)) {
        assignmentCountByJob.set(jid, (assignmentCountByJob.get(jid) || 0) + 1);
      }
    }

    // 未払い配置のみフィルタ（二重計上防止）
    const allAssignments = allAssignmentsRaw.filter(a => !a.payout_id);
    const assignmentsByStaff = new Map<string, Record<string, unknown>[]>();
    for (const assignment of allAssignments) {
      const staffId = assignment.staff_id as string;
      if (!staffId) continue;
      const existing = assignmentsByStaff.get(staffId);
      if (existing) {
        existing.push(assignment);
      } else {
        assignmentsByStaff.set(staffId, [assignment]);
      }
    }

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
      const staffAssignments = (assignmentsByStaff.get(staffId) || []).filter(a => {
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

      // 人工割計算（CR-029）
      const ninku = this._calculateNinkuAdjustments(assignmentsWithJob, staff, jobMap, assignmentCountByJob);

      // 源泉徴収税を計算（配置単位で個別テーブル参照 → 月合計）
      const taxAmount = this._calculateWithholdingTaxTotal(assignmentsWithJob, staff, jobMap, assignmentCountByJob);

      const dates = assignmentsWithJob.map(a => a.work_date as string).filter(d => d);
      const periodStart = dates.length > 0 ? dates[0] : endDate;

      results.push({
        staffId: staffId,
        staffName: staff.name as string,
        staffNameKana: (staff.name_kana as string) || '',
        unpaidCount: staffAssignments.length,
        baseAmount: calcResult.baseAmount,
        transportAmount: calcResult.transportAmount,
        ninkuCoefficient: ninku.avgCoefficient,
        ninkuAdjustmentAmount: ninku.totalAdjustment,
        estimatedAmount: calcResult.totalAmount + ninku.totalAdjustment - taxAmount,
        taxAmount: taxAmount,
        periodStart: periodStart,
        periodEnd: endDate,
        // ★ bulkConfirmPayoutsで再計算をスキップするためのデータ
        assignmentIds: staffAssignments.map(a => a.assignment_id as string)
      });
    }

    // 50音順（カナ）でソート
    return results.sort((a, b) => (a.staffNameKana || a.staffName).localeCompare(b.staffNameKana || b.staffName, 'ja'));
  },

  /**
   * 未払スタッフリストの差分を取得（SWR差分更新用）
   * @param endDate - 集計終了日
   * @param lastSyncTimestamp - 前回同期時刻（ISO形式）
   * @returns 差分データ
   */
  getUnpaidStaffListDelta: function(endDate: string, lastSyncTimestamp: string): { ok?: false; reason?: string } | { changedStaffIds: string[]; removedStaffIds: string[]; staffList: UnpaidStaffItem[] } {
    Logger.log(`[getUnpaidStaffListDelta] endDate=${endDate}, lastSync=${lastSyncTimestamp}`);

    // 1. lastSyncTimestamp以降に更新されたAssignmentを取得
    const allAssignments = AssignmentRepository.search({ status: 'ASSIGNED' });
    const changedAssignments = allAssignments.filter(a =>
      a.updated_at && (a.updated_at as string) > lastSyncTimestamp
    );

    // 2. 変更があったスタッフIDを抽出（人工割の影響を受ける同現場スタッフも追加）
    const changedStaffIdSet = new Set(changedAssignments.map(a => a.staff_id as string).filter(Boolean));

    // [人工割の波及] 変更スタッフと同じ現場に配置されている他スタッフも再計算対象に追加
    // 人工割はactualCount（現場の配置人数）に依存するため、配置変更は同現場の全員に影響する
    if (changedStaffIdSet.size > 0) {
      const touchedJobIds = new Set<string>(
        changedAssignments.map(a => a.job_id as string).filter(Boolean)
      );
      if (touchedJobIds.size > 0) {
        for (const a of allAssignments) {
          if (a.job_id && touchedJobIds.has(a.job_id as string) && a.staff_id) {
            changedStaffIdSet.add(a.staff_id as string);
          }
        }
      }
    }

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

    // 4a. 変更スタッフが多すぎる場合はクライアント側で全件再取得させる
    if (changedStaffIds.length > 15) {
      Logger.log(`[getUnpaidStaffListDelta] Too many changed staff (${changedStaffIds.length}), falling back to full reload`);
      return { ok: false, reason: 'too-many-changes' };
    }

    // 4b. 変更があったスタッフがいない場合は空の差分を返す
    if (changedStaffIds.length === 0) {
      return {
        changedStaffIds: [],
        removedStaffIds: [],
        staffList: []
      };
    }

    // 5. 変更があったスタッフの未払い情報を再計算
    const deltaStaffList: UnpaidStaffItem[] = [];
    const removedStaffIds: string[] = [];
    for (const staffId of changedStaffIds) {
      const staffResult = this.getUnpaidStaffList(endDate, { staffId: staffId });
      if (staffResult.length > 0) {
        deltaStaffList.push(staffResult[0]);
      } else {
        removedStaffIds.push(staffId);
      }
    }

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
        ninkuCoefficient: 0,
        ninkuAdjustmentAmount: 0,
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

    // 人工割計算（CR-029）
    const assignmentCountByJob = bulkCache.assignmentCountByJob || new Map();
    const ninku = this._calculateNinkuAdjustments(assignments, staff, bulkCache.jobMap, assignmentCountByJob);

    // 交通費は請求書のみに反映。スタッフ支払いには含めない
    // const adjustedTransport = result.transportAmount + ninku.transportAdjustment;

    // 源泉徴収税を計算（配置単位で個別テーブル参照 → 月合計）
    const taxAmount = this._calculateWithholdingTaxTotal(assignments, staff, bulkCache.jobMap, assignmentCountByJob);

    // 期間を算出
    const dates = assignments.map(a => a.work_date as string).filter(d => d);
    const periodStart = dates.length > 0 ? dates[0] : endDate;
    const periodEnd = endDate;

    return {
      assignments: assignments,
      assignmentCount: assignments.length,
      baseAmount: result.baseAmount,
      transportAmount: 0,  // 交通費除外
      ninkuCoefficient: ninku.avgCoefficient,
      ninkuAdjustmentAmount: ninku.totalAdjustment,
      taxAmount: taxAmount,
      totalAmount: result.baseAmount + ninku.totalAdjustment - taxAmount,
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
  _linkAssignmentsToPayout: function(assignments: Record<string, unknown>[], payoutId: string): boolean {
    if (!assignments || assignments.length === 0) {
      return true;
    }

    const updates = assignments.map(a => ({
      assignment_id: a.assignment_id as string,
      payout_id: payoutId as string | null
    }));

    try {
      const result = AssignmentRepository.bulkUpdatePayoutId(updates);
      Logger.log(`[_linkAssignmentsToPayout] Updated ${result.success} assignments with payout_id: ${payoutId}`);
      return true;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      Logger.log(`[_linkAssignmentsToPayout] Error: ${msg}`);
      return false;
    }
  },

  /**
   * PayoutIDに紐付いたAssignmentsのpayout_idをクリア（バルク処理版）
   * @param payoutId - 支払ID
   */
  _unlinkAssignmentsFromPayout: function(payoutId: string): boolean {
    // payout_idで関連するAssignmentsを検索
    const linkedAssignments = AssignmentRepository.search({ payout_id: payoutId, status: 'ASSIGNED' });

    if (linkedAssignments.length === 0) {
      return true;
    }

    // バルク更新用のデータを作成
    const updates = linkedAssignments.map(a => ({
      assignment_id: a.assignment_id as string,
      payout_id: '' as string | null
    }));

    try {
      // 一括でpayout_idをクリア
      AssignmentRepository.bulkUpdatePayoutId(updates);
      return true;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      Logger.log(`[_unlinkAssignmentsFromPayout] Bulk update error: ${msg}`);
      return false;
    }
  },

  /**
   * 人工割（CR-029）: 配置リストに対する人工割調整額を算出する。
   * ジョブごとに required_count vs actual_count で係数を計算し、
   * 各配置の賃金に係数を適用した差分を合計する。
   *
   * @param staffAssignments - このスタッフの未払い配置（job_id, wage_rate等を含む）
   * @param staff - スタッフマスタ
   * @param jobMap - job_id → JobRecord マップ
   * @param assignmentCountByJob - job_id → 全ASSIGNED配置数 マップ
   * @returns { totalAdjustment, avgCoefficient }
   */
  _calculateNinkuAdjustments: function(
    staffAssignments: Record<string, unknown>[],
    staff: Record<string, unknown> | null,
    jobMap: Map<string, any>,
    assignmentCountByJob: Map<string, number>
  ): { totalAdjustment: number; avgCoefficient: number; transportAdjustment: number } {
    if (!staffAssignments || staffAssignments.length === 0) {
      return { totalAdjustment: 0, avgCoefficient: 1.0, transportAdjustment: 0 };
    }

    let totalAdjustment = 0;
    const transportAdjustment = 0;
    let coefficientSum = 0;
    let coefficientCount = 0;

    // 人工割（CR-029）: 過剰配置時の交通費キャップ
    // 交通費は支払いに含めないため、transportAdjustment計算をスキップ
    // （assignment の transport_amount から負値を生成して totalAmount を減らすのを防止）

    for (const asg of staffAssignments) {
      const jobId = asg.job_id as string;
      const job = jobMap.get(jobId);
      if (!job) continue;

      const requiredCount = Number(job.required_count) || 0;
      const actualCount = assignmentCountByJob.get(jobId) || 0;

      const coefficient = calculateNinkuCoefficient_(requiredCount, actualCount);

      if (coefficient === 1.0) continue;

      // この配置の賃金を計算
      const wage = calculateWage_(asg as any, staff as any, (asg.pay_unit as string) || 'basic');
      const adjustment = calculateNinkuAdjustment_(wage, coefficient);

      totalAdjustment += adjustment;
      coefficientSum += coefficient;
      coefficientCount++;
    }

    const avgCoefficient = coefficientCount > 0
      ? Math.floor((coefficientSum / coefficientCount) * 10) / 10
      : 1.0;

    return { totalAdjustment, avgCoefficient, transportAdjustment };
  },

  /**
   * job_idごとの全ASSIGNED配置数をカウントするマップを構築する。
   * 人工割の actual_count 算出用。payout_idの有無にかかわらず全配置をカウント。
   */
  _buildAssignmentCountByJob: function(jobIds: Set<string>): Map<string, number> {
    const allAssignments = AssignmentRepository.search({ status: 'ASSIGNED' });

    const countMap = new Map<string, number>();
    for (const a of allAssignments) {
      if (a.is_deleted) continue;
      const jobId = a.job_id as string;
      if (!jobIds.has(jobId)) continue;
      // 外注スタッフも現場の実人数としてカウント（人工割係数の算出に必要）
      countMap.set(jobId, (countMap.get(jobId) || 0) + 1);
    }
    return countMap;
  },

  /**
   * 源泉徴収税を日額テーブル（甲欄・扶養0人）で計算
   * 各配置(assignment)の給与（人工割調整込み）を個別にテーブル参照し、全配置の税額を合算して返す。
   * CR-084: 日額合算→1配置単位に変更（累進課税による過大徴収を防止）
   * @param staffAssignments - 対象スタッフの配置一覧
   * @param staff - スタッフ情報
   * @param jobMap - job_id → job のマップ
   * @param assignmentCountByJob - job_id → 配置人数のマップ
   * @returns 源泉徴収税額の月合計
   */
  _calculateWithholdingTaxTotal: function(
    staffAssignments: Record<string, unknown>[],
    staff: Record<string, unknown> | null,
    jobMap: Map<string, any>,
    assignmentCountByJob: Map<string, number>
  ): number {
    if (!staff) return 0;
    if (!staff.withholding_tax_applicable || String(staff.withholding_tax_applicable).toUpperCase() === 'FALSE') return 0;
    if (!staffAssignments || staffAssignments.length === 0) return 0;

    // 各配置の給与(人工割調整込み)を個別にテーブル参照して合算
    let total = 0;
    for (const asg of staffAssignments) {
      const jobId = asg.job_id as string;
      const job = jobMap.get(jobId);

      // 賃金を計算
      const wage = calculateWage_(asg as any, staff as any, (asg.pay_unit as string) || 'basic');

      // 人工割係数による調整額
      const requiredCount = Number(job?.required_count) || 0;
      const actualCount = assignmentCountByJob.get(jobId) || 0;
      const coefficient = calculateNinkuCoefficient_(requiredCount, actualCount);
      const adjustment = coefficient !== 1.0 ? calculateNinkuAdjustment_(wage, coefficient) : 0;

      const assignmentWage = wage + adjustment;
      total += lookupDailyWithholdingTax(assignmentWage);
    }
    return total;
  },

  /**
   * 支払いにスタッフ/外注先名を付与
   * @param payout - 支払いデータ
   * @returns 名前付き支払いデータ
   */
  _enrichPayout: function(payout: PayoutRecord): PayoutRecord & { target_name: string; target_name_kana: string } {
    let targetName = '';
    let targetNameKana = '';

    if (payout.payout_type === 'STAFF' && payout.staff_id) {
      const staff = StaffRepository.findById(payout.staff_id);
      targetName = staff ? (staff.name as string) : '(不明)';
      targetNameKana = staff ? ((staff.name_kana as string) || '') : '';
    } else if (payout.payout_type === 'SUBCONTRACTOR' && payout.subcontractor_id) {
      const sub = SubcontractorRepository.findById(payout.subcontractor_id);
      targetName = sub ? (sub.company_name as string) : '(不明)';
    }

    return {
      ...payout,
      target_name: targetName,
      target_name_kana: targetNameKana
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
      let targetNameKana = '';
      if (p.payout_type === 'STAFF' && p.staff_id) {
        const staff = staffMap.get(p.staff_id);
        targetName = staff ? (staff.name as string) : '(不明)';
        targetNameKana = staff ? ((staff.name_kana as string) || '') : '';
      } else if (p.payout_type === 'SUBCONTRACTOR' && p.subcontractor_id) {
        const sub = subMap.get(p.subcontractor_id);
        targetName = sub ? (sub.company_name as string) : '(不明)';
      }
      return { ...p, target_name: targetName, target_name_kana: targetNameKana };
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
        ninkuCoefficient: 0,
        ninkuAdjustmentAmount: 0,
        taxAmount: 0,
        totalAmount: 0,
        periodStart: null,
        periodEnd: endDate
      };
    }

    // 外注先マスタから単価を取得
    const sub = SubcontractorRepository.findById(subcontractorId);
    if (!sub) {
      throw new Error(`外注先が見つかりません: ${subcontractorId}`);
    }

    // 金額計算（外注先マスタの単価を pay_unit に応じて取得）
    let baseAmount = 0;
    // 交通費は請求書のみに反映。外注支払いには含めない（調整額で別途対応）

    for (const asg of assignments) {
      const rate = getSubcontractorRateByUnit_(sub, (asg.pay_unit as string) || 'basic');
      asg.wage_rate = rate;
      baseAmount += rate;
    }

    const totalAmount = baseAmount;

    assertInvariant_(
      assignments.length === 0 || baseAmount > 0,
      'calculatePayoutForSubcontractor: 配置あり but baseAmount=0（外注先マスタ単価欠損の可能性）',
      { subcontractor_id: subcontractorId, assignment_count: assignments.length, baseAmount: baseAmount }
    );

    // 期間を算出
    const dates = assignments.map(a => a.work_date as string).filter(d => d);
    const periodStart = dates.length > 0 ? dates[0] : endDate;

    return {
      assignments: assignments,
      assignmentCount: assignments.length,
      baseAmount: baseAmount,
      transportAmount: 0,  // 交通費除外
      ninkuCoefficient: 0,
      ninkuAdjustmentAmount: 0,  // 外注には人工割なし
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
    const linked = this._linkAssignmentsToPayout(calc.assignments as Record<string, unknown>[], payout.payout_id);
    if (!linked) {
      try {
        PayoutRepository.softDelete(payout.payout_id, payout.updated_at);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        Logger.log(`[confirmPayoutForSubcontractor] Rollback failed: ${msg}`);
      }
      return {
        success: false,
        error: 'ASSIGNMENT_LINK_FAILED',
        message: '配置データの紐付けに失敗しました'
      };
    }

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

    const linked = this._linkAssignmentsToPayout(calc.assignments as Record<string, unknown>[], payout.payout_id);
    if (!linked) {
      try {
        PayoutRepository.softDelete(payout.payout_id, payout.updated_at);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        Logger.log(`[markAsPaidForSubcontractor] Rollback failed: ${msg}`);
      }
      return {
        success: false,
        error: 'ASSIGNMENT_LINK_FAILED',
        message: '配置データの紐付けに失敗しました'
      };
    }

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
      const subAssignments: { assignment: Record<string, unknown>; job: JobRecord }[] = [];
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

      // 金額計算（外注先マスタの単価を参照）
      let baseAmount = 0;
      // 交通費は請求書のみに反映。外注支払いには含めない
      let minDate = endDate;
      for (const { assignment: asg, job } of subAssignments) {
        baseAmount += getSubcontractorRateByUnit_(sub, (asg.pay_unit as string) || 'basic');
        if (job.work_date && (job.work_date as string) < minDate) {
          minDate = job.work_date as string;
        }
      }

      results.push({
        subcontractorId: subId,
        companyName: sub.company_name as string,
        unpaidCount: subAssignments.length,
        estimatedAmount: baseAmount,
        baseAmount: baseAmount,
        transportAmount: 0,  // 交通費除外
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
