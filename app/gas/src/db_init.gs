/**
 * Database Initialization Script
 *
 * 11個のテーブル（シート）を自動作成し、ヘッダー行を設定します。
 * 開発・本番環境で分けて実行可能です。
 */

/**
 * テーブル定義
 */
const TABLE_DEFINITIONS = {
  // マスターテーブル
  M_Customers: {
    sheetName: '顧客',
    headers: [
      'customer_id', 'company_name', 'branch_name', 'department_name',
      'contact_name', 'honorific', 'postal_code', 'address', 'phone', 'fax',
      'email', 'unit_price_tobi', 'unit_price_age', 'unit_price_tobiage',
      'unit_price_half', 'closing_day', 'payment_day', 'payment_month_offset',
      'invoice_format', 'tax_rate', 'expense_rate', 'shipper_name',
      'customer_code', 'invoice_registration_number', 'folder_id', 'notes',
      'created_at', 'created_by', 'updated_at', 'updated_by', 'is_active', 'is_deleted'
    ]
  },
  M_Staff: {
    sheetName: 'スタッフ',
    headers: [
      'staff_id', 'name', 'name_kana', 'phone', 'line_id', 'postal_code',
      'address', 'has_motorbike', 'skills', 'ng_customers', 'daily_rate_half',
      'daily_rate_basic', 'daily_rate_fullday', 'daily_rate_night', 'daily_rate_tobi', 'staff_type',
      'subcontractor_id', 'ccus_id', 'birth_date', 'gender', 'blood_type',
      'emergency_contact', 'job_title', 'health_insurance_type', 'pension_type',
      'employment_insurance_no', 'kensetsu_kyosai', 'chusho_kyosai',
      'special_training', 'skill_training', 'licenses', 'hire_date', 'foreigner_type',
      'notes', 'created_at', 'created_by', 'updated_at', 'updated_by',
      'is_active', 'is_deleted'
    ]
  },
  M_Subcontractors: {
    sheetName: '外注先',
    headers: [
      'subcontractor_id', 'company_name', 'contact_name', 'phone', 'notes',
      'folder_id', 'created_at', 'created_by', 'updated_at', 'updated_by',
      'is_active', 'is_deleted'
    ]
  },
  M_TransportFee: {
    sheetName: '交通費',
    headers: [
      'area_code', 'area_name', 'default_fee'
    ]
  },
  M_Company: {
    sheetName: '自社情報',
    headers: [
      'company_id', 'company_name', 'postal_code', 'address', 'phone', 'fax',
      'invoice_registration_number', 'bank_name', 'bank_branch',
      'bank_account_type', 'bank_account_number', 'bank_account_name',
      'logo_file_id', 'stamp_file_id', 'updated_at'
    ]
  },
  // トランザクションテーブル
  T_Jobs: {
    sheetName: '案件',
    headers: [
      'job_id', 'customer_id', 'site_name', 'site_address', 'work_date',
      'time_slot', 'start_time', 'required_count', 'job_type',
      'pay_unit', 'work_category', 'work_detail',
      'supervisor_name', 'order_number', 'branch_office', 'property_code', 'construction_div', 'status',
      'is_damaged', 'is_uncollected', 'is_claimed',
      'notes', 'created_at', 'created_by', 'updated_at', 'updated_by', 'is_deleted'
    ]
  },
  T_JobAssignments: {
    sheetName: '配置',
    headers: [
      'assignment_id', 'job_id', 'staff_id', 'worker_type', 'subcontractor_id',
      'display_time_slot', 'pay_unit', 'invoice_unit', 'wage_rate', 'invoice_rate',
      'transport_area', 'transport_amount', 'transport_is_manual', 'site_role',
      'assignment_role', 'is_leader',
      'entry_date', 'safety_training_date', 'status', 'notes', 'created_at', 'created_by',
      'updated_at', 'updated_by', 'is_deleted'
    ]
  },
  T_Invoices: {
    sheetName: '請求',
    headers: [
      'invoice_id', 'invoice_number', 'customer_id', 'billing_year', 'billing_month',
      'issue_date', 'due_date', 'subtotal', 'expense_amount', 'tax_amount',
      'total_amount', 'invoice_format', 'shipper_name', 'pdf_file_id',
      'excel_file_id', 'sheet_file_id', 'status', 'notes', 'created_at',
      'created_by', 'updated_at', 'updated_by', 'is_deleted'
    ]
  },
  T_InvoiceLines: {
    sheetName: '請求明細',
    headers: [
      'line_id', 'invoice_id', 'line_number', 'work_date', 'job_id',
      'assignment_id', 'site_name', 'item_name', 'time_note', 'quantity', 'unit',
      'unit_price', 'amount', 'order_number', 'branch_office', 'construction_div',
      'supervisor_name', 'property_code', 'tax_amount', 'created_at', 'created_by',
      'updated_at', 'updated_by', 'is_deleted'
    ]
  },
  T_Payouts: {
    sheetName: '支払',
    headers: [
      'payout_id', 'payout_type', 'staff_id', 'subcontractor_id', 'billing_year',
      'billing_month', 'base_amount', 'transport_amount', 'adjustment_amount',
      'tax_amount', 'total_amount', 'status', 'paid_date', 'notes', 'created_at',
      'created_by', 'updated_at', 'updated_by', 'is_deleted'
    ]
  },
  T_AuditLog: {
    sheetName: 'ログ',
    headers: [
      'log_id', 'timestamp', 'user_email', 'action', 'table_name', 'record_id',
      'before_data', 'after_data'
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
  const existingSheet = ss.getSheetByName('案件');
  if (existingSheet) {
    Logger.log('案件シートは既に存在します');
    return;
  }

  // T_Jobsの定義
  const jobsHeaders = [
    'job_id', 'customer_id', 'site_name', 'site_address', 'work_date',
    'time_slot', 'start_time', 'required_count', 'job_type', 'supervisor_name',
    'order_number', 'branch_office', 'property_code', 'construction_div', 'status',
    'notes', 'created_at', 'updated_at', 'is_deleted'
  ];

  const sheet = ss.insertSheet('案件');
  sheet.getRange(1, 1, 1, jobsHeaders.length).setValues([jobsHeaders]);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, jobsHeaders.length).setFontWeight('bold');

  Logger.log('✓ 案件シートを追加しました');
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
  const sheet = ss.getSheetByName('配置');

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
