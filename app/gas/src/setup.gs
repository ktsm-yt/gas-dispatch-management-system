/**
 * Initial Setup Script
 *
 * clone後に setupAll() を1回実行するだけで開発環境が完成する統合セットアップ。
 * 各ステップは冪等（何度実行しても安全）。
 */

/**
 * 開発環境の初期セットアップ（統合関数）
 * GASエディタから実行: setupAll()
 */
function setupAll() {
  Logger.log('=== 初期セットアップ開始 ===\n');

  // Step 1: DB作成 + ScriptProperties登録
  Logger.log('Step 1/5: データベース作成...');
  createDevDatabase();

  // Step 2: Driveフォルダ構成作成
  Logger.log('Step 2/5: Driveフォルダ作成...');
  initDriveFolders();

  // Step 3: 認証設定（現在のユーザーをadminに）
  Logger.log('Step 3/5: 認証設定...');
  setupDevAuth();

  // Step 4: マスタデータ seed
  Logger.log('Step 4/5: マスタデータ投入...');
  migratePriceTypeTables_();  // PriceTypes + CustomPrices + seed
  seedWorkDetails();           // WorkDetails seed

  // Step 5: 列幅適用
  Logger.log('Step 5/5: 列幅・書式適用...');
  applyWidthsAllSheets();

  Logger.log('\n=== 初期セットアップ完了 ===');
  Logger.log('');
  Logger.log('残りの手動ステップ:');
  Logger.log('1. 請求書テンプレートファイル（4種）をDriveにアップロード');
  Logger.log('2. template_init.gs の TEMPLATE_IDS を更新');
  Logger.log('3. registerTemplateIds() を実行');
  Logger.log('4. (任意) seedAllProductionData() でデモデータ投入');
}

/**
 * 本番環境の初期セットアップ
 * setupDevAuth は呼ばない（本番は configureAuth 経由）
 */
function setupProd() {
  Logger.log('=== 本番セットアップ開始 ===\n');

  Logger.log('Step 1/4: データベース作成...');
  createProdDatabase();

  Logger.log('Step 2/4: Driveフォルダ作成...');
  initDriveFolders();

  Logger.log('Step 3/4: マスタデータ投入...');
  migratePriceTypeTables_();
  seedWorkDetails();

  Logger.log('Step 4/4: 列幅・書式適用...');
  applyWidthsAllSheets();

  Logger.log('\n=== 本番セットアップ完了 ===');
  Logger.log('');
  Logger.log('残りの手動ステップ:');
  Logger.log('1. configureAuth() で認証設定');
  Logger.log('2. 請求書テンプレートファイルをDriveにアップロード');
  Logger.log('3. template_init.gs の TEMPLATE_IDS を更新');
  Logger.log('4. registerTemplateIds() を実行');
}

// =============================================================================
// 列幅ユーティリティ（migrate_reorder_columns.gs から移動）
// =============================================================================

/**
 * 列幅をヘッダー名パターンに基づいて自動設定
 * @param {Sheet} sheet - 対象シート
 * @param {string[]} headers - ヘッダー配列
 */
function applyColumnWidths_(sheet, headers) {
  headers.forEach((header, i) => {
    const col = i + 1;
    let width = 120; // デフォルト

    // --- 広い列（180-200px）---
    if (/_name$/.test(header) || /_address$/.test(header)
        || header === 'address' || header === 'site_address') {
      width = 180;
    } else if (header === 'notes' || /_data$/.test(header)
        || /_note$/.test(header) || header === 'work_detail_other_text') {
      width = 200;
    } else if (header === 'skills' || header === 'licenses'
        || header === 'ng_customers' || header === 'special_training'
        || header === 'skill_training') {
      width = 180;
    } else if (/_kana$/.test(header)) {
      width = 160;
    // --- 中間（120-150px）---
    } else if (/_by$/.test(header)) {
      width = 150;
    } else if (/_date$/.test(header) || /_at$/.test(header)
        || /_start$/.test(header) || /_end$/.test(header)
        || header === 'timestamp') {
      width = 130;
    } else if (/_amount$/.test(header) || /_total$/.test(header)
        || /_rate$/.test(header) || /_price$/.test(header)
        || header === 'amount' || header === 'subtotal' || header === 'gross_margin') {
      width = 120;
    } else if (/_number$/.test(header) || /_no$/.test(header)) {
      width = 120;
    // --- 狭い列（80-100px）---
    } else if (header === 'email' || header === 'user_email') {
      width = 180;
    } else if (header === 'phone' || header === 'fax') {
      width = 100;
    } else if (/_id$/.test(header) || /_code$/.test(header)) {
      width = 100;
    } else if (header === 'status' || /_type$/.test(header) || /_format$/.test(header)) {
      width = 100;
    } else if (/^is_/.test(header) || /^has_/.test(header) || /^include_/.test(header)
        || /_is_/.test(header) || /_has_/.test(header)) {
      width = 80;
    } else if (header === 'year' || header === 'month' || header === 'sort_order'
        || header === 'quantity' || header === 'unit'
        || header === 'billing_year' || header === 'billing_month'
        || header === 'closing_day' || header === 'payment_day'
        || header === 'payment_month_offset' || header === 'fiscal_month_end'
        || header === 'honorific' || header === 'gender'
        || header === 'slot_count' || header === 'required_count'
        || header === 'assignment_count' || header === 'job_count') {
      width = 80;
    }

    sheet.setColumnWidth(col, width);
  });
}

/**
 * 全15テーブルに列幅を適用（列順変更しないテーブルにも適用）
 * GASエディタから実行: applyWidthsAllSheets()
 */
function applyWidthsAllSheets() {
  const db = getDb();
  const results = [];

  for (const [tableName, def] of Object.entries(TABLE_DEFINITIONS)) {
    const sheet = db.getSheetByName(def.sheetName);
    if (!sheet) {
      Logger.log('⚠ シート未検出: ' + def.sheetName);
      continue;
    }
    applyColumnWidths_(sheet, def.headers);
    results.push(def.sheetName);
    Logger.log('✓ 列幅適用: ' + def.sheetName);
  }

  Logger.log('=== 列幅適用完了: ' + results.length + '/15 シート ===');
  return results;
}

// =============================================================================
// ScriptProperties 確認（db_init_invoices.gs から移動）
// =============================================================================

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
