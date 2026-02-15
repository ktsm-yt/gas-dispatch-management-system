/**
 * Stats Service
 *
 * P2-6: 売上分析ダッシュボード用の月次統計計算サービス
 *
 * 月次統計は以下のソースから集計:
 * - T_Invoices: 請求データ（売上）
 * - T_Payouts: 支払データ（費用）
 * - T_Jobs: 案件データ（件数）
 * - T_JobAssignments: 配置データ（配置数）
 */

const StatsService = {
  /**
   * 指定月の統計を計算
   * @param {number} year - 年（西暦）
   * @param {number} month - 月（1-12）
   * @returns {Object} 計算した統計データ
   */
  calculateMonthlyStats: function(year, month) {
    // 請求データの集計（billing_year/monthで検索）
    const invoiceStats = this._aggregateInvoices(year, month);

    // 支払データの集計（期間で検索）
    const payoutStats = this._aggregatePayouts(year, month);

    // 案件・配置数の集計（work_dateで検索）
    const jobStats = this._aggregateJobs(year, month);

    // 粗利計算
    const grossMargin = invoiceStats.invoice_total - payoutStats.payout_total;
    const marginRate = invoiceStats.invoice_total > 0
      ? Math.round((grossMargin / invoiceStats.invoice_total) * 10000) / 100
      : 0;

    return {
      year: year,
      month: month,
      // 案件・配置
      job_count: jobStats.job_count,
      assignment_count: jobStats.assignment_count,
      // 売上内訳
      work_amount: invoiceStats.work_amount,
      expense_amount: invoiceStats.expense_amount,
      invoice_subtotal: invoiceStats.invoice_subtotal,
      invoice_tax: invoiceStats.invoice_tax,
      invoice_total: invoiceStats.invoice_total,
      // 費用
      payout_total: payoutStats.payout_total,
      transport_total: payoutStats.transport_total,
      // 利益
      gross_margin: grossMargin,
      margin_rate: marginRate
    };
  },

  /**
   * 指定月の統計を計算して保存（upsert）
   * @param {number} year - 年
   * @param {number} month - 月
   * @returns {Object} 保存結果 { success, stats, created }
   */
  updateMonthlyStats: function(year, month) {
    const stats = this.calculateMonthlyStats(year, month);

    // 既に確定済みの場合はスキップ
    const existing = StatsRepository.findByPeriod(year, month);
    if (existing && existing.is_final) {
      return {
        success: false,
        error: 'ALREADY_FINALIZED',
        stats: existing
      };
    }

    return StatsRepository.upsert(year, month, stats);
  },

  /**
   * 指定月の統計を確定
   * @param {number} year - 年
   * @param {number} month - 月
   * @returns {Object} 確定結果 { success, stats, error }
   */
  finalizeMonthStats: function(year, month) {
    // まず最新の統計を計算・保存
    const updateResult = this.updateMonthlyStats(year, month);

    if (!updateResult.success && updateResult.error !== 'ALREADY_FINALIZED') {
      return updateResult;
    }

    // 確定フラグを設定
    return StatsRepository.finalize(year, month);
  },

  /**
   * 当月の統計を更新（日次トリガー用）
   * @returns {Object} 更新結果
   */
  updateCurrentMonthStats: function() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    return this.updateMonthlyStats(year, month);
  },

  /**
   * 前月の統計を確定（月次トリガー用）
   * @returns {Object} 確定結果
   */
  finalizePreviousMonthStats: function() {
    const now = new Date();
    let year = now.getFullYear();
    let month = now.getMonth(); // 前月

    if (month === 0) {
      month = 12;
      year--;
    }

    return this.finalizeMonthStats(year, month);
  },

  /**
   * 会計年度の統計サマリーを取得
   * @param {number} fiscalYear - 会計年度
   * @returns {Object} 年度サマリー
   */
  getYearlySummary: function(fiscalYear) {
    return StatsRepository.getYearlySummary(fiscalYear);
  },

  /**
   * ダッシュボード用データを取得
   * @param {Object} options - オプション
   * @param {string} options.period - 期間（thisMonth/lastMonth/thisYear/lastYear/custom）
   * @param {number} options.startYear - カスタム開始年
   * @param {number} options.startMonth - カスタム開始月
   * @param {number} options.endYear - カスタム終了年
   * @param {number} options.endMonth - カスタム終了月
   * @returns {Object} ダッシュボードデータ
   */
  getDashboardData: function(options = {}) {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    let startYear, startMonth, endYear, endMonth;

    switch (options.period) {
      case 'thisMonth':
        startYear = endYear = currentYear;
        startMonth = endMonth = currentMonth;
        break;

      case 'lastMonth':
        if (currentMonth === 1) {
          startYear = endYear = currentYear - 1;
          startMonth = endMonth = 12;
        } else {
          startYear = endYear = currentYear;
          startMonth = endMonth = currentMonth - 1;
        }
        break;

      case 'thisYear': {
        const thisFy = getFiscalYear_(new Date(currentYear, currentMonth - 1, 1));
        const thisRange = getFiscalYearRange_(thisFy);
        const thisStart = parseDate_(thisRange.startDate);
        startYear = thisStart.getFullYear();
        startMonth = thisStart.getMonth() + 1;
        endYear = currentYear;
        endMonth = currentMonth;
        break;
      }

      case 'lastYear': {
        const lastFy = getFiscalYear_(new Date(currentYear, currentMonth - 1, 1)) - 1;
        const lastRange = getFiscalYearRange_(lastFy);
        const lastStart = parseDate_(lastRange.startDate);
        const lastEnd = parseDate_(lastRange.endDate);
        startYear = lastStart.getFullYear();
        startMonth = lastStart.getMonth() + 1;
        endYear = lastEnd.getFullYear();
        endMonth = lastEnd.getMonth() + 1;
        break;
      }

      case 'custom':
        startYear = options.startYear;
        startMonth = options.startMonth;
        endYear = options.endYear;
        endMonth = options.endMonth;
        break;

      default:
        // デフォルトは今月
        startYear = endYear = currentYear;
        startMonth = endMonth = currentMonth;
    }

    // 顧客フィルタが指定された場合は専用ロジックに委譲
    if (options.customerId) {
      return this._getDashboardDataForCustomer(options.customerId, startYear, startMonth, endYear, endMonth);
    }

    // 期間内の統計を取得
    const monthlyStats = StatsRepository.findByRange(startYear, startMonth, endYear, endMonth);

    // 集計
    const totals = this._aggregateStats(monthlyStats);

    return {
      period: {
        start: { year: startYear, month: startMonth },
        end: { year: endYear, month: endMonth }
      },
      totals: totals,
      monthly: monthlyStats
    };
  },

  /**
   * 顧客フィルタ時のダッシュボードデータを取得
   * InvoiceRepositoryから生データを集計（アーカイブ含む）
   * @private
   */
  _getDashboardDataForCustomer: function(customerId, startYear, startMonth, endYear, endMonth) {
    // 期間内の全月バケットを0初期値で生成
    const monthly = [];
    const monthMap = {}; // "YYYY-MM" → monthly配列のindex
    let y = startYear, m = startMonth;
    while (y < endYear || (y === endYear && m <= endMonth)) {
      const key = y + '-' + m;
      monthMap[key] = monthly.length;
      monthly.push({
        year: y, month: m,
        invoice_total: 0,
        payout_total: null, transport_total: null,
        gross_margin: null, margin_rate: null,
        job_count: null, assignment_count: null,
        is_final: false
      });
      m++;
      if (m > 12) { m = 1; y++; }
    }

    // メインDB: 1回のgetValues + 列インデックス直参照（オブジェクト生成不要）
    const cidStr = String(customerId);
    const mainSheet = getSheet('T_Invoices');
    const mainData = mainSheet.getDataRange().getValues();
    if (mainData.length > 1) {
      const h = mainData[0];
      const col = {
        cid: h.indexOf('customer_id'), by: h.indexOf('billing_year'),
        bm: h.indexOf('billing_month'), total: h.indexOf('total_amount'),
        del: h.indexOf('is_deleted')
      };
      for (let i = 1; i < mainData.length; i++) {
        const row = mainData[i];
        if (row[col.del]) continue;
        if (String(row[col.cid]) !== cidStr) continue;
        const key = Number(row[col.by]) + '-' + Number(row[col.bm]);
        if (key in monthMap) {
          monthly[monthMap[key]].invoice_total += Number(row[col.total]) || 0;
        }
      }
    }

    // アーカイブDBからも取得（期間に含まれる会計年度を特定）
    const fiscalYears = new Set();
    for (const entry of monthly) {
      fiscalYears.add(getFiscalYear_(new Date(entry.year, entry.month - 1, 1)));
    }
    for (const fy of fiscalYears) {
      const archiveDbId = ArchiveService.getArchiveDbId(fy);
      if (!archiveDbId) continue;
      try {
        const archiveDb = SpreadsheetApp.openById(archiveDbId);
        const sheet = findSheetFromDb(archiveDb, 'T_Invoices');
        if (!sheet) continue;
        const data = sheet.getDataRange().getValues();
        if (data.length <= 1) continue;
        // 列インデックス直参照（オブジェクト生成不要）
        const h = data[0];
        const col = {
          cid: h.indexOf('customer_id'), by: h.indexOf('billing_year'),
          bm: h.indexOf('billing_month'), total: h.indexOf('total_amount'),
          del: h.indexOf('is_deleted')
        };
        for (let i = 1; i < data.length; i++) {
          const row = data[i];
          if (row[col.del]) continue;
          if (String(row[col.cid]) !== cidStr) continue;
          const key = Number(row[col.by]) + '-' + Number(row[col.bm]);
          if (key in monthMap) {
            monthly[monthMap[key]].invoice_total += Number(row[col.total]) || 0;
          }
        }
      } catch (e) {
        Logger.log('顧客フィルタ: アーカイブ読み込みエラー: ' + e.message);
      }
    }

    // 集計
    let totalInvoice = 0;
    for (const entry of monthly) {
      totalInvoice += entry.invoice_total;
    }

    return {
      period: {
        start: { year: startYear, month: startMonth },
        end: { year: endYear, month: endMonth }
      },
      totals: {
        invoice_total: totalInvoice,
        payout_total: null,
        transport_total: null,
        gross_margin: null,
        margin_rate: null,
        job_count: null,
        assignment_count: null
      },
      monthly: monthly
    };
  },

  /**
   * 請求データを集計
   * @private
   */
  _aggregateInvoices: function(year, month) {
    const invoices = InvoiceRepository.findByPeriod(year, month);

    const result = {
      work_amount: 0,      // 作業費（subtotal - expense_amount）
      expense_amount: 0,   // 諸経費
      invoice_subtotal: 0, // 小計（税抜）
      invoice_tax: 0,      // 消費税
      invoice_total: 0     // 合計（税込）
    };

    for (const inv of invoices) {
      if (inv.is_deleted) continue;

      const subtotal = Number(inv.subtotal) || 0;
      const expense = Number(inv.expense_amount) || 0;
      const tax = Number(inv.tax_amount) || 0;
      const total = Number(inv.total_amount) || 0;

      result.work_amount += subtotal;           // subtotalは作業費のみ
      result.expense_amount += expense;
      result.invoice_subtotal += (subtotal + expense);
      result.invoice_tax += tax;
      result.invoice_total += total;
    }

    return result;
  },

  /**
   * 支払データを集計
   * @private
   */
  _aggregatePayouts: function(year, month) {
    // 月の開始日と終了日を計算
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    // 全支払データを取得してフィルタリング
    const allPayouts = getAllRecords('T_Payouts');

    const result = {
      payout_total: 0,
      transport_total: 0
    };

    for (const payout of allPayouts) {
      if (payout.is_deleted) continue;
      if (payout.status !== 'paid' && payout.status !== 'confirmed') continue;

      // period_startが月内に含まれるものを集計
      const periodStart = payout.period_start;
      if (periodStart >= startDate && periodStart <= endDate) {
        result.payout_total += Number(payout.total_amount) || 0;
        result.transport_total += Number(payout.transport_amount) || 0;
      }
    }

    return result;
  },

  /**
   * 案件・配置データを集計
   * @private
   */
  _aggregateJobs: function(year, month) {
    // 月の開始日と終了日
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    // 案件を取得
    const allJobs = getAllRecords('T_Jobs');
    let jobCount = 0;

    const jobIdsInMonth = new Set();

    for (const job of allJobs) {
      if (job.is_deleted) continue;

      const workDate = this._normalizeDate(job.work_date);
      if (workDate >= startDate && workDate <= endDate) {
        jobCount++;
        jobIdsInMonth.add(job.job_id);
      }
    }

    // 配置を取得
    // ASSIGNED: 配置済み, CONFIRMED: 確定済み（両方とも有効な配置としてカウント）
    const VALID_ASSIGNMENT_STATUSES = ['ASSIGNED', 'CONFIRMED'];
    const allAssignments = getAllRecords('T_JobAssignments');
    let assignmentCount = 0;

    for (const asg of allAssignments) {
      if (asg.is_deleted) continue;
      if (!VALID_ASSIGNMENT_STATUSES.includes(asg.status)) continue;

      // 配置が紐づく案件が月内にあるか確認
      if (jobIdsInMonth.has(asg.job_id)) {
        assignmentCount++;
      }
    }

    return {
      job_count: jobCount,
      assignment_count: assignmentCount
    };
  },

  /**
   * 統計配列を集計
   * @private
   */
  _aggregateStats: function(stats) {
    const totals = {
      job_count: 0,
      assignment_count: 0,
      work_amount: 0,
      expense_amount: 0,
      invoice_subtotal: 0,
      invoice_tax: 0,
      invoice_total: 0,
      payout_total: 0,
      transport_total: 0,
      gross_margin: 0
    };

    for (const s of stats) {
      totals.job_count += s.job_count;
      totals.assignment_count += s.assignment_count;
      totals.work_amount += s.work_amount;
      totals.expense_amount += s.expense_amount;
      totals.invoice_subtotal += s.invoice_subtotal;
      totals.invoice_tax += s.invoice_tax;
      totals.invoice_total += s.invoice_total;
      totals.payout_total += s.payout_total;
      totals.transport_total += s.transport_total;
      totals.gross_margin += s.gross_margin;
    }

    // 平均粗利率を計算
    totals.margin_rate = totals.invoice_total > 0
      ? Math.round((totals.gross_margin / totals.invoice_total) * 10000) / 100
      : 0;

    return totals;
  },

  /**
   * 日付を正規化
   * @private
   */
  _normalizeDate: function(dateValue) {
    if (!dateValue) return '';

    if (dateValue instanceof Date) {
      return Utilities.formatDate(dateValue, 'Asia/Tokyo', 'yyyy-MM-dd');
    }

    return String(dateValue).replace(/\//g, '-');
  }
};
