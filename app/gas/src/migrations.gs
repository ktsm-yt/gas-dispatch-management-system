/**
 * Historical Migrations
 *
 * 既存環境のスキーマ更新に使用されたマイグレーション関数群。
 * 新規インストールでは不要（TABLE_DEFINITIONS が最新スキーマ）。
 *
 * 全関数は冪等（既にカラムが存在すれば何もしない）。
 * 既存環境の保守用に残しているが、新機能開発では使用しない。
 */

// =============================================================================
// db_init.gs から移植したマイグレーション関数
// =============================================================================

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
 * CR-097: Assignments に staff_transport カラムを追加
 * transport_has_bus の後に1列挿入
 * GASエディタから手動実行: migrateAddStaffTransportColumn()
 */
function migrateAddStaffTransportColumn() {
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
    Logger.log('=== CR-097 staff_transport カラム追加 [' + entry.key + '] ===\n');

    const ss = SpreadsheetApp.openById(entry.id);
    const sheet = ss.getSheetByName('Assignments');

    if (!sheet) {
      Logger.log('✗ Assignmentsシートが見つかりません（スキップ）');
      continue;
    }

    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

    if (headers.includes('staff_transport')) {
      Logger.log('✓ staff_transport カラムは既に存在します（スキップ）');
      continue;
    }

    const busIndex = headers.indexOf('transport_has_bus');
    if (busIndex === -1) {
      Logger.log('✗ transport_has_bus カラムが見つかりません（スキップ）');
      continue;
    }

    // transport_has_busの後に1列挿入（1-indexed）
    sheet.insertColumnsAfter(busIndex + 1, 1);
    sheet.getRange(1, busIndex + 2).setValue('staff_transport');
    sheet.getRange(1, 1, 1, sheet.getLastColumn()).setBackground('#E8F4F8').setFontWeight('bold');

    Logger.log('✓ staff_transport カラムを transport_has_bus の後に追加しました');
  }

  Logger.log('=== CR-097 マイグレーション完了（全DB処理済み） ===');
}

/**
 * M_Subcontractorsに invoice_registration_number カラムを追加（マイグレーション）
 * notes の後（basic_rate の前）に挿入。冪等設計。
 * GASエディタから手動実行: migrateAddSubcontractorInvoiceNumber()
 */
function migrateAddSubcontractorInvoiceNumber() {
  const prop = PropertiesService.getScriptProperties();
  const ids = [
    prop.getProperty('SPREADSHEET_ID_DEV'),
    prop.getProperty('SPREADSHEET_ID_PROD')
  ].filter(Boolean);

  if (ids.length === 0) {
    Logger.log('✗ SPREADSHEET_ID が設定されていません');
    return;
  }

  Logger.log('=== 外注先インボイス登録番号カラム追加マイグレーション ===\n');

  for (const spreadsheetId of ids) {
    Logger.log(`--- DB: ${spreadsheetId} ---`);
    const ss = SpreadsheetApp.openById(spreadsheetId);
    const sheet = ss.getSheetByName('Subcontractors');

    if (!sheet) {
      Logger.log('✗ Subcontractorsシートが見つかりません（スキップ）');
      continue;
    }

    const lastCol = sheet.getLastColumn();
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

    if (headers.includes('invoice_registration_number')) {
      Logger.log('✓ invoice_registration_number カラムは既に存在します');
      continue;
    }

    const notesIndex = headers.indexOf('notes');
    if (notesIndex === -1) {
      Logger.log('✗ notes カラムが見つかりません（スキップ）');
      continue;
    }

    // notesの後に1列挿入（1-indexed）
    sheet.insertColumnsAfter(notesIndex + 1, 1);
    sheet.getRange(1, notesIndex + 2).setValue('invoice_registration_number');
    sheet.getRange(1, 1, 1, sheet.getLastColumn()).setBackground('#E8F4F8').setFontWeight('bold');

    Logger.log('✓ invoice_registration_number カラムを notes の後に追加しました');
  }

  Logger.log('\n=== マイグレーション完了 ===');
}

// =============================================================================
// migrate_sheet_names.gs から移植
// =============================================================================

/**
 * Sheet Name Migration: Japanese → English
 *
 * シートタブ名を日本語から英語にリネームするマイグレーション。
 * Step 1（コードデプロイ）完了後、Step 2 として実行する。
 *
 * 使い方:
 *   1. migrateSheetNames(true)  — dryRun でリネーム結果をプレビュー
 *   2. migrateSheetNames(false) — 実際にリネーム実行
 *   3. migrateArchiveSheetNames(false) — アーカイブDBも同様にリネーム
 *   4. rollbackSheetNames()     — ロールバック（英語→日本語に戻す）
 *   5. rollbackArchiveSheetNames() — アーカイブDBもロールバック
 *
 * Step 3（クリーンアップ）完了後にこのファイルを削除する。
 *
 * GASエディタから実行する場合（引数なしラッパー）:
 *   - migrateSheetNamesDryRun()   — プレビュー
 *   - migrateSheetNamesExecute()  — 実行
 *   - migrateArchiveDryRun()      — アーカイブDBプレビュー
 *   - migrateArchiveExecute()     — アーカイブDB実行
 */

/** GASエディタ用: dry-runプレビュー */
function migrateSheetNamesDryRun() {
  return migrateSheetNames(true);
}

/** GASエディタ用: 実行 */
function migrateSheetNamesExecute() {
  return migrateSheetNames(false);
}

/** GASエディタ用: アーカイブDB dry-run */
function migrateArchiveDryRun() {
  return migrateArchiveSheetNames(true);
}

/** GASエディタ用: アーカイブDB実行 */
function migrateArchiveExecute() {
  return migrateArchiveSheetNames(false);
}

/**
 * 日本語→英語のリネームマッピング
 */
const RENAME_MAP = {
  '顧客': 'Customers',
  'スタッフ': 'Staff',
  '外注先': 'Subcontractors',
  '交通費': 'TransportFees',
  '自社情報': 'Company',
  '案件': 'Jobs',
  '案件枠': 'JobSlots',
  '配置': 'Assignments',
  '請求': 'Invoices',
  '請求明細': 'InvoiceLines',
  '支払': 'Payouts',
  '月次統計': 'MonthlyStats',
  '入金記録': 'Payments',
  'ログ': 'AuditLog'
};

/**
 * メインDBのシートタブ名をリネーム
 * @param {boolean} dryRun - true の場合はリネームせずプレビューのみ
 */
function migrateSheetNames(dryRun) {
  if (dryRun === undefined) dryRun = true;

  Logger.log('=== シート名マイグレーション ' + (dryRun ? '(DRY RUN)' : '(EXECUTE)') + ' ===');

  const db = getDb();
  const results = { renamed: [], skipped: [], notFound: [] };

  for (const [oldName, newName] of Object.entries(RENAME_MAP)) {
    const sheet = db.getSheetByName(oldName);

    if (!sheet) {
      // 既にリネーム済みか確認
      const existingNewSheet = db.getSheetByName(newName);
      if (existingNewSheet) {
        results.skipped.push({ old: oldName, new: newName, reason: 'already renamed' });
        Logger.log('SKIP: ' + oldName + ' → ' + newName + ' (既にリネーム済み)');
      } else {
        results.notFound.push({ old: oldName, new: newName });
        Logger.log('NOT FOUND: ' + oldName + ' (シートが存在しません)');
      }
      continue;
    }

    // 新名で既にシートが存在する場合は衝突
    const conflicting = db.getSheetByName(newName);
    if (conflicting) {
      results.skipped.push({ old: oldName, new: newName, reason: 'name conflict' });
      Logger.log('CONFLICT: ' + newName + ' は既に存在します。' + oldName + ' のリネームをスキップ');
      continue;
    }

    if (dryRun) {
      results.renamed.push({ old: oldName, new: newName });
      Logger.log('WILL RENAME: ' + oldName + ' → ' + newName);
    } else {
      sheet.setName(newName);
      results.renamed.push({ old: oldName, new: newName });
      Logger.log('RENAMED: ' + oldName + ' → ' + newName);
    }
  }

  Logger.log('\n=== 結果サマリー ===');
  Logger.log('リネーム' + (dryRun ? '予定' : '完了') + ': ' + results.renamed.length + '件');
  Logger.log('スキップ: ' + results.skipped.length + '件');
  Logger.log('未検出: ' + results.notFound.length + '件');

  return results;
}

/**
 * アーカイブDBのシートタブ名をリネーム
 * @param {boolean} dryRun - true の場合はリネームせずプレビューのみ
 */
function migrateArchiveSheetNames(dryRun) {
  if (dryRun === undefined) dryRun = true;

  Logger.log('=== アーカイブDB シート名マイグレーション ' + (dryRun ? '(DRY RUN)' : '(EXECUTE)') + ' ===');

  const props = PropertiesService.getScriptProperties();
  const allProps = props.getProperties();
  const archiveDbIds = [];

  // ARCHIVE_DB_YYYY 形式のプロパティを検索
  for (const [key, value] of Object.entries(allProps)) {
    if (key.startsWith('ARCHIVE_DB_') && value) {
      archiveDbIds.push({ year: key.replace('ARCHIVE_DB_', ''), dbId: value });
    }
  }

  if (archiveDbIds.length === 0) {
    Logger.log('アーカイブDBが見つかりません');
    return { archives: [] };
  }

  const allResults = [];

  for (const archive of archiveDbIds) {
    Logger.log('\n--- アーカイブDB: ' + archive.year + '年度 ---');

    try {
      const archiveDb = SpreadsheetApp.openById(archive.dbId);
      const results = { year: archive.year, renamed: [], skipped: [], notFound: [] };

      for (const [oldName, newName] of Object.entries(RENAME_MAP)) {
        const sheet = archiveDb.getSheetByName(oldName);

        if (!sheet) {
          const existingNewSheet = archiveDb.getSheetByName(newName);
          if (existingNewSheet) {
            results.skipped.push({ old: oldName, new: newName, reason: 'already renamed' });
          }
          // アーカイブDBには全テーブルがあるとは限らないので notFound はログしない
          continue;
        }

        const conflicting = archiveDb.getSheetByName(newName);
        if (conflicting) {
          results.skipped.push({ old: oldName, new: newName, reason: 'name conflict' });
          continue;
        }

        if (dryRun) {
          results.renamed.push({ old: oldName, new: newName });
          Logger.log('WILL RENAME: ' + oldName + ' → ' + newName);
        } else {
          sheet.setName(newName);
          results.renamed.push({ old: oldName, new: newName });
          Logger.log('RENAMED: ' + oldName + ' → ' + newName);
        }
      }

      Logger.log(archive.year + '年度: ' + results.renamed.length + '件' + (dryRun ? '予定' : '完了'));
      allResults.push(results);

    } catch (e) {
      Logger.log('ERROR: ' + archive.year + '年度のアーカイブDBにアクセスできません: ' + e.message);
      allResults.push({ year: archive.year, error: e.message });
    }
  }

  return { archives: allResults };
}

/**
 * ロールバック: 英語シート名を日本語に戻す
 */
function rollbackSheetNames() {
  Logger.log('=== シート名ロールバック（英語→日本語） ===');

  const db = getDb();
  const results = { renamed: [], skipped: [], notFound: [] };

  // 逆マッピング: 英語→日本語
  for (const [oldName, newName] of Object.entries(RENAME_MAP)) {
    const sheet = db.getSheetByName(newName); // 英語名のシートを検索

    if (!sheet) {
      // まだ日本語名のままか確認
      const existingOldSheet = db.getSheetByName(oldName);
      if (existingOldSheet) {
        results.skipped.push({ current: oldName, reason: 'still Japanese name' });
        Logger.log('SKIP: ' + oldName + ' (まだ日本語名のままです)');
      } else {
        results.notFound.push({ english: newName, japanese: oldName });
        Logger.log('NOT FOUND: ' + newName);
      }
      continue;
    }

    // 衝突チェック: 日本語名で既にシートが存在する場合はスキップ
    const conflicting = db.getSheetByName(oldName);
    if (conflicting) {
      results.skipped.push({ current: newName, reason: 'name conflict with ' + oldName });
      Logger.log('CONFLICT: ' + oldName + ' は既に存在します。' + newName + ' のロールバックをスキップ');
      continue;
    }

    sheet.setName(oldName);
    results.renamed.push({ from: newName, to: oldName });
    Logger.log('ROLLBACK: ' + newName + ' → ' + oldName);
  }

  Logger.log('\n=== ロールバック結果 ===');
  Logger.log('ロールバック完了: ' + results.renamed.length + '件');
  Logger.log('スキップ: ' + results.skipped.length + '件');

  return results;
}

/**
 * ロールバック: アーカイブDBの英語シート名を日本語に戻す
 */
function rollbackArchiveSheetNames() {
  Logger.log('=== アーカイブDB シート名ロールバック（英語→日本語） ===');

  const props = PropertiesService.getScriptProperties();
  const allProps = props.getProperties();
  const archiveDbIds = [];

  for (const [key, value] of Object.entries(allProps)) {
    if (key.startsWith('ARCHIVE_DB_') && value) {
      archiveDbIds.push({ year: key.replace('ARCHIVE_DB_', ''), dbId: value });
    }
  }

  if (archiveDbIds.length === 0) {
    Logger.log('アーカイブDBが見つかりません');
    return { archives: [] };
  }

  const allResults = [];

  for (const archive of archiveDbIds) {
    Logger.log('\n--- アーカイブDB: ' + archive.year + '年度 ---');

    try {
      const archiveDb = SpreadsheetApp.openById(archive.dbId);
      const results = { year: archive.year, renamed: [], skipped: [] };

      for (const [oldName, newName] of Object.entries(RENAME_MAP)) {
        const sheet = archiveDb.getSheetByName(newName);

        if (!sheet) {
          continue;
        }

        // 衝突チェック
        const conflicting = archiveDb.getSheetByName(oldName);
        if (conflicting) {
          results.skipped.push({ current: newName, reason: 'name conflict with ' + oldName });
          Logger.log('CONFLICT: ' + oldName + ' は既に存在します。スキップ');
          continue;
        }

        sheet.setName(oldName);
        results.renamed.push({ from: newName, to: oldName });
        Logger.log('ROLLBACK: ' + newName + ' → ' + oldName);
      }

      Logger.log(archive.year + '年度: ' + results.renamed.length + '件ロールバック完了');
      allResults.push(results);

    } catch (e) {
      Logger.log('ERROR: ' + archive.year + '年度のアーカイブDBにアクセスできません: ' + e.message);
      allResults.push({ year: archive.year, error: e.message });
    }
  }

  return { archives: allResults };
}

// =============================================================================
// migrate_holiday_columns.gs から移植
// =============================================================================

/**
 * Migration: M_Customers / M_Staff / M_Subcontractors に休日単価カラムを追加（CR-090）
 *
 * 追加カラム:
 *   - M_Customers: unit_price_holiday (unit_price_night の右)
 *   - M_Staff: daily_rate_holiday (daily_rate_night の右)
 *   - M_Subcontractors: holiday_rate (tobiage_rate の右)
 *
 * 使い方:
 *   1. migrateHolidayColumnsDryRun()  — プレビュー
 *   2. migrateHolidayColumnsExecute() — 実行
 */

/** GASエディタ用: dry-run */
function migrateHolidayColumnsDryRun() {
  return migrateHolidayColumns_(true);
}

/** GASエディタ用: 実行 */
function migrateHolidayColumnsExecute() {
  return migrateHolidayColumns_(false);
}

/**
 * 3マスタシートに休日単価カラムを追加
 * @param {boolean} dryRun - true でプレビューのみ
 */
function migrateHolidayColumns_(dryRun) {
  var MIGRATIONS = [
    { sheetNames: ['Customers', 'M_Customers'], column: 'unit_price_holiday', after: 'unit_price_night' },
    { sheetNames: ['Staff', 'M_Staff'],         column: 'daily_rate_holiday', after: 'daily_rate_night' },
    { sheetNames: ['Subcontractors', 'M_Subcontractors'], column: 'holiday_rate', after: 'tobiage_rate' }
  ];

  var db = getDb();
  var results = [];

  for (var i = 0; i < MIGRATIONS.length; i++) {
    var m = MIGRATIONS[i];
    var sheet = null;
    for (var j = 0; j < m.sheetNames.length; j++) {
      sheet = db.getSheetByName(m.sheetNames[j]);
      if (sheet) break;
    }
    if (!sheet) {
      Logger.log('SKIP: シートが見つかりません: ' + m.sheetNames.join(' / '));
      results.push({ sheet: m.sheetNames[0], status: 'NOT_FOUND' });
      continue;
    }

    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

    // 既に存在するかチェック
    if (headers.indexOf(m.column) !== -1) {
      Logger.log('SKIP: ' + sheet.getName() + ' に ' + m.column + ' は既に存在');
      results.push({ sheet: sheet.getName(), status: 'ALREADY_EXISTS' });
      continue;
    }

    // 挿入位置を特定
    var afterIdx = headers.indexOf(m.after);
    if (afterIdx === -1) {
      Logger.log('WARN: ' + sheet.getName() + ' に ' + m.after + ' が見つかりません → 末尾に追加');
      afterIdx = headers.length - 1;
    }

    var insertCol = afterIdx + 2; // 1-based, afterの右隣

    if (dryRun) {
      Logger.log('DRY-RUN: ' + sheet.getName() + ' に列 ' + insertCol + ' として ' + m.column + ' を挿入予定（' + m.after + ' の右）');
      results.push({ sheet: sheet.getName(), status: 'WILL_INSERT', col: insertCol });
    } else {
      sheet.insertColumnAfter(afterIdx + 1); // 1-based
      sheet.getRange(1, insertCol).setValue(m.column);
      Logger.log('DONE: ' + sheet.getName() + ' に ' + m.column + ' を列 ' + insertCol + ' に挿入');
      results.push({ sheet: sheet.getName(), status: 'INSERTED', col: insertCol });
    }
  }

  Logger.log('');
  Logger.log('=== CR-090 Holiday列マイグレーション ' + (dryRun ? '(DRY-RUN)' : '(EXECUTED)') + ' ===');
  results.forEach(function(r) {
    Logger.log(r.sheet + ': ' + r.status + (r.col ? ' (col ' + r.col + ')' : ''));
  });

  return results;
}

// =============================================================================
// migrate_ninku_columns.gs から移植
// =============================================================================

/**
 * Migration: T_Payouts に人工割カラムを追加（CR-029）
 *
 * 追加カラム:
 *   - ninku_coefficient (人工割係数)
 *   - ninku_adjustment_amount (人工割調整額)
 *
 * adjustment_amount の右隣に挿入する。
 *
 * 使い方:
 *   1. migrateNinkuColumnsDryRun()  — プレビュー
 *   2. migrateNinkuColumnsExecute() — 実行
 */

/** GASエディタ用: dry-run */
function migrateNinkuColumnsDryRun() {
  return migrateNinkuColumns(true);
}

/** GASエディタ用: 実行 */
function migrateNinkuColumnsExecute() {
  return migrateNinkuColumns(false);
}

/**
 * T_Payouts シートに ninku_coefficient, ninku_adjustment_amount カラムを追加
 * @param {boolean} dryRun - true でプレビューのみ
 */
function migrateNinkuColumns(dryRun) {
  var NEW_COLUMNS = ['ninku_coefficient', 'ninku_adjustment_amount'];
  var INSERT_AFTER = 'adjustment_amount';  // この列の右に挿入

  var db = getDb();
  // シート名は TABLE_SHEET_MAP 経由で 'Payouts' にマッピングされている
  var sheet = db.getSheetByName('Payouts') || db.getSheetByName('T_Payouts');
  if (!sheet) {
    Logger.log('ERROR: Payouts シートが見つかりません');
    return;
  }

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  Logger.log('現在のヘッダー: ' + JSON.stringify(headers));

  // 既に存在するかチェック
  var existing = NEW_COLUMNS.filter(function(col) {
    return headers.indexOf(col) !== -1;
  });
  if (existing.length > 0) {
    Logger.log('既に存在するカラム: ' + existing.join(', ') + ' → スキップ');
    return;
  }

  // 挿入位置を特定
  var insertAfterIdx = headers.indexOf(INSERT_AFTER);
  if (insertAfterIdx === -1) {
    Logger.log('ERROR: ' + INSERT_AFTER + ' カラムが見つかりません');
    Logger.log('ヘッダー: ' + JSON.stringify(headers));
    return;
  }

  // insertAfterIdx は 0-indexed、insertColumns は 1-indexed
  var insertCol = insertAfterIdx + 2;  // adjustment_amountの次

  Logger.log('挿入位置: 列 ' + insertCol + ' (' + INSERT_AFTER + ' の右)');
  Logger.log('追加カラム: ' + NEW_COLUMNS.join(', '));

  if (dryRun) {
    Logger.log('[DRY RUN] 実行されませんでした');
    return;
  }

  // 2列挿入
  sheet.insertColumns(insertCol, NEW_COLUMNS.length);

  // ヘッダー書き込み
  sheet.getRange(1, insertCol, 1, NEW_COLUMNS.length).setValues([NEW_COLUMNS]);

  // 既存データ行にデフォルト値（0）を設定
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    var dataRows = lastRow - 1;
    var defaults = [];
    for (var i = 0; i < dataRows; i++) {
      defaults.push([0, 0]);  // ninku_coefficient=0, ninku_adjustment_amount=0
    }
    sheet.getRange(2, insertCol, dataRows, NEW_COLUMNS.length).setValues(defaults);
  }

  Logger.log('完了: ' + NEW_COLUMNS.length + ' カラムを追加しました');

  // 確認
  var newHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  Logger.log('新しいヘッダー: ' + JSON.stringify(newHeaders));
}

// =============================================================================
// migrate_reorder_columns.gs から移植（applyColumnWidths_ / applyWidthsAllSheets を除く）
// =============================================================================

/**
 * 列順整理マイグレーション
 *
 * 開発DBの列順を TABLE_DEFINITIONS の定義順に合わせる。
 * 非破壊方式: 旧シート→新シート(正順)にデータコピー、旧シートを退避。
 *
 * 実行前に必ずスプレッドシートを丸ごと複製（バックアップ）すること。
 * GASエディタから実行: reorderAllColumns()
 */

/**
 * 全対象テーブルの列順を整理
 */
function reorderAllColumns() {
  const db = getDb();

  // 対象テーブル: 列順が TABLE_DEFINITIONS と異なるもの
  const targets = [
    'M_Customers',
    'M_Staff',
    'T_Jobs',
    'T_JobAssignments',
    'T_Payouts'
  ];

  const results = [];

  for (const tableName of targets) {
    const def = TABLE_DEFINITIONS[tableName];
    if (!def) {
      Logger.log('⚠ TABLE_DEFINITIONS に未定義: ' + tableName);
      continue;
    }

    const result = reorderSheet_(db, def.sheetName, def.headers, tableName);
    results.push(result);
  }

  // Jobs の追加処理: job_type レガシー列を除外, ヘッダータイポ修正
  Logger.log('');
  Logger.log('=== 列順整理 完了 ===');
  results.forEach(r => {
    Logger.log(`${r.sheetName}: ${r.status} (${r.rowCount} rows)`);
  });

  return results;
}

/**
 * 単一シートの列順を整理
 * @param {Spreadsheet} db - スプレッドシート
 * @param {string} sheetName - シート名
 * @param {string[]} correctHeaders - 正しい列順（TABLE_DEFINITIONS）
 * @param {string} tableName - テーブル論理名（ログ用）
 * @returns {Object} 結果
 */
function reorderSheet_(db, sheetName, correctHeaders, tableName) {
  const oldSheet = db.getSheetByName(sheetName);
  if (!oldSheet) {
    return { sheetName, status: 'NOT_FOUND', rowCount: 0 };
  }

  // 既存ヘッダーを取得
  const lastCol = oldSheet.getLastColumn();
  const oldHeaders = oldSheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String);

  // ヘッダーのタイポ修正（先頭・末尾スペース除去）
  const oldHeadersTrimmed = oldHeaders.map(h => h.trim());

  // 既存ヘッダーが正順と完全一致するかチェック
  if (JSON.stringify(oldHeadersTrimmed.filter(h => correctHeaders.includes(h))) === JSON.stringify(correctHeaders)
      && oldHeadersTrimmed.length === correctHeaders.length) {
    return { sheetName, status: 'ALREADY_ORDERED', rowCount: oldSheet.getLastRow() - 1 };
  }

  // データ行を取得
  const lastRow = oldSheet.getLastRow();
  const dataRowCount = lastRow - 1; // ヘッダー除く

  // 新シート作成
  const newSheetName = sheetName + '_new';
  let newSheet = db.getSheetByName(newSheetName);
  if (newSheet) {
    db.deleteSheet(newSheet); // 前回の残骸を削除
  }
  newSheet = db.insertSheet(newSheetName);

  // 正順ヘッダー書き込み
  newSheet.getRange(1, 1, 1, correctHeaders.length).setValues([correctHeaders]);
  newSheet.setFrozenRows(1);

  // ヘッダー行のスタイル
  const headerRange = newSheet.getRange(1, 1, 1, correctHeaders.length);
  headerRange.setBackground('#4a86e8');
  headerRange.setFontColor('#ffffff');
  headerRange.setFontWeight('bold');

  // データコピー（ヘッダー名マッピング）
  if (dataRowCount > 0) {
    const allData = oldSheet.getRange(2, 1, dataRowCount, lastCol).getValues();

    // 旧ヘッダー→列インデックスのマップ（trimmed版）
    const oldIndexMap = {};
    oldHeadersTrimmed.forEach((h, i) => { oldIndexMap[h] = i; });

    // 新データ配列を構築
    const newData = allData.map(row => {
      return correctHeaders.map(header => {
        const oldIdx = oldIndexMap[header];
        if (oldIdx !== undefined) {
          return row[oldIdx];
        }
        // 旧シートにないカラム → デフォルト値
        return '';
      });
    });

    newSheet.getRange(2, 1, dataRowCount, correctHeaders.length).setValues(newData);
  }

  // 検証: 行数一致
  const newRowCount = newSheet.getLastRow() - 1;
  if (newRowCount !== dataRowCount) {
    Logger.log('⚠ 行数不一致! ' + sheetName + ': old=' + dataRowCount + ', new=' + newRowCount);
    return { sheetName, status: 'ROW_COUNT_MISMATCH', rowCount: dataRowCount };
  }

  // 旧シートを退避名にリネーム、新シートを正式名に（冪等対応）
  const oldName = sheetName + '_old';
  const existingOld = db.getSheetByName(oldName);
  if (existingOld) {
    db.deleteSheet(existingOld);
    Logger.log('ℹ 既存の ' + oldName + ' を削除');
  }
  oldSheet.setName(oldName);
  newSheet.setName(sheetName);

  // 不要列のログ出力（TABLE_DEFINITIONS にない列）
  const extraCols = oldHeadersTrimmed.filter(h => h && !correctHeaders.includes(h));
  if (extraCols.length > 0) {
    Logger.log('ℹ ' + sheetName + ' 不要列（コピーされず）: ' + extraCols.join(', '));
  }

  // 列幅を自動適用
  applyColumnWidths_(newSheet, correctHeaders);

  Logger.log('✓ ' + sheetName + ': ' + dataRowCount + ' rows reordered (+ column widths applied)');
  return { sheetName, status: 'REORDERED', rowCount: dataRowCount, extraCols };
}

/**
 * 整理後の検証（reorderAllColumns 実行後に実行）
 * 各テーブルのヘッダーが TABLE_DEFINITIONS と一致するか確認
 */
function verifyColumnOrder() {
  const db = getDb();
  const allMatch = [];
  const mismatch = [];

  for (const [tableName, def] of Object.entries(TABLE_DEFINITIONS)) {
    const sheet = db.getSheetByName(def.sheetName);
    if (!sheet) {
      mismatch.push({ tableName, reason: 'SHEET_NOT_FOUND' });
      continue;
    }

    const lastCol = sheet.getLastColumn();
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String);

    if (JSON.stringify(headers) === JSON.stringify(def.headers)) {
      allMatch.push(tableName);
    } else {
      mismatch.push({ tableName, reason: 'HEADER_MISMATCH', expected: def.headers, actual: headers });
    }
  }

  Logger.log('=== 列順検証結果 ===');
  Logger.log('一致: ' + allMatch.length + '/15 テーブル');
  Logger.log('一致: ' + allMatch.join(', '));

  if (mismatch.length > 0) {
    Logger.log('不一致: ' + mismatch.length + ' テーブル');
    mismatch.forEach(m => {
      Logger.log('  ' + m.tableName + ': ' + m.reason);
      if (m.expected && m.actual) {
        // 差分を表示
        const missing = m.expected.filter(h => !m.actual.includes(h));
        const extra = m.actual.filter(h => !m.expected.includes(h));
        if (missing.length) Logger.log('    欠損: ' + missing.join(', '));
        if (extra.length) Logger.log('    余分: ' + extra.join(', '));
      }
    });
  }

  return { allMatch, mismatch };
}

/**
 * 旧シート（_old）を一括削除（検証完了後に実行）
 */
function cleanupOldSheets() {
  const db = getDb();
  const targets = ['Customers_old', 'Staff_old', 'Jobs_old', 'Assignments_old', 'Payouts_old'];
  const deleted = [];

  for (const name of targets) {
    const sheet = db.getSheetByName(name);
    if (sheet) {
      db.deleteSheet(sheet);
      deleted.push(name);
      Logger.log('✓ 削除: ' + name);
    }
  }

  Logger.log('=== 旧シート削除完了: ' + deleted.length + ' sheets ===');
  return deleted;
}

// =============================================================================
// db_init_invoices.gs から移植
// =============================================================================

/**
 * 請求シートを初期化（新規作成またはヘッダー追加）
 * GASエディタから実行: initInvoiceSheets()
 */
function initInvoiceSheets() {
  const db = getDb();

  // T_Invoices (請求) — TABLE_DEFINITIONS と同期済み
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
    'adjustment_total',
    'invoice_format',
    'shipper_name',
    'pdf_file_id',
    'excel_file_id',
    'sheet_file_id',
    'status',
    'has_assignment_changes',
    'notes',
    'created_at',
    'created_by',
    'updated_at',
    'updated_by',
    'is_deleted',
    'deleted_at',
    'deleted_by'
  ];

  // T_InvoiceLines (請求明細) — TABLE_DEFINITIONS と同期済み
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
    'created_by',
    'updated_at',
    'updated_by',
    'is_deleted',
    'deleted_at',
    'deleted_by'
  ];

  // シート作成
  const results = [];

  results.push(createOrUpdateSheet_(db, 'Invoices', invoicesHeaders));
  results.push(createOrUpdateSheet_(db, 'InvoiceLines', invoiceLinesHeaders));

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
 * T_Invoices に has_assignment_changes カラムを追加（マイグレーション）
 * GASエディタから実行: migrateAddHasAssignmentChanges()
 *
 * 既存シートにカラムが無い場合、status の次に追加する。
 * 既存データは空欄 = false 扱い（後方互換）。
 */
function migrateAddHasAssignmentChanges() {
  const db = getDb();
  const sheet = db.getSheetByName('Invoices');
  if (!sheet) {
    Logger.log('Invoices sheet not found');
    return;
  }

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  if (headers.includes('has_assignment_changes')) {
    Logger.log('has_assignment_changes column already exists — skipping');
    return;
  }

  // status カラムの次に挿入
  const statusIdx = headers.indexOf('status');
  const insertCol = (statusIdx >= 0 ? statusIdx + 1 : headers.length) + 1; // 1-indexed, after status

  sheet.insertColumnAfter(insertCol - 1);
  sheet.getRange(1, insertCol).setValue('has_assignment_changes');

  // ヘッダー行のスタイルをコピー
  const prevCell = sheet.getRange(1, insertCol - 1);
  const newCell = sheet.getRange(1, insertCol);
  newCell.setBackground(prevCell.getBackground());
  newCell.setFontColor(prevCell.getFontColor());
  newCell.setFontWeight(prevCell.getFontWeight());

  Logger.log('✓ Added has_assignment_changes column after status (col ' + insertCol + ')');
}
