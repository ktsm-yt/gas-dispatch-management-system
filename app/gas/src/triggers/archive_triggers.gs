/**
 * Archive Triggers
 *
 * P2-5: データアーカイブ用のトリガー管理
 *
 * スケジュール:
 * - 毎日 3:00 AM: dailyArchiveCheck() - 日付に応じて処理を分岐
 *   - 3/15: 事前通知メール送信
 *   - 4/1: 自動アーカイブ実行（延期設定がなければ）
 *
 * 猶予期間: 年度終了後12ヶ月（例: 2025年度は2027年4月にアーカイブ）
 *
 * トリガーの設定:
 * - GASエディタから setupArchiveTriggers() を実行
 */

/**
 * アーカイブトリガーをセットアップ
 * GASエディタから実行: setupArchiveTriggers()
 */
function setupArchiveTriggers() {
  // 既存のトリガーを削除（重複防止）
  removeArchiveTriggers();

  Logger.log('=== アーカイブトリガーのセットアップ開始 ===');

  // 毎日 3:00 AM に実行（統計トリガーと同時刻だが別関数）
  const trigger = ScriptApp.newTrigger('dailyArchiveCheck')
    .timeBased()
    .atHour(3)
    .everyDays(1)
    .inTimezone('Asia/Tokyo')
    .create();

  Logger.log(`✓ アーカイブトリガー設定完了 (ID: ${trigger.getUniqueId()})`);
  Logger.log('  - 実行時刻: 毎日 3:00 AM (JST)');
  Logger.log('  - 3/15: 事前通知メール送信');
  Logger.log('  - 4/1: 自動アーカイブ実行（2年前の年度が対象）');

  Logger.log('\n=== セットアップ完了 ===');
}

/**
 * アーカイブトリガーを削除
 * GASエディタから実行: removeArchiveTriggers()
 */
function removeArchiveTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  let removedCount = 0;

  for (const trigger of triggers) {
    const handlerName = trigger.getHandlerFunction();

    if (handlerName === 'dailyArchiveCheck') {
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
 * GASエディタから実行: listArchiveTriggers()
 */
function listArchiveTriggers() {
  const triggers = ScriptApp.getProjectTriggers();

  Logger.log('=== 現在のアーカイブトリガー一覧 ===');

  const archiveTriggers = triggers.filter(t => {
    return t.getHandlerFunction() === 'dailyArchiveCheck';
  });

  if (archiveTriggers.length === 0) {
    Logger.log('アーカイブ関連のトリガーは設定されていません');
    Logger.log('setupArchiveTriggers() を実行してセットアップしてください');
    return;
  }

  for (const trigger of archiveTriggers) {
    Logger.log(`- ${trigger.getHandlerFunction()}`);
    Logger.log(`  ID: ${trigger.getUniqueId()}`);
    Logger.log(`  Type: ${trigger.getEventType()}`);
  }
}

// ========================================
// トリガーから呼び出される関数
// ========================================

/**
 * 日次アーカイブチェック（トリガーから呼び出し）
 * 毎日 3:00 AM に実行
 */
function dailyArchiveCheck() {
  const today = new Date();
  const month = today.getMonth() + 1; // 1-12
  const day = today.getDate();

  Logger.log(`=== 日次アーカイブチェック: ${today.toISOString()} ===`);
  Logger.log(`本日: ${month}月${day}日`);

  // 延期設定をチェック
  const postponeDate = ArchiveService.getPostponeDate();
  if (postponeDate) {
    const postpone = new Date(postponeDate);
    if (today < postpone) {
      Logger.log(`アーカイブ延期中: ${postponeDate}まで`);
      return;
    } else {
      // 延期期限を過ぎたらクリア
      ArchiveService.clearPostpone();
      Logger.log('延期期限を過ぎたため、延期設定をクリアしました');
    }
  }

  // 3月15日: 事前通知（4月1日のアーカイブを予告）
  if (month === 3 && day === 15) {
    Logger.log('事前通知を送信します');
    try {
      // 4月1日にアーカイブされる年度 = 現在年度 - 1（3月時点では前年度扱い）
      const targetFiscalYear = ArchiveService.getCurrentFiscalYear() - 1;
      ArchiveNotificationService.sendArchiveWarning(targetFiscalYear);
      Logger.log(`✓ 事前通知送信完了: ${targetFiscalYear}年度`);
    } catch (error) {
      Logger.log(`✗ 事前通知エラー: ${error.message}`);
      logErr('Archive warning error', error);
    }
    return;
  }

  // 4月1日: 自動アーカイブ実行（2年前の年度が対象）
  if (month === 4 && day === 1) {
    Logger.log('自動アーカイブを実行します');
    try {
      // 4月時点での2年前 = 12ヶ月の猶予期間を確保
      const targetFiscalYear = ArchiveService.getCurrentFiscalYear() - 2;
      const result = ArchiveService.executeYearlyArchive(targetFiscalYear);

      if (result.success) {
        Logger.log(`✓ アーカイブ完了: ${targetFiscalYear}年度`);
      } else if (result.error === 'TIMEOUT_WILL_CONTINUE') {
        Logger.log(`アーカイブ継続中: ${result.step} で一時停止`);
      } else {
        Logger.log(`✗ アーカイブエラー: ${result.error}`);
        ArchiveNotificationService.sendArchiveError(targetFiscalYear, result.error);
      }
    } catch (error) {
      Logger.log(`✗ アーカイブエラー: ${error.message}`);
      logErr('Archive execution error', error);
      ArchiveNotificationService.sendArchiveError(
        ArchiveService.getCurrentFiscalYear() - 2,
        error
      );
    }
    return;
  }

  // 4月2日〜4月7日: 中断したアーカイブの継続
  if (month === 4 && day >= 2 && day <= 7) {
    const targetFiscalYear = ArchiveService.getCurrentFiscalYear() - 2;
    const progress = ArchiveService.getProgress(targetFiscalYear);

    if (progress.currentStep > 0) {
      Logger.log(`アーカイブ継続: ステップ ${progress.currentStep} から再開（${targetFiscalYear}年度）`);
      try {
        const result = ArchiveService.executeYearlyArchive(targetFiscalYear);

        if (result.success) {
          Logger.log('✓ アーカイブ完了');
        } else if (result.error === 'TIMEOUT_WILL_CONTINUE') {
          Logger.log(`アーカイブ継続中: ${result.step} で一時停止`);
        } else {
          Logger.log(`✗ アーカイブエラー: ${result.error}`);
        }
      } catch (error) {
        Logger.log(`✗ アーカイブエラー: ${error.message}`);
        logErr('Archive continuation error', error);
      }
    } else {
      Logger.log('継続するアーカイブ処理はありません');
    }
    return;
  }

  Logger.log('本日は処理対象日ではありません');
}

// ========================================
// 手動実行用関数
// ========================================

/**
 * 手動アーカイブ実行（管理用）
 * GASエディタから実行: manualArchive(2024)
 * @param {number} fiscalYear - アーカイブ対象年度
 */
function manualArchive(fiscalYear) {
  Logger.log(`=== 手動アーカイブ: ${fiscalYear}年度 ===`);

  if (!fiscalYear) {
    Logger.log('エラー: 年度を指定してください');
    Logger.log('例: manualArchive(2024)');
    return;
  }

  const currentFiscalYear = ArchiveService.getCurrentFiscalYear();
  if (fiscalYear >= currentFiscalYear) {
    Logger.log(`警告: ${fiscalYear}年度は現在進行中または未来の年度です`);
    Logger.log(`現在の年度: ${currentFiscalYear}年度`);
    Logger.log('続行しますか？（本番環境では注意）');
  }

  try {
    const result = ArchiveService.executeYearlyArchive(fiscalYear);

    if (result.success) {
      Logger.log('✓ アーカイブ完了');
      Logger.log(JSON.stringify(result.results, null, 2));
    } else if (result.error === 'TIMEOUT_WILL_CONTINUE') {
      Logger.log(`アーカイブ継続中: ${result.step} で一時停止`);
      Logger.log('再度 manualArchive() を実行すると継続します');
    } else {
      Logger.log(`✗ アーカイブエラー: ${result.error}`);
    }

  } catch (error) {
    Logger.log(`✗ エラー: ${error.message}`);
    logErr('Manual archive error', error);
  }
}

/**
 * 手動で事前通知を送信（テスト用）
 * GASエディタから実行: manualSendArchiveWarning(2024)
 * @param {number} fiscalYear - 対象年度
 */
function manualSendArchiveWarning(fiscalYear) {
  Logger.log(`=== 手動事前通知: ${fiscalYear}年度 ===`);

  if (!fiscalYear) {
    fiscalYear = ArchiveService.getCurrentFiscalYear() - 1;
    Logger.log(`年度未指定のため前年度を使用: ${fiscalYear}年度`);
  }

  try {
    ArchiveNotificationService.sendArchiveWarning(fiscalYear);
    Logger.log('✓ 事前通知送信完了');
  } catch (error) {
    Logger.log(`✗ エラー: ${error.message}`);
  }
}

/**
 * アーカイブ進捗を確認
 * GASエディタから実行: checkArchiveProgress(2024)
 * @param {number} fiscalYear - 対象年度
 */
function checkArchiveProgress(fiscalYear) {
  if (!fiscalYear) {
    fiscalYear = ArchiveService.getCurrentFiscalYear() - 1;
  }

  Logger.log(`=== アーカイブ進捗確認: ${fiscalYear}年度 ===`);

  const progress = ArchiveService.getProgress(fiscalYear);

  if (progress.currentStep === 0) {
    Logger.log('進行中のアーカイブ処理はありません');
  } else {
    Logger.log(`現在のステップ: ${progress.currentStep} / ${ArchiveService.STEPS.length}`);
    Logger.log(`ステップ名: ${ArchiveService.STEPS[progress.currentStep]}`);
    Logger.log(`最終更新: ${progress.lastUpdate || '不明'}`);
    Logger.log(`アーカイブDB: ${progress.archiveDbId || '未作成'}`);
    Logger.log('結果:', JSON.stringify(progress.results, null, 2));
  }
}

/**
 * アーカイブ進捗をリセット（トラブルシューティング用）
 * GASエディタから実行: resetArchiveProgress(2024)
 * @param {number} fiscalYear - 対象年度
 */
function resetArchiveProgress(fiscalYear) {
  if (!fiscalYear) {
    Logger.log('エラー: 年度を指定してください');
    return;
  }

  Logger.log(`=== アーカイブ進捗リセット: ${fiscalYear}年度 ===`);

  ArchiveService.clearProgress(fiscalYear);

  Logger.log('✓ 進捗をリセットしました');
  Logger.log('次回 manualArchive() 実行時は最初から開始されます');
}

/**
 * アーカイブ延期設定
 * GASエディタから実行: postponeArchive('2026-07-01')
 * @param {string} newDate - 延期後の実行日（YYYY-MM-DD形式）
 */
function setArchivePostpone(newDate) {
  if (!newDate || !/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
    Logger.log('エラー: 日付をYYYY-MM-DD形式で指定してください');
    Logger.log('例: setArchivePostpone("2026-07-01")');
    return;
  }

  ArchiveService.postponeArchive(newDate);
  Logger.log(`✓ アーカイブを ${newDate} まで延期しました`);
}

/**
 * アーカイブ延期設定をクリア
 * GASエディタから実行: clearArchivePostpone()
 */
function clearArchivePostpone() {
  ArchiveService.clearPostpone();
  Logger.log('✓ アーカイブ延期設定をクリアしました');
}
