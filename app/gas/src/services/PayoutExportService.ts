/**
 * Payout Export Service
 *
 * 振込金額集計のExcelエクスポート機能
 * InvoiceExportServiceのパターン（動的Sheets作成 → xlsx変換）を踏襲
 */

interface PayoutExportResult {
  fileId: string;
  url: string;
  fileName: string;
  recordCount: number;
}

interface ExistingFileCheckResult {
  exists: boolean;
  existingFile?: {
    id: string;
    name: string;
    url: string;
    modifiedDate: string;
  };
  error?: string;
}

interface ExportFolderStatus {
  configured: boolean;
  folderId?: string;
  folderName?: string;
  url?: string;
  error?: string;
  setupGuide?: string;
}

const PayoutExportService = {
  /**
   * 同名ファイルの存在をチェック
   * @param fromDate - 開始日（YYYY-MM-DD）
   * @param toDate - 終了日（YYYY-MM-DD）
   * @returns チェック結果
   */
  checkExistingFile: function(fromDate: string, toDate: string): ExistingFileCheckResult {
    try {
      const folder = this._getOutputFolder();
      const fileName = this._generateFileName(fromDate, toDate);

      const files = folder.getFilesByName(fileName);
      if (files.hasNext()) {
        const file = files.next();
        return {
          exists: true,
          existingFile: {
            id: file.getId(),
            name: file.getName(),
            url: file.getUrl(),
            modifiedDate: file.getLastUpdated().toISOString()
          }
        };
      }
      return { exists: false };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      logErr('checkExistingFile', error);
      return { exists: false, error: msg };
    }
  },

  /**
   * ファイル名を生成
   * @param fromDate - 開始日（YYYY-MM-DD）
   * @param toDate - 終了日（YYYY-MM-DD）
   * @param options - オプション（addTimestamp: true で日付を追加）
   * @returns ファイル名
   */
  _generateFileName: function(fromDate: string, toDate: string, options: { addTimestamp?: boolean } = {}): string {
    const timestamp = options.addTimestamp
      ? '_' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd')
      : '';
    return '振込金額集計_' + fromDate + '_' + toDate + timestamp + '.xlsx';
  },

  /**
   * Excel出力のメインエントリーポイント
   * @param fromDate - 開始日（YYYY-MM-DD）
   * @param toDate - 終了日（YYYY-MM-DD）
   * @param options - オプション（action: 'overwrite'|'rename' で重複ファイル処理を指定）
   * @returns エクスポート結果
   */
  exportToExcel: function(fromDate: string, toDate: string, options: { action?: string } = {}): PayoutExportResult {
    // 1. データ取得
    const payouts = PayoutService.getPayoutReport(fromDate, toDate);

    // 2. スプレッドシート作成（テンプレートなし、動的生成）
    const ss = SpreadsheetApp.create('振込集計_' + fromDate + '_' + toDate);
    const ssId = ss.getId();

    try {
      // 3. シート1: 支払い一覧
      const sheet1 = ss.getActiveSheet();
      sheet1.setName('支払い一覧');
      this._populatePayoutList(sheet1, payouts);

      // 4. シート2: 月別集計
      const sheet2 = ss.insertSheet('月別集計');
      this._populateMonthlyAggregation(sheet2, payouts);

      // 5. xlsx変換
      SpreadsheetApp.flush();
      const xlsxBlob = this._exportToXlsx(ssId);

      // 6. Driveに保存
      const folder = this._getOutputFolder();

      // ファイル名を生成（renameの場合はタイムスタンプ付き）
      const addTimestamp = options.action === 'rename';
      const fileName = this._generateFileName(fromDate, toDate, { addTimestamp });
      xlsxBlob.setName(fileName);

      // 上書きの場合は既存ファイルを削除
      if (options.action === 'overwrite') {
        const existingFiles = folder.getFilesByName(this._generateFileName(fromDate, toDate));
        while (existingFiles.hasNext()) {
          existingFiles.next().setTrashed(true);
        }
      }

      const file = folder.createFile(xlsxBlob);

      return {
        fileId: file.getId(),
        url: file.getUrl(),
        fileName: fileName,
        recordCount: payouts.length
      };
    } finally {
      // 7. 一時SSを必ず削除（成功・失敗に関わらず）
      try {
        DriveApp.getFileById(ssId).setTrashed(true);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn('Failed to trash temp spreadsheet: ' + msg);
      }
    }
  },

  /**
   * 支払い一覧シートにデータを書き込み
   * @param sheet - 対象シート
   * @param payouts - 支払いデータ配列
   */
  _populatePayoutList: function(sheet: GoogleAppsScript.Spreadsheet.Sheet, payouts: (PayoutRecord & { target_name: string })[]): void {
    // ヘッダー（源泉徴収を含む）
    const headers = ['支払日', '支払先名', '区分', '基本金額', '交通費', '調整額', '源泉徴収', '合計金額', '備考'];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

    // 列幅を固定（A4印刷用、合計685px）
    const columnWidths = [75, 120, 55, 70, 60, 60, 70, 75, 100];
    columnWidths.forEach(function(width, i) {
      sheet.setColumnWidth(i + 1, width);
    });

    // ヘッダー行のスタイル設定
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setBackground('#F7FAFC');
    headerRange.setFontWeight('bold');

    // ヘッダー行をフリーズ（印刷時に各ページで繰り返し）
    sheet.setFrozenRows(1);

    // データ行
    if (payouts.length === 0) {
      return;
    }

    const rows = payouts.map(function(p) {
      return [
        p.paid_date,
        p.target_name || '',
        p.payout_type === 'STAFF' ? 'スタッフ' : '外注',
        p.base_amount || 0,
        p.transport_amount || 0,
        p.adjustment_amount || 0,
        p.tax_amount || 0,
        p.total_amount || 0,
        p.notes || ''
      ];
    });

    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);

    // 金額列の書式設定（通貨）
    const amountColumns = [4, 5, 6, 7, 8]; // D, E, F, G, H列
    amountColumns.forEach(function(col) {
      sheet.getRange(2, col, rows.length, 1).setNumberFormat('#,##0');
    });
  },

  /**
   * 月別集計シートにデータを書き込み
   * @param sheet - 対象シート
   * @param payouts - 支払いデータ配列
   */
  _populateMonthlyAggregation: function(sheet: GoogleAppsScript.Spreadsheet.Sheet, payouts: (PayoutRecord & { target_name: string })[]): void {
    // 月別に集計（源泉徴収を含む）
    const monthly: Record<string, { count: number; base: number; transport: number; adjustment: number; tax: number; total: number }> = {};
    payouts.forEach(function(p) {
      if (!p.paid_date) return;
      const ym = p.paid_date.substring(0, 7); // YYYY-MM
      if (!monthly[ym]) {
        monthly[ym] = { count: 0, base: 0, transport: 0, adjustment: 0, tax: 0, total: 0 };
      }
      monthly[ym].count++;
      monthly[ym].base += p.base_amount || 0;
      monthly[ym].transport += p.transport_amount || 0;
      monthly[ym].adjustment += p.adjustment_amount || 0;
      monthly[ym].tax += p.tax_amount || 0;
      monthly[ym].total += p.total_amount || 0;
    });

    // ヘッダー（源泉徴収を含む）
    const headers = ['年月', '件数', '基本金額計', '交通費計', '調整額計', '源泉徴収計', '合計金額計'];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

    // ヘッダー行のスタイル設定
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setBackground('#F7FAFC');
    headerRange.setFontWeight('bold');

    // データ行（源泉徴収を含む）
    const sortedKeys = Object.keys(monthly).sort();
    if (sortedKeys.length === 0) {
      return;
    }

    const rows = sortedKeys.map(function(ym) {
      return [
        ym,
        monthly[ym].count,
        monthly[ym].base,
        monthly[ym].transport,
        monthly[ym].adjustment,
        monthly[ym].tax,
        monthly[ym].total
      ];
    });

    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);

    // 金額列の書式設定（通貨）
    const amountColumns = [3, 4, 5, 6, 7]; // C, D, E, F, G列
    amountColumns.forEach(function(col) {
      sheet.getRange(2, col, rows.length, 1).setNumberFormat('#,##0');
    });

    // 合計行を追加
    const totalRow = rows.length + 2;
    const totals = sortedKeys.reduce(function(acc, ym) {
      acc.count += monthly[ym].count;
      acc.base += monthly[ym].base;
      acc.transport += monthly[ym].transport;
      acc.adjustment += monthly[ym].adjustment;
      acc.tax += monthly[ym].tax;
      acc.total += monthly[ym].total;
      return acc;
    }, { count: 0, base: 0, transport: 0, adjustment: 0, tax: 0, total: 0 });

    sheet.getRange(totalRow, 1, 1, headers.length).setValues([[
      '合計',
      totals.count,
      totals.base,
      totals.transport,
      totals.adjustment,
      totals.tax,
      totals.total
    ]]);

    // 合計行のスタイル
    const totalRange = sheet.getRange(totalRow, 1, 1, headers.length);
    totalRange.setFontWeight('bold');
    totalRange.setBackground('#EDF2F7');

    // 合計行の金額書式
    amountColumns.forEach(function(col) {
      sheet.getRange(totalRow, col, 1, 1).setNumberFormat('#,##0');
    });

    // 列幅を固定（A4印刷用、合計550px）
    const columnWidths = [70, 50, 90, 80, 80, 90, 90];
    columnWidths.forEach(function(width, i) {
      sheet.setColumnWidth(i + 1, width);
    });

    // ヘッダー行をフリーズ（印刷時に各ページで繰り返し）
    sheet.setFrozenRows(1);
  },

  /**
   * スプレッドシートをxlsx形式に変換
   * @param spreadsheetId - スプレッドシートID
   * @returns xlsxのBlob
   */
  _exportToXlsx: function(spreadsheetId: string): GoogleAppsScript.Base.Blob {
    const url = 'https://docs.google.com/spreadsheets/d/' + spreadsheetId + '/export?format=xlsx';
    const token = ScriptApp.getOAuthToken();
    const response = UrlFetchApp.fetch(url, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    return response.getBlob().setContentType(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
  },

  /**
   * 出力先フォルダIDのScriptProperty名
   */
  PAYOUT_EXPORT_FOLDER_KEY: 'PAYOUT_EXPORT_FOLDER_ID',

  /**
   * 出力先フォルダを取得
   * ScriptPropertiesから取得、未設定時はエラー
   * @returns 出力先フォルダ
   */
  _getOutputFolder: function(): GoogleAppsScript.Drive.Folder {
    const props = PropertiesService.getScriptProperties();
    const folderId = props.getProperty(this.PAYOUT_EXPORT_FOLDER_KEY);

    if (!folderId) {
      throw new Error(
        'PAYOUT_EXPORT_FOLDER_ID が未設定です。\n' +
        'GASエディタで setPayoutExportFolderId("フォルダID") を実行してください。'
      );
    }

    try {
      return DriveApp.getFolderById(folderId);
    } catch (e) {
      throw new Error(
        '支払いエクスポートフォルダにアクセスできません（ID: ' + folderId + '）。\n' +
        'フォルダが削除されたか、アクセス権限がない可能性があります。'
      );
    }
  },

  /**
   * エクスポートフォルダの設定状況を確認
   * @returns フォルダステータス
   */
  getExportFolderStatus: function(): ExportFolderStatus {
    const props = PropertiesService.getScriptProperties();
    const folderId = props.getProperty(this.PAYOUT_EXPORT_FOLDER_KEY);

    if (!folderId) {
      return {
        configured: false,
        setupGuide: 'GASエディタで setPayoutExportFolderId("フォルダID") を実行してください。'
      };
    }

    try {
      const folder = DriveApp.getFolderById(folderId);
      return {
        configured: true,
        folderId: folderId,
        folderName: folder.getName(),
        url: 'https://drive.google.com/drive/folders/' + folderId
      };
    } catch (e) {
      return {
        configured: false,
        folderId: folderId,
        error: 'フォルダにアクセスできません',
        setupGuide: 'setPayoutExportFolderId("フォルダID") を再実行してフォルダIDを更新してください。'
      };
    }
  }
};

/**
 * 支払いエクスポートフォルダを設定（GASエディタから一度だけ実行）
 * gas-dispatch-system > 出力 > 給与明細
 * https://drive.google.com/drive/folders/1IIs43RoTkaKPOWPQgjEmvGgWxc4n_ohI
 */
function setPayoutExportFolderId(folderId: string): void {
  if (!folderId) {
    throw new Error('folderId is required');
  }
  PropertiesService.getScriptProperties().setProperty('PAYOUT_EXPORT_FOLDER_ID', folderId);
  Logger.log('Payout export folder set to: ' + folderId);
  Logger.log('URL: https://drive.google.com/drive/folders/' + folderId);
}
