/**
 * Stats Triggers
 *
 * P2-6: 売上分析ダッシュボード用のトリガー管理
 *
 * トリガーの設定:
 * - GASエディタから setupStatsTriggers() を実行
 * - または管理画面からsetup
 *
 * トリガーの削除:
 * - GASエディタから removeStatsTriggers() を実行
 */

/**
 * 統計トリガーをセットアップ
 * GASエディタから実行: setupStatsTriggers()
 */
function setupStatsTriggers() {
  // 既存のトリガーを削除（重複防止）
  removeStatsTriggers();

  Logger.log('=== 統計トリガーのセットアップ開始 ===');

  // 1. 日次トリガー: 毎日 3:00 AM に当月統計を更新
  const dailyTrigger = ScriptApp.newTrigger('dailyStatsUpdate')
    .timeBased()
    .atHour(3)
    .everyDays(1)
    .inTimezone('Asia/Tokyo')
    .create();

  Logger.log(`✓ 日次トリガー設定完了 (ID: ${dailyTrigger.getUniqueId()})`);
  Logger.log('  - 実行時刻: 毎日 3:00 AM (JST)');
  Logger.log('  - 処理内容: 当月の統計を再計算');

  // 2. 月次トリガー: 毎月1日に前月統計を確定
  const monthlyTrigger = ScriptApp.newTrigger('monthlyStatsFinalize')
    .timeBased()
    .onMonthDay(1)
    .atHour(4)
    .inTimezone('Asia/Tokyo')
    .create();

  Logger.log(`✓ 月次トリガー設定完了 (ID: ${monthlyTrigger.getUniqueId()})`);
  Logger.log('  - 実行時刻: 毎月1日 4:00 AM (JST)');
  Logger.log('  - 処理内容: 前月の統計を確定');

  Logger.log('\n=== セットアップ完了 ===');
  Logger.log('トリガー一覧は GAS エディタの「トリガー」から確認できます');
}

/**
 * 統計トリガーを削除
 * GASエディタから実行: removeStatsTriggers()
 */
function removeStatsTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  let removedCount = 0;

  for (const trigger of triggers) {
    const handlerName = trigger.getHandlerFunction();

    if (handlerName === 'dailyStatsUpdate' || handlerName === 'monthlyStatsFinalize') {
      ScriptApp.deleteTrigger(trigger);
      Logger.log(`✓ トリガー削除: ${handlerName} (ID: ${trigger.getUniqueId()})`);
      removedCount++;
    }
  }

  if (removedCount === 0) {
    Logger.log('削除対象のトリガーはありませんでした');
  } else {
    Logger.log(`合計 ${removedCount} 個のトリガーを削除しました`);
  }
}

/**
 * トリガー一覧を表示
 * GASエディタから実行: listStatsTriggers()
 */
function listStatsTriggers() {
  const triggers = ScriptApp.getProjectTriggers();

  Logger.log('=== 現在のトリガー一覧 ===');

  const statsTriggers = triggers.filter(t => {
    const name = t.getHandlerFunction();
    return name === 'dailyStatsUpdate' || name === 'monthlyStatsFinalize';
  });

  if (statsTriggers.length === 0) {
    Logger.log('統計関連のトリガーは設定されていません');
    Logger.log('setupStatsTriggers() を実行してセットアップしてください');
    return;
  }

  for (const trigger of statsTriggers) {
    Logger.log(`- ${trigger.getHandlerFunction()}`);
    Logger.log(`  ID: ${trigger.getUniqueId()}`);
    Logger.log(`  Type: ${trigger.getEventType()}`);
  }
}

// ========================================
// トリガーから呼び出される関数
// ========================================

/**
 * 日次統計更新（トリガーから呼び出し）
 * 毎日 3:00 AM に実行
 */
function dailyStatsUpdate() {
  const startTime = new Date();
  Logger.log(`=== 日次統計更新開始: ${startTime.toISOString()} ===`);

  try {
    const result = StatsService.updateCurrentMonthStats();

    if (result.success) {
      Logger.log('✓ 当月統計を更新しました');
      Logger.log(`  - 年月: ${result.stats.fiscal_year}年${result.stats.month}月`);
      Logger.log(`  - 売上合計: ¥${result.stats.invoice_total.toLocaleString()}`);
      Logger.log(`  - 粗利率: ${result.stats.margin_rate}%`);
    } else {
      if (result.error === 'ALREADY_FINALIZED') {
        Logger.log('当月は既に確定済みのためスキップしました');
      } else {
        Logger.log(`✗ 更新失敗: ${result.error}`);
      }
    }

  } catch (error) {
    Logger.log(`✗ エラーが発生しました: ${error.message}`);
    console.error('dailyStatsUpdate error:', error);
  }

  const endTime = new Date();
  const duration = (endTime - startTime) / 1000;
  Logger.log(`=== 日次統計更新完了: ${duration}秒 ===`);
}

/**
 * 月次統計確定（トリガーから呼び出し）
 * 毎月1日 4:00 AM に実行
 */
function monthlyStatsFinalize() {
  const startTime = new Date();
  Logger.log(`=== 月次統計確定開始: ${startTime.toISOString()} ===`);

  try {
    const result = StatsService.finalizePreviousMonthStats();

    if (result.success) {
      Logger.log('✓ 前月統計を確定しました');
      Logger.log(`  - 年月: ${result.stats.fiscal_year}年${result.stats.month}月`);
      Logger.log(`  - 売上合計: ¥${result.stats.invoice_total.toLocaleString()}`);
      Logger.log(`  - 粗利率: ${result.stats.margin_rate}%`);
      Logger.log(`  - 確定フラグ: ${result.stats.is_final}`);
    } else {
      Logger.log(`✗ 確定失敗: ${result.error}`);
    }

  } catch (error) {
    Logger.log(`✗ エラーが発生しました: ${error.message}`);
    console.error('monthlyStatsFinalize error:', error);
  }

  const endTime = new Date();
  const duration = (endTime - startTime) / 1000;
  Logger.log(`=== 月次統計確定完了: ${duration}秒 ===`);
}

/**
 * 手動で統計を再計算（管理用）
 * GASエディタから実行: manualRecalculateStats(2025, 1)
 * @param {number} year - 年
 * @param {number} month - 月
 */
function manualRecalculateStats(year, month) {
  Logger.log(`=== 手動統計再計算: ${year}年${month}月 ===`);

  try {
    const result = StatsService.updateMonthlyStats(year, month);

    if (result.success) {
      Logger.log('✓ 統計を再計算しました');
      Logger.log(JSON.stringify(result.stats, null, 2));
    } else {
      Logger.log(`✗ 再計算失敗: ${result.error}`);
    }

  } catch (error) {
    Logger.log(`✗ エラー: ${error.message}`);
  }
}

/**
 * 手動で統計を確定（管理用）
 * GASエディタから実行: manualFinalizeStats(2025, 1)
 * @param {number} year - 年
 * @param {number} month - 月
 */
function manualFinalizeStats(year, month) {
  Logger.log(`=== 手動統計確定: ${year}年${month}月 ===`);

  try {
    const result = StatsService.finalizeMonthStats(year, month);

    if (result.success) {
      Logger.log('✓ 統計を確定しました');
      Logger.log(JSON.stringify(result.stats, null, 2));
    } else {
      Logger.log(`✗ 確定失敗: ${result.error}`);
    }

  } catch (error) {
    Logger.log(`✗ エラー: ${error.message}`);
  }
}
