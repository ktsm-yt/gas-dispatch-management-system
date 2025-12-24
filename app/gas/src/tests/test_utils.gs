/**
 * ユーティリティ関数テスト
 *
 * テスト対象:
 * - validation.js: バリデーションロジック
 * - date_utils.js: 日付・期間計算
 * - calc_utils.js: 金額計算
 * - status_rules.js: ステータス遷移
 */

// ============================================================
// テスト実行
// ============================================================

/**
 * 全ユーティリティテストを実行
 */
function runAllUtilTests() {
  console.log('=== ユーティリティ関数テスト ===\n');

  const results = {
    passed: 0,
    failed: 0,
    errors: []
  };

  const testSuites = [
    { name: 'Validation Tests', fn: runValidationTests },
    { name: 'Date Utils Tests', fn: runDateUtilsTests },
    { name: 'Calc Utils Tests', fn: runCalcUtilsTests },
    { name: 'Status Rules Tests', fn: runStatusRulesTests }
  ];

  for (const suite of testSuites) {
    console.log(`\n--- ${suite.name} ---`);
    try {
      const suiteResult = suite.fn();
      results.passed += suiteResult.passed;
      results.failed += suiteResult.failed;
      results.errors.push(...suiteResult.errors);
    } catch (e) {
      console.log(`[ERROR] ${suite.name}: ${e.message}`);
      results.failed++;
      results.errors.push({ suite: suite.name, error: e.message });
    }
  }

  console.log('\n=== テスト結果サマリー ===');
  console.log(`Passed: ${results.passed}`);
  console.log(`Failed: ${results.failed}`);
  if (results.errors.length > 0) {
    console.log('Errors:');
    results.errors.forEach(e => console.log(`  - ${e.test || e.suite}: ${e.error || e.message}`));
  }

  return results;
}

// ============================================================
// Validation Tests
// ============================================================

function runValidationTests() {
  const results = { passed: 0, failed: 0, errors: [] };

  const tests = [
    testValidateDateFormat,
    testValidateTimeFormat,
    testValidateEnum,
    testValidateNumber,
    testValidateEmail,
    testValidatePhone,
    testValidatePostalCode,
    testValidateJob,
    testValidateCustomer,
    testValidateStaff
  ];

  for (const test of tests) {
    try {
      test();
      console.log(`[PASS] ${test.name}`);
      results.passed++;
    } catch (e) {
      console.log(`[FAIL] ${test.name}: ${e.message}`);
      results.failed++;
      results.errors.push({ test: test.name, error: e.message });
    }
  }

  return results;
}

function testValidateDateFormat() {
  // 正常系
  assertNoThrow(() => validateDateFormat_('2025-12-24', 'test'), 'valid date should not throw');
  assertNoThrow(() => validateDateFormat_('2025-01-01', 'test'), 'valid date should not throw');

  // 異常系
  assertThrows(() => validateDateFormat_('invalid', 'test'), 'invalid date should throw');
  assertThrows(() => validateDateFormat_('2025/12/24', 'test'), 'wrong format should throw');
  assertThrows(() => validateDateFormat_('25-12-24', 'test'), 'short year should throw');
}

function testValidateTimeFormat() {
  // 正常系
  assertNoThrow(() => validateTimeFormat_('08:00', 'test'), 'valid time should not throw');
  assertNoThrow(() => validateTimeFormat_('23:59', 'test'), 'valid time should not throw');

  // 異常系
  assertThrows(() => validateTimeFormat_('8:00', 'test'), 'missing leading zero should throw');
  assertThrows(() => validateTimeFormat_('25:00', 'test'), 'invalid hour should throw');
  assertThrows(() => validateTimeFormat_('08:60', 'test'), 'invalid minute should throw');
}

function testValidateEnum() {
  // 正常系
  assertNoThrow(() => validateEnum_('jotou', 'time_slot', TIME_SLOTS), 'valid enum should not throw');
  assertNoThrow(() => validateEnum_('pending', 'status', JOB_STATUSES), 'valid enum should not throw');

  // 異常系
  assertThrows(() => validateEnum_('invalid', 'time_slot', TIME_SLOTS), 'invalid enum should throw');
  assertThrows(() => validateEnum_('JOTOU', 'time_slot', TIME_SLOTS), 'case sensitive should throw');
}

function testValidateNumber() {
  // 正常系
  assertNoThrow(() => validateNumber_(5, 'count', { min: 1, max: 10 }), 'valid number should not throw');
  assertNoThrow(() => validateNumber_(1, 'count', { min: 1, max: 10 }), 'min boundary should not throw');
  assertNoThrow(() => validateNumber_(10, 'count', { min: 1, max: 10 }), 'max boundary should not throw');

  // 異常系
  assertThrows(() => validateNumber_(0, 'count', { min: 1 }), 'below min should throw');
  assertThrows(() => validateNumber_(100, 'count', { max: 10 }), 'above max should throw');
  assertThrows(() => validateNumber_(1.5, 'count', { allowDecimal: false }), 'decimal when not allowed should throw');
}

function testValidateEmail() {
  // 正常系
  assertNoThrow(() => validateEmail_('test@example.com', 'email'), 'valid email should not throw');
  assertNoThrow(() => validateEmail_('user.name+tag@domain.co.jp', 'email'), 'complex email should not throw');

  // 異常系
  assertThrows(() => validateEmail_('invalid', 'email'), 'no @ should throw');
  assertThrows(() => validateEmail_('test@', 'email'), 'no domain should throw');
  assertThrows(() => validateEmail_('@example.com', 'email'), 'no local part should throw');
}

function testValidatePhone() {
  // 正常系
  assertNoThrow(() => validatePhone_('03-1234-5678', 'phone'), 'valid phone should not throw');
  assertNoThrow(() => validatePhone_('090-1234-5678', 'phone'), 'mobile phone should not throw');
  assertNoThrow(() => validatePhone_('0312345678', 'phone'), 'no hyphens should not throw');

  // 異常系
  assertThrows(() => validatePhone_('abc-defg-hijk', 'phone'), 'non-numeric should throw');
  assertThrows(() => validatePhone_('12345', 'phone'), 'too short should throw');
}

function testValidatePostalCode() {
  // 正常系
  assertNoThrow(() => validatePostalCode_('100-0001', 'postal'), 'valid postal should not throw');
  assertNoThrow(() => validatePostalCode_('1000001', 'postal'), 'no hyphen should not throw');

  // 異常系
  assertThrows(() => validatePostalCode_('12345', 'postal'), 'wrong length should throw');
  assertThrows(() => validatePostalCode_('abc-defg', 'postal'), 'non-numeric should throw');
}

function testValidateJob() {
  // 正常系 - 新規作成（UUID形式の顧客ID）
  assertNoThrow(() => validateJob_({
    customer_id: '12345678-1234-1234-1234-123456789012',
    site_name: 'テスト現場',
    work_date: '2025-12-24',
    time_slot: 'jotou',
    required_count: 3,
    job_type: 'tobi',
    status: 'pending'
  }, true), 'valid new job should not throw');

  // 異常系 - 必須項目欠落
  assertThrows(() => validateJob_({
    customer_id: '12345678-1234-1234-1234-123456789012'
    // missing required fields
  }, true), 'missing required fields should throw');

  // 異常系 - 無効なtime_slot
  assertThrows(() => validateJob_({
    customer_id: '12345678-1234-1234-1234-123456789012',
    site_name: 'テスト現場',
    work_date: '2025-12-24',
    time_slot: 'invalid',
    required_count: 3,
    job_type: 'tobi',
    status: 'pending'
  }, true), 'invalid time_slot should throw');
}

function testValidateCustomer() {
  // 正常系
  assertNoThrow(() => validateCustomer_({
    customer_id: 'cus_12345678-1234-1234-1234-123456789012',
    company_name: 'テスト建設株式会社'
  }, true), 'valid customer should not throw');

  // 異常系 - 会社名が長すぎる
  const longName = 'あ'.repeat(201);
  assertThrows(() => validateCustomer_({
    customer_id: 'cus_test',
    company_name: longName
  }, true), 'too long company_name should throw');
}

function testValidateStaff() {
  // 正常系
  assertNoThrow(() => validateStaff_({
    staff_id: 'stf_12345678-1234-1234-1234-123456789012',
    name: '山田太郎',
    staff_type: 'regular'
  }, true), 'valid staff should not throw');

  // 異常系 - 無効なstaff_type
  assertThrows(() => validateStaff_({
    staff_id: 'stf_test',
    name: '山田太郎',
    staff_type: 'invalid'
  }, true), 'invalid staff_type should throw');
}

// ============================================================
// Date Utils Tests
// ============================================================

function runDateUtilsTests() {
  const results = { passed: 0, failed: 0, errors: [] };

  const tests = [
    testParseAndFormatDate,
    testAddDays,
    testAddMonths,
    testDiffDays,
    testCalculateClosingPeriod,
    testCalculatePaymentDate,
    testIsBusinessDay,
    testCountBusinessDays,
    testGetFiscalYear
  ];

  for (const test of tests) {
    try {
      test();
      console.log(`[PASS] ${test.name}`);
      results.passed++;
    } catch (e) {
      console.log(`[FAIL] ${test.name}: ${e.message}`);
      results.failed++;
      results.errors.push({ test: test.name, error: e.message });
    }
  }

  return results;
}

function testParseAndFormatDate() {
  // parseDate_ と formatDate_ のラウンドトリップ
  const dateStr = '2025-12-24';
  const date = parseDate_(dateStr);
  const result = formatDate_(date);
  assertEqual(result, dateStr, 'round trip should preserve date');

  // 月初・月末
  assertEqual(formatDate_(parseDate_('2025-01-01')), '2025-01-01', 'month start');
  assertEqual(formatDate_(parseDate_('2025-12-31')), '2025-12-31', 'month end');
}

function testAddDays() {
  const base = parseDate_('2025-12-24');

  assertEqual(formatDate_(addDays_(base, 1)), '2025-12-25', 'add 1 day');
  assertEqual(formatDate_(addDays_(base, 7)), '2025-12-31', 'add 7 days');
  assertEqual(formatDate_(addDays_(base, 8)), '2026-01-01', 'cross year boundary');
  assertEqual(formatDate_(addDays_(base, -1)), '2025-12-23', 'subtract 1 day');
}

function testAddMonths() {
  const base = parseDate_('2025-12-24');

  assertEqual(formatDate_(addMonths_(base, 1)), '2026-01-24', 'add 1 month');
  assertEqual(formatDate_(addMonths_(base, -1)), '2025-11-24', 'subtract 1 month');

  // 月末処理
  const jan31 = parseDate_('2025-01-31');
  assertEqual(formatDate_(addMonths_(jan31, 1)), '2025-02-28', 'Jan 31 + 1 month = Feb 28');
}

function testDiffDays() {
  const date1 = parseDate_('2025-12-24');
  const date2 = parseDate_('2025-12-31');

  assertEqual(diffDays_(date1, date2), 7, 'diff should be 7 days');
  assertEqual(diffDays_(date2, date1), -7, 'reverse diff should be -7 days');
  assertEqual(diffDays_(date1, date1), 0, 'same date diff should be 0');
}

function testCalculateClosingPeriod() {
  // 月末締め
  const period1 = calculateClosingPeriod_(2025, 12, 31);
  assertEqual(period1.start, '2025-12-01', 'month-end closing start');
  assertEqual(period1.end, '2025-12-31', 'month-end closing end');

  // 25日締め
  const period2 = calculateClosingPeriod_(2025, 12, 25);
  assertEqual(period2.start, '2025-11-26', '25th closing start');
  assertEqual(period2.end, '2025-12-25', '25th closing end');

  // 15日締め
  const period3 = calculateClosingPeriod_(2025, 12, 15);
  assertEqual(period3.start, '2025-11-16', '15th closing start');
  assertEqual(period3.end, '2025-12-15', '15th closing end');
}

function testCalculatePaymentDate() {
  // 月末締め翌月25日払い
  const payment1 = calculatePaymentDate_(2025, 12, 31, 1, 25);
  assertEqual(payment1, '2026-01-25', 'next month 25th');

  // 25日締め翌々月10日払い
  const payment2 = calculatePaymentDate_(2025, 12, 25, 2, 10);
  assertEqual(payment2, '2026-02-10', '2 months later 10th');
}

function testIsBusinessDay() {
  // 平日
  assertTrue(isBusinessDay_(parseDate_('2025-12-24')), '2025-12-24 is Wednesday');

  // 土日
  assertFalse(isBusinessDay_(parseDate_('2025-12-27')), '2025-12-27 is Saturday');
  assertFalse(isBusinessDay_(parseDate_('2025-12-28')), '2025-12-28 is Sunday');

  // 祝日（元日）
  assertFalse(isBusinessDay_(parseDate_('2025-01-01')), '2025-01-01 is holiday');
}

function testCountBusinessDays() {
  // 1週間（月〜金の5日間）
  const start = parseDate_('2025-12-22'); // Monday
  const end = parseDate_('2025-12-26');   // Friday
  assertEqual(countBusinessDays_(start, end), 5, 'Mon-Fri should be 5 business days');

  // 週末を含む
  const startWithWeekend = parseDate_('2025-12-22'); // Monday
  const endWithWeekend = parseDate_('2025-12-28');   // Sunday
  assertEqual(countBusinessDays_(startWithWeekend, endWithWeekend), 5, 'should exclude weekend');
}

function testGetFiscalYear() {
  // 4月以降は当年
  assertEqual(getFiscalYear_(parseDate_('2025-04-01')), 2025, 'April is current FY');
  assertEqual(getFiscalYear_(parseDate_('2025-12-31')), 2025, 'December is current FY');

  // 3月以前は前年
  assertEqual(getFiscalYear_(parseDate_('2025-03-31')), 2024, 'March is previous FY');
  assertEqual(getFiscalYear_(parseDate_('2025-01-01')), 2024, 'January is previous FY');
}

// ============================================================
// Calc Utils Tests
// ============================================================

function runCalcUtilsTests() {
  const results = { passed: 0, failed: 0, errors: [] };

  const tests = [
    testApplyRounding,
    testCalculateTaxIncluded,
    testCalculateTaxExcluded,
    testCalculateTaxAmount,
    testGetUnitMultiplier,
    testCalculateInvoiceTotals,
    testFormatCurrency
  ];

  for (const test of tests) {
    try {
      test();
      console.log(`[PASS] ${test.name}`);
      results.passed++;
    } catch (e) {
      console.log(`[FAIL] ${test.name}: ${e.message}`);
      results.failed++;
      results.errors.push({ test: test.name, error: e.message });
    }
  }

  return results;
}

function testApplyRounding() {
  // 切り捨て
  assertEqual(applyRounding_(1234.5, 'FLOOR'), 1234, 'FLOOR should round down');
  assertEqual(applyRounding_(1234.9, 'FLOOR'), 1234, 'FLOOR should round down');

  // 切り上げ
  assertEqual(applyRounding_(1234.1, 'CEIL'), 1235, 'CEIL should round up');
  assertEqual(applyRounding_(1234.0, 'CEIL'), 1234, 'CEIL exact should not change');

  // 四捨五入
  assertEqual(applyRounding_(1234.4, 'ROUND'), 1234, 'ROUND down');
  assertEqual(applyRounding_(1234.5, 'ROUND'), 1235, 'ROUND up');
}

function testCalculateTaxIncluded() {
  // 税率10%
  assertEqual(calculateTaxIncluded_(10000, 10), 11000, '10000 + 10% = 11000');
  assertEqual(calculateTaxIncluded_(25000, 10), 27500, '25000 + 10% = 27500');

  // 端数処理
  assertEqual(calculateTaxIncluded_(10001, 10), 11001, 'floor applied');
}

function testCalculateTaxExcluded() {
  // 税率10%
  assertEqual(calculateTaxExcluded_(11000, 10), 10000, '11000 / 1.10 = 10000');
  assertEqual(calculateTaxExcluded_(27500, 10), 25000, '27500 / 1.10 = 25000');
}

function testCalculateTaxAmount() {
  // 税率10%
  assertEqual(calculateTaxAmount_(10000, 10), 1000, '10000 * 10% = 1000');
  assertEqual(calculateTaxAmount_(25000, 10), 2500, '25000 * 10% = 2500');

  // 端数処理
  assertEqual(calculateTaxAmount_(10001, 10), 1000, 'floor applied');
}

function testGetUnitMultiplier() {
  // 全日
  assertEqual(getUnitMultiplier_('shuujitsu'), 1.0, 'shuujitsu = 1.0');
  assertEqual(getUnitMultiplier_('jotou'), 1.0, 'jotou = 1.0');

  // 半日
  assertEqual(getUnitMultiplier_('am'), 0.5, 'am = 0.5');
  assertEqual(getUnitMultiplier_('pm'), 0.5, 'pm = 0.5');

  // 夜勤（特殊）
  assertTrue(getUnitMultiplier_('yakin') >= 1.0, 'yakin >= 1.0');
}

function testCalculateInvoiceTotals() {
  const lines = [
    { amount: 25000 },
    { amount: 25000 },
    { amount: 12500 }
  ];

  const totals = calculateInvoiceTotals_(lines, 10);

  assertEqual(totals.subtotal, 62500, 'subtotal = 62500');
  assertEqual(totals.taxAmount, 6250, 'tax = 6250');
  assertEqual(totals.total, 68750, 'total = 68750');
}

function testFormatCurrency() {
  assertEqual(formatCurrency_(1000), '1,000', 'thousands separator');
  assertEqual(formatCurrency_(1234567), '1,234,567', 'millions');
  assertEqual(formatCurrency_(0), '0', 'zero');
}

// ============================================================
// Status Rules Tests
// ============================================================

function runStatusRulesTests() {
  const results = { passed: 0, failed: 0, errors: [] };

  const tests = [
    testJobStatusTransitions,
    testAssignmentStatusTransitions,
    testInvoiceStatusTransitions,
    testGetStatusLabels,
    testIsEditable,
    testCalculateJobStatus
  ];

  for (const test of tests) {
    try {
      test();
      console.log(`[PASS] ${test.name}`);
      results.passed++;
    } catch (e) {
      console.log(`[FAIL] ${test.name}: ${e.message}`);
      results.failed++;
      results.errors.push({ test: test.name, error: e.message });
    }
  }

  return results;
}

function testJobStatusTransitions() {
  // 有効な遷移
  assertTrue(isValidTransition_('pending', 'assigned', JOB_STATUS_TRANSITIONS), 'pending -> assigned');
  assertTrue(isValidTransition_('pending', 'hold', JOB_STATUS_TRANSITIONS), 'pending -> hold');
  assertTrue(isValidTransition_('assigned', 'completed', JOB_STATUS_TRANSITIONS), 'assigned -> completed');

  // 無効な遷移
  assertFalse(isValidTransition_('completed', 'pending', JOB_STATUS_TRANSITIONS), 'completed -> pending');
  assertFalse(isValidTransition_('cancelled', 'assigned', JOB_STATUS_TRANSITIONS), 'cancelled -> assigned');
}

function testAssignmentStatusTransitions() {
  // 有効な遷移
  assertTrue(isValidTransition_('assigned', 'confirmed', ASSIGNMENT_STATUS_TRANSITIONS), 'assigned -> confirmed');
  assertTrue(isValidTransition_('assigned', 'cancelled', ASSIGNMENT_STATUS_TRANSITIONS), 'assigned -> cancelled');

  // 無効な遷移
  assertFalse(isValidTransition_('cancelled', 'assigned', ASSIGNMENT_STATUS_TRANSITIONS), 'cancelled -> assigned');
}

function testInvoiceStatusTransitions() {
  // 有効な遷移
  assertTrue(isValidTransition_('draft', 'issued', INVOICE_STATUS_TRANSITIONS), 'draft -> issued');
  assertTrue(isValidTransition_('issued', 'sent', INVOICE_STATUS_TRANSITIONS), 'issued -> sent');
  assertTrue(isValidTransition_('sent', 'paid', INVOICE_STATUS_TRANSITIONS), 'sent -> paid');

  // 無効な遷移
  assertFalse(isValidTransition_('paid', 'draft', INVOICE_STATUS_TRANSITIONS), 'paid -> draft');
}

function testGetStatusLabels() {
  // Job status labels
  assertEqual(getJobStatusLabel_('pending'), '未配置', 'pending label');
  assertEqual(getJobStatusLabel_('assigned'), '配置済', 'assigned label');
  assertEqual(getJobStatusLabel_('completed'), '完了', 'completed label');

  // Time slot labels
  assertEqual(getTimeSlotLabel_('jotou'), '上棟', 'jotou label');
  assertEqual(getTimeSlotLabel_('shuujitsu'), '終日', 'shuujitsu label');
  assertEqual(getTimeSlotLabel_('am'), 'AM', 'am label');
}

function testIsEditable() {
  // Job editability
  assertTrue(isJobEditable_('pending'), 'pending job is editable');
  assertTrue(isJobEditable_('assigned'), 'assigned job is editable');
  assertFalse(isJobEditable_('completed'), 'completed job is not editable');
  assertFalse(isJobEditable_('cancelled'), 'cancelled job is not editable');

  // Invoice editability
  assertTrue(isInvoiceEditable_('draft'), 'draft invoice is editable');
  assertFalse(isInvoiceEditable_('issued'), 'issued invoice is not editable');
}

function testCalculateJobStatus() {
  // 配置なし -> pending
  assertEqual(calculateJobStatus_(3, 0), 'pending', '0 assigned = pending');

  // 一部配置 -> pending
  assertEqual(calculateJobStatus_(3, 1), 'pending', 'partial = pending');
  assertEqual(calculateJobStatus_(3, 2), 'pending', 'partial = pending');

  // 全員配置 -> assigned
  assertEqual(calculateJobStatus_(3, 3), 'assigned', 'full = assigned');
  assertEqual(calculateJobStatus_(3, 4), 'assigned', 'over = assigned');
}

// ============================================================
// テストヘルパー関数
// ============================================================

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected "${expected}", got "${actual}"`);
  }
}

function assertTrue(value, message) {
  if (value !== true) {
    throw new Error(`${message}: expected true, got ${value}`);
  }
}

function assertFalse(value, message) {
  if (value !== false) {
    throw new Error(`${message}: expected false, got ${value}`);
  }
}

function assertThrows(fn, message) {
  let threw = false;
  try {
    fn();
  } catch (e) {
    threw = true;
  }
  if (!threw) {
    throw new Error(`${message}: expected to throw, but did not`);
  }
}

function assertNoThrow(fn, message) {
  try {
    fn();
  } catch (e) {
    throw new Error(`${message}: expected not to throw, but threw: ${e.message}`);
  }
}
