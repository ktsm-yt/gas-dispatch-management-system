// File: calc_utils.gs
// 金額計算ユーティリティ（KTSM-63）

/**
 * デフォルト消費税率（10%）
 */
const DEFAULT_TAX_RATE = 0.10;

/**
 * 端数処理方式
 */
const RoundingMode = {
  FLOOR: 'floor',       // 切り捨て
  CEIL: 'ceil',         // 切り上げ
  ROUND: 'round'        // 四捨五入
};

// ============================================
// 基本的な金額計算
// ============================================

/**
 * 端数処理を行う
 * @param {number} value - 処理する数値
 * @param {string} mode - 端数処理方式（floor/ceil/round）
 * @returns {number} 端数処理後の数値
 */
function applyRounding_(value, mode = RoundingMode.FLOOR) {
  switch (mode) {
    case RoundingMode.CEIL:
      return Math.ceil(value);
    case RoundingMode.ROUND:
      return Math.round(value);
    case RoundingMode.FLOOR:
    default:
      return Math.floor(value);
  }
}

/**
 * 税抜金額から税込金額を計算
 * @param {number} amount - 税抜金額
 * @param {number} taxRate - 税率（0.10 = 10%）
 * @param {string} roundingMode - 端数処理方式
 * @returns {number} 税込金額
 */
function calculateTaxIncluded_(amount, taxRate = DEFAULT_TAX_RATE, roundingMode = RoundingMode.FLOOR) {
  if (amount === null || amount === undefined || isNaN(amount)) return 0;
  const taxIncluded = amount * (1 + taxRate);
  return applyRounding_(taxIncluded, roundingMode);
}

/**
 * 税込金額から税抜金額を計算
 * @param {number} amount - 税込金額
 * @param {number} taxRate - 税率（0.10 = 10%）
 * @param {string} roundingMode - 端数処理方式
 * @returns {number} 税抜金額
 */
function calculateTaxExcluded_(amount, taxRate = DEFAULT_TAX_RATE, roundingMode = RoundingMode.FLOOR) {
  if (amount === null || amount === undefined || isNaN(amount)) return 0;
  const taxExcluded = amount / (1 + taxRate);
  return applyRounding_(taxExcluded, roundingMode);
}

/**
 * 消費税額を計算
 * @param {number} amount - 税抜金額
 * @param {number} taxRate - 税率（0.10 = 10%）
 * @param {string} roundingMode - 端数処理方式
 * @returns {number} 消費税額
 */
function calculateTaxAmount_(amount, taxRate = DEFAULT_TAX_RATE, roundingMode = RoundingMode.FLOOR) {
  if (amount === null || amount === undefined || isNaN(amount)) return 0;
  const taxAmount = amount * taxRate;
  return applyRounding_(taxAmount, roundingMode);
}

/**
 * 諸経費を計算（頭紙用）
 * @param {number} baseAmount - 基本金額（税抜）
 * @param {number} expenseRate - 諸経費率（%）
 * @param {string} roundingMode - 端数処理方式
 * @returns {number} 諸経費額
 */
function calculateExpense_(baseAmount, expenseRate, roundingMode = RoundingMode.FLOOR) {
  if (!baseAmount || !expenseRate) return 0;
  const expense = baseAmount * (expenseRate / 100);
  return applyRounding_(expense, roundingMode);
}

// ============================================
// 単価計算
// ============================================

/**
 * 作業種別から単価を取得
 * @param {Object} customer - 顧客マスター
 * @param {string} jobType - 作業種別（tobi/age/tobiage）
 * @returns {number} 単価（税抜）
 */
function getUnitPriceByJobType_(customer, jobType) {
  if (!customer) return 0;

  switch (jobType) {
    case 'tobi':
      return customer.unit_price_tobi || 0;
    case 'age':
      return customer.unit_price_age || 0;
    case 'tobiage':
      return customer.unit_price_tobiage || 0;
    case 'half':
      return customer.unit_price_half || 0;
    default:
      return 0;
  }
}

/**
 * スタッフの日給を取得
 * @param {Object} staff - スタッフマスター
 * @param {string} jobType - 作業種別（tobi/age/tobiage）
 * @returns {number} 日給
 */
function getDailyRateByJobType_(staff, jobType) {
  if (!staff) return 0;

  switch (jobType) {
    case 'half':
      return staff.daily_rate_half || 0;
    case 'basic':
      return staff.daily_rate_basic || 0;
    case 'fullday':
      return staff.daily_rate_fullday || 0;
    case 'night':
      return staff.daily_rate_night || 0;
    case 'tobi':
      return staff.daily_rate_tobi || 0;
    case 'tobiage':
      // 鳶揚げは鳶の1.5倍
      return Math.floor((staff.daily_rate_tobi || 0) * 1.5);
    default:
      return 0;
  }
}

/**
 * 給与/請求区分に基づく係数を取得
 * @param {string} unit - 区分（fullday/halfday/hourly等）
 * @returns {number} 係数（1.0 = 全日、0.5 = 半日）
 */
function getUnitMultiplier_(unit) {
  switch (unit) {
    case 'fullday':
    case 'shuujitsu':
    case 'jotou':
      return 1.0;
    case 'halfday':
    case 'am':
    case 'pm':
      return 0.5;
    case 'yakin':
      return 1.0; // 夜勤は基本全日扱い（別途夜勤手当がある場合は別計算）
    default:
      return 1.0;
  }
}

/**
 * 配置の給与額を計算
 * @param {Object} assignment - 配置データ
 * @param {Object} staff - スタッフデータ
 * @param {string} jobType - 作業種別
 * @returns {number} 給与額
 */
function calculateWage_(assignment, staff, jobType) {
  // 配置に単価が設定されていればそれを使用
  let baseRate = assignment.wage_rate;

  // 未設定ならスタッフマスターから取得
  if (baseRate === null || baseRate === undefined || baseRate === '') {
    baseRate = getDailyRateByJobType_(staff, jobType);
  }

  // 給与区分に基づく係数を適用
  const multiplier = getUnitMultiplier_(assignment.pay_unit);

  return applyRounding_(baseRate * multiplier, RoundingMode.FLOOR);
}

/**
 * 配置の請求額を計算
 * @param {Object} assignment - 配置データ
 * @param {Object} customer - 顧客データ
 * @param {string} jobType - 作業種別
 * @returns {number} 請求額（税抜）
 */
function calculateInvoiceAmount_(assignment, customer, jobType) {
  // 配置に単価が設定されていればそれを使用
  let baseRate = assignment.invoice_rate;

  // 未設定なら顧客マスターから取得
  if (baseRate === null || baseRate === undefined || baseRate === '') {
    baseRate = getUnitPriceByJobType_(customer, jobType);
  }

  // 請求区分に基づく係数を適用
  const multiplier = getUnitMultiplier_(assignment.invoice_unit);

  return applyRounding_(baseRate * multiplier, RoundingMode.FLOOR);
}

// ============================================
// 請求書計算
// ============================================

/**
 * 請求明細から合計を計算
 * @param {Object[]} lines - 請求明細の配列
 * @returns {Object} { subtotal, taxAmount, totalAmount }
 */
function calculateInvoiceTotals_(lines, taxRate = DEFAULT_TAX_RATE) {
  const subtotal = lines.reduce((sum, line) => {
    const amount = line.amount || (line.quantity * line.unit_price) || 0;
    return sum + amount;
  }, 0);

  const taxAmount = calculateTaxAmount_(subtotal, taxRate);
  const totalAmount = subtotal + taxAmount;

  return {
    subtotal: subtotal,
    taxAmount: taxAmount,
    totalAmount: totalAmount
  };
}

/**
 * 頭紙用の請求書計算
 * @param {number} workAmount - 作業費（税抜）
 * @param {number} expenseRate - 諸経費率（%）
 * @param {number} taxRate - 消費税率
 * @returns {Object} 計算結果
 */
function calculateInvoiceForAtagami_(workAmount, expenseRate, taxRate = DEFAULT_TAX_RATE) {
  const expenseAmount = calculateExpense_(workAmount, expenseRate);
  const subtotal = workAmount + expenseAmount;
  const taxAmount = calculateTaxAmount_(subtotal, taxRate);
  const totalAmount = subtotal + taxAmount;

  return {
    workAmount: workAmount,
    expenseAmount: expenseAmount,
    subtotal: subtotal,
    taxAmount: taxAmount,
    totalAmount: totalAmount
  };
}

// ============================================
// 給与計算
// ============================================

/**
 * 月次給与を計算
 * @param {Object[]} assignments - 配置データの配列
 * @param {Object} staff - スタッフデータ
 * @returns {Object} { baseAmount, transportAmount, totalAmount }
 */
function calculateMonthlyPayout_(assignments, staff) {
  let baseAmount = 0;
  let transportAmount = 0;

  assignments.forEach(asg => {
    // 基本給与（pay_unitから日給を取得）
    const wage = asg.wage_rate || getDailyRateByJobType_(staff, asg.pay_unit || 'basic');
    const multiplier = getUnitMultiplier_(asg.pay_unit);
    baseAmount += applyRounding_(wage * multiplier, RoundingMode.FLOOR);

    // 交通費
    if (asg.transport_amount) {
      transportAmount += Number(asg.transport_amount) || 0;
    }
  });

  return {
    baseAmount: baseAmount,
    transportAmount: transportAmount,
    totalAmount: baseAmount + transportAmount
  };
}

// ============================================
// 金額フォーマット
// ============================================

/**
 * 金額をカンマ区切りでフォーマット
 * @param {number} amount - 金額
 * @returns {string} フォーマット済み金額
 */
function formatCurrency_(amount) {
  if (amount === null || amount === undefined || isNaN(amount)) return '0';
  return Math.floor(amount).toLocaleString('ja-JP');
}

/**
 * 金額を円表記でフォーマット
 * @param {number} amount - 金額
 * @returns {string} フォーマット済み金額（例: ¥1,000）
 */
function formatYen_(amount) {
  return '¥' + formatCurrency_(amount);
}

/**
 * 税率をパーセント表記でフォーマット
 * @param {number} rate - 税率（0.10 = 10%）
 * @returns {string} フォーマット済み税率（例: 10%）
 */
function formatTaxRate_(rate) {
  return Math.round(rate * 100) + '%';
}

// ============================================
// 交通費計算
// ============================================

/**
 * 交通費を自動設定
 * @param {string} transportArea - 交通費エリア
 * @param {Object[]} transportFees - 交通費マスター
 * @returns {number} 交通費
 */
function getTransportFeeByArea_(transportArea, transportFees) {
  if (!transportArea || !transportFees || transportFees.length === 0) {
    return null;
  }

  const fee = transportFees.find(f => f.area_code === transportArea || f.area_name === transportArea);
  return fee ? fee.default_fee : null;
}

/**
 * 配置の交通費を解決
 * @param {Object} assignment - 配置データ
 * @param {Object[]} transportFees - 交通費マスター
 * @returns {Object} { transport_amount, transport_is_manual }
 */
function resolveTransportFee_(assignment, transportFees) {
  // 手入力フラグがtrueの場合はそのまま
  if (assignment.transport_is_manual === true) {
    return {
      transport_amount: assignment.transport_amount,
      transport_is_manual: true
    };
  }

  // エリアが設定されている場合はマスターから取得
  if (assignment.transport_area) {
    const fee = getTransportFeeByArea_(assignment.transport_area, transportFees);
    if (fee !== null) {
      return {
        transport_amount: fee,
        transport_is_manual: false
      };
    }
  }

  // エリア未設定の場合は交通費も未設定
  return {
    transport_amount: null,
    transport_is_manual: false
  };
}
