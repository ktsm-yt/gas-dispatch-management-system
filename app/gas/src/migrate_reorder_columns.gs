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
 * 列幅をヘッダー名パターンに基づいて自動設定
 * @param {Sheet} sheet - 対象シート
 * @param {string[]} headers - ヘッダー配列
 */
function applyColumnWidths_(sheet, headers) {
  headers.forEach((header, i) => {
    const col = i + 1;
    let width = 120; // デフォルト

    if (/_id$/.test(header) || /_code$/.test(header)) {
      width = 100;
    } else if (/_name$/.test(header) || header === 'address' || header === 'site_address') {
      width = 180;
    } else if (/_kana$/.test(header)) {
      width = 160;
    } else if (/_date$/.test(header) || /_at$/.test(header)) {
      width = 130;
    } else if (/^is_/.test(header) || /^has_/.test(header) || /^include_/.test(header)) {
      width = 80;
    } else if (/_amount$/.test(header) || /_total$/.test(header) || /_rate$/.test(header) || /_price$/.test(header)) {
      width = 120;
    } else if (/_number$/.test(header) || /_no$/.test(header)) {
      width = 120;
    } else if (header === 'notes' || /_data$/.test(header)) {
      width = 200;
    } else if (header === 'status' || /_type$/.test(header) || /_format$/.test(header)) {
      width = 100;
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
