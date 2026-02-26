/**
 * Archive Service
 *
 * P2-5: データアーカイブ機能
 *
 * 年度単位でトランザクションデータを別スプレッドシートに移動し、
 * 現行DBのパフォーマンスを維持する。
 *
 * アーカイブ対象:
 * - T_Jobs（案件）
 * - T_JobAssignments（配置）
 * - T_Invoices（請求）
 * - T_InvoiceLines（請求明細）
 * - T_Payouts（支払）
 * - T_AuditLog（監査証跡）
 *
 * アーカイブ対象外（永続保持）:
 * - マスターテーブル（M_*）
 * - T_MonthlyStats（売上分析用）
 */

const ArchiveService = {

  // アーカイブ対象テーブル設定
  // foreignKey: 親テーブルのIDでフィルタする場合に指定（日付カラムがないテーブル用）
  ARCHIVE_TABLES: [
    { name: 'T_Jobs', dateColumn: 'work_date' },
    { name: 'T_JobAssignments', foreignKey: 'job_id', parentTable: 'T_Jobs' },
    { name: 'T_Invoices', dateColumn: 'issue_date', fiscalYearColumn: 'billing_year', fiscalMonthColumn: 'billing_month' },
    { name: 'T_InvoiceLines', dateColumn: 'work_date' },
    { name: 'T_Payouts', dateColumn: 'period_start' },
    { name: 'T_AuditLog', dateColumn: 'timestamp' }
  ],

  // アーカイブステップ定義
  STEPS: [
    'check_pending',
    'finalize_stats',
    'create_archive_db',
    'archive_T_Jobs',
    'archive_T_JobAssignments',
    'archive_T_Invoices',
    'archive_T_InvoiceLines',
    'archive_T_Payouts',
    'archive_T_AuditLog',
    'send_notification',
    'cleanup'
  ],

  /**
   * 年次アーカイブを実行（6分制限対応）
   * @param {number} fiscalYear - アーカイブ対象の年度（省略時は前年度）
   * @returns {Object} 実行結果
   */
  executeYearlyArchive(fiscalYear = null) {
    const lock = LockService.getScriptLock();

    try {
      if (!lock.tryLock(10000)) {
        Logger.log('Archive already running');
        return { success: false, error: 'ALREADY_RUNNING' };
      }

      // 対象年度の決定（決算月に基づく動的期間）
      const targetYear = fiscalYear || this.getCurrentFiscalYear() - 1;
      const range = getFiscalYearRange_(targetYear);
      const startDate = range.startDate;
      const endDate = range.endDate;

      Logger.log(`=== アーカイブ開始: ${targetYear}年度 (${startDate} - ${endDate}) ===`);

      // 進捗の取得
      const progress = this.getProgress(targetYear);
      const startTime = Date.now();

      // ステップを順次実行
      for (let i = progress.currentStep; i < this.STEPS.length; i++) {
        // 5分経過チェック（余裕を持って中断）
        if (Date.now() - startTime > 300000) {
          this.saveProgress(targetYear, i, progress.results);
          Logger.log(`アーカイブ一時停止: ステップ ${this.STEPS[i]} で中断、次回継続`);
          return { success: false, error: 'TIMEOUT_WILL_CONTINUE', step: this.STEPS[i] };
        }

        // ステップ実行
        const stepResult = this.executeStep(this.STEPS[i], targetYear, startDate, endDate, progress);

        if (!stepResult.success && stepResult.error !== 'SKIP') {
          Logger.log(`ステップ ${this.STEPS[i]} でエラー: ${stepResult.error}`);
          return { success: false, error: stepResult.error, step: this.STEPS[i] };
        }

        // 結果を保存
        if (stepResult.data) {
          progress.results[this.STEPS[i]] = stepResult.data;
        }
      }

      // 完了
      this.clearProgress(targetYear);
      Logger.log('=== アーカイブ完了 ===');

      return {
        success: true,
        fiscalYear: targetYear,
        results: progress.results
      };

    } catch (e) {
      Logger.log(`アーカイブエラー: ${e.message}`);
      logErr('Archive error', e);
      return { success: false, error: e.message };

    } finally {
      lock.releaseLock();
    }
  },

  /**
   * 各ステップを実行
   */
  executeStep(stepName, fiscalYear, startDate, endDate, progress) {
    Logger.log(`ステップ実行: ${stepName}`);

    switch (stepName) {
      case 'check_pending':
        // 未処理項目のチェック（警告のみ、中断はしない）
        const pending = this.checkPendingItems(fiscalYear);
        if (pending.hasItems) {
          Logger.log(`警告: 未処理項目があります (請求: ${pending.unpaidInvoices.length}, 支払: ${pending.unpaidPayroll.length})`);
        }
        return { success: true, data: pending };

      case 'finalize_stats':
        // 月次統計の確定
        this.finalizeYearlyStats(fiscalYear);
        return { success: true };

      case 'create_archive_db':
        // アーカイブ先DB作成
        const archiveDbId = this.getOrCreateArchiveDb(fiscalYear);
        progress.archiveDbId = archiveDbId;
        return { success: true, data: { archiveDbId } };

      case 'archive_T_Jobs':
      case 'archive_T_JobAssignments':
      case 'archive_T_Invoices':
      case 'archive_T_InvoiceLines':
      case 'archive_T_Payouts':
      case 'archive_T_AuditLog':
        // テーブルアーカイブ
        const tableName = stepName.replace('archive_', '');
        const tableConfig = this.ARCHIVE_TABLES.find(t => t.name === tableName);
        const result = this.archiveTable(tableName, tableConfig, fiscalYear, startDate, endDate, progress.archiveDbId, Date.now());
        return { success: true, data: result };

      case 'send_notification':
        // 完了通知送信
        ArchiveNotificationService.sendArchiveComplete(fiscalYear, progress.results);
        return { success: true };

      case 'cleanup':
        // 監査ログ記録
        this.logAudit('ARCHIVE_COMPLETED', fiscalYear, progress.results);
        return { success: true };

      default:
        return { success: false, error: 'UNKNOWN_STEP' };
    }
  },

  /**
   * テーブルデータをアーカイブ
   */
  archiveTable(tableName, tableConfig, fiscalYear, startDate, endDate, archiveDbId, startTime) {
    const currentDb = SpreadsheetApp.openById(getSpreadsheetId());
    const archiveDb = SpreadsheetApp.openById(archiveDbId);

    // currentSheet: 見つからなければスキップ（既存仕様維持）
    const sheetName = TABLE_SHEET_MAP[tableName];
    const currentSheet = findSheetFromDb(currentDb, tableName);
    if (!currentSheet) {
      Logger.log(`シート ${sheetName || tableName} が見つかりません`);
      return { movedCount: 0, remainingCount: 0 };
    }

    // archiveSheet: 見つからなければ新規作成
    let archiveSheet = findSheetFromDb(archiveDb, tableName);
    if (!archiveSheet) {
      archiveSheet = archiveDb.insertSheet(sheetName);
      const headers = currentSheet.getRange(1, 1, 1, currentSheet.getLastColumn()).getValues();
      archiveSheet.getRange(1, 1, 1, headers[0].length).setValues(headers);
    }

    // データ取得
    const data = currentSheet.getDataRange().getValues();
    if (data.length <= 1) {
      Logger.log(`${tableName}: データなし`);
      return { movedCount: 0, remainingCount: 0 };
    }

    const headers = data[0];

    // foreignKeyが指定されている場合は親テーブルから対象IDを取得
    let targetIds = null;
    if (tableConfig.foreignKey) {
      targetIds = this.getArchivedParentIds(archiveDbId, tableConfig.parentTable, tableConfig.foreignKey);
      if (targetIds.size === 0) {
        Logger.log(`${tableName}: 親テーブル ${tableConfig.parentTable} にアーカイブデータがありません`);
        return { movedCount: 0, remainingCount: 0 };
      }
      Logger.log(`${tableName}: 親テーブルから ${targetIds.size}件のIDを取得`);
    }

    const dateColIndex = tableConfig.dateColumn ? headers.indexOf(tableConfig.dateColumn) : -1;
    const foreignKeyIndex = tableConfig.foreignKey ? headers.indexOf(tableConfig.foreignKey) : -1;

    // foreignKeyが指定されている場合はそのカラムが必要
    if (tableConfig.foreignKey && foreignKeyIndex === -1) {
      throw new Error(`外部キーカラム ${tableConfig.foreignKey} が ${tableName} に見つかりません`);
    }

    // dateColumnが指定されていてforeignKeyがない場合は日付カラムが必要
    if (tableConfig.dateColumn && !tableConfig.foreignKey && dateColIndex === -1) {
      throw new Error(`日付カラム ${tableConfig.dateColumn} が ${tableName} に見つかりません`);
    }

    // 請求テーブルの場合は年度カラムも使用
    let fiscalYearColIndex = -1;
    let fiscalMonthColIndex = -1;
    if (tableConfig.fiscalYearColumn) {
      fiscalYearColIndex = headers.indexOf(tableConfig.fiscalYearColumn);
      fiscalMonthColIndex = headers.indexOf(tableConfig.fiscalMonthColumn);
    }

    // 対象行を分類
    const rowsToArchive = [];
    const rowsToKeep = [headers];

    let timeoutRemaining = null;
    for (let i = 1; i < data.length; i++) {
      // 500行ごとにタイムアウトチェック（4.5分 = 270秒）
      if (startTime && i % 500 === 0) {
        const elapsed = (Date.now() - startTime) / 1000;
        if (elapsed > 270) {
          Logger.log(`${tableName}: タイムアウト警告 - ${i-1}/${data.length-1}行処理済み, 残り${data.length - i}行未処理`);
          timeoutRemaining = data.length - i;
          // 未処理行を全てrowsToKeepに退避（データロス防止）
          for (let j = i; j < data.length; j++) {
            rowsToKeep.push(data[j]);
          }
          break;
        }
      }

      const row = data[i];
      let shouldArchive = false;

      // foreignKeyが指定されている場合は親テーブルのIDでフィルタ
      if (targetIds !== null) {
        const fkValue = row[foreignKeyIndex];
        shouldArchive = fkValue && targetIds.has(String(fkValue));
      }
      // 請求テーブルは billing_year/month で判定
      else if (fiscalYearColIndex !== -1 && row[fiscalYearColIndex]) {
        const billingYear = row[fiscalYearColIndex];
        const billingMonth = row[fiscalMonthColIndex];
        shouldArchive = this.isInFiscalYear(billingYear, billingMonth, fiscalYear);
      }
      // その他のテーブルは日付で判定
      else if (dateColIndex !== -1) {
        const rowDate = row[dateColIndex];
        if (rowDate) {
          shouldArchive = this.isDateInRange(rowDate, startDate, endDate);
        }
      }

      if (shouldArchive) {
        rowsToArchive.push(row);
      } else {
        rowsToKeep.push(row);
      }
    }

    // アーカイブ先に追記
    if (rowsToArchive.length > 0) {
      const lastRow = archiveSheet.getLastRow();
      archiveSheet.getRange(lastRow + 1, 1, rowsToArchive.length, rowsToArchive[0].length)
        .setValues(rowsToArchive);
    }

    // 現行DBを上書き
    currentSheet.clear();
    if (rowsToKeep.length > 0) {
      currentSheet.getRange(1, 1, rowsToKeep.length, rowsToKeep[0].length)
        .setValues(rowsToKeep);
    }

    SpreadsheetApp.flush();

    Logger.log(`${tableName}: ${rowsToArchive.length}件をアーカイブ, ${rowsToKeep.length - 1}件を保持`);

    return {
      movedCount: rowsToArchive.length,
      remainingCount: rowsToKeep.length - 1,
      ...(timeoutRemaining !== null ? { timeoutRemaining } : {})
    };
  },

  /**
   * 日付が範囲内かチェック
   */
  isDateInRange(date, startDate, endDate) {
    const d = new Date(date);
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    return d >= start && d <= end;
  },

  /**
   * 請求年月が対象年度内かチェック
   */
  isInFiscalYear(billingYear, billingMonth, fiscalYear) {
    const date = new Date(billingYear, billingMonth - 1, 1);
    return getFiscalYear_(date) === fiscalYear;
  },

  /**
   * アーカイブ済みの親テーブルからIDリストを取得
   * @param {string} archiveDbId - アーカイブDBのID
   * @param {string} parentTable - 親テーブル名（例: T_Jobs）
   * @param {string} idColumn - IDカラム名（例: job_id）
   * @returns {Set<string>} IDのSet
   */
  getArchivedParentIds(archiveDbId, parentTable, idColumn) {
    const archiveDb = SpreadsheetApp.openById(archiveDbId);
    const parentSheet = findSheetFromDb(archiveDb, parentTable);
    if (!parentSheet) {
      Logger.log(`アーカイブDBに ${TABLE_SHEET_MAP[parentTable] || parentTable} シートがありません`);
      return new Set();
    }

    const data = parentSheet.getDataRange().getValues();
    if (data.length <= 1) {
      return new Set();
    }

    const headers = data[0];
    const idColIndex = headers.indexOf(idColumn);
    if (idColIndex === -1) {
      Logger.log(`親テーブルに ${idColumn} カラムが見つかりません`);
      return new Set();
    }

    // IDをSetに格納（文字列として比較するため String() で変換）
    const ids = new Set();
    for (let i = 1; i < data.length; i++) {
      const id = data[i][idColIndex];
      if (id) {
        ids.add(String(id));
      }
    }

    return ids;
  },

  /**
   * 現在の年度を取得
   */
  getCurrentFiscalYear() {
    return getFiscalYear_(new Date());
  },

  /**
   * 年度の月次統計を全て確定
   * @returns {Object} 確定結果 { success: number, failed: string[] }
   */
  finalizeYearlyStats(fiscalYear) {
    Logger.log(`月次統計確定: ${fiscalYear}年度`);

    const failedMonths = [];
    let successCount = 0;

    const fiscalMonthEnd = _getFiscalMonthEndFromMaster_();
    const fiscalMonths = getFiscalMonths_(fiscalYear, fiscalMonthEnd);
    for (const { year: y, month: m } of fiscalMonths) {
      try {
        StatsService.finalizeMonthStats(y, m);
        successCount++;
      } catch (e) {
        Logger.log(`⚠️ ${y}/${m} 確定エラー: ${e.message}`);
        failedMonths.push(`${y}/${m}`);
      }
    }

    if (failedMonths.length > 0) {
      Logger.log(`⚠️ 月次統計確定: ${successCount}件成功, ${failedMonths.length}件失敗 (${failedMonths.join(', ')})`);
    } else {
      Logger.log(`✓ 月次統計確定完了: ${fiscalYear}年度 (12ヶ月)`);
    }

    return { success: successCount, failed: failedMonths };
  },

  /**
   * 未処理項目をチェック
   */
  checkPendingItems(fiscalYear) {
    const range = getFiscalYearRange_(fiscalYear);
    const startDate = range.startDate;
    const endDate = range.endDate;

    // 未発行請求書（年度全体）
    const unpaidInvoices = [];
    try {
      const fiscalMonthEnd = _getFiscalMonthEndFromMaster_();
      const fiscalMonths = getFiscalMonths_(fiscalYear, fiscalMonthEnd);
      for (const { year: y, month: m } of fiscalMonths) {
        const invoices = InvoiceRepository.findByPeriod(y, m);
        invoices.forEach(inv => {
          if (inv.status === 'unsent' || inv.status === 'hold') {
            unpaidInvoices.push({
              customerId: inv.customer_id,
              customerName: inv.customer_name || inv.customer_id,
              month: m
            });
          }
        });
      }
    } catch (e) {
      Logger.log(`請求チェックエラー: ${e.message}`);
    }

    // 未確定給与（配置があるのにpayout_idがないもの）
    const unpaidPayroll = [];
    try {
      // 対象年度の配置でpayout_idがnullのものを検索
      const assignments = AssignmentRepository.search({
        work_date_from: startDate,
        work_date_to: endDate
      });

      const staffWithoutPayout = new Map();
      assignments.forEach(a => {
        if (!a.payout_id && !a.is_deleted) {
          const key = a.staff_id;
          if (!staffWithoutPayout.has(key)) {
            staffWithoutPayout.set(key, {
              staffId: a.staff_id,
              staffName: a.staff_name || a.staff_id,
              period: `${fiscalYear}年度`
            });
          }
        }
      });

      unpaidPayroll.push(...staffWithoutPayout.values());
    } catch (e) {
      Logger.log(`給与チェックエラー: ${e.message}`);
    }

    return {
      hasItems: unpaidInvoices.length > 0 || unpaidPayroll.length > 0,
      unpaidInvoices,
      unpaidPayroll
    };
  },

  /**
   * アーカイブ先スプレッドシートを取得または作成
   */
  getOrCreateArchiveDb(fiscalYear) {
    const props = PropertiesService.getScriptProperties();
    const propKey = `ARCHIVE_DB_${fiscalYear}`;

    let archiveDbId = props.getProperty(propKey);

    if (!archiveDbId) {
      const projectName = props.getProperty('PROJECT_NAME') || 'gas-dispatch';

      // 新規スプレッドシート作成
      const archiveDb = SpreadsheetApp.create(`${projectName}-archive-${fiscalYear}`);
      archiveDbId = archiveDb.getId();

      // アーカイブフォルダに移動
      const folderId = props.getProperty('ARCHIVE_FOLDER_ID');
      if (folderId) {
        try {
          const file = DriveApp.getFileById(archiveDbId);
          const folder = DriveApp.getFolderById(folderId);
          file.moveTo(folder);
        } catch (e) {
          Logger.log(`フォルダ移動エラー: ${e.message}`);
        }
      }

      props.setProperty(propKey, archiveDbId);
      Logger.log(`アーカイブDB作成: ${archiveDbId}`);
    }

    // 不要シートのクリーンアップ（毎回実行）
    this._cleanupArchiveSheets(archiveDbId);

    return archiveDbId;
  },

  /**
   * アーカイブDBの不要シートを削除
   * - デフォルトシート（Sheet1/シート1）
   * - 旧日本語シート名（英語シートが存在する場合のみ）
   */
  _cleanupArchiveSheets(archiveDbId) {
    const archiveDb = SpreadsheetApp.openById(archiveDbId);
    const sheets = archiveDb.getSheets();

    // 最低1シートは残す必要がある
    if (sheets.length <= 1) return;

    // 英語シート名の一覧（TABLE_SHEET_MAPの値）
    const validSheetNames = new Set(Object.values(TABLE_SHEET_MAP));

    // 削除候補: デフォルトシート + 英語シートが存在する場合の旧日本語シート
    const sheetsToDelete = [];
    for (const sheet of sheets) {
      const name = sheet.getName();

      // デフォルトシートは常に削除候補
      if (name === 'Sheet1' || name === 'シート1') {
        sheetsToDelete.push(sheet);
        continue;
      }

      // 有効な英語シート名ならスキップ
      if (validSheetNames.has(name)) continue;

      // 旧日本語シート名のマッピング（対応する英語シートが存在する場合のみ削除）
      const japaneseToEnglish = {
        '顧客': 'Customers', 'スタッフ': 'Staff', '外注先': 'Subcontractors',
        '交通費': 'TransportFees', '自社情報': 'Company', '案件': 'Jobs',
        '案件枠': 'JobSlots', '配置': 'Assignments', '請求': 'Invoices',
        '請求明細': 'InvoiceLines', '支払': 'Payouts', '月次統計': 'MonthlyStats',
        '入金記録': 'Payments', 'ログ': 'AuditLog'
      };
      const englishName = japaneseToEnglish[name];
      if (englishName && archiveDb.getSheetByName(englishName)) {
        // 対応する英語シートが存在するので旧日本語シートは削除候補
        sheetsToDelete.push(sheet);
      }
      // 不明なシート名は削除しない（運用上のタブ等を保護）
    }

    // 全シート削除は不可なのでチェック
    const remaining = sheets.length - sheetsToDelete.length;
    if (remaining < 1) {
      sheetsToDelete.pop(); // 最後の1つは残す
    }

    for (const sheet of sheetsToDelete) {
      try {
        Logger.log(`不要シート削除: ${sheet.getName()}`);
        archiveDb.deleteSheet(sheet);
      } catch (e) {
        Logger.log(`シート削除エラー: ${sheet.getName()} - ${e.message}`);
      }
    }
  },

  /**
   * アーカイブDBのIDを取得
   */
  getArchiveDbId(fiscalYear) {
    const props = PropertiesService.getScriptProperties();
    return props.getProperty(`ARCHIVE_DB_${fiscalYear}`);
  },

  /**
   * 進捗を取得
   */
  getProgress(fiscalYear) {
    const props = PropertiesService.getScriptProperties();
    const progressKey = `ARCHIVE_PROGRESS_${fiscalYear}`;
    const progressJson = props.getProperty(progressKey);

    if (progressJson) {
      return JSON.parse(progressJson);
    }

    return {
      currentStep: 0,
      results: {},
      archiveDbId: null
    };
  },

  /**
   * 進捗を保存
   */
  saveProgress(fiscalYear, currentStep, results) {
    const props = PropertiesService.getScriptProperties();
    const progressKey = `ARCHIVE_PROGRESS_${fiscalYear}`;

    props.setProperty(progressKey, JSON.stringify({
      currentStep,
      results,
      archiveDbId: this.getArchiveDbId(fiscalYear),
      lastUpdate: new Date().toISOString()
    }));
  },

  /**
   * 進捗をクリア
   */
  clearProgress(fiscalYear) {
    const props = PropertiesService.getScriptProperties();
    props.deleteProperty(`ARCHIVE_PROGRESS_${fiscalYear}`);
  },

  /**
   * 監査ログ記録
   */
  logAudit(eventType, fiscalYear, details) {
    try {
      if (typeof logToAudit === 'function') {
        logToAudit(eventType, 'System', null, null, {
          fiscalYear,
          ...details
        });
      }
    } catch (e) {
      Logger.log(`監査ログエラー: ${e.message}`);
    }
  },

  /**
   * アーカイブ延期設定
   */
  postponeArchive(newDate) {
    const props = PropertiesService.getScriptProperties();
    props.setProperty('ARCHIVE_POSTPONE_DATE', newDate);
    Logger.log(`アーカイブ延期: ${newDate}`);
  },

  /**
   * 延期日を取得
   */
  getPostponeDate() {
    const props = PropertiesService.getScriptProperties();
    return props.getProperty('ARCHIVE_POSTPONE_DATE');
  },

  /**
   * 延期設定をクリア
   */
  clearPostpone() {
    const props = PropertiesService.getScriptProperties();
    props.deleteProperty('ARCHIVE_POSTPONE_DATE');
  }
};
