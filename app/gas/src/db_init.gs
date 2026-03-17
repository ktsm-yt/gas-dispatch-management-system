/**
 * Database Initialization Script
 *
 * 15個のテーブル（シート）を自動作成し、ヘッダー行を設定します。
 * 開発・本番環境で分けて実行可能です。
 */

/**
 * テーブル定義
 */
const TABLE_DEFINITIONS = {
  // マスターテーブル
  M_Customers: {
    sheetName: 'Customers',
    headers: [
      // Identity (5)
      'customer_id', 'customer_code', 'company_name', 'branch_name', 'department_name',
      // Contact (7)
      'contact_name', 'honorific', 'postal_code', 'address', 'phone', 'fax', 'email',
      // Pricing (7)
      'unit_price_basic', 'unit_price_tobi', 'unit_price_age', 'unit_price_tobiage',
      'unit_price_half', 'unit_price_fullday', 'unit_price_night', 'unit_price_holiday',
      // Billing Terms (3)
      'closing_day', 'payment_day', 'payment_month_offset',
      // Tax (3)
      'tax_rate', 'tax_rounding_mode', 'expense_rate',
      // Invoice Config (5)
      'invoice_format', 'include_cover_page', 'has_transport_fee',
      'shipper_name', 'invoice_registration_number',
      // System (2)
      'folder_id', 'notes',
      // Audit (8)
      'created_at', 'created_by', 'updated_at', 'updated_by', 'is_active', 'is_deleted',
      'deleted_at', 'deleted_by'
    ]
  },
  M_Staff: {
    sheetName: 'Staff',
    headers: [
      // Identity (4)
      'staff_id', 'name', 'name_kana', 'nickname',
      // Contact (4)
      'phone', 'line_id', 'postal_code', 'address',
      // Employment (5)
      'staff_type', 'subcontractor_id', 'job_title', 'hire_date', 'foreigner_type',
      // Personal (3)
      'birth_date', 'gender', 'blood_type',
      // Emergency Contact (3)
      'emergency_contact_name', 'emergency_contact_address', 'emergency_contact_phone',
      // Skills & Qualifications (7)
      'has_motorbike', 'skills', 'ng_customers',
      'ccus_id', 'special_training', 'skill_training', 'licenses',
      // Compensation (9)
      'daily_rate_basic', 'daily_rate_tobi', 'daily_rate_age', 'daily_rate_tobiage',
      'daily_rate_half', 'daily_rate_fullday', 'daily_rate_night', 'daily_rate_holiday',
      'payment_frequency', 'withholding_tax_applicable',
      // Banking (5)
      'bank_name', 'bank_branch', 'bank_account_type', 'bank_account_number', 'bank_account_name',
      // Insurance & Benefits (6)
      'health_insurance_number', 'pension_type', 'pension_number',
      'employment_insurance_no', 'kensetsu_kyosai', 'chusho_kyosai',
      // Audit (9)
      'notes', 'created_at', 'created_by', 'updated_at', 'updated_by',
      'is_active', 'is_deleted', 'deleted_at', 'deleted_by'
    ]
  },
  M_Subcontractors: {
    sheetName: 'Subcontractors',
    headers: [
      'subcontractor_id', 'company_name', 'contact_name', 'phone', 'notes',
      'invoice_registration_number',
      'basic_rate', 'half_day_rate', 'full_day_rate',
      'night_rate', 'tobi_rate', 'age_rate', 'tobiage_rate', 'holiday_rate',
      'folder_id', 'created_at', 'created_by', 'updated_at', 'updated_by',
      'is_active', 'is_deleted', 'deleted_at', 'deleted_by'
    ]
  },
  M_TransportFee: {
    sheetName: 'TransportFees',
    headers: [
      'area_code', 'area_name', 'default_fee'
    ]
  },
  M_Company: {
    sheetName: 'Company',
    headers: [
      'company_id', 'company_name', 'postal_code', 'address', 'phone', 'fax',
      'invoice_registration_number', 'bank_name', 'bank_branch',
      'bank_account_type', 'bank_account_number', 'bank_account_name',
      'logo_file_id', 'stamp_file_id', 'fiscal_month_end', 'updated_at'
    ]
  },
  // トランザクションテーブル
  T_Jobs: {
    sheetName: 'Jobs',
    headers: [
      // Identity (2)
      'job_id', 'customer_id',
      // Work Location & Schedule (6)
      'site_name', 'site_address', 'work_date', 'time_slot', 'start_time', 'required_count',
      // Work Content (4)
      'work_category', 'work_detail', 'work_detail_other_text', 'pay_unit',
      // Order / Admin (5)
      'supervisor_name', 'order_number', 'branch_office', 'property_code', 'construction_div',
      // Status (4)
      'status', 'is_damaged', 'is_uncollected', 'is_claimed',
      // Adjustment (2) — CR-091: 現場ごとの調整額
      'adjustment_amount', 'adjustment_note',
      // Audit (8)
      'notes', 'created_at', 'created_by', 'updated_at', 'updated_by', 'is_deleted',
      'deleted_at', 'deleted_by'
    ]
  },
  T_JobSlots: {
    sheetName: 'JobSlots',
    headers: [
      'slot_id', 'job_id', 'slot_time_slot', 'slot_pay_unit', 'slot_count',
      'sort_order', 'notes',
      'created_at', 'created_by', 'updated_at', 'updated_by', 'is_deleted',
      'deleted_at', 'deleted_by'
    ]
  },
  T_JobAssignments: {
    sheetName: 'Assignments',
    headers: [
      // Identity / FK (7)
      'assignment_id', 'job_id', 'staff_id', 'subcontractor_id', 'slot_id', 'worker_type', 'payout_id',
      // Schedule (1)
      'display_time_slot',
      // Pricing (4)
      'pay_unit', 'invoice_unit', 'wage_rate', 'invoice_rate',
      // Transport (6)
      'transport_area', 'transport_amount', 'transport_is_manual', 'transport_station', 'transport_has_bus',
      'staff_transport',
      // Role (3)
      'site_role', 'assignment_role', 'is_leader',
      // Compliance (2)
      'entry_date', 'safety_training_date',
      // Status (1)
      'status',
      // Audit (8)
      'notes', 'created_at', 'created_by',
      'updated_at', 'updated_by', 'is_deleted', 'deleted_at', 'deleted_by'
    ]
  },
  T_Invoices: {
    sheetName: 'Invoices',
    headers: [
      'invoice_id', 'invoice_number', 'customer_id', 'billing_year', 'billing_month',
      'issue_date', 'due_date', 'subtotal', 'expense_amount', 'tax_amount',
      'total_amount', 'adjustment_total', 'invoice_format', 'shipper_name', 'pdf_file_id',
      'excel_file_id', 'sheet_file_id', 'status', 'has_assignment_changes', 'notes', 'created_at',
      'created_by', 'updated_at', 'updated_by', 'is_deleted', 'deleted_at', 'deleted_by'
    ]
  },
  T_InvoiceLines: {
    sheetName: 'InvoiceLines',
    headers: [
      'line_id', 'invoice_id', 'line_number', 'work_date', 'job_id',
      'assignment_id', 'site_name', 'item_name', 'time_note', 'quantity', 'unit',
      'unit_price', 'amount', 'order_number', 'branch_office', 'construction_div',
      'supervisor_name', 'property_code', 'tax_amount', 'created_at', 'created_by',
      'updated_at', 'updated_by', 'is_deleted', 'deleted_at', 'deleted_by'
    ]
  },
  T_Payouts: {
    sheetName: 'Payouts',
    headers: [
      'payout_id', 'payout_type', 'staff_id', 'subcontractor_id',
      'period_start', 'period_end', 'assignment_count',  // P2-3: 差分支払い方式
      'base_amount', 'transport_amount', 'adjustment_amount',
      'ninku_coefficient', 'ninku_adjustment_amount',  // migrate_ninku_columns.gs から正式定義に昇格
      'tax_amount', 'total_amount', 'status', 'paid_date', 'notes', 'created_at',
      'created_by', 'updated_at', 'updated_by', 'is_deleted', 'deleted_at', 'deleted_by'
    ]
  },
  T_AuditLog: {
    sheetName: 'AuditLog',
    headers: [
      'log_id', 'timestamp', 'user_email', 'action', 'table_name', 'record_id',
      'before_data', 'after_data'
    ]
  },
  // P3: 入金記録テーブル（売掛管理用）
  T_Payments: {
    sheetName: 'Payments',
    headers: [
      'payment_id', 'invoice_id', 'payment_date', 'amount', 'payment_method',
      'bank_ref', 'notes', 'is_deleted', 'created_at', 'created_by',
      'deleted_at', 'deleted_by'
    ]
  },
  // 調整項目テーブル（請求書の金額調整用）
  T_InvoiceAdjustments: {
    sheetName: 'InvoiceAdjustments',
    headers: [
      'adjustment_id', 'invoice_id', 'item_name', 'amount',
      'sort_order', 'notes',
      'created_at', 'created_by', 'updated_at', 'updated_by',
      'is_deleted', 'deleted_at', 'deleted_by'
    ]
  },
  // P2-6: 月次統計テーブル（売上分析ダッシュボード用）
  T_MonthlyStats: {
    sheetName: 'MonthlyStats',
    headers: [
      'stat_id', 'year', 'month',
      // 案件・配置
      'job_count', 'assignment_count',
      // 売上内訳
      'work_amount', 'expense_amount', 'adjustment_total', 'invoice_subtotal', 'invoice_tax', 'invoice_total',
      // 費用
      'payout_total', 'transport_total',
      // 利益
      'gross_margin', 'margin_rate',
      // メタデータ
      'is_final', 'created_at', 'updated_at'
    ]
  },
  M_WorkDetails: {
    sheetName: 'WorkDetails',
    headers: [
      'work_detail_id', 'value', 'label', 'sort_order',
      'is_active', 'is_protected',
      'created_at', 'created_by', 'updated_at', 'updated_by',
      'is_deleted', 'deleted_at', 'deleted_by'
    ]
  },
  M_PriceTypes: {
    sheetName: 'PriceTypes',
    headers: [
      'price_type_id', 'code', 'label', 'sort_order',
      'is_system', 'is_active',
      'created_at', 'updated_at'
    ]
  },
  M_CustomPrices: {
    sheetName: 'CustomPrices',
    headers: [
      'custom_price_id', 'entity_type', 'entity_id', 'price_type_code',
      'amount',
      'created_at', 'updated_at'
    ]
  }
};

/**
 * 開発環境向け DB Spreadsheet を作成
 */
function createDevDatabase() {
  createDatabase('dev');
}

/**
 * 本番環境向け DB Spreadsheet を作成
 */
function createProdDatabase() {
  createDatabase('prod');
}

/**
 * DB Spreadsheet の作成（メイン処理）
 * @param {string} env - 環境（'dev' または 'prod'）
 */
function createDatabase(env = 'dev') {
  try {
    Logger.log(`${env} 環境の DB を作成中...`);

    // Spreadsheet の作成
    const ss = SpreadsheetApp.create(`gas-dispatch-db-${env}`);
    const spreadsheetId = ss.getId();
    Logger.log(`✓ Spreadsheet 作成: ${spreadsheetId}`);

    // 各テーブルのシートを作成
    for (const [tableName, definition] of Object.entries(TABLE_DEFINITIONS)) {
      createSheet(ss, tableName, definition);
      Logger.log(`✓ シート作成: ${definition.sheetName}`);
    }

    // デフォルトシート（Sheet1/シート1）を削除
    const sheets = ss.getSheets();
    for (const sheet of sheets) {
      const name = sheet.getName();
      if (name === 'Sheet1' || name === 'シート1') {
        ss.deleteSheet(sheet);
        Logger.log(`✓ デフォルトシート削除: ${name}`);
        break;
      }
    }

    // ScriptProperties に ID を登録
    const prop = PropertiesService.getScriptProperties();
    if (env === 'prod') {
      prop.setProperty('SPREADSHEET_ID_PROD', spreadsheetId);
    } else {
      prop.setProperty('SPREADSHEET_ID_DEV', spreadsheetId);
    }
    prop.setProperty('ENV', env);

    Logger.log(`✓ ScriptProperties に登録完了`);
    Logger.log(`\n=== DB 作成完了 ===`);
    Logger.log(`Environment: ${env}`);
    Logger.log(`Spreadsheet ID: ${spreadsheetId}`);
    Logger.log(`URL: https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`);

  } catch (error) {
    Logger.log(`✗ エラーが発生しました: ${error.message}`);
  }
}

/**
 * シートを作成し、ヘッダー行を設定
 * @param {SpreadsheetApp.Spreadsheet} ss - Spreadsheet オブジェクト
 * @param {string} tableName - テーブル名
 * @param {Object} definition - テーブル定義
 */
function createSheet(ss, tableName, definition) {
  // シートを作成
  const sheet = ss.insertSheet(definition.sheetName);

  // ヘッダー行を設定
  const headers = definition.headers;
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setValues([headers]);

  // ヘッダー行のスタイル（背景色）
  headerRange.setBackground('#E8F4F8');
  headerRange.setFontWeight('bold');

  // 列幅の自動調整（簡易版）
  for (let i = 1; i <= headers.length; i++) {
    sheet.autoResizeColumn(i);
  }

  // フリーズペイン（ヘッダー行を固定）
  sheet.setFrozenRows(1);
}


/**
 * M_PriceTypes / M_CustomPrices テーブルのマイグレーション（冪等）
 * GASエディタから実行: migratePriceTypeTables_()
 *
 * - シートが無ければ作成 + ヘッダー設定
 * - シートが既に存在していれば欠落ヘッダーのみ補完
 * - M_PriceTypes に初期8種（is_system=true）をseed（重複スキップ）
 */
function migratePriceTypeTables_() {
  const ss = SpreadsheetApp.openById(getSpreadsheetId());
  const now = new Date().toISOString();

  // --- M_PriceTypes ---
  const ptDef = TABLE_DEFINITIONS.M_PriceTypes;
  let ptSheet = ss.getSheetByName(ptDef.sheetName);
  if (!ptSheet) {
    ptSheet = ss.insertSheet(ptDef.sheetName);
    ptSheet.getRange(1, 1, 1, ptDef.headers.length).setValues([ptDef.headers]);
    ptSheet.getRange(1, 1, 1, ptDef.headers.length).setBackground('#E8F4F8').setFontWeight('bold');
    ptSheet.setFrozenRows(1);
    Logger.log('✓ PriceTypes シート作成');
  } else {
    // ヘッダー補完
    const existing = ptSheet.getRange(1, 1, 1, ptSheet.getLastColumn()).getValues()[0];
    for (const h of ptDef.headers) {
      if (!existing.includes(h)) {
        const col = existing.length + 1;
        ptSheet.getRange(1, col).setValue(h);
        existing.push(h);
        Logger.log('✓ PriceTypes ヘッダー補完: ' + h);
      }
    }
  }

  // 初期seed（is_system=true の8種）
  const SEED_PRICE_TYPES = [
    { code: 'basic',    label: '基本',        sort_order: 1 },
    { code: 'halfday',  label: 'ハーフ',      sort_order: 2 },
    { code: 'fullday',  label: '終日',        sort_order: 3 },
    { code: 'night',    label: '夜勤',        sort_order: 4 },
    { code: 'tobi',     label: '上棟鳶',      sort_order: 5 },
    { code: 'age',      label: '上棟荷揚げ',  sort_order: 6 },
    { code: 'tobiage',  label: '上棟鳶揚げ',  sort_order: 7 },
    { code: 'holiday',  label: '休日',        sort_order: 8 }
  ];

  // 既存codeを取得（重複チェック用）
  const ptHeaders = ptSheet.getRange(1, 1, 1, ptSheet.getLastColumn()).getValues()[0];
  const codeCol = ptHeaders.indexOf('code');
  const existingCodes = new Set();
  if (ptSheet.getLastRow() > 1) {
    const data = ptSheet.getRange(2, codeCol + 1, ptSheet.getLastRow() - 1, 1).getValues();
    data.forEach(row => { if (row[0]) existingCodes.add(String(row[0])); });
  }

  const newRows = [];
  for (const seed of SEED_PRICE_TYPES) {
    if (existingCodes.has(seed.code)) continue;
    const row = ptDef.headers.map(h => {
      switch (h) {
        case 'price_type_id': return Utilities.getUuid();
        case 'code':          return seed.code;
        case 'label':         return seed.label;
        case 'sort_order':    return seed.sort_order;
        case 'is_system':     return true;
        case 'is_active':     return true;
        case 'created_at':    return now;
        case 'updated_at':    return now;
        default:              return '';
      }
    });
    newRows.push(row);
  }
  if (newRows.length > 0) {
    ptSheet.getRange(ptSheet.getLastRow() + 1, 1, newRows.length, ptDef.headers.length).setValues(newRows);
    Logger.log('✓ PriceTypes seed挿入: ' + newRows.length + '件');
  } else {
    Logger.log('✓ PriceTypes seed: 既に全件存在');
  }

  // --- M_CustomPrices ---
  const cpDef = TABLE_DEFINITIONS.M_CustomPrices;
  let cpSheet = ss.getSheetByName(cpDef.sheetName);
  if (!cpSheet) {
    cpSheet = ss.insertSheet(cpDef.sheetName);
    cpSheet.getRange(1, 1, 1, cpDef.headers.length).setValues([cpDef.headers]);
    cpSheet.getRange(1, 1, 1, cpDef.headers.length).setBackground('#E8F4F8').setFontWeight('bold');
    cpSheet.setFrozenRows(1);
    Logger.log('✓ CustomPrices シート作成');
  } else {
    const existing = cpSheet.getRange(1, 1, 1, cpSheet.getLastColumn()).getValues()[0];
    for (const h of cpDef.headers) {
      if (!existing.includes(h)) {
        const col = existing.length + 1;
        cpSheet.getRange(1, col).setValue(h);
        existing.push(h);
        Logger.log('✓ CustomPrices ヘッダー補完: ' + h);
      }
    }
  }

  Logger.log('=== M_PriceTypes / M_CustomPrices マイグレーション完了 ===');
}
