/**
 * Payout Detail Export Service
 *
 * スタッフ支払明細のExcelエクスポート機能
 * テンプレートコピー → データ書き込み → xlsx変換 → Drive保存
 */

interface PayoutDetailExportResult {
  fileId: string;
  url: string;
  fileName: string;
  assignmentCount: number;
}

interface PayoutDetailExistingFileResult {
  exists: boolean;
  existingFile?: {
    id: string;
    name: string;
    url: string;
    modifiedDate: string;
  };
  error?: string;
}

const PAY_UNIT_LABEL_MAP: Record<string, string> = {
  basic: '式', tobi: '式', age: '式', tobiage: '式',
  half: '半日', halfday: '半日', fullday: '終日', night: '夜勤',
  jotou: '式', shuujitsu: '終日', am: '半日', pm: '半日', yakin: '夜勤'
};

const PayoutDetailExportService = {

  TEMPLATE_KEY: 'PAYOUT_DETAIL_TEMPLATE_ID',
  MAX_ROWS: 200,

  /**
   * 支払明細をxlsx出力
   */
  exportPayoutDetail: function(
    payoutId: string,
    options: { action?: string } = {}
  ): PayoutDetailExportResult {
    // 1. Payout取得
    const payout = PayoutService.get(payoutId);
    if (!payout) {
      throw new Error('支払データが見つかりません: ' + payoutId);
    }

    if ((payout as unknown as Record<string, unknown>)._archived) {
      throw new Error('アーカイブデータの明細出力はサポートされていません');
    }

    const status = payout.status;
    if (status !== 'confirmed' && status !== 'paid') {
      throw new Error('確認済みまたは支払済の支払いのみ出力可能です（現在: ' + status + '）');
    }

    // 2. 配置+Job情報取得
    const assignmentsWithJobs = this._getAssignmentsWithJobInfo(payoutId);

    if (assignmentsWithJobs.length > this.MAX_ROWS) {
      throw new Error('配置数が上限(' + this.MAX_ROWS + '件)を超えています: ' + assignmentsWithJobs.length + '件');
    }

    // 3. テンプレートコピー
    const templateId = PropertiesService.getScriptProperties().getProperty(this.TEMPLATE_KEY);
    if (!templateId) {
      throw new Error(
        'PAYOUT_DETAIL_TEMPLATE_ID が未設定です。\n' +
        'GASエディタで setPayoutDetailTemplateId("テンプレートID") を実行してください。'
      );
    }

    const staffName = (payout as PayoutRecord & { target_name?: string }).target_name || '不明';
    const periodYm = payout.period_end ? payout.period_end.substring(0, 7) : '';
    const copyName = '支払明細_' + staffName + '_' + periodYm;

    const templateFile = DriveApp.getFileById(templateId);
    const copy = templateFile.makeCopy(copyName);
    const ssId = copy.getId();

    try {
      const ss = SpreadsheetApp.openById(ssId);
      const sheet = ss.getSheets()[0];

      // 4. ヘッダー情報書き込み
      this._writeHeader(sheet, payout, staffName);

      // 5. 明細行書き込み（Row 5〜）
      const dataStartRow = 5; // Row 1: title, Row 2: company, Row 3: blank, Row 4: col headers, Row 5+: data
      this._writeDetailRows(sheet, assignmentsWithJobs, dataStartRow);

      // 6. 合計行書き込み
      this._writeSummaryRow(sheet, payout, assignmentsWithJobs.length, dataStartRow);

      // 7. 罫線・列幅の書式設定
      this._applyTableFormatting(sheet, assignmentsWithJobs.length, dataStartRow);

      // 8. xlsx変換
      SpreadsheetApp.flush();
      const xlsxBlob = PayoutExportService._exportToXlsx(ssId);

      // 9. Drive保存（支払明細サブフォルダ）
      const folder = this._getOutputFolder();
      const addTimestamp = options.action === 'rename';
      const fileName = this._generateFileName(staffName, periodYm, { addTimestamp });
      xlsxBlob.setName(fileName);

      if (options.action === 'overwrite') {
        const existingFiles = folder.getFilesByName(this._generateFileName(staffName, periodYm));
        while (existingFiles.hasNext()) {
          existingFiles.next().setTrashed(true);
        }
      }

      const file = folder.createFile(xlsxBlob);

      return {
        fileId: file.getId(),
        url: file.getUrl(),
        fileName: fileName,
        assignmentCount: assignmentsWithJobs.length
      };
    } finally {
      try {
        DriveApp.getFileById(ssId).setTrashed(true);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn('Failed to trash temp spreadsheet: ' + msg);
      }
    }
  },

  /**
   * 同名ファイル存在チェック
   */
  checkExistingFile: function(payoutId: string): PayoutDetailExistingFileResult {
    try {
      const payout = PayoutService.get(payoutId);
      if (!payout) {
        return { exists: false, error: '支払データが見つかりません' };
      }

      const staffName = (payout as PayoutRecord & { target_name?: string }).target_name || '不明';
      const periodYm = payout.period_end ? payout.period_end.substring(0, 7) : '';
      const folder = this._getOutputFolder();
      const fileName = this._generateFileName(staffName, periodYm);

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
      logErr('PayoutDetailExportService.checkExistingFile', error);
      return { exists: false, error: msg };
    }
  },

  /**
   * 配置+Job情報を結合取得
   */
  _getAssignmentsWithJobInfo: function(payoutId: string): Array<{
    work_date: string;
    site_name: string;
    start_time: string;
    pay_unit: string;
    wage_rate: number;
    transport_amount: number;
  }> {
    const linkedAssignments = AssignmentRepository.search({ payout_id: payoutId })
      .filter(function(a) { return !a.is_deleted; });

    if (linkedAssignments.length === 0) return [];

    // Job情報をbulk取得（N+1回避）
    const jobIds = [...new Set(linkedAssignments.map(function(a) { return a.job_id as string; }))];
    const jobs = JobRepository.search({ job_ids: jobIds });
    const jobMap = new Map(jobs.map(function(j) { return [j.job_id as string, j]; }));

    const results = linkedAssignments.map(function(a) {
      const job = jobMap.get(a.job_id as string) || {} as Record<string, unknown>;
      return {
        work_date: (job.work_date as string) || '',
        site_name: (job.site_name as string) || '(現場名なし)',
        start_time: (job.start_time as string) || '',
        pay_unit: (a.pay_unit as string) || 'basic',
        wage_rate: Number(a.wage_rate) || 0,
        transport_amount: Number(a.transport_amount) || 0
      };
    });

    // 作業日昇順ソート
    results.sort(function(a, b) { return a.work_date.localeCompare(b.work_date); });

    return results;
  },

  /**
   * ヘッダー情報書き込み（Row 1〜4）
   * Row 1: 「支払明細書」(左) / 「作業年月 YYYY年 M月度」(中央) / 氏名(右)
   * Row 2: 自社情報（会社名・住所・TEL）
   * Row 3: 空行
   * Row 4: 列ヘッダー（緑背景・白文字）
   */
  _writeHeader: function(
    sheet: GoogleAppsScript.Spreadsheet.Sheet,
    payout: PayoutRecord,
    staffName: string
  ): void {
    const periodYm = payout.period_end ? payout.period_end.substring(0, 7) : '';
    const [year, month] = periodYm.split('-');

    // Row 1: タイトル行
    sheet.getRange('A1').setValue('支払明細書');
    sheet.getRange('A1').setFontWeight('bold').setFontSize(16);

    if (year && month) {
      sheet.getRange('D1').setValue('作業年月  ' + year + '年 ' + parseInt(month, 10) + '月度');
      sheet.getRange('D1').setFontSize(11);
    }

    sheet.getRange('K1').setValue(staffName);
    sheet.getRange('K1').setFontWeight('bold').setFontSize(12)
      .setHorizontalAlignment('right');
    sheet.getRange('K1:L1').merge();

    // Row 2: テンプレートの既存ヘッダーをクリアして自社情報に置換
    sheet.getRange(2, 1, 1, 12).clear();
    const company = MasterCache.getCompany() || {};
    const companyName = company.company_name || company['会社名'] || '';
    const address = company.address || company['住所'] || '';
    const phone = company.phone || company['電話番号'] || '';

    const companyLine = companyName
      + (address ? '  ' + address : '')
      + (phone ? '  TEL: ' + phone : '');

    if (companyLine) {
      sheet.getRange('A2').setValue(companyLine);
      sheet.getRange('A2').setFontSize(9).setFontColor('#555555');
    }

    // Row 4: 列ヘッダー
    const headers = ['作業日', '案件名', '開始時間', '数量', '単位', '単価', '合計', '延長', '時間外', '残業', '移動', '源泉徴収税'];
    sheet.getRange(4, 1, 1, 12).setValues([headers]);
    const headerRange = sheet.getRange(4, 1, 1, 12);
    headerRange.setBackground('#4CAF50');
    headerRange.setFontColor('#FFFFFF');
    headerRange.setFontWeight('bold');
    headerRange.setHorizontalAlignment('center');
  },

  /**
   * 明細行書き込み
   */
  _writeDetailRows: function(
    sheet: GoogleAppsScript.Spreadsheet.Sheet,
    assignments: Array<{
      work_date: string;
      site_name: string;
      start_time: string;
      pay_unit: string;
      wage_rate: number;
      transport_amount: number;
    }>,
    dataStartRow: number
  ): void {
    if (assignments.length === 0) return;

    const rows = assignments.map(function(a) {
      // work_date: "2026-02-15" → "2/15"
      let dateStr = '';
      if (a.work_date) {
        const parts = a.work_date.split('-');
        if (parts.length === 3) {
          dateStr = parseInt(parts[1], 10) + '/' + parseInt(parts[2], 10);
        }
      }

      const unitLabel = PAY_UNIT_LABEL_MAP[a.pay_unit] || '式';
      const transport = a.transport_amount ? a.transport_amount : '';

      return [
        dateStr,           // 作業日
        a.site_name,       // 案件名
        a.start_time,      // 開始時間
        1,                 // 数量（固定）
        unitLabel,         // 単位
        a.wage_rate,       // 単価
        a.wage_rate,       // 合計（数量1なので同値）
        '',                // 延長（Phase 2）
        '',                // 時間外（Phase 2）
        '',                // 残業（Phase 2）
        transport,         // 移動
        ''                 // 源泉徴収税（行レベルは空欄）
      ];
    });

    sheet.getRange(dataStartRow, 1, rows.length, 12).setValues(rows);

    // 金額列の書式設定: 単価(F), 合計(G), 移動(K)
    [6, 7, 11].forEach(function(col) {
      sheet.getRange(dataStartRow, col, rows.length, 1).setNumberFormat('#,##0');
    });
  },

  /**
   * 合計行書き込み
   */
  _writeSummaryRow: function(
    sheet: GoogleAppsScript.Spreadsheet.Sheet,
    payout: PayoutRecord,
    rowCount: number,
    dataStartRow: number
  ): void {
    const summaryRow = dataStartRow + rowCount + 1;

    const summaryData = [
      '合計', '', '', rowCount, '',
      '', payout.base_amount || 0,
      '', '', '',
      payout.transport_amount || 0,
      payout.tax_amount || 0
    ];

    sheet.getRange(summaryRow, 1, 1, 12).setValues([summaryData]);

    // スタイル
    const summaryRange = sheet.getRange(summaryRow, 1, 1, 12);
    summaryRange.setFontWeight('bold');
    summaryRange.setBackground('#EDF2F7');

    // 金額書式（¥付き） + フォントサイズ強調
    [7, 11, 12].forEach(function(col) {
      sheet.getRange(summaryRow, col, 1, 1).setNumberFormat('¥#,##0');
    });
    sheet.getRange(summaryRow, 7, 1, 1).setFontSize(12); // 合計金額を強調

    // お支払金額行（1行空けて表示）
    const netRow = summaryRow + 2;
    const netAmount = (payout.total_amount || 0);

    // ラベル（E-F結合で切れ防止）
    sheet.getRange(netRow, 5, 1, 2).merge();
    sheet.getRange(netRow, 5).setValue('お支払金額');
    sheet.getRange(netRow, 5).setFontSize(12).setFontWeight('bold')
      .setHorizontalAlignment('right');

    // 金額（G-H結合で幅確保 + 太枠囲い）
    sheet.getRange(netRow, 7, 1, 2).merge();
    sheet.getRange(netRow, 7).setValue(netAmount);
    sheet.getRange(netRow, 7).setNumberFormat('¥#,##0')
      .setFontSize(16).setFontWeight('bold').setHorizontalAlignment('center');
    // merge済みG-H全体に太枠（1,2で結合範囲を指定）
    sheet.getRange(netRow, 7, 1, 2).setBorder(
      true, true, true, true,
      null, null,
      '#333333', SpreadsheetApp.BorderStyle.SOLID_MEDIUM
    );
  },

  /**
   * テーブル全体に罫線・列幅を適用
   */
  _applyTableFormatting: function(
    sheet: GoogleAppsScript.Spreadsheet.Sheet,
    rowCount: number,
    dataStartRow: number
  ): void {
    const headerRow = dataStartRow - 1; // 列ヘッダー行（Row 4）
    const summaryRow = dataStartRow + rowCount + 1;
    const borderStyle = SpreadsheetApp.BorderStyle.SOLID;
    const borderMedium = SpreadsheetApp.BorderStyle.SOLID_MEDIUM;

    // ヘッダー + データ行に罫線（Row 4 〜 Row 4+rowCount）
    const dataRange = sheet.getRange(headerRow, 1, 1 + rowCount, 12);
    dataRange.setBorder(
      true, true, true, true,
      true, true,
      '#999999', borderStyle
    );
    dataRange.setBorder(
      true, true, true, true,
      null, null,
      '#333333', borderMedium
    );

    // 合計行に罫線（独立した太枠）
    const summaryRange = sheet.getRange(summaryRow, 1, 1, 12);
    summaryRange.setBorder(
      true, true, true, true,
      true, null,
      '#333333', borderMedium
    );

    // 列幅設定
    sheet.setColumnWidth(1, 70);   // A: 作業日
    sheet.setColumnWidth(2, 250);  // B: 案件名
    sheet.setColumnWidth(3, 70);   // C: 開始時間
    sheet.setColumnWidth(4, 45);   // D: 数量
    sheet.setColumnWidth(5, 50);   // E: 単位
    sheet.setColumnWidth(6, 80);   // F: 単価
    sheet.setColumnWidth(7, 90);   // G: 合計
    sheet.setColumnWidth(8, 50);   // H: 延長
    sheet.setColumnWidth(9, 55);   // I: 時間外
    sheet.setColumnWidth(10, 50);  // J: 残業
    sheet.setColumnWidth(11, 70);  // K: 移動
    sheet.setColumnWidth(12, 85);  // L: 源泉徴収税

    // データ行の数値列を右寄せ
    if (rowCount > 0) {
      [4, 6, 7, 11].forEach(function(col) {
        sheet.getRange(dataStartRow, col, rowCount, 1).setHorizontalAlignment('right');
      });
    }
  },

  SUBFOLDER_NAME: '支払明細',

  /**
   * 支払明細専用の出力フォルダを取得（なければ自動作成）
   */
  _getOutputFolder: function(): GoogleAppsScript.Drive.Folder {
    const parentFolder = PayoutExportService._getOutputFolder();
    const folders = parentFolder.getFoldersByName(this.SUBFOLDER_NAME);
    if (folders.hasNext()) {
      return folders.next();
    }
    return parentFolder.createFolder(this.SUBFOLDER_NAME);
  },

  /**
   * ファイル名生成
   */
  _generateFileName: function(
    staffName: string,
    periodYm: string,
    options: { addTimestamp?: boolean } = {}
  ): string {
    const timestamp = options.addTimestamp
      ? '_' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd')
      : '';
    return '支払明細_' + staffName + '_' + periodYm + timestamp + '.xlsx';
  }
};

/**
 * テンプレートIDをScriptPropertiesに設定（GASエディタから1回だけ実行）
 */
function setPayoutDetailTemplateId(templateId: string): void {
  if (!templateId) {
    throw new Error('templateId is required');
  }
  PropertiesService.getScriptProperties().setProperty('PAYOUT_DETAIL_TEMPLATE_ID', templateId);
  Logger.log('Payout detail template set to: ' + templateId);
}
