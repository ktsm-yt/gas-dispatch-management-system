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

/**
 * 鳶揚げ係数（鳶日給に対する倍率）
 * 業務要件: 鳶揚げ = 鳶 × 1.5
 */
const TOBIAGE_MULTIPLIER = 1.5;

// ============================================
// 正規化ユーティリティ
// ============================================

/**
 * 税率を小数に正規化
 * UIは%表記（10）で保存、計算は小数（0.10）が必要なため変換
 * @param {number} taxRate - 税率（10 or 0.10）
 * @returns {number} 小数形式の税率（0.10）
 */
function normalizeTaxRate_(taxRate) {
  if (taxRate == null || taxRate === '') return DEFAULT_TAX_RATE;
  const rate = parseFloat(taxRate);
  if (isNaN(rate)) return DEFAULT_TAX_RATE;
  // 1以上なら%表記とみなして100で割る（10 → 0.10）
  // 1未満ならそのまま（0.10 → 0.10）
  return rate >= 1 ? rate / 100 : rate;
}

/**
 * 給与/請求区分を小文字に正規化
 * UIがFULLDAY/HALFDAYを送信する可能性があるため変換
 * @param {string} unit - 区分（FULLDAY/fullday等）
 * @returns {string} 小文字の区分（fullday）
 */
function normalizeUnit_(unit) {
  if (!unit) return '';
  return String(unit).toLowerCase().trim();
}

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
 * @param {number} taxRate - 税率（10 or 0.10、自動正規化）
 * @param {string} roundingMode - 端数処理方式
 * @returns {number} 税込金額
 */
function calculateTaxIncluded_(amount, taxRate = DEFAULT_TAX_RATE, roundingMode = RoundingMode.FLOOR) {
  if (amount === null || amount === undefined || isNaN(amount)) return 0;
  const normalizedRate = normalizeTaxRate_(taxRate);
  const taxIncluded = amount * (1 + normalizedRate);
  return applyRounding_(taxIncluded, roundingMode);
}

/**
 * 税込金額から税抜金額を計算
 * @param {number} amount - 税込金額
 * @param {number} taxRate - 税率（10 or 0.10、自動正規化）
 * @param {string} roundingMode - 端数処理方式
 * @returns {number} 税抜金額
 */
function calculateTaxExcluded_(amount, taxRate = DEFAULT_TAX_RATE, roundingMode = RoundingMode.FLOOR) {
  if (amount === null || amount === undefined || isNaN(amount)) return 0;
  const normalizedRate = normalizeTaxRate_(taxRate);
  const taxExcluded = amount / (1 + normalizedRate);
  return applyRounding_(taxExcluded, roundingMode);
}

/**
 * 消費税額を計算
 * @param {number} amount - 税抜金額
 * @param {number} taxRate - 税率（10 or 0.10、自動正規化）
 * @param {string} roundingMode - 端数処理方式
 * @returns {number} 消費税額
 */
function calculateTaxAmount_(amount, taxRate = DEFAULT_TAX_RATE, roundingMode = RoundingMode.FLOOR) {
  if (amount === null || amount === undefined || isNaN(amount)) return 0;
  const normalizedRate = normalizeTaxRate_(taxRate);
  const taxAmount = amount * normalizedRate;
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
 * @param {string} jobType - 作業種別（basic/tobi/age/tobiage/half/halfday/fullday/night）
 * @returns {number} 単価（税抜）
 */
function getUnitPriceByJobType_(customer, jobType) {
  if (!customer) return 0;

  // 小文字に正規化
  const normalizedType = String(jobType || '').toLowerCase().trim();

  switch (normalizedType) {
    // 作業種別系
    case 'tobi':
      return customer.unit_price_tobi || 0;
    case 'age':
      return customer.unit_price_age || 0;
    case 'tobiage':
      return customer.unit_price_tobiage || 0;

    // 時間区分系
    case 'basic':
      return customer.unit_price_basic || customer.unit_price_tobi || 0;
    case 'half':
    case 'halfday':  // halfday → half マッピング
      return customer.unit_price_half || 0;
    case 'fullday':
      return customer.unit_price_fullday || customer.unit_price_tobi || 0;
    case 'night':
      return customer.unit_price_night || customer.unit_price_tobi || 0;

    default:
      // フォールバック: 基本単価 → 鳶単価
      return customer.unit_price_basic || customer.unit_price_tobi || 0;
  }
}

/**
 * スタッフの日給を取得
 * @param {Object} staff - スタッフマスター
 * @param {string} jobType - 作業種別（basic/tobi/age/tobiage/half/halfday/fullday/night）
 * @returns {number} 日給
 */
function getDailyRateByJobType_(staff, jobType) {
  if (!staff) return 0;

  // 小文字に正規化
  const normalizedType = String(jobType || '').toLowerCase().trim();

  switch (normalizedType) {
    case 'half':
    case 'halfday':  // halfday → half マッピング
      return staff.daily_rate_half || 0;
    case 'basic':
      return staff.daily_rate_basic || staff.daily_rate_tobi || 0;
    case 'fullday':
      return staff.daily_rate_fullday || staff.daily_rate_tobi || 0;
    case 'night':
      return staff.daily_rate_night || staff.daily_rate_tobi || 0;
    case 'tobi':
      return staff.daily_rate_tobi || 0;
    case 'age':
      return staff.daily_rate_age || 0;
    case 'tobiage':
      // 鳶揚げは鳶の係数倍（TOBIAGE_MULTIPLIER参照）
      return Math.floor((staff.daily_rate_tobi || 0) * TOBIAGE_MULTIPLIER);
    default:
      // フォールバック: 基本日給 → 鳶日給
      return staff.daily_rate_basic || staff.daily_rate_tobi || 0;
  }
}

/**
 * 給与/請求区分に基づく係数を取得
 *
 * 【KTSM-XX: 係数廃止】
 * 以前は halfday/am/pm に 0.5 を返していたが、これは二重減額の原因となっていた。
 * マスターにはすでにハーフ用金額（unit_price_half, daily_rate_half）が設定されており、
 * ここでさらに係数を掛けると二重で減額されてしまう。
 *
 * 解決策: 係数は常に 1.0 を返し、マスターの単価をそのまま使用する。
 * 単価の種類による金額差は getUnitPriceByJobType_ / getDailyRateByJobType_ で
 * 適切なマスター値を取得することで実現する。
 *
 * @param {string} unit - 区分（FULLDAY/fullday/halfday/hourly等、自動正規化）
 * @returns {number} 係数（常に 1.0）
 * @deprecated 将来的に廃止予定。直接マスター値を使用すること。
 */
function getUnitMultiplier_(unit) {
  // 互換性のため関数は残すが、常に 1.0 を返す
  // マスターの単価をそのまま使用するため、係数による調整は不要
  return 1.0;
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
