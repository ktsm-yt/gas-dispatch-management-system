/**
 * Tier 2: 日付・期間計算テスト
 *
 * 対象: InvoiceService._calculateDates, getFiscalYearByEndMonth_,
 *       getFiscalYearRangeByEndMonth_, getJapaneseHolidays_,
 *       getNextBusinessDay_, PayoutService._parseLocalDate,
 *       PayoutService._addDays
 */

function runDateAdvancedTests() {
  console.log('=== Date Advanced Tests ===');

  var tests = [
    testGetFiscalYearByEndMonth,
    testGetFiscalYearRangeByEndMonth,
    testGetJapaneseHolidays,
    testGetNextBusinessDay,
    testPayoutServiceParseLocalDate,
    testPayoutServiceAddDays,
    testInvoiceServiceCalculateDates
  ];

  var passed = 0;
  var failed = 0;
  var errors = [];

  for (var i = 0; i < tests.length; i++) {
    try {
      tests[i]();
      console.log('[PASS] ' + tests[i].name);
      passed++;
    } catch (e) {
      console.log('[FAIL] ' + tests[i].name + ': ' + e.message);
      failed++;
      errors.push({ test: tests[i].name, error: e.message });
    }
  }

  console.log('\nDate Advanced: ' + passed + ' passed, ' + failed + ' failed');
  return { passed: passed, failed: failed, errors: errors };
}

// ============================================
// getFiscalYearByEndMonth_
// ============================================

function testGetFiscalYearByEndMonth() {
  // 2月決算: startMonth=3 → 3月以降が当年度
  assertEqual(getFiscalYearByEndMonth_('2025-03-01', 2), 2025, '2月決算: 3月→2025年度');
  assertEqual(getFiscalYearByEndMonth_('2025-02-28', 2), 2024, '2月決算: 2月→2024年度');
  assertEqual(getFiscalYearByEndMonth_('2025-01-15', 2), 2024, '2月決算: 1月→2024年度');
  assertEqual(getFiscalYearByEndMonth_('2025-12-31', 2), 2025, '2月決算: 12月→2025年度');

  // 12月決算: startMonth=1 → 全月が当年
  assertEqual(getFiscalYearByEndMonth_('2025-01-01', 12), 2025, '12月決算: 1月→2025');
  assertEqual(getFiscalYearByEndMonth_('2025-06-15', 12), 2025, '12月決算: 6月→2025');
  assertEqual(getFiscalYearByEndMonth_('2025-12-31', 12), 2025, '12月決算: 12月→2025');

  // 3月決算（日本の一般的な年度）: startMonth=4
  assertEqual(getFiscalYearByEndMonth_('2025-04-01', 3), 2025, '3月決算: 4月→2025年度');
  assertEqual(getFiscalYearByEndMonth_('2025-03-31', 3), 2024, '3月決算: 3月→2024年度');
  assertEqual(getFiscalYearByEndMonth_('2026-01-15', 3), 2025, '3月決算: 翌年1月→2025年度');

  // Dateオブジェクト入力
  assertEqual(getFiscalYearByEndMonth_(new Date(2025, 2, 1), 2), 2025, 'Dateオブジェクト: 3月');
}

// ============================================
// getFiscalYearRangeByEndMonth_
// ============================================

function testGetFiscalYearRangeByEndMonth() {
  // 2月決算: 年度2025 → 2025/3/1〜2026/2/28
  var range1 = getFiscalYearRangeByEndMonth_(2025, 2);
  assertEqual(range1.startDate, '2025-03-01', '2月決算: 開始日');
  assertEqual(range1.endDate, '2026-02-28', '2月決算: 終了日');

  // うるう年チェック: 年度2023 → 2023/3/1〜2024/2/29
  var range2 = getFiscalYearRangeByEndMonth_(2023, 2);
  assertEqual(range2.endDate, '2024-02-29', 'うるう年: 2月29日');

  // 12月決算: 年度2025 → 2025/1/1〜2025/12/31
  var range3 = getFiscalYearRangeByEndMonth_(2025, 12);
  assertEqual(range3.startDate, '2025-01-01', '12月決算: 開始日');
  assertEqual(range3.endDate, '2025-12-31', '12月決算: 終了日');

  // 3月決算: 年度2025 → 2025/4/1〜2026/3/31
  var range4 = getFiscalYearRangeByEndMonth_(2025, 3);
  assertEqual(range4.startDate, '2025-04-01', '3月決算: 開始日');
  assertEqual(range4.endDate, '2026-03-31', '3月決算: 終了日');

  // 9月決算: 年度2025 → 2025/10/1〜2026/9/30
  var range5 = getFiscalYearRangeByEndMonth_(2025, 9);
  assertEqual(range5.startDate, '2025-10-01', '9月決算: 開始日');
  assertEqual(range5.endDate, '2026-09-30', '9月決算: 終了日');
}

// ============================================
// getJapaneseHolidays_
// ============================================

function testGetJapaneseHolidays() {
  var holidays2025 = getJapaneseHolidays_(2025);

  // 固定祝日
  assertTrue(holidays2025.has('2025-01-01'), '元日');
  assertTrue(holidays2025.has('2025-02-11'), '建国記念の日');
  assertTrue(holidays2025.has('2025-02-23'), '天皇誕生日');
  assertTrue(holidays2025.has('2025-04-29'), '昭和の日');
  assertTrue(holidays2025.has('2025-05-03'), '憲法記念日');
  assertTrue(holidays2025.has('2025-05-04'), 'みどりの日');
  assertTrue(holidays2025.has('2025-05-05'), 'こどもの日');
  assertTrue(holidays2025.has('2025-08-11'), '山の日');
  assertTrue(holidays2025.has('2025-11-03'), '文化の日');
  assertTrue(holidays2025.has('2025-11-23'), '勤労感謝の日');

  // ハッピーマンデー（第2/3月曜）
  assertTrue(holidays2025.has('2025-01-13'), '成人の日(1月第2月曜)');
  assertTrue(holidays2025.has('2025-07-21'), '海の日(7月第3月曜)');
  assertTrue(holidays2025.has('2025-09-15'), '敬老の日(9月第3月曜)');
  assertTrue(holidays2025.has('2025-10-13'), 'スポーツの日(10月第2月曜)');

  // 春分・秋分（近似計算）
  assertTrue(holidays2025.has('2025-03-20'), '春分の日');
  assertTrue(holidays2025.has('2025-09-23'), '秋分の日');

  // 祝日でない日がSetに含まれないことの確認
  assertFalse(holidays2025.has('2025-06-01'), '6/1は祝日でない');

  // 2026年もテスト
  var holidays2026 = getJapaneseHolidays_(2026);
  assertTrue(holidays2026.has('2026-01-01'), '2026元日');
  assertTrue(holidays2026.has('2026-01-12'), '2026成人の日(1月第2月曜)');
}

// ============================================
// getNextBusinessDay_
// ============================================

function testGetNextBusinessDay() {
  // 金曜日(1/10) → 土(1/11)→日(1/12)→月(1/13=成人の日)→火(1/14)
  var friday = formatDate_(getNextBusinessDay_('2025-01-10'));
  assertEqual(friday, '2025-01-14', '金曜→火曜(月曜祝日)');

  // 土曜日(1/11) → 日(1/12)→月(1/13=成人の日)→火(1/14)
  var saturday = formatDate_(getNextBusinessDay_('2025-01-11'));
  assertEqual(saturday, '2025-01-14', '土曜→火曜(月曜祝日)');

  // 日曜日 → 翌営業日=月曜日
  var sunday = formatDate_(getNextBusinessDay_('2025-01-12'));
  assertEqual(sunday, '2025-01-14', '日曜→火曜（月曜が成人の日）');

  // 年末年始: 12/31(水) → 1/1(元日スキップ) → 1/2(金)
  var yearEnd = formatDate_(getNextBusinessDay_('2025-12-31'));
  assertEqual(yearEnd, '2026-01-02', '年末→年始(元日スキップ)');

  // 祝日連続: 5/3(土), 5/4(日), 5/5(月祝) → 5/6(火)
  // 2025-05-02 (金) → 翌営業日: 5/3(土),5/4(日),5/5(月祝)スキップ → 5/6(火)
  var goldenWeek = formatDate_(getNextBusinessDay_('2025-05-02'));
  assertEqual(goldenWeek, '2025-05-06', 'GW連休スキップ');

  // 平日 → 翌日
  var weekday = formatDate_(getNextBusinessDay_('2025-01-06'));
  assertEqual(weekday, '2025-01-07', '平日→翌平日');
}

// ============================================
// PayoutService._parseLocalDate
// ============================================

function testPayoutServiceParseLocalDate() {
  // 通常のYYYY-MM-DD
  var d1 = PayoutService._parseLocalDate('2025-06-15');
  assertEqual(d1.getFullYear(), 2025, '年');
  assertEqual(d1.getMonth(), 5, '月(0-indexed)');
  assertEqual(d1.getDate(), 15, '日');

  // スラッシュ区切り
  var d2 = PayoutService._parseLocalDate('2025/01/31');
  assertEqual(d2.getFullYear(), 2025, 'スラッシュ: 年');
  assertEqual(d2.getMonth(), 0, 'スラッシュ: 月');
  assertEqual(d2.getDate(), 31, 'スラッシュ: 日');

  // null → null
  var d3 = PayoutService._parseLocalDate(null);
  assertEqual(d3, null, 'null → null');

  // undefined → null
  var d4 = PayoutService._parseLocalDate(undefined);
  assertEqual(d4, null, 'undefined → null');

  // 空文字 → null
  var d5 = PayoutService._parseLocalDate('');
  assertEqual(d5, null, '空文字 → null');
}

// ============================================
// PayoutService._addDays
// ============================================

function testPayoutServiceAddDays() {
  // 通常
  assertEqual(PayoutService._addDays('2025-01-15', 1), '2025-01-16', '+1日');
  assertEqual(PayoutService._addDays('2025-01-15', 7), '2025-01-22', '+7日');

  // 月末跨ぎ
  assertEqual(PayoutService._addDays('2025-01-31', 1), '2025-02-01', '1月末→2月');
  assertEqual(PayoutService._addDays('2025-02-28', 1), '2025-03-01', '2月末→3月(非うるう年)');
  assertEqual(PayoutService._addDays('2024-02-29', 1), '2024-03-01', 'うるう年2月29日→3月');

  // 年跨ぎ
  assertEqual(PayoutService._addDays('2025-12-31', 1), '2026-01-01', '年末→年始');

  // null → null
  assertEqual(PayoutService._addDays(null, 1), null, 'null → null');
  assertEqual(PayoutService._addDays(undefined, 5), null, 'undefined → null');
}

// ============================================
// InvoiceService._calculateDates
// ============================================

function testInvoiceServiceCalculateDates() {
  // 月末締め、翌月末払い
  var cust1 = { closing_day: 31, payment_day: 31, payment_month_offset: 1 };
  var dates1 = InvoiceService._calculateDates(cust1, 2025, 6);
  assertEqual(dates1.issueDate, '2025-06-30', '月末締め: 発行日=月末日');
  // dueMonth = 6 + 1 = 7, dueDay = 31
  assertEqual(dates1.dueDate, '2025-07-31', '月末締め翌月末: 支払期限');

  // 月末締め、翌々月末払い
  var cust2 = { closing_day: 31, payment_day: 31, payment_month_offset: 2 };
  var dates2 = InvoiceService._calculateDates(cust2, 2025, 6);
  assertEqual(dates2.dueDate, '2025-08-31', '翌々月末払い');

  // 20日締め、翌月10日払い
  var cust3 = { closing_day: 20, payment_day: 10, payment_month_offset: 1 };
  var dates3 = InvoiceService._calculateDates(cust3, 2025, 6);
  assertEqual(dates3.issueDate, '2025-06-20', '20日締め: 発行日=20日');
  assertEqual(dates3.dueDate, '2025-07-10', '翌月10日払い');

  // Dec→Jan rollover（年跨ぎ）: 12月末締め
  var cust4 = { closing_day: 31, payment_day: 31, payment_month_offset: 1 };
  var dates4 = InvoiceService._calculateDates(cust4, 2025, 12);
  assertEqual(dates4.issueDate, '2025-12-31', '12月末: 発行日=12月31日');
  // dueMonth = 12 + 1 = 13 → 13 % 12 = 1, dueYear += 1
  assertEqual(dates4.dueDate, '2026-01-31', '12月: 翌月末=1月31日');

  // Dec→Jan rollover: 翌々月払い
  var cust5 = { closing_day: 31, payment_day: 15, payment_month_offset: 2 };
  var dates5 = InvoiceService._calculateDates(cust5, 2025, 12);
  // dueMonth = 12 + 2 = 14 → 14 % 12 = 2, dueYear = 2025 + 1 = 2026
  assertEqual(dates5.dueDate, '2026-02-15', '12月: 翌々月15日');

  // 2月の月末処理（支払日31→末日に丸め）
  var cust6 = { closing_day: 31, payment_day: 31, payment_month_offset: 2 };
  var dates6 = InvoiceService._calculateDates(cust6, 2025, 12);
  // dueMonth = 12 + 2 = 14 → month=2, year=2026
  assertEqual(dates6.dueDate, '2026-02-28', '2月末: 31→28に丸め');

  // うるう年2月
  var dates7 = InvoiceService._calculateDates(cust6, 2023, 12);
  // dueMonth = 14 → month=2, year=2024 (leap year)
  assertEqual(dates7.dueDate, '2024-02-29', 'うるう年2月: 31→29に丸め');
}
