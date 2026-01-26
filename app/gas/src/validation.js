// File: validation.gs
// バリデーションロジック共通処理（KTSM-63）

/**
 * 時間区分（time_slot）の有効値
 * @see docs/03_spec/05_database.md T_Jobs.time_slot
 */
const TIME_SLOTS = {
  JOTOU: 'jotou',       // 上棟
  SHUUJITSU: 'shuujitsu', // 終日
  AM: 'am',             // AM
  PM: 'pm',             // PM
  YAKIN: 'yakin',       // 夜勤
  MITEI: 'mitei'        // 開始時間未定
};

/**
 * 案件ステータスの有効値
 * @see docs/03_spec/05_database.md T_Jobs.status
 */
const JOB_STATUSES = {
  PENDING: 'pending',     // 未配置
  ASSIGNED: 'assigned',   // 配置済
  HOLD: 'hold',           // 保留
  COMPLETED: 'completed', // 完了
  CANCELLED: 'cancelled', // キャンセル
  PROBLEM: 'problem'      // 問題あり
};

/**
 * 作業種別の有効値
 */
const JOB_TYPES = {
  TOBI: 'tobi',         // 鳶
  AGE: 'age',           // 揚げ
  TOBIAGE: 'tobiage'    // 鳶揚げ
};

/**
 * 給与/請求区分の有効値
 * @see docs/04_adr/ADR-003_pay_unit_invoice_unit.md
 */
const PAY_UNITS = {
  BASIC: 'basic',       // 基本
  HALF: 'half',         // ハーフ（旧）
  HALFDAY: 'halfday',   // ハーフ
  FULLDAY: 'fullday',   // 終日
  NIGHT: 'night',       // 夜間
  TOBI: 'tobi',         // 鳶
  TOBIAGE: 'tobiage'    // 鳶揚げ
};

/**
 * 作業大項目の有効値
 */
const WORK_CATEGORIES = {
  JOTOU: 'jotou',       // 上棟
  KEISAGYO: 'keisagyo', // 軽作業
  NIAGE: 'niage'        // 荷揚げ
};

/**
 * 作業詳細の有効値
 */
const WORK_DETAILS = {
  // 資材系
  SEKKOU: 'sekkou',       // 石膏ボード
  TATEGU: 'tategu',       // 建具
  KITCHEN: 'kitchen',     // キッチン
  UNIT_BATH: 'unit_bath', // ユニットバス
  FLOORING: 'flooring',   // フローリング
  HABAKI: 'habaki',       // 幅木
  CROSS: 'cross',         // クロス
  PREFAB: 'prefab',       // プレハブ材
  SCAFFOLD: 'scaffold',   // 足場材
  MATERIAL: 'material',   // 資材一般
  SK: 'sk',               // SK（洗面台）
  TOILET: 'toilet',       // トイレ
  FURNITURE: 'furniture', // 家具
  APPLIANCE: 'appliance', // 家電
  // 上棟系
  TOBI: 'tobi',           // 鳶
  TOBI_HOJO: 'tobi_hojo', // 鳶補助
  NIAGE: 'niage',         // 荷揚げ
  TOBIAGE: 'tobiage',     // 鳶揚げ
  // 作業系
  HANSYUTSU: 'hansyutsu', // 搬出
  TEMOTO: 'temoto',       // 手元
  KAITAI: 'kaitai',       // 解体
  SEISOU: 'seisou',       // 清掃
  OTHER: 'other'          // その他
};

/**
 * 大項目別の詳細選択肢
 */
const WORK_DETAIL_OPTIONS = {
  jotou: ['tobi', 'tobi_hojo', 'niage', 'tobiage'],  // 上棟系
  keisagyo: ['sekkou', 'tategu', 'kitchen', 'unit_bath', 'flooring', 'habaki', 'cross', 'prefab', 'scaffold', 'material', 'sk', 'toilet', 'furniture', 'appliance', 'hansyutsu', 'temoto', 'kaitai', 'seisou', 'other'],
  niage: ['sekkou', 'tategu', 'kitchen', 'unit_bath', 'flooring', 'habaki', 'cross', 'prefab', 'scaffold', 'material', 'sk', 'toilet', 'furniture', 'appliance', 'other']
};

/**
 * 請求書フォーマットの有効値
 * @see docs/03_spec/05_database.md M_Customers.invoice_format
 */
const INVOICE_FORMATS = {
  FORMAT1: 'format1',     // 様式1
  FORMAT2: 'format2',     // 様式2
  FORMAT3: 'format3',     // 様式3
  ATAMAGAMI: 'atamagami'  // 頭紙（非推奨: 様式1,2のオプション「頭紙を付ける」を使用）
};

/**
 * 請求ステータスの有効値
 * @see docs/03_spec/05_database.md T_Invoices.status
 */
const INVOICE_STATUSES = {
  UNSENT: 'unsent',   // 未送付
  SENT: 'sent',       // 送付済
  UNPAID: 'unpaid',   // 未回収
  PAID: 'paid'        // 入金済
};

/**
 * 配置ステータスの有効値
 * Note: 実装全体で大文字を使用しているため、値も大文字に統一
 */
const ASSIGNMENT_STATUSES = {
  ASSIGNED: 'ASSIGNED',     // 配置済
  CONFIRMED: 'CONFIRMED',   // 確定
  CANCELLED: 'CANCELLED'    // キャンセル
};

/**
 * スタッフ種別の有効値
 */
const STAFF_TYPES = {
  REGULAR: 'regular',       // 正社員
  SUBCONTRACT: 'subcontract' // 外注
};

/**
 * ワーカー種別の有効値
 */
const WORKER_TYPES = {
  STAFF: 'STAFF',
  SUBCONTRACT: 'SUBCONTRACT'
};

/**
 * 配置時の役割（この現場での役割）
 */
const ASSIGNMENT_ROLES = {
  TOBI: '鳶',
  NIAGE: '荷揚げ',
  TOBIAGE: '鳶揚げ'
};

// ============================================
// バリデーションユーティリティ
// ============================================

/**
 * 必須項目チェック
 * @param {*} value - チェックする値
 * @param {string} fieldName - フィールド名
 * @throws {ValidationError} 値がnull/undefined/空文字の場合
 */
function requireField_(value, fieldName) {
  if (value === null || value === undefined || value === '') {
    throw new ValidationError(`${fieldName}は必須です`, { field: fieldName });
  }
}

/**
 * 複数の必須項目チェック
 * @param {Object} data - チェック対象のオブジェクト
 * @param {string[]} requiredFields - 必須フィールド名の配列
 * @throws {ValidationError} 必須項目が不足している場合
 */
function requireFields_(data, requiredFields) {
  const missing = requiredFields.filter(field => {
    const value = data[field];
    return value === null || value === undefined || value === '';
  });

  if (missing.length > 0) {
    throw new ValidationError(
      `必須項目が不足しています: ${missing.join(', ')}`,
      { missingFields: missing }
    );
  }
}

/**
 * 文字列の長さチェック
 * @param {string} value - チェックする値
 * @param {string} fieldName - フィールド名
 * @param {number} maxLength - 最大文字数
 * @throws {ValidationError} 文字数が超過している場合
 */
function validateLength_(value, fieldName, maxLength) {
  if (value && value.length > maxLength) {
    throw new ValidationError(
      `${fieldName}は${maxLength}文字以内で入力してください`,
      { field: fieldName, maxLength, actualLength: value.length }
    );
  }
}

/**
 * 列挙値チェック
 * @param {*} value - チェックする値
 * @param {string} fieldName - フィールド名
 * @param {Object} enumObj - 有効な値を持つオブジェクト
 * @throws {ValidationError} 有効な値でない場合
 */
function validateEnum_(value, fieldName, enumObj) {
  if (value === null || value === undefined || value === '') return; // 空は許可（必須チェックは別で行う）

  const validValues = Object.values(enumObj);
  if (!validValues.includes(value)) {
    throw new ValidationError(
      `${fieldName}の値が不正です: ${value}`,
      { field: fieldName, validValues, actualValue: value }
    );
  }
}

/**
 * 数値チェック
 * @param {*} value - チェックする値
 * @param {string} fieldName - フィールド名
 * @param {Object} options - オプション { min, max, allowDecimal }
 * @throws {ValidationError} 不正な数値の場合
 */
function validateNumber_(value, fieldName, options = {}) {
  if (value === null || value === undefined || value === '') return;

  const num = Number(value);
  if (isNaN(num)) {
    throw new ValidationError(
      `${fieldName}は数値で入力してください`,
      { field: fieldName, actualValue: value }
    );
  }

  if (options.min !== undefined && num < options.min) {
    throw new ValidationError(
      `${fieldName}は${options.min}以上で入力してください`,
      { field: fieldName, min: options.min, actualValue: num }
    );
  }

  if (options.max !== undefined && num > options.max) {
    throw new ValidationError(
      `${fieldName}は${options.max}以下で入力してください`,
      { field: fieldName, max: options.max, actualValue: num }
    );
  }

  if (options.allowDecimal === false && !Number.isInteger(num)) {
    throw new ValidationError(
      `${fieldName}は整数で入力してください`,
      { field: fieldName, actualValue: num }
    );
  }
}

/**
 * 日付形式チェック（YYYY-MM-DD）
 * @param {string} value - チェックする値
 * @param {string} fieldName - フィールド名
 * @throws {ValidationError} 不正な日付形式の場合
 */
function validateDateFormat_(value, fieldName) {
  if (value === null || value === undefined || value === '') return;

  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(value)) {
    throw new ValidationError(
      `${fieldName}はYYYY-MM-DD形式で入力してください`,
      { field: fieldName, actualValue: value }
    );
  }

  // 実際に有効な日付かチェック
  const date = new Date(value);
  if (isNaN(date.getTime())) {
    throw new ValidationError(
      `${fieldName}は有効な日付を入力してください`,
      { field: fieldName, actualValue: value }
    );
  }
}

/**
 * 時刻形式チェック（HH:MM）
 * @param {string} value - チェックする値
 * @param {string} fieldName - フィールド名
 * @throws {ValidationError} 不正な時刻形式の場合
 */
function validateTimeFormat_(value, fieldName) {
  if (value === null || value === undefined || value === '') return;

  const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
  if (!timeRegex.test(value)) {
    throw new ValidationError(
      `${fieldName}はHH:MM形式で入力してください`,
      { field: fieldName, actualValue: value }
    );
  }
}

/**
 * ISO8601日時形式チェック
 * @param {string} value - チェックする値
 * @param {string} fieldName - フィールド名
 * @throws {ValidationError} 不正な形式の場合
 */
function validateIsoDateTime_(value, fieldName) {
  if (value === null || value === undefined || value === '') return;

  const date = new Date(value);
  if (isNaN(date.getTime())) {
    throw new ValidationError(
      `${fieldName}は有効な日時形式で入力してください`,
      { field: fieldName, actualValue: value }
    );
  }
}

/**
 * メールアドレス形式チェック
 * @param {string} value - チェックする値
 * @param {string} fieldName - フィールド名
 * @throws {ValidationError} 不正な形式の場合
 */
function validateEmail_(value, fieldName) {
  if (value === null || value === undefined || value === '') return;

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(value)) {
    throw new ValidationError(
      `${fieldName}は正しいメールアドレス形式で入力してください`,
      { field: fieldName, actualValue: value }
    );
  }
}

/**
 * 電話番号形式チェック（日本国内）
 * @param {string} value - チェックする値
 * @param {string} fieldName - フィールド名
 * @throws {ValidationError} 不正な形式の場合
 */
function validatePhone_(value, fieldName) {
  if (value === null || value === undefined || value === '') return;

  // ハイフンありなしどちらも許可
  const phoneRegex = /^0\d{9,10}$|^\d{2,4}-\d{2,4}-\d{4}$/;
  if (!phoneRegex.test(value)) {
    throw new ValidationError(
      `${fieldName}は正しい電話番号形式で入力してください`,
      { field: fieldName, actualValue: value }
    );
  }
}

/**
 * 郵便番号形式チェック（日本国内）
 * @param {string} value - チェックする値
 * @param {string} fieldName - フィールド名
 * @throws {ValidationError} 不正な形式の場合
 */
function validatePostalCode_(value, fieldName) {
  if (value === null || value === undefined || value === '') return;

  // ハイフンありなしどちらも許可
  const postalRegex = /^\d{7}$|^\d{3}-\d{4}$/;
  if (!postalRegex.test(value)) {
    throw new ValidationError(
      `${fieldName}は正しい郵便番号形式（例: 120-0034）で入力してください`,
      { field: fieldName, actualValue: value }
    );
  }
}

/**
 * ID形式チェック（プレフィックス付きID対応）
 * 形式:
 *   - prefix_uuid (例: cus_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
 *   - prefix_shortid (例: cus_bulk_021, job_001)
 *   - 純粋UUID
 * @param {string} value - チェックする値
 * @param {string} fieldName - フィールド名
 * @throws {ValidationError} 不正な形式の場合
 */
function validateUuid_(value, fieldName) {
  if (value === null || value === undefined || value === '') return;

  // プレフィックス付きUUID (prefix_uuid) または純粋UUIDを許可
  const prefixedUuidRegex = /^[a-z]{2,4}_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const pureUuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  // プレフィックス付き短縮ID (例: cus_bulk_021, job_001, stf_test_001)
  const prefixedShortIdRegex = /^[a-z]{2,4}_[a-z0-9_]+$/i;

  if (!prefixedUuidRegex.test(value) && !pureUuidRegex.test(value) && !prefixedShortIdRegex.test(value)) {
    throw new ValidationError(
      `${fieldName}は正しいID形式ではありません`,
      { field: fieldName, actualValue: value }
    );
  }
}

// ============================================
// エンティティバリデーション
// ============================================

/**
 * 案件（T_Jobs）のバリデーション
 * @param {Object} job - 案件データ
 * @param {boolean} isNew - 新規作成かどうか
 * @throws {ValidationError} バリデーションエラーの場合
 */
function validateJob_(job, isNew = false) {
  if (isNew) {
    requireFields_(job, ['customer_id', 'site_name', 'work_date', 'time_slot', 'required_count', 'pay_unit', 'status']);
  }

  if (job.customer_id !== undefined) {
    validateUuid_(job.customer_id, '顧客ID');
  }

  if (job.site_name !== undefined) {
    validateLength_(job.site_name, '現場名', 200);
  }

  if (job.work_date !== undefined) {
    validateDateFormat_(job.work_date, '作業日');
  }

  if (job.time_slot !== undefined) {
    validateEnum_(job.time_slot, '時間区分', TIME_SLOTS);
  }

  if (job.start_time !== undefined) {
    validateTimeFormat_(job.start_time, '開始時間');
  }

  if (job.required_count !== undefined) {
    validateNumber_(job.required_count, '必要人数', { min: 1, max: 100, allowDecimal: false });
  }

  if (job.pay_unit !== undefined) {
    validateEnum_(job.pay_unit, '給与区分', PAY_UNITS);
  }

  if (job.work_category !== undefined) {
    validateEnum_(job.work_category, '作業区分', WORK_CATEGORIES);
  }

  if (job.status !== undefined) {
    validateEnum_(job.status, 'ステータス', JOB_STATUSES);
  }
}

/**
 * 配置（T_JobAssignments）のバリデーション
 * @param {Object} assignment - 配置データ
 * @param {boolean} isNew - 新規作成かどうか
 * @throws {ValidationError} バリデーションエラーの場合
 */
function validateAssignment_(assignment, isNew = false) {
  if (isNew) {
    requireFields_(assignment, ['job_id', 'staff_id', 'worker_type', 'display_time_slot', 'pay_unit', 'invoice_unit', 'status']);
  }

  if (assignment.job_id !== undefined) {
    validateUuid_(assignment.job_id, '案件ID');
  }

  if (assignment.staff_id !== undefined) {
    validateUuid_(assignment.staff_id, 'スタッフID');
  }

  if (assignment.worker_type !== undefined) {
    validateEnum_(assignment.worker_type, 'ワーカー種別', WORKER_TYPES);
  }

  if (assignment.display_time_slot !== undefined) {
    validateEnum_(assignment.display_time_slot, '表示時間区分', TIME_SLOTS);
  }

  if (assignment.pay_unit !== undefined) {
    validateEnum_(assignment.pay_unit, '給与区分', PAY_UNITS);
  }

  if (assignment.invoice_unit !== undefined) {
    // invoice_unitはTIME_SLOTSとPAY_UNITSの両方を許可
    const validInvoiceUnits = { ...TIME_SLOTS, ...PAY_UNITS };
    validateEnum_(assignment.invoice_unit, '請求区分', validInvoiceUnits);
  }

  if (assignment.wage_rate !== undefined) {
    validateNumber_(assignment.wage_rate, '給与単価', { min: 0 });
  }

  if (assignment.invoice_rate !== undefined) {
    validateNumber_(assignment.invoice_rate, '請求単価', { min: 0 });
  }

  if (assignment.transport_amount !== undefined) {
    validateNumber_(assignment.transport_amount, '交通費', { min: 0 });
  }

  if (assignment.status !== undefined) {
    validateEnum_(assignment.status, 'ステータス', ASSIGNMENT_STATUSES);
  }

  if (assignment.assignment_role !== undefined) {
    validateEnum_(assignment.assignment_role, '配置役割', ASSIGNMENT_ROLES);
  }

  if (assignment.is_leader !== undefined) {
    if (typeof assignment.is_leader !== 'boolean') {
      throw new ValidationError(
        'リーダーフラグはtrue/falseで指定してください',
        { field: 'is_leader', actualValue: assignment.is_leader }
      );
    }
  }
}

/**
 * 顧客（M_Customers）のバリデーション
 * @param {Object} customer - 顧客データ
 * @param {boolean} isNew - 新規作成かどうか
 * @throws {ValidationError} バリデーションエラーの場合
 */
function validateCustomer_(customer, isNew = false) {
  if (isNew) {
    requireFields_(customer, ['company_name']);
  }

  if (customer.company_name !== undefined) {
    validateLength_(customer.company_name, '会社名', 200);
  }

  if (customer.email !== undefined) {
    validateEmail_(customer.email, 'メールアドレス');
  }

  if (customer.phone !== undefined) {
    validatePhone_(customer.phone, '電話番号');
  }

  if (customer.postal_code !== undefined) {
    validatePostalCode_(customer.postal_code, '郵便番号');
  }

  if (customer.closing_day !== undefined) {
    validateNumber_(customer.closing_day, '締め日', { min: 1, max: 31, allowDecimal: false });
  }

  if (customer.payment_day !== undefined) {
    validateNumber_(customer.payment_day, '支払日', { min: 1, max: 31, allowDecimal: false });
  }

  if (customer.payment_month_offset !== undefined) {
    validateNumber_(customer.payment_month_offset, '支払月', { min: 0, max: 3, allowDecimal: false });
  }

  if (customer.invoice_format !== undefined) {
    validateEnum_(customer.invoice_format, '請求書書式', INVOICE_FORMATS);
  }

  if (customer.tax_rate !== undefined) {
    validateNumber_(customer.tax_rate, '消費税率', { min: 0, max: 100 });
  }

  if (customer.expense_rate !== undefined) {
    validateNumber_(customer.expense_rate, '諸経費率', { min: 0, max: 100 });
  }
}

/**
 * スタッフ（M_Staff）のバリデーション
 * @param {Object} staff - スタッフデータ
 * @param {boolean} isNew - 新規作成かどうか
 * @throws {ValidationError} バリデーションエラーの場合
 */
function validateStaff_(staff, isNew = false) {
  if (isNew) {
    requireFields_(staff, ['name', 'staff_type']);
  }

  if (staff.name !== undefined) {
    validateLength_(staff.name, '氏名', 100);
  }

  if (staff.phone !== undefined) {
    validatePhone_(staff.phone, '電話番号');
  }

  if (staff.postal_code !== undefined) {
    validatePostalCode_(staff.postal_code, '郵便番号');
  }

  if (staff.staff_type !== undefined) {
    validateEnum_(staff.staff_type, 'スタッフ種別', STAFF_TYPES);
  }

  if (staff.daily_rate_half !== undefined) {
    validateNumber_(staff.daily_rate_half, '日給（ハーフ）', { min: 0 });
  }

  if (staff.daily_rate_basic !== undefined) {
    validateNumber_(staff.daily_rate_basic, '日給（基本）', { min: 0 });
  }

  if (staff.daily_rate_fullday !== undefined) {
    validateNumber_(staff.daily_rate_fullday, '日給（終日）', { min: 0 });
  }

  if (staff.daily_rate_night !== undefined) {
    validateNumber_(staff.daily_rate_night, '日給（夜間）', { min: 0 });
  }

  if (staff.daily_rate_tobi !== undefined) {
    validateNumber_(staff.daily_rate_tobi, '日給（鳶）', { min: 0 });
  }

  // 外注の場合は外注先IDが必要
  if (staff.staff_type === STAFF_TYPES.SUBCONTRACT && isNew) {
    requireField_(staff.subcontractor_id, '外注先ID');
  }
}

/**
 * 請求（T_Invoices）のバリデーション
 * @param {Object} invoice - 請求データ
 * @param {boolean} isNew - 新規作成かどうか
 * @throws {ValidationError} バリデーションエラーの場合
 */
function validateInvoice_(invoice, isNew = false) {
  if (isNew) {
    requireFields_(invoice, ['customer_id', 'billing_year', 'billing_month', 'issue_date', 'invoice_format', 'status']);
  }

  if (invoice.customer_id !== undefined) {
    validateUuid_(invoice.customer_id, '顧客ID');
  }

  if (invoice.billing_year !== undefined) {
    validateNumber_(invoice.billing_year, '請求対象年', { min: 2020, max: 2100, allowDecimal: false });
  }

  if (invoice.billing_month !== undefined) {
    validateNumber_(invoice.billing_month, '請求対象月', { min: 1, max: 12, allowDecimal: false });
  }

  if (invoice.issue_date !== undefined) {
    validateDateFormat_(invoice.issue_date, '発行日');
  }

  if (invoice.due_date !== undefined) {
    validateDateFormat_(invoice.due_date, '支払期限');
  }

  if (invoice.invoice_format !== undefined) {
    validateEnum_(invoice.invoice_format, '請求書書式', INVOICE_FORMATS);
  }

  if (invoice.status !== undefined) {
    validateEnum_(invoice.status, 'ステータス', INVOICE_STATUSES);
  }

  if (invoice.subtotal !== undefined) {
    validateNumber_(invoice.subtotal, '小計', { min: 0 });
  }

  if (invoice.tax_amount !== undefined) {
    validateNumber_(invoice.tax_amount, '消費税額', { min: 0 });
  }

  if (invoice.total_amount !== undefined) {
    validateNumber_(invoice.total_amount, '合計金額', { min: 0 });
  }
}
// ============================================
// ステータスラベル
// ============================================
// 注: ステータス遷移ルール（JOB_STATUS_TRANSITIONS等）は
// status_rules.js で定義されています

/**
 * 案件ステータスのラベルマップ
 */
const JOB_STATUS_LABELS = {
  'pending': '未配置',
  'assigned': '配置済',
  'hold': '保留',
  'completed': '完了',
  'cancelled': 'キャンセル',
  'problem': '問題あり'
};

/**
 * 時間区分のラベルマップ
 */
const TIME_SLOT_LABELS = {
  'jotou': '上棟',
  'shuujitsu': '終日',
  'am': 'AM',
  'pm': 'PM',
  'yakin': '夜勤',
  'mitei': '未定'
};

/**
 * 案件ステータスのラベルを取得
 * @param {string} status - ステータス
 * @returns {string} ラベル
 */
function getJobStatusLabel_(status) {
  return JOB_STATUS_LABELS[status] || status;
}

/**
 * 時間区分のラベルを取得
 * @param {string} slot - 時間区分
 * @returns {string} ラベル
 */
function getTimeSlotLabel_(slot) {
  return TIME_SLOT_LABELS[slot] || slot;
}

// ============================================
// 編集可能チェック
// ============================================

/**
 * 案件が編集可能かチェック
 * @param {string} status - ステータス
 * @returns {boolean} 編集可能ならtrue
 */
function isJobEditable_(status) {
  // 完了・キャンセル以外は編集可能
  return status !== 'completed' && status !== 'cancelled';
}

/**
 * 請求が編集可能かチェック
 * @param {string} status - ステータス
 * @returns {boolean} 編集可能ならtrue
 */
function isInvoiceEditable_(status) {
  // 未送付のみ編集可能（後方互換: draft/issuedも許可）
  return status === 'unsent' || status === 'draft' || status === 'issued';
}

// ============================================
// ステータス自動計算
// ============================================

/**
 * 案件のステータスを配置状況から計算
 * @param {number} requiredCount - 必要人数
 * @param {number} assignedCount - 配置済み人数
 * @returns {string} 計算されたステータス
 */
function calculateJobStatus_(requiredCount, assignedCount) {
  if (assignedCount >= requiredCount) {
    return 'assigned';
  }
  return 'pending';
}
