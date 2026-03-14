/**
 * CR-102: スタッフ別支払エクスポート
 *
 * 年間通して1人ごとの支払合計を一覧出力
 * スタッフ/外注は別々のファイルに出力
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

    const files: ExcelExportFileResult[] = [];
    const folder = ExcelExportUtil.getOutputFolder_(TAX_REPORT_FOLDER_KEY, '税理士レポート');
    const yearFolder = ExcelExportUtil.getOrCreateSubfolder_(folder, fiscalYear + '年度');

    // スタッフ別
    if (staffPayouts.length > 0) {
      const result = this._exportByType(
        staffPayouts, 'STAFF', staffMap, subMap,
        yearFolder, fiscalYear, periodNumber, options
      );
      files.push(result);
    }

    // 外注別
    if (subPayouts.length > 0) {
      const result = this._exportByType(
        subPayouts, 'SUBCONTRACTOR', staffMap, subMap,
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
   */
  _exportByType: function(
    payouts: PayoutRecord[],
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
      const sheet = ss.getActiveSheet();
      sheet.setName(typeLabel + '別支払一覧');

      // 人別に集計
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

      // 名前順にソート
      const sorted = Object.keys(byPerson).sort(function(a, b) {
        return byPerson[a].name.localeCompare(byPerson[b].name, 'ja');
      });

      // ヘッダー
      const nameLabel = type === 'STAFF' ? '氏名' : '外注先名';
      const headers = ['No.', nameLabel, '年間支払合計'];
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      ExcelExportUtil.styleHeaderRow_(sheet, headers.length);

      // データ行
      const rows = sorted.map(function(personId, i) {
        return [
          i + 1,
          byPerson[personId].name,
          byPerson[personId].total
        ];
      });

      if (rows.length > 0) {
        sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
        ExcelExportUtil.formatCurrencyColumns_(sheet, [3], 2, rows.length);
      }

      // 合計行
      const totalRow = rows.length + 2;
      const grandTotal = sorted.reduce(function(acc, id) { return acc + byPerson[id].total; }, 0);
      sheet.getRange(totalRow, 1, 1, headers.length).setValues([['', '合計', grandTotal]]);
      ExcelExportUtil.styleTotalRow_(sheet, totalRow, headers.length);
      ExcelExportUtil.formatCurrencyColumns_(sheet, [3], totalRow, 1);

      // 列幅設定
      sheet.setColumnWidth(1, 40);
      sheet.setColumnWidth(2, 150);
      sheet.setColumnWidth(3, 120);

      // タイトル情報（行の上に追加せず、シート名で区別）
      SpreadsheetApp.flush();
      const xlsxBlob = ExcelExportUtil.exportToXlsx_(ssId);

      const fileName = typeLabel + '別支払一覧_' + periodNumber + '期_' + fiscalYear + '年度.xlsx';
      return ExcelExportUtil.saveToDrive_(folder, xlsxBlob, fileName, options);
    } finally {
      ExcelExportUtil.cleanupTempSpreadsheet_(ssId);
    }
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
