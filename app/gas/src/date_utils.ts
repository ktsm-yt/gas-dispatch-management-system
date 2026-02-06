// File: date_utils.ts
// 日付・期間計算ユーティリティ（KTSM-63）

const DATE_FORMAT = {
  DATE: 'yyyy-MM-dd',
  DATETIME: "yyyy-MM-dd'T'HH:mm:ssXXX",
  TIME: 'HH:mm'
} as const;

const DEFAULT_TIMEZONE = 'Asia/Tokyo';

// ============================================
// 基本的な日付操作
// ============================================

function parseDate_(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  const parts = dateStr.split('-');
  return new Date(
    parseInt(parts[0], 10),
    parseInt(parts[1], 10) - 1,
    parseInt(parts[2], 10)
  );
}

function formatDate_(date: Date | null | undefined): string | null {
  if (!date) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatYearMonth_(date: Date | null | undefined): string | null {
  if (!date) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function formatIsoDateTime_(date: Date | null | undefined): string | null {
  if (!date) return null;
  return Utilities.formatDate(date, DEFAULT_TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

function nowIso_(): string | null {
  return formatIsoDateTime_(new Date());
}

function today_(): string | null {
  return formatDate_(new Date());
}

// ============================================
// 日付演算
// ============================================

function addDays_(date: Date | string, days: number): Date {
  const d = typeof date === 'string' ? parseDate_(date)! : new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function addMonths_(date: Date | string, months: number): Date {
  const d = typeof date === 'string' ? parseDate_(date)! : new Date(date);
  const originalDay = d.getDate();

  d.setMonth(d.getMonth() + months);

  if (d.getDate() !== originalDay) {
    d.setDate(0);
  }

  return d;
}

function diffDays_(startDate: Date | string, endDate: Date | string): number {
  const start = typeof startDate === 'string' ? parseDate_(startDate)! : startDate;
  const end = typeof endDate === 'string' ? parseDate_(endDate)! : endDate;
  const diffTime = end.getTime() - start.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

function getLastDayOfMonth_(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function getEndOfMonth_(date: Date | string): Date {
  const d = typeof date === 'string' ? parseDate_(date)! : new Date(date);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function getStartOfMonth_(date: Date | string): Date {
  const d = typeof date === 'string' ? parseDate_(date)! : new Date(date);
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

// ============================================
// 締め日・支払日計算
// ============================================

function calculateClosingPeriod_(
  year: number,
  month: number,
  closingDay: number
): { startDate: string | null; endDate: string | null } {
  const isMonthEnd = closingDay >= 28;

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

function calculatePaymentDate_(
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

function generateInvoiceNumber_(year: number, month: number, seq: number): string {
  const yy = String(year).slice(-2);
  const mm = String(month).padStart(2, '0');
  return `${yy}${mm}_${seq}`;
}

// ============================================
// 稼働日数計算
// ============================================

function getJapaneseHolidays_(year: number): Set<string> {
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

function getNthDayOfWeek_(year: number, month: number, dayOfWeek: number, n: number): string | null {
  const firstDay = new Date(year, month - 1, 1);
  const firstDayOfWeek = firstDay.getDay();

  let diff = dayOfWeek - firstDayOfWeek;
  if (diff < 0) diff += 7;

  const day = 1 + diff + (n - 1) * 7;
  return formatDate_(new Date(year, month - 1, day));
}

function isBusinessDay_(date: Date | string, holidays: Set<string>): boolean {
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

function countBusinessDays_(startDate: string, endDate: string, excludeHolidays: boolean = true): number {
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

function countWorkingDays_(startDate: string, endDate: string): number {
  return diffDays_(startDate, endDate) + 1;
}

function getNextBusinessDay_(date: Date | string, excludeHolidays: boolean = true): Date {
  const d = typeof date === 'string' ? parseDate_(date)! : new Date(date);
  const year = d.getFullYear();
  const holidays = excludeHolidays ? getJapaneseHolidays_(year) : new Set<string>();

  d.setDate(d.getDate() + 1);
  while (!isBusinessDay_(d, holidays)) {
    d.setDate(d.getDate() + 1);
    if (d.getFullYear() !== year && excludeHolidays) {
      const newHolidays = getJapaneseHolidays_(d.getFullYear());
      newHolidays.forEach(h => holidays.add(h));
    }
  }

  return d;
}

// ============================================
// 年度・期間判定
// ============================================

function getFiscalYear_(date: Date | string): number {
  const d = typeof date === 'string' ? parseDate_(date)! : date;
  const month = d.getMonth() + 1;
  const year = d.getFullYear();
  return month >= 4 ? year : year - 1;
}

function getFiscalYearRange_(fiscalYear: number): { startDate: string; endDate: string } {
  return {
    startDate: `${fiscalYear}-04-01`,
    endDate: `${fiscalYear + 1}-03-31`
  };
}

function isWithinPeriod_(date: string, startDate: string, endDate: string): boolean {
  return date >= startDate && date <= endDate;
}
