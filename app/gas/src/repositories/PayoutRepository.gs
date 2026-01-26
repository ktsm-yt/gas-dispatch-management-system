/**
 * Payout Repository
 *
 * T_Payouts テーブルのシートI/O処理
 * 差分支払い方式: period_start/period_endで集計期間を管理
 */

const PayoutRepository = {
  TABLE_NAME: 'T_Payouts',
  ID_COLUMN: 'payout_id',

  /**
   * IDで支払いを取得
   * @param {string} payoutId - 支払ID
   * @returns {Object|null} 支払いレコードまたはnull
   */
  findById: function(payoutId) {
    const record = getRecordById(this.TABLE_NAME, this.ID_COLUMN, payoutId);
    if (!record) return null;

    return this._normalizeRecord(record);
  },

  /**
   * スタッフIDで支払いを検索
   * @param {string} staffId - スタッフID
   * @param {Object} options - オプション
   * @param {number} options.limit - 取得件数制限
   * @returns {Object[]} 支払い配列
   */
  findByStaffId: function(staffId, options = {}) {
    let records = getAllRecords(this.TABLE_NAME);

    records = records.filter(r =>
      !r.is_deleted &&
      r.payout_type === 'STAFF' &&
      r.staff_id === staffId
    );

    // paid_date優先でソート（新しい順）- searchと統一
    records.sort((a, b) => {
      const dateA = this._parseLocalDate(a.paid_date || a.period_end);
      const dateB = this._parseLocalDate(b.paid_date || b.period_end);
      return dateB - dateA;
    });

    if (options.limit && options.limit > 0) {
      records = records.slice(0, options.limit);
    }

    return records.map(r => this._normalizeRecord(r));
  },

  /**
   * 外注先IDで支払いを検索
   * @param {string} subcontractorId - 外注先ID
   * @param {Object} options - オプション
   * @returns {Object[]} 支払い配列
   */
  findBySubcontractorId: function(subcontractorId, options = {}) {
    let records = getAllRecords(this.TABLE_NAME);

    records = records.filter(r =>
      !r.is_deleted &&
      r.payout_type === 'SUBCONTRACTOR' &&
      r.subcontractor_id === subcontractorId
    );

    // paid_date優先でソート（新しい順）- searchと統一
    records.sort((a, b) => {
      const dateA = this._parseLocalDate(a.paid_date || a.period_end);
      const dateB = this._parseLocalDate(b.paid_date || b.period_end);
      return dateB - dateA;
    });

    if (options.limit && options.limit > 0) {
      records = records.slice(0, options.limit);
    }

    return records.map(r => this._normalizeRecord(r));
  },

  /**
   * スタッフの最新支払いを取得（差分計算の起点）
   * @param {string} staffId - スタッフID
   * @returns {Object|null} 最新の支払いまたはnull
   */
  findLastPayout: function(staffId) {
    const payouts = this.findByStaffId(staffId, { limit: 1 });
    return payouts.length > 0 ? payouts[0] : null;
  },

  /**
   * 外注先の最新支払いを取得（period_end の最大値で決定）
   * 差分計算の起点として使用するため、paid_date ではなく period_end で判定
   * @param {string} subcontractorId - 外注先ID
   * @returns {Object|null} period_end が最大の支払いまたはnull
   */
  findLastPayoutForSubcontractor: function(subcontractorId) {
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
      const dateA = this._parseLocalDate(a.period_end);
      const dateB = this._parseLocalDate(b.period_end);
      return dateB - dateA;
    });

    return this._normalizeRecord(records[0]);
  },

  /**
   * 条件で支払いを検索
   * @param {Object} query - 検索条件
   * @param {string} query.payout_type - 種別（STAFF/SUBCONTRACTOR）
   * @param {string} query.staff_id - スタッフID
   * @param {string} query.subcontractor_id - 外注先ID
   * @param {string} query.status - ステータス（単一）
   * @param {string[]} query.status_in - ステータス（複数、OR検索）
   * @param {string} query.period_start_from - 期間開始日（以降）
   * @param {string} query.period_end_to - 期間終了日（以前）
   * @param {string} query.paid_date_from - 支払日（以降）
   * @param {string} query.paid_date_to - 支払日（以前）
   * @param {number} query.limit - 取得件数制限
   * @returns {Object[]} 支払い配列
   */
  search: function(query = {}) {
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
      records = records.filter(r => query.status_in.includes(r.status));
    }

    // 期間開始日（以降）で絞り込み
    if (query.period_start_from) {
      const fromDate = this._parseLocalDate(query.period_start_from);
      records = records.filter(r => this._parseLocalDate(r.period_start) >= fromDate);
    }

    // 期間終了日（以前）で絞り込み
    if (query.period_end_to) {
      const toDate = this._parseLocalDate(query.period_end_to);
      records = records.filter(r => this._parseLocalDate(r.period_end) <= toDate);
    }

    // 支払日（以降）で絞り込み
    if (query.paid_date_from) {
      const fromDate = this._parseLocalDate(query.paid_date_from);
      records = records.filter(r => {
        const paidDate = this._parseLocalDate(r.paid_date);
        return paidDate && paidDate >= fromDate;
      });
    }

    // 支払日（以前）で絞り込み
    if (query.paid_date_to) {
      const toDate = this._parseLocalDate(query.paid_date_to);
      records = records.filter(r => {
        const paidDate = this._parseLocalDate(r.paid_date);
        return paidDate && paidDate <= toDate;
      });
    }

    // ソート（デフォルト: paid_date降順＝最新が上）
    const sortOrder = query.sort_order || 'desc';

    records.sort((a, b) => {
      // paid_dateがあればそれを優先、なければperiod_endを使用
      const dateA = this._parseLocalDate(a.paid_date || a.period_end);
      const dateB = this._parseLocalDate(b.paid_date || b.period_end);
      // desc: 新しい順（dateB - dateA）、asc: 古い順（dateA - dateB）
      return sortOrder === 'desc' ? (dateB - dateA) : (dateA - dateB);
    });

    // 件数制限
    if (query.limit && query.limit > 0) {
      records = records.slice(0, query.limit);
    }

    return records.map(r => this._normalizeRecord(r));
  },

  /**
   * 新規支払いを作成
   * @param {Object} payout - 支払いデータ
   * @returns {Object} 作成した支払い
   */
  insert: function(payout) {
    const user = getCurrentUserEmail();
    const now = getCurrentTimestamp();

    const newPayout = {
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

    return newPayout;
  },

  /**
   * 支払いを一括挿入
   * @param {Object[]} payouts - 支払いデータ配列
   * @returns {Object[]} 作成した支払い配列
   */
  insertBulk: function(payouts) {
    if (!payouts || payouts.length === 0) {
      return [];
    }

    const user = getCurrentUserEmail();
    const now = getCurrentTimestamp();

    const newPayouts = payouts.map(payout => ({
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

    return newPayouts;
  },

  /**
   * 支払いを更新（楽観ロック付き）
   * @param {Object} payout - 更新データ（payout_id必須）
   * @param {string} expectedUpdatedAt - 期待するupdated_at
   * @returns {Object} 更新結果 { success: boolean, payout?: Object, error?: string }
   */
  update: function(payout, expectedUpdatedAt) {
    if (!payout.payout_id) {
      return { success: false, error: 'payout_id is required' };
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
        currentUpdatedAt: currentPayout.updated_at
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

    const updatedPayout = { ...currentPayout };

    for (const field of updatableFields) {
      if (payout[field] !== undefined) {
        updatedPayout[field] = payout[field];
      }
    }

    updatedPayout.updated_at = now;

    const newRow = objectToRow(headers, updatedPayout);
    sheet.getRange(rowNum, 1, 1, headers.length).setValues([newRow]);

    return {
      success: true,
      payout: this._normalizeRecord(updatedPayout),
      before: currentPayout
    };
  },

  /**
   * 論理削除
   * @param {string} payoutId - 支払ID
   * @param {string} expectedUpdatedAt - 期待するupdated_at
   * @returns {Object} 削除結果 { success: boolean, error?: string }
   */
  softDelete: function(payoutId, expectedUpdatedAt) {
    return this.update(
      { payout_id: payoutId, is_deleted: true },
      expectedUpdatedAt
    );
  },

  /**
   * ステータスを更新
   * @param {string} payoutId - 支払ID
   * @param {string} status - 新ステータス（draft/confirmed/paid）
   * @param {string} expectedUpdatedAt - 期待するupdated_at
   * @returns {Object} 更新結果
   */
  updateStatus: function(payoutId, status, expectedUpdatedAt) {
    const updateData = { payout_id: payoutId, status: status };

    // paidステータスの場合はpaid_dateも設定
    if (status === 'paid') {
      updateData.paid_date = getCurrentTimestamp().split('T')[0];
    }

    return this.update(updateData, expectedUpdatedAt);
  },

  /**
   * 一括挿入
   * @param {Object[]} payouts - 支払いデータ配列
   * @returns {Object[]} 作成した支払い配列
   */
  bulkInsert: function(payouts) {
    const results = [];
    for (const payout of payouts) {
      results.push(this.insert(payout));
    }
    return results;
  },

  /**
   * レコードを正規化
   * @param {Object} record - レコード
   * @returns {Object} 正規化されたレコード
   */
  _normalizeRecord: function(record) {
    return {
      ...record,
      period_start: this._normalizeDate(record.period_start),
      period_end: this._normalizeDate(record.period_end),
      paid_date: this._normalizeDate(record.paid_date),
      assignment_count: Number(record.assignment_count) || 0,
      base_amount: Number(record.base_amount) || 0,
      transport_amount: Number(record.transport_amount) || 0,
      adjustment_amount: Number(record.adjustment_amount) || 0,
      tax_amount: Number(record.tax_amount) || 0,
      total_amount: Number(record.total_amount) || 0
    };
  },

  /**
   * 日付を正規化してYYYY-MM-DD形式の文字列に変換
   * @param {Date|string} dateValue - 日付値
   * @returns {string} 正規化された日付文字列
   */
  _normalizeDate: function(dateValue) {
    if (!dateValue) return '';

    if (dateValue instanceof Date) {
      return Utilities.formatDate(dateValue, 'Asia/Tokyo', 'yyyy-MM-dd');
    }

    // 文字列の場合はスラッシュをハイフンに変換
    return String(dateValue).replace(/\//g, '-');
  },

  /**
   * 日付文字列をローカルタイムゾーンでパース（UTC解釈回避）
   * @param {string} dateStr - 日付文字列（YYYY-MM-DD形式）
   * @returns {Date|null} パースされた日付またはnull
   */
  _parseLocalDate: function(dateStr) {
    if (!dateStr) return null;

    const normalized = this._normalizeDate(dateStr);
    if (!normalized) return null;

    const parts = normalized.split('-');
    if (parts.length !== 3) return new Date(dateStr); // フォールバック

    const [y, m, d] = parts.map(Number);
    return new Date(y, m - 1, d); // ローカルタイムゾーンで作成
  }
};
