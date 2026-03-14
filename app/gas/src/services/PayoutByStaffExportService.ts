/**
 * CR-102/103: スタッフ別支払エクスポート
 *
 * 年間通して1人ごとの支払合計を一覧出力
 * staff_type別に分割:
 * - スタッフファイル: 自社(regular)シート + 学生(student)シート
 * - 外注ファイル: 外注企業 + 親方(sole_proprietor)を結合
 */

const TAX_REPORT_FOLDER_KEY = 'TAX_REPORT_EXPORT_FOLDER_ID';

interface PayoutByStaffExportResult {
  files: ExcelExportFileResult[];
  totalRecords: number;
  folderUrl: string;
}

const PayoutByStaffExportService = {

  /**
   * スタッフ別年間支払一覧をExcel出力
   * @param fiscalYear - 年度（例: 2026）
   * @param options - エクスポートオプション
   */
  exportToExcel: function(fiscalYear: number, options: ExcelExportOptions = {}): PayoutByStaffExportResult {
    const fiscalMonthEnd = _getFiscalMonthEndFromMaster_();
    const range = getFiscalYearRangeByEndMonth_(fiscalYear, fiscalMonthEnd);
    const periodNumber = getFiscalPeriodNumber_(fiscalYear);

    // 支払い済み + 確認済みのレコードを全取得
    const allPayouts = PayoutRepository.search({
      status_in: ['paid', 'confirmed'] as PayoutStatus[],
      paid_date_from: range.startDate,
      paid_date_to: range.endDate,
      sort_order: 'asc'
    });

    // スタッフ名マップ
    const staffMap = MasterCache.getStaffMap();
    const subcontractors = MasterCache.getSubcontractors();
    const subMap: Record<string, string> = {};
    subcontractors.forEach(function(s: Record<string, unknown>) {
      subMap[s.subcontractor_id as string] = (s.company_name as string) || (s.name as string) || '';
    });

    // 区分別に分割
    const staffPayouts = allPayouts.filter(function(p) { return p.payout_type === 'STAFF'; });
    const subPayouts = allPayouts.filter(function(p) { return p.payout_type === 'SUBCONTRACTOR'; });

    // staff_typeで3分割
    const split = PayoutByTypeExportService._splitByStaffType(staffPayouts, staffMap);

    const files: ExcelExportFileResult[] = [];
    const folder = ExcelExportUtil.getOutputFolder_(TAX_REPORT_FOLDER_KEY, '税理士レポート');
    const yearFolder = ExcelExportUtil.getOrCreateSubfolder_(folder, fiscalYear + '年度');

    // スタッフ別（regular+student統合）
    const staffForExport = split.regular.concat(split.student);
    if (staffForExport.length > 0) {
      const result = this._exportByType(
        staffForExport, [], 'STAFF', staffMap, subMap,
        yearFolder, fiscalYear, periodNumber, options
      );
      files.push(result);
    }

    // 外注別（外注+親方）
    if (subPayouts.length > 0 || split.soleProprietor.length > 0) {
      const result = this._exportByType(
        subPayouts, split.soleProprietor, 'SUBCONTRACTOR', staffMap, subMap,
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
   * 区分別にExcel出力
   * STAFF時: 自社スタッフ + 学生を別シート
   * SUBCONTRACTOR時: 外注企業 + 親方をconcatして1シート
   */
  _exportByType: function(
    primaryPayouts: PayoutRecord[],
    secondaryPayouts: PayoutRecord[],
    type: PayoutType,
    staffMap: Record<string, Record<string, unknown>>,
    subMap: Record<string, string>,
    folder: GoogleAppsScript.Drive.Folder,
    fiscalYear: number,
    periodNumber: number,
    options: ExcelExportOptions
  ): ExcelExportFileResult {
    const typeLabel = type === 'STAFF' ? 'スタッフ' : '外注';
    const ssName = typeLabel + '別支払一覧_' + periodNumber + '期';
    const ss = SpreadsheetApp.create(ssName);
    const ssId = ss.getId();

    try {
      if (type === 'STAFF') {
        // --- STAFF: regular+student統合で1シート ---
        const sheet = ss.getActiveSheet();
        sheet.setName('スタッフ別支払一覧');
        const byStaff = this._aggregateByPerson(primaryPayouts, 'STAFF', staffMap, subMap);
        this._populateSummarySheet(sheet, byStaff, '氏名');
      } else {
        // --- SUBCONTRACTOR: 外注+親方を1シートにconcat ---
        const sheet = ss.getActiveSheet();
        sheet.setName('外注別支払一覧');

        const bySub = this._aggregateByPerson(primaryPayouts, 'SUBCONTRACTOR', staffMap, subMap);
        const bySole = this._aggregateByPerson(secondaryPayouts, 'STAFF', staffMap, subMap);

        // 外注が上、親方が下
        const subSorted = Object.keys(bySub).sort(function(a, b) {
          return bySub[a].name.localeCompare(bySub[b].name, 'ja');
        });
        const soleSorted = Object.keys(bySole).sort(function(a, b) {
          return bySole[a].name.localeCompare(bySole[b].name, 'ja');
        });
        const allSorted = subSorted.concat(soleSorted);
        const allByPerson = Object.assign({}, bySub, bySole);

        this._populateSummarySheet(sheet, allByPerson, '外注先名', allSorted);
      }

      SpreadsheetApp.flush();
      const xlsxBlob = ExcelExportUtil.exportToXlsx_(ssId);
      const fileName = typeLabel + '別支払一覧_' + periodNumber + '期_' + fiscalYear + '年度.xlsx';
      return ExcelExportUtil.saveToDrive_(folder, xlsxBlob, fileName, options);
    } finally {
      ExcelExportUtil.cleanupTempSpreadsheet_(ssId);
    }
  },

  /**
   * payoutsを人別に集計（年間合計のみ）
   */
  _aggregateByPerson: function(
    payouts: PayoutRecord[],
    type: PayoutType,
    staffMap: Record<string, Record<string, unknown>>,
    subMap: Record<string, string>
  ): Record<string, { name: string; total: number }> {
    const byPerson: Record<string, { name: string; total: number }> = {};
    payouts.forEach(function(p) {
      let personId: string;
      let personName: string;
      if (type === 'STAFF') {
        personId = p.staff_id || '';
        const staff = staffMap[personId];
        personName = staff ? ((staff.name as string) || personId) : (personId || '不明');
      } else {
        personId = p.subcontractor_id || '';
        const subName = subMap[personId];
        personName = subName || personId || '不明';
      }
      if (!personId) return;
      if (!byPerson[personId]) {
        byPerson[personId] = { name: personName, total: 0 };
      }
      byPerson[personId].total += p.total_amount || 0;
    });
    return byPerson;
  },

  /**
   * 年間合計シートの書き込み共通ロジック
   * @param orderedIds - 指定時はそのソート順を使用、未指定時は名前順ソート
   */
  _populateSummarySheet: function(
    sheet: GoogleAppsScript.Spreadsheet.Sheet,
    byPerson: Record<string, { name: string; total: number }>,
    nameLabel: string,
    orderedIds?: string[]
  ): void {
    const sorted = orderedIds || Object.keys(byPerson).sort(function(a, b) {
      return byPerson[a].name.localeCompare(byPerson[b].name, 'ja');
    });

    const headers = ['No.', nameLabel, '年間支払合計'];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    ExcelExportUtil.styleHeaderRow_(sheet, headers.length);

    const rows = sorted.map(function(personId, i) {
      return [i + 1, byPerson[personId].name, byPerson[personId].total];
    });

    if (rows.length > 0) {
      sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
      ExcelExportUtil.formatCurrencyColumns_(sheet, [3], 2, rows.length);
    }

    const totalRow = rows.length + 2;
    const grandTotal = sorted.reduce(function(acc, id) { return acc + byPerson[id].total; }, 0);
    sheet.getRange(totalRow, 1, 1, headers.length).setValues([['', '合計', grandTotal]]);
    ExcelExportUtil.styleTotalRow_(sheet, totalRow, headers.length);
    ExcelExportUtil.formatCurrencyColumns_(sheet, [3], totalRow, 1);

    sheet.setColumnWidth(1, 40);
    sheet.setColumnWidth(2, 150);
    sheet.setColumnWidth(3, 120);
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
      const types = ['スタッフ', '外注'];
      types.forEach(function(typeLabel) {
        const fileName = typeLabel + '別支払一覧_' + periodNumber + '期_' + fiscalYear + '年度.xlsx';
        results.push(ExcelExportUtil.checkExistingFileInFolder_(yearFolder, fileName));
      });
      return results;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      logErr('PayoutByStaffExportService.checkExistingFiles', error);
      return [{ exists: false, error: msg }];
    }
  }
};
