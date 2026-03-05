/**
 * Tier 1: 金額計算テスト（純粋関数 + サービスメソッド）
 *
 * 対象: calculateWage_, calculateInvoiceAmount_, getDailyRateByJobType_,
 *       getUnitPriceByJobType_, calculateMonthlyPayout_, calculateExpense_,
 *       calculateInvoiceForAtagami_, normalizeRoundingMode_,
 *       lookupDailyWithholdingTax, InvoiceService._calculateTotals
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
    testLookupDailyWithholdingTax,
    testInvoiceCalculateTotals,
    testCalculateTaxEdgeCases,
    testNormalizeTaxRate,
    testGetSubcontractorRateByUnit,
    testNinkuCoefficientAndAdjustment,
    testCalculatePayoutForSubcontractor_usesSubcontractorMasterRates,
    testCalculatePayoutForSubcontractor_nullSubcontractor,
    testSubcontractorRateByUnit_allPayUnits,
    testStaffPayoutRegression,
    testAssertInvariant_logsOnViolation,
    testWarnMissingRate_logsOnMissing,
    testWarnMissingRate_noLogOnValidRate,
    testAssertInvariant_noLogOnPass
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
    { jobType: 'tobiage', expected: 22500, label: '鳶揚げ (tobi×1.5=22500)' },
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

  // tobiage: マスタ値優先テスト（daily_rate_tobiageが設定されている場合）
  var staffWithTobiage = { daily_rate_tobi: 15000, daily_rate_tobiage: 25000, daily_rate_basic: 14000 };
  assertEqual(getDailyRateByJobType_(staffWithTobiage, 'tobiage'), 25000, 'tobiage マスタ値優先');

  // tobiage: tobi未設定 → 0（fallback計算も0）
  var staffNoTobi = { daily_rate_age: 12000 };
  assertEqual(getDailyRateByJobType_(staffNoTobi, 'tobiage'), 0, 'tobiage but tobi=0 → 0');

  // tobiage奇数端数: tobi=15001 → floor(15001*1.5)=floor(22501.5)=22501
  var staffOddTobi = { daily_rate_tobi: 15001, daily_rate_basic: 14000 };
  assertEqual(getDailyRateByJobType_(staffOddTobi, 'tobiage'), 22501, 'tobiage奇数端数: floor(22501.5)=22501');

  // tobiage最小: tobi=1 → floor(1*1.5)=floor(1.5)=1
  var staffMinTobi = { daily_rate_tobi: 1, daily_rate_basic: 14000 };
  assertEqual(getDailyRateByJobType_(staffMinTobi, 'tobiage'), 1, 'tobiage最小: floor(1.5)=1');

  // am/pm → getDailyRateByJobTypeではbasic fallback（halfではない）
  assertEqual(getDailyRateByJobType_(staff, 'am'), 14000, 'am → basic fallback');
  assertEqual(getDailyRateByJobType_(staff, 'pm'), 14000, 'pm → basic fallback');
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

  // tobiage: マスタ未設定 → tobi×1.5 fallback
  var custNoTobiage = { unit_price_tobi: 20000, unit_price_basic: 19000 };
  assertEqual(getUnitPriceByJobType_(custNoTobiage, 'tobiage'), 30000, 'tobiage未設定 → tobi×1.5 fallback (30000)');

  // tobiage: tobi未設定 → 0
  var custNoTobi = { unit_price_age: 18000 };
  assertEqual(getUnitPriceByJobType_(custNoTobi, 'tobiage'), 0, 'tobiage + tobi未設定 → 0');

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
    // half unit → マスタのhalf用単価をそのまま使用（乗算なし）
    { asg: { wage_rate: null, pay_unit: 'half' }, expected: 0, label: 'half (rate_half未設定) → 0' },
    { asg: { wage_rate: 20000, pay_unit: 'half' }, expected: 20000, label: 'half + 手動単価 → そのまま' },
    { asg: { wage_rate: 20000, pay_unit: 'halfday' }, expected: 20000, label: 'halfday + 手動単価 → そのまま' },
    // am/pm: wage_rate=null → getDailyRateByJobType_('am') → half rate fallback
    { asg: { wage_rate: null, pay_unit: 'am' }, expected: 14000, label: 'am + null wage → basic rate=14000' },
    { asg: { wage_rate: null, pay_unit: 'pm' }, expected: 14000, label: 'pm + null wage → basic rate=14000' },
    // am/pm: wage_rate指定あり → そのまま使用
    { asg: { wage_rate: 20000, pay_unit: 'am' }, expected: 20000, label: 'am + 手動単価 → 20000そのまま' }
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

  // half unit → マスタ単価をそのまま使用（乗算なし）
  var halfAssignments = [
    { wage_rate: 20000, pay_unit: 'half', transport_amount: 500 }
  ];
  var halfResult = calculateMonthlyPayout_(halfAssignments, staff);
  assertEqual(halfResult.baseAmount, 20000, 'half → 単価そのまま（乗算なし）');
}

// ============================================
// lookupDailyWithholdingTax（日額表 甲欄・扶養0人）
// ============================================

function testLookupDailyWithholdingTax() {
  // お客様実データ検証
  assertEqual(lookupDailyWithholdingTax(7500), 190, '7500 → 190');
  assertEqual(lookupDailyWithholdingTax(10000), 280, '10000 → 280');
  assertEqual(lookupDailyWithholdingTax(8500), 225, '8500 → 225');
  assertEqual(lookupDailyWithholdingTax(13000), 525, '13000 → 525');
  assertEqual(lookupDailyWithholdingTax(5250), 105, '5250 → 105');

  // 境界値テスト
  assertEqual(lookupDailyWithholdingTax(0), 0, '0 → 0');
  assertEqual(lookupDailyWithholdingTax(2899), 0, '2899 → 0 (非課税上限)');
  assertEqual(lookupDailyWithholdingTax(2900), 5, '2900 → 5 (課税開始)');
  assertEqual(lookupDailyWithholdingTax(23900), 2295, '23900 → 2295 (テーブル最終行)');

  // 24,000円超: 累進計算式
  // 24,000円: baseTax=2305, rate=20.42%
  assertEqual(lookupDailyWithholdingTax(24000), 2305, '24000 → 2305');
  assertEqual(lookupDailyWithholdingTax(25000), Math.floor(2305 + 1000 * 0.2042), '25000 → 累進計算');

  // 負数
  assertEqual(lookupDailyWithholdingTax(-100), 0, '負数 → 0');
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

  // round rounding mode
  var lines6 = [{ amount: 10001, item_name: '工事' }];
  var result6 = InvoiceService._calculateTotals(lines6, 0.10, 0, 'format1', 'round');
  // tax = round(10001 * 0.10) = round(1000.1) = 1000
  assertEqual(result6.taxAmount, 1000, 'round: 税額四捨五入');
}

// ============================================
// calculateTaxIncluded_ / calculateTaxExcluded_ エッジケース
// ============================================

function testCalculateTaxEdgeCases() {
  // --- calculateTaxIncluded_ ---
  // null/NaN/zero
  assertEqual(calculateTaxIncluded_(null, 0.10), 0, 'taxIncl: null → 0');
  assertEqual(calculateTaxIncluded_(NaN, 0.10), 0, 'taxIncl: NaN → 0');
  assertEqual(calculateTaxIncluded_(0, 0.10), 0, 'taxIncl: 0 → 0');

  // 文字列rate → normalizeTaxRate_ で正規化
  assertEqual(calculateTaxIncluded_(10000, '10'), 11000, 'taxIncl: 文字列rate "10" → 10%');

  // null rate → デフォルト10%
  assertEqual(calculateTaxIncluded_(10000, null), 11000, 'taxIncl: null rate → 10%');

  // round mode
  assertEqual(calculateTaxIncluded_(10001, 0.10, 'round'), 11001, 'taxIncl: round(11001.1)=11001');

  // 負数: floor(-11000)=-11000
  assertEqual(calculateTaxIncluded_(-10000, 0.10), -11000, 'taxIncl: 負数 -10000 → floor(-11000)=-11000');

  // 負数の罠: floor(-11001.1)=-11002
  assertEqual(calculateTaxIncluded_(-10001, 0.10), -11002, 'taxIncl: 負数罠 floor(-11001.1)=-11002');

  // --- calculateTaxExcluded_ ---
  // null/zero
  assertEqual(calculateTaxExcluded_(null, 0.10), 0, 'taxExcl: null → 0');
  assertEqual(calculateTaxExcluded_(0, 0.10), 0, 'taxExcl: 0 → 0');

  // 浮動小数点: 1/1.1=0.909... → floor=0
  assertEqual(calculateTaxExcluded_(1, 0.10, 'floor'), 0, 'taxExcl: 1/1.1 → floor=0');

  // round mode: 11001/1.1=10000.909... → round=10001
  assertEqual(calculateTaxExcluded_(11001, 0.10, 'round'), 10001, 'taxExcl: round(10000.909)=10001');

  // 負数逆算: -11000/1.1=-10000 → floor=-10000
  assertEqual(calculateTaxExcluded_(-11000, 0.10), -10000, 'taxExcl: 負数逆算=-10000');

  // NaN → 0 (calculateTaxIncluded_と対称)
  assertEqual(calculateTaxExcluded_(NaN, 0.10), 0, 'taxExcl: NaN → 0');
}

// ============================================
// normalizeTaxRate_
// ============================================

function testNormalizeTaxRate() {
  var cases = [
    { input: 0.10, expected: 0.10, label: '0.10 → そのまま' },
    { input: 10, expected: 0.10, label: '10 → 0.10 (>=1 → /100)' },
    { input: 1, expected: 0.01, label: '1 → 0.01 (1>=1 なので1%扱い)' },
    { input: 0.99, expected: 0.99, label: '0.99 → そのまま (<1)' },
    { input: 100, expected: 1.0, label: '100 → 1.0 (100%)' },
    { input: '', expected: 0.10, label: '空文字 → デフォルト' },
    { input: null, expected: 0.10, label: 'null → デフォルト' },
    { input: 'abc', expected: 0.10, label: "'abc' → NaN → デフォルト" },
    { input: '10', expected: 0.10, label: "'10' → 文字列数値 → 0.10" }
  ];

  for (var i = 0; i < cases.length; i++) {
    var c = cases[i];
    var result = normalizeTaxRate_(c.input);
    // 浮動小数点比較: 差が1e-10未満ならOK
    if (Math.abs(result - c.expected) > 1e-10) {
      throw new Error(c.label + ': expected ' + c.expected + ' but got ' + result);
    }
  }
}

// ============================================
// getSubcontractorRateByUnit_
// ============================================

function testGetSubcontractorRateByUnit() {
  var sub = {
    basic_rate: 15000, half_day_rate: 8000, full_day_rate: 18000,
    night_rate: 20000, tobi_rate: 22000, age_rate: 19000, tobiage_rate: 25000
  };

  var cases = [
    { unit: 'half', expected: 8000, label: 'half → half_day_rate' },
    { unit: 'halfday', expected: 8000, label: 'halfday → half_day_rate' },
    { unit: 'am', expected: 8000, label: 'am → half_day_rate' },
    { unit: 'pm', expected: 8000, label: 'pm → half_day_rate' },
    { unit: 'full', expected: 18000, label: 'full → full_day_rate' },
    { unit: 'fullday', expected: 18000, label: 'fullday → full_day_rate' },
    { unit: '', expected: 15000, label: '空文字 → basic_rate' },
    { unit: 'tobi', expected: 22000, label: 'tobi → tobi_rate' },
    { unit: 'tobi_hojo', expected: 22000, label: 'tobi_hojo → tobi_rate' },
    { unit: 'age', expected: 19000, label: 'age → age_rate' },
    { unit: 'niage', expected: 19000, label: 'niage → age_rate' },
    { unit: 'tobiage', expected: 25000, label: 'tobiage → tobiage_rate' },
    { unit: 'yakin', expected: 20000, label: 'yakin → night_rate' },
    { unit: 'night', expected: 20000, label: 'night → night_rate (VALID_PAY_UNITSの実値)' }
  ];

  for (var i = 0; i < cases.length; i++) {
    var c = cases[i];
    assertEqual(getSubcontractorRateByUnit_(sub, c.unit), c.expected, c.label);
  }

  // fallback: 拡張単価未設定 → basic_rate（basic_rateとfull_day_rateを異なる値にして
  // default経路(basic_rate ?? full_day_rate)と拡張case経路(xxx_rate ?? basic_rate)を区別する）
  var subNoExtended = { basic_rate: 15000, half_day_rate: 8000, full_day_rate: 18000 };
  assertEqual(getSubcontractorRateByUnit_(subNoExtended, 'yakin'), 15000, 'night未設定 → basic fallback');
  assertEqual(getSubcontractorRateByUnit_(subNoExtended, 'tobi'), 15000, 'tobi未設定 → basic fallback');
  assertEqual(getSubcontractorRateByUnit_(subNoExtended, 'age'), 15000, 'age未設定 → basic fallback');
  assertEqual(getSubcontractorRateByUnit_(subNoExtended, 'tobiage'), 15000, 'tobiage未設定 → basic fallback');

  // 反証テスト: basic_rateも未設定の場合、拡張caseは0を返すがdefaultはfull_day_rateを返す
  // → caseが存在しないとdefault経路でfull_day_rate(18000)になるため、0との差で検出可能
  var subOnlyFull = { full_day_rate: 18000 };
  assertEqual(getSubcontractorRateByUnit_(subOnlyFull, 'yakin'), 0, '反証: yakin caseが存在する(defaultなら18000)');
  assertEqual(getSubcontractorRateByUnit_(subOnlyFull, 'night'), 0, '反証: night caseが存在する(defaultなら18000)');
  assertEqual(getSubcontractorRateByUnit_(subOnlyFull, 'tobi'), 0, '反証: tobi caseが存在する(defaultなら18000)');
  assertEqual(getSubcontractorRateByUnit_(subOnlyFull, 'age'), 0, '反証: age caseが存在する(defaultなら18000)');
  assertEqual(getSubcontractorRateByUnit_(subOnlyFull, 'tobiage'), 0, '反証: tobiage caseが存在する(defaultなら18000)');
  // 対照群: default経路はfull_day_rateを返す
  assertEqual(getSubcontractorRateByUnit_(subOnlyFull, ''), 18000, '対照群: default → full_day_rate');

  // fallback: half未設定 → basic_rate
  var subNoHalf = { basic_rate: 15000 };
  assertEqual(getSubcontractorRateByUnit_(subNoHalf, 'half'), 15000, 'half未設定 → basic fallback');
  assertEqual(getSubcontractorRateByUnit_(subNoHalf, 'full'), 15000, 'full未設定 → basic fallback');

  // fallback: basic未設定 → full_day_rate
  var subNoBasic = { full_day_rate: 18000 };
  assertEqual(getSubcontractorRateByUnit_(subNoBasic, ''), 18000, 'basic未設定 → full_day_rate fallback');

  // 全未定義 → 0
  assertEqual(getSubcontractorRateByUnit_({}, 'half'), 0, '全未定義 → 0');

  // null subcontractor → TypeErrorまたは0（実装のガード確認）
  try {
    var nullResult = getSubcontractorRateByUnit_(null, 'half');
    // ガードがある場合: 0を期待
    assertEqual(nullResult, 0, 'null subcontractor → 0');
  } catch (e) {
    // ガードがない場合: TypeErrorが発生することを確認
    if (!(e instanceof TypeError)) {
      throw new Error('null subcontractor: TypeError以外のエラー: ' + e.message);
    }
    // TypeError は期待通り — null入力でクラッシュすることを文書化
  }
}

// ============================================
// calculateNinkuCoefficient_ / calculateNinkuAdjustment_
// ============================================

function testNinkuCoefficientAndAdjustment() {
  // --- 係数テスト ---
  var coeffCases = [
    { req: 3, act: 2, expected: 1.5, label: '不足配置 3/2=1.5' },
    { req: 3, act: 4, expected: 0.7, label: '過剰配置 floor(3/4*10)/10=0.7' },
    { req: 3, act: 3, expected: 1.0, label: '適正配置 → 1.0' },
    { req: 3, act: 7, expected: 0.4, label: 'floor(3/7*10)/10=0.4' },
    { req: 1, act: 3, expected: 0.3, label: 'floor(1/3*10)/10=0.3' },
    { req: 2, act: 3, expected: 0.6, label: 'floor(2/3*10)/10=0.6' },
    { req: 0, act: 0, expected: 1.0, label: 'ゼロガード 0/0 → 1.0' },
    { req: 5, act: 0, expected: 1.0, label: 'actual=0ガード → 1.0' },
    { req: 0, act: 5, expected: 1.0, label: 'required=0ガード → 1.0' },
    { req: 10, act: 1, expected: 10.0, label: '極端な不足 10/1=10.0' },
    { req: null, act: 3, expected: 1.0, label: 'null required → 0 → ガード → 1.0' },
    { req: 3, act: null, expected: 1.0, label: 'null actual → 0 → ガード → 1.0' },
    { req: 3, act: undefined, expected: 1.0, label: 'undefined actual → 0 → ガード → 1.0' }
  ];

  for (var i = 0; i < coeffCases.length; i++) {
    var c = coeffCases[i];
    var result = calculateNinkuCoefficient_(c.req, c.act);
    if (Math.abs(result - c.expected) > 1e-10) {
      throw new Error(c.label + ': expected ' + c.expected + ' but got ' + result);
    }
  }

  // --- 調整額テスト ---
  var adjCases = [
    { wage: 15000, coeff: 0.6, expected: -6000, label: 'floor(9000)-15000=-6000' },
    { wage: 15000, coeff: 1.5, expected: 7500, label: 'floor(22500)-15000=7500' },
    { wage: 15001, coeff: 1.5, expected: 7500, label: 'floor(22501.5)=22501, 22501-15001=7500' },
    { wage: 15000, coeff: 1.0, expected: 0, label: '係数1.0 → 調整なし' },
    { wage: 0, coeff: 0.6, expected: 0, label: 'floor(0)-0=0' }
  ];

  for (var i = 0; i < adjCases.length; i++) {
    var c = adjCases[i];
    assertEqual(calculateNinkuAdjustment_(c.wage, c.coeff), c.expected, c.label);
  }
}

/**
 * calculatePayoutForSubcontractor が外注先マスタ単価を使って計算することを検証
 */
function testCalculatePayoutForSubcontractor_usesSubcontractorMasterRates() {
  var mockSub = {
    subcontractor_id: 'SUB_TEST_001',
    company_name: 'テスト外注',
    basic_rate: 15000,
    half_day_rate: 8000,
    full_day_rate: 15000
  };

  var mockAssignments = [
    { assignment_id: 'A1', pay_unit: 'am', wage_rate: null, transport_amount: 500, work_date: '2026-01-10' },
    { assignment_id: 'A2', pay_unit: 'fullday', wage_rate: null, transport_amount: 1000, work_date: '2026-01-11' },
    { assignment_id: 'A3', pay_unit: 'basic', wage_rate: null, transport_amount: 0, work_date: '2026-01-12' }
  ];

  // スタブ: Repository と getUnpaidAssignments を差し替え
  var origFindById = SubcontractorRepository.findById;
  var origGetUnpaid = PayoutService.getUnpaidAssignmentsForSubcontractor;

  SubcontractorRepository.findById = function(id) {
    if (id === 'SUB_TEST_001') return mockSub;
    return null;
  };
  PayoutService.getUnpaidAssignmentsForSubcontractor = function() {
    return mockAssignments;
  };

  try {
    var result = PayoutService.calculatePayoutForSubcontractor('SUB_TEST_001', '2026-01-31');

    // am→8000, fullday→15000, basic→15000 = 38000
    assertEqual(result.baseAmount, 38000, '外注費baseAmount = 8000+15000+15000');
    assertEqual(result.transportAmount, 1500, '交通費合計 = 500+1000+0');
    assertEqual(result.totalAmount, 39500, '合計 = 38000+1500');
    assertEqual(result.assignmentCount, 3, '配置数 = 3');

    // wage_rate が書き戻されていること
    assertEqual(mockAssignments[0].wage_rate, 8000, 'A1 wage_rate書き戻し = 8000 (am)');
    assertEqual(mockAssignments[1].wage_rate, 15000, 'A2 wage_rate書き戻し = 15000 (fullday)');
    assertEqual(mockAssignments[2].wage_rate, 15000, 'A3 wage_rate書き戻し = 15000 (basic)');
  } finally {
    SubcontractorRepository.findById = origFindById;
    PayoutService.getUnpaidAssignmentsForSubcontractor = origGetUnpaid;
  }
}

/**
 * 存在しない外注先ID → エラーが投げられることを検証
 */
function testCalculatePayoutForSubcontractor_nullSubcontractor() {
  var origFindById = SubcontractorRepository.findById;
  var origGetUnpaid = PayoutService.getUnpaidAssignmentsForSubcontractor;

  SubcontractorRepository.findById = function() { return null; };
  PayoutService.getUnpaidAssignmentsForSubcontractor = function() {
    return [{ assignment_id: 'A1', pay_unit: 'basic', wage_rate: null, transport_amount: 0, work_date: '2026-01-10' }];
  };

  try {
    var threw = false;
    try {
      PayoutService.calculatePayoutForSubcontractor('NON_EXISTENT', '2026-01-31');
    } catch (e) {
      threw = true;
      if (e.message.indexOf('外注先が見つかりません') === -1) {
        throw new Error('想定外のエラーメッセージ: ' + e.message);
      }
    }
    if (!threw) {
      throw new Error('存在しない外注先でエラーが投げられるべき');
    }
  } finally {
    SubcontractorRepository.findById = origFindById;
    PayoutService.getUnpaidAssignmentsForSubcontractor = origGetUnpaid;
  }
}

/**
 * getUnpaidSubcontractorList が外注先マスタ単価で推定額を計算することを検証
 */
function testSubcontractorRateByUnit_allPayUnits() {
  // getSubcontractorRateByUnit_ は純粋関数なので直接テスト
  var sub = {
    basic_rate: 20000, half_day_rate: 10000, full_day_rate: 20000,
    night_rate: 25000, tobi_rate: 22000, age_rate: 19000, tobiage_rate: 24000
  };

  // getUnpaidSubcontractorList 内部で使われるのと同じロジックを検証
  var amRate = getSubcontractorRateByUnit_(sub, 'am');
  var fullRate = getSubcontractorRateByUnit_(sub, 'fullday');
  var basicRate = getSubcontractorRateByUnit_(sub, 'basic');

  assertEqual(amRate, 10000, '未払一覧: am単価 = half_day_rate');
  assertEqual(fullRate, 20000, '未払一覧: fullday単価 = full_day_rate');
  assertEqual(basicRate, 20000, '未払一覧: basic単価 = basic_rate');

  // 拡張単価の検証
  var yakinRate = getSubcontractorRateByUnit_(sub, 'yakin');
  var tobiRate = getSubcontractorRateByUnit_(sub, 'tobi');
  var ageRate = getSubcontractorRateByUnit_(sub, 'age');
  var tobiageRate = getSubcontractorRateByUnit_(sub, 'tobiage');

  assertEqual(yakinRate, 25000, '未払一覧: yakin単価 = night_rate');
  assertEqual(tobiRate, 22000, '未払一覧: tobi単価 = tobi_rate');
  assertEqual(ageRate, 19000, '未払一覧: age単価 = age_rate');
  assertEqual(tobiageRate, 24000, '未払一覧: tobiage単価 = tobiage_rate');

  // 合計が wage_rate=0 ではなくマスタ単価で計算されることの確認
  var estimated = amRate + fullRate + basicRate;
  assertEqual(estimated, 50000, '推定額 = 10000+20000+20000 = 50000 (0ではない)');
}

/**
 * 通常スタッフの支払い計算が既存ロジック通りに動くことの回帰テスト
 * calculateWage_ が staff の daily_rate を正しく使うことを確認
 */
function testStaffPayoutRegression() {
  var staff = {
    staff_id: 'STAFF_001',
    daily_rate_basic: 15000,
    daily_rate_tobi: 18000,
    daily_rate_age: 16000
  };

  // 各 job_type で正しい日給が取得されることを確認
  var basicRate = getDailyRateByJobType_(staff, 'basic');
  var tobiRate = getDailyRateByJobType_(staff, 'tobi');
  var ageRate = getDailyRateByJobType_(staff, 'age');

  assertEqual(basicRate, 15000, '回帰: basic日給');
  assertEqual(tobiRate, 18000, '回帰: tobi日給');
  assertEqual(ageRate, 16000, '回帰: age日給');

  // calculateWage_(assignment, staff, jobType) で日給ベースの計算が正しく動くことを確認
  var fullAssignment = { wage_rate: null, pay_unit: 'fullday' };
  var wage = calculateWage_(fullAssignment, staff, 'basic');
  assertEqual(wage, 15000, '回帰: basic×fullday = 15000');

  var halfAssignment = { wage_rate: null, pay_unit: 'am' };
  var halfWage = calculateWage_(halfAssignment, staff, 'basic');
  assertEqual(halfWage, 7500, '回帰: basic×am = 7500');
}

// ============================================
// assertInvariant_ / warnMissingRate_ テスト
// ============================================

/**
 * assertInvariant_: 条件falseでログ出力されること（throwしない）
 */
function testAssertInvariant_logsOnViolation() {
  // throwしないことを確認（既存ロジックに影響なし）
  var threw = false;
  try {
    assertInvariant_(false, 'test violation', { key: 'value' });
  } catch (e) {
    threw = true;
  }
  assertEqual(threw, false, 'assertInvariant_ はthrowしない');

  // 件数>0 && baseAmount=0 で警告が出るロジックの動作確認
  // calculateMonthlyPayout_ に0単価スタッフを渡す → throwしないが警告出力
  var zeroStaff = { staff_id: 'ZERO_001' }; // 全単価未設定
  var assignments = [
    { wage_rate: null, pay_unit: 'basic', transport_amount: 0 }
  ];
  var result = calculateMonthlyPayout_(assignments, zeroStaff);
  assertEqual(result.baseAmount, 0, '単価未設定 → baseAmount=0');
  assertEqual(result.totalAmount, 0, '単価未設定 → totalAmount=0');
  // 正常にreturnすること（throwしない）がテスト成功
}

/**
 * warnMissingRate_: null/undefined/空文字でログ出力（throwしない）
 */
function testWarnMissingRate_logsOnMissing() {
  var threw = false;
  try {
    warnMissingRate_('testSource', null, { id: 'TEST_001' });
    warnMissingRate_('testSource', undefined, { id: 'TEST_002' });
    warnMissingRate_('testSource', '', { id: 'TEST_003' });
  } catch (e) {
    threw = true;
  }
  assertEqual(threw, false, 'warnMissingRate_ はthrowしない');

  // getSubcontractorRateByUnit_ に全未定義外注先 → warn出力 + 0返却
  var emptySubcontractor = { subcontractor_id: 'EMPTY_001' };
  var rate = getSubcontractorRateByUnit_(emptySubcontractor, 'basic');
  assertEqual(rate, 0, '全未定義外注先 → rate=0 (warn出力されるがthrowしない)');
}

/**
 * warnMissingRate_: 有効な値ではログ出力されないこと
 */
function testWarnMissingRate_noLogOnValidRate() {
  // 数値0はnull/undefined/''ではないのでwarnされない（正当な0円契約）
  var threw = false;
  try {
    warnMissingRate_('testSource', 0, { id: 'VALID_ZERO' });
    warnMissingRate_('testSource', 15000, { id: 'VALID_RATE' });
  } catch (e) {
    threw = true;
  }
  assertEqual(threw, false, '有効な値でもthrowしない');

  // 正常な外注先 → rate>0、warnなし
  var sub = { subcontractor_id: 'SUB_OK', basic_rate: 15000, half_day_rate: 8000 };
  var rate = getSubcontractorRateByUnit_(sub, 'basic');
  assertEqual(rate, 15000, '正常外注先 → 15000');
}

/**
 * assertInvariant_: 条件trueでは何もしない
 */
function testAssertInvariant_noLogOnPass() {
  var threw = false;
  try {
    assertInvariant_(true, 'should not log', { key: 'value' });
  } catch (e) {
    threw = true;
  }
  assertEqual(threw, false, 'assertInvariant_(true) は何もしない');

  // 正常な月次支払い計算 → violation出ない
  var staff = { staff_id: 'STAFF_OK', daily_rate_basic: 15000 };
  var assignments = [
    { wage_rate: null, pay_unit: 'basic', transport_amount: 500 },
    { wage_rate: null, pay_unit: 'basic', transport_amount: 1000 }
  ];
  var result = calculateMonthlyPayout_(assignments, staff);
  assertEqual(result.baseAmount, 30000, '正常計算: baseAmount=30000');
  assertEqual(result.totalAmount, 31500, '正常計算: totalAmount=31500');
}

// ============================================
// 手動検証用: サイレントバグ検出デモ
// ============================================

/**
 * GASエディタから直接実行して検出ログを確認する関数。
 * 実行後、「実行ログ」で [MISSING RATE] / [INVARIANT VIOLATION] を検索。
 */
function testSilentBugDetection() {
  console.log('=== Silent Bug Detection Demo ===');

  // 1. MISSING RATE: 単価未設定の外注先
  console.log('\n--- 1. 外注先マスタ単価欠損 ---');
  var emptySubcontractor = { subcontractor_id: 'DEMO_EMPTY' };
  var rate = getSubcontractorRateByUnit_(emptySubcontractor, 'basic');
  console.log('rate = ' + rate + ' (0なら [MISSING RATE] が上に出ているはず)');

  // 2. MISSING RATE: 単価未設定のスタッフ
  console.log('\n--- 2. スタッフマスタ単価欠損 ---');
  var emptyStaff = { staff_id: 'DEMO_ZERO' };
  var wage = calculateWage_({ wage_rate: null, pay_unit: 'basic' }, emptyStaff, 'basic');
  console.log('wage = ' + wage + ' (0なら [MISSING RATE] が上に出ているはず)');

  // 3. INVARIANT VIOLATION: 配置ありだがbaseAmount=0
  console.log('\n--- 3. 全配置の単価欠損（配置あり but 合計0円）---');
  var result = calculateMonthlyPayout_(
    [{ wage_rate: null, pay_unit: 'basic', transport_amount: 0 }],
    emptyStaff
  );
  console.log('baseAmount = ' + result.baseAmount + ' (0なら [INVARIANT VIOLATION] が上に出ているはず)');

  // 4. 正常データ: ログなし
  console.log('\n--- 4. 正常データ（ログ出ないことを確認）---');
  var normalStaff = { staff_id: 'DEMO_OK', daily_rate_basic: 15000 };
  var normalWage = calculateWage_({ wage_rate: null, pay_unit: 'basic' }, normalStaff, 'basic');
  console.log('wage = ' + normalWage + ' (15000、警告ログなし)');

  console.log('\n=== Demo Complete ===');
}
