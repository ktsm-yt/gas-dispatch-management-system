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
  basic: '式', tobi: '式', age: '式', tobiage: '式', holiday: '休日',
  half: '半日', halfday: '半日', fullday: '終日', night: '夜勤',
  jotou: '式', shuujitsu: '終日', am: '半日', pm: '半日', yakin: '夜勤'
};

/** カスタム単価種別を含む動的ラベル取得 */
function getPayUnitLabel_(payUnit: string): string {
  if (PAY_UNIT_LABEL_MAP[payUnit]) return PAY_UNIT_LABEL_MAP[payUnit];
  // カスタム単価種別はデフォルト「式」
  return '式';
}

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

    // 2. スタッフ情報取得（wage_rate未設定時のフォールバック計算に必要）
    const staffId = (payout as unknown as Record<string, unknown>).staff_id as string;
    const staff = staffId ? StaffRepository.findById(staffId) : null;

    // 3. 配置+Job情報取得
    const assignmentsWithJobs = this._getAssignmentsWithJobInfo(payoutId, staff);

    if (assignmentsWithJobs.length > this.MAX_ROWS) {
      throw new Error('配置数が上限(' + this.MAX_ROWS + '件)を超えています: ' + assignmentsWithJobs.length + '件');
    }

    // 4. テンプレートコピー
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

      // 5. ヘッダー情報書き込み
      this._writeHeader(sheet, payout, staffName);

      // 6. 明細行書き込み（Row 5〜）
      const dataStartRow = 5; // Row 1: title, Row 2: company, Row 3: blank, Row 4: col headers, Row 5+: data
      const isWithholdingTarget = !!(staff && staff.withholding_tax_applicable && String(staff.withholding_tax_applicable).toUpperCase() !== 'FALSE');
      const calculatedTaxTotal = this._writeDetailRows(sheet, assignmentsWithJobs, dataStartRow, isWithholdingTarget);

      // 7. 合計行書き込み（日額テーブルで再計算した税額合計を渡す）
      this._writeSummaryRow(sheet, payout, assignmentsWithJobs.length, dataStartRow, calculatedTaxTotal);

      // 8. 罫線・列幅の書式設定
      this._applyTableFormatting(sheet, assignmentsWithJobs.length, dataStartRow);

      // 9. xlsx変換
      SpreadsheetApp.flush();
      const xlsxBlob = PayoutExportService._exportToXlsx(ssId);

      // 10. Drive保存（支払明細サブフォルダ）
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
   * 配置+Job情報を結合取得（人工割反映後の単価を含む）
   */
  _getAssignmentsWithJobInfo: function(payoutId: string, staff: Record<string, unknown> | null): Array<{
    work_date: string;
    site_name: string;
    start_time: string;
    pay_unit: string;
    wage_rate: number;
    adjusted_wage_rate: number;
    transport_amount: number;
    staff_transport: number;
  }> {
    const linkedAssignments = AssignmentRepository.search({ payout_id: payoutId })
      .filter(function(a) { return !a.is_deleted; });

    if (linkedAssignments.length === 0) return [];

    // Job情報をbulk取得（N+1回避）
    const jobIds = [...new Set(linkedAssignments.map(function(a) { return a.job_id as string; }))];
    const jobIdSet = new Set(jobIds);
    const jobs = JobRepository.search({ job_ids: jobIds });
    const jobMap = new Map(jobs.map(function(j) { return [j.job_id as string, j]; }));

    // 人工割係数算出用: job_idごとのASSIGNED配置数を取得
    const assignmentCountByJob = PayoutService._buildAssignmentCountByJob(jobIdSet);

    const results = linkedAssignments.map(function(a) {
      const job = jobMap.get(a.job_id as string) || {} as Record<string, unknown>;
      // calculateWage_ を使用: wage_rate未設定時にスタッフの日額レートにフォールバック
      const payUnit = (a.pay_unit as string) || 'basic';
      const wageRate = calculateWage_(a as any, staff || {} as any, payUnit);

      // 人工割係数を計算
      const requiredCount = Number(job.required_count) || 0;
      const actualCount = assignmentCountByJob.get(a.job_id as string) || 0;
      const coefficient = calculateNinkuCoefficient_(requiredCount, actualCount);
      const adjustedWageRate = coefficient !== 1.0
        ? applyRounding_(wageRate * coefficient, RoundingMode.FLOOR)
        : wageRate;

      return {
        work_date: (job.work_date as string) || '',
        site_name: (job.site_name as string) || '(現場名なし)',
        start_time: (job.start_time as string) || '',
        pay_unit: (a.pay_unit as string) || 'basic',
        wage_rate: wageRate,
        adjusted_wage_rate: adjustedWageRate,
        transport_amount: Number(a.transport_amount) || 0,
        staff_transport: Number(a.staff_transport) || 0
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
      adjusted_wage_rate: number;
      transport_amount: number;
      staff_transport: number;
    }>,
    dataStartRow: number,
    isWithholdingTarget: boolean
  ): number {
    if (assignments.length === 0) return 0;

    // CR-084: 各配置の給与に対して個別にテーブル参照して税額を算出
    let calculatedTaxTotal = 0;
    const perRowTax: (number | string)[] = [];
    if (isWithholdingTarget) {
      for (const a of assignments) {
        const tax = lookupDailyWithholdingTax(a.adjusted_wage_rate);
        perRowTax.push(tax);
        calculatedTaxTotal += tax;
      }
    }

    const rows = assignments.map(function(a, idx) {
      // work_date: "2026-02-15" → "2/15"
      let dateStr = '';
      if (a.work_date) {
        const parts = a.work_date.split('-');
        if (parts.length === 3) {
          dateStr = parseInt(parts[1], 10) + '/' + parseInt(parts[2], 10);
        }
      }

      const unitLabel = getPayUnitLabel_(a.pay_unit as string);
      const transport = (Number(a.staff_transport) || 0) > 0 ? Number(a.staff_transport) : '';

      // 各行に配置単位の源泉徴収税を表示
      const taxCell = perRowTax[idx] !== undefined ? perRowTax[idx] : '';

      return [
        dateStr,                // 作業日
        a.site_name,            // 案件名
        a.start_time,           // 開始時間
        1,                      // 数量（固定）
        unitLabel,              // 単位
        a.adjusted_wage_rate,   // 単価（人工割反映後）
        a.adjusted_wage_rate,   // 合計（数量1なので同値）
        '',                     // 延長（Phase 2）
        '',                     // 時間外（Phase 2）
        '',                     // 残業（Phase 2）
        transport,              // 移動
        taxCell                 // 源泉徴収税（配置単位）
      ];
    });

    sheet.getRange(dataStartRow, 1, rows.length, 12).setValues(rows);

    // 金額列の書式設定: 単価(F), 合計(G), 移動(K), 源泉徴収税(L)
    [6, 7, 11, 12].forEach(function(col) {
      sheet.getRange(dataStartRow, col, rows.length, 1).setNumberFormat('#,##0');
    });

    // 人工割適用行の単価(F)・合計(G)をオレンジ色で強調
    assignments.forEach(function(a, i) {
      if (a.adjusted_wage_rate !== a.wage_rate) {
        const row = dataStartRow + i;
        sheet.getRange(row, 6, 1, 2).setFontColor('#D97706').setFontWeight('bold');
      }
    });

    return calculatedTaxTotal;
  },

  /**
   * 合計行書き込み
   */
  _writeSummaryRow: function(
    sheet: GoogleAppsScript.Spreadsheet.Sheet,
    payout: PayoutRecord,
    rowCount: number,
    dataStartRow: number,
    calculatedTaxTotal: number
  ): void {
    const summaryRow = dataStartRow + rowCount + 1;

    // 合計行: 人工割反映後の合計（base_amount + ninku_adjustment_amount）
    const ninkuAmount = payout.ninku_adjustment_amount || 0;
    const adjustedBaseAmount = (payout.base_amount || 0) + ninkuAmount;

    // Reconciliation: 配置数>0 && adjustedBaseAmount=0 は単価欠損の可能性
    assertInvariant_(
      rowCount === 0 || adjustedBaseAmount > 0,
      'Payout reconciliation: 配置あり but adjustedBaseAmount=0',
      { payout_id: String(payout.payout_id || ''), rowCount: rowCount, adjustedBaseAmount: adjustedBaseAmount }
    );

    // 源泉徴収税: 確定済み支払は payout.tax_amount を優先（CR-084ロジック変更前の確定値を維持）
    const confirmedTax = payout.tax_amount;
    const summaryTax = (confirmedTax !== undefined && confirmedTax !== null)
      ? confirmedTax
      : calculatedTaxTotal;
    const summaryData = [
      '合計', '', '', rowCount, '',
      '', adjustedBaseAmount,
      '', '', '',
      payout.transport_amount || 0,
      summaryTax
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
    sheet.getRange(summaryRow, 7, 1, 1).setFontSize(12);

    // 調整額行（adjustment_amount が0以外のとき表示）
    const adjustmentAmount = payout.adjustment_amount || 0;
    let nextRow = summaryRow + 1;
    if (adjustmentAmount !== 0) {
      sheet.getRange(nextRow, 1).setValue('調整額');
      sheet.getRange(nextRow, 1).setFontWeight('bold').setFontColor('#2563EB');
      if (payout.notes) {
        sheet.getRange(nextRow, 2).setValue(payout.notes);
        sheet.getRange(nextRow, 2).setFontColor('#2563EB').setFontSize(10);
      }
      sheet.getRange(nextRow, 7).setValue(adjustmentAmount);
      sheet.getRange(nextRow, 7).setNumberFormat('¥#,##0').setFontWeight('bold').setFontColor('#2563EB');
      nextRow++;
    }

    // お支払金額行（調整額行の有無に応じてオフセット）
    const netRow = nextRow + 1; // 空行1行分
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
      [4, 5, 6, 7, 11].forEach(function(col) {
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
