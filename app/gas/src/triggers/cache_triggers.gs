/**
 * キャッシュウォームアップトリガー
 *
 * 毎朝6時に全マスターデータをCacheServiceに事前読み込みし、
 * 朝一のポータル起動時にサクサク表示できるようにする。
 */

/**
 * 毎朝6時にキャッシュをウォームアップ
 * トリガーから呼び出される
 */
function warmupMasterCache() {
  console.log('Starting daily cache warmup...');

  const result = MasterCache.warmup();

  if (result.success) {
    console.log('Cache warmup completed successfully:', {
      staff: result.staff,
      customers: result.customers,
      subcontractors: result.subcontractors,
      transportFees: result.transportFees,
      company: result.company,
      duration: result.duration + 'ms'
    });
  } else {
    console.error('Cache warmup failed:', result.error);
  }

  return result;
}

/**
 * キャッシュウォームアップトリガーを設定
 * 毎朝6時に実行
 */
function setupCacheWarmupTrigger() {
  // 既存のトリガーを削除
  const triggers = ScriptApp.getProjectTriggers();
  for (const trigger of triggers) {
    if (trigger.getHandlerFunction() === 'warmupMasterCache') {
      ScriptApp.deleteTrigger(trigger);
      console.log('Deleted existing warmupMasterCache trigger');
    }
  }

  // 新しいトリガーを作成（毎日6時）
  ScriptApp.newTrigger('warmupMasterCache')
    .timeBased()
    .atHour(6)
    .everyDays(1)
    .inTimezone('Asia/Tokyo')
    .create();

  console.log('Created warmupMasterCache trigger: daily at 6:00 AM JST');
}

/**
 * キャッシュウォームアップトリガーを削除
 */
function removeCacheWarmupTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  let removed = 0;

  for (const trigger of triggers) {
    if (trigger.getHandlerFunction() === 'warmupMasterCache') {
      ScriptApp.deleteTrigger(trigger);
      removed++;
    }
  }

  console.log('Removed ' + removed + ' warmupMasterCache trigger(s)');
}

/**
 * 手動でキャッシュをウォームアップ（テスト用）
 */
function testCacheWarmup() {
  const result = warmupMasterCache();
  console.log('Test warmup result:', JSON.stringify(result, null, 2));
  return result;
}
