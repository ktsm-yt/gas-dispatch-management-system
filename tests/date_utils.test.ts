/**
 * 日付・期間計算ユーティリティ テスト
 *
 * 期待値はすべて文字列リテラル（テスト対象関数で期待値を生成しない）。
 * 祝日テストは現実装準拠（振替休日・国民の休日は未実装）。
 *
 * 実行: npx vitest run tests/date_utils.test.ts
 */

import { describe, it, expect } from 'vitest';
import {
  parseDate_,
  formatDate_,
  addDays_,
  addMonths_,
  diffDays_,
  getLastDayOfMonth_,
  getEndOfMonth_,
  calculateClosingPeriod_,
  calculatePaymentDate_,
  getJapaneseHolidays_,
  getNthDayOfWeek_,
  isBusinessDay_,
  countBusinessDays_,
  getNextBusinessDay_,
  getFiscalStartMonth_,
  getFiscalYearByEndMonth_,
  getFiscalYearRangeByEndMonth_,
  getFiscalMonths_,
} from '../app/gas/src/date_utils';

// ============================================
// 基本的な日付操作
// ============================================

describe('parseDate_', () => {
  it('YYYY-MM-DD文字列をDateに変換', () => {
    const d = parseDate_('2026-03-15')!;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(2); // 0-indexed
    expect(d.getDate()).toBe(15);
  });

  it('null → null', () => {
    expect(parseDate_(null)).toBeNull();
  });

  it('undefined → null', () => {
    expect(parseDate_(undefined)).toBeNull();
  });

  it('空文字 → null', () => {
    expect(parseDate_('')).toBeNull();
  });
});

describe('formatDate_', () => {
  it('DateをYYYY-MM-DD文字列に変換', () => {
    expect(formatDate_(new Date(2026, 2, 15))).toBe('2026-03-15');
  });

  it('1桁月日は0埋め', () => {
    expect(formatDate_(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('null → null', () => {
    expect(formatDate_(null)).toBeNull();
  });
});

// ============================================
// 日付演算
// ============================================

describe('addDays_', () => {
  it('日数加算', () => {
    expect(formatDate_(addDays_('2026-03-01', 10))).toBe('2026-03-11');
  });

  it('月跨ぎ', () => {
    expect(formatDate_(addDays_('2026-03-30', 5))).toBe('2026-04-04');
  });

  it('負の日数', () => {
    expect(formatDate_(addDays_('2026-03-10', -15))).toBe('2026-02-23');
  });
});

describe('addMonths_ — 月末オーバーフロー', () => {
  it('1月31日 + 1ヶ月 → 2月28日（非うるう年）', () => {
    expect(formatDate_(addMonths_('2026-01-31', 1))).toBe('2026-02-28');
  });

  it('1月31日 + 1ヶ月 → 2月29日（うるう年2028）', () => {
    expect(formatDate_(addMonths_('2028-01-31', 1))).toBe('2028-02-29');
  });

  it('3月31日 + 1ヶ月 → 4月30日', () => {
    expect(formatDate_(addMonths_('2026-03-31', 1))).toBe('2026-04-30');
  });

  it('1月28日 + 1ヶ月 → 2月28日（ちょうどフィット）', () => {
    expect(formatDate_(addMonths_('2026-01-28', 1))).toBe('2026-02-28');
  });

  it('うるう年2月29日 + 12ヶ月 → 非うるう年2月28日', () => {
    expect(formatDate_(addMonths_('2028-02-29', 12))).toBe('2029-02-28');
  });
});

describe('diffDays_', () => {
  it('同一日 → 0', () => {
    expect(diffDays_('2026-03-15', '2026-03-15')).toBe(0);
  });

  it('3月1日〜3月31日 → 30日', () => {
    expect(diffDays_('2026-03-01', '2026-03-31')).toBe(30);
  });

  it('逆順 → 負の値', () => {
    expect(diffDays_('2026-03-31', '2026-03-01')).toBe(-30);
  });
});

describe('getLastDayOfMonth_', () => {
  it('3月 → 31', () => {
    expect(getLastDayOfMonth_(2026, 3)).toBe(31);
  });

  it('2月（非うるう年）→ 28', () => {
    expect(getLastDayOfMonth_(2026, 2)).toBe(28);
  });

  it('2月（うるう年2028）→ 29', () => {
    expect(getLastDayOfMonth_(2028, 2)).toBe(29);
  });

  it('4月 → 30', () => {
    expect(getLastDayOfMonth_(2026, 4)).toBe(30);
  });
});

describe('getEndOfMonth_', () => {
  it('3月の任意の日 → 3月31日', () => {
    const eom = getEndOfMonth_('2026-03-15');
    expect(formatDate_(eom)).toBe('2026-03-31');
  });

  it('2月（うるう年）→ 2月29日', () => {
    const eom = getEndOfMonth_('2028-02-10');
    expect(formatDate_(eom)).toBe('2028-02-29');
  });
});

// ============================================
// 締め日・支払日計算
// ============================================

describe('calculateClosingPeriod_', () => {
  it('月末締め（closingDay=31）3月', () => {
    const result = calculateClosingPeriod_(2026, 3, 31);
    expect(result.startDate).toBe('2026-03-01');
    expect(result.endDate).toBe('2026-03-31');
  });

  it('月末締め 2月（非うるう年）', () => {
    const result = calculateClosingPeriod_(2026, 2, 31);
    expect(result.startDate).toBe('2026-02-01');
    expect(result.endDate).toBe('2026-02-28');
  });

  it('月末締め 2月（うるう年2028）', () => {
    const result = calculateClosingPeriod_(2028, 2, 31);
    expect(result.startDate).toBe('2028-02-01');
    expect(result.endDate).toBe('2028-02-29');
  });

  it('20日締め 3月 → 2/21〜3/20', () => {
    const result = calculateClosingPeriod_(2026, 3, 20);
    expect(result.startDate).toBe('2026-02-21');
    expect(result.endDate).toBe('2026-03-20');
  });

  it('15日締め 3月 → 2/16〜3/15', () => {
    const result = calculateClosingPeriod_(2026, 3, 15);
    expect(result.startDate).toBe('2026-02-16');
    expect(result.endDate).toBe('2026-03-15');
  });

  it('20日締め 1月（年跨ぎ）→ 12/21〜1/20', () => {
    const result = calculateClosingPeriod_(2026, 1, 20);
    expect(result.startDate).toBe('2025-12-21');
    expect(result.endDate).toBe('2026-01-20');
  });
});

describe('calculatePaymentDate_', () => {
  it('3月, offset=1, payDay=31 → 4月30日（4月末）', () => {
    expect(calculatePaymentDate_(2026, 3, 31, 1, 31)).toBe('2026-04-30');
  });

  it('3月, offset=2, payDay=10 → 5月10日', () => {
    expect(calculatePaymentDate_(2026, 3, 31, 2, 10)).toBe('2026-05-10');
  });

  it('11月, offset=2, payDay=15 → 翌年1月15日', () => {
    expect(calculatePaymentDate_(2026, 11, 31, 2, 15)).toBe('2027-01-15');
  });
});

// ============================================
// 祝日・稼働日計算
// ============================================

describe('getJapaneseHolidays_(2026) — 現実装準拠', () => {
  const holidays = getJapaneseHolidays_(2026);

  it('合計16個（固定10 + ハッピーマンデー4 + 春分/秋分2）', () => {
    expect(holidays.size).toBe(16);
  });

  it('元旦', () => {
    expect(holidays.has('2026-01-01')).toBe(true);
  });

  it('成人の日（1月第2月曜）', () => {
    expect(holidays.has('2026-01-12')).toBe(true);
  });

  it('建国記念の日', () => {
    expect(holidays.has('2026-02-11')).toBe(true);
  });

  it('天皇誕生日', () => {
    expect(holidays.has('2026-02-23')).toBe(true);
  });

  it('春分の日', () => {
    expect(holidays.has('2026-03-20')).toBe(true);
  });

  it('昭和の日', () => {
    expect(holidays.has('2026-04-29')).toBe(true);
  });

  it('憲法記念日・みどりの日・こどもの日', () => {
    expect(holidays.has('2026-05-03')).toBe(true);
    expect(holidays.has('2026-05-04')).toBe(true);
    expect(holidays.has('2026-05-05')).toBe(true);
  });

  it('海の日（7月第3月曜）', () => {
    expect(holidays.has('2026-07-20')).toBe(true);
  });

  it('山の日', () => {
    expect(holidays.has('2026-08-11')).toBe(true);
  });

  it('敬老の日（9月第3月曜）', () => {
    expect(holidays.has('2026-09-21')).toBe(true);
  });

  it('秋分の日', () => {
    expect(holidays.has('2026-09-23')).toBe(true);
  });

  it('スポーツの日（10月第2月曜）', () => {
    expect(holidays.has('2026-10-12')).toBe(true);
  });

  it('文化の日・勤労感謝の日', () => {
    expect(holidays.has('2026-11-03')).toBe(true);
    expect(holidays.has('2026-11-23')).toBe(true);
  });

  it('クリスマスは祝日ではない', () => {
    expect(holidays.has('2026-12-25')).toBe(false);
  });
});

describe('getNthDayOfWeek_', () => {
  it('2026年1月第2月曜 → 1/12', () => {
    expect(getNthDayOfWeek_(2026, 1, 1, 2)).toBe('2026-01-12');
  });

  it('2026年7月第3月曜 → 7/20', () => {
    expect(getNthDayOfWeek_(2026, 7, 1, 3)).toBe('2026-07-20');
  });
});

describe('isBusinessDay_', () => {
  const holidays = new Set(['2026-03-20']);

  it('平日 → true', () => {
    // 2026-03-16 is Monday
    expect(isBusinessDay_('2026-03-16', holidays)).toBe(true);
  });

  it('土曜 → false', () => {
    // 2026-03-14 is Saturday
    expect(isBusinessDay_('2026-03-14', holidays)).toBe(false);
  });

  it('日曜 → false', () => {
    // 2026-03-15 is Sunday
    expect(isBusinessDay_('2026-03-15', holidays)).toBe(false);
  });

  it('祝日（金曜）→ false', () => {
    // 2026-03-20 is Friday (春分の日)
    expect(isBusinessDay_('2026-03-20', holidays)).toBe(false);
  });
});

describe('countBusinessDays_', () => {
  it('2026年3月（1日〜31日）→ 21日', () => {
    // 31日 - 9日(土日) - 1日(3/20春分の日=金曜) = 21日
    expect(countBusinessDays_('2026-03-01', '2026-03-31')).toBe(21);
  });

  it('祝日除外なし → 土日のみ除外', () => {
    // 31日 - 9日(土日) = 22日
    expect(countBusinessDays_('2026-03-01', '2026-03-31', false)).toBe(22);
  });
});

describe('getNextBusinessDay_', () => {
  it('金曜 → 翌月曜', () => {
    // 2026-03-13 is Friday → next business day is 2026-03-16 Monday
    expect(formatDate_(getNextBusinessDay_('2026-03-13'))).toBe('2026-03-16');
  });

  it('祝日前日 → 祝日翌日（祝日が金曜の場合 → 月曜）', () => {
    // 2026-03-19 is Thursday, 3/20 is holiday (Friday), next is 3/23 Monday
    expect(formatDate_(getNextBusinessDay_('2026-03-19'))).toBe('2026-03-23');
  });
});

// ============================================
// 年度計算
// ============================================

describe('getFiscalStartMonth_', () => {
  it('2月決算 → 開始月3', () => {
    expect(getFiscalStartMonth_(2)).toBe(3);
  });

  it('12月決算 → 開始月1', () => {
    expect(getFiscalStartMonth_(12)).toBe(1);
  });

  it('3月決算 → 開始月4', () => {
    expect(getFiscalStartMonth_(3)).toBe(4);
  });
});

describe('getFiscalYearByEndMonth_', () => {
  it('2月決算: 2026年3月 → 年度2026', () => {
    expect(getFiscalYearByEndMonth_('2026-03-15', 2)).toBe(2026);
  });

  it('2月決算: 2026年2月 → 年度2025', () => {
    expect(getFiscalYearByEndMonth_('2026-02-15', 2)).toBe(2025);
  });

  it('12月決算: 2026年1月 → 年度2026', () => {
    expect(getFiscalYearByEndMonth_('2026-01-15', 12)).toBe(2026);
  });

  it('12月決算: 2026年12月 → 年度2026', () => {
    expect(getFiscalYearByEndMonth_('2026-12-15', 12)).toBe(2026);
  });
});

describe('getFiscalYearRangeByEndMonth_', () => {
  it('2月決算, 年度2025 → 2025-03-01〜2026-02-28', () => {
    const range = getFiscalYearRangeByEndMonth_(2025, 2);
    expect(range.startDate).toBe('2025-03-01');
    expect(range.endDate).toBe('2026-02-28');
  });

  it('12月決算, 年度2026 → 2026-01-01〜2026-12-31', () => {
    const range = getFiscalYearRangeByEndMonth_(2026, 12);
    expect(range.startDate).toBe('2026-01-01');
    expect(range.endDate).toBe('2026-12-31');
  });

  it('3月決算, 年度2025 → 2025-04-01〜2026-03-31', () => {
    const range = getFiscalYearRangeByEndMonth_(2025, 3);
    expect(range.startDate).toBe('2025-04-01');
    expect(range.endDate).toBe('2026-03-31');
  });
});

describe('getFiscalMonths_', () => {
  it('2月決算, 年度2025 → 3月〜翌2月の12ヶ月', () => {
    const months = getFiscalMonths_(2025, 2);
    expect(months).toHaveLength(12);
    expect(months[0]).toEqual({ year: 2025, month: 3 });
    expect(months[9]).toEqual({ year: 2025, month: 12 });
    expect(months[10]).toEqual({ year: 2026, month: 1 });
    expect(months[11]).toEqual({ year: 2026, month: 2 });
  });

  it('12月決算, 年度2026 → 1月〜12月', () => {
    const months = getFiscalMonths_(2026, 12);
    expect(months).toHaveLength(12);
    expect(months[0]).toEqual({ year: 2026, month: 1 });
    expect(months[11]).toEqual({ year: 2026, month: 12 });
  });
});
