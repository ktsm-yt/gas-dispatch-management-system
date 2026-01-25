/**
 * 月次統計テストデータ生成スクリプト
 *
 * 複数月・複数年の統計データを生成して、
 * 売上分析ダッシュボードの期間選択・年次集計機能をテストする
 *
 * GASエディタから createStatsTestData() を実行してください
 */

// ============================================================
// メイン関数
// ============================================================

/**
 * テスト用の月次統計データを一括生成
 * - 2024年4月〜2025年3月（FY2024）: 12ヶ月分（確定済み）
 * - 2025年4月〜2026年1月（FY2025）: 10ヶ月分（1月のみ未確定）
 */
function createStatsTestData() {
  console.log('=== 月次統計テストデータ一括生成 ===');
  const startTime = Date.now();

  // 既存データをクリア
  deleteStatsTestData();

  const now = getCurrentTimestamp();
  const records = [];

  // FY2024（2024年4月〜2025年3月）- 過去年度、全月確定
  // 2024年4月〜12月
  for (let month = 4; month <= 12; month++) {
    records.push(createStatsRecord(2024, month, true, now));
  }
  // 2025年1月〜3月（FY2024に属する）
  for (let month = 1; month <= 3; month++) {
    records.push(createStatsRecord(2025, month, true, now));
  }

  // FY2025（2025年4月〜2026年3月）- 現在年度
  // 2025年4月〜12月
  for (let month = 4; month <= 12; month++) {
    records.push(createStatsRecord(2025, month, true, now));
  }
  // 2026年1月（現在月、未確定）
  records.push(createStatsRecord(2026, 1, false, now));

  // 一括挿入
  insertRecords('T_MonthlyStats', records);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`生成完了: ${records.length}件 (${elapsed}秒)`);

  // サマリー表示
  showStatsSummary();

  return { count: records.length, elapsed };
}

/**
 * 統計テストデータを削除
 */
function deleteStatsTestData() {
  const sheet = getSheet('T_MonthlyStats');
  const lastRow = sheet.getLastRow();

  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
    console.log(`既存データ削除: ${lastRow - 1}件`);
  }
}

// ============================================================
// データ生成ロジック
// ============================================================

/**
 * 統計レコードを生成
 */
function createStatsRecord(year, month, isFinal, now) {
  const stats = generateMonthlyStats(year, month, isFinal);

  return {
    stat_id: generateId('stat'),
    year: year,
    month: month,
    job_count: stats.job_count,
    assignment_count: stats.assignment_count,
    work_amount: stats.work_amount,
    expense_amount: stats.expense_amount,
    invoice_subtotal: stats.invoice_subtotal,
    invoice_tax: stats.invoice_tax,
    invoice_total: stats.invoice_total,
    payout_total: stats.payout_total,
    transport_total: stats.transport_total,
    gross_margin: stats.gross_margin,
    margin_rate: stats.margin_rate,
    is_final: isFinal,
    created_at: now,
    updated_at: now
  };
}

/**
 * 月別の統計データを生成
 * 季節変動や成長トレンドを模擬したリアルなデータを生成
 */
function generateMonthlyStats(year, month, isFinal) {
  // 基準値（年間成長を反映）
  const yearFactor = year <= 2024 ? 0.9 : (year === 2025 ? 1.0 : 1.05);

  // 季節変動係数（建設業界の繁閑）
  const seasonalFactors = {
    1: 0.7, 2: 0.8, 3: 1.1, 4: 1.0, 5: 1.0, 6: 0.9,
    7: 1.0, 8: 0.8, 9: 1.0, 10: 1.1, 11: 1.2, 12: 0.9
  };

  const seasonFactor = seasonalFactors[month] || 1.0;
  const baseFactor = yearFactor * seasonFactor;

  // 案件・配置数
  const baseJobCount = 150;
  const jobCount = Math.round(baseJobCount * baseFactor * (0.9 + Math.random() * 0.2));
  const assignmentCount = Math.round(jobCount * 1.8 * (0.9 + Math.random() * 0.2));

  // 売上計算
  const baseWorkAmount = 3500000;
  const workAmount = Math.round(baseWorkAmount * baseFactor * (0.9 + Math.random() * 0.2));
  const expenseAmount = Math.round(workAmount * 0.05 * (0.8 + Math.random() * 0.4));
  const invoiceSubtotal = workAmount + expenseAmount;
  const invoiceTax = Math.round(invoiceSubtotal * 0.1);
  const invoiceTotal = invoiceSubtotal + invoiceTax;

  // 支払い計算（売上の60-70%程度）
  const payoutRate = 0.63 + Math.random() * 0.07;
  const payoutTotal = Math.round(workAmount * payoutRate);
  const transportTotal = Math.round(assignmentCount * 800 * (0.8 + Math.random() * 0.4));

  // 粗利計算
  const grossMargin = invoiceSubtotal - payoutTotal - transportTotal;
  const marginRate = invoiceSubtotal > 0
    ? Math.round((grossMargin / invoiceSubtotal) * 1000) / 10
    : 0;

  return {
    job_count: jobCount,
    assignment_count: assignmentCount,
    work_amount: workAmount,
    expense_amount: expenseAmount,
    invoice_subtotal: invoiceSubtotal,
    invoice_tax: invoiceTax,
    invoice_total: invoiceTotal,
    payout_total: payoutTotal,
    transport_total: transportTotal,
    gross_margin: grossMargin,
    margin_rate: marginRate
  };
}

// ============================================================
// 確認用関数
// ============================================================

/**
 * サマリー表示
 */
function showStatsSummary() {
  console.log('\n--- データ確認 ---');

  const allStats = getAllRecords('T_MonthlyStats');

  // 年月別に表示
  allStats.sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.month - b.month;
  });

  allStats.forEach(s => {
    const finalMark = s.is_final === true || s.is_final === 'true' ? '✓' : '◯';
    const total = Number(s.invoice_total) || 0;
    console.log(`${s.year}年${String(s.month).padStart(2)}月 [${finalMark}]: 売上${total.toLocaleString()}円`);
  });

  // 会計年度別集計
  console.log('\n--- 会計年度サマリー ---');
  const fy2024 = StatsRepository.getYearlySummary(2024);
  const fy2025 = StatsRepository.getYearlySummary(2025);
  console.log(`FY2024: ${fy2024.months_count}ヶ月, 売上合計 ${fy2024.total_invoice.toLocaleString()}円`);
  console.log(`FY2025: ${fy2025.months_count}ヶ月, 売上合計 ${fy2025.total_invoice.toLocaleString()}円`);
}

/**
 * 生成した統計データを確認 + ダッシュボードテスト
 */
function checkStatsTestData() {
  console.log('=== 月次統計データ確認 ===\n');

  const allStats = getAllRecords('T_MonthlyStats');
  console.log(`総レコード数: ${allStats.length}件\n`);

  // 年月順にソートして表示
  allStats.sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.month - b.month;
  });

  allStats.forEach(s => {
    const finalMark = s.is_final === true || s.is_final === 'true' ? '✓' : '◯';
    const total = Number(s.invoice_total) || 0;
    const rate = Number(s.margin_rate) || 0;
    console.log(`${s.year}年${String(s.month).padStart(2)}月 [${finalMark}]: 売上${total.toLocaleString()}円, 粗利${rate.toFixed(1)}%`);
  });

  // ダッシュボードデータのテスト
  console.log('\n\n=== ダッシュボード機能テスト ===');

  try {
    const thisMonth = StatsService.getDashboardData({ period: 'thisMonth' });
    console.log(`\nthisMonth(2026/1): 売上${(thisMonth.totals?.invoice_total || 0).toLocaleString()}円`);

    const lastMonth = StatsService.getDashboardData({ period: 'lastMonth' });
    console.log(`lastMonth(2025/12): 売上${(lastMonth.totals?.invoice_total || 0).toLocaleString()}円`);

    const thisYear = StatsService.getDashboardData({ period: 'thisYear' });
    console.log(`thisYear(FY2025): 売上${(thisYear.totals?.invoice_total || 0).toLocaleString()}円, ${thisYear.monthly?.length || 0}ヶ月分`);

    const lastYear = StatsService.getDashboardData({ period: 'lastYear' });
    console.log(`lastYear(FY2024): 売上${(lastYear.totals?.invoice_total || 0).toLocaleString()}円, ${lastYear.monthly?.length || 0}ヶ月分`);

    const custom = StatsService.getDashboardData({
      period: 'custom',
      startYear: 2025,
      startMonth: 10,
      endYear: 2026,
      endMonth: 1
    });
    console.log(`custom(2025/10-2026/1): 売上${(custom.totals?.invoice_total || 0).toLocaleString()}円, ${custom.monthly?.length || 0}ヶ月分`);
  } catch (e) {
    console.log('ダッシュボードテストエラー:', e.message);
  }

  return allStats;
}
