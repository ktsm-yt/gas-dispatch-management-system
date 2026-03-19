/**
 * 源泉徴収税額テスト（国税庁R7日額表 甲欄・扶養0人）
 *
 * 期待値は国税庁日額表から独立した手計算リテラル。
 * WITHHOLDING_TAX_TABLE_R7 / WITHHOLDING_TAX_PROGRESSIVE_R7 をテストでimportしない。
 *
 * 実行: npx vitest run tests/withholding_tax.test.ts
 */

import { describe, it, expect } from 'vitest';
import { lookupDailyWithholdingTax } from '../app/gas/src/services/WithholdingTaxTable';

describe('lookupDailyWithholdingTax', () => {
  // --- 境界値・ゼロ・負値 ---

  it('ゼロ → 0', () => {
    expect(lookupDailyWithholdingTax(0)).toBe(0);
  });

  it('負値 → 0', () => {
    expect(lookupDailyWithholdingTax(-100)).toBe(0);
  });

  // --- テーブル参照区間（~23,999円） ---

  it('2899円（テーブル最初の区切り2900の直前）→ 0', () => {
    expect(lookupDailyWithholdingTax(2899)).toBe(0);
  });

  it('2900円 → 5', () => {
    expect(lookupDailyWithholdingTax(2900)).toBe(5);
  });

  it('2999円（2900以上3000未満）→ 5', () => {
    expect(lookupDailyWithholdingTax(2999)).toBe(5);
  });

  it('3000円 → 10', () => {
    expect(lookupDailyWithholdingTax(3000)).toBe(10);
  });

  it('10500円（実務値: 人工割後の日額）→ 320', () => {
    expect(lookupDailyWithholdingTax(10500)).toBe(320);
  });

  it('15000円（実務値: 日当相場）→ 725', () => {
    expect(lookupDailyWithholdingTax(15000)).toBe(725);
  });

  it('23900円（テーブル最後のエントリ）→ 2295', () => {
    expect(lookupDailyWithholdingTax(23900)).toBe(2295);
  });

  it('23999円（テーブル参照の上限）→ 2295', () => {
    expect(lookupDailyWithholdingTax(23999)).toBe(2295);
  });

  // --- 累進計算区間（24,000円~） ---

  it('24000円（累進計算開始）→ 2305', () => {
    // baseTax=2305, (24000-24000)*0.2042=0 → 2305
    expect(lookupDailyWithholdingTax(24000)).toBe(2305);
  });

  it('24001円 → 2305', () => {
    // floor(2305 + 1*0.2042) = floor(2305.2042) = 2305
    expect(lookupDailyWithholdingTax(24001)).toBe(2305);
  });

  it('24100円 → 2325', () => {
    // floor(2305 + 100*0.2042) = floor(2325.42) = 2325
    expect(lookupDailyWithholdingTax(24100)).toBe(2325);
  });

  it('26000円（次の累進区間の開始点）→ 2715', () => {
    // baseTax=2715, (26000-26000)*0.23483=0 → 2715
    expect(lookupDailyWithholdingTax(26000)).toBe(2715);
  });

  it('100000円（高額日額）→ 30660', () => {
    // 75000区間: baseTax=20450, rate=0.4084
    // floor(20450 + (100000-75000)*0.4084) = floor(20450+10210) = 30660
    expect(lookupDailyWithholdingTax(100000)).toBe(30660);
  });
});
