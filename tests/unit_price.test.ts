/**
 * 単価解決・単価取得テスト
 *
 * MasterCacheスタブは Record<string, number>（plain object）。
 * new Map() は不可（実装が map[key] ブラケットアクセスのため）。
 *
 * 実行: npx vitest run tests/unit_price.test.ts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  resolveEffectiveUnit_,
  getUnitPriceByJobType_,
  getDailyRateByJobType_,
  getSubcontractorRateByUnit_,
} from '../app/gas/src/calc_utils';

// ============================================
// resolveEffectiveUnit_
// ============================================

describe('resolveEffectiveUnit_', () => {
  it('unitFromAssignment が設定済み → そのまま返す', () => {
    expect(resolveEffectiveUnit_('daily', { pay_unit: 'hourly' })).toBe('daily');
  });

  it('unitFromAssignment が null → job.pay_unit にフォールバック', () => {
    expect(resolveEffectiveUnit_(null, { pay_unit: 'hourly' })).toBe('hourly');
  });

  it('unitFromAssignment が undefined, job も undefined → "basic"', () => {
    expect(resolveEffectiveUnit_(undefined, undefined)).toBe('basic');
  });

  it('unitFromAssignment が空文字 → job.pay_unit にフォールバック', () => {
    expect(resolveEffectiveUnit_('', { pay_unit: 'daily' })).toBe('daily');
  });

  it('unitFromAssignment が設定済み, job が null → unitFromAssignment', () => {
    expect(resolveEffectiveUnit_('daily', null)).toBe('daily');
  });

  it('大文字混在は小文字正規化', () => {
    expect(resolveEffectiveUnit_('Daily', { pay_unit: 'hourly' })).toBe('daily');
  });

  it('前後空白はトリム', () => {
    expect(resolveEffectiveUnit_(' daily ', null)).toBe('daily');
  });
});

// ============================================
// getUnitPriceByJobType_
// ============================================

describe('getUnitPriceByJobType_', () => {
  const customer = {
    customer_id: 'C001',
    unit_price_tobi: 18000,
    unit_price_age: 15000,
    unit_price_tobiage: 25000,
    unit_price_basic: 16000,
    unit_price_half: 9000,
    unit_price_fullday: 20000,
    unit_price_night: 22000,
    unit_price_holiday: 24000,
  };

  it('tobi → unit_price_tobi', () => {
    expect(getUnitPriceByJobType_(customer, 'tobi')).toBe(18000);
  });

  it('age → unit_price_age', () => {
    expect(getUnitPriceByJobType_(customer, 'age')).toBe(15000);
  });

  it('tobiage → unit_price_tobiage', () => {
    expect(getUnitPriceByJobType_(customer, 'tobiage')).toBe(25000);
  });

  it('tobiage 未設定 → tobi * 1.5', () => {
    const c = { ...customer, unit_price_tobiage: undefined };
    // floor(18000 * 1.5) = 27000
    expect(getUnitPriceByJobType_(c, 'tobiage')).toBe(27000);
  });

  it('basic → unit_price_basic', () => {
    expect(getUnitPriceByJobType_(customer, 'basic')).toBe(16000);
  });

  it('half / halfday / am / pm → unit_price_half', () => {
    expect(getUnitPriceByJobType_(customer, 'half')).toBe(9000);
    expect(getUnitPriceByJobType_(customer, 'halfday')).toBe(9000);
    expect(getUnitPriceByJobType_(customer, 'am')).toBe(9000);
    expect(getUnitPriceByJobType_(customer, 'pm')).toBe(9000);
  });

  it('fullday → unit_price_fullday', () => {
    expect(getUnitPriceByJobType_(customer, 'fullday')).toBe(20000);
  });

  it('night / yakin → unit_price_night', () => {
    expect(getUnitPriceByJobType_(customer, 'night')).toBe(22000);
    expect(getUnitPriceByJobType_(customer, 'yakin')).toBe(22000);
  });

  it('holiday → unit_price_holiday', () => {
    expect(getUnitPriceByJobType_(customer, 'holiday')).toBe(24000);
  });

  it('null customer → 0', () => {
    expect(getUnitPriceByJobType_(null as any, 'basic')).toBe(0);
  });

  it('大文字混在は正規化', () => {
    expect(getUnitPriceByJobType_(customer, 'TOBI')).toBe(18000);
  });

  describe('default branch — カスタム単価', () => {
    beforeEach(() => {
      globalThis.MasterCache = {
        getCustomPriceMap: () => ({
          'customer|C001|special': 30000,
        }),
        getCompany: () => null,
      };
    });

    it('カスタム単価マップに値がある → その値', () => {
      expect(getUnitPriceByJobType_(customer, 'special')).toBe(30000);
    });

    it('カスタム単価マップに値がない → basic fallback', () => {
      globalThis.MasterCache = {
        getCustomPriceMap: () => ({}),
        getCompany: () => null,
      };
      expect(getUnitPriceByJobType_(customer, 'unknown_type')).toBe(16000);
    });
  });
});

// ============================================
// getDailyRateByJobType_
// ============================================

describe('getDailyRateByJobType_', () => {
  const staff = {
    staff_id: 'S001',
    daily_rate_basic: 12000,
    daily_rate_half: 7000,
    daily_rate_fullday: 15000,
    daily_rate_night: 17000,
    daily_rate_tobi: 14000,
    daily_rate_age: 11000,
    daily_rate_tobiage: 20000,
    daily_rate_holiday: 18000,
  };

  it('basic → daily_rate_basic', () => {
    expect(getDailyRateByJobType_(staff, 'basic')).toBe(12000);
  });

  it('half → daily_rate_half', () => {
    expect(getDailyRateByJobType_(staff, 'half')).toBe(7000);
  });

  it('fullday → daily_rate_fullday', () => {
    expect(getDailyRateByJobType_(staff, 'fullday')).toBe(15000);
  });

  it('night / yakin → daily_rate_night', () => {
    expect(getDailyRateByJobType_(staff, 'night')).toBe(17000);
    expect(getDailyRateByJobType_(staff, 'yakin')).toBe(17000);
  });

  it('tobi → daily_rate_tobi', () => {
    expect(getDailyRateByJobType_(staff, 'tobi')).toBe(14000);
  });

  it('age → daily_rate_age', () => {
    expect(getDailyRateByJobType_(staff, 'age')).toBe(11000);
  });

  it('tobiage → daily_rate_tobiage', () => {
    expect(getDailyRateByJobType_(staff, 'tobiage')).toBe(20000);
  });

  it('tobiage 未設定 → tobi * 1.5', () => {
    const s = { ...staff, daily_rate_tobiage: undefined };
    // floor(14000 * 1.5) = 21000
    expect(getDailyRateByJobType_(s, 'tobiage')).toBe(21000);
  });

  it('holiday → daily_rate_holiday', () => {
    expect(getDailyRateByJobType_(staff, 'holiday')).toBe(18000);
  });

  it('null staff → 0', () => {
    expect(getDailyRateByJobType_(null as any, 'basic')).toBe(0);
  });

  describe('default branch — カスタム単価', () => {
    beforeEach(() => {
      globalThis.MasterCache = {
        getCustomPriceMap: () => ({
          'staff|S001|special': 25000,
        }),
        getCompany: () => null,
      };
    });

    it('カスタム単価マップに値がある → その値', () => {
      expect(getDailyRateByJobType_(staff, 'special')).toBe(25000);
    });

    it('カスタム単価マップに値がない → basic fallback', () => {
      globalThis.MasterCache = {
        getCustomPriceMap: () => ({}),
        getCompany: () => null,
      };
      expect(getDailyRateByJobType_(staff, 'unknown_type')).toBe(12000);
    });
  });
});

// ============================================
// getSubcontractorRateByUnit_
// ============================================

describe('getSubcontractorRateByUnit_', () => {
  const sub = {
    subcontractor_id: 'SUB001',
    basic_rate: 13000,
    half_day_rate: 8000,
    full_day_rate: 16000,
    night_rate: 19000,
    tobi_rate: 15000,
    age_rate: 12000,
    tobiage_rate: 22000,
    holiday_rate: 20000,
  };

  it('half → half_day_rate', () => {
    expect(getSubcontractorRateByUnit_(sub, 'half')).toBe(8000);
  });

  it('halfday → half_day_rate', () => {
    expect(getSubcontractorRateByUnit_(sub, 'halfday')).toBe(8000);
  });

  it('full / fullday → full_day_rate', () => {
    expect(getSubcontractorRateByUnit_(sub, 'full')).toBe(16000);
    expect(getSubcontractorRateByUnit_(sub, 'fullday')).toBe(16000);
  });

  it('yakin / night → night_rate', () => {
    expect(getSubcontractorRateByUnit_(sub, 'yakin')).toBe(19000);
    expect(getSubcontractorRateByUnit_(sub, 'night')).toBe(19000);
  });

  it('tobi → tobi_rate', () => {
    expect(getSubcontractorRateByUnit_(sub, 'tobi')).toBe(15000);
  });

  it('age / niage → age_rate', () => {
    expect(getSubcontractorRateByUnit_(sub, 'age')).toBe(12000);
    expect(getSubcontractorRateByUnit_(sub, 'niage')).toBe(12000);
  });

  it('tobiage → tobiage_rate', () => {
    expect(getSubcontractorRateByUnit_(sub, 'tobiage')).toBe(22000);
  });

  it('holiday → holiday_rate', () => {
    expect(getSubcontractorRateByUnit_(sub, 'holiday')).toBe(20000);
  });

  it('half_day_rate 未設定 → basic_rate fallback', () => {
    const s = { ...sub, half_day_rate: undefined };
    expect(getSubcontractorRateByUnit_(s, 'half')).toBe(13000);
  });

  it('rate=0 → 0（warnMissingRate_ 呼び出し、例外なし）', () => {
    const s = { subcontractor_id: 'SUB002', basic_rate: 0 };
    expect(getSubcontractorRateByUnit_(s, 'half')).toBe(0);
  });

  describe('default branch — カスタム単価', () => {
    beforeEach(() => {
      globalThis.MasterCache = {
        getCustomPriceMap: () => ({
          'subcontractor|SUB001|special': 28000,
        }),
        getCompany: () => null,
      };
    });

    it('カスタム単価マップに値がある → その値', () => {
      expect(getSubcontractorRateByUnit_(sub, 'special')).toBe(28000);
    });

    it('カスタム単価マップに値がない → basic_rate fallback', () => {
      globalThis.MasterCache = {
        getCustomPriceMap: () => ({}),
        getCompany: () => null,
      };
      expect(getSubcontractorRateByUnit_(sub, 'unknown')).toBe(13000);
    });
  });
});
