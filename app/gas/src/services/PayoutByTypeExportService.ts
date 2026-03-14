/**
 * CR-101: 区分別支払エクスポート
 *
 * スタッフ/外注を別々にExcel出力
 * スタッフ: 名前 / 月別基本金額（税込） / 月別源泉徴収 / 年間合計
 * 外注: 名前 / 月別基本金額（税込） / インボイス番号 / 年間合計
 */

interface PayoutByTypeExportResult {
  files: ExcelExportFileResult[];
  totalRecords: number;
  folderUrl: string;
}

const PayoutByTypeExportService = {

  /**
   * 区分別支払一覧をExcel出力（スタッフ用 + 外注用の2ファイル）
   */
  exportToExcel: function(fiscalYear: number, options: ExcelExportOptions = {}): PayoutByTypeExportResult {
    const fiscalMonthEnd = _getFiscalMonthEndFromMaster_();
    const range = getFiscalYearRangeByEndMonth_(fiscalYear, fiscalMonthEnd);
    const months = getFiscalMonths_(fiscalYear, fiscalMonthEnd);
    const periodNumber = getFiscalPeriodNumber_(fiscalYear);

    // 支払い済み + 確認済みのレコードを全取得
    const allPayouts = PayoutRepository.search({
      status_in: ['paid', 'confirmed'] as PayoutStatus[],
      paid_date_from: range.startDate,
      paid_date_to: range.endDate,
      sort_order: 'asc'
    });

    const staffMap = MasterCache.getStaffMap();
    const subcontractors = MasterCache.getSubcontractors();
    const subMap: Record<string, Record<string, unknown>> = {};
    subcontractors.forEach(function(s: Record<string, unknown>) {
      subMap[s.subcontractor_id as string] = s;
    });

    const staffPayouts = allPayouts.filter(function(p) { return p.payout_type === 'STAFF'; });
    const subPayouts = allPayouts.filter(function(p) { return p.payout_type === 'SUBCONTRACTOR'; });

    const files: ExcelExportFileResult[] = [];
    const folder = ExcelExportUtil.getOutputFolder_(TAX_REPORT_FOLDER_KEY, '税理士レポート');
    const yearFolder = ExcelExportUtil.getOrCreateSubfolder_(folder, fiscalYear + '年度');

    // スタッフ別月別（源泉徴収付き）
    if (staffPayouts.length > 0) {
      const result = this._exportStaff(
        staffPayouts, staffMap, months,
        yearFolder, fiscalYear, periodNumber, options
      );
      files.push(result);
    }

    // 外注別月別（インボイス番号付き）
    if (subPayouts.length > 0) {
      const result = this._exportSubcontractor(
        subPayouts, subMap, months,
        yearFolder, fiscalYear, periodNumber, options
      );
      files.push(result);
    }

    const folderUrl = 'https://drive.google.com/drive/folders/' + yearFolder.getId();
    return {
      files: files,
      totalRecords: allPayouts.length,
      folderUrl: folderUrl
    };
  },

  /**
   * paid_date から {year, month} を抽出
   */
  _getYearMonth: function(paidDate: string): { year: number; month: number } | null {
    if (!paidDate) return null;
    const parts = paidDate.split('-');
    return { year: Number(parts[0]), month: Number(parts[1]) };
  },

  /**
   * months配列から年月のインデックスを検索（0-based）
   */
  _findMonthIndex: function(months: Array<{year: number; month: number}>, year: number, month: number): number {
    for (let i = 0; i < months.length; i++) {
      if (months[i].year === year && months[i].month === month) return i;
    }
    return -1;
  },

  /**
   * スタッフ用Excel出力（2シート構成: 基本金額 / 源泉徴収）
   */
  _exportStaff: function(
    payouts: PayoutRecord[],
    staffMap: Record<string, Record<string, unknown>>,
    months: Array<{year: number; month: number}>,
    folder: GoogleAppsScript.Drive.Folder,
    fiscalYear: number,
    periodNumber: number,
    options: ExcelExportOptions
  ): ExcelExportFileResult {
    const ss = SpreadsheetApp.create('スタッフ別支払_' + periodNumber + '期');
    const ssId = ss.getId();

    try {
      const byPerson = this._aggregateByPersonMonth(payouts, 'STAFF', staffMap, {}, months);
      const monthHeaders = months.map(function(m) {
        return formatFiscalPeriodLabel_(fiscalYear, m.month);
      });
      const personIds = Object.keys(byPerson).sort(function(a, b) {
        return byPerson[a].name.localeCompare(byPerson[b].name, 'ja');
      });

      // --- シート1: 基本金額 ---
      const sheet1 = ss.getActiveSheet();
      sheet1.setName('基本金額');
      this._populateMonthlySheet(sheet1, personIds, byPerson, monthHeaders, 'monthlyBase');

      // --- シート2: 源泉徴収 ---
      const sheet2 = ss.insertSheet('源泉徴収');
      this._populateMonthlySheet(sheet2, personIds, byPerson, monthHeaders, 'monthlyTax');

      SpreadsheetApp.flush();
      const xlsxBlob = ExcelExportUtil.exportToXlsx_(ssId);
      const fileName = 'スタッフ別支払_' + periodNumber + '期_' + fiscalYear + '年度.xlsx';
      return ExcelExportUtil.saveToDrive_(folder, xlsxBlob, fileName, options);
    } finally {
      ExcelExportUtil.cleanupTempSpreadsheet_(ssId);
    }
  },

  /**
   * 月別シートの共通書き込みロジック
   * @param field - 'monthlyBase' or 'monthlyTax'
   */
  _populateMonthlySheet: function(
    sheet: GoogleAppsScript.Spreadsheet.Sheet,
    personIds: string[],
    byPerson: Record<string, { name: string; monthlyBase: number[]; monthlyTax: number[] }>,
    monthHeaders: string[],
    field: 'monthlyBase' | 'monthlyTax'
  ): void {
    // ヘッダー: No. | 氏名 | 月1〜月12 | 年間合計
    const headers: string[] = ['No.', '氏名'];
    monthHeaders.forEach(function(h) { headers.push(h); });
    headers.push('年間合計');

    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    ExcelExportUtil.styleHeaderRow_(sheet, headers.length);

    // データ行
    const rows = personIds.map(function(personId, idx) {
      const p = byPerson[personId];
      const values = p[field];
      const row: unknown[] = [idx + 1, p.name];
      let yearTotal = 0;
      for (let i = 0; i < 12; i++) {
        row.push(values[i]);
        yearTotal += values[i];
      }
      row.push(yearTotal);
      return row;
    });

    if (rows.length > 0) {
      sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
      const currencyCols: number[] = [];
      for (let c = 3; c <= headers.length; c++) currencyCols.push(c);
      ExcelExportUtil.formatCurrencyColumns_(sheet, currencyCols, 2, rows.length);
    }

    // 合計行
    const totalRow = rows.length + 2;
    const totalRowData: unknown[] = ['', '合計'];
    let grandTotal = 0;
    for (let i = 0; i < 12; i++) {
      let colTotal = 0;
      personIds.forEach(function(id) { colTotal += byPerson[id][field][i]; });
      totalRowData.push(colTotal);
      grandTotal += colTotal;
    }
    totalRowData.push(grandTotal);

    sheet.getRange(totalRow, 1, 1, headers.length).setValues([totalRowData]);
    ExcelExportUtil.styleTotalRow_(sheet, totalRow, headers.length);
    const allCurrCols: number[] = [];
    for (let c = 3; c <= headers.length; c++) allCurrCols.push(c);
    ExcelExportUtil.formatCurrencyColumns_(sheet, allCurrCols, totalRow, 1);

    // 列幅
    sheet.setColumnWidth(1, 35);
    sheet.setColumnWidth(2, 120);
    for (let c = 3; c <= headers.length; c++) {
      sheet.setColumnWidth(c, 75);
    }
  },

  /**
   * 外注用Excel出力
   * 列: No. | 氏名 | インボイス番号 | 月1〜月12(基本金額) | 年間合計
   */
  _exportSubcontractor: function(
    payouts: PayoutRecord[],
    subMap: Record<string, Record<string, unknown>>,
    months: Array<{year: number; month: number}>,
    folder: GoogleAppsScript.Drive.Folder,
    fiscalYear: number,
    periodNumber: number,
    options: ExcelExportOptions
  ): ExcelExportFileResult {
    const ss = SpreadsheetApp.create('外注別支払_' + periodNumber + '期');
    const ssId = ss.getId();

    try {
      const sheet = ss.getActiveSheet();
      sheet.setName('外注別支払');

      const byPerson = this._aggregateByPersonMonth(payouts, 'SUBCONTRACTOR', {}, subMap, months);

      const monthHeaders = months.map(function(m) {
        return formatFiscalPeriodLabel_(fiscalYear, m.month);
      });

      // 列構成: No. | 外注先名 | インボイス番号 | 月1〜月12 | 年間合計
      const headers: string[] = ['No.', '外注先名', 'インボイス番号'];
      monthHeaders.forEach(function(h) { headers.push(h); });
      headers.push('年間合計');

      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      ExcelExportUtil.styleHeaderRow_(sheet, headers.length);

      const personIds = Object.keys(byPerson).sort(function(a, b) {
        return byPerson[a].name.localeCompare(byPerson[b].name, 'ja');
      });

      const rows = personIds.map(function(personId, idx) {
        const p = byPerson[personId];
        const sub = subMap[personId];
        const invoiceNum = sub ? ((sub.invoice_registration_number as string) || '') : '';
        const row: unknown[] = [idx + 1, p.name, invoiceNum];
        let yearTotal = 0;
        for (let i = 0; i < 12; i++) {
          row.push(p.monthlyBase[i]);
          yearTotal += p.monthlyBase[i];
        }
        row.push(yearTotal);
        return row;
      });

      if (rows.length > 0) {
        sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
        const currencyCols: number[] = [];
        for (let c = 4; c <= headers.length; c++) currencyCols.push(c);
        ExcelExportUtil.formatCurrencyColumns_(sheet, currencyCols, 2, rows.length);
      }

      // 合計行
      const totalRow = rows.length + 2;
      const totalRowData: unknown[] = ['', '合計', ''];
      for (let i = 0; i < 12; i++) {
        let colTotal = 0;
        personIds.forEach(function(id) { colTotal += byPerson[id].monthlyBase[i]; });
        totalRowData.push(colTotal);
      }
      let grandTotal = 0;
      personIds.forEach(function(id) {
        for (let i = 0; i < 12; i++) grandTotal += byPerson[id].monthlyBase[i];
      });
      totalRowData.push(grandTotal);

      sheet.getRange(totalRow, 1, 1, headers.length).setValues([totalRowData]);
      ExcelExportUtil.styleTotalRow_(sheet, totalRow, headers.length);
      const allCurrCols: number[] = [];
      for (let c = 4; c <= headers.length; c++) allCurrCols.push(c);
      ExcelExportUtil.formatCurrencyColumns_(sheet, allCurrCols, totalRow, 1);

      // 列幅
      sheet.setColumnWidth(1, 35);
      sheet.setColumnWidth(2, 120);
      sheet.setColumnWidth(3, 150);
      for (let c = 4; c <= headers.length; c++) {
        sheet.setColumnWidth(c, 85);
      }

      SpreadsheetApp.flush();
      const xlsxBlob = ExcelExportUtil.exportToXlsx_(ssId);
      const fileName = '外注別支払_' + periodNumber + '期_' + fiscalYear + '年度.xlsx';
      return ExcelExportUtil.saveToDrive_(folder, xlsxBlob, fileName, options);
    } finally {
      ExcelExportUtil.cleanupTempSpreadsheet_(ssId);
    }
  },

  /**
   * 人別×月別集計の共通ロジック
   */
  _aggregateByPersonMonth: function(
    payouts: PayoutRecord[],
    type: PayoutType,
    staffMap: Record<string, Record<string, unknown>>,
    subMap: Record<string, Record<string, unknown>>,
    months: Array<{year: number; month: number}>
  ): Record<string, { name: string; monthlyBase: number[]; monthlyTax: number[] }> {
    const svc = PayoutByTypeExportService;
    const result: Record<string, { name: string; monthlyBase: number[]; monthlyTax: number[] }> = {};

    payouts.forEach(function(p) {
      let personId: string;
      let personName: string;
      if (type === 'STAFF') {
        personId = p.staff_id || '';
        const staff = staffMap[personId];
        personName = staff ? ((staff.name as string) || personId) : (personId || '不明');
      } else {
        personId = p.subcontractor_id || '';
        const sub = subMap[personId];
        personName = sub ? ((sub.company_name as string) || (sub.name as string) || personId) : (personId || '不明');
      }
      if (!personId) return;

      if (!result[personId]) {
        result[personId] = {
          name: personName,
          monthlyBase: new Array(12).fill(0),
          monthlyTax: new Array(12).fill(0)
        };
      }

      const ym = svc._getYearMonth(p.paid_date);
      if (ym) {
        const idx = svc._findMonthIndex(months, ym.year, ym.month);
        if (idx >= 0) {
          result[personId].monthlyBase[idx] += p.total_amount || 0;
          result[personId].monthlyTax[idx] += p.tax_amount || 0;
        }
      }
    });

    return result;
  },

  /**
   * 同名ファイルの存在をチェック
   */
  checkExistingFiles: function(fiscalYear: number): ExistingFileCheckResult[] {
    try {
      const periodNumber = getFiscalPeriodNumber_(fiscalYear);
      const folder = ExcelExportUtil.getOutputFolder_(TAX_REPORT_FOLDER_KEY, '税理士レポート');
      const yearFolder = ExcelExportUtil.getOrCreateSubfolder_(folder, fiscalYear + '年度');

      const results: ExistingFileCheckResult[] = [];
      const fileNames = [
        'スタッフ別支払_' + periodNumber + '期_' + fiscalYear + '年度.xlsx',
        '外注別支払_' + periodNumber + '期_' + fiscalYear + '年度.xlsx'
      ];
      fileNames.forEach(function(fn) {
        results.push(ExcelExportUtil.checkExistingFileInFolder_(yearFolder, fn));
      });
      return results;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      logErr('PayoutByTypeExportService.checkExistingFiles', error);
      return [{ exists: false, error: msg }];
    }
  }
};
