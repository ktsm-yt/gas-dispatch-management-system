/**
 * Payout Repository
 *
 * T_Payouts テーブルのシートI/O処理
 * 差分支払い方式: period_start/period_endで集計期間を管理
 */

interface BulkUpdateStatusOptions {
  paid_date?: string;
  expectedUpdatedAtMap?: Record<string, string>;
}

interface BulkUpdateStatusResult {
  success: number;
  failed: number;
  results: { payoutId: string; success: boolean; error?: string; message?: string; currentUpdatedAt?: string }[];
  payouts: PayoutRecord[];
}

const PayoutRepository = {
  TABLE_NAME: 'T_Payouts',
  ID_COLUMN: 'payout_id',

  /**
   * IDで支払いを取得（アーカイブDBフォールバック付き）
   */
  findById: function(payoutId: string): PayoutRecord | null {
    // 1. カレントDBを検索
    const record = getRecordById(this.TABLE_NAME, this.ID_COLUMN, payoutId);
    if (record) {
      return this._normalizeRecord(record);
    }

    // 2. カレントDBに見つからない場合、アーカイブDBを検索
    return this._findInArchive(payoutId);
  },

  /**
   * スタッフIDで支払いを検索
   * @param staffId - スタッフID
   * @param options - オプション
   * @returns 支払い配列
   */
  findByStaffId: function(staffId: string, options: { limit?: number } = {}): PayoutRecord[] {
    let records = getAllRecords(this.TABLE_NAME);

    records = records.filter(r =>
      !r.is_deleted &&
      r.payout_type === 'STAFF' &&
      r.staff_id === staffId
    );

    // paid_date優先でソート（新しい順）- searchと統一
    records.sort((a, b) => {
      const dateA = this._parseLocalDate((a.paid_date || a.period_end) as string);
      const dateB = this._parseLocalDate((b.paid_date || b.period_end) as string);
      return (dateB?.getTime() ?? 0) - (dateA?.getTime() ?? 0);
    });

    if (options.limit && options.limit > 0) {
      records = records.slice(0, options.limit);
    }

    return records.map(r => this._normalizeRecord(r));
  },

  /**
   * 外注先IDで支払いを検索
   * @param subcontractorId - 外注先ID
   * @param options - オプション
   * @returns 支払い配列
   */
  findBySubcontractorId: function(subcontractorId: string, options: { limit?: number } = {}): PayoutRecord[] {
    let records = getAllRecords(this.TABLE_NAME);

    records = records.filter(r =>
      !r.is_deleted &&
      r.payout_type === 'SUBCONTRACTOR' &&
      r.subcontractor_id === subcontractorId
    );

    // paid_date優先でソート（新しい順）- searchと統一
    records.sort((a, b) => {
      const dateA = this._parseLocalDate((a.paid_date || a.period_end) as string);
      const dateB = this._parseLocalDate((b.paid_date || b.period_end) as string);
      return (dateB?.getTime() ?? 0) - (dateA?.getTime() ?? 0);
    });

    if (options.limit && options.limit > 0) {
      records = records.slice(0, options.limit);
    }

    return records.map(r => this._normalizeRecord(r));
  },

  /**
   * スタッフの最新支払いを取得（差分計算の起点）
   * @param staffId - スタッフID
   * @returns 最新の支払いまたはnull
   */
  findLastPayout: function(staffId: string): PayoutRecord | null {
    let records = getAllRecords(this.TABLE_NAME);
    records = records.filter(r =>
      !r.is_deleted &&
      r.payout_type === 'STAFF' &&
      r.staff_id === staffId &&
      (r.status === 'confirmed' || r.status === 'paid')
    );
    if (records.length === 0) return null;
    records.sort((a, b) => {
      const dateA = this._parseLocalDate((a.paid_date || a.period_end) as string);
      const dateB = this._parseLocalDate((b.paid_date || b.period_end) as string);
      return (dateB?.getTime() ?? 0) - (dateA?.getTime() ?? 0);
    });
    return this._normalizeRecord(records[0]);
  },

  /**
   * スタッフ・期間終了日でdraft Payoutを検索（下書き保存の上書き判定用）
   */
  findDraftByStaffAndEndDate: function(staffId: string, endDate: string): PayoutRecord | null {
    const normalizedEnd = this._normalizeDate(endDate);
    let records = getAllRecords(this.TABLE_NAME);
    records = records.filter(r =>
      !r.is_deleted &&
      r.payout_type === 'STAFF' &&
      r.staff_id === staffId &&
      r.status === 'draft' &&
      this._normalizeDate(r.period_end as string | Date) === normalizedEnd
    );
    return records.length > 0 ? this._normalizeRecord(records[0]) : null;
  },

  /**
   * 指定スタッフ・期間の既存Payoutを検索（重複チェック用）
   * @param staffId - スタッフID
   * @param periodStart - 期間開始日
   * @param periodEnd - 期間終了日
   * @param options - オプション
   * @returns 該当するPayoutの配列（重複がある場合は複数返る）
   */
  findByStaffAndPeriod: function(staffId: string, periodStart: string, periodEnd: string, options: { excludeDeleted?: boolean } = {}): PayoutRecord[] {
    const excludeDeleted = options.excludeDeleted !== false;
    let records = getAllRecords(this.TABLE_NAME);

    const normalizedStart = this._normalizeDate(periodStart);
    const normalizedEnd = this._normalizeDate(periodEnd);

    records = records.filter(r => {
      if (excludeDeleted && r.is_deleted) return false;
      return r.payout_type === 'STAFF' &&
             r.staff_id === staffId &&
             this._normalizeDate(r.period_start as string | Date) === normalizedStart &&
             this._normalizeDate(r.period_end as string | Date) === normalizedEnd;
    });

    return records.map(r => this._normalizeRecord(r));
  },

  /**
   * 指定外注先・期間の既存Payoutを検索（重複チェック用）
   * @param subcontractorId - 外注先ID
   * @param periodStart - 期間開始日
   * @param periodEnd - 期間終了日
   * @param options - オプション
   * @returns 該当するPayoutの配列
   */
  findBySubcontractorAndPeriod: function(subcontractorId: string, periodStart: string, periodEnd: string, options: { excludeDeleted?: boolean } = {}): PayoutRecord[] {
    const excludeDeleted = options.excludeDeleted !== false;
    let records = getAllRecords(this.TABLE_NAME);

    const normalizedStart = this._normalizeDate(periodStart);
    const normalizedEnd = this._normalizeDate(periodEnd);

    records = records.filter(r => {
      if (excludeDeleted && r.is_deleted) return false;
      return r.payout_type === 'SUBCONTRACTOR' &&
             r.subcontractor_id === subcontractorId &&
             this._normalizeDate(r.period_start as string | Date) === normalizedStart &&
             this._normalizeDate(r.period_end as string | Date) === normalizedEnd;
    });

    return records.map(r => this._normalizeRecord(r));
  },

  /**
   * 外注先の最新支払いを取得（period_end の最大値で決定）
   * 差分計算の起点として使用するため、paid_date ではなく period_end で判定
   * @param subcontractorId - 外注先ID
   * @returns period_end が最大の支払いまたはnull
   */
  findLastPayoutForSubcontractor: function(subcontractorId: string): PayoutRecord | null {
    let records = getAllRecords(this.TABLE_NAME);

    records = records.filter(r =>
      !r.is_deleted &&
      r.payout_type === 'SUBCONTRACTOR' &&
      r.subcontractor_id === subcontractorId &&
      (r.status === 'confirmed' || r.status === 'paid')
    );

    if (records.length === 0) return null;

    // period_end の最大値で決定（二重計上防止）
    records.sort((a, b) => {
      const dateA = this._parseLocalDate(a.period_end as string);
      const dateB = this._parseLocalDate(b.period_end as string);
      return (dateB?.getTime() ?? 0) - (dateA?.getTime() ?? 0);
    });

    return this._normalizeRecord(records[0]);
  },

  /**
   * 条件で支払いを検索
   * @param query - 検索条件
   * @returns 支払い配列
   */
  search: function(query: PayoutSearchQuery = {}): PayoutRecord[] {
    let records = getAllRecords(this.TABLE_NAME);

    // 論理削除除外
    records = records.filter(r => !r.is_deleted);

    // 種別で絞り込み
    if (query.payout_type) {
      records = records.filter(r => r.payout_type === query.payout_type);
    }

    // スタッフIDで絞り込み
    if (query.staff_id) {
      records = records.filter(r => r.staff_id === query.staff_id);
    }

    // 外注先IDで絞り込み
    if (query.subcontractor_id) {
      records = records.filter(r => r.subcontractor_id === query.subcontractor_id);
    }

    // ステータスで絞り込み（単一）
    if (query.status) {
      records = records.filter(r => r.status === query.status);
    }

    // ステータスで絞り込み（複数）
    if (query.status_in && Array.isArray(query.status_in)) {
      records = records.filter(r => query.status_in!.includes(r.status as PayoutStatus));
    }

    // 期間開始日（以降）で絞り込み
    if (query.period_start_from) {
      const fromDate = this._parseLocalDate(query.period_start_from);
      records = records.filter(r => {
        const d = this._parseLocalDate(r.period_start as string);
        return d && fromDate && d.getTime() >= fromDate.getTime();
      });
    }

    // 期間終了日（以前）で絞り込み
    if (query.period_end_to) {
      const toDate = this._parseLocalDate(query.period_end_to);
      records = records.filter(r => {
        const d = this._parseLocalDate(r.period_end as string);
        return d && toDate && d.getTime() <= toDate.getTime();
      });
    }

    // 支払日（以降）で絞り込み
    if (query.paid_date_from) {
      const fromDate = this._parseLocalDate(query.paid_date_from);
      records = records.filter(r => {
        const paidDate = this._parseLocalDate(r.paid_date as string);
        return paidDate && fromDate && paidDate.getTime() >= fromDate.getTime();
      });
    }

    // 支払日（以前）で絞り込み
    if (query.paid_date_to) {
      const toDate = this._parseLocalDate(query.paid_date_to);
      records = records.filter(r => {
        const paidDate = this._parseLocalDate(r.paid_date as string);
        return paidDate && toDate && paidDate.getTime() <= toDate.getTime();
      });
    }

    // ソート（デフォルト: paid_date降順＝最新が上）
    const sortOrder = query.sort_order || 'desc';

    records.sort((a, b) => {
      // paid_dateがあればそれを優先、なければperiod_endを使用
      const dateA = this._parseLocalDate((a.paid_date || a.period_end) as string);
      const dateB = this._parseLocalDate((b.paid_date || b.period_end) as string);
      // desc: 新しい順（dateB - dateA）、asc: 古い順（dateA - dateB）
      return sortOrder === 'desc'
        ? (dateB?.getTime() ?? 0) - (dateA?.getTime() ?? 0)
        : (dateA?.getTime() ?? 0) - (dateB?.getTime() ?? 0);
    });

    // 件数制限
    if (query.limit && query.limit > 0) {
      records = records.slice(0, query.limit);
    }

    return records.map(r => this._normalizeRecord(r));
  },

  /**
   * 新規支払いを作成
   * @param payout - 支払いデータ
   * @returns 作成した支払い
   */
  insert: function(payout: Partial<PayoutRecord>): PayoutRecord {
    const user = getCurrentUserEmail();
    const now = getCurrentTimestamp();

    const newPayout: Record<string, unknown> = {
      payout_id: payout.payout_id || generateId('pay'),
      payout_type: payout.payout_type || 'STAFF',
      staff_id: payout.staff_id || '',
      subcontractor_id: payout.subcontractor_id || '',
      period_start: payout.period_start || '',
      period_end: payout.period_end || '',
      assignment_count: payout.assignment_count || 0,
      base_amount: payout.base_amount || 0,
      transport_amount: payout.transport_amount || 0,
      adjustment_amount: payout.adjustment_amount || 0,
      ninku_coefficient: payout.ninku_coefficient || 0,
      ninku_adjustment_amount: payout.ninku_adjustment_amount || 0,
      tax_amount: payout.tax_amount || 0,
      total_amount: payout.total_amount || 0,
      status: payout.status || 'draft',
      paid_date: payout.paid_date || '',
      notes: payout.notes || '',
      created_at: now,
      created_by: user,
      updated_at: now,
      is_deleted: false
    };

    insertRecord(this.TABLE_NAME, newPayout);

    return newPayout as unknown as PayoutRecord;
  },

  /**
   * 支払いを一括挿入
   * @param payouts - 支払いデータ配列
   * @returns 作成した支払い配列
   */
  insertBulk: function(payouts: Partial<PayoutRecord>[]): PayoutRecord[] {
    if (!payouts || payouts.length === 0) {
      return [];
    }

    const user = getCurrentUserEmail();
    const now = getCurrentTimestamp();

    const newPayouts: Record<string, unknown>[] = payouts.map(payout => ({
      payout_id: payout.payout_id || generateId('pay'),
      payout_type: payout.payout_type || 'STAFF',
      staff_id: payout.staff_id || '',
      subcontractor_id: payout.subcontractor_id || '',
      period_start: payout.period_start || '',
      period_end: payout.period_end || '',
      assignment_count: payout.assignment_count || 0,
      base_amount: payout.base_amount || 0,
      transport_amount: payout.transport_amount || 0,
      adjustment_amount: payout.adjustment_amount || 0,
      ninku_coefficient: payout.ninku_coefficient || 0,
      ninku_adjustment_amount: payout.ninku_adjustment_amount || 0,
      tax_amount: payout.tax_amount || 0,
      total_amount: payout.total_amount || 0,
      status: payout.status || 'draft',
      paid_date: payout.paid_date || '',
      notes: payout.notes || '',
      created_at: now,
      created_by: user,
      updated_at: now,
      is_deleted: false
    }));

    insertRecords(this.TABLE_NAME, newPayouts);

    return newPayouts as unknown as PayoutRecord[];
  },

  /**
   * 支払いを更新（楽観ロック付き）
   * @param payout - 更新データ（payout_id必須）
   * @param expectedUpdatedAt - 期待するupdated_at
   * @returns 更新結果
   */
  update: function(payout: Partial<PayoutRecord> & Record<string, unknown> & { payout_id: string }, expectedUpdatedAt?: string): PayoutUpdateResult {
    if (!payout.payout_id) {
      return { success: false, error: 'payout_id is required' };
    }

    // アーカイブデータの場合はアーカイブDBに書き込み
    if (payout._archived && payout._archiveFiscalYear) {
      return this._updateArchiveRecord(payout, expectedUpdatedAt);
    }

    const sheet = getSheet(this.TABLE_NAME);
    const rowNum = findRowById(sheet, this.ID_COLUMN, payout.payout_id);

    if (!rowNum) {
      return { success: false, error: 'NOT_FOUND' };
    }

    const headers = getHeaders(sheet);
    const currentRow = sheet.getRange(rowNum, 1, 1, headers.length).getValues()[0];
    const currentPayout = rowToObject(headers, currentRow);

    // 論理削除済みチェック
    if (currentPayout.is_deleted) {
      return { success: false, error: 'NOT_FOUND' };
    }

    // 楽観ロックチェック
    if (expectedUpdatedAt && currentPayout.updated_at !== expectedUpdatedAt) {
      return {
        success: false,
        error: 'CONFLICT_ERROR',
        currentUpdatedAt: String(currentPayout.updated_at)
      };
    }

    const now = getCurrentTimestamp();

    // 更新可能フィールド（ホワイトリスト）
    const updatableFields = [
      'period_start', 'period_end', 'assignment_count',
      'base_amount', 'transport_amount', 'adjustment_amount',
      'ninku_coefficient', 'ninku_adjustment_amount',
      'tax_amount', 'total_amount',
      'status', 'paid_date', 'notes', 'is_deleted'
    ] as const;

    const updatedPayout: Record<string, unknown> = { ...currentPayout };

    for (const field of updatableFields) {
      if ((payout as Record<string, unknown>)[field] !== undefined) {
        updatedPayout[field] = (payout as Record<string, unknown>)[field];
      }
    }

    updatedPayout.updated_at = now;

    const newRow = objectToRow(headers, updatedPayout);
    sheet.getRange(rowNum, 1, 1, headers.length).setValues([newRow]);
    invalidateExecutionCache('T_Payouts');

    return {
      success: true,
      payout: this._normalizeRecord(updatedPayout),
      before: currentPayout
    };
  },

  /**
   * 論理削除
   * @param payoutId - 支払ID
   * @param expectedUpdatedAt - 期待するupdated_at
   * @returns 削除結果
   */
  softDelete: function(payoutId: string, expectedUpdatedAt?: string): PayoutUpdateResult {
    return this.update(
      { payout_id: payoutId, is_deleted: true },
      expectedUpdatedAt
    );
  },

  /**
   * ステータスを更新
   * @param payoutId - 支払ID
   * @param status - 新ステータス（draft/confirmed/paid）
   * @param expectedUpdatedAt - 期待するupdated_at
   * @returns 更新結果
   */
  updateStatus: function(payoutId: string, status: PayoutStatus, expectedUpdatedAt?: string): PayoutUpdateResult {
    const updateData: Partial<PayoutRecord> & { payout_id: string } = { payout_id: payoutId, status: status };

    // paidステータスの場合はpaid_dateも設定
    if (status === 'paid') {
      updateData.paid_date = getCurrentTimestamp().split('T')[0];
    }

    return this.update(updateData, expectedUpdatedAt);
  },

  /**
   * 複数レコードのステータスを一括更新（バルク処理）
   * シートI/Oを1回に集約してパフォーマンスを最適化
   * @param payoutIds - 支払ID配列
   * @param status - 新ステータス（confirmed/paid）
   * @param options - オプション
   * @returns バルク更新結果
   */
  bulkUpdateStatus: function(payoutIds: string[], status: PayoutStatus, options: BulkUpdateStatusOptions = {}): BulkUpdateStatusResult {
    if (!payoutIds || payoutIds.length === 0) {
      return { success: 0, failed: 0, results: [], payouts: [] };
    }

    const sheet = getSheet(this.TABLE_NAME);
    const headers = getHeaders(sheet);
    const lastRow = sheet.getLastRow();

    if (lastRow <= 1) {
      // データがない場合、全てNOT_FOUNDとして記録
      const results = payoutIds.map(id => ({ payoutId: id, success: false, error: 'NOT_FOUND' }));
      return { success: 0, failed: payoutIds.length, results, payouts: [] };
    }

    // 1. 全データを一括読み込み
    const dataRange = sheet.getRange(2, 1, lastRow - 1, headers.length);
    const allData = dataRange.getValues();

    // 2. payout_idカラムのインデックスを取得
    const idIndex = headers.indexOf(this.ID_COLUMN);
    const statusIndex = headers.indexOf('status');
    const paidDateIndex = headers.indexOf('paid_date');
    const updatedAtIndex = headers.indexOf('updated_at');
    const isDeletedIndex = headers.indexOf('is_deleted');

    if (idIndex === -1 || statusIndex === -1) {
      const results = payoutIds.map(id => ({ payoutId: id, success: false, error: 'SCHEMA_ERROR' }));
      return { success: 0, failed: payoutIds.length, results, payouts: [] };
    }

    // 3. 対象IDのセットを作成 & 見つかったIDを追跡
    const targetIdSet = new Set(payoutIds);
    const foundIdSet = new Set<string>();
    const now = getCurrentTimestamp();
    const paidDate = options.paid_date || now.split('T')[0];
    const expectedUpdatedAtMap = options.expectedUpdatedAtMap || {};

    const results: BulkUpdateStatusResult['results'] = [];
    const updatedPayouts: PayoutRecord[] = [];
    let success = 0;
    let failed = 0;
    let hasChanges = false;

    // 4. メモリ上でデータを更新
    for (let i = 0; i < allData.length; i++) {
      const row = allData[i];
      const payoutId = row[idIndex] as string;

      if (!targetIdSet.has(payoutId)) continue;

      // このIDは見つかった
      foundIdSet.add(payoutId);

      // 論理削除済みチェック
      if (isDeletedIndex !== -1 && row[isDeletedIndex] === true) {
        results.push({ payoutId, success: false, error: 'DELETED' });
        failed++;
        continue;
      }

      // 楽観ロックチェック
      const expectedUpdatedAt = expectedUpdatedAtMap[payoutId];
      if (expectedUpdatedAt && updatedAtIndex !== -1) {
        const currentUpdatedAt = row[updatedAtIndex] as string;
        if (currentUpdatedAt !== expectedUpdatedAt) {
          results.push({
            payoutId,
            success: false,
            error: 'CONFLICT_ERROR',
            currentUpdatedAt: currentUpdatedAt
          });
          failed++;
          continue;
        }
      }

      // confirmedステータスからのみpaidに変更可能
      const currentStatus = row[statusIndex] as string;
      if (status === 'paid' && currentStatus !== 'confirmed') {
        results.push({
          payoutId,
          success: false,
          error: 'INVALID_STATUS',
          message: `confirmed状態のみ振込完了にできます（現在: ${currentStatus}）`
        });
        failed++;
        continue;
      }

      // ステータス更新
      row[statusIndex] = status;
      if (status === 'paid' && paidDateIndex !== -1) {
        row[paidDateIndex] = paidDate;
      }
      if (updatedAtIndex !== -1) {
        row[updatedAtIndex] = now;
      }

      hasChanges = true;
      success++;
      results.push({ payoutId, success: true });

      // 更新後のレコードを構築
      const updatedRecord = rowToObject(headers, row);
      updatedPayouts.push(this._normalizeRecord(updatedRecord));
    }

    // 5. 存在しなかったIDを失敗として記録
    for (const payoutId of payoutIds) {
      if (!foundIdSet.has(payoutId)) {
        results.push({ payoutId, success: false, error: 'NOT_FOUND' });
        failed++;
      }
    }

    // 6. 変更があれば一括書き込み
    if (hasChanges) {
      dataRange.setValues(allData);
      invalidateExecutionCache('T_Payouts');
    }

    return {
      success,
      failed,
      results,
      payouts: updatedPayouts
    };
  },

  /**
   * 一括挿入
   * @param payouts - 支払いデータ配列
   * @returns 作成した支払い配列
   */
  bulkInsert: function(payouts: Partial<PayoutRecord>[]): PayoutRecord[] {
    const results: PayoutRecord[] = [];
    for (const payout of payouts) {
      results.push(this.insert(payout));
    }
    return results;
  },

  /**
   * レコードを正規化
   * @param record - レコード
   * @returns 正規化されたレコード
   */
  _normalizeRecord: function(record: Record<string, unknown>): PayoutRecord {
    return {
      ...record,
      period_start: this._normalizeDate(record.period_start as string | Date),
      period_end: this._normalizeDate(record.period_end as string | Date),
      paid_date: this._normalizeDate(record.paid_date as string | Date),
      assignment_count: Number(record.assignment_count) || 0,
      base_amount: Number(record.base_amount) || 0,
      transport_amount: Number(record.transport_amount) || 0,
      adjustment_amount: Number(record.adjustment_amount) || 0,
      tax_amount: Number(record.tax_amount) || 0,
      total_amount: Number(record.total_amount) || 0
    } as unknown as PayoutRecord;
  },

  /**
   * 日付を正規化してYYYY-MM-DD形式の文字列に変換
   * @param dateValue - 日付値
   * @returns 正規化された日付文字列
   */
  _normalizeDate: function(dateValue: string | Date | null | undefined): string {
    if (!dateValue) return '';

    if (dateValue instanceof Date) {
      return Utilities.formatDate(dateValue, 'Asia/Tokyo', 'yyyy-MM-dd');
    }

    // 文字列の場合はスラッシュをハイフンに変換
    return String(dateValue).replace(/\//g, '-');
  },

  /**
   * 日付文字列をローカルタイムゾーンでパース（UTC解釈回避）
   * @param dateStr - 日付文字列（YYYY-MM-DD形式）
   * @returns パースされた日付またはnull
   */
  _parseLocalDate: function(dateStr: string | Date | null | undefined): Date | null {
    if (!dateStr) return null;

    const normalized = this._normalizeDate(dateStr as string | Date);
    if (!normalized) return null;

    const parts = normalized.split('-');
    if (parts.length !== 3) return new Date(dateStr as string); // フォールバック

    const [y, m, d] = parts.map(Number);
    return new Date(y, m - 1, d); // ローカルタイムゾーンで作成
  },

  /**
   * アーカイブDBのレコードを更新（P2-5拡張）
   * @param {Object} payout - 更新データ（payout_id, _archived, _archiveFiscalYear必須）
   * @param {string} expectedUpdatedAt - 期待するupdated_at
   * @returns {Object} 更新結果 { success: boolean, payout?: Object, error?: string }
   */
  _updateArchiveRecord: function(payout: Record<string, unknown>, expectedUpdatedAt?: string): PayoutUpdateResult {
    const fiscalYear = Number(payout._archiveFiscalYear);
    const archiveDbId = ArchiveService.getArchiveDbId(fiscalYear);

    if (!archiveDbId) {
      return { success: false, error: `${fiscalYear}年度のアーカイブDBが見つかりません。` };
    }

    try {
      const archiveDb = SpreadsheetApp.openById(archiveDbId);
      const sheetName = TABLE_SHEET_MAP[this.TABLE_NAME] || this.TABLE_NAME;
      const sheet = archiveDb.getSheetByName(sheetName);

      if (!sheet) {
        return { success: false, error: `アーカイブDBに${sheetName}シートが見つかりません。` };
      }

      const headers = getHeaders(sheet);
      const idColIndex = headers.indexOf(this.ID_COLUMN);
      const updatedAtColIndex = headers.indexOf('updated_at');

      if (idColIndex === -1) {
        return { success: false, error: 'アーカイブDBのスキーマが不正です。' };
      }

      // IDで行を検索
      const lastRow = sheet.getLastRow();
      if (lastRow <= 1) {
        return { success: false, error: 'NOT_FOUND' };
      }

      const data = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
      let targetRowIndex = -1;
      let currentRecord: Record<string, unknown> | null = null;

      for (let i = 0; i < data.length; i++) {
        if (data[i][idColIndex] === payout.payout_id) {
          targetRowIndex = i;
          currentRecord = rowToObject(headers, data[i]);
          break;
        }
      }

      if (targetRowIndex === -1) {
        return { success: false, error: 'NOT_FOUND' };
      }

      // 楽観ロックチェック
      if (expectedUpdatedAt && currentRecord && currentRecord.updated_at !== expectedUpdatedAt) {
        return {
          success: false,
          error: 'CONFLICT_ERROR',
          currentUpdatedAt: String(currentRecord.updated_at)
        };
      }

      const user = getCurrentUserEmail();
      const now = getCurrentTimestamp();

      // 更新可能フィールド（ホワイトリスト）
      const updatableFields = [
        'period_start', 'period_end', 'assignment_count',
        'base_amount', 'transport_amount', 'adjustment_amount',
        'tax_amount', 'total_amount',
        'status', 'paid_date', 'notes', 'is_deleted'
      ];

      const updatedPayout = { ...currentRecord };

      for (const field of updatableFields) {
        if (payout[field] !== undefined) {
          updatedPayout[field] = payout[field];
        }
      }

      updatedPayout.updated_at = now;

      // アーカイブDBに書き込み
      const newRow = objectToRow(headers, updatedPayout);
      sheet.getRange(targetRowIndex + 2, 1, 1, headers.length).setValues([newRow]);

      // アーカイブフラグを付与して返す
      const result = this._normalizeRecord(updatedPayout) as PayoutRecord & { _archived?: boolean; _archiveFiscalYear?: number };
      result._archived = true;
      result._archiveFiscalYear = fiscalYear as number;

      return {
        success: true,
        payout: result,
        before: currentRecord ?? undefined
      };

    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Logger.log(`アーカイブDB更新エラー: ${msg}`);
      return { success: false, error: msg };
    }
  },

  /**
   * アーカイブDBからIDで支払いを検索（P2-5: findById拡張）
   * @param {string} payoutId - 支払ID
   * @returns {Object|null} 支払いレコード（_archived, _archiveFiscalYear付き）またはnull
   */
  _findInArchive: function(payoutId: string): PayoutRecord | null {
    const currentFiscalYear = ArchiveService.getCurrentFiscalYear();

    // 直近3年度分のアーカイブを検索（新しい年度から）
    for (let y = currentFiscalYear - 1; y >= currentFiscalYear - 3 && y >= 2020; y--) {
      const archiveDbId = ArchiveService.getArchiveDbId(y);
      if (!archiveDbId) continue;

      try {
        const archiveDb = SpreadsheetApp.openById(archiveDbId);
        const sheetName = TABLE_SHEET_MAP[this.TABLE_NAME] || this.TABLE_NAME;
        const sheet = archiveDb.getSheetByName(sheetName);
        if (!sheet) continue;

        const data = sheet.getDataRange().getValues();
        if (data.length <= 1) continue;

        const headers = data[0];
        const idColIndex = headers.indexOf(this.ID_COLUMN);
        if (idColIndex === -1) continue;

        for (let i = 1; i < data.length; i++) {
          if (data[i][idColIndex] === payoutId) {
            const record: Record<string, unknown> = {};
            for (let j = 0; j < headers.length; j++) {
              record[headers[j]] = data[i][j];
            }
            // アーカイブフラグを付与
            record._archived = true;
            record._archiveFiscalYear = y;

            // 正規化して返す
            return this._normalizeRecord(record);
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        Logger.log(`アーカイブDB検索エラー (${y}): ${msg}`);
      }
    }

    return null;
  }
};
