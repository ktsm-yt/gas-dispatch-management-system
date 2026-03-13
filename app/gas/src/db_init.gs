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
      // Transport (5)
      'transport_area', 'transport_amount', 'transport_is_manual', 'transport_station', 'transport_has_bus',
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
 * 顧客テーブルに include_cover_page カラムを追加（マイグレーション）
 * GASエディタから実行: addIncludeCoverPageColumn()
 */
function addIncludeCoverPageColumn() {
  const ss = SpreadsheetApp.openById(getSpreadsheetId());
  const sheet = ss.getSheetByName('Customers');

  if (!sheet) {
    Logger.log('✗ 顧客シートが見つかりません');
    return;
  }

  // 現在のヘッダーを取得
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  // include_cover_page が既に存在するかチェック
  if (headers.includes('include_cover_page')) {
    Logger.log('✓ include_cover_page カラムは既に存在します');
    return;
  }

  // invoice_format の位置を探す（その直後に挿入）
  const invoiceFormatIndex = headers.indexOf('invoice_format');
  if (invoiceFormatIndex === -1) {
    Logger.log('✗ invoice_format カラムが見つかりません');
    return;
  }

  // invoice_format の次の列に挿入
  const insertIndex = invoiceFormatIndex + 2; // 1-based, invoice_format の次
  sheet.insertColumnAfter(invoiceFormatIndex + 1);
  sheet.getRange(1, insertIndex).setValue('include_cover_page');

  Logger.log(`✓ include_cover_page カラムを列 ${insertIndex} に追加しました`);
  Logger.log('顧客設定で「頭紙を付ける」を有効にするには、該当行に TRUE を設定してください');
}

/**
 * Jobsテーブルに work_detail_other_text カラムを追加（マイグレーション）
 * GASエディタから実行: migrateAddWorkDetailOtherTextColumn()
 */
function migrateAddWorkDetailOtherTextColumn() {
  const ss = SpreadsheetApp.openById(getSpreadsheetId());
  const sheet = ss.getSheetByName('Jobs');

  if (!sheet) {
    Logger.log('✗ Jobsシートが見つかりません');
    return;
  }

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  if (headers.includes('work_detail_other_text')) {
    Logger.log('✓ work_detail_other_text カラムは既に存在します');
    return;
  }

  const workDetailIndex = headers.indexOf('work_detail');
  if (workDetailIndex === -1) {
    Logger.log('✗ work_detail カラムが見つかりません');
    return;
  }

  // work_detail の次の列に挿入
  const insertIndex = workDetailIndex + 2; // 1-based
  sheet.insertColumnAfter(workDetailIndex + 1);
  sheet.getRange(1, insertIndex).setValue('work_detail_other_text');

  Logger.log('✓ work_detail_other_text カラムを列 ' + insertIndex + ' に追加しました');
}

/**
 * invoice_format='atamagami' の顧客を format1 + include_cover_page=true に移行
 * GASエディタから実行: migrateAtagamiToFormat1()
 *
 * 移行内容:
 *   - invoice_format: 'atamagami' → 'format1'
 *   - include_cover_page: false → true
 */
function migrateAtagamiToFormat1() {
  const ss = SpreadsheetApp.openById(getSpreadsheetId());
  const sheet = ss.getSheetByName('Customers');

  if (!sheet) {
    Logger.log('✗ 顧客シートが見つかりません');
    return;
  }

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const invoiceFormatCol = headers.indexOf('invoice_format') + 1;
  const includeCoverCol = headers.indexOf('include_cover_page') + 1;
  const companyNameCol = headers.indexOf('company_name') + 1;

  if (invoiceFormatCol === 0) {
    Logger.log('✗ invoice_format カラムが見つかりません');
    return;
  }
  if (includeCoverCol === 0) {
    Logger.log('✗ include_cover_page カラムが見つかりません。先に addIncludeCoverPageColumn() を実行してください');
    return;
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    Logger.log('✓ 顧客データがありません');
    return;
  }

  // 全データを取得
  const data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  let migratedCount = 0;

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const invoiceFormat = row[invoiceFormatCol - 1];

    if (invoiceFormat === 'atamagami') {
      const rowNum = i + 2;
      const companyName = row[companyNameCol - 1] || `行${rowNum}`;

      // format1 に更新
      sheet.getRange(rowNum, invoiceFormatCol).setValue('format1');
      // include_cover_page を true に
      sheet.getRange(rowNum, includeCoverCol).setValue(true);

      Logger.log(`✓ 移行: ${companyName} (行${rowNum}): atamagami → format1 + 頭紙あり`);
      migratedCount++;
    }
  }

  Logger.log(`\n=== 移行完了 ===`);
  Logger.log(`移行した顧客数: ${migratedCount}`);

  if (migratedCount === 0) {
    Logger.log('atamagami形式の顧客は見つかりませんでした');
  }
}

/**
 * M_Companyシートに fiscal_month_end カラムを追加（マイグレーション）
 * GASエディタから実行: migrateAddFiscalMonthEndColumn()
 */
function migrateAddFiscalMonthEndColumn() {
  const ss = SpreadsheetApp.openById(getSpreadsheetId());
  const sheet = ss.getSheetByName('Company');

  if (!sheet) {
    Logger.log('✗ Companyシートが見つかりません');
    return;
  }

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  if (headers.includes('fiscal_month_end')) {
    Logger.log('✓ fiscal_month_end カラムは既に存在します');
    return;
  }

  // stamp_file_id の位置を探す（その直後に挿入）
  const stampIndex = headers.indexOf('stamp_file_id');
  if (stampIndex === -1) {
    Logger.log('✗ stamp_file_id カラムが見つかりません');
    return;
  }

  const insertIndex = stampIndex + 2; // 1-based, stamp_file_id の次
  sheet.insertColumnAfter(stampIndex + 1);
  sheet.getRange(1, insertIndex).setValue('fiscal_month_end');

  Logger.log('✓ fiscal_month_end カラムを列 ' + insertIndex + ' に追加しました');
  Logger.log('決算月を設定するには、会社情報画面から変更してください（デフォルト: 2月決算）');
}

/**
 * M_Staffシートに daily_rate_fullday カラムを追加（マイグレーション）
 * GASエディタから実行: migrateAddDailyRateFulldayColumn()
 */
function migrateAddDailyRateFulldayColumn() {
  const ss = SpreadsheetApp.openById(getSpreadsheetId());
  const sheet = ss.getSheetByName('Staff');

  if (!sheet) {
    Logger.log('✗ Staffシートが見つかりません');
    return;
  }

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  if (headers.includes('daily_rate_fullday')) {
    Logger.log('✓ daily_rate_fullday カラムは既に存在します');
    return;
  }

  const halfIndex = headers.indexOf('daily_rate_half');
  if (halfIndex === -1) {
    Logger.log('✗ daily_rate_half カラムが見つかりません');
    return;
  }

  const insertIndex = halfIndex + 2; // 1-based, daily_rate_half の次
  sheet.insertColumnAfter(halfIndex + 1);
  sheet.getRange(1, insertIndex).setValue('daily_rate_fullday');

  Logger.log('✓ daily_rate_fullday カラムを列 ' + insertIndex + ' に追加しました');
}

/**
 * 既存の DB Spreadsheet をリセット（開発用）
 * ※本番環境では使用厳禁
 */
function resetDevDatabase() {
  Logger.log('開発用 DB をリセット中...');

  try {
    const prop = PropertiesService.getScriptProperties();
    const spreadsheetId = prop.getProperty('SPREADSHEET_ID_DEV');

    if (!spreadsheetId) {
      throw new Error('SPREADSHEET_ID_DEV が設定されていません');
    }

    const ss = SpreadsheetApp.openById(spreadsheetId);

    // 既存のシート名を取得
    const existingSheets = ss.getSheets().map(s => s.getName());
    Logger.log(`既存シート: ${existingSheets.join(', ')}`);

    // 新しいシートを作成
    for (const [tableName, definition] of Object.entries(TABLE_DEFINITIONS)) {
      // 同名のシートが存在する場合は削除してから作成
      const existingSheet = ss.getSheetByName(definition.sheetName);
      if (existingSheet) {
        // 一時シートを作成（最後のシート削除防止）
        let tempSheet = ss.getSheetByName('_temp_');
        if (!tempSheet) {
          tempSheet = ss.insertSheet('_temp_');
        }
        ss.deleteSheet(existingSheet);
      }
      createSheet(ss, tableName, definition);
      Logger.log(`✓ ${definition.sheetName} を作成`);
    }

    // 一時シートを削除
    const tempSheet = ss.getSheetByName('_temp_');
    if (tempSheet) {
      ss.deleteSheet(tempSheet);
    }

    // 不要なシートを削除（TABLE_DEFINITIONS に含まれないシート）
    const validSheetNames = Object.values(TABLE_DEFINITIONS).map(d => d.sheetName);
    const allSheets = ss.getSheets();
    for (const sheet of allSheets) {
      if (!validSheetNames.includes(sheet.getName())) {
        ss.deleteSheet(sheet);
        Logger.log(`✓ 不要シート削除: ${sheet.getName()}`);
      }
    }

    Logger.log('\n✓ 開発用 DB をリセットしました');

  } catch (error) {
    Logger.log(`✗ エラー: ${error.message}`);
  }
}

/**
 * 既存のDBにT_Jobsシートを追加
 * P1-2で作成したDBにP1-3の案件シートを追加する
 */
function addJobsSheetToExistingDb() {
  const prop = PropertiesService.getScriptProperties();
  const spreadsheetId = prop.getProperty('SPREADSHEET_ID_DEV');

  if (!spreadsheetId) {
    throw new Error('SPREADSHEET_ID_DEV が設定されていません');
  }

  Logger.log(`対象DB: ${spreadsheetId}`);

  const ss = SpreadsheetApp.openById(spreadsheetId);

  // 案件シートが既にあるか確認
  const existingSheet = ss.getSheetByName('Jobs');
  if (existingSheet) {
    Logger.log('Jobs シートは既に存在します');
    return;
  }

  // T_Jobsの定義
  const jobsHeaders = [
    'job_id', 'customer_id', 'site_name', 'site_address', 'work_date',
    'time_slot', 'start_time', 'required_count',
    'pay_unit', 'work_category', 'work_detail', 'work_detail_other_text',
    'supervisor_name', 'order_number', 'branch_office', 'property_code', 'construction_div',
    'status', 'is_damaged', 'is_uncollected', 'is_claimed',
    'notes', 'created_at', 'updated_at', 'is_deleted'
  ];

  const sheet = ss.insertSheet('Jobs');
  sheet.getRange(1, 1, 1, jobsHeaders.length).setValues([jobsHeaders]);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, jobsHeaders.length).setFontWeight('bold');

  Logger.log('✓ Jobs シートを追加しました');
}

/**
 * 既存DBに切り替え（データが入っている方を使う）
 */
function switchToExistingDb() {
  const existingDbId = '1_YwkMQOnxS8zX2Zyl5AydXtSpG3zGIL0B9JRXVDiViI';

  // ScriptPropertiesを更新
  const prop = PropertiesService.getScriptProperties();
  const oldId = prop.getProperty('SPREADSHEET_ID_DEV');
  prop.setProperty('SPREADSHEET_ID_DEV', existingDbId);

  Logger.log(`SPREADSHEET_ID_DEV を更新しました`);
  Logger.log(`  旧: ${oldId}`);
  Logger.log(`  新: ${existingDbId}`);

  // 案件シートを追加
  addJobsSheetToExistingDb();

  Logger.log('\n=== 完了 ===');
  Logger.log('既存DBに切り替えました。insertTestData() でテストデータを投入してください。');
}

/**
 * 既存の配置シートにassignment_roleとis_leaderカラムを追加
 * GASエディタから実行: migrateAddAssignmentRoleColumns()
 */
function migrateAddAssignmentRoleColumns() {
  const prop = PropertiesService.getScriptProperties();
  const spreadsheetId = prop.getProperty('SPREADSHEET_ID_DEV') || prop.getProperty('SPREADSHEET_ID_PROD');

  if (!spreadsheetId) {
    Logger.log('✗ SPREADSHEET_ID が設定されていません');
    return;
  }

  const ss = SpreadsheetApp.openById(spreadsheetId);
  const sheet = ss.getSheetByName('Assignments');

  if (!sheet) {
    Logger.log('✗ 配置シートが見つかりません');
    return;
  }

  // 現在のヘッダーを取得
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

  Logger.log(`現在のカラム数: ${lastCol}`);
  Logger.log(`現在のヘッダー: ${headers.join(', ')}`);

  // 追加するカラム
  const newColumns = ['assignment_role', 'is_leader'];
  const columnsToAdd = newColumns.filter(col => !headers.includes(col));

  if (columnsToAdd.length === 0) {
    Logger.log('✓ 全てのカラムが既に存在します');
    return;
  }

  // site_roleの後に挿入（site_roleの位置を見つける）
  const siteRoleIndex = headers.indexOf('site_role');
  if (siteRoleIndex === -1) {
    Logger.log('✗ site_roleカラムが見つかりません。手動で追加してください。');
    return;
  }

  // 挿入位置（site_roleの次）
  const insertPosition = siteRoleIndex + 2; // 1-indexed

  // カラムを挿入
  for (let i = 0; i < columnsToAdd.length; i++) {
    sheet.insertColumnAfter(insertPosition + i - 1);
    sheet.getRange(1, insertPosition + i).setValue(columnsToAdd[i]);
    Logger.log(`✓ カラム追加: ${columnsToAdd[i]} (位置: ${insertPosition + i})`);
  }

  // ヘッダー行のスタイルを適用
  const newLastCol = sheet.getLastColumn();
  sheet.getRange(1, 1, 1, newLastCol).setBackground('#E8F4F8').setFontWeight('bold');

  Logger.log('\n=== マイグレーション完了 ===');
  Logger.log(`追加したカラム: ${columnsToAdd.join(', ')}`);
}

/**
 * 既存の配置シートにpayout_idカラムを追加（二重計上防止用）
 * GASエディタから実行: migrateAddPayoutIdColumn()
 */
function migrateAddPayoutIdColumn() {
  const prop = PropertiesService.getScriptProperties();
  const spreadsheetId = prop.getProperty('SPREADSHEET_ID_DEV') || prop.getProperty('SPREADSHEET_ID_PROD');

  if (!spreadsheetId) {
    Logger.log('✗ SPREADSHEET_ID が設定されていません');
    return;
  }

  const ss = SpreadsheetApp.openById(spreadsheetId);
  const sheet = ss.getSheetByName('Assignments');

  if (!sheet) {
    Logger.log('✗ 配置シートが見つかりません');
    return;
  }

  // 現在のヘッダーを取得
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

  Logger.log(`現在のカラム数: ${lastCol}`);
  Logger.log(`現在のヘッダー: ${headers.join(', ')}`);

  // payout_idが既に存在するか確認
  if (headers.includes('payout_id')) {
    Logger.log('✓ payout_idカラムは既に存在します');
    return;
  }

  // statusの後に挿入（statusの位置を見つける）
  const statusIndex = headers.indexOf('status');
  if (statusIndex === -1) {
    Logger.log('✗ statusカラムが見つかりません。手動で追加してください。');
    return;
  }

  // 挿入位置（statusの次）
  const insertPosition = statusIndex + 2; // 1-indexed

  // カラムを挿入
  sheet.insertColumnAfter(insertPosition - 1);
  sheet.getRange(1, insertPosition).setValue('payout_id');
  Logger.log(`✓ カラム追加: payout_id (位置: ${insertPosition})`);

  // ヘッダー行のスタイルを適用
  const newLastCol = sheet.getLastColumn();
  sheet.getRange(1, 1, 1, newLastCol).setBackground('#E8F4F8').setFontWeight('bold');

  Logger.log('\n=== マイグレーション完了 ===');
  Logger.log('payout_idカラムを追加しました（二重計上防止用）');
}

/**
 * 枠システム用マイグレーション: T_JobSlotsシートを追加
 * GASエディタから実行: migrateAddJobSlotsSheet()
 */
function migrateAddJobSlotsSheet() {
  const prop = PropertiesService.getScriptProperties();
  const spreadsheetId = prop.getProperty('SPREADSHEET_ID_DEV') || prop.getProperty('SPREADSHEET_ID_PROD');

  if (!spreadsheetId) {
    Logger.log('✗ SPREADSHEET_ID が設定されていません');
    return;
  }

  const ss = SpreadsheetApp.openById(spreadsheetId);

  // 案件枠シートが既にあるか確認
  const existingSheet = ss.getSheetByName('JobSlots');
  if (existingSheet) {
    Logger.log('✓ 案件枠シートは既に存在します');
    return;
  }

  // T_JobSlotsの定義
  const definition = TABLE_DEFINITIONS.T_JobSlots;
  createSheet(ss, 'T_JobSlots', definition);

  Logger.log('\n=== マイグレーション完了 ===');
  Logger.log('✓ 案件枠シートを追加しました');
}

/**
 * 枠システム用マイグレーション: 配置シートにslot_idカラムを追加
 * GASエディタから実行: migrateAddSlotIdColumn()
 */
function migrateAddSlotIdColumn() {
  const prop = PropertiesService.getScriptProperties();
  const spreadsheetId = prop.getProperty('SPREADSHEET_ID_DEV') || prop.getProperty('SPREADSHEET_ID_PROD');

  if (!spreadsheetId) {
    Logger.log('✗ SPREADSHEET_ID が設定されていません');
    return;
  }

  const ss = SpreadsheetApp.openById(spreadsheetId);
  const sheet = ss.getSheetByName('Assignments');

  if (!sheet) {
    Logger.log('✗ 配置シートが見つかりません');
    return;
  }

  // 現在のヘッダーを取得
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

  Logger.log(`現在のカラム数: ${lastCol}`);
  Logger.log(`現在のヘッダー: ${headers.join(', ')}`);

  // slot_idが既に存在するか確認
  if (headers.includes('slot_id')) {
    Logger.log('✓ slot_idカラムは既に存在します');
    return;
  }

  // subcontractor_idの後に挿入（subcontractor_idの位置を見つける）
  const subcontractorIdIndex = headers.indexOf('subcontractor_id');
  if (subcontractorIdIndex === -1) {
    Logger.log('✗ subcontractor_idカラムが見つかりません。手動で追加してください。');
    return;
  }

  // 挿入位置（subcontractor_idの次）
  const insertPosition = subcontractorIdIndex + 2; // 1-indexed

  // カラムを挿入
  sheet.insertColumnAfter(insertPosition - 1);
  sheet.getRange(1, insertPosition).setValue('slot_id');
  Logger.log(`✓ カラム追加: slot_id (位置: ${insertPosition})`);

  // ヘッダー行のスタイルを適用
  const newLastCol = sheet.getLastColumn();
  sheet.getRange(1, 1, 1, newLastCol).setBackground('#E8F4F8').setFontWeight('bold');

  Logger.log('\n=== マイグレーション完了 ===');
  Logger.log('slot_idカラムを追加しました（枠システム用）');
}

/**
 * 枠システム用マイグレーション: 全てのマイグレーションを実行
 * GASエディタから実行: migrateSlotSystem()
 */
function migrateSlotSystem() {
  Logger.log('=== 枠システムマイグレーション開始 ===\n');

  Logger.log('--- Step 1: T_JobSlotsシート追加 ---');
  migrateAddJobSlotsSheet();

  Logger.log('\n--- Step 2: slot_idカラム追加 ---');
  migrateAddSlotIdColumn();

  Logger.log('\n=== 枠システムマイグレーション完了 ===');
}

/**
 * M_Staff列追加マイグレーション
 * - emergency_contact → emergency_contact_name, emergency_contact_address, emergency_contact_phone
 * - pension_number 追加
 * GASエディタから実行: migrateStaffEmergencyContactColumns()
 */
function migrateStaffEmergencyContactColumns() {
  const prop = PropertiesService.getScriptProperties();
  const spreadsheetId = prop.getProperty('SPREADSHEET_ID_DEV') || prop.getProperty('SPREADSHEET_ID_PROD');

  if (!spreadsheetId) {
    Logger.log('✗ SPREADSHEET_ID が設定されていません');
    return;
  }

  const ss = SpreadsheetApp.openById(spreadsheetId);
  const sheet = ss.getSheetByName('Staff');

  if (!sheet) {
    Logger.log('ERROR: スタッフシートが見つかりません');
    return;
  }

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  Logger.log('現在のヘッダー: ' + headers.join(', '));

  // emergency_contact の位置を探す
  const ecIndex = headers.indexOf('emergency_contact');

  if (ecIndex === -1) {
    Logger.log('emergency_contact列が見つかりません。すでにマイグレーション済みかもしれません。');

    // 新しい列があるか確認
    if (headers.indexOf('emergency_contact_name') !== -1) {
      Logger.log('新しい列はすでに存在します。');
    }
    return;
  }

  Logger.log('emergency_contact列を発見: 列 ' + (ecIndex + 1));

  // 1. emergency_contact を emergency_contact_name に変更
  sheet.getRange(1, ecIndex + 1).setValue('emergency_contact_name');

  // 2. emergency_contact_address を挿入
  sheet.insertColumnAfter(ecIndex + 1);
  sheet.getRange(1, ecIndex + 2).setValue('emergency_contact_address');

  // 3. emergency_contact_phone を挿入
  sheet.insertColumnAfter(ecIndex + 2);
  sheet.getRange(1, ecIndex + 3).setValue('emergency_contact_phone');

  Logger.log('緊急連絡先列を3分割しました');

  // 4. pension_number を pension_type の後に追加
  const updatedHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const ptIndex = updatedHeaders.indexOf('pension_type');

  if (ptIndex !== -1 && updatedHeaders.indexOf('pension_number') === -1) {
    sheet.insertColumnAfter(ptIndex + 1);
    sheet.getRange(1, ptIndex + 2).setValue('pension_number');
    Logger.log('pension_number列を追加しました');
  }

  Logger.log('=== マイグレーション完了 ===');
}

/**
 * 論理削除カラム追加マイグレーション
 * 全テーブルに deleted_at, deleted_by カラムを追加
 * GASエディタから実行: migrateAddDeletedAtColumns()
 */
function migrateAddDeletedAtColumns() {
  const prop = PropertiesService.getScriptProperties();
  const spreadsheetId = prop.getProperty('SPREADSHEET_ID_DEV') || prop.getProperty('SPREADSHEET_ID_PROD');

  if (!spreadsheetId) {
    Logger.log('✗ SPREADSHEET_ID が設定されていません');
    return;
  }

  const ss = SpreadsheetApp.openById(spreadsheetId);

  // 対象シートと日本語名のマッピング
  const sheetsToMigrate = [
    { name: 'Customers', tableName: 'M_Customers' },
    { name: 'Staff', tableName: 'M_Staff' },
    { name: 'Subcontractors', tableName: 'M_Subcontractors' },
    { name: 'Jobs', tableName: 'T_Jobs' },
    { name: 'JobSlots', tableName: 'T_JobSlots' },
    { name: 'Assignments', tableName: 'T_JobAssignments' },
    { name: 'Invoices', tableName: 'T_Invoices' },
    { name: 'InvoiceLines', tableName: 'T_InvoiceLines' },
    { name: 'Payouts', tableName: 'T_Payouts' }
  ];

  Logger.log('=== deleted_at/deleted_by カラム追加マイグレーション ===\n');

  for (const sheetInfo of sheetsToMigrate) {
    const sheet = ss.getSheetByName(sheetInfo.name);

    if (!sheet) {
      Logger.log(`✗ ${sheetInfo.name} シートが見つかりません`);
      continue;
    }

    const lastCol = sheet.getLastColumn();
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

    // is_deleted の位置を探す
    const isDeletedIndex = headers.indexOf('is_deleted');
    if (isDeletedIndex === -1) {
      Logger.log(`✗ ${sheetInfo.name}: is_deleted カラムが見つかりません`);
      continue;
    }

    // deleted_at が既に存在するかチェック
    if (headers.includes('deleted_at')) {
      Logger.log(`✓ ${sheetInfo.name}: deleted_at/deleted_by は既に存在します`);
      continue;
    }

    // is_deleted の後に deleted_at, deleted_by を挿入
    const insertPosition = isDeletedIndex + 2; // 1-indexed

    // deleted_by を挿入
    sheet.insertColumnAfter(isDeletedIndex + 1);
    sheet.getRange(1, insertPosition).setValue('deleted_at');

    // deleted_by を挿入
    sheet.insertColumnAfter(insertPosition);
    sheet.getRange(1, insertPosition + 1).setValue('deleted_by');

    // ヘッダー行のスタイルを適用
    const newLastCol = sheet.getLastColumn();
    sheet.getRange(1, 1, 1, newLastCol).setBackground('#E8F4F8').setFontWeight('bold');

    Logger.log(`✓ ${sheetInfo.name}: deleted_at, deleted_by カラムを追加しました`);
  }

  Logger.log('\n=== マイグレーション完了 ===');
  Logger.log('deleted_at: 削除日時を記録（復元しても履歴が残る）');
  Logger.log('deleted_by: 削除者を記録');
}

/**
 * P2-6: T_MonthlyStats シートを追加（売上分析ダッシュボード用）
 * GASエディタから実行: migrateAddMonthlyStatsSheet()
 */
function migrateAddMonthlyStatsSheet() {
  const prop = PropertiesService.getScriptProperties();
  const spreadsheetId = prop.getProperty('SPREADSHEET_ID_DEV') || prop.getProperty('SPREADSHEET_ID_PROD');

  if (!spreadsheetId) {
    Logger.log('✗ SPREADSHEET_ID が設定されていません');
    return;
  }

  const ss = SpreadsheetApp.openById(spreadsheetId);

  // 月次統計シートが既にあるか確認
  const existingSheet = ss.getSheetByName('MonthlyStats');
  if (existingSheet) {
    Logger.log('✓ 月次統計シートは既に存在します');
    return;
  }

  // T_MonthlyStatsの定義
  const definition = TABLE_DEFINITIONS.T_MonthlyStats;
  createSheet(ss, 'T_MonthlyStats', definition);

  Logger.log('\n=== P2-6 マイグレーション完了 ===');
  Logger.log('✓ 月次統計シートを追加しました');
  Logger.log('カラム: stat_id, fiscal_year, month, job_count, assignment_count, ...');
  Logger.log('用途: 売上分析ダッシュボード、年次アーカイブ後の統計保持');
}

/**
 * P2-8 マイグレーション: M_Subcontractorsに単価カラムを追加
 * GASエディタから実行: migrateAddSubcontractorRateColumns()
 */
function migrateAddSubcontractorRateColumns() {
  const prop = PropertiesService.getScriptProperties();
  const spreadsheetId = prop.getProperty('SPREADSHEET_ID_DEV') || prop.getProperty('SPREADSHEET_ID_PROD');

  if (!spreadsheetId) {
    Logger.log('✗ SPREADSHEET_ID が設定されていません');
    return;
  }

  const ss = SpreadsheetApp.openById(spreadsheetId);
  const sheet = ss.getSheetByName('Subcontractors');

  if (!sheet) {
    Logger.log('✗ 外注先シートが見つかりません');
    return;
  }

  Logger.log('=== P2-8 外注先単価カラム追加マイグレーション ===\n');

  // 現在のヘッダーを取得
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

  Logger.log(`現在のカラム数: ${lastCol}`);
  Logger.log(`現在のヘッダー: ${headers.join(', ')}`);

  // 追加するカラム
  const columnsToAdd = ['basic_rate', 'half_day_rate', 'full_day_rate'];
  let addedCount = 0;

  // notesの後に挿入（notesの位置を見つける）
  const notesIndex = headers.indexOf('notes');
  if (notesIndex === -1) {
    Logger.log('✗ notesカラムが見つかりません。手動で追加してください。');
    return;
  }

  // 各カラムを追加（逆順で追加すると正しい順序になる）
  for (let i = columnsToAdd.length - 1; i >= 0; i--) {
    const colName = columnsToAdd[i];

    if (headers.includes(colName)) {
      Logger.log(`✓ ${colName}カラムは既に存在します`);
      continue;
    }

    // 挿入位置（notesの次）
    const insertPosition = notesIndex + 2; // 1-indexed

    // カラムを挿入
    sheet.insertColumnAfter(notesIndex + 1);
    sheet.getRange(1, insertPosition).setValue(colName);
    Logger.log(`✓ カラム追加: ${colName} (位置: ${insertPosition})`);
    addedCount++;
  }

  if (addedCount > 0) {
    // ヘッダー行のスタイルを適用
    const newLastCol = sheet.getLastColumn();
    sheet.getRange(1, 1, 1, newLastCol).setBackground('#E8F4F8').setFontWeight('bold');
  }

  Logger.log('\n=== P2-8 マイグレーション完了 ===');
  Logger.log(`${addedCount}個のカラムを追加しました（外注先単価管理用）`);
  Logger.log('basic_rate: 基本単価');
  Logger.log('half_day_rate: ハーフ単価');
  Logger.log('full_day_rate: 終日単価');
}

/**
 * CR-081 マイグレーション: M_Subcontractorsに拡張単価カラムを追加
 * night_rate, tobi_rate, age_rate, tobiage_rate
 * GASエディタから実行: migrateAddSubcontractorExtendedRates()
 */
function migrateAddSubcontractorExtendedRates() {
  const prop = PropertiesService.getScriptProperties();
  const ids = [
    { key: 'SPREADSHEET_ID_DEV', id: prop.getProperty('SPREADSHEET_ID_DEV') },
    { key: 'SPREADSHEET_ID_PROD', id: prop.getProperty('SPREADSHEET_ID_PROD') }
  ].filter(e => e.id);

  if (ids.length === 0) {
    Logger.log('✗ SPREADSHEET_ID が設定されていません');
    return;
  }

  for (const entry of ids) {
    Logger.log('=== CR-081 外注先拡張単価カラム追加 [' + entry.key + '] ===\n');

    const ss = SpreadsheetApp.openById(entry.id);
    const sheet = ss.getSheetByName('Subcontractors');

    if (!sheet) {
      Logger.log('✗ 外注先シートが見つかりません（スキップ）');
      continue;
    }

    const lastCol = sheet.getLastColumn();
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

    Logger.log('現在のカラム数: ' + lastCol);
    Logger.log('現在のヘッダー: ' + headers.join(', '));

    const fullDayRateIndex = headers.indexOf('full_day_rate');
    if (fullDayRateIndex === -1) {
      Logger.log('✗ full_day_rateカラムが見つかりません（スキップ）');
      continue;
    }

    const columnsToAdd = ['night_rate', 'tobi_rate', 'age_rate', 'tobiage_rate'];
    let addedCount = 0;

    for (let i = columnsToAdd.length - 1; i >= 0; i--) {
      const colName = columnsToAdd[i];

      if (headers.includes(colName)) {
        Logger.log('✓ ' + colName + 'カラムは既に存在します');
        continue;
      }

      const insertPosition = fullDayRateIndex + 2;
      sheet.insertColumnAfter(fullDayRateIndex + 1);
      sheet.getRange(1, insertPosition).setValue(colName);
      Logger.log('✓ カラム追加: ' + colName + ' (位置: ' + insertPosition + ')');
      addedCount++;
    }

    if (addedCount > 0) {
      const newLastCol = sheet.getLastColumn();
      sheet.getRange(1, 1, 1, newLastCol).setBackground('#E8F4F8').setFontWeight('bold');
    }

    Logger.log(addedCount + '個のカラムを追加しました\n');
  }

  Logger.log('=== CR-081 マイグレーション完了（全DB処理済み） ===');
}

/**
 * P2-8 マイグレーション: 諸経費請求機能用カラムを追加
 * - T_JobAssignments: transport_station, transport_has_bus
 * - M_Customers: has_transport_fee
 * GASエディタから実行: migrateAddTransportExpenseColumns()
 */
function migrateAddTransportExpenseColumns() {
  const prop = PropertiesService.getScriptProperties();
  const spreadsheetId = prop.getProperty('SPREADSHEET_ID_DEV') || prop.getProperty('SPREADSHEET_ID_PROD');

  if (!spreadsheetId) {
    Logger.log('✗ SPREADSHEET_ID が設定されていません');
    return;
  }

  const ss = SpreadsheetApp.openById(spreadsheetId);

  Logger.log('=== P2-8 諸経費請求機能マイグレーション ===\n');

  // 1. T_JobAssignments に transport_station, transport_has_bus を追加
  migrateAssignmentTransportColumns_(ss);

  // 2. M_Customers に has_transport_fee を追加
  migrateCustomerTransportFeeColumn_(ss);

  Logger.log('\n=== P2-8 諸経費請求機能マイグレーション完了 ===');
}

/**
 * 配置シートに transport_station, transport_has_bus カラムを追加
 */
function migrateAssignmentTransportColumns_(ss) {
  const sheet = ss.getSheetByName('Assignments');

  if (!sheet) {
    Logger.log('✗ 配置シートが見つかりません');
    return;
  }

  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

  Logger.log('--- 配置シート ---');
  Logger.log(`現在のヘッダー: ${headers.join(', ')}`);

  // transport_station が既に存在するかチェック
  if (headers.includes('transport_station')) {
    Logger.log('✓ transport_station, transport_has_bus カラムは既に存在します');
    return;
  }

  // transport_is_manual の後に挿入
  const transportIsManualIndex = headers.indexOf('transport_is_manual');
  if (transportIsManualIndex === -1) {
    Logger.log('✗ transport_is_manual カラムが見つかりません');
    return;
  }

  // 挿入位置（transport_is_manual の次）
  const insertPosition = transportIsManualIndex + 2; // 1-indexed

  // transport_has_bus を先に挿入（逆順で追加）
  sheet.insertColumnAfter(transportIsManualIndex + 1);
  sheet.getRange(1, insertPosition).setValue('transport_has_bus');
  Logger.log(`✓ カラム追加: transport_has_bus (位置: ${insertPosition})`);

  // transport_station を挿入
  sheet.insertColumnAfter(transportIsManualIndex + 1);
  sheet.getRange(1, insertPosition).setValue('transport_station');
  Logger.log(`✓ カラム追加: transport_station (位置: ${insertPosition})`);

  // ヘッダー行のスタイルを適用
  const newLastCol = sheet.getLastColumn();
  sheet.getRange(1, 1, 1, newLastCol).setBackground('#E8F4F8').setFontWeight('bold');
}

/**
 * 顧客シートに has_transport_fee カラムを追加
 */
function migrateCustomerTransportFeeColumn_(ss) {
  const sheet = ss.getSheetByName('Customers');

  if (!sheet) {
    Logger.log('✗ 顧客シートが見つかりません');
    return;
  }

  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

  Logger.log('\n--- 顧客シート ---');
  Logger.log(`現在のヘッダー: ${headers.join(', ')}`);

  // has_transport_fee が既に存在するかチェック
  if (headers.includes('has_transport_fee')) {
    Logger.log('✓ has_transport_fee カラムは既に存在します');
    return;
  }

  // include_cover_page の後に挿入
  const includeCoverPageIndex = headers.indexOf('include_cover_page');
  if (includeCoverPageIndex === -1) {
    Logger.log('✗ include_cover_page カラムが見つかりません');
    return;
  }

  // 挿入位置（include_cover_page の次）
  const insertPosition = includeCoverPageIndex + 2; // 1-indexed

  // カラムを挿入
  sheet.insertColumnAfter(includeCoverPageIndex + 1);
  sheet.getRange(1, insertPosition).setValue('has_transport_fee');
  Logger.log(`✓ カラム追加: has_transport_fee (位置: ${insertPosition})`);

  // ヘッダー行のスタイルを適用
  const newLastCol = sheet.getLastColumn();
  sheet.getRange(1, 1, 1, newLastCol).setBackground('#E8F4F8').setFontWeight('bold');

  Logger.log('顧客設定で「諸経費請求」を有効にするには、該当行に TRUE を設定してください');
}

/**
 * 顧客シートに tax_rounding_mode カラムを追加
 * GASエディタから実行: migrateAddCustomerTaxRoundingModeColumn()
 */
function migrateAddCustomerTaxRoundingModeColumn() {
  const prop = PropertiesService.getScriptProperties();
  const spreadsheetId = prop.getProperty('SPREADSHEET_ID_DEV') || prop.getProperty('SPREADSHEET_ID_PROD');

  if (!spreadsheetId) {
    Logger.log('✗ SPREADSHEET_ID が設定されていません');
    return;
  }

  const ss = SpreadsheetApp.openById(spreadsheetId);
  const sheet = ss.getSheetByName('Customers');

  if (!sheet) {
    Logger.log('✗ 顧客シートが見つかりません');
    return;
  }

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  if (headers.includes('tax_rounding_mode')) {
    Logger.log('✓ tax_rounding_mode カラムは既に存在します');
    return;
  }

  const taxRateIndex = headers.indexOf('tax_rate');
  if (taxRateIndex === -1) {
    Logger.log('✗ tax_rate カラムが見つかりません');
    return;
  }

  const insertPosition = taxRateIndex + 2; // 1-based, tax_rate の次
  sheet.insertColumnAfter(taxRateIndex + 1);
  sheet.getRange(1, insertPosition).setValue('tax_rounding_mode');

  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, insertPosition, lastRow - 1, 1).setValue('floor');
  }

  const newLastCol = sheet.getLastColumn();
  sheet.getRange(1, 1, 1, newLastCol).setBackground('#E8F4F8').setFontWeight('bold');

  Logger.log(`✓ tax_rounding_mode カラムを列 ${insertPosition} に追加しました（既存データは floor で初期化）`);
}

/**
 * P3 マイグレーション: T_Payments シートを追加（入金記録用）
 * GASエディタから実行: migrateAddPaymentsSheet()
 */
function migrateAddPaymentsSheet() {
  const prop = PropertiesService.getScriptProperties();
  const spreadsheetId = prop.getProperty('SPREADSHEET_ID_DEV') || prop.getProperty('SPREADSHEET_ID_PROD');

  if (!spreadsheetId) {
    Logger.log('✗ SPREADSHEET_ID が設定されていません');
    return;
  }

  const ss = SpreadsheetApp.openById(spreadsheetId);

  // 入金記録シートが既にあるか確認
  const existingSheet = ss.getSheetByName('Payments');
  if (existingSheet) {
    Logger.log('✓ 入金記録シートは既に存在します');
    return;
  }

  // T_Paymentsの定義
  const definition = TABLE_DEFINITIONS.T_Payments;
  createSheet(ss, 'T_Payments', definition);

  Logger.log('\n=== P3 マイグレーション完了 ===');
  Logger.log('✓ 入金記録シートを追加しました');
  Logger.log('カラム: payment_id, invoice_id, payment_date, amount, payment_method, ...');
  Logger.log('用途: 請求書に対する入金記録、売掛金管理');
}

/**
 * 調整項目マイグレーション:
 * 1. T_InvoiceAdjustments シートを追加
 * 2. T_Invoices に adjustment_total カラムを追加
 * GASエディタから実行: migrateAddInvoiceAdjustments()
 */
function migrateAddInvoiceAdjustments() {
  const prop = PropertiesService.getScriptProperties();
  const spreadsheetId = prop.getProperty('SPREADSHEET_ID_DEV') || prop.getProperty('SPREADSHEET_ID_PROD');

  if (!spreadsheetId) {
    Logger.log('✗ SPREADSHEET_ID が設定されていません');
    return;
  }

  const ss = SpreadsheetApp.openById(spreadsheetId);

  Logger.log('=== 調整項目マイグレーション ===\n');

  // 1. T_InvoiceAdjustments シート追加
  const existingSheet = ss.getSheetByName('InvoiceAdjustments');
  if (existingSheet) {
    Logger.log('✓ InvoiceAdjustments シートは既に存在します');
  } else {
    const definition = TABLE_DEFINITIONS.T_InvoiceAdjustments;
    createSheet(ss, 'T_InvoiceAdjustments', definition);
    Logger.log('✓ InvoiceAdjustments シートを追加しました');
  }

  // 2. T_Invoices に adjustment_total カラム追加
  const invoiceSheet = ss.getSheetByName('Invoices');
  if (!invoiceSheet) {
    Logger.log('✗ Invoices シートが見つかりません');
    return;
  }

  const lastCol = invoiceSheet.getLastColumn();
  const headers = invoiceSheet.getRange(1, 1, 1, lastCol).getValues()[0];

  if (headers.includes('adjustment_total')) {
    Logger.log('✓ adjustment_total カラムは既に存在します');
  } else {
    // total_amount の後に挿入
    const totalAmountIndex = headers.indexOf('total_amount');
    if (totalAmountIndex === -1) {
      Logger.log('✗ total_amount カラムが見つかりません');
      return;
    }

    const insertPosition = totalAmountIndex + 2; // 1-indexed
    invoiceSheet.insertColumnAfter(totalAmountIndex + 1);
    invoiceSheet.getRange(1, insertPosition).setValue('adjustment_total');

    // ヘッダー行のスタイルを適用
    const newLastCol = invoiceSheet.getLastColumn();
    invoiceSheet.getRange(1, 1, 1, newLastCol).setBackground('#E8F4F8').setFontWeight('bold');

    Logger.log(`✓ adjustment_total カラムを列 ${insertPosition} に追加しました`);
  }

  Logger.log('\n=== 調整項目マイグレーション完了 ===');
}

/**
 * M_Staffシートに口座情報カラムを追加（マイグレーション）
 * 列ごとに存在確認する冪等設計
 * GASエディタから実行: migrateAddStaffBankFields()
 */
function migrateAddStaffBankFields() {
  const prop = PropertiesService.getScriptProperties();
  const spreadsheetId = prop.getProperty('SPREADSHEET_ID_DEV') || prop.getProperty('SPREADSHEET_ID_PROD');

  if (!spreadsheetId) {
    Logger.log('✗ SPREADSHEET_ID が設定されていません');
    return;
  }

  const ss = SpreadsheetApp.openById(spreadsheetId);
  const sheet = ss.getSheetByName('Staff');

  if (!sheet) {
    Logger.log('✗ Staffシートが見つかりません');
    return;
  }

  Logger.log('=== スタッフ口座情報カラム追加マイグレーション ===\n');

  const bankFields = ['bank_name', 'bank_branch', 'bank_account_type', 'bank_account_number', 'bank_account_name'];
  let addedCount = 0;

  // notes の前に挿入（foreigner_type → notes の間）
  // payment_frequency が存在すればその後、なければ foreigner_type の後をアンカーにする
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  let anchorField = 'payment_frequency';
  let anchorIndex = headers.indexOf(anchorField);

  if (anchorIndex === -1) {
    anchorField = 'foreigner_type';
    anchorIndex = headers.indexOf(anchorField);
  }

  if (anchorIndex === -1) {
    Logger.log('✗ アンカーカラム（payment_frequency / foreigner_type）が見つかりません');
    return;
  }

  Logger.log(`アンカー: ${anchorField} (位置: ${anchorIndex + 1})`);

  // 各フィールドを個別に確認・追加（冪等）
  for (let i = 0; i < bankFields.length; i++) {
    const field = bankFields[i];
    // 毎回ヘッダーを再取得（列挿入で位置がずれるため）
    const currentHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

    if (currentHeaders.includes(field)) {
      Logger.log(`✓ ${field} カラムは既に存在します`);
      continue;
    }

    // アンカーの現在位置を再取得（挿入でずれるため）
    const currentAnchorIndex = currentHeaders.indexOf(anchorField);
    // 既に追加済みのbank_*フィールド数をカウント
    const alreadyAdded = bankFields.slice(0, i).filter(f => currentHeaders.includes(f)).length;
    const insertPosition = currentAnchorIndex + 1 + alreadyAdded + 1;

    sheet.insertColumnAfter(insertPosition - 1);
    sheet.getRange(1, insertPosition).setValue(field);
    Logger.log(`✓ カラム追加: ${field} (位置: ${insertPosition})`);
    addedCount++;
  }

  if (addedCount > 0) {
    const newLastCol = sheet.getLastColumn();
    sheet.getRange(1, 1, 1, newLastCol).setBackground('#E8F4F8').setFontWeight('bold');
  }

  Logger.log(`\n=== マイグレーション完了 ===`);
  Logger.log(`${addedCount}個のカラムを追加しました（スタッフ口座情報用）`);
}

/**
 * M_Staffシートに nickname カラムを追加（マイグレーション）
 * name_kana の直後に挿入。冪等設計。
 * GASエディタから実行: migrateAddStaffNicknameColumn()
 */
function migrateAddStaffNicknameColumn() {
  const prop = PropertiesService.getScriptProperties();
  const spreadsheetId = prop.getProperty('SPREADSHEET_ID_DEV') || prop.getProperty('SPREADSHEET_ID_PROD');

  if (!spreadsheetId) {
    Logger.log('✗ SPREADSHEET_ID が設定されていません');
    return;
  }

  const ss = SpreadsheetApp.openById(spreadsheetId);
  const sheet = ss.getSheetByName('Staff');

  if (!sheet) {
    Logger.log('✗ Staffシートが見つかりません');
    return;
  }

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  if (headers.includes('nickname')) {
    Logger.log('✓ nickname カラムは既に存在します');
    return;
  }

  const nameKanaIndex = headers.indexOf('name_kana');
  if (nameKanaIndex === -1) {
    Logger.log('✗ name_kana カラムが見つかりません');
    return;
  }

  const insertPosition = nameKanaIndex + 2; // 1-based, name_kana の次
  sheet.insertColumnAfter(nameKanaIndex + 1);
  sheet.getRange(1, insertPosition).setValue('nickname');
  sheet.getRange(1, 1, 1, sheet.getLastColumn()).setBackground('#E8F4F8').setFontWeight('bold');

  Logger.log('✓ nickname カラムを name_kana の後に追加しました');
}

/**
 * T_MonthlyStatsシートにadjustment_totalカラムを追加（マイグレーション）
 * expense_amountの後にadjustment_totalを挿入する冪等設計
 * GASエディタから実行: migrateAddStatsAdjustmentTotal()
 */
function migrateAddStatsAdjustmentTotal() {
  const prop = PropertiesService.getScriptProperties();
  const spreadsheetId = prop.getProperty('SPREADSHEET_ID_DEV') || prop.getProperty('SPREADSHEET_ID_PROD');

  if (!spreadsheetId) {
    Logger.log('✗ SPREADSHEET_ID が設定されていません');
    return;
  }

  const ss = SpreadsheetApp.openById(spreadsheetId);
  const sheet = ss.getSheetByName('MonthlyStats');

  if (!sheet) {
    Logger.log('✗ MonthlyStatsシートが見つかりません');
    return;
  }

  Logger.log('=== MonthlyStats adjustment_total カラム追加マイグレーション ===\n');

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  if (headers.includes('adjustment_total')) {
    Logger.log('✓ adjustment_total カラムは既に存在します');
    return;
  }

  const expenseIndex = headers.indexOf('expense_amount');
  if (expenseIndex === -1) {
    Logger.log('✗ expense_amount カラムが見つかりません');
    return;
  }

  const insertPosition = expenseIndex + 2; // 1-indexed, expense_amountの後
  sheet.insertColumnAfter(expenseIndex + 1);
  sheet.getRange(1, insertPosition).setValue('adjustment_total');
  sheet.getRange(1, 1, 1, sheet.getLastColumn()).setBackground('#E8F4F8').setFontWeight('bold');

  Logger.log('✓ adjustment_total カラムを expense_amount の後に追加しました');
}

/**
 * T_Jobsシートにadjustment_amount, adjustment_noteカラムを追加（CR-091マイグレーション）
 * is_claimedの後に挿入する冪等設計
 * GASエディタから実行: migrateAddJobAdjustmentColumns()
 */
function migrateAddJobAdjustmentColumns() {
  const prop = PropertiesService.getScriptProperties();
  const ids = [
    { key: 'SPREADSHEET_ID_DEV', id: prop.getProperty('SPREADSHEET_ID_DEV') },
    { key: 'SPREADSHEET_ID_PROD', id: prop.getProperty('SPREADSHEET_ID_PROD') }
  ].filter(e => e.id);

  if (ids.length === 0) {
    Logger.log('✗ SPREADSHEET_ID が設定されていません');
    return;
  }

  for (const entry of ids) {
    Logger.log('=== CR-091 Jobs adjustment カラム追加 [' + entry.key + '] ===\n');

    const ss = SpreadsheetApp.openById(entry.id);
    const sheet = ss.getSheetByName('Jobs');

    if (!sheet) {
      Logger.log('✗ Jobsシートが見つかりません（スキップ）');
      continue;
    }

    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

    if (headers.includes('adjustment_amount')) {
      Logger.log('✓ adjustment_amount カラムは既に存在します（スキップ）');
      continue;
    }

    const claimedIndex = headers.indexOf('is_claimed');
    if (claimedIndex === -1) {
      Logger.log('✗ is_claimed カラムが見つかりません（スキップ）');
      continue;
    }

    // is_claimedの後に2列挿入（1-indexed）
    sheet.insertColumnsAfter(claimedIndex + 1, 2);
    sheet.getRange(1, claimedIndex + 2).setValue('adjustment_amount');
    sheet.getRange(1, claimedIndex + 3).setValue('adjustment_note');
    sheet.getRange(1, 1, 1, sheet.getLastColumn()).setBackground('#E8F4F8').setFontWeight('bold');

    Logger.log('✓ adjustment_amount, adjustment_note カラムを is_claimed の後に追加しました');
  }

  Logger.log('=== CR-091 マイグレーション完了（全DB処理済み） ===');
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
