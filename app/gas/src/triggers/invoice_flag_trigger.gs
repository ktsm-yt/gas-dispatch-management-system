/**
 * Invoice Flag Trigger
 *
 * 配置保存時の請求書フラグ更新を非同期で処理する。
 * AssignmentService._deferMarkAffectedInvoices() が PropertiesService にジョブIDをキューイング。
 * 毎分実行の定期トリガーが処理する（セットアップ: setupInvoiceFlagTrigger() を1回実行）。
 */

/**
 * 定期トリガーのセットアップ（1回だけ手動実行）
 * GASエディタ or スクリプトから実行: setupInvoiceFlagTrigger()
 */
function setupInvoiceFlagTrigger() {
  // 既存トリガーを削除（重複防止）
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'handleDeferredInvoiceFlag') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  // 毎分実行の定期トリガーを作成
  ScriptApp.newTrigger('handleDeferredInvoiceFlag')
    .timeBased()
    .everyMinutes(1)
    .create();

  Logger.log('[InvoiceFlagTrigger] Setup complete: everyMinutes(1)');
}

/**
 * 定期トリガーハンドラ: 保留中の全ジョブIDに対してフラグ更新を実行
 * 保留キーがなければ即座にreturn（軽量）
 */
function handleDeferredInvoiceFlag() {
  var props = PropertiesService.getScriptProperties();
  var allProps = props.getProperties();
  var prefix = 'DEFERRED_INVOICE_FLAG_';
  var jobIds = [];

  // 保留中の全ジョブIDを収集
  for (var key in allProps) {
    if (key.indexOf(prefix) === 0) {
      try {
        var data = JSON.parse(allProps[key]);
        jobIds.push(data.jobId);
      } catch (parseErr) {
        jobIds.push(key.substring(prefix.length));
      }
      props.deleteProperty(key);
    }
  }

  if (jobIds.length === 0) {
    return; // 保留なし → 即座にreturn（毎分実行でも軽量）
  }

  Logger.log('[InvoiceFlagTrigger] Processing ' + jobIds.length + ' jobs: ' + jobIds.join(', '));

  for (var i = 0; i < jobIds.length; i++) {
    try {
      AssignmentService._markAffectedInvoicesChanged(jobIds[i]);
      Logger.log('[InvoiceFlagTrigger] Flagged invoices for jobId: ' + jobIds[i]);
    } catch (err) {
      Logger.log('[InvoiceFlagTrigger] Error flagging jobId ' + jobIds[i] + ': ' + err);
    }
  }
}
