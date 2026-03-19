// File: date_utils.ts
// 日付・期間計算ユーティリティ（KTSM-63）

// ============================================
// 基本的な日付操作
// ============================================

export function parseDate_(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  const parts = dateStr.split('-');
  return new Date(
    parseInt(parts[0], 10),
    parseInt(parts[1], 10) - 1,
    parseInt(parts[2], 10)
  );
}

export function formatDate_(date: Date | null | undefined): string | null {
  if (!date) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ============================================
// 日付演算
// ============================================

export function addDays_(date: Date | string, days: number): Date {
  const d = typeof date === 'string' ? parseDate_(date)! : new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function addMonths_(date: Date | string, months: number): Date {
  const d = typeof date === 'string' ? parseDate_(date)! : new Date(date);
  const originalDay = d.getDate();

  d.setMonth(d.getMonth() + months);

  if (d.getDate() !== originalDay) {
    d.setDate(0);
  }

  return d;
}

export function diffDays_(startDate: Date | string, endDate: Date | string): number {
  const start = typeof startDate === 'string' ? parseDate_(startDate)! : startDate;
  const end = typeof endDate === 'string' ? parseDate_(endDate)! : endDate;
  const diffTime = end.getTime() - start.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

export function getLastDayOfMonth_(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function getEndOfMonth_(date: Date | string): Date {
  const d = typeof date === 'string' ? parseDate_(date)! : new Date(date);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

// ============================================
// 締め日・支払日計算
// ============================================

export function calculateClosingPeriod_(
  year: number,
  month: number,
  closingDay: number
): { startDate: string | null; endDate: string | null } {
  const isMonthEnd = closingDay === 31;

  let endDate: Date;
  if (isMonthEnd) {
    endDate = getEndOfMonth_(new Date(year, month - 1, 1));
  } else {
    endDate = new Date(year, month - 1, closingDay);
  }

  let startDate: Date;
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;

  if (isMonthEnd) {
    startDate = new Date(prevYear, prevMonth - 1 + 1, 1);
  } else {
    startDate = new Date(prevYear, prevMonth - 1, closingDay + 1);
  }

  return {
    startDate: formatDate_(startDate),
    endDate: formatDate_(endDate)
  };
}

export function calculatePaymentDate_(
  year: number,
  month: number,
  _closingDay: number,
  paymentMonthOffset: number,
  paymentDay: number
): string | null {
  let payYear = year;
  let payMonth = month + (paymentMonthOffset || 0);

  while (payMonth > 12) {
    payMonth -= 12;
    payYear++;
  }

  const lastDay = getLastDayOfMonth_(payYear, payMonth);
  const actualPayDay = paymentDay >= lastDay ? lastDay : paymentDay;

  return formatDate_(new Date(payYear, payMonth - 1, actualPayDay));
}

// ============================================
// 稼働日数計算
// ============================================

export function getJapaneseHolidays_(year: number): Set<string> {
  const holidays = new Set<string>();

  holidays.add(`${year}-01-01`);
  holidays.add(`${year}-02-11`);
  holidays.add(`${year}-02-23`);
  holidays.add(`${year}-04-29`);
  holidays.add(`${year}-05-03`);
  holidays.add(`${year}-05-04`);
  holidays.add(`${year}-05-05`);
  holidays.add(`${year}-08-11`);
  holidays.add(`${year}-11-03`);
  holidays.add(`${year}-11-23`);

  holidays.add(getNthDayOfWeek_(year, 1, 1, 2)!);
  holidays.add(getNthDayOfWeek_(year, 7, 1, 3)!);
  holidays.add(getNthDayOfWeek_(year, 9, 1, 3)!);
  holidays.add(getNthDayOfWeek_(year, 10, 1, 2)!);

  const vernal = Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
  holidays.add(`${year}-03-${String(vernal).padStart(2, '0')}`);
  const autumnal = Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
  holidays.add(`${year}-09-${String(autumnal).padStart(2, '0')}`);

  return holidays;
}

export function getNthDayOfWeek_(year: number, month: number, dayOfWeek: number, n: number): string | null {
  const firstDay = new Date(year, month - 1, 1);
  const firstDayOfWeek = firstDay.getDay();

  let diff = dayOfWeek - firstDayOfWeek;
  if (diff < 0) diff += 7;

  const day = 1 + diff + (n - 1) * 7;
  return formatDate_(new Date(year, month - 1, day));
}

export function isBusinessDay_(date: Date | string, holidays: Set<string>): boolean {
  const d = typeof date === 'string' ? parseDate_(date)! : date;
  const dayOfWeek = d.getDay();

  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return false;
  }

  if (holidays && holidays.has(formatDate_(d)!)) {
    return false;
  }

  return true;
}

export function countBusinessDays_(startDate: string, endDate: string, excludeHolidays: boolean = true): number {
  const start = parseDate_(startDate);
  const end = parseDate_(endDate);

  if (!start || !end) return 0;

  const holidays = new Set<string>();
  if (excludeHolidays) {
    const startYear = start.getFullYear();
    const endYear = end.getFullYear();
    for (let year = startYear; year <= endYear; year++) {
      const yearHolidays = getJapaneseHolidays_(year);
      yearHolidays.forEach(h => holidays.add(h));
    }
  }

  let count = 0;
  const current = new Date(start);

  while (current <= end) {
    if (isBusinessDay_(current, holidays)) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }

  return count;
}

export function getNextBusinessDay_(date: Date | string, excludeHolidays: boolean = true): Date {
  const d = typeof date === 'string' ? parseDate_(date)! : new Date(date);
  let year = d.getFullYear();
  const holidays = excludeHolidays ? getJapaneseHolidays_(year) : new Set<string>();

  d.setDate(d.getDate() + 1);
  for (;;) {
    if (d.getFullYear() !== year && excludeHolidays) {
      const newHolidays = getJapaneseHolidays_(d.getFullYear());
      newHolidays.forEach(h => holidays.add(h));
      year = d.getFullYear();
    }
    if (isBusinessDay_(d, holidays)) break;
    d.setDate(d.getDate() + 1);
  }

  return d;
}

// ============================================
// 年度・期間判定
// ============================================

function getFiscalYear_(date: Date | string): number {
  const fiscalMonthEnd = _getFiscalMonthEndFromMaster_();
  return getFiscalYearByEndMonth_(date, fiscalMonthEnd);
}

function getFiscalYearRange_(fiscalYear: number): { startDate: string; endDate: string } {
  const fiscalMonthEnd = _getFiscalMonthEndFromMaster_();
  return getFiscalYearRangeByEndMonth_(fiscalYear, fiscalMonthEnd);
}

// ============================================
// 汎用年度計算（決算月パラメータ化）
// ============================================

/** マスタから決算月を取得（未設定時は2月決算にフォールバック） */
function _getFiscalMonthEndFromMaster_(): number {
  try {
    const company = MasterCache.getCompany();
    const v = company && company.fiscal_month_end;
    if (v && Number(v) >= 1 && Number(v) <= 12) return Number(v);
  } catch (_) { /* フォールバック */ }
  return 2; // デフォルト: 2月決算
}

/** 決算月から年度開始月を算出（例: 決算2月→開始3月） */
export function getFiscalStartMonth_(fiscalMonthEnd: number): number {
  return fiscalMonthEnd === 12 ? 1 : fiscalMonthEnd + 1;
}

/** 日付と決算月から年度を計算 */
export function getFiscalYearByEndMonth_(date: Date | string, fiscalMonthEnd: number): number {
  const d = typeof date === 'string' ? parseDate_(date)! : date;
  const month = d.getMonth() + 1;
  const year = d.getFullYear();
  const startMonth = getFiscalStartMonth_(fiscalMonthEnd);
  // 決算月12月（暦年一致）の場合: startMonth=1 → 全月が当年
  // それ以外: startMonth以降なら当年が年度、startMonth未満なら前年が年度
  return month >= startMonth ? year : year - 1;
}

/** 年度と決算月から年度の開始日・終了日を計算 */
export function getFiscalYearRangeByEndMonth_(fiscalYear: number, fiscalMonthEnd: number): { startDate: string; endDate: string } {
  const startMonth = getFiscalStartMonth_(fiscalMonthEnd);

  let startYear: number, endYear: number;
  if (fiscalMonthEnd === 12) {
    // 12月決算: 年度=暦年（1月〜12月）
    startYear = fiscalYear;
    endYear = fiscalYear;
  } else {
    // 例: 2月決算 → 年度2025 = 2025/3/1〜2026/2/末
    startYear = fiscalYear;
    endYear = fiscalYear + 1;
  }

  const endDate = new Date(endYear, fiscalMonthEnd, 0); // 決算月末日
  const endDateStr = `${endYear}-${String(fiscalMonthEnd).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;

  return {
    startDate: `${startYear}-${String(startMonth).padStart(2, '0')}-01`,
    endDate: endDateStr
  };
}

/**
 * 期数を算出（例: FY2026, 設立2014年 → 13期）
 * ScriptProperty `COMPANY_FIRST_FISCAL_YEAR` が未設定の場合は fiscalYear をそのまま返す
 */
function getFiscalPeriodNumber_(fiscalYear: number): number {
  try {
    const firstYear = PropertiesService.getScriptProperties().getProperty('COMPANY_FIRST_FISCAL_YEAR');
    if (firstYear && Number(firstYear) > 0) {
      return fiscalYear - Number(firstYear) + 1;
    }
  } catch (_) { /* フォールバック */ }
  return fiscalYear;
}

/**
 * 期表記ラベルを生成（例: "13期3月"）
 * @param fiscalYear - 年度（例: 2026）
 * @param month - 月（1-12）省略時は期のみ（例: "13期"）
 */
function formatFiscalPeriodLabel_(fiscalYear: number, month?: number): string {
  const period = getFiscalPeriodNumber_(fiscalYear);
  if (month != null) {
    return period + '期' + month + '月';
  }
  return period + '期';
}

/** 年度内の12ヶ月を [{year, month}] 配列で返す */
export function getFiscalMonths_(fiscalYear: number, fiscalMonthEnd: number): Array<{year: number; month: number}> {
  const startMonth = getFiscalStartMonth_(fiscalMonthEnd);
  const months: Array<{year: number; month: number}> = [];

  for (let i = 0; i < 12; i++) {
    let m = startMonth + i;
    let y = fiscalYear;
    if (m > 12) {
      m -= 12;
      y += 1;
    }
    months.push({ year: y, month: m });
  }

  return months;
}

