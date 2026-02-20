/**
 * Tier 1: 金額計算テスト（純粋関数 + サービスメソッド）
 *
 * 対象: calculateWage_, calculateInvoiceAmount_, getDailyRateByJobType_,
 *       getUnitPriceByJobType_, calculateMonthlyPayout_, calculateExpense_,
 *       calculateInvoiceForAtagami_, normalizeRoundingMode_,
 *       PayoutService._calculateWithholdingTax, InvoiceService._calculateTotals
 */

function runCalcAdvancedTests() {
  console.log('=== Calc Advanced Tests ===');

  var tests = [
    testNormalizeRoundingMode,
    testGetDailyRateByJobType,
    testGetUnitPriceByJobType,
    testCalculateWage,
    testCalculateInvoiceAmount,
    testCalculateExpense,
    testCalculateInvoiceForAtagami,
    testCalculateMonthlyPayout,
    testWithholdingTax,
    testInvoiceCalculateTotals
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

  console.log('\nCalc Advanced: ' + passed + ' passed, ' + failed + ' failed');
  return { passed: passed, failed: failed, errors: errors };
}

// ============================================
// normalizeRoundingMode_
// ============================================

function testNormalizeRoundingMode() {
  var cases = [
    { input: null, expected: 'floor', label: 'null → floor' },
    { input: undefined, expected: 'floor', label: 'undefined → floor' },
    { input: '', expected: 'floor', label: '空文字 → floor' },
    { input: 'floor', expected: 'floor', label: 'floor' },
    { input: 'FLOOR', expected: 'floor', label: 'FLOOR (大文字)' },
    { input: 'ceil', expected: 'ceil', label: 'ceil' },
    { input: 'CEIL', expected: 'ceil', label: 'CEIL (大文字)' },
    { input: 'round', expected: 'round', label: 'round' },
    { input: ' Round ', expected: 'round', label: 'Round (前後空白)' },
    { input: 'unknown', expected: 'floor', label: '不明値 → floor' },
    { input: 'truncate', expected: 'floor', label: 'truncate → floor' }
  ];

  for (var i = 0; i < cases.length; i++) {
    var c = cases[i];
    assertEqual(normalizeRoundingMode_(c.input), c.expected, c.label);
  }
}

// ============================================
// getDailyRateByJobType_
// ============================================

function testGetDailyRateByJobType() {
  var staff = {
    daily_rate_tobi: 15000,
    daily_rate_age: 12000,
    daily_rate_half: 8000,
    daily_rate_basic: 14000,
    daily_rate_fullday: 16000,
    daily_rate_night: 17000
  };

  var cases = [
    { jobType: 'tobi', expected: 15000, label: '鳶' },
    { jobType: 'age', expected: 12000, label: '揚げ' },
    { jobType: 'tobiage', expected: Math.floor(15000 * 1.5), label: '鳶揚げ (tobi×1.5)' },
    { jobType: 'half', expected: 8000, label: 'half' },
    { jobType: 'halfday', expected: 8000, label: 'halfday' },
    { jobType: 'basic', expected: 14000, label: 'basic' },
    { jobType: 'fullday', expected: 16000, label: 'fullday' },
    { jobType: 'night', expected: 17000, label: 'night' },
    { jobType: 'unknown', expected: 14000, label: 'unknown → basic fallback' },
    { jobType: '', expected: 14000, label: '空文字 → basic fallback' },
    { jobType: null, expected: 14000, label: 'null → basic fallback' }
  ];

  for (var i = 0; i < cases.length; i++) {
    var c = cases[i];
    assertEqual(getDailyRateByJobType_(staff, c.jobType), c.expected, c.label);
  }

  // basic未設定 → tobiフォールバック
  var staffNoBasic = { daily_rate_tobi: 15000 };
  assertEqual(getDailyRateByJobType_(staffNoBasic, 'basic'), 15000, 'basic未設定 → tobi fallback');
  assertEqual(getDailyRateByJobType_(staffNoBasic, 'fullday'), 15000, 'fullday未設定 → tobi fallback');
  assertEqual(getDailyRateByJobType_(staffNoBasic, 'night'), 15000, 'night未設定 → tobi fallback');
  assertEqual(getDailyRateByJobType_(staffNoBasic, 'unknown'), 15000, 'unknown + basic未設定 → tobi fallback');

  // null staff → 0
  assertEqual(getDailyRateByJobType_(null, 'tobi'), 0, 'null staff → 0');

  // tobiage: tobi未設定 → 0
  var staffNoTobi = { daily_rate_age: 12000 };
  assertEqual(getDailyRateByJobType_(staffNoTobi, 'tobiage'), 0, 'tobiage but tobi=0 → 0');
}

// ============================================
// getUnitPriceByJobType_
// ============================================

function testGetUnitPriceByJobType() {
  var customer = {
    unit_price_tobi: 20000,
    unit_price_age: 18000,
    unit_price_tobiage: 25000,
    unit_price_basic: 19000,
    unit_price_half: 10000,
    unit_price_fullday: 22000,
    unit_price_night: 23000
  };

  var cases = [
    { jobType: 'tobi', expected: 20000, label: '鳶' },
    { jobType: 'age', expected: 18000, label: '揚げ' },
    { jobType: 'tobiage', expected: 25000, label: '鳶揚げ' },
    { jobType: 'basic', expected: 19000, label: 'basic' },
    { jobType: 'half', expected: 10000, label: 'half' },
    { jobType: 'halfday', expected: 10000, label: 'halfday' },
    { jobType: 'fullday', expected: 22000, label: 'fullday' },
    { jobType: 'night', expected: 23000, label: 'night' },
    { jobType: 'unknown', expected: 19000, label: 'unknown → basic fallback' },
    { jobType: '', expected: 19000, label: '空文字 → basic fallback' }
  ];

  for (var i = 0; i < cases.length; i++) {
    var c = cases[i];
    assertEqual(getUnitPriceByJobType_(customer, c.jobType), c.expected, c.label);
  }

  // basic未設定 → tobiフォールバック
  var custNoBasic = { unit_price_tobi: 20000 };
  assertEqual(getUnitPriceByJobType_(custNoBasic, 'basic'), 20000, 'basic未設定 → tobi fallback');
  assertEqual(getUnitPriceByJobType_(custNoBasic, 'fullday'), 20000, 'fullday未設定 → tobi fallback');
  assertEqual(getUnitPriceByJobType_(custNoBasic, 'night'), 20000, 'night未設定 → tobi fallback');
  assertEqual(getUnitPriceByJobType_(custNoBasic, 'unknown'), 20000, 'unknown + basic未設定 → tobi fallback');

  // null customer → 0
  assertEqual(getUnitPriceByJobType_(null, 'tobi'), 0, 'null customer → 0');
}

// ============================================
// calculateWage_
// ============================================

function testCalculateWage() {
  var staff = { daily_rate_tobi: 15000, daily_rate_basic: 14000 };

  var cases = [
    // wage_rate指定あり → override優先
    { asg: { wage_rate: 20000, pay_unit: 'basic' }, expected: 20000, label: '手動単価優先' },
    // wage_rate=0 → 0は null/undefined/'' に該当しないのでoverride扱い（0円指定）
    { asg: { wage_rate: 0, pay_unit: 'tobi' }, expected: 0, label: 'wage_rate=0 → override(0円)' },
    // wage_rate未設定 → masterから取得
    { asg: { wage_rate: null, pay_unit: 'tobi' }, expected: 15000, label: 'null → master(tobi)' },
    { asg: { wage_rate: undefined, pay_unit: 'basic' }, expected: 14000, label: 'undefined → master(basic)' },
    { asg: { wage_rate: '', pay_unit: 'tobi' }, expected: 15000, label: '空文字 → master(tobi)' },
    // half unit → multiplier 0.5
    { asg: { wage_rate: null, pay_unit: 'half' }, expected: 0, label: 'half (rate_half未設定) → 0' },
    { asg: { wage_rate: 20000, pay_unit: 'half' }, expected: 10000, label: 'half + 手動単価 → 半額' },
    { asg: { wage_rate: 20000, pay_unit: 'halfday' }, expected: 10000, label: 'halfday + 手動単価 → 半額' }
  ];

  for (var i = 0; i < cases.length; i++) {
    var c = cases[i];
    assertEqual(calculateWage_(c.asg, staff, c.asg.pay_unit || 'basic'), c.expected, c.label);
  }
}

// ============================================
// calculateInvoiceAmount_
// ============================================

function testCalculateInvoiceAmount() {
  var customer = { unit_price_tobi: 20000, unit_price_basic: 19000 };

  var cases = [
    { asg: { invoice_rate: 25000, invoice_unit: 'basic' }, expected: 25000, label: '手動単価優先' },
    { asg: { invoice_rate: null, invoice_unit: 'tobi' }, expected: 20000, label: 'null → master(tobi)' },
    { asg: { invoice_rate: undefined, invoice_unit: 'basic' }, expected: 19000, label: 'undefined → master(basic)' },
    { asg: { invoice_rate: '', invoice_unit: 'tobi' }, expected: 20000, label: '空文字 → master(tobi)' },
    { asg: { invoice_rate: 0, invoice_unit: 'tobi' }, expected: 0, label: 'invoice_rate=0 → override(0円)' },
    { asg: { invoice_rate: 30000, invoice_unit: 'half' }, expected: 15000, label: 'half → 半額' },
    { asg: { invoice_rate: 30000, invoice_unit: 'halfday' }, expected: 15000, label: 'halfday → 半額' }
  ];

  for (var i = 0; i < cases.length; i++) {
    var c = cases[i];
    assertEqual(calculateInvoiceAmount_(c.asg, customer, c.asg.invoice_unit || 'basic'), c.expected, c.label);
  }
}

// ============================================
// calculateExpense_
// ============================================

function testCalculateExpense() {
  // 正常系
  assertEqual(calculateExpense_(100000, 10), 10000, '10万×10%=1万');
  assertEqual(calculateExpense_(150000, 5), 7500, '15万×5%=7500');

  // 端数切り捨て
  assertEqual(calculateExpense_(100000, 3), 3000, '10万×3%=3000');
  assertEqual(calculateExpense_(100001, 3), 3000, '端数切り捨て');

  // 境界値
  assertEqual(calculateExpense_(0, 10), 0, 'baseAmount=0 → 0');
  assertEqual(calculateExpense_(100000, 0), 0, 'expenseRate=0 → 0');

  // ceil rounding
  assertEqual(calculateExpense_(100001, 3, 'ceil'), 3001, 'ceil → 切り上げ');

  // round rounding
  assertEqual(calculateExpense_(100001, 3, 'round'), 3000, 'round → 四捨五入');
}

// ============================================
// calculateInvoiceForAtagami_
// ============================================

function testCalculateInvoiceForAtagami() {
  // 正常系: workAmount=100000, expenseRate=10%, taxRate=10%
  var result = calculateInvoiceForAtagami_(100000, 10);
  assertEqual(result.workAmount, 100000, '作業金額');
  assertEqual(result.expenseAmount, 10000, '経費(10%)');
  assertEqual(result.subtotal, 110000, '小計');
  assertEqual(result.taxAmount, 11000, '消費税(10%)');
  assertEqual(result.totalAmount, 121000, '合計');

  // 経費率0%
  var result2 = calculateInvoiceForAtagami_(100000, 0);
  assertEqual(result2.expenseAmount, 0, '経費0%');
  assertEqual(result2.subtotal, 100000, '小計=作業金額');
  assertEqual(result2.taxAmount, 10000, '消費税');
  assertEqual(result2.totalAmount, 110000, '合計');

  // workAmount=0
  var result3 = calculateInvoiceForAtagami_(0, 10);
  assertEqual(result3.workAmount, 0, 'workAmount=0');
  assertEqual(result3.expenseAmount, 0, 'expense=0');
  assertEqual(result3.totalAmount, 0, 'total=0');
}

// ============================================
// calculateMonthlyPayout_
// ============================================

function testCalculateMonthlyPayout() {
  var staff = { daily_rate_tobi: 15000, daily_rate_basic: 14000 };

  // 複数配置の集計
  var assignments = [
    { wage_rate: 15000, pay_unit: 'basic', transport_amount: 500 },
    { wage_rate: 16000, pay_unit: 'basic', transport_amount: 1000 },
    { wage_rate: null, pay_unit: 'basic', transport_amount: null }
  ];

  var result = calculateMonthlyPayout_(assignments, staff);
  // asg1: wage=15000, asg2: wage=16000, asg3: masterからbasic=14000
  assertEqual(result.baseAmount, 15000 + 16000 + 14000, 'baseAmount集計');
  assertEqual(result.transportAmount, 500 + 1000, 'transportAmount集計');
  assertEqual(result.totalAmount, 45000 + 1500, 'totalAmount = base + transport');

  // 空配列
  var empty = calculateMonthlyPayout_([], staff);
  assertEqual(empty.baseAmount, 0, '空配列 → base=0');
  assertEqual(empty.transportAmount, 0, '空配列 → transport=0');
  assertEqual(empty.totalAmount, 0, '空配列 → total=0');

  // half unit → multiplier 0.5
  var halfAssignments = [
    { wage_rate: 20000, pay_unit: 'half', transport_amount: 500 }
  ];
  var halfResult = calculateMonthlyPayout_(halfAssignments, staff);
  assertEqual(halfResult.baseAmount, 10000, 'half → 0.5倍');
}

// ============================================
// PayoutService._calculateWithholdingTax
// ============================================

function testWithholdingTax() {
  // 源泉徴収対象
  var staffApplicable = { withholding_tax_applicable: true };
  assertEqual(
    PayoutService._calculateWithholdingTax(staffApplicable, 100000),
    Math.floor(100000 * 0.1021),
    '100000 × 10.21% = 10210'
  );
  assertEqual(
    PayoutService._calculateWithholdingTax(staffApplicable, 0),
    0,
    'baseAmount=0 → 0'
  );

  // 端数切り捨て確認
  assertEqual(
    PayoutService._calculateWithholdingTax(staffApplicable, 15000),
    Math.floor(15000 * 0.1021),
    '15000 × 10.21% = 1531 (floor)'
  );

  // 源泉徴収非対象
  var staffNotApplicable = { withholding_tax_applicable: false };
  assertEqual(
    PayoutService._calculateWithholdingTax(staffNotApplicable, 100000),
    0,
    '非対象 → 0'
  );

  // withholding_tax_applicable未設定
  var staffNoFlag = {};
  assertEqual(
    PayoutService._calculateWithholdingTax(staffNoFlag, 100000),
    0,
    'フラグ未設定 → 0'
  );

  // null staff
  assertEqual(
    PayoutService._calculateWithholdingTax(null, 100000),
    0,
    'null staff → 0'
  );
}

// ============================================
// InvoiceService._calculateTotals
// ============================================

function testInvoiceCalculateTotals() {
  // format1: 通常請求書（経費行なし）
  var lines1 = [
    { amount: 20000, item_name: '鳶工事' },
    { amount: 15000, item_name: '揚げ工事' }
  ];
  var result1 = InvoiceService._calculateTotals(lines1, 0.10, 0, 'format1');
  assertEqual(result1.subtotal, 35000, 'format1: subtotal');
  assertEqual(result1.taxAmount, 3500, 'format1: tax(10%)');
  assertEqual(result1.totalAmount, 38500, 'format1: total');
  assertEqual(result1.expenseAmount, 0, 'format1: 経費なし');

  // atamagami: 経費率あり、経費行なし → 自動計算
  var lines2 = [
    { amount: 100000, item_name: '鳶工事' }
  ];
  var result2 = InvoiceService._calculateTotals(lines2, 0.10, 10, 'atamagami');
  assertEqual(result2.subtotal, 100000, 'atamagami: subtotal=workAmount');
  assertEqual(result2.expenseAmount, 10000, 'atamagami: 経費自動計算(10%)');
  assertEqual(result2.taxAmount, 11000, 'atamagami: tax on (work+expense)');
  assertEqual(result2.totalAmount, 121000, 'atamagami: total');

  // atamagami: 経費行が明細にある場合 → 自動計算しない
  var lines3 = [
    { amount: 100000, item_name: '鳶工事' },
    { amount: 5000, item_name: '諸経費' }
  ];
  var result3 = InvoiceService._calculateTotals(lines3, 0.10, 10, 'atamagami');
  assertEqual(result3.expenseAmount, 5000, 'atamagami: 明細の経費行優先');
  assertEqual(result3.subtotal, 100000, 'atamagami: subtotal=workAmountのみ');

  // adjustment付き（5引数形式）
  var lines4 = [{ amount: 50000, item_name: '工事' }];
  var adjustments = [{ amount: -5000 }];
  var result4 = InvoiceService._calculateTotals(lines4, adjustments, 0.10, 0, 'format1');
  assertEqual(result4.adjustmentTotal, -5000, '調整: -5000');
  // taxable = 50000 + 0 + (-5000) = 45000
  assertEqual(result4.taxAmount, 4500, '調整後tax: 45000×10%');
  assertEqual(result4.totalAmount, 49500, '調整後total: 45000+4500');

  // ceil rounding mode
  var lines5 = [{ amount: 10001, item_name: '工事' }];
  var result5 = InvoiceService._calculateTotals(lines5, 0.10, 0, 'format1', 'ceil');
  // tax = ceil(10001 * 0.10) = ceil(1000.1) = 1001
  assertEqual(result5.taxAmount, 1001, 'ceil: 税額切り上げ');
}
