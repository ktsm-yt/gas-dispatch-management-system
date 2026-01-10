// File: date_utils.gs
// 日付・期間計算ユーティリティ（KTSM-63）

/**
 * 日付形式定数
 */
const DATE_FORMAT = {
  DATE: 'yyyy-MM-dd',         // 日付
  DATETIME: "yyyy-MM-dd'T'HH:mm:ssXXX", // ISO8601
  TIME: 'HH:mm'               // 時刻
};

/**
 * デフォルトのタイムゾーン（Asia/Tokyo）
 */
const DEFAULT_TIMEZONE = 'Asia/Tokyo';

// ============================================
// 基本的な日付操作
// ============================================

/**
 * 日付文字列をDateオブジェクトに変換
 * @param {string} dateStr - 日付文字列（YYYY-MM-DD）
 * @returns {Date} Dateオブジェクト
 */
function parseDate_(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.split('-');
  return new Date(
    parseInt(parts[0], 10),
    parseInt(parts[1], 10) - 1,
    parseInt(parts[2], 10)
  );
}

/**
 * DateオブジェクトをYYYY-MM-DD形式に変換
 * @param {Date} date - Dateオブジェクト
 * @returns {string} YYYY-MM-DD形式の文字列
 */
function formatDate_(date) {
  if (!date) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * DateオブジェクトをYYYY-MM形式に変換
 * @param {Date} date - Dateオブジェクト
 * @returns {string} YYYY-MM形式の文字列
 */
function formatYearMonth_(date) {
  if (!date) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * DateオブジェクトをISO8601形式に変換（JST）
 * @param {Date} date - Dateオブジェクト
 * @returns {string} ISO8601形式の文字列
 */
function formatIsoDateTime_(date) {
  if (!date) return null;
  return Utilities.formatDate(date, DEFAULT_TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

/**
 * 現在日時をISO8601形式で取得
 * @returns {string} ISO8601形式の現在日時
 */
function nowIso_() {
  return formatIsoDateTime_(new Date());
}

/**
 * 今日の日付をYYYY-MM-DD形式で取得
 * @returns {string} 今日の日付
 */
function today_() {
  return formatDate_(new Date());
}

// ============================================
// 日付演算
// ============================================

/**
 * 日数を加算
 * @param {Date|string} date - 基準日
 * @param {number} days - 加算日数（負の値で減算）
 * @returns {Date} 計算後の日付
 */
function addDays_(date, days) {
  const d = typeof date === 'string' ? parseDate_(date) : new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * 月数を加算
 * @param {Date|string} date - 基準日
 * @param {number} months - 加算月数（負の値で減算）
 * @returns {Date} 計算後の日付
 * @note 月末日の場合、加算先の月末日に調整される（例: 1/31 + 1ヶ月 = 2/28）
 */
function addMonths_(date, months) {
  const d = typeof date === 'string' ? parseDate_(date) : new Date(date);
  const originalDay = d.getDate();

  // 月を加算
  d.setMonth(d.getMonth() + months);

  // 月末日オーバーフロー対策
  // 例: 1/31に1ヶ月加算すると、setMonthで2月になり、日付が31のまま
  //     2/31は存在しないので自動的に3/3になってしまう
  // 対策: 加算後の日付が元の日付と異なる場合、前月の末日に調整
  if (d.getDate() !== originalDay) {
    // 日付がずれた = 月末オーバーフローが発生
    // setDate(0)で前月の末日を取得
    d.setDate(0);
  }

  return d;
}

/**
 * 2つの日付間の日数を計算
 * @param {Date|string} startDate - 開始日
 * @param {Date|string} endDate - 終了日
 * @returns {number} 日数（endDate - startDate）
 */
function diffDays_(startDate, endDate) {
  const start = typeof startDate === 'string' ? parseDate_(startDate) : startDate;
  const end = typeof endDate === 'string' ? parseDate_(endDate) : endDate;
  const diffTime = end.getTime() - start.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * 月の最終日を取得
 * @param {number} year - 年
 * @param {number} month - 月（1-12）
 * @returns {number} 月の最終日
 */
function getLastDayOfMonth_(year, month) {
  return new Date(year, month, 0).getDate();
}

/**
 * 月末日を取得
 * @param {Date|string} date - 対象日
 * @returns {Date} 月末日
 */
function getEndOfMonth_(date) {
  const d = typeof date === 'string' ? parseDate_(date) : new Date(date);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

/**
 * 月初日を取得
 * @param {Date|string} date - 対象日
 * @returns {Date} 月初日
 */
function getStartOfMonth_(date) {
  const d = typeof date === 'string' ? parseDate_(date) : new Date(date);
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

// ============================================
// 締め日・支払日計算
// ============================================

/**
 * 締め期間を計算
 * @param {number} year - 対象年
 * @param {number} month - 対象月（1-12）
 * @param {number} closingDay - 締め日（1-31、31=月末）
 * @returns {Object} { startDate, endDate } - 締め期間の開始日・終了日（YYYY-MM-DD形式）
 */
function calculateClosingPeriod_(year, month, closingDay) {
  // 締め日が31の場合は月末として扱う
  const isMonthEnd = closingDay >= 28;

  // 締め期間終了日（当月の締め日）
  let endDate;
  if (isMonthEnd) {
    endDate = getEndOfMonth_(new Date(year, month - 1, 1));
  } else {
    endDate = new Date(year, month - 1, closingDay);
  }

  // 締め期間開始日（前月の締め日翌日）
  let startDate;
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;

  if (isMonthEnd) {
    startDate = new Date(prevYear, prevMonth - 1 + 1, 1); // 当月1日
  } else {
    startDate = new Date(prevYear, prevMonth - 1, closingDay + 1);
  }

  return {
    startDate: formatDate_(startDate),
    endDate: formatDate_(endDate)
  };
}

/**
 * 支払期日を計算
 * @param {number} year - 締め年
 * @param {number} month - 締め月（1-12）
 * @param {number} closingDay - 締め日
 * @param {number} paymentMonthOffset - 支払月オフセット（0=当月、1=翌月、2=翌々月）
 * @param {number} paymentDay - 支払日（1-31、31=月末）
 * @returns {string} 支払期日（YYYY-MM-DD形式）
 */
function calculatePaymentDate_(year, month, closingDay, paymentMonthOffset, paymentDay) {
  // 締め月から支払月を計算
  let payYear = year;
  let payMonth = month + (paymentMonthOffset || 0);

  // 年をまたぐ場合の調整
  while (payMonth > 12) {
    payMonth -= 12;
    payYear++;
  }

  // 支払日が月末または月の最終日を超える場合は月末に調整
  const lastDay = getLastDayOfMonth_(payYear, payMonth);
  const actualPayDay = paymentDay >= lastDay ? lastDay : paymentDay;

  return formatDate_(new Date(payYear, payMonth - 1, actualPayDay));
}

/**
 * 請求番号を生成
 * @param {number} year - 年
 * @param {number} month - 月
 * @param {number} seq - 連番
 * @returns {string} 請求番号（YYMM_SEQ形式）
 */
function generateInvoiceNumber_(year, month, seq) {
  const yy = String(year).slice(-2);
  const mm = String(month).padStart(2, '0');
  return `${yy}${mm}_${seq}`;
}

// ============================================
// 稼働日数計算
// ============================================

/**
 * 日本の祝日を取得（簡易版）
 * 注: 実運用では Google Calendar API 等を使用することを推奨
 * @param {number} year - 年
 * @returns {Set<string>} 祝日のセット（YYYY-MM-DD形式）
 */
function getJapaneseHolidays_(year) {
  const holidays = new Set();

  // 固定祝日
  holidays.add(`${year}-01-01`); // 元日
  holidays.add(`${year}-02-11`); // 建国記念の日
  holidays.add(`${year}-02-23`); // 天皇誕生日
  holidays.add(`${year}-04-29`); // 昭和の日
  holidays.add(`${year}-05-03`); // 憲法記念日
  holidays.add(`${year}-05-04`); // みどりの日
  holidays.add(`${year}-05-05`); // こどもの日
  holidays.add(`${year}-08-11`); // 山の日
  holidays.add(`${year}-11-03`); // 文化の日
  holidays.add(`${year}-11-23`); // 勤労感謝の日

  // 移動祝日（簡易計算）
  // 成人の日（1月第2月曜日）
  holidays.add(getNthDayOfWeek_(year, 1, 1, 2));
  // 海の日（7月第3月曜日）
  holidays.add(getNthDayOfWeek_(year, 7, 1, 3));
  // 敬老の日（9月第3月曜日）
  holidays.add(getNthDayOfWeek_(year, 9, 1, 3));
  // スポーツの日（10月第2月曜日）
  holidays.add(getNthDayOfWeek_(year, 10, 1, 2));

  // 春分の日・秋分の日（おおよその計算）
  const vernal = Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
  holidays.add(`${year}-03-${String(vernal).padStart(2, '0')}`);
  const autumnal = Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
  holidays.add(`${year}-09-${String(autumnal).padStart(2, '0')}`);

  return holidays;
}

/**
 * 第n週の特定曜日を取得
 * @param {number} year - 年
 * @param {number} month - 月（1-12）
 * @param {number} dayOfWeek - 曜日（0=日曜, 1=月曜, ...）
 * @param {number} n - 第n週
 * @returns {string} 日付（YYYY-MM-DD形式）
 */
function getNthDayOfWeek_(year, month, dayOfWeek, n) {
  const firstDay = new Date(year, month - 1, 1);
  const firstDayOfWeek = firstDay.getDay();

  let diff = dayOfWeek - firstDayOfWeek;
  if (diff < 0) diff += 7;

  const day = 1 + diff + (n - 1) * 7;
  return formatDate_(new Date(year, month - 1, day));
}

/**
 * 営業日かどうか判定（土日祝を除く）
 * @param {Date|string} date - 判定する日付
 * @param {Set<string>} holidays - 祝日のセット
 * @returns {boolean} 営業日ならtrue
 */
function isBusinessDay_(date, holidays) {
  const d = typeof date === 'string' ? parseDate_(date) : date;
  const dayOfWeek = d.getDay();

  // 土日チェック
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return false;
  }

  // 祝日チェック
  if (holidays && holidays.has(formatDate_(d))) {
    return false;
  }

  return true;
}

/**
 * 期間内の営業日数を計算
 * @param {string} startDate - 開始日（YYYY-MM-DD）
 * @param {string} endDate - 終了日（YYYY-MM-DD）
 * @param {boolean} excludeHolidays - 祝日を除外するか
 * @returns {number} 営業日数
 */
function countBusinessDays_(startDate, endDate, excludeHolidays = true) {
  const start = parseDate_(startDate);
  const end = parseDate_(endDate);

  if (!start || !end) return 0;

  // 祝日セットを取得（必要な年すべて）
  let holidays = new Set();
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

/**
 * 期間内の稼働日数を計算（案件ベース）
 * @param {string} startDate - 開始日（YYYY-MM-DD）
 * @param {string} endDate - 終了日（YYYY-MM-DD）
 * @returns {number} 稼働日数（土日祝含む、単純な日数差+1）
 */
function countWorkingDays_(startDate, endDate) {
  return diffDays_(startDate, endDate) + 1;
}

/**
 * 次の営業日を取得
 * @param {Date|string} date - 基準日
 * @param {boolean} excludeHolidays - 祝日を除外するか
 * @returns {Date} 次の営業日
 */
function getNextBusinessDay_(date, excludeHolidays = true) {
  let d = typeof date === 'string' ? parseDate_(date) : new Date(date);
  const year = d.getFullYear();
  const holidays = excludeHolidays ? getJapaneseHolidays_(year) : new Set();

  d.setDate(d.getDate() + 1);
  while (!isBusinessDay_(d, holidays)) {
    d.setDate(d.getDate() + 1);
    // 年をまたいだら祝日を再取得
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

/**
 * 年度を取得（4月始まり）
 * @param {Date|string} date - 日付
 * @returns {number} 年度
 */
function getFiscalYear_(date) {
  const d = typeof date === 'string' ? parseDate_(date) : date;
  const month = d.getMonth() + 1;
  const year = d.getFullYear();
  return month >= 4 ? year : year - 1;
}

/**
 * 年度の開始日・終了日を取得
 * @param {number} fiscalYear - 年度
 * @returns {Object} { startDate, endDate }
 */
function getFiscalYearRange_(fiscalYear) {
  return {
    startDate: `${fiscalYear}-04-01`,
    endDate: `${fiscalYear + 1}-03-31`
  };
}

/**
 * 日付が指定期間内かどうか判定
 * @param {string} date - 判定する日付（YYYY-MM-DD）
 * @param {string} startDate - 期間開始日
 * @param {string} endDate - 期間終了日
 * @returns {boolean} 期間内ならtrue
 */
function isWithinPeriod_(date, startDate, endDate) {
  return date >= startDate && date <= endDate;
}
