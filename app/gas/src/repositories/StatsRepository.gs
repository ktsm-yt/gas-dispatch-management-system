/**
 * Stats Repository
 *
 * T_MonthlyStats テーブルのシートI/O処理
 * P2-6: 売上分析ダッシュボード用の月次統計データ管理
 *
 * スキーマ: year（西暦年）+ month で管理
 * 会計年度は必要に応じて動的に計算: month >= 3 ? year : year - 1（2月決算）
 */

const StatsRepository = {
  TABLE_NAME: 'T_MonthlyStats',
  ID_COLUMN: 'stat_id',

  /**
   * IDで統計を取得
   * @param {string} statId - 統計ID
   * @returns {Object|null} 統計レコードまたはnull
   */
  findById: function(statId) {
    const record = getRecordById(this.TABLE_NAME, this.ID_COLUMN, statId);
    if (!record) return null;
    return this._normalizeRecord(record);
  },

  /**
   * 年と月で統計を取得
   * @param {number} year - 西暦年
   * @param {number} month - 月（1-12）
   * @returns {Object|null} 統計レコードまたはnull
   */
  findByPeriod: function(year, month) {
    const records = getAllRecords(this.TABLE_NAME);

    const found = records.find(r =>
      r.year === year &&
      r.month === month
    );

    return found ? this._normalizeRecord(found) : null;
  },

  /**
   * 会計年度で統計を検索
   * 日本の会計年度（4月〜翌年3月）に対応
   * @param {number} fiscalYear - 会計年度（例: 2025 = 2025年4月〜2026年3月）
   * @returns {Object[]} 統計配列（月順: 4,5,...,12,1,2,3）
   */
  findByFiscalYear: function(fiscalYear) {
    // 会計年度は3月〜翌年2月（2月決算）
    // fiscalYear=2025 → 2025年3月〜2026年2月
    return this.findByRange(fiscalYear, 3, fiscalYear + 1, 2);
  },

  /**
   * 暦年で統計を検索
   * @param {number} calendarYear - 暦年（例: 2025 = 2025年1月〜12月）
   * @returns {Object[]} 統計配列（月順）
   */
  findByCalendarYear: function(calendarYear) {
    let records = getAllRecords(this.TABLE_NAME);

    records = records.filter(r => r.year === calendarYear);

    // 月順でソート
    records.sort((a, b) => a.month - b.month);

    return records.map(r => this._normalizeRecord(r));
  },

  /**
   * 期間で統計を検索
   * @param {number} startYear - 開始年（西暦）
   * @param {number} startMonth - 開始月
   * @param {number} endYear - 終了年（西暦）
   * @param {number} endMonth - 終了月
   * @returns {Object[]} 統計配列（年月順）
   */
  findByRange: function(startYear, startMonth, endYear, endMonth) {
    let records = getAllRecords(this.TABLE_NAME);

    records = records.filter(r => {
      const recordYM = r.year * 100 + r.month;
      const startYM = startYear * 100 + startMonth;
      const endYM = endYear * 100 + endMonth;
      return recordYM >= startYM && recordYM <= endYM;
    });

    // 年月順でソート
    records.sort((a, b) => {
      if (a.year !== b.year) {
        return a.year - b.year;
      }
      return a.month - b.month;
    });

    return records.map(r => this._normalizeRecord(r));
  },

  /**
   * 確定済み統計のみ取得
   * @param {number} calendarYear - 暦年（省略時は全年度）
   * @returns {Object[]} 確定済み統計配列
   */
  findFinalizedStats: function(calendarYear = null) {
    let records = getAllRecords(this.TABLE_NAME);

    records = records.filter(r => r.is_final === true);

    if (calendarYear !== null) {
      records = records.filter(r => r.year === calendarYear);
    }

    // 年月順でソート
    records.sort((a, b) => {
      if (a.year !== b.year) {
        return a.year - b.year;
      }
      return a.month - b.month;
    });

    return records.map(r => this._normalizeRecord(r));
  },

  /**
   * 新規統計を作成
   * @param {Object} stats - 統計データ
   * @returns {Object} 作成した統計
   */
  insert: function(stats) {
    const now = getCurrentTimestamp();

    const newStats = {
      stat_id: stats.stat_id || generateId('stat'),
      year: stats.year,
      month: stats.month,
      job_count: stats.job_count || 0,
      assignment_count: stats.assignment_count || 0,
      work_amount: stats.work_amount || 0,
      expense_amount: stats.expense_amount || 0,
      invoice_subtotal: stats.invoice_subtotal || 0,
      invoice_tax: stats.invoice_tax || 0,
      invoice_total: stats.invoice_total || 0,
      payout_total: stats.payout_total || 0,
      transport_total: stats.transport_total || 0,
      gross_margin: stats.gross_margin || 0,
      margin_rate: stats.margin_rate || 0,
      is_final: stats.is_final || false,
      created_at: now,
      updated_at: now
    };

    insertRecord(this.TABLE_NAME, newStats);

    return this._normalizeRecord(newStats);
  },

  /**
   * 統計を更新（upsert: 存在しなければ作成）
   * @param {number} year - 西暦年
   * @param {number} month - 月
   * @param {Object} stats - 統計データ
   * @returns {Object} 更新結果 { success: boolean, stats: Object, created: boolean }
   */
  upsert: function(year, month, stats) {
    const existing = this.findByPeriod(year, month);

    if (existing) {
      // 既存レコードを更新
      const result = this.update(existing.stat_id, stats);
      return {
        success: result.success,
        stats: result.stats,
        created: false
      };
    } else {
      // 新規作成
      const newStats = this.insert({
        ...stats,
        year: year,
        month: month
      });
      return {
        success: true,
        stats: newStats,
        created: true
      };
    }
  },

  /**
   * 統計を更新
   * @param {string} statId - 統計ID
   * @param {Object} updates - 更新データ
   * @returns {Object} 更新結果 { success: boolean, stats?: Object, error?: string }
   */
  update: function(statId, updates) {
    const sheet = getSheet(this.TABLE_NAME);
    const rowNum = findRowById(sheet, this.ID_COLUMN, statId);

    if (!rowNum) {
      return { success: false, error: 'NOT_FOUND' };
    }

    const headers = getHeaders(sheet);
    const currentRow = sheet.getRange(rowNum, 1, 1, headers.length).getValues()[0];
    const currentStats = rowToObject(headers, currentRow);

    const now = getCurrentTimestamp();

    // 更新可能フィールド
    const updatableFields = [
      'job_count', 'assignment_count',
      'work_amount', 'expense_amount', 'invoice_subtotal', 'invoice_tax', 'invoice_total',
      'payout_total', 'transport_total',
      'gross_margin', 'margin_rate',
      'is_final'
    ];

    const updatedStats = { ...currentStats };

    for (const field of updatableFields) {
      if (updates[field] !== undefined) {
        updatedStats[field] = updates[field];
      }
    }

    updatedStats.updated_at = now;

    const newRow = objectToRow(headers, updatedStats);
    sheet.getRange(rowNum, 1, 1, headers.length).setValues([newRow]);

    return {
      success: true,
      stats: this._normalizeRecord(updatedStats)
    };
  },

  /**
   * 統計を確定（is_final = true）
   * @param {number} year - 西暦年
   * @param {number} month - 月
   * @returns {Object} 確定結果 { success: boolean, stats?: Object, error?: string }
   */
  finalize: function(year, month) {
    const existing = this.findByPeriod(year, month);

    if (!existing) {
      return { success: false, error: 'NOT_FOUND' };
    }

    if (existing.is_final) {
      // 既に確定済み
      return { success: true, stats: existing };
    }

    return this.update(existing.stat_id, { is_final: true });
  },

  /**
   * 全統計を取得
   * @returns {Object[]} 統計配列（年月順）
   */
  findAll: function() {
    const records = getAllRecords(this.TABLE_NAME);

    // 年月順でソート
    records.sort((a, b) => {
      if (a.year !== b.year) {
        return a.year - b.year;
      }
      return a.month - b.month;
    });

    return records.map(r => this._normalizeRecord(r));
  },

  /**
   * 会計年度の集計サマリーを取得
   * 会計年度（3月〜翌年2月、2月決算）で集計
   * @param {number} fiscalYear - 会計年度（例: 2025 = 2025年3月〜2026年2月）
   * @returns {Object} 集計結果
   */
  getYearlySummary: function(fiscalYear) {
    const records = this.findByFiscalYear(fiscalYear);

    if (records.length === 0) {
      return {
        fiscal_year: fiscalYear,
        months_count: 0,
        total_job_count: 0,
        total_assignment_count: 0,
        total_invoice: 0,
        total_payout: 0,
        total_transport: 0,
        total_gross_margin: 0,
        average_margin_rate: 0,
        finalized_months: 0
      };
    }

    const summary = records.reduce((acc, r) => {
      acc.total_job_count += r.job_count;
      acc.total_assignment_count += r.assignment_count;
      acc.total_invoice += r.invoice_total;
      acc.total_payout += r.payout_total;
      acc.total_transport += r.transport_total;
      acc.total_gross_margin += r.gross_margin;
      if (r.is_final) acc.finalized_months++;
      return acc;
    }, {
      total_job_count: 0,
      total_assignment_count: 0,
      total_invoice: 0,
      total_payout: 0,
      total_transport: 0,
      total_gross_margin: 0,
      finalized_months: 0
    });

    // 平均粗利率を計算
    const avgMarginRate = summary.total_invoice > 0
      ? (summary.total_gross_margin / summary.total_invoice) * 100
      : 0;

    return {
      fiscal_year: fiscalYear,
      months_count: records.length,
      ...summary,
      average_margin_rate: Math.round(avgMarginRate * 100) / 100
    };
  },

  /**
   * レコードを正規化
   * @param {Object} record - レコード
   * @returns {Object} 正規化されたレコード
   */
  _normalizeRecord: function(record) {
    return {
      ...record,
      year: Number(record.year) || 0,
      month: Number(record.month) || 0,
      job_count: Number(record.job_count) || 0,
      assignment_count: Number(record.assignment_count) || 0,
      work_amount: Number(record.work_amount) || 0,
      expense_amount: Number(record.expense_amount) || 0,
      invoice_subtotal: Number(record.invoice_subtotal) || 0,
      invoice_tax: Number(record.invoice_tax) || 0,
      invoice_total: Number(record.invoice_total) || 0,
      payout_total: Number(record.payout_total) || 0,
      transport_total: Number(record.transport_total) || 0,
      gross_margin: Number(record.gross_margin) || 0,
      margin_rate: Number(record.margin_rate) || 0,
      is_final: record.is_final === true || record.is_final === 'true'
    };
  }
};
