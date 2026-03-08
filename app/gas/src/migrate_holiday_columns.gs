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
