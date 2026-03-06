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

    // 粗利計算（方針A: 売上=作業費+諸経費+調整額）
    const salesTotal = invoiceStats.work_amount + invoiceStats.expense_amount + invoiceStats.adjustment_total;
    const grossMargin = salesTotal - payoutStats.payout_total;
    const marginRate = salesTotal > 0
      ? Math.round((grossMargin / salesTotal) * 10000) / 100
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
      adjustment_total: invoiceStats.adjustment_total,
      invoice_subtotal: invoiceStats.invoice_subtotal,
      invoice_tax: invoiceStats.invoice_tax,
      invoice_total: invoiceStats.invoice_total,
      // 費用
      payout_total: payoutStats.payout_total,
      transport_total: payoutStats.transport_total,
      payout_confirmed: payoutStats.payout_confirmed || 0,
      payout_estimated: payoutStats.payout_estimated || 0,
      has_payout_estimate: payoutStats.has_payout_estimate || false,
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

    // 概算込みの支払データを一括取得 → 各月の stats に上書き
    // ただし is_final（確定済み）の月は保存値を維持する（アーカイブ後のデータ消失リスク回避）
    const payoutBuckets = this._aggregatePayoutsForRange(startYear, startMonth, endYear, endMonth);
    for (const s of monthlyStats) {
      if (s.is_final) continue;
      const key = s.year + '-' + s.month;
      const pb = payoutBuckets[key];
      if (pb) {
        s.payout_total = pb.payout_total;
        s.transport_total = pb.transport_total;
        s.payout_confirmed = pb.payout_confirmed;
        s.payout_estimated = pb.payout_estimated;
        s.has_payout_estimate = pb.has_payout_estimate;
        // 粗利再計算
        const salesTotal = s.work_amount + (s.expense_amount || 0) + (s.adjustment_total || 0);
        s.gross_margin = salesTotal - pb.payout_total;
        s.margin_rate = salesTotal > 0
          ? Math.round((s.gross_margin / salesTotal) * 10000) / 100
          : 0;
      }
    }

    // 集計
    const totals = this._aggregateStats(monthlyStats);

    // 概算フラグを totals に伝播
    totals.has_payout_estimate = monthlyStats.some(function(s) { return s.has_payout_estimate; });
    totals.payout_confirmed = monthlyStats.reduce(function(sum, s) { return sum + (s.payout_confirmed || 0); }, 0);
    totals.payout_estimated = monthlyStats.reduce(function(sum, s) { return sum + (s.payout_estimated || 0); }, 0);

    // 企業別集計
    var byCustomer = this._aggregateByCustomer(startYear, startMonth, endYear, endMonth);

    return {
      period: {
        start: { year: startYear, month: startMonth },
        end: { year: endYear, month: endMonth }
      },
      totals: totals,
      monthly: monthlyStats,
      byCustomer: byCustomer
    };
  },

  /**
   * 企業（顧客）別の売上集計（全顧客対象、売上降順）
   * @private
   * @param {number} startYear
   * @param {number} startMonth
   * @param {number} endYear
   * @param {number} endMonth
   * @returns {Array<{customerId, customerName, salesTotal, invoiceCount}>}
   */
  _aggregateByCustomer: function(startYear, startMonth, endYear, endMonth) {
    // 期間内の年月セットを生成（フィルタ用）
    var validMonths = {};
    var y = startYear, m = startMonth;
    while (y < endYear || (y === endYear && m <= endMonth)) {
      validMonths[y + '-' + m] = true;
      m++;
      if (m > 12) { m = 1; y++; }
    }

    // 顧客別バケット: { customerId: { salesTotal, invoiceCount } }
    var buckets = {};

    // シートからデータを集計する共通関数
    function aggregateSheet(sheet) {
      if (!sheet) return;
      var data = sheet.getDataRange().getValues();
      if (data.length <= 1) return;
      var h = data[0];
      var col = {
        cid: h.indexOf('customer_id'),
        by: h.indexOf('billing_year'),
        bm: h.indexOf('billing_month'),
        sub: h.indexOf('subtotal'),
        exp: h.indexOf('expense_amount'),
        adj: h.indexOf('adjustment_total'),
        del: h.indexOf('is_deleted')
      };
      for (var i = 1; i < data.length; i++) {
        var row = data[i];
        if (row[col.del]) continue;
        var key = Number(row[col.by]) + '-' + Number(row[col.bm]);
        if (!(key in validMonths)) continue;
        var cid = String(row[col.cid]);
        if (!buckets[cid]) buckets[cid] = { salesTotal: 0, expenseTotal: 0, invoiceCount: 0 };
        var subtotal = Number(row[col.sub]) || 0;
        var expense = Number(row[col.exp]) || 0;
        var adjustment = Number(row[col.adj]) || 0;
        buckets[cid].salesTotal += subtotal + adjustment;
        buckets[cid].expenseTotal += expense;
        buckets[cid].invoiceCount++;
      }
    }

    // メインDB
    aggregateSheet(getSheet('T_Invoices'));

    // アーカイブDB（期間に含まれる会計年度を特定）
    var fiscalYears = new Set();
    var yy = startYear, mm = startMonth;
    while (yy < endYear || (yy === endYear && mm <= endMonth)) {
      fiscalYears.add(getFiscalYear_(new Date(yy, mm - 1, 1)));
      mm++;
      if (mm > 12) { mm = 1; yy++; }
    }
    for (var fy of fiscalYears) {
      var archiveDbId = ArchiveService.getArchiveDbId(fy);
      if (!archiveDbId) continue;
      try {
        var archiveDb = SpreadsheetApp.openById(archiveDbId);
        var archSheet = findSheetFromDb(archiveDb, 'T_Invoices');
        aggregateSheet(archSheet);
      } catch (e) {
        Logger.log('企業別集計: アーカイブ読み込みエラー: ' + e.message);
      }
    }

    // M_Customers から表示名マッピング
    var customerNameMap = {};
    var custSheet = getSheet('M_Customers');
    var custData = custSheet.getDataRange().getValues();
    if (custData.length > 1) {
      var custH = custData[0];
      var custCol = {
        id: custH.indexOf('customer_id'),
        name: custH.indexOf('company_name'),
        branch: custH.indexOf('branch_name'),
        del: custH.indexOf('is_deleted')
      };
      for (var c = 1; c < custData.length; c++) {
        var cr = custData[c];
        if (cr[custCol.del]) continue;
        var cid = String(cr[custCol.id]);
        var name = String(cr[custCol.name] || '');
        var branch = String(cr[custCol.branch] || '');
        customerNameMap[cid] = name + (branch ? '（' + branch + '）' : '');
      }
    }

    // 結果配列に変換（売上・諸経費ともに0の企業を除外 + 合計降順ソート）
    var result = [];
    for (var id in buckets) {
      if (buckets[id].salesTotal === 0 && buckets[id].expenseTotal === 0) continue;
      result.push({
        customerId: id,
        customerName: customerNameMap[id] || '（不明）',
        salesTotal: buckets[id].salesTotal,
        expenseTotal: buckets[id].expenseTotal,
        invoiceCount: buckets[id].invoiceCount
      });
    }
    result.sort(function(a, b) { return (b.salesTotal + b.expenseTotal) - (a.salesTotal + a.expenseTotal); });
    return result;
  },

  /**
   * 企業別の売上を過去numYears年度分集計（年次比較タブ用）
   * T_Invoices を1回だけ読み、会計年度ごとにバケット分けする。
   * @param {number} numYears - 集計する年度数（デフォルト5）
   * @returns {Object} { fiscalYears: number[], customers: Array<{customerId, customerName, years: Object}> }
   */
  _aggregateByCustomerYearly: function(numYears) {
    numYears = numYears || 5;
    var now = new Date();
    var currentFy = getFiscalYear_(now);

    // 対象年度リスト（新しい順）
    var fiscalYears = [];
    for (var i = 0; i < numYears; i++) {
      fiscalYears.push(currentFy - i);
    }

    // 年月 → 会計年度マッピングを生成（全対象年度の開始月〜終了月）
    var monthToFy = {};
    for (var fi = 0; fi < fiscalYears.length; fi++) {
      var fy = fiscalYears[fi];
      var range = getFiscalYearRange_(fy);
      var start = parseDate_(range.startDate);
      var end = parseDate_(range.endDate);
      var sy = start.getFullYear(), sm = start.getMonth() + 1;
      var ey = end.getFullYear(), em = end.getMonth() + 1;
      var yy = sy, mm = sm;
      while (yy < ey || (yy === ey && mm <= em)) {
        monthToFy[yy + '-' + mm] = fy;
        mm++;
        if (mm > 12) { mm = 1; yy++; }
      }
    }

    // 顧客別 × 年度別バケット: { customerId: { fy: salesTotal } }
    var buckets = {};

    function aggregateSheet(sheet) {
      if (!sheet) return;
      var data = sheet.getDataRange().getValues();
      if (data.length <= 1) return;
      var h = data[0];
      var col = {
        cid: h.indexOf('customer_id'),
        by: h.indexOf('billing_year'),
        bm: h.indexOf('billing_month'),
        sub: h.indexOf('subtotal'),
        exp: h.indexOf('expense_amount'),
        adj: h.indexOf('adjustment_total'),
        del: h.indexOf('is_deleted')
      };
      for (var i = 1; i < data.length; i++) {
        var row = data[i];
        if (row[col.del]) continue;
        var key = Number(row[col.by]) + '-' + Number(row[col.bm]);
        var fy = monthToFy[key];
        if (fy === undefined) continue;
        var cid = String(row[col.cid]);
        if (!buckets[cid]) buckets[cid] = {};
        if (!buckets[cid][fy]) buckets[cid][fy] = { sales: 0, expense: 0 };
        var subtotal = Number(row[col.sub]) || 0;
        var expense = Number(row[col.exp]) || 0;
        var adjustment = Number(row[col.adj]) || 0;
        buckets[cid][fy].sales += subtotal + adjustment;
        buckets[cid][fy].expense += expense;
      }
    }

    // メインDB
    aggregateSheet(getSheet('T_Invoices'));

    // アーカイブDB（対象年度ごと）
    for (var ai = 0; ai < fiscalYears.length; ai++) {
      var archiveFy = fiscalYears[ai];
      var archiveDbId = ArchiveService.getArchiveDbId(archiveFy);
      if (!archiveDbId) continue;
      try {
        var archiveDb = SpreadsheetApp.openById(archiveDbId);
        var archSheet = findSheetFromDb(archiveDb, 'T_Invoices');
        aggregateSheet(archSheet);
      } catch (e) {
        Logger.log('年次比較: アーカイブ読み込みエラー (FY' + archiveFy + '): ' + e.message);
      }
    }

    // M_Customers から表示名マッピング
    var customerNameMap = {};
    var custSheet = getSheet('M_Customers');
    var custData = custSheet.getDataRange().getValues();
    if (custData.length > 1) {
      var custH = custData[0];
      var custCol = {
        id: custH.indexOf('customer_id'),
        name: custH.indexOf('company_name'),
        branch: custH.indexOf('branch_name'),
        del: custH.indexOf('is_deleted')
      };
      for (var c = 1; c < custData.length; c++) {
        var cr = custData[c];
        if (cr[custCol.del]) continue;
        var cid = String(cr[custCol.id]);
        var name = String(cr[custCol.name] || '');
        var branch = String(cr[custCol.branch] || '');
        customerNameMap[cid] = name + (branch ? '（' + branch + '）' : '');
      }
    }

    // 結果配列に変換（全年度0の企業を除外、最新年度の合計で降順ソート）
    var customers = [];
    for (var id in buckets) {
      var hasAnySales = false;
      var yearsData = {};
      for (var yi = 0; yi < fiscalYears.length; yi++) {
        var fyKey = fiscalYears[yi];
        var bucket = buckets[id][fyKey];
        if (bucket) {
          var total = bucket.sales + bucket.expense;
          yearsData[fyKey] = { sales: bucket.sales, expense: bucket.expense, total: total };
          if (total !== 0) hasAnySales = true;
        } else {
          yearsData[fyKey] = { sales: 0, expense: 0, total: 0 };
        }
      }
      if (!hasAnySales) continue;
      customers.push({
        customerId: id,
        customerName: customerNameMap[id] || '（不明）',
        years: yearsData
      });
    }
    customers.sort(function(a, b) {
      var aVal = a.years[currentFy] ? a.years[currentFy].total : 0;
      var bVal = b.years[currentFy] ? b.years[currentFy].total : 0;
      return bVal - aVal;
    });

    return {
      fiscalYears: fiscalYears,
      customers: customers
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
        work_amount: 0,
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
        sub: h.indexOf('subtotal'),
        del: h.indexOf('is_deleted')
      };
      for (let i = 1; i < mainData.length; i++) {
        const row = mainData[i];
        if (row[col.del]) continue;
        if (String(row[col.cid]) !== cidStr) continue;
        const key = Number(row[col.by]) + '-' + Number(row[col.bm]);
        if (key in monthMap) {
          monthly[monthMap[key]].invoice_total += Number(row[col.total]) || 0;
          monthly[monthMap[key]].work_amount += Number(row[col.sub]) || 0;
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
          sub: h.indexOf('subtotal'),
          del: h.indexOf('is_deleted')
        };
        for (let i = 1; i < data.length; i++) {
          const row = data[i];
          if (row[col.del]) continue;
          if (String(row[col.cid]) !== cidStr) continue;
          const key = Number(row[col.by]) + '-' + Number(row[col.bm]);
          if (key in monthMap) {
            monthly[monthMap[key]].invoice_total += Number(row[col.total]) || 0;
            monthly[monthMap[key]].work_amount += Number(row[col.sub]) || 0;
          }
        }
      } catch (e) {
        Logger.log('顧客フィルタ: アーカイブ読み込みエラー: ' + e.message);
      }
    }

    // 集計
    let totalInvoice = 0;
    let totalWorkAmount = 0;
    for (const entry of monthly) {
      totalInvoice += entry.invoice_total;
      totalWorkAmount += entry.work_amount;
    }

    return {
      period: {
        start: { year: startYear, month: startMonth },
        end: { year: endYear, month: endMonth }
      },
      totals: {
        invoice_total: totalInvoice,
        work_amount: totalWorkAmount,
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
   * 日別売上データを取得（T_InvoiceLines ベース）
   * @param {string} startDate - 'yyyy-MM-dd'
   * @param {string} endDate - 'yyyy-MM-dd'
   * @returns {Object} { daily, byCustomer, summary }
   */
  getDailySalesData: function(startDate, endDate) {
    // 1. 期間内のInvoiceLinesを一括取得
    var lines = InvoiceLineRepository.findByDateRange(startDate, endDate);

    // 1b. 諸経費行の補完: findByDateRange は work_date でフィルタするため
    //     work_date が空の諸経費行が除外される。期間内の請求書に紐づく諸経費行を追加取得する。
    var invoiceIds = {};
    for (var i = 0; i < lines.length; i++) {
      invoiceIds[lines[i].invoice_id] = true;
    }
    var allLineRecords = getAllRecords('T_InvoiceLines');
    for (var ei = 0; ei < allLineRecords.length; ei++) {
      var el = allLineRecords[ei];
      if (el.item_name !== EXPENSE_ITEM_NAME) continue;
      if (!invoiceIds[el.invoice_id]) continue;
      // work_date が空の行のみ補完（日付付きなら既に含まれている）
      if (!el.work_date) {
        lines.push(el);
      }
    }

    // 2. invoice_id → customer_id マッピング用に請求書を取得
    // invoiceIds は上で既に構築済み
    var uniqueInvoiceIds = Object.keys(invoiceIds);

    // T_Invoicesからcustomer_idを一括取得（カラムインデックス直参照）
    var invoiceCustomerMap = {}; // invoice_id → customer_id
    if (uniqueInvoiceIds.length > 0) {
      var invSheet = getSheet('T_Invoices');
      var invData = invSheet.getDataRange().getValues();
      if (invData.length > 1) {
        var invH = invData[0];
        var invCol = {
          id: invH.indexOf('invoice_id'),
          cid: invH.indexOf('customer_id'),
          del: invH.indexOf('is_deleted')
        };
        var idSet = {};
        for (var k = 0; k < uniqueInvoiceIds.length; k++) {
          idSet[uniqueInvoiceIds[k]] = true;
        }
        for (var j = 1; j < invData.length; j++) {
          var row = invData[j];
          if (row[invCol.del]) continue;
          var iid = String(row[invCol.id]);
          if (iid in idSet) {
            invoiceCustomerMap[iid] = String(row[invCol.cid]);
          }
        }
      }
    }

    // 3. M_Customersからcustomer_id → company_name マッピング
    var customerNameMap = {}; // customer_id → label
    var customerIds = {};
    for (var cKey in invoiceCustomerMap) {
      customerIds[invoiceCustomerMap[cKey]] = true;
    }
    if (Object.keys(customerIds).length > 0) {
      var custSheet = getSheet('M_Customers');
      var custData = custSheet.getDataRange().getValues();
      if (custData.length > 1) {
        var custH = custData[0];
        var custCol = {
          id: custH.indexOf('customer_id'),
          name: custH.indexOf('company_name'),
          branch: custH.indexOf('branch_name'),
          del: custH.indexOf('is_deleted')
        };
        for (var c = 1; c < custData.length; c++) {
          var cr = custData[c];
          if (cr[custCol.del]) continue;
          var cid = String(cr[custCol.id]);
          if (cid in customerIds) {
            var name = String(cr[custCol.name] || '');
            var branch = String(cr[custCol.branch] || '');
            customerNameMap[cid] = name + (branch ? '（' + branch + '）' : '');
          }
        }
      }
    }

    // 4. 日別集計（諸経費行は分離）
    var dailyMap = {}; // 'yyyy-MM-dd' → amount
    var totalAmount = 0;
    var expenseTotal = 0;
    for (var d = 0; d < lines.length; d++) {
      var line = lines[d];
      var amt = Number(line.amount) || 0;
      if (line.item_name === EXPENSE_ITEM_NAME) {
        expenseTotal += amt;
        continue;
      }
      var wd = line.work_date || '';
      if (!dailyMap[wd]) dailyMap[wd] = 0;
      dailyMap[wd] += amt;
      totalAmount += amt;
    }

    // 日付なし行の合計を分離（諸経費以外で日付なしがある場合）
    var noDateAmount = dailyMap[''] || 0;
    delete dailyMap[''];

    // 期間内の全日を生成（売上0の日も含む）
    var daily = [];
    var cur = new Date(startDate + 'T00:00:00');
    var end = new Date(endDate + 'T00:00:00');
    var dayNames = ['日', '月', '火', '水', '木', '金', '土'];
    while (cur <= end) {
      var dateStr = Utilities.formatDate(cur, 'Asia/Tokyo', 'yyyy-MM-dd');
      daily.push({
        date: dateStr,
        dayOfWeek: dayNames[cur.getDay()],
        amount: dailyMap[dateStr] || 0
      });
      cur.setDate(cur.getDate() + 1);
    }

    // 5. 顧客別集計（作業費と諸経費を分離）
    var customerBuckets = {}; // customerName → { sales, expense }
    for (var e = 0; e < lines.length; e++) {
      var ln = lines[e];
      var invId = ln.invoice_id;
      var custId = invoiceCustomerMap[invId] || '';
      var custName = customerNameMap[custId] || '（不明）';
      if (!customerBuckets[custName]) customerBuckets[custName] = { sales: 0, expense: 0 };
      var lineAmt = Number(ln.amount) || 0;
      if (ln.item_name === EXPENSE_ITEM_NAME) {
        customerBuckets[custName].expense += lineAmt;
      } else {
        customerBuckets[custName].sales += lineAmt;
      }
    }

    // 降順ソート（合計ベース）
    var byCustomer = [];
    for (var cn in customerBuckets) {
      var b = customerBuckets[cn];
      byCustomer.push({ customerName: cn, salesTotal: b.sales, expenseTotal: b.expense, amount: b.sales + b.expense });
    }
    byCustomer.sort(function(a, b) { return b.amount - a.amount; });

    return {
      daily: daily,
      byCustomer: byCustomer,
      noDateAmount: noDateAmount,
      expenseTotal: expenseTotal,
      summary: {
        totalAmount: totalAmount,
        dayCount: daily.length
      }
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
      adjustment_total: 0, // 調整額
      invoice_subtotal: 0, // 小計（税抜）
      invoice_tax: 0,      // 消費税
      invoice_total: 0     // 合計（税込）
    };

    for (const inv of invoices) {
      if (inv.is_deleted) continue;

      const subtotal = Number(inv.subtotal) || 0;
      const expense = Number(inv.expense_amount) || 0;
      const adjustment = Number(inv.adjustment_total) || 0;
      const tax = Number(inv.tax_amount) || 0;
      const total = Number(inv.total_amount) || 0;

      result.work_amount += subtotal;           // subtotalは作業費のみ
      result.expense_amount += expense;
      result.adjustment_total += adjustment;
      result.invoice_subtotal += (subtotal + expense + adjustment);
      result.invoice_tax += tax;
      result.invoice_total += total;
    }

    return result;
  },

  /**
   * 支払データを集計（単月ラッパー）
   * @private
   */
  _aggregatePayouts: function(year, month) {
    const result = this._aggregatePayoutsForRange(year, month, year, month);
    const key = year + '-' + month;
    return result[key] || { payout_total: 0, transport_total: 0, payout_confirmed: 0, payout_estimated: 0, has_payout_estimate: false };
  },

  /**
   * 指定期間の支払データを一括集計（確定分 + 概算分）
   *
   * 確定分: PayoutRepository.search で confirmed/paid を取得 → period_start で月別に分配
   * 概算分: 月内の配置で payout_id 未設定のものを、マスタ単価から概算
   *
   * @private
   * @param {number} startYear
   * @param {number} startMonth
   * @param {number} endYear
   * @param {number} endMonth
   * @returns {Object} { "YYYY-M": { payout_total, transport_total, payout_confirmed, payout_estimated, has_payout_estimate } }
   */
  _aggregatePayoutsForRange: function(startYear, startMonth, endYear, endMonth) {
    // 月別バケットを初期化
    const buckets = {};
    let y = startYear, m = startMonth;
    while (y < endYear || (y === endYear && m <= endMonth)) {
      buckets[y + '-' + m] = { payout_total: 0, transport_total: 0, payout_confirmed: 0, payout_estimated: 0, has_payout_estimate: false };
      m++;
      if (m > 12) { m = 1; y++; }
    }

    // 全期間の開始・終了日
    const rangeStart = startYear + '-' + String(startMonth).padStart(2, '0') + '-01';
    const lastDay = new Date(endYear, endMonth, 0).getDate();
    const rangeEnd = endYear + '-' + String(endMonth).padStart(2, '0') + '-' + String(lastDay).padStart(2, '0');

    // === 1. 確定分: confirmed/paid の Payout ===
    const payouts = PayoutRepository.search({ status_in: ['paid', 'confirmed'] });
    for (const payout of payouts) {
      const periodStart = payout.period_start;
      if (periodStart >= rangeStart && periodStart <= rangeEnd) {
        const parts = String(periodStart).split('-');
        const key = Number(parts[0]) + '-' + Number(parts[1]);
        if (buckets[key]) {
          const amt = Number(payout.total_amount) || 0;
          buckets[key].payout_confirmed += amt;
          buckets[key].payout_total += amt;
          buckets[key].transport_total += Number(payout.transport_amount) || 0;
        }
      }
    }

    // === 2. 概算分: payout_id 未設定の配置 ===
    // 2a. 月内の Jobs を取得
    const allJobs = getAllRecords('T_Jobs');
    const jobsInRange = [];
    const jobMap = {};
    for (const job of allJobs) {
      if (job.is_deleted) continue;
      const workDate = this._normalizeDate(job.work_date);
      if (workDate >= rangeStart && workDate <= rangeEnd) {
        jobsInRange.push(job);
        jobMap[job.job_id] = job;
      }
    }

    if (jobsInRange.length === 0) {
      return buckets;
    }

    const jobIdSet = new Set(jobsInRange.map(j => j.job_id));

    // 2b. 月内配置で payout_id 未設定 & 有効なもの
    const VALID_STATUSES = ['ASSIGNED', 'CONFIRMED'];
    const allAssignments = getAllRecords('T_JobAssignments');
    const unpaidAssignments = [];
    for (const asg of allAssignments) {
      if (asg.is_deleted) continue;
      if (!VALID_STATUSES.includes(asg.status)) continue;
      if (asg.payout_id) continue; // 確定済みPayoutに紐付け済み → スキップ
      if (!jobIdSet.has(asg.job_id)) continue;
      unpaidAssignments.push(asg);
    }

    if (unpaidAssignments.length === 0) {
      return buckets;
    }

    // 2c. マスタを一括取得
    const staffRecords = getAllRecords('M_Staff');
    const staffMap = {};
    for (const s of staffRecords) {
      staffMap[s.staff_id] = s;
    }

    const subRecords = getAllRecords('M_Subcontractors');
    const subMap = {};
    for (const sub of subRecords) {
      subMap[sub.subcontractor_id] = sub;
    }

    // 2d. 各配置の概算費用を算出して月別バケットに加算
    for (const asg of unpaidAssignments) {
      const job = jobMap[asg.job_id];
      if (!job) continue;

      const workDate = this._normalizeDate(job.work_date);
      const wdParts = workDate.split('-');
      const key = Number(wdParts[0]) + '-' + Number(wdParts[1]);
      if (!buckets[key]) continue;

      const payUnit = resolveEffectiveUnit_(asg.pay_unit, job);
      let estimatedAmount = 0;

      const staff = staffMap[asg.staff_id];
      if (isSubcontract_(staff)) {
        // 外注スタッフ: 外注先マスタの単価を優先
        const subId = asg.subcontractor_id || (staff && staff.subcontractor_id);
        const sub = subId ? subMap[subId] : null;
        if (sub) {
          estimatedAmount = getSubcontractorRateByUnit_(sub, payUnit);
        } else if (staff) {
          // 外注マスタ未設定の場合、staffの日当にフォールバック
          estimatedAmount = getDailyRateByJobType_(staff, payUnit);
        }
      } else {
        // 自社スタッフ
        estimatedAmount = calculateWage_(asg, staff, payUnit);
      }

      buckets[key].payout_estimated += estimatedAmount;
      buckets[key].payout_total += estimatedAmount;
      buckets[key].has_payout_estimate = true;
    }

    return buckets;
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
      adjustment_total: 0,
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
      totals.adjustment_total += (s.adjustment_total || 0);
      totals.invoice_subtotal += s.invoice_subtotal;
      totals.invoice_tax += s.invoice_tax;
      totals.invoice_total += s.invoice_total;
      totals.payout_total += s.payout_total;
      totals.transport_total += s.transport_total;
      totals.gross_margin += s.gross_margin;
    }

    // 平均粗利率を計算（方針A: 売上=作業費+諸経費+調整額）
    const salesTotal = totals.work_amount + totals.expense_amount + totals.adjustment_total;
    totals.margin_rate = salesTotal > 0
      ? Math.round((totals.gross_margin / salesTotal) * 10000) / 100
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
