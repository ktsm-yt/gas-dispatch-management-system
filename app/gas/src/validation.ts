// File: validation.ts
// バリデーションロジック共通処理（KTSM-63）

const TIME_SLOTS = {
  JOTOU: 'jotou',
  SHUUJITSU: 'shuujitsu',
  AM: 'am',
  PM: 'pm',
  YAKIN: 'yakin',
  MITEI: 'mitei'
} as const;

const JOB_STATUSES = {
  PENDING: 'pending',
  ASSIGNED: 'assigned',
  HOLD: 'hold',
  CANCELLED: 'cancelled',
  PROBLEM: 'problem'
} as const;

const JOB_TYPES = {
  TOBI: 'tobi',
  AGE: 'age',
  TOBIAGE: 'tobiage'
} as const;

const PAY_UNITS = {
  BASIC: 'basic',
  HALF: 'half',
  HALFDAY: 'halfday',
  FULLDAY: 'fullday',
  NIGHT: 'night',
  TOBI: 'tobi',
  AGE: 'age',
  TOBIAGE: 'tobiage',
  HOLIDAY: 'holiday'
} as const;

const WORK_CATEGORIES = {
  JOTOU: 'jotou',
  KEISAGYO: 'keisagyo',
  NIAGE: 'niage'
} as const;

const WORK_DETAILS = {
  SEKKOU: 'sekkou',
  TATEGU: 'tategu',
  KITCHEN: 'kitchen',
  UNIT_BATH: 'unit_bath',
  FLOORING: 'flooring',
  HABAKI: 'habaki',
  CROSS: 'cross',
  PREFAB: 'prefab',
  SCAFFOLD: 'scaffold',
  MATERIAL: 'material',
  SK: 'sk',
  TOILET: 'toilet',
  FURNITURE: 'furniture',
  APPLIANCE: 'appliance',
  TOBI: 'tobi',
  TOBI_HOJO: 'tobi_hojo',
  NIAGE: 'niage',
  TOBIAGE: 'tobiage',
  HANSYUTSU: 'hansyutsu',
  TEMOTO: 'temoto',
  KAITAI: 'kaitai',
  SEISOU: 'seisou',
  OTHER: 'other'
} as const;

const WORK_DETAIL_OPTIONS = {
  jotou: ['tobi', 'tobi_hojo', 'niage', 'tobiage'],
  keisagyo: ['sekkou', 'tategu', 'kitchen', 'unit_bath', 'flooring', 'habaki', 'cross', 'prefab', 'scaffold', 'material', 'sk', 'toilet', 'furniture', 'appliance', 'hansyutsu', 'temoto', 'kaitai', 'seisou', 'other'],
  niage: ['sekkou', 'tategu', 'kitchen', 'unit_bath', 'flooring', 'habaki', 'cross', 'prefab', 'scaffold', 'material', 'sk', 'toilet', 'furniture', 'appliance', 'other']
} as const;

const INVOICE_FORMATS = {
  FORMAT1: 'format1',
  FORMAT2: 'format2',
  FORMAT3: 'format3',
  ATAMAGAMI: 'atamagami'
} as const;

const TAX_ROUNDING_MODES = {
  FLOOR: 'floor',
  CEIL: 'ceil'
} as const;

const INVOICE_STATUSES = {
  UNSENT: 'unsent',
  SENT: 'sent',
  UNPAID: 'unpaid',
  PAID: 'paid',
  HOLD: 'hold'
} as const;

const ASSIGNMENT_STATUSES = {
  ASSIGNED: 'ASSIGNED',
  CONFIRMED: 'CONFIRMED',
  CANCELLED: 'CANCELLED'
} as const;

const STAFF_TYPES = {
  REGULAR: 'regular',
  STUDENT: 'student',
  SOLE_PROPRIETOR: 'sole_proprietor',
  SUBCONTRACT: 'subcontract'
} as const;

const WORKER_TYPES = {
  STAFF: 'STAFF',
  SUBCONTRACT: 'SUBCONTRACT'
} as const;

const ASSIGNMENT_ROLES = {
  TOBI: '鳶',
  NIAGE: '荷揚げ',
  TOBIAGE: '鳶揚げ'
} as const;

// ============================================
// バリデーションユーティリティ
// ============================================

function requireField_(value: unknown, fieldName: string): void {
  if (value === null || value === undefined || value === '') {
    throw new ValidationError(`${fieldName}は必須です`, { field: fieldName });
  }
}

function requireFields_(data: Record<string, unknown>, requiredFields: string[]): void {
  const missing = requiredFields.filter(field => {
    const value = data[field];
    return value === null || value === undefined || value === '';
  });

  if (missing.length > 0) {
    throw new ValidationError(
      `必須項目が不足しています: ${missing.join(', ')}`,
      { missingFields: missing }    );
  }
}

function validateLength_(value: string | null | undefined, fieldName: string, maxLength: number): void {
  if (value && value.length > maxLength) {
    throw new ValidationError(
      `${fieldName}は${maxLength}文字以内で入力してください`,
      { field: fieldName, maxLength, actualLength: value.length }    );
  }
}

function validateEnum_(value: unknown, fieldName: string, enumObj: Record<string, string>): void {
  if (value === null || value === undefined || value === '') return;

  const validValues = Object.values(enumObj);
  if (!validValues.includes(value as string)) {
    throw new ValidationError(
      `${fieldName}の値が不正です: ${value}`,
      { field: fieldName, validValues, actualValue: value }    );
  }
}

function validateNumber_(
  value: unknown,
  fieldName: string,
  options: { min?: number; max?: number; allowDecimal?: boolean } = {}
): void {
  if (value === null || value === undefined || value === '') return;

  const num = Number(value);
  if (isNaN(num)) {
    throw new ValidationError(
      `${fieldName}は数値で入力してください`,
      { field: fieldName, actualValue: value }    );
  }

  if (options.min !== undefined && num < options.min) {
    throw new ValidationError(
      `${fieldName}は${options.min}以上で入力してください`,
      { field: fieldName, min: options.min, actualValue: num }    );
  }

  if (options.max !== undefined && num > options.max) {
    throw new ValidationError(
      `${fieldName}は${options.max}以下で入力してください`,
      { field: fieldName, max: options.max, actualValue: num }    );
  }

  if (options.allowDecimal === false && !Number.isInteger(num)) {
    throw new ValidationError(
      `${fieldName}は整数で入力してください`,
      { field: fieldName, actualValue: num }    );
  }
}

function validateDateFormat_(value: string | null | undefined, fieldName: string): void {
  if (value === null || value === undefined || value === '') return;

  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(value)) {
    throw new ValidationError(
      `${fieldName}はYYYY-MM-DD形式で入力してください`,
      { field: fieldName, actualValue: value }    );
  }

  const date = new Date(value);
  if (isNaN(date.getTime())) {
    throw new ValidationError(
      `${fieldName}は有効な日付を入力してください`,
      { field: fieldName, actualValue: value }    );
  }
}

function validateTimeFormat_(value: string | null | undefined, fieldName: string): void {
  if (value === null || value === undefined || value === '') return;

  // 30時間制: 00:00〜29:59 を許容（夜勤〜早朝の当日扱い）
  const timeRegex = /^([01]\d|2[0-9]):([0-5]\d)$/;
  if (!timeRegex.test(value)) {
    throw new ValidationError(
      `${fieldName}はHH:MM形式（00:00〜29:59）で入力してください`,
      { field: fieldName, actualValue: value }    );
  }
}

function validateEmail_(value: string | null | undefined, fieldName: string): void {
  if (value === null || value === undefined || value === '') return;

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(value)) {
    throw new ValidationError(
      `${fieldName}は正しいメールアドレス形式で入力してください`,
      { field: fieldName, actualValue: value }    );
  }
}

function validatePhone_(value: string | null | undefined, fieldName: string): void {
  if (value === null || value === undefined || value === '') return;

  const phoneRegex = /^0\d{9,10}$|^\d{2,4}-\d{2,4}-\d{4}$/;
  if (!phoneRegex.test(value)) {
    throw new ValidationError(
      `${fieldName}は正しい電話番号形式で入力してください`,
      { field: fieldName, actualValue: value }    );
  }
}

function validatePostalCode_(value: string | null | undefined, fieldName: string): void {
  if (value === null || value === undefined || value === '') return;

  const postalRegex = /^\d{7}$|^\d{3}-\d{4}$/;
  if (!postalRegex.test(value)) {
    throw new ValidationError(
      `${fieldName}は正しい郵便番号形式（例: 120-0034）で入力してください`,
      { field: fieldName, actualValue: value }    );
  }
}

function validateUuid_(value: string | null | undefined, fieldName: string): void {
  if (value === null || value === undefined || value === '') return;

  const prefixedUuidRegex = /^[a-z]{2,4}_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const pureUuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const prefixedShortIdRegex = /^[a-z]{2,4}_[a-z0-9_]+$/i;

  if (!prefixedUuidRegex.test(value) && !pureUuidRegex.test(value) && !prefixedShortIdRegex.test(value)) {
    throw new ValidationError(
      `${fieldName}は正しいID形式ではありません`,
      { field: fieldName, actualValue: value }    );
  }
}

// ============================================
// エンティティバリデーション
// ============================================

function validateJob_(job: Record<string, any>, isNew: boolean = false): void {
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

function validateAssignment_(assignment: Record<string, any>, isNew: boolean = false): void {
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
        { field: 'is_leader', actualValue: assignment.is_leader }      );
    }
  }
}

function validateCustomer_(customer: Record<string, any>, isNew: boolean = false): void {
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
    if (customer.closing_day > 28 && customer.closing_day !== 31) {
      throw new ValidationError('締め日は1〜28日または末日（31）で指定してください');
    }
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

  if (customer.tax_rounding_mode !== undefined) {
    validateEnum_(customer.tax_rounding_mode, '消費税端数処理', TAX_ROUNDING_MODES);
  }

  if (customer.expense_rate !== undefined) {
    validateNumber_(customer.expense_rate, '諸経費率', { min: 0, max: 100 });
  }
}

function validateStaff_(staff: Record<string, any>, isNew: boolean = false): void {
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

  if (staff.staff_type === STAFF_TYPES.SUBCONTRACT && isNew) {
    requireField_(staff.subcontractor_id, '外注先ID');
  }
}

// ============================================
// ステータスラベル
// ============================================

const JOB_STATUS_LABELS: Record<string, string> = {
  'pending': '未配置',
  'assigned': '配置済',
  'hold': '保留',
  'cancelled': 'キャンセル',
  'problem': '問題あり'
};

const TIME_SLOT_LABELS: Record<string, string> = {
  'jotou': '上棟',
  'shuujitsu': '終日',
  'am': 'AM',
  'pm': 'PM',
  'yakin': '夜勤',
  'mitei': '未定'
};

// ============================================
// ステータス関連ユーティリティ
// ============================================
// 注: getJobStatusLabel_, getTimeSlotLabel_, isJobEditable_, isInvoiceEditable_,
// calculateJobStatus_ は status_rules.ts で定義されています（重複解消済み）
