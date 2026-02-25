/**
 * production_reset.gs
 * 本番環境リセット＆検証ユーティリティ
 *
 * 使い方: GASエディタから各関数を個別実行
 * - clearAllForProduction()    → 全テーブルクリア
 * - cleanupDriveTestFiles()    → Drive内テストファイル削除
 * - verifyEmptyState()         → 空状態の検証
 */

// ============================================================
// 1-1: 全テーブルクリア
// ============================================================

/**
 * 全15テーブルのデータ行を削除（ヘッダー保持）
 * 実行順: トランザクション → マスター → ログ（参照整合性考慮）
 *
 * CacheService・ScriptPropertiesの進捗キーもクリア
 */
function clearAllForProduction() {
  Logger.log('=== 全データクリア開始 ===');
  const startTime = new Date();

  // クリア順序: トランザクション → マスター → ログ
  const clearOrder = [
    // トランザクション（子テーブルから）
    'T_InvoiceAdjustments',
    'T_InvoiceLines',
    'T_Invoices',
    'T_Payments',
    'T_Payouts',
    'T_MonthlyStats',
    'T_JobAssignments',
    'T_JobSlots',
    'T_Jobs',
    // マスター
    'M_TransportFee',
    'M_Subcontractors',
    'M_Staff',
    'M_Customers',
    'M_Company',
    // ログ
    'T_AuditLog'
  ];

  const results = {};
  for (const tableName of clearOrder) {
    try {
      const count = clearTable(tableName);
      results[tableName] = { success: true, rows: count };
    } catch (e) {
      results[tableName] = { success: false, error: e.message };
      Logger.log(`✗ ${tableName}: ${e.message}`);
    }
  }

  // CacheService クリア（既知のキー）
  try {
    const cache = CacheService.getScriptCache();
    cache.removeAll([
      'MasterCache_M_Staff',
      'MasterCache_M_Customers',
      'MasterCache_M_Subcontractors',
      'MasterCache_M_TransportFees',
      'MasterCache_M_Company'
    ]);
    Logger.log('✓ CacheService: マスターキャッシュクリア');
  } catch (e) {
    Logger.log(`✗ CacheService: ${e.message}`);
  }

  // ScriptProperties: アーカイブ進捗等の一時キーをクリア
  try {
    const props = PropertiesService.getScriptProperties();
    const keysToRemove = [];
    const allProps = props.getProperties();
    for (const key in allProps) {
      // ARCHIVE_PROGRESS, BATCH_ 系の一時キーのみ削除
      // DRIVE_, TEMPLATE_, SPREADSHEET_ID 等の設定キーは保持
      if (key.startsWith('ARCHIVE_PROGRESS') || key.startsWith('BATCH_')) {
        keysToRemove.push(key);
      }
    }
    if (keysToRemove.length > 0) {
      props.deleteProperties(keysToRemove);
      Logger.log(`✓ ScriptProperties: ${keysToRemove.length}件の一時キー削除 (${keysToRemove.join(', ')})`);
    } else {
      Logger.log('✓ ScriptProperties: 削除対象の一時キーなし');
    }
  } catch (e) {
    Logger.log(`✗ ScriptProperties: ${e.message}`);
  }

  // サマリー出力
  const elapsed = ((new Date() - startTime) / 1000).toFixed(1);
  Logger.log('\n=== クリア結果サマリー ===');
  let totalRows = 0;
  for (const [table, result] of Object.entries(results)) {
    if (result.success) {
      totalRows += result.rows;
      Logger.log(`✓ ${table}: ${result.rows}行クリア`);
    } else {
      Logger.log(`✗ ${table}: エラー - ${result.error}`);
    }
  }
  Logger.log(`\n合計: ${totalRows}行削除 (${elapsed}秒)`);
}

// ============================================================
// 1-2: Driveテストファイル削除
// ============================================================

/**
 * テスト顧客フォルダ配下のファイル・フォルダを全削除
 * ScriptPropertiesの CUSTOMER_FOLDERS_PARENT_ID を使用
 *
 * まず dryRunDriveCleanup() でドライラン確認してから実行推奨
 */
function cleanupDriveTestFiles() {
  Logger.log('=== Driveテストファイル削除開始 ===');
  _executeDriveCleanup(false);
}

/**
 * Drive削除のドライラン（実際には削除しない）
 * 削除対象のフォルダ・ファイルを一覧表示
 */
function dryRunDriveCleanup() {
  _executeDriveCleanup(true);
}

/** Drive削除の共通実装 */
function _executeDriveCleanup(dryRun) {
  Logger.log(dryRun ? '=== Driveクリーンアップ ドライラン ===' : '=== Driveテストファイル削除開始 ===');

  const props = PropertiesService.getScriptProperties();
  const parentId = props.getProperty('CUSTOMER_FOLDERS_PARENT_ID');

  if (!parentId) {
    Logger.log('✗ CUSTOMER_FOLDERS_PARENT_ID が未設定。cleanupをスキップ');
    return;
  }

  // 親フォルダ存在確認 + 名前ホワイトリスト
  let parentFolder;
  try {
    parentFolder = DriveApp.getFolderById(parentId);
    const folderName = parentFolder.getName();
    Logger.log(`✓ 顧客フォルダ親: ${folderName} (${parentId})`);

    // 安全チェック: 想定フォルダ名か確認
    if (folderName !== '顧客') {
      Logger.log(`✗ 親フォルダ名が「顧客」ではありません（${folderName}）。安全のため中断します。`);
      return;
    }
  } catch (e) {
    Logger.log(`✗ 顧客フォルダ親が見つかりません (ID: ${parentId}): ${e.message}`);
    return;
  }

  // 子フォルダを列挙して中身ごと削除
  let folderCount = 0;
  let fileCount = 0;
  const folders = parentFolder.getFolders();

  while (folders.hasNext()) {
    const folder = folders.next();
    const folderName = folder.getName();

    // フォルダ内のファイルをカウント/削除
    const files = folder.getFiles();
    while (files.hasNext()) {
      const file = files.next();
      if (dryRun) {
        Logger.log(`    [ドライラン] ファイル: ${file.getName()}`);
      } else {
        file.setTrashed(true);
      }
      fileCount++;
    }

    // サブフォルダ内のファイルも処理（請求書/支払 等のサブフォルダ）
    const subFolders = folder.getFolders();
    while (subFolders.hasNext()) {
      const subFolder = subFolders.next();
      const subFiles = subFolder.getFiles();
      while (subFiles.hasNext()) {
        const sf = subFiles.next();
        if (dryRun) {
          Logger.log(`    [ドライラン] ファイル: ${subFolder.getName()}/${sf.getName()}`);
        } else {
          sf.setTrashed(true);
        }
        fileCount++;
      }
      if (!dryRun) subFolder.setTrashed(true);
    }

    // フォルダ自体
    if (!dryRun) folder.setTrashed(true);
    folderCount++;
    Logger.log(`  ${dryRun ? '[ドライラン] 対象' : '削除'}: ${folderName}`);
  }

  // 支払エクスポートフォルダも確認
  const payoutFolderId = props.getProperty('PAYOUT_EXPORT_FOLDER_ID');
  if (payoutFolderId) {
    try {
      const payoutFolder = DriveApp.getFolderById(payoutFolderId);
      const payoutFiles = payoutFolder.getFiles();
      while (payoutFiles.hasNext()) {
        const pf = payoutFiles.next();
        if (dryRun) {
          Logger.log(`    [ドライラン] 支払ファイル: ${pf.getName()}`);
        } else {
          pf.setTrashed(true);
        }
        fileCount++;
      }
      Logger.log(`  ${dryRun ? '[ドライラン]' : ''} 支払エクスポートフォルダ: ${fileCount}ファイル`);
    } catch (e) {
      Logger.log(`  支払エクスポートフォルダ: ${e.message}`);
    }
  }

  // 請求書エクスポートフォルダも確認
  const invoiceFolderId = props.getProperty('INVOICE_EXPORT_FOLDER_ID');
  if (invoiceFolderId) {
    try {
      const invoiceFolder = DriveApp.getFolderById(invoiceFolderId);
      const invoiceFiles = invoiceFolder.getFiles();
      while (invoiceFiles.hasNext()) {
        const inf = invoiceFiles.next();
        if (dryRun) {
          Logger.log(`    [ドライラン] 請求書ファイル: ${inf.getName()}`);
        } else {
          inf.setTrashed(true);
        }
        fileCount++;
      }
      Logger.log(`  ${dryRun ? '[ドライラン]' : ''} 請求書エクスポートフォルダ: ファイル処理`);
    } catch (e) {
      Logger.log(`  請求書エクスポートフォルダ: ${e.message}`);
    }
  }

  if (dryRun) {
    Logger.log(`\n=== ドライラン完了: ${folderCount}フォルダ, ${fileCount}ファイルが削除対象 ===`);
    Logger.log('実際に削除するには cleanupDriveTestFiles() を実行してください。');
  } else {
    Logger.log(`\n=== 削除完了: ${folderCount}フォルダ, ${fileCount}ファイル ===`);
    Logger.log('※ ゴミ箱に移動しました。完全削除は30日後に自動実行されます。');
  }
}

// ============================================================
// 1-3: 空状態検証
// ============================================================

/**
 * 全15テーブルがヘッダーのみ（データ行0件）であることを確認
 */
function verifyEmptyState() {
  Logger.log('=== 空状態検証 ===');

  const tables = [
    'M_Company', 'M_Customers', 'M_Staff', 'M_Subcontractors', 'M_TransportFee',
    'T_Jobs', 'T_JobSlots', 'T_JobAssignments',
    'T_Invoices', 'T_InvoiceLines', 'T_InvoiceAdjustments',
    'T_Payouts', 'T_Payments', 'T_MonthlyStats', 'T_AuditLog'
  ];

  let allEmpty = true;

  for (const tableName of tables) {
    try {
      const sheet = getSheet(tableName);
      const lastRow = sheet.getLastRow();
      const dataRows = Math.max(0, lastRow - 1);

      if (dataRows > 0) {
        Logger.log(`✗ ${tableName}: ${dataRows}行のデータあり`);
        allEmpty = false;
      } else {
        Logger.log(`✓ ${tableName}: 空`);
      }
    } catch (e) {
      Logger.log(`✗ ${tableName}: シート取得エラー - ${e.message}`);
      allEmpty = false;
    }
  }

  Logger.log(allEmpty
    ? '\n✅ 全テーブルが空状態です。シードデータ投入の準備が完了しました。'
    : '\n⚠️ まだデータが残っているテーブルがあります。clearAllForProduction() を実行してください。'
  );

  return allEmpty;
}
