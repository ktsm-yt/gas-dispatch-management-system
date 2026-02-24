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
