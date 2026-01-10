/**
 * Invoice Database Initialization
 *
 * 請求関連シートの初期化
 * KTSM-86: Phase 2 請求管理機能
 */

/**
 * 請求シートを初期化（新規作成またはヘッダー追加）
 * GASエディタから実行: initInvoiceSheets()
 */
function initInvoiceSheets() {
  const db = getDb();

  // T_Invoices (請求)
  const invoicesHeaders = [
    'invoice_id',
    'invoice_number',
    'customer_id',
    'billing_year',
    'billing_month',
    'issue_date',
    'due_date',
    'subtotal',
    'expense_amount',
    'tax_amount',
    'total_amount',
    'invoice_format',
    'shipper_name',
    'pdf_file_id',
    'excel_file_id',
    'sheet_file_id',
    'status',
    'notes',
    'created_at',
    'updated_at',
    'created_by',
    'is_deleted'
  ];

  // T_InvoiceLines (請求明細)
  const invoiceLinesHeaders = [
    'line_id',
    'invoice_id',
    'line_number',
    'work_date',
    'job_id',
    'assignment_id',
    'site_name',
    'item_name',
    'time_note',
    'quantity',
    'unit',
    'unit_price',
    'amount',
    'order_number',
    'branch_office',
    'construction_div',
    'supervisor_name',
    'property_code',
    'tax_amount',
    'created_at',
    'updated_at',
    'is_deleted'
  ];

  // シート作成
  const results = [];

  results.push(createOrUpdateSheet_(db, '請求', invoicesHeaders));
  results.push(createOrUpdateSheet_(db, '請求明細', invoiceLinesHeaders));

  Logger.log('=== Invoice Sheets Initialization Complete ===');
  results.forEach(r => Logger.log(`${r.sheetName}: ${r.status}`));

  return results;
}

/**
 * シートを作成または更新
 * @param {Spreadsheet} db - スプレッドシート
 * @param {string} sheetName - シート名
 * @param {string[]} headers - ヘッダー配列
 * @returns {Object} 結果
 */
function createOrUpdateSheet_(db, sheetName, headers) {
  let sheet = db.getSheetByName(sheetName);
  let status;

  if (!sheet) {
    // 新規作成
    sheet = db.insertSheet(sheetName);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);

    // ヘッダー行のスタイル設定
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setBackground('#4a86e8');
    headerRange.setFontColor('#ffffff');
    headerRange.setFontWeight('bold');

    status = 'CREATED';
    Logger.log(`Created sheet: ${sheetName}`);
  } else {
    // 既存シートのヘッダー確認
    const existingHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn() || 1).getValues()[0];

    if (existingHeaders.length === 0 || existingHeaders[0] === '') {
      // ヘッダーがない場合は追加
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
      status = 'HEADERS_ADDED';
      Logger.log(`Added headers to: ${sheetName}`);
    } else {
      status = 'ALREADY_EXISTS';
      Logger.log(`Sheet already exists: ${sheetName}`);
    }
  }

  return { sheetName, status };
}

/**
 * テンプレートIDを設定
 * GASエディタから実行: setInvoiceTemplateIds()
 *
 * 実行前にテンプレートファイルをDriveに配置し、IDを取得しておく
 */
function setInvoiceTemplateIds() {
  const prop = PropertiesService.getScriptProperties();

  // TEMPLATE_IDS は template_init.gs で定義
  const templateIds = {
    'TEMPLATE_FORMAT1_ID': TEMPLATE_IDS.FORMAT1,
    'TEMPLATE_FORMAT2_ID': TEMPLATE_IDS.FORMAT2_SEPARATED,
    'TEMPLATE_FORMAT3_ID': TEMPLATE_IDS.FORMAT3,
    'TEMPLATE_ATAMAGAMI_ID': TEMPLATE_IDS.ATAMAGAMI
  };

  for (const [key, value] of Object.entries(templateIds)) {
    if (value) {
      prop.setProperty(key, value);
      Logger.log(`✓ Set ${key}: ${value}`);
    } else {
      Logger.log(`✗ Skipped ${key} (empty)`);
    }
  }

  Logger.log('=== Template IDs Setup Complete ===');
}

/**
 * 現在のScriptPropertiesを確認
 */
function checkScriptProperties() {
  const prop = PropertiesService.getScriptProperties();
  const all = prop.getProperties();

  Logger.log('=== Current Script Properties ===');
  for (const [key, value] of Object.entries(all)) {
    // APIキーなどは一部マスク
    const displayValue = key.includes('KEY') || key.includes('SECRET')
      ? value.substring(0, 5) + '...'
      : value;
    Logger.log(`${key}: ${displayValue}`);
  }
}
