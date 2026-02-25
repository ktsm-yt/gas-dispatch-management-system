// File: calc_utils.ts
// 金額計算ユーティリティ（KTSM-63）

const DEFAULT_TAX_RATE = 0.10;

/**
 * legacy numeric `5` と string `'subcontract'` を統一判定するヘルパー。
 * 旧データで staff_type=5（数値）が残っているケースへの互換ガード。
 */
function isSubcontract_(staff: Record<string, any> | null | undefined): boolean {
  return staff?.staff_type === 'subcontract' || Number(staff?.staff_type) === 5;
}

const RoundingMode = {
  FLOOR: 'floor',
  CEIL: 'ceil',
  ROUND: 'round'
} as const;

const TOBIAGE_MULTIPLIER = 1.5;
const FLOATING_POINT_PRECISION_FACTOR = 1e10;

// ============================================
// 正規化ユーティリティ
// ============================================

function normalizeTaxRate_(taxRate: number | string | null | undefined): number {
  if (taxRate == null || taxRate === '') return DEFAULT_TAX_RATE;
  const rate = parseFloat(String(taxRate));
  if (isNaN(rate)) return DEFAULT_TAX_RATE;
  return rate >= 1 ? rate / 100 : rate;
}

function normalizeUnit_(unit: string | null | undefined): string {
  if (!unit) return '';
  return String(unit).toLowerCase().trim();
}

function normalizeRoundingMode_(mode: string | null | undefined): string {
  const normalized = String(mode || '').toLowerCase().trim();
  switch (normalized) {
    case RoundingMode.CEIL:
      return RoundingMode.CEIL;
    case RoundingMode.ROUND:
      return RoundingMode.ROUND;
    case RoundingMode.FLOOR:
    default:
      return RoundingMode.FLOOR;
  }
}

// ============================================
// 基本的な金額計算
// ============================================

function applyRounding_(value: number, mode: string = RoundingMode.FLOOR): number {
  switch (normalizeRoundingMode_(mode)) {
    case RoundingMode.CEIL:
      return Math.ceil(value);
    case RoundingMode.ROUND:
      return Math.round(value);
    case RoundingMode.FLOOR:
    default:
      return Math.floor(value);
  }
}

function calculateTaxIncluded_(
  amount: number | null | undefined,
  taxRate: number | string = DEFAULT_TAX_RATE,
  roundingMode: string = RoundingMode.FLOOR
): number {
  if (amount === null || amount === undefined || isNaN(amount)) return 0;
  const normalizedRate = normalizeTaxRate_(taxRate);
  const taxIncluded = amount * (1 + normalizedRate);
  return applyRounding_(taxIncluded, roundingMode);
}

function calculateTaxExcluded_(
  amount: number | null | undefined,
  taxRate: number | string = DEFAULT_TAX_RATE,
  roundingMode: string = RoundingMode.FLOOR
): number {
  if (amount === null || amount === undefined || isNaN(amount)) return 0;
  const normalizedRate = normalizeTaxRate_(taxRate);
  const taxExcluded = amount / (1 + normalizedRate);
  const normalizedTaxExcluded = Math.round(taxExcluded * FLOATING_POINT_PRECISION_FACTOR) / FLOATING_POINT_PRECISION_FACTOR;
  return applyRounding_(normalizedTaxExcluded, roundingMode);
}

function calculateTaxAmount_(
  amount: number | null | undefined,
  taxRate: number | string = DEFAULT_TAX_RATE,
  roundingMode: string = RoundingMode.FLOOR
): number {
  if (amount === null || amount === undefined || isNaN(amount)) return 0;
  const normalizedRate = normalizeTaxRate_(taxRate);
  const taxAmount = amount * normalizedRate;
  return applyRounding_(taxAmount, roundingMode);
}

function calculateExpense_(
  baseAmount: number,
  expenseRate: number,
  roundingMode: string = RoundingMode.FLOOR
): number {
  if (!baseAmount || !expenseRate) return 0;
  const expense = baseAmount * (expenseRate / 100);
  return applyRounding_(expense, roundingMode);
}

// ============================================
// 単価計算
// ============================================

function getUnitPriceByJobType_(customer: Record<string, any>, jobType: string): number {
  if (!customer) return 0;

  const normalizedType = String(jobType || '').toLowerCase().trim();

  switch (normalizedType) {
    case 'tobi':
      return customer.unit_price_tobi || 0;
    case 'age':
      return customer.unit_price_age || 0;
    case 'tobiage':
      return customer.unit_price_tobiage || 0;
    case 'basic':
      return customer.unit_price_basic || customer.unit_price_tobi || 0;
    case 'half':
    case 'halfday':
      return customer.unit_price_half || 0;
    case 'fullday':
      return customer.unit_price_fullday || customer.unit_price_tobi || 0;
    case 'night':
      return customer.unit_price_night || customer.unit_price_tobi || 0;
    default:
      return customer.unit_price_basic || customer.unit_price_tobi || 0;
  }
}

function getDailyRateByJobType_(staff: Record<string, any>, jobType: string): number {
  if (!staff) return 0;

  const normalizedType = String(jobType || '').toLowerCase().trim();

  switch (normalizedType) {
    case 'half':
    case 'halfday':
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
      return Math.floor((staff.daily_rate_tobi || 0) * TOBIAGE_MULTIPLIER);
    default:
      return staff.daily_rate_basic || staff.daily_rate_tobi || 0;
  }
}

/**
 * 外注先マスタの単価区分に基づく単価を取得する。
 * フォールバック: basic_rate → full_day_rate → 0
 */
function getSubcontractorRateByUnit_(
  subcontractor: Record<string, any>,
  unit: string
): number {
  const normalizedUnit = normalizeUnit_(unit);

  switch (normalizedUnit) {
    case 'half':
    case 'halfday':
    case 'am':
    case 'pm':
      return subcontractor.half_day_rate ?? subcontractor.basic_rate ?? 0;
    case 'full':
    case 'fullday':
      return subcontractor.full_day_rate ?? subcontractor.basic_rate ?? 0;
    default:
      return subcontractor.basic_rate ?? subcontractor.full_day_rate ?? 0;
  }
}

/** @deprecated 将来的に廃止予定。直接マスター値を使用すること。 */
function getUnitMultiplier_(unit: string): number {
  const normalizedUnit = normalizeUnit_(unit);

  switch (normalizedUnit) {
    case 'half':
    case 'halfday':
    case 'am':
    case 'pm':
      return 0.5;
    default:
      return 1.0;
  }
}

function calculateWage_(
  assignment: Record<string, any>,
  staff: Record<string, any>,
  jobType: string
): number {
  let baseRate = assignment.wage_rate;

  if (baseRate === null || baseRate === undefined || baseRate === '') {
    baseRate = getDailyRateByJobType_(staff, jobType);
  }

  const multiplier = getUnitMultiplier_(assignment.pay_unit);

  return applyRounding_(baseRate * multiplier, RoundingMode.FLOOR);
}

function calculateInvoiceAmount_(
  assignment: Record<string, any>,
  customer: Record<string, any>,
  jobType: string
): number {
  let baseRate = assignment.invoice_rate;

  if (baseRate === null || baseRate === undefined || baseRate === '') {
    baseRate = getUnitPriceByJobType_(customer, jobType);
  }

  const multiplier = getUnitMultiplier_(assignment.invoice_unit);

  return applyRounding_(baseRate * multiplier, RoundingMode.FLOOR);
}

// ============================================
// 請求書計算
// ============================================

function calculateInvoiceTotals_(
  lines: { amount?: number; quantity?: number; unit_price?: number }[],
  taxRate: number | string = DEFAULT_TAX_RATE
): { subtotal: number; taxAmount: number; totalAmount: number } {
  const subtotal = lines.reduce((sum, line) => {
    const amount = line.amount || ((line.quantity || 0) * (line.unit_price || 0)) || 0;
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

function calculateInvoiceForAtagami_(
  workAmount: number,
  expenseRate: number,
  taxRate: number | string = DEFAULT_TAX_RATE
): { workAmount: number; expenseAmount: number; subtotal: number; taxAmount: number; totalAmount: number } {
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

function calculateMonthlyPayout_(
  assignments: Record<string, any>[],
  staff: Record<string, any>
): { baseAmount: number; transportAmount: number; totalAmount: number } {
  let baseAmount = 0;
  let transportAmount = 0;

  assignments.forEach(asg => {
    baseAmount += calculateWage_(asg, staff, asg.pay_unit || 'basic');

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

function formatCurrency_(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || isNaN(amount)) return '0';
  return Math.floor(amount).toLocaleString('ja-JP');
}

function formatYen_(amount: number | null | undefined): string {
  return '¥' + formatCurrency_(amount);
}

function formatTaxRate_(rate: number): string {
  return Math.round(rate * 100) + '%';
}

// ============================================
// 交通費計算
// ============================================

function getTransportFeeByArea_(
  transportArea: string,
  transportFees: { area_code?: string; area_name?: string; default_fee?: number }[]
): number | null {
  if (!transportArea || !transportFees || transportFees.length === 0) {
    return null;
  }

  const fee = transportFees.find(f => f.area_code === transportArea || f.area_name === transportArea);
  return fee ? (fee.default_fee ?? null) : null;
}

// ============================================
// 人工割計算（CR-029）
// ============================================

/**
 * 人工割係数を計算する。
 * 係数 = floor(required / actual * 10) / 10（0.1刻み切捨て）
 *
 * - required <= 0 or actual <= 0 → 1.0（調整なし）
 * - required === actual → 1.0（適正配置）
 * - required > actual → 係数 > 1.0（不足配置 → 割増）
 * - required < actual → 係数 < 1.0（過剰配置 → 割引）
 */
function calculateNinkuCoefficient_(
  requiredCount: number | null | undefined,
  actualCount: number | null | undefined
): number {
  const required = Number(requiredCount) || 0;
  const actual = Number(actualCount) || 0;

  if (required <= 0 || actual <= 0) return 1.0;
  if (required === actual) return 1.0;

  return Math.floor((required / actual) * 10) / 10;
}

/**
 * 人工割による支払調整額を計算する。
 * adjustmentAmount = wage × coefficient - wage（係数適用後の差分）
 */
function calculateNinkuAdjustment_(
  baseWage: number,
  coefficient: number
): number {
  if (coefficient === 1.0) return 0;
  const adjustedWage = applyRounding_(baseWage * coefficient, RoundingMode.FLOOR);
  return adjustedWage - baseWage;
}

function resolveTransportFee_(
  assignment: Record<string, any>,
  transportFees: { area_code?: string; area_name?: string; default_fee?: number }[]
): { transport_amount: number | null; transport_is_manual: boolean } {
  if (assignment.transport_is_manual === true) {
    return {
      transport_amount: assignment.transport_amount,
      transport_is_manual: true
    };
  }

  if (assignment.transport_area) {
    const fee = getTransportFeeByArea_(assignment.transport_area, transportFees);
    if (fee !== null) {
      return {
        transport_amount: fee,
        transport_is_manual: false
      };
    }
  }

  return {
    transport_amount: null,
    transport_is_manual: false
  };
}
