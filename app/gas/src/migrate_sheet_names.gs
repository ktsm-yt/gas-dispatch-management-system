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
