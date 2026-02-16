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
        'GASエディタで setPayoutDetailTemplateId() を実行してください。'
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

      // 5. 明細行書き込み
      this._writeDetailRows(sheet, assignmentsWithJobs);

      // 6. 合計行書き込み
      const dataStartRow = 3; // Row 1: title, Row 2: column headers, Row 3+: data
      this._writeSummaryRow(sheet, payout, assignmentsWithJobs.length, dataStartRow);

      // 7. xlsx変換
      SpreadsheetApp.flush();
      const xlsxBlob = PayoutExportService._exportToXlsx(ssId);

      // 8. Drive保存（支払明細サブフォルダ）
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
   * ヘッダー情報書き込み（Row 1）
   */
  _writeHeader: function(
    sheet: GoogleAppsScript.Spreadsheet.Sheet,
    payout: PayoutRecord,
    staffName: string
  ): void {
    const periodYm = payout.period_end ? payout.period_end.substring(0, 7) : '';
    const [year, month] = periodYm.split('-');
    const title = (year && month)
      ? year + '年' + parseInt(month, 10) + '月 支払明細書 - ' + staffName
      : '支払明細書 - ' + staffName;

    sheet.getRange('A1').setValue(title);
    sheet.getRange('A1').setFontWeight('bold').setFontSize(14);
  },

  /**
   * 明細行書き込み（Row 3〜）
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
    }>
  ): void {
    if (assignments.length === 0) return;

    const dataStartRow = 3;

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

    // 金額書式
    [6, 7, 11, 12].forEach(function(col) {
      sheet.getRange(summaryRow, col, 1, 1).setNumberFormat('#,##0');
    });

    // 差引支給額行
    const netRow = summaryRow + 1;
    const netAmount = (payout.total_amount || 0);
    sheet.getRange(netRow, 1).setValue('差引支給額');
    sheet.getRange(netRow, 7).setValue(netAmount);
    sheet.getRange(netRow, 1, 1, 12).setFontWeight('bold');
    sheet.getRange(netRow, 7, 1, 1).setNumberFormat('#,##0');
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
function setPayoutDetailTemplateId(): void {
  const templateId = '1TO5V3iRix34buH-HLdZjtqkSpB7Erv9hjgYZM_I4-M8';
  PropertiesService.getScriptProperties().setProperty('PAYOUT_DETAIL_TEMPLATE_ID', templateId);
  Logger.log('Payout detail template set to: ' + templateId);
}
