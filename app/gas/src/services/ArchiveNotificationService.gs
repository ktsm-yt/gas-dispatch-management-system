/**
 * Archive Notification Service
 *
 * P2-5: アーカイブ関連の通知機能
 *
 * - 事前通知（3/15）: アーカイブ予告 + 未処理項目チェック
 * - 完了通知（4/1）: アーカイブ完了報告
 * - エラー通知: アーカイブ失敗時の通知
 *
 * 猶予期間: 年度終了後12ヶ月（例: 2025年度は2027年4月にアーカイブ）
 */

const ArchiveNotificationService = {

  /**
   * 事前通知メールを送信（3/15）
   * @param {number} fiscalYear - アーカイブ対象年度
   */
  sendArchiveWarning(fiscalYear) {
    const props = PropertiesService.getScriptProperties();
    const config = {
      COMPANY_NAME_SHORT: props.getProperty('COMPANY_NAME_SHORT') || 'システム',
      ADMIN_EMAILS: (props.getProperty('ADMIN_EMAILS') || '').split(',').filter(e => e.trim())
    };
    const pending = ArchiveService.checkPendingItems(fiscalYear);

    const yearStart = fiscalYear;
    const yearEnd = fiscalYear + 1;

    let subject, body;

    if (pending.hasItems) {
      // 未処理項目がある場合
      subject = '【重要】前年度（3月分まで）の請求・給与処理のご確認';

      body = `お疲れ様です。${config.COMPANY_NAME_SHORT || 'システム'}からのお知らせです。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  4月1日に前年度のデータ整理が行われます
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

4月1日以降、前年度（${yearStart}年4月〜${yearEnd}年3月）のデータは
「過去データ」として別の場所に移動され、編集できなくなります。

それまでに、前年度の請求書発行・給与処理を完了してください。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  未処理の項目があります ※処理が必要です
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

`;

      if (pending.unpaidInvoices.length > 0) {
        body += `【未発行の請求書】${pending.unpaidInvoices.length}件\n`;
        pending.unpaidInvoices.slice(0, 5).forEach(inv => {
          body += `  ・${inv.customerName} 様（${inv.month}月分）\n`;
        });
        if (pending.unpaidInvoices.length > 5) {
          body += `  ・他${pending.unpaidInvoices.length - 5}件\n`;
        }
        body += '\n  → 請求管理画面から請求書を発行してください\n\n';
      }

      if (pending.unpaidPayroll.length > 0) {
        body += `【未処理の給与】${pending.unpaidPayroll.length}件\n`;
        pending.unpaidPayroll.slice(0, 5).forEach(pay => {
          body += `  ・${pay.staffName}（${pay.period}）\n`;
        });
        if (pending.unpaidPayroll.length > 5) {
          body += `  ・他${pending.unpaidPayroll.length - 5}件\n`;
        }
        body += '\n  → 給与管理画面から処理を完了してください\n\n';
      }

    } else {
      // 未処理項目がない場合
      subject = '【お知らせ】前年度のデータ整理について';

      body = `お疲れ様です。${config.COMPANY_NAME_SHORT || 'システム'}からのお知らせです。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  4月1日に前年度のデータ整理が行われます
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

4月1日以降、前年度（${yearStart}年4月〜${yearEnd}年3月）のデータは
「過去データ」として別の場所に移動され、編集できなくなります。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  未処理の項目はありません
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

前年度の請求書・給与処理はすべて完了しています。
特に対応は必要ありません。

`;
    }

    // 共通フッター
    body += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

■ 4月1日以降でも過去データは確認できます
  請求管理・案件管理画面で「過去年度を表示」にチェックを入れると
  前年度のデータを確認できます（確認のみ、変更はできません）

■ ご不明な点があれば
  開発担当までご連絡ください
`;

    // メール送信
    this.sendEmail(subject, body, config);

    // 監査ログ
    ArchiveService.logAudit('ARCHIVE_WARNING_SENT', fiscalYear, {
      pending,
      sentAt: new Date().toISOString()
    });

    Logger.log(`事前通知送信完了: ${fiscalYear}年度`);
  },

  /**
   * アーカイブ完了通知を送信
   * @param {number} fiscalYear - アーカイブ完了年度
   * @param {Object} results - アーカイブ結果
   */
  sendArchiveComplete(fiscalYear, results) {
    const props = PropertiesService.getScriptProperties();
    const config = {
      COMPANY_NAME_SHORT: props.getProperty('COMPANY_NAME_SHORT') || 'システム',
      ADMIN_EMAILS: (props.getProperty('ADMIN_EMAILS') || '').split(',').filter(e => e.trim())
    };
    const yearStart = fiscalYear;
    const yearEnd = fiscalYear + 1;

    const subject = '【完了】前年度データのアーカイブが完了しました';

    let body = `お疲れ様です。${config.COMPANY_NAME_SHORT || 'システム'}からのお知らせです。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  前年度データのアーカイブが完了しました
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

対象期間: ${yearStart}年4月〜${yearEnd}年3月

【アーカイブ結果】
`;

    // 各テーブルの結果を追加
    const tableNames = {
      'archive_T_Jobs': '案件',
      'archive_T_JobAssignments': '配置',
      'archive_T_Invoices': '請求',
      'archive_T_InvoiceLines': '請求明細',
      'archive_T_Payouts': '支払'
    };

    let totalMoved = 0;
    for (const [key, label] of Object.entries(tableNames)) {
      if (results[key]) {
        body += `  ・${label}: ${results[key].movedCount}件 → アーカイブ完了\n`;
        totalMoved += results[key].movedCount;
      }
    }

    body += `
  合計: ${totalMoved}件のデータをアーカイブしました

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

■ 過去データの確認方法
  請求管理・案件管理画面で「過去年度を表示」にチェックを入れると
  アーカイブされたデータを確認できます（参照のみ）

■ 注意事項
  アーカイブされたデータは編集できません。
  修正が必要な場合は開発担当までご連絡ください。
`;

    // メール送信
    this.sendEmail(subject, body, config);

    Logger.log(`完了通知送信: ${fiscalYear}年度`);
  },

  /**
   * エラー通知を送信
   * @param {number} fiscalYear - 対象年度
   * @param {Error|string} error - エラー情報
   */
  sendArchiveError(fiscalYear, error) {
    const props = PropertiesService.getScriptProperties();
    const config = {
      COMPANY_NAME_SHORT: props.getProperty('COMPANY_NAME_SHORT') || 'システム',
      ADMIN_EMAILS: (props.getProperty('ADMIN_EMAILS') || '').split(',').filter(e => e.trim())
    };
    const errorMessage = typeof error === 'string' ? error : error.message;

    const subject = '【エラー】アーカイブ処理でエラーが発生しました';

    const body = `システム管理者様

アーカイブ処理でエラーが発生しました。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  エラー情報
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

対象年度: ${fiscalYear}年度
発生日時: ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}
エラー内容:
${errorMessage}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

アーカイブ処理は中断されています。
原因を確認し、手動で再実行してください。

手動実行方法:
1. GASエディタを開く
2. manualArchive(${fiscalYear}) を実行
`;

    // メール送信
    this.sendEmail(subject, body, config);

    // 監査ログ
    ArchiveService.logAudit('ARCHIVE_ERROR', fiscalYear, {
      error: errorMessage,
      sentAt: new Date().toISOString()
    });

    Logger.log(`エラー通知送信: ${fiscalYear}年度`);
  },

  /**
   * メール送信（共通）
   */
  sendEmail(subject, body, config) {
    const recipients = config.ADMIN_EMAILS || [];

    if (recipients.length === 0) {
      Logger.log('警告: ADMIN_EMAILSが設定されていません');
      return;
    }

    try {
      MailApp.sendEmail({
        to: recipients.join(','),
        subject: `【${config.COMPANY_NAME_SHORT || 'システム'}】${subject}`,
        body: body
      });
      Logger.log(`メール送信完了: ${recipients.join(', ')}`);
    } catch (e) {
      Logger.log(`メール送信エラー: ${e.message}`);
      logErr('Mail error', e);
    }
  }
};
