/**
 * 人工割（CR-029）係数計算・調整額テスト
 *
 * 実行: npx vitest run tests/calc_utils_ninku.test.ts
 */

import { describe, it, expect } from 'vitest';

// calc_utils.ts からの関数を再現（GASはexportなし・結合ビルドのため直接import不可）
// 本体と同一ロジックであることを保証するため、関数シグネチャ・実装を完全一致させる

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

// ============================================
// calculateNinkuCoefficient_
// ============================================

describe('calculateNinkuCoefficient_', () => {
  it('適正配置（required === actual）→ 1.0', () => {
    expect(calculateNinkuCoefficient_(3, 3)).toBe(1.0);
    expect(calculateNinkuCoefficient_(1, 1)).toBe(1.0);
    expect(calculateNinkuCoefficient_(10, 10)).toBe(1.0);
  });

  it('過剰配置（actual > required）→ 係数 < 1.0', () => {
    expect(calculateNinkuCoefficient_(3, 4)).toBe(0.7);   // 3/4=0.75 → 0.7
    expect(calculateNinkuCoefficient_(2, 3)).toBe(0.6);   // 2/3=0.66 → 0.6
    expect(calculateNinkuCoefficient_(1, 2)).toBe(0.5);   // 1/2=0.50 → 0.5
  });

  it('不足配置（actual < required）→ 係数 > 1.0', () => {
    expect(calculateNinkuCoefficient_(4, 3)).toBe(1.3);   // 4/3=1.33 → 1.3
    expect(calculateNinkuCoefficient_(5, 3)).toBe(1.6);   // 5/3=1.66 → 1.6
    expect(calculateNinkuCoefficient_(3, 2)).toBe(1.5);   // 3/2=1.50 → 1.5
  });

  it('大きな不足: required=10, actual=3 → 3.3', () => {
    expect(calculateNinkuCoefficient_(10, 3)).toBe(3.3);  // 10/3=3.33 → 3.3
  });

  // --- エッジケース ---

  it('required = 0 → 1.0（人工割なし）', () => {
    expect(calculateNinkuCoefficient_(0, 3)).toBe(1.0);
  });

  it('actual = 0 → 1.0（全員SUBCONTRACT等）', () => {
    expect(calculateNinkuCoefficient_(3, 0)).toBe(1.0);
  });

  it('両方 0 → 1.0', () => {
    expect(calculateNinkuCoefficient_(0, 0)).toBe(1.0);
  });

  it('null / undefined → 1.0', () => {
    expect(calculateNinkuCoefficient_(null, 3)).toBe(1.0);
    expect(calculateNinkuCoefficient_(3, null)).toBe(1.0);
    expect(calculateNinkuCoefficient_(undefined, undefined)).toBe(1.0);
  });

  it('負の値 → 1.0', () => {
    expect(calculateNinkuCoefficient_(-1, 3)).toBe(1.0);
    expect(calculateNinkuCoefficient_(3, -2)).toBe(1.0);
  });

  // --- 丸め精度 ---

  it('0.1刻み切り捨て: 3/7 = 0.428.. → 0.4', () => {
    expect(calculateNinkuCoefficient_(3, 7)).toBe(0.4);
  });

  it('0.1刻み切り捨て: 7/3 = 2.333.. → 2.3', () => {
    expect(calculateNinkuCoefficient_(7, 3)).toBe(2.3);
  });

  it('ちょうど割り切れる: 6/3 = 2.0', () => {
    expect(calculateNinkuCoefficient_(6, 3)).toBe(2.0);
  });
});

// ============================================
// calculateNinkuAdjustment_
// ============================================

describe('calculateNinkuAdjustment_', () => {
  it('coefficient = 1.0 → 調整額 0', () => {
    expect(calculateNinkuAdjustment_(15000, 1.0)).toBe(0);
  });

  it('過剰配置 coefficient 0.7 → 負の調整（割引）', () => {
    // floor(15000 * 0.7) = 10500, 調整額 = -4500
    expect(calculateNinkuAdjustment_(15000, 0.7)).toBe(-4500);
  });

  it('不足配置 coefficient 1.3 → 正の調整（割増）', () => {
    // floor(15000 * 1.3) = 19500, 調整額 = +4500
    expect(calculateNinkuAdjustment_(15000, 1.3)).toBe(4500);
  });

  it('端数切り捨て: 14333 * 0.7 = 10033.1 → floor = 10033', () => {
    expect(calculateNinkuAdjustment_(14333, 0.7)).toBe(10033 - 14333);
  });

  it('baseWage = 0 → 調整額 0', () => {
    expect(calculateNinkuAdjustment_(0, 0.7)).toBe(0);
  });

  it('丸め順序: 各ステップでfloor（中間値を持ち越さない）', () => {
    const wage = 15123;
    const coefficient = 0.7;
    const adjustedWage = Math.floor(wage * coefficient); // floor(10586.1) = 10586
    expect(adjustedWage).toBe(10586);
    expect(calculateNinkuAdjustment_(wage, coefficient)).toBe(10586 - 15123);
  });
});

// ============================================
// 統合シナリオ（係数→調整額→源泉の一貫性）
// ============================================

describe('統合シナリオ', () => {
  it('テスト2: 過剰配置 required=3, actual=4, wage=15000', () => {
    const coeff = calculateNinkuCoefficient_(3, 4);
    expect(coeff).toBe(0.7);
    const adj = calculateNinkuAdjustment_(15000, coeff);
    expect(adj).toBe(-4500);
    expect(15000 + adj).toBe(10500);
  });

  it('テスト5: 不足配置 required=4, actual=3, wage=15000', () => {
    const coeff = calculateNinkuCoefficient_(4, 3);
    expect(coeff).toBe(1.3);
    const adj = calculateNinkuAdjustment_(15000, coeff);
    expect(adj).toBe(4500);
    expect(15000 + adj).toBe(19500);
  });

  it('テスト8: 源泉徴収は係数適用後の金額に10.21%', () => {
    const coeff = calculateNinkuCoefficient_(3, 4);
    const wage = 15000;
    const adjustedWage = wage + calculateNinkuAdjustment_(wage, coeff);
    const tax = Math.floor(adjustedWage * 0.1021);
    expect(adjustedWage).toBe(10500);
    expect(tax).toBe(1072); // floor(10500 * 0.1021) = floor(1072.05) = 1072
  });

  it('テスト7: 外注混在 2 STAFF + 1 SUBCONTRACT, required=2 → actual=2, coeff=1.0', () => {
    // SUBCONTRACTはactualに含めない → actual=2
    expect(calculateNinkuCoefficient_(2, 2)).toBe(1.0);
  });

  it('テスト1: 過不足なし required=3, actual=3 → 金額変わらず', () => {
    const coeff = calculateNinkuCoefficient_(3, 3);
    expect(coeff).toBe(1.0);
    expect(calculateNinkuAdjustment_(15000, coeff)).toBe(0);
  });
});
