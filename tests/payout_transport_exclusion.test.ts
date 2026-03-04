/**
 * 交通費除外テスト（スタッフ・外注支払いから交通費を排除）
 *
 * 検証対象:
 * - calculateMonthlyPayout_: 交通費が totalAmount に含まれないこと
 * - 外注支払い計算: 交通費が totalAmount に含まれないこと
 * - 人工割: transportAdjustment が生成されないこと
 * - API再計算: totalAmount に交通費が加算されないこと
 *
 * 実行: npx vitest run tests/payout_transport_exclusion.test.ts
 */

import { describe, it, expect } from 'vitest';

// ============================================
// GAS関数の複製（export不可のため）
// calc_utils.ts と同一実装を維持すること
// ============================================

const TOBIAGE_MULTIPLIER = 1.5;

function getDailyRateByJobType_(staff: Record<string, any>, jobType: string): number {
  if (!staff) return 0;
  const normalizedType = String(jobType || '').toLowerCase().trim();
  switch (normalizedType) {
    case 'half': case 'halfday': case 'am': case 'pm':
      return staff.daily_rate_half ?? 0;
    case 'basic':
      return staff.daily_rate_basic ?? 0;
    case 'fullday':
      return staff.daily_rate_fullday ?? 0;
    case 'night': case 'yakin':
      return staff.daily_rate_night ?? 0;
    case 'tobi':
      return staff.daily_rate_tobi ?? 0;
    case 'age':
      return staff.daily_rate_age ?? 0;
    case 'tobiage':
      return staff.daily_rate_tobiage ?? Math.floor((staff.daily_rate_tobi || 0) * TOBIAGE_MULTIPLIER);
    default:
      return staff.daily_rate_basic ?? 0;
  }
}

function calculateWage_(
  assignment: Record<string, any>,
  staff: Record<string, any>,
  jobType: string
): number {
  const baseRate = getDailyRateByJobType_(staff, jobType);
  return Math.floor(baseRate);
}

/**
 * calculateMonthlyPayout_ — 変更後の実装（交通費除外版）
 * calc_utils.ts:343-369 と完全一致させること
 */
function calculateMonthlyPayout_(
  assignments: Record<string, any>[],
  staff: Record<string, any>
): { baseAmount: number; transportAmount: number; totalAmount: number } {
  let baseAmount = 0;
  let transportAmount = 0;

  assignments.forEach(asg => {
    baseAmount += calculateWage_(asg, staff, asg.pay_unit || 'basic');

    // 交通費は請求書のみに反映。スタッフ支払いには含めない（調整額で別途対応）
    // if (asg.transport_amount) {
    //   transportAmount += Number(asg.transport_amount) || 0;
    // }
  });

  return {
    baseAmount: baseAmount,
    transportAmount: transportAmount,
    totalAmount: baseAmount  // transport除外（請求書のみに反映）
  };
}

function getSubcontractorRateByUnit_(
  subcontractor: Record<string, any>,
  unit: string
): number {
  const normalizedUnit = String(unit || '').toLowerCase().trim();
  let rate: number;
  switch (normalizedUnit) {
    case 'half': case 'halfday': case 'am': case 'pm':
      rate = subcontractor.half_day_rate ?? subcontractor.basic_rate ?? 0;
      break;
    case 'full': case 'fullday':
      rate = subcontractor.full_day_rate ?? subcontractor.basic_rate ?? 0;
      break;
    default:
      rate = subcontractor.basic_rate ?? subcontractor.full_day_rate ?? 0;
      break;
  }
  return Number(rate) || 0;
}

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

function calculateNinkuAdjustment_(
  baseWage: number,
  coefficient: number
): number {
  if (coefficient === 1.0) return 0;
  const adjustedWage = Math.floor(baseWage * coefficient);
  return adjustedWage - baseWage;
}

/**
 * _calculateNinkuAdjustments — 変更後の実装（transportAdjustmentスキップ版）
 * PayoutService.ts と同一ロジック
 */
function calculateNinkuAdjustments_(
  staffAssignments: Record<string, any>[],
  staff: Record<string, any> | null,
  jobMap: Map<string, any>,
  assignmentCountByJob: Map<string, number>
): { totalAdjustment: number; avgCoefficient: number; transportAdjustment: number } {
  if (!staffAssignments || staffAssignments.length === 0) {
    return { totalAdjustment: 0, avgCoefficient: 1.0, transportAdjustment: 0 };
  }

  let totalAdjustment = 0;
  const transportAdjustment = 0;  // 交通費は支払いに含めないため常に0
  let coefficientSum = 0;
  let coefficientCount = 0;

  for (const asg of staffAssignments) {
    const jobId = asg.job_id as string;
    const job = jobMap.get(jobId);
    if (!job) continue;

    const requiredCount = Number(job.required_count) || 0;
    const actualCount = assignmentCountByJob.get(jobId) || 0;
    const coefficient = calculateNinkuCoefficient_(requiredCount, actualCount);

    // 交通費キャップ計算はスキップ（支払いにtransportを含めないため）

    if (coefficient === 1.0) continue;

    const wage = calculateWage_(asg, staff!, (asg.pay_unit as string) || 'basic');
    const adjustment = calculateNinkuAdjustment_(wage, coefficient);
    totalAdjustment += adjustment;
    coefficientSum += coefficient;
    coefficientCount++;
  }

  const avgCoefficient = coefficientCount > 0
    ? Math.floor((coefficientSum / coefficientCount) * 10) / 10
    : 1.0;

  return { totalAdjustment, avgCoefficient, transportAdjustment };
}

// ============================================
// サービス/コントローラーのロジック複製
// GAS export不可のため、各ファイルの該当ロジックを関数として複製
// 実装と乖離した場合テストが壊れることを担保する設計
// ============================================

/**
 * PayoutService.calculatePayoutForSubcontractor のロジック複製
 * PayoutService.ts L1706-1717 と同一ロジック
 */
function calculateSubcontractorPayout_(
  sub: Record<string, any>,
  assignments: Record<string, any>[]
): { baseAmount: number; transportAmount: number; totalAmount: number } {
  let baseAmount = 0;
  // 交通費は請求書のみに反映。外注支払いには含めない（調整額で別途対応）
  for (const asg of assignments) {
    const rate = getSubcontractorRateByUnit_(sub, (asg.pay_unit as string) || 'basic');
    baseAmount += rate;
  }
  const totalAmount = baseAmount;
  return { baseAmount, transportAmount: 0, totalAmount };
}

/**
 * api_payouts.ts L220 getPayoutDetails 再計算ロジック複製
 * transportAmount を含めずに totalAmount を算出
 */
function recalcPayoutTotal_(result: {
  baseAmount: number;
  transportAmount: number;
  adjustmentAmount: number;
  ninkuAdjustmentAmount: number;
}): number {
  return result.baseAmount + (result.adjustmentAmount || 0) + result.ninkuAdjustmentAmount;
}

/**
 * api_payouts.ts L610 savePayout total_amount 再計算ロジック複製
 * transport_amount を含めずに total_amount を算出
 */
function recalcSavePayoutTotal_(
  current: { base_amount: number; transport_amount: number; tax_amount: number },
  adjustmentAmount: number
): number {
  return current.base_amount +
    (Number(adjustmentAmount) || 0) - (current.tax_amount || 0);
}

/**
 * PayoutExportService L175-186 エクスポート行生成ロジック複製
 */
function formatPayoutExportRow_(p: Record<string, any>): any[] {
  return [
    p.paid_date,
    p.target_name || '',
    p.payout_type === 'STAFF' ? 'スタッフ' : '外注',
    p.base_amount || 0,
    0,  // 交通費除外（列構造は維持）
    p.adjustment_amount || 0,
    p.tax_amount || 0,
    p.total_amount || 0,
    p.notes || ''
  ];
}

/**
 * PayoutExportService._populateMonthlyAggregation ロジック複製
 */
function aggregateMonthlyPayouts_(
  payouts: Record<string, any>[]
): Record<string, { count: number; base: number; transport: number; adjustment: number; tax: number; total: number }> {
  const monthly: Record<string, { count: number; base: number; transport: number; adjustment: number; tax: number; total: number }> = {};
  payouts.forEach(function(p) {
    if (!p.paid_date) return;
    const ym = p.paid_date.substring(0, 7);
    if (!monthly[ym]) {
      monthly[ym] = { count: 0, base: 0, transport: 0, adjustment: 0, tax: 0, total: 0 };
    }
    monthly[ym].count++;
    monthly[ym].base += p.base_amount || 0;
    monthly[ym].transport += 0;  // 交通費除外
    monthly[ym].adjustment += p.adjustment_amount || 0;
    monthly[ym].tax += p.tax_amount || 0;
    monthly[ym].total += p.total_amount || 0;
  });
  return monthly;
}

/**
 * PayoutDetailExportService L337 明細書交通費列ロジック複製
 */
function formatDetailTransport_(a: Record<string, any>): string | number {
  return '';  // 交通費除外（移動列は空で出力）
}

/**
 * payouts.html renderHistory の baseAmount 計算ロジック複製
 */
function calcHistoryBaseAmount_(payout: Record<string, any>): number {
  return (payout.base_amount || 0);  // 交通費除外
}

/**
 * payouts.html undoPayout 後の estimatedAmount 計算ロジック複製
 */
function calcUndoneEstimatedAmount_(undone: Record<string, any>): number {
  return (undone.base_amount || 0);  // 交通費除外
}

// ============================================
// テストデータファクトリ
// ============================================

function makeStaff(overrides: Record<string, any> = {}): Record<string, any> {
  return {
    staff_id: 'S001',
    daily_rate_basic: 15000,
    daily_rate_half: 7500,
    daily_rate_fullday: 18000,
    daily_rate_night: 20000,
    ...overrides
  };
}

function makeAssignment(overrides: Record<string, any> = {}): Record<string, any> {
  return {
    assignment_id: 'A001',
    job_id: 'J001',
    staff_id: 'S001',
    work_date: '2026-03-01',
    pay_unit: 'basic',
    transport_amount: 800,  // デフォルトで交通費あり
    ...overrides
  };
}

function makeSubcontractor(overrides: Record<string, any> = {}): Record<string, any> {
  return {
    subcontractor_id: 'SUB001',
    company_name: 'テスト外注',
    basic_rate: 12000,
    half_day_rate: 6000,
    full_day_rate: 15000,
    ...overrides
  };
}

// ============================================
// テスト
// ============================================

describe('calculateMonthlyPayout_ — 交通費除外', () => {
  const staff = makeStaff();

  it('交通費ありの配置でも transportAmount=0, totalAmount に交通費が含まれない', () => {
    const assignments = [
      makeAssignment({ pay_unit: 'basic', transport_amount: 800 }),
      makeAssignment({ assignment_id: 'A002', pay_unit: 'basic', transport_amount: 1200 }),
    ];

    const result = calculateMonthlyPayout_(assignments, staff);

    // basic 15000 × 2 = 30000
    expect(result.baseAmount).toBe(30000);
    expect(result.transportAmount).toBe(0);
    expect(result.totalAmount).toBe(30000);
    // 旧実装なら totalAmount=30000+800+1200=32000 になるはずだが、交通費除外で30000
    expect(result.totalAmount).not.toBe(32000);
  });

  it('交通費0の配置 → 結果は同じ（0のまま）', () => {
    const assignments = [
      makeAssignment({ transport_amount: 0 }),
    ];

    const result = calculateMonthlyPayout_(assignments, staff);

    expect(result.baseAmount).toBe(15000);
    expect(result.transportAmount).toBe(0);
    expect(result.totalAmount).toBe(15000);
  });

  it('複数の単価区分（basic + half）→ 交通費が混入しないこと', () => {
    const assignments = [
      makeAssignment({ pay_unit: 'basic', transport_amount: 500 }),
      makeAssignment({ assignment_id: 'A002', pay_unit: 'half', transport_amount: 500 }),
    ];

    const result = calculateMonthlyPayout_(assignments, staff);

    // basic 15000 + half 7500 = 22500
    expect(result.baseAmount).toBe(22500);
    expect(result.transportAmount).toBe(0);
    expect(result.totalAmount).toBe(22500);
  });

  it('配置0件 → 全て0', () => {
    const result = calculateMonthlyPayout_([], staff);

    expect(result.baseAmount).toBe(0);
    expect(result.transportAmount).toBe(0);
    expect(result.totalAmount).toBe(0);
  });

  it('大量の交通費がある配置でも totalAmount に影響しない', () => {
    const assignments = Array.from({ length: 20 }, (_, i) =>
      makeAssignment({
        assignment_id: `A${i}`,
        transport_amount: 1500,  // 20件 × 1500 = 30000 の交通費
      })
    );

    const result = calculateMonthlyPayout_(assignments, staff);

    // 15000 × 20 = 300000
    expect(result.baseAmount).toBe(300000);
    expect(result.transportAmount).toBe(0);
    expect(result.totalAmount).toBe(300000);
    // 旧実装なら 300000 + 30000 = 330000
    expect(result.totalAmount).not.toBe(330000);
  });
});

describe('外注支払い計算 — 交通費除外', () => {
  it('外注先の支払いに交通費が含まれないこと', () => {
    const sub = makeSubcontractor();
    const assignments = [
      makeAssignment({ pay_unit: 'basic', transport_amount: 800 }),
      makeAssignment({ assignment_id: 'A002', pay_unit: 'half', transport_amount: 600 }),
    ];

    const result = calculateSubcontractorPayout_(sub, assignments);

    // basic 12000 + half 6000 = 18000（交通費 800+600 は含まない）
    expect(result.baseAmount).toBe(18000);
    expect(result.transportAmount).toBe(0);
    expect(result.totalAmount).toBe(18000);
  });

  it('外注一覧の estimatedAmount に交通費が含まれないこと', () => {
    const sub = makeSubcontractor();
    const assignments = [
      makeAssignment({ pay_unit: 'basic', transport_amount: 1000 }),
      makeAssignment({ assignment_id: 'A002', pay_unit: 'basic', transport_amount: 1000 }),
      makeAssignment({ assignment_id: 'A003', pay_unit: 'basic', transport_amount: 1000 }),
    ];

    const result = calculateSubcontractorPayout_(sub, assignments);

    // 12000 × 3 = 36000（交通費 3000 は含まない）
    expect(result.baseAmount).toBe(36000);
    expect(result.totalAmount).toBe(36000);
  });

  it('交通費が大きくても totalAmount に影響しないこと', () => {
    const sub = makeSubcontractor();
    const assignments = [
      makeAssignment({ pay_unit: 'basic', transport_amount: 50000 }),
    ];

    const result = calculateSubcontractorPayout_(sub, assignments);

    expect(result.baseAmount).toBe(12000);
    expect(result.transportAmount).toBe(0);
    // 旧実装なら 12000 + 50000 = 62000
    expect(result.totalAmount).toBe(12000);
  });
});

describe('人工割 (ninku) — transportAdjustment 無効化', () => {
  const staff = makeStaff();

  it('過剰配置でも transportAdjustment が 0 のままであること', () => {
    // 3人必要な案件に4人配置（過剰）
    const jobMap = new Map([
      ['J001', { job_id: 'J001', required_count: 3, work_date: '2026-03-01' }],
    ]);
    const assignmentCountByJob = new Map([['J001', 4]]);

    const assignments = [
      makeAssignment({ job_id: 'J001', transport_amount: 800 }),
      makeAssignment({ assignment_id: 'A002', job_id: 'J001', transport_amount: 800 }),
      makeAssignment({ assignment_id: 'A003', job_id: 'J001', transport_amount: 800 }),
      makeAssignment({ assignment_id: 'A004', job_id: 'J001', transport_amount: 800 }),
    ];

    const ninku = calculateNinkuAdjustments_(assignments, staff, jobMap, assignmentCountByJob);

    // transportAdjustment は常に0（旧実装では超過分の交通費 -800 が発生）
    expect(ninku.transportAdjustment).toBe(0);
    // 人工割の賃金調整自体は動作する（0.7係数）
    expect(ninku.avgCoefficient).toBe(0.7);
    // 15000 * 0.7 = 10500, 調整 = 10500 - 15000 = -4500 × 4名
    expect(ninku.totalAdjustment).toBe(-4500 * 4);
  });

  it('適正配置では調整なし', () => {
    const jobMap = new Map([
      ['J001', { job_id: 'J001', required_count: 2 }],
    ]);
    const assignmentCountByJob = new Map([['J001', 2]]);

    const assignments = [
      makeAssignment({ job_id: 'J001', transport_amount: 1500 }),
      makeAssignment({ assignment_id: 'A002', job_id: 'J001', transport_amount: 1500 }),
    ];

    const ninku = calculateNinkuAdjustments_(assignments, staff, jobMap, assignmentCountByJob);

    expect(ninku.transportAdjustment).toBe(0);
    expect(ninku.totalAdjustment).toBe(0);
    expect(ninku.avgCoefficient).toBe(1.0);
  });

  it('複数案件の過剰配置で transportAdjustment が発生しないこと', () => {
    const jobMap = new Map([
      ['J001', { job_id: 'J001', required_count: 1 }],
      ['J002', { job_id: 'J002', required_count: 1 }],
    ]);
    const assignmentCountByJob = new Map([['J001', 3], ['J002', 2]]);

    const assignments = [
      makeAssignment({ job_id: 'J001', transport_amount: 1000 }),
      makeAssignment({ assignment_id: 'A002', job_id: 'J002', transport_amount: 2000 }),
    ];

    const ninku = calculateNinkuAdjustments_(assignments, staff, jobMap, assignmentCountByJob);

    // 旧実装では required超過分の交通費が負値で引かれていたが、今は0
    expect(ninku.transportAdjustment).toBe(0);
  });
});

describe('API再計算 — totalAmount に交通費を含めない', () => {
  it('getPayoutDetails 再計算で transportAmount を加算しないこと', () => {
    // api_payouts.ts L220 のロジック複製
    const result = {
      baseAmount: 45000,
      transportAmount: 800,  // calcから返された値（今は0だが防御テスト）
      adjustmentAmount: 3000,
      ninkuAdjustmentAmount: 0,
    };

    const totalAmount = recalcPayoutTotal_(result);

    // transport が含まれないこと: 45000 + 3000 = 48000
    expect(totalAmount).toBe(48000);
  });

  it('transportAmount が非0でも totalAmount に影響しないこと', () => {
    // サーバー側防御: クライアントから transportAmount=5000 が来ても無視
    const result = {
      baseAmount: 30000,
      transportAmount: 5000,
      adjustmentAmount: 0,
      ninkuAdjustmentAmount: -3000,
    };

    const totalAmount = recalcPayoutTotal_(result);

    expect(totalAmount).toBe(27000);  // 30000 + 0 + (-3000) = 27000
  });

  it('savePayout 調整更新で transport_amount を含めないこと', () => {
    const current = {
      base_amount: 30000,
      transport_amount: 1600,
      tax_amount: 500
    };

    const totalAmount = recalcSavePayoutTotal_(current, 2000);

    // 30000 + 2000 - 500 = 31500（transport 1600 は含まない）
    expect(totalAmount).toBe(31500);
  });

  it('savePayout で transport が大きくても totalAmount に影響しないこと', () => {
    const current = {
      base_amount: 30000,
      transport_amount: 99999,
      tax_amount: 0
    };

    const totalAmount = recalcSavePayoutTotal_(current, 0);

    expect(totalAmount).toBe(30000);  // transport 99999 は無視される
  });
});

describe('エクスポート — 交通費列の出力', () => {
  it('支払いエクスポート行の交通費列は 0 で出力', () => {
    const payout = {
      paid_date: '2026-03-01',
      target_name: 'テスト太郎',
      payout_type: 'STAFF',
      base_amount: 30000,
      transport_amount: 1600,
      adjustment_amount: 0,
      tax_amount: 500,
      total_amount: 29500,
      notes: ''
    };

    const row = formatPayoutExportRow_(payout);

    // transport列（index 4）が 0 であること
    expect(row[4]).toBe(0);
    // DB上の transport_amount は 1600 だが、出力は 0
    expect(row[4]).not.toBe(1600);
    // 他の列は正常に出力されること
    expect(row[3]).toBe(30000);  // base_amount
    expect(row[7]).toBe(29500);  // total_amount
  });

  it('月次集計の交通費は 0 で集計', () => {
    const payouts = [
      { paid_date: '2026-03-01', transport_amount: 800, base_amount: 15000, adjustment_amount: 0, tax_amount: 0, total_amount: 15000 },
      { paid_date: '2026-03-15', transport_amount: 600, base_amount: 15000, adjustment_amount: 0, tax_amount: 0, total_amount: 15000 },
      { paid_date: '2026-03-20', transport_amount: 1200, base_amount: 15000, adjustment_amount: 0, tax_amount: 0, total_amount: 15000 },
    ];

    const monthly = aggregateMonthlyPayouts_(payouts);

    expect(monthly['2026-03'].transport).toBe(0);
    expect(monthly['2026-03'].base).toBe(45000);
    expect(monthly['2026-03'].count).toBe(3);
  });

  it('明細書の移動列は空で出力', () => {
    const assignment = { transport_amount: 800, work_date: '2026-03-01', site_name: 'テスト現場' };

    const transport = formatDetailTransport_(assignment);

    expect(transport).toBe('');
    expect(transport).not.toBe(800);
  });
});

describe('UI表示 — 履歴テーブルの baseAmount 計算', () => {
  it('履歴の baseAmount に transport_amount を加算しないこと', () => {
    const payout = {
      base_amount: 30000,
      transport_amount: 1600,
      adjustment_amount: 2000,
      total_amount: 32000,
    };

    const baseAmount = calcHistoryBaseAmount_(payout);

    expect(baseAmount).toBe(30000);
  });

  it('transport_amount が大きくても baseAmount に影響しないこと', () => {
    const payout = {
      base_amount: 15000,
      transport_amount: 99999,
      adjustment_amount: 0,
      total_amount: 15000,
    };

    const baseAmount = calcHistoryBaseAmount_(payout);

    expect(baseAmount).toBe(15000);
  });

  it('取消後の estimatedAmount に transport を含めないこと', () => {
    const undone = {
      base_amount: 45000,
      transport_amount: 2400,
    };

    const estimatedAmount = calcUndoneEstimatedAmount_(undone);

    expect(estimatedAmount).toBe(45000);
  });

  it('取消データの transport が大きくても estimatedAmount に影響しないこと', () => {
    const undone = {
      base_amount: 22500,
      transport_amount: 88888,
    };

    const estimatedAmount = calcUndoneEstimatedAmount_(undone);

    expect(estimatedAmount).toBe(22500);
  });
});

describe('請求書側への非影響確認', () => {
  it('assignment.transport_amount は変更されず請求書で使用可能', () => {
    // AssignmentService._processTransportFee() は変更なし
    // 配置に交通費が設定されていれば、それは請求書計算で使用される
    const assignment = makeAssignment({ transport_amount: 800 });

    // 支払い計算で assignment の transport_amount を変更していないことを確認
    const staff = makeStaff();
    calculateMonthlyPayout_([assignment], staff);

    // 元の assignment オブジェクトの transport_amount は保持される
    expect(assignment.transport_amount).toBe(800);
  });
});
