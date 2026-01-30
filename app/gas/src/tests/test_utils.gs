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
    pay_unit: 'tobi',
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
    pay_unit: 'tobi',
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
  // 月末締め（プロパティ名はstartDate/endDate）
  const period1 = calculateClosingPeriod_(2025, 12, 31);
  assertEqual(period1.startDate, '2025-12-01', 'month-end closing start');
  assertEqual(period1.endDate, '2025-12-31', 'month-end closing end');

  // 25日締め
  const period2 = calculateClosingPeriod_(2025, 12, 25);
  assertEqual(period2.startDate, '2025-11-26', '25th closing start');
  assertEqual(period2.endDate, '2025-12-25', '25th closing end');

  // 15日締め
  const period3 = calculateClosingPeriod_(2025, 12, 15);
  assertEqual(period3.startDate, '2025-11-16', '15th closing start');
  assertEqual(period3.endDate, '2025-12-15', '15th closing end');
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
  // 祝日セットを取得
  const holidays2025 = getJapaneseHolidays_(2025);

  // 平日
  assertTrue(isBusinessDay_(parseDate_('2025-12-24'), holidays2025), '2025-12-24 is Wednesday');

  // 土日
  assertFalse(isBusinessDay_(parseDate_('2025-12-27'), holidays2025), '2025-12-27 is Saturday');
  assertFalse(isBusinessDay_(parseDate_('2025-12-28'), holidays2025), '2025-12-28 is Sunday');

  // 祝日（元日）
  assertFalse(isBusinessDay_(parseDate_('2025-01-01'), holidays2025), '2025-01-01 is holiday');
}

function testCountBusinessDays() {
  // 1週間（月〜金の5日間）- 日付は文字列形式で渡す
  assertEqual(countBusinessDays_('2025-12-22', '2025-12-26'), 5, 'Mon-Fri should be 5 business days');

  // 週末を含む
  assertEqual(countBusinessDays_('2025-12-22', '2025-12-28'), 5, 'should exclude weekend');
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
  // 切り捨て（RoundingMode.FLOOR = 'floor'）
  assertEqual(applyRounding_(1234.5, 'floor'), 1234, 'floor should round down');
  assertEqual(applyRounding_(1234.9, 'floor'), 1234, 'floor should round down');

  // 切り上げ（RoundingMode.CEIL = 'ceil'）
  assertEqual(applyRounding_(1234.1, 'ceil'), 1235, 'ceil should round up');
  assertEqual(applyRounding_(1234.0, 'ceil'), 1234, 'ceil exact should not change');

  // 四捨五入（RoundingMode.ROUND = 'round'）
  assertEqual(applyRounding_(1234.4, 'round'), 1234, 'round down');
  assertEqual(applyRounding_(1234.5, 'round'), 1235, 'round up');
}

function testCalculateTaxIncluded() {
  // 税率10%（0.10形式で渡す）
  assertEqual(calculateTaxIncluded_(10000, 0.10), 11000, '10000 + 10% = 11000');
  assertEqual(calculateTaxIncluded_(25000, 0.10), 27500, '25000 + 10% = 27500');

  // 端数処理（10001 * 1.10 = 11001.1 → floor → 11001）
  assertEqual(calculateTaxIncluded_(10001, 0.10), 11001, 'floor applied');
}

function testCalculateTaxExcluded() {
  // 税率10%（0.10形式で渡す）
  assertEqual(calculateTaxExcluded_(11000, 0.10), 10000, '11000 / 1.10 = 10000');
  assertEqual(calculateTaxExcluded_(27500, 0.10), 25000, '27500 / 1.10 = 25000');
}

function testCalculateTaxAmount() {
  // 税率10%（0.10形式で渡す）
  assertEqual(calculateTaxAmount_(10000, 0.10), 1000, '10000 * 10% = 1000');
  assertEqual(calculateTaxAmount_(25000, 0.10), 2500, '25000 * 10% = 2500');

  // 端数処理（10001 * 0.10 = 1000.1 → floor → 1000）
  assertEqual(calculateTaxAmount_(10001, 0.10), 1000, 'floor applied');
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

  // 税率は0.10形式で渡す
  const totals = calculateInvoiceTotals_(lines, 0.10);

  assertEqual(totals.subtotal, 62500, 'subtotal = 62500');
  assertEqual(totals.taxAmount, 6250, 'tax = 6250');
  // プロパティ名は totalAmount
  assertEqual(totals.totalAmount, 68750, 'totalAmount = 68750');
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
  // 有効な遷移（引数順序: transitions, fromStatus, toStatus）
  assertTrue(isValidTransition_(JOB_STATUS_TRANSITIONS, 'pending', 'assigned'), 'pending -> assigned');
  assertTrue(isValidTransition_(JOB_STATUS_TRANSITIONS, 'pending', 'hold'), 'pending -> hold');
  assertTrue(isValidTransition_(JOB_STATUS_TRANSITIONS, 'assigned', 'problem'), 'assigned -> problem');

  // 無効な遷移
  assertFalse(isValidTransition_(JOB_STATUS_TRANSITIONS, 'cancelled', 'assigned'), 'cancelled -> assigned');
}

function testAssignmentStatusTransitions() {
  // 有効な遷移（引数順序: transitions, fromStatus, toStatus）
  assertTrue(isValidTransition_(ASSIGNMENT_STATUS_TRANSITIONS, 'assigned', 'confirmed'), 'assigned -> confirmed');
  assertTrue(isValidTransition_(ASSIGNMENT_STATUS_TRANSITIONS, 'assigned', 'cancelled'), 'assigned -> cancelled');

  // 無効な遷移
  assertFalse(isValidTransition_(ASSIGNMENT_STATUS_TRANSITIONS, 'cancelled', 'assigned'), 'cancelled -> assigned');
}

function testInvoiceStatusTransitions() {
  // 有効な遷移（引数順序: transitions, fromStatus, toStatus）
  assertTrue(isValidTransition_(INVOICE_STATUS_TRANSITIONS, 'unsent', 'sent'), 'unsent -> sent');
  assertTrue(isValidTransition_(INVOICE_STATUS_TRANSITIONS, 'sent', 'paid'), 'sent -> paid');
  assertTrue(isValidTransition_(INVOICE_STATUS_TRANSITIONS, 'sent', 'unsent'), 'sent -> unsent (取消)');

  // 無効な遷移
  assertFalse(isValidTransition_(INVOICE_STATUS_TRANSITIONS, 'paid', 'unsent'), 'paid -> unsent');
}

function testGetStatusLabels() {
  // Job status labels
  assertEqual(getJobStatusLabel_('pending'), '未配置', 'pending label');
  assertEqual(getJobStatusLabel_('assigned'), '配置済', 'assigned label');
  assertEqual(getJobStatusLabel_('problem'), '問題あり', 'problem label');

  // Time slot labels
  assertEqual(getTimeSlotLabel_('jotou'), '上棟', 'jotou label');
  assertEqual(getTimeSlotLabel_('shuujitsu'), '終日', 'shuujitsu label');
  assertEqual(getTimeSlotLabel_('am'), 'AM', 'am label');
}

function testIsEditable() {
  // Job editability
  assertTrue(isJobEditable_('pending'), 'pending job is editable');
  assertTrue(isJobEditable_('assigned'), 'assigned job is editable');
  assertTrue(isJobEditable_('problem'), 'problem job is editable');
  assertFalse(isJobEditable_('cancelled'), 'cancelled job is not editable');

  // Invoice editability
  assertTrue(isInvoiceEditable_('unsent'), 'unsent invoice is editable');
  assertTrue(isInvoiceEditable_('draft'), 'draft invoice is editable (後方互換)');
  assertFalse(isInvoiceEditable_('sent'), 'sent invoice is not editable');
}

function testCalculateJobStatus() {
  // calculateJobStatus_(job, assignments) は job オブジェクトと assignments 配列を受け取る
  // テスト用のモックオブジェクトを作成

  // 配置なし -> pending
  const job1 = { status: 'pending', required_count: 3 };
  assertEqual(calculateJobStatus_(job1, []), 'pending', '0 assigned = pending');

  // 一部配置 -> 配置ありなので assigned
  const job2 = { status: 'pending', required_count: 3 };
  const oneAssignment = [{ status: 'assigned', is_deleted: false }];
  assertEqual(calculateJobStatus_(job2, oneAssignment), 'assigned', 'partial = assigned');

  // 全員配置 -> assigned
  const job3 = { status: 'pending', required_count: 3 };
  const fullAssignments = [
    { status: 'assigned', is_deleted: false },
    { status: 'assigned', is_deleted: false },
    { status: 'assigned', is_deleted: false }
  ];
  assertEqual(calculateJobStatus_(job3, fullAssignments), 'assigned', 'full = assigned');

  // キャンセル済みは変更なし
  const job4 = { status: 'cancelled', required_count: 3 };
  assertEqual(calculateJobStatus_(job4, fullAssignments), 'cancelled', 'cancelled stays cancelled');

  // 問題あり は変更なし
  const job5 = { status: 'problem', required_count: 3 };
  assertEqual(calculateJobStatus_(job5, fullAssignments), 'problem', 'problem stays problem');
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

// ============================================
// 正規化関数テスト（KTSM-xxx 税率・大小文字不整合修正）
// ============================================

/**
 * 税率正規化テスト
 * UIは%表記（10）、計算は小数（0.10）が必要
 */
function testNormalizeTaxRate() {
  console.log('=== testNormalizeTaxRate ===');

  // %表記 → 小数
  assertEqual(normalizeTaxRate_(10), 0.10, '10% → 0.10');
  assertEqual(normalizeTaxRate_(8), 0.08, '8% → 0.08');
  assertEqual(normalizeTaxRate_(100), 1.0, '100% → 1.0');

  // 小数はそのまま
  assertEqual(normalizeTaxRate_(0.10), 0.10, '0.10 → 0.10');
  assertEqual(normalizeTaxRate_(0.08), 0.08, '0.08 → 0.08');

  // null/undefined → デフォルト税率
  assertEqual(normalizeTaxRate_(null), DEFAULT_TAX_RATE, 'null → DEFAULT_TAX_RATE');
  assertEqual(normalizeTaxRate_(undefined), DEFAULT_TAX_RATE, 'undefined → DEFAULT_TAX_RATE');
  assertEqual(normalizeTaxRate_(''), DEFAULT_TAX_RATE, 'empty string → DEFAULT_TAX_RATE');

  console.log('testNormalizeTaxRate: PASSED');
}

/**
 * 単位正規化テスト
 * UIが大文字送信する可能性があるため変換
 */
function testNormalizeUnit() {
  console.log('=== testNormalizeUnit ===');

  // 大文字 → 小文字
  assertEqual(normalizeUnit_('FULLDAY'), 'fullday', 'FULLDAY → fullday');
  assertEqual(normalizeUnit_('HALFDAY'), 'halfday', 'HALFDAY → halfday');
  assertEqual(normalizeUnit_('AM'), 'am', 'AM → am');
  assertEqual(normalizeUnit_('PM'), 'pm', 'PM → pm');

  // 小文字はそのまま
  assertEqual(normalizeUnit_('fullday'), 'fullday', 'fullday → fullday');
  assertEqual(normalizeUnit_('halfday'), 'halfday', 'halfday → halfday');

  // 空白トリム
  assertEqual(normalizeUnit_('  FULLDAY  '), 'fullday', 'trimmed');

  // null/undefined → 空文字
  assertEqual(normalizeUnit_(null), '', 'null → empty');
  assertEqual(normalizeUnit_(undefined), '', 'undefined → empty');

  console.log('testNormalizeUnit: PASSED');
}

/**
 * 税額計算テスト（正規化込み）
 * %表記でも小数表記でも同じ結果になることを確認
 */
function testCalculateTaxAmount_withNormalization() {
  console.log('=== testCalculateTaxAmount_withNormalization ===');

  // %表記（10）でも正しく計算
  assertEqual(calculateTaxAmount_(10000, 10), 1000, '10000 * 10(%) = 1000');
  assertEqual(calculateTaxAmount_(25000, 10), 2500, '25000 * 10(%) = 2500');

  // 小数表記（0.10）でも正しく計算
  assertEqual(calculateTaxAmount_(10000, 0.10), 1000, '10000 * 0.10 = 1000');
  assertEqual(calculateTaxAmount_(25000, 0.10), 2500, '25000 * 0.10 = 2500');

  // 8%でも正しく計算
  assertEqual(calculateTaxAmount_(10000, 8), 800, '10000 * 8(%) = 800');
  assertEqual(calculateTaxAmount_(10000, 0.08), 800, '10000 * 0.08 = 800');

  console.log('testCalculateTaxAmount_withNormalization: PASSED');
}

/**
 * 税込計算テスト（正規化込み）
 */
function testCalculateTaxIncluded_withNormalization() {
  console.log('=== testCalculateTaxIncluded_withNormalization ===');

  // %表記（10）でも正しく計算
  assertEqual(calculateTaxIncluded_(10000, 10), 11000, '10000 + 10(%) = 11000');

  // 小数表記（0.10）でも正しく計算
  assertEqual(calculateTaxIncluded_(10000, 0.10), 11000, '10000 + 0.10 = 11000');

  console.log('testCalculateTaxIncluded_withNormalization: PASSED');
}

/**
 * 単位係数テスト（大文字入力対応）
 */
function testGetUnitMultiplier_withNormalization() {
  console.log('=== testGetUnitMultiplier_withNormalization ===');

  // 大文字でも正しく係数取得
  assertEqual(getUnitMultiplier_('FULLDAY'), 1.0, 'FULLDAY → 1.0');
  assertEqual(getUnitMultiplier_('HALFDAY'), 0.5, 'HALFDAY → 0.5');
  assertEqual(getUnitMultiplier_('AM'), 0.5, 'AM → 0.5');
  assertEqual(getUnitMultiplier_('PM'), 0.5, 'PM → 0.5');

  // 小文字でも正しく係数取得
  assertEqual(getUnitMultiplier_('fullday'), 1.0, 'fullday → 1.0');
  assertEqual(getUnitMultiplier_('halfday'), 0.5, 'halfday → 0.5');

  console.log('testGetUnitMultiplier_withNormalization: PASSED');
}

/**
 * 正規化関数のテストを一括実行
 */
function runNormalizationTests() {
  console.log('======================================');
  console.log('Running Normalization Tests');
  console.log('======================================');

  try {
    testNormalizeTaxRate();
    testNormalizeUnit();
    testCalculateTaxAmount_withNormalization();
    testCalculateTaxIncluded_withNormalization();
    testGetUnitMultiplier_withNormalization();

    console.log('======================================');
    console.log('All Normalization Tests PASSED!');
    console.log('======================================');
    return { success: true };
  } catch (error) {
    console.error('Test FAILED:', error.message);
    return { success: false, error: error.message };
  }
}
