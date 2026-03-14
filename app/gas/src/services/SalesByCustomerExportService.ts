/**
 * CR-100: 企業別売上エクスポート
 *
 * 月単位: 企業名 / 税込売上合計
 * 年度単位: 企業名 / 12ヶ月列（会計年度順） / 年間合計
 */

interface SalesExportResult {
  files: ExcelExportFileResult[];
  totalRecords: number;
  folderUrl: string;
}

const SalesByCustomerExportService = {

  /**
   * 月単位の企業別売上をExcel出力
   * @param fiscalYear - 年度
   * @param month - 月（1-12）
   */
  exportMonthly: function(fiscalYear: number, month: number, options: ExcelExportOptions = {}): SalesExportResult {
    const periodNumber = getFiscalPeriodNumber_(fiscalYear);
    const customerMap = MasterCache.getCustomerMap();
    const fiscalMonthEnd = _getFiscalMonthEndFromMaster_();

    // 会計年度の月→実際のbilling_yearを算出（例: FY2026の1月→2027年1月）
    const months = getFiscalMonths_(fiscalYear, fiscalMonthEnd);
    const target = months.find(function(m) { return m.month === month; });
    const billingYear = target ? target.year : fiscalYear;

    // 指定月の請求データ取得
    const invoices = InvoiceRepository.search({
      billing_year: billingYear,
      billing_month: month
    });

    // 企業別に集計
    const byCustomer: Record<string, { name: string; total: number; count: number }> = {};
    invoices.forEach(function(inv) {
      if (inv.is_deleted) return;
      const cid = inv.customer_id;
      const customer = customerMap[cid];
      if (!customer) return;
      const name = SalesByCustomerExportService._getCustomerDisplayName(customer);

      if (!byCustomer[cid]) {
        byCustomer[cid] = { name: name, total: 0, count: 0 };
      }
      byCustomer[cid].total += inv.total_amount || 0;
      byCustomer[cid].count++;
    });

    const folder = ExcelExportUtil.getOutputFolder_(TAX_REPORT_FOLDER_KEY, '税理士レポート');
    const yearFolder = ExcelExportUtil.getOrCreateSubfolder_(folder, fiscalYear + '年度');

    const ss = SpreadsheetApp.create('企業別売上_' + periodNumber + '期' + month + '月');
    const ssId = ss.getId();

    try {
      const sheet = ss.getActiveSheet();
      const periodLabel = formatFiscalPeriodLabel_(fiscalYear, month);
      sheet.setName(periodLabel);

      // --- A4縦 2段組レイアウト ---
      // 列構成: A(No.) B(企業名) C(税込売上) D(空白) E(No.) F(企業名) G(税込売上)
      const COL_L = 1;  // 左段開始列
      const COL_R = 5;  // 右段開始列（D列=間隔）

      // 行1: タイトル行
      const titleText = periodLabel + ' 企業別売上一覧';
      sheet.getRange(1, 1).setValue(titleText);
      sheet.getRange(1, 1, 1, 3).merge();
      sheet.getRange(1, 1).setFontSize(12).setFontWeight('bold');
      sheet.setRowHeight(1, 24);

      // 行2: ヘッダー（左右両段）
      const headers = ['No.', '企業名', '税込売上'];
      sheet.getRange(2, COL_L, 1, 3).setValues([headers]);
      sheet.getRange(2, COL_R, 1, 3).setValues([headers]);
      sheet.getRange(2, COL_L, 1, 3).setBackground('#F7FAFC').setFontWeight('bold').setFontSize(9);
      sheet.getRange(2, COL_R, 1, 3).setBackground('#F7FAFC').setFontWeight('bold').setFontSize(9);
      sheet.setFrozenRows(2);
      sheet.setRowHeight(2, 18);

      // データソート
      const customerIds = Object.keys(byCustomer).sort(function(a, b) {
        return byCustomer[a].name.localeCompare(byCustomer[b].name, 'ja');
      });

      // 左右分割: A4縦1ページに収まる行数（約40行）を基準に左段を先に埋める
      const totalCount = customerIds.length;
      const MAX_ROWS_PER_PAGE = 40;
      const splitAt = totalCount <= MAX_ROWS_PER_PAGE
        ? totalCount   // 40社以下なら左段のみ（1列）
        : Math.min(MAX_ROWS_PER_PAGE, Math.ceil(totalCount / 2));
      const leftIds = customerIds.slice(0, splitAt);
      const rightIds = customerIds.slice(splitAt);
      const rowCount = leftIds.length;

      // 行3〜: データ行（9ptフォント、行高16px）
      const dataStartRow = 3;

      if (rowCount > 0) {
        // 左段データ
        const leftRows = leftIds.map(function(cid, idx) {
          return [idx + 1, byCustomer[cid].name, byCustomer[cid].total];
        });
        sheet.getRange(dataStartRow, COL_L, rowCount, 3).setValues(leftRows);
        sheet.getRange(dataStartRow, COL_L, rowCount, 3).setFontSize(9);
        ExcelExportUtil.formatCurrencyColumns_(sheet, [COL_L + 2], dataStartRow, rowCount);

        // 右段データ
        if (rightIds.length > 0) {
          const rightRows = rightIds.map(function(cid, idx) {
            return [splitAt + idx + 1, byCustomer[cid].name, byCustomer[cid].total];
          });
          sheet.getRange(dataStartRow, COL_R, rightIds.length, 3).setValues(rightRows);
          sheet.getRange(dataStartRow, COL_R, rightIds.length, 3).setFontSize(9);
          ExcelExportUtil.formatCurrencyColumns_(sheet, [COL_R + 2], dataStartRow, rightIds.length);
        }

        // 行高を一括設定
        for (let r = dataStartRow; r < dataStartRow + rowCount; r++) {
          sheet.setRowHeight(r, 16);
        }
      }

      // 合計行（左段の下に1行、全体合計）
      const totalRow = dataStartRow + rowCount;
      const grandTotal = customerIds.reduce(function(acc, cid) { return acc + byCustomer[cid].total; }, 0);
      sheet.getRange(totalRow, COL_L, 1, 3).setValues([['', '合計', grandTotal]]);
      sheet.getRange(totalRow, COL_L, 1, 3)
        .setFontWeight('bold').setFontSize(9).setBackground('#EDF2F7');
      ExcelExportUtil.formatCurrencyColumns_(sheet, [COL_L + 2], totalRow, 1);
      sheet.getRange(totalRow, COL_R, 1, 3).setValues([['', totalCount + '社', '']]);
      sheet.getRange(totalRow, COL_R, 1, 3)
        .setFontWeight('bold').setFontSize(9).setBackground('#EDF2F7');
      sheet.setRowHeight(totalRow, 18);

      // A4横向き全幅レイアウト（合計 ≒ 950px）
      if (rightIds.length > 0) {
        // 2段組
        sheet.setColumnWidth(1, 24);   // No.
        sheet.setColumnWidth(2, 340);  // 企業名
        sheet.setColumnWidth(3, 105);  // 税込売上
        sheet.setColumnWidth(4, 8);    // 間隔
        sheet.setColumnWidth(5, 24);   // No.
        sheet.setColumnWidth(6, 340);  // 企業名
        sheet.setColumnWidth(7, 105);  // 税込売上
      } else {
        // 1列（40社以下）
        sheet.setColumnWidth(1, 35);
        sheet.setColumnWidth(2, 750);
        sheet.setColumnWidth(3, 160);
      }

      SpreadsheetApp.flush();
      const xlsxBlob = ExcelExportUtil.exportToXlsx_(ssId);
      const fileName = '企業別売上_' + periodNumber + '期' + month + '月_' + fiscalYear + '年度.xlsx';
      const result = ExcelExportUtil.saveToDrive_(yearFolder, xlsxBlob, fileName, options);
      const folderUrl = 'https://drive.google.com/drive/folders/' + yearFolder.getId();

      return { files: [result], totalRecords: invoices.length, folderUrl: folderUrl };
    } finally {
      ExcelExportUtil.cleanupTempSpreadsheet_(ssId);
    }
  },

  /**
   * 年度単位の企業別売上をExcel出力（12ヶ月クロス集計）
   * @param fiscalYear - 年度
   */
  exportYearly: function(fiscalYear: number, options: ExcelExportOptions = {}): SalesExportResult {
    const fiscalMonthEnd = _getFiscalMonthEndFromMaster_();
    const months = getFiscalMonths_(fiscalYear, fiscalMonthEnd);
    const periodNumber = getFiscalPeriodNumber_(fiscalYear);
    const customerMap = MasterCache.getCustomerMap();

    // 年度内の全請求データ取得
    const startYM = months[0].year + '-' + String(months[0].month).padStart(2, '0');
    const endYM = months[11].year + '-' + String(months[11].month).padStart(2, '0');

    const invoices = InvoiceRepository.search({
      billing_ym_from: startYM,
      billing_ym_to: endYM,
      includeArchive: true
    });

    // 企業別×月別集計
    const byCustomer: Record<string, {
      name: string;
      monthlyTotals: number[];
    }> = {};

    invoices.forEach(function(inv) {
      if (inv.is_deleted) return;
      const cid = inv.customer_id;
      const customer = customerMap[cid];
      if (!customer) return;
      const name = SalesByCustomerExportService._getCustomerDisplayName(customer);

      if (!byCustomer[cid]) {
        byCustomer[cid] = {
          name: name,
          monthlyTotals: new Array(12).fill(0)
        };
      }

      // 月のインデックスを特定
      for (let i = 0; i < months.length; i++) {
        if (months[i].year === inv.billing_year && months[i].month === inv.billing_month) {
          byCustomer[cid].monthlyTotals[i] += inv.total_amount || 0;
          break;
        }
      }
    });

    const folder = ExcelExportUtil.getOutputFolder_(TAX_REPORT_FOLDER_KEY, '税理士レポート');
    const yearFolder = ExcelExportUtil.getOrCreateSubfolder_(folder, fiscalYear + '年度');

    const ss = SpreadsheetApp.create('企業別売上_' + periodNumber + '期年間');
    const ssId = ss.getId();

    try {
      const sheet = ss.getActiveSheet();
      sheet.setName(periodNumber + '期 企業別売上');

      // ヘッダー: No. | 企業名 | 月1〜月12 | 年間合計
      const monthHeaders = months.map(function(m) {
        return m.month + '月';
      });

      const headers: string[] = ['No.', '企業名'];
      monthHeaders.forEach(function(h) { headers.push(h); });
      headers.push('年間合計');

      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      ExcelExportUtil.styleHeaderRow_(sheet, headers.length);

      const customerIds = Object.keys(byCustomer).sort(function(a, b) {
        return byCustomer[a].name.localeCompare(byCustomer[b].name, 'ja');
      });

      const rows = customerIds.map(function(cid, idx) {
        const c = byCustomer[cid];
        const row: unknown[] = [idx + 1, c.name];
        let yearTotal = 0;
        for (let i = 0; i < 12; i++) {
          row.push(c.monthlyTotals[i]);
          yearTotal += c.monthlyTotals[i];
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
      for (let i = 0; i < 12; i++) {
        let colTotal = 0;
        customerIds.forEach(function(cid) { colTotal += byCustomer[cid].monthlyTotals[i]; });
        totalRowData.push(colTotal);
      }
      let grandTotal = 0;
      customerIds.forEach(function(cid) {
        for (let i = 0; i < 12; i++) grandTotal += byCustomer[cid].monthlyTotals[i];
      });
      totalRowData.push(grandTotal);

      sheet.getRange(totalRow, 1, 1, headers.length).setValues([totalRowData]);
      ExcelExportUtil.styleTotalRow_(sheet, totalRow, headers.length);
      const allCurrCols: number[] = [];
      for (let c = 3; c <= headers.length; c++) allCurrCols.push(c);
      ExcelExportUtil.formatCurrencyColumns_(sheet, allCurrCols, totalRow, 1);

      // 列幅
      sheet.setColumnWidth(1, 35);
      sheet.setColumnWidth(2, 200);
      for (let c = 3; c <= headers.length; c++) {
        sheet.setColumnWidth(c, 90);
      }

      SpreadsheetApp.flush();
      const xlsxBlob = ExcelExportUtil.exportToXlsx_(ssId);
      const fileName = '企業別売上_' + periodNumber + '期_' + fiscalYear + '年度.xlsx';
      const result = ExcelExportUtil.saveToDrive_(yearFolder, xlsxBlob, fileName, options);
      const folderUrl = 'https://drive.google.com/drive/folders/' + yearFolder.getId();

      return { files: [result], totalRecords: invoices.length, folderUrl: folderUrl };
    } finally {
      ExcelExportUtil.cleanupTempSpreadsheet_(ssId);
    }
  },

  /**
   * 顧客の表示名を生成
   * company_name + （branch_name）の形式
   */
  _getCustomerDisplayName: function(customer: Record<string, unknown>): string {
    const company = (customer.company_name as string) || '';
    const branch = (customer.branch_name as string) || '';
    if (branch) {
      return company + '（' + branch + '）';
    }
    return company;
  },

  /**
   * 同名ファイルの存在をチェック（月単位）
   */
  checkExistingMonthlyFile: function(fiscalYear: number, month: number): ExistingFileCheckResult {
    try {
      const periodNumber = getFiscalPeriodNumber_(fiscalYear);
      const folder = ExcelExportUtil.getOutputFolder_(TAX_REPORT_FOLDER_KEY, '税理士レポート');
      const yearFolder = ExcelExportUtil.getOrCreateSubfolder_(folder, fiscalYear + '年度');
      const fileName = '企業別売上_' + periodNumber + '期' + month + '月_' + fiscalYear + '年度.xlsx';
      return ExcelExportUtil.checkExistingFileInFolder_(yearFolder, fileName);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      logErr('SalesByCustomerExportService.checkExistingMonthlyFile', error);
      return { exists: false, error: msg };
    }
  },

  /**
   * 同名ファイルの存在をチェック（年度単位）
   */
  checkExistingYearlyFile: function(fiscalYear: number): ExistingFileCheckResult {
    try {
      const periodNumber = getFiscalPeriodNumber_(fiscalYear);
      const folder = ExcelExportUtil.getOutputFolder_(TAX_REPORT_FOLDER_KEY, '税理士レポート');
      const yearFolder = ExcelExportUtil.getOrCreateSubfolder_(folder, fiscalYear + '年度');
      const fileName = '企業別売上_' + periodNumber + '期_' + fiscalYear + '年度.xlsx';
      return ExcelExportUtil.checkExistingFileInFolder_(yearFolder, fileName);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      logErr('SalesByCustomerExportService.checkExistingYearlyFile', error);
      return { exists: false, error: msg };
    }
  }
};
