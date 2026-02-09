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

      case 'thisYear':
        // 会計年度（3月〜翌2月、2月決算）
        if (currentMonth >= 3) {
          startYear = currentYear;
          startMonth = 3;
          endYear = currentYear;
          endMonth = currentMonth;
        } else {
          startYear = currentYear - 1;
          startMonth = 3;
          endYear = currentYear;
          endMonth = currentMonth;
        }
        break;

      case 'lastYear':
        // 前会計年度（2月決算）
        if (currentMonth >= 3) {
          startYear = currentYear - 1;
          startMonth = 3;
          endYear = currentYear;
          endMonth = 2;
        } else {
          startYear = currentYear - 2;
          startMonth = 3;
          endYear = currentYear - 1;
          endMonth = 2;
        }
        break;

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
   * 顧客別月次集計を取得
   * @param {number} fiscalYear - 会計年度（例: 2025 → 2025年3月〜2026年2月）
   * @returns {Object} { customers, fiscalYear, monthOrder }
   */
  getCustomerMonthlyBreakdown: function(fiscalYear) {
    const monthOrder = [3,4,5,6,7,8,9,10,11,12,1,2];
    const customerMap = MasterCache.getCustomerMap();

    // 現在DBから一括取得し、年度範囲でフィルタ（シート読み込み1回）
    const allRecords = getAllRecords('T_Invoices');
    const allInvoices = allRecords.filter(function(r) {
      if (r.is_deleted) return false;
      const bm = Number(r.billing_month);
      const by = Number(r.billing_year);
      return (bm >= 3 && by === fiscalYear) || (bm <= 2 && by === fiscalYear + 1);
    });

    // アーカイブDBからも取得
    const archiveDbId = ArchiveService.getArchiveDbId(fiscalYear);
    if (archiveDbId) {
      try {
        const archiveDb = SpreadsheetApp.openById(archiveDbId);
        const sheet = findSheetFromDb(archiveDb, 'T_Invoices');
        if (sheet) {
          const data = sheet.getDataRange().getValues();
          if (data.length > 1) {
            const headers = data[0];
            for (let i = 1; i < data.length; i++) {
              const record = {};
              for (let j = 0; j < headers.length; j++) {
                record[headers[j]] = data[i][j];
              }
              if (!record.is_deleted) {
                const bm = Number(record.billing_month);
                const by = Number(record.billing_year);
                // 年度内のデータのみ
                if (monthOrder.includes(bm) &&
                    ((bm >= 3 && by === fiscalYear) || (bm <= 2 && by === fiscalYear + 1))) {
                  allInvoices.push(record);
                }
              }
            }
          }
        }
      } catch (e) {
        Logger.log('顧客別集計: アーカイブ読み込みエラー: ' + e.message);
      }
    }

    // customer_id × month でグループ化
    const customerData = {};
    for (const inv of allInvoices) {
      const cid = inv.customer_id || 'unknown';
      const bm = Number(inv.billing_month);
      if (!customerData[cid]) {
        customerData[cid] = { months: {}, total: 0 };
      }
      const amount = Number(inv.total_amount) || 0;
      customerData[cid].months[bm] = (customerData[cid].months[bm] || 0) + amount;
      customerData[cid].total += amount;
    }

    // 結果を配列に変換（合計額降順）
    const customers = Object.keys(customerData).map(function(cid) {
      const customer = customerMap[cid];
      return {
        customer_id: cid,
        customer_name: customer ? customer.customer_name : cid,
        months: customerData[cid].months,
        total: customerData[cid].total
      };
    }).sort(function(a, b) { return b.total - a.total; });

    return {
      customers: customers,
      fiscalYear: fiscalYear,
      monthOrder: monthOrder
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
