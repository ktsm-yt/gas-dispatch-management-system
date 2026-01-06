/**
 * Invoice Export Service
 *
 * 請求書の出力処理（PDF/Excel/Google Sheets）
 */

const InvoiceExportService = {
  /**
   * テンプレートIDのScriptProperty名
   */
  TEMPLATE_KEYS: {
    format1: 'TEMPLATE_ID_FORMAT1',
    format2: 'TEMPLATE_ID_FORMAT2',
    format3: 'TEMPLATE_ID_FORMAT3',
    atamagami: 'TEMPLATE_ID_ATAMAGAMI'
  },

  /**
   * 出力先フォルダIDのScriptProperty名
   */
  OUTPUT_FOLDER_KEY: 'OUTPUT_FOLDER_ID',

  /**
   * 請求書を出力
   * @param {string} invoiceId - 請求ID
   * @param {string} mode - 出力モード（pdf/excel/edit）
   * @param {Object} options - オプション
   * @returns {Object} { success, fileId, url, error }
   */
  export: function(invoiceId, mode, options = {}) {
    try {
      // 請求書データを取得
      const invoiceData = InvoiceService.get(invoiceId);
      if (!invoiceData) {
        return { success: false, error: 'INVOICE_NOT_FOUND' };
      }

      const { invoice, lines, customer } = this._extractInvoiceData(invoiceData);

      // 自社情報を取得
      const company = this._getCompanyInfo();

      // フォーマットに応じた処理
      switch (mode) {
        case 'pdf':
          return this.exportToPdf(invoice, lines, customer, company, options);
        case 'excel':
          return this.exportToExcel(invoice, lines, customer, company, options);
        case 'edit':
          return this.createEditSheet(invoice, lines, customer, company, options);
        default:
          return { success: false, error: 'INVALID_MODE' };
      }
    } catch (error) {
      console.error('InvoiceExportService.export error:', error);
      return { success: false, error: error.message || 'EXPORT_ERROR' };
    }
  },

  /**
   * PDF出力
   * @param {Object} invoice - 請求書データ
   * @param {Object[]} lines - 明細データ
   * @param {Object} customer - 顧客データ
   * @param {Object} company - 自社データ
   * @param {Object} options - オプション
   * @returns {Object} { success, fileId, url }
   */
  exportToPdf: function(invoice, lines, customer, company, options = {}) {
    try {
      // スプレッドシートを作成
      const sheetResult = this._createFilledSheet(invoice, lines, customer, company);
      if (!sheetResult.success) {
        return sheetResult;
      }

      const spreadsheet = sheetResult.spreadsheet;
      const sheet = sheetResult.sheet;

      // PDFに変換
      const pdfBlob = this._exportSheetToPdf(spreadsheet.getId(), sheet.getSheetId());

      // ファイル名を生成
      const fileName = this._generateFileName(invoice, customer, 'pdf');
      pdfBlob.setName(fileName);

      // 出力先フォルダに保存
      const folder = this._getOutputFolder(customer);
      const file = folder.createFile(pdfBlob);

      // 一時スプレッドシートを削除
      if (!options.keepSheet) {
        DriveApp.getFileById(spreadsheet.getId()).setTrashed(true);
      }

      // 請求書のファイルIDを更新
      InvoiceRepository.updateFileIds(invoice.invoice_id, { pdf_file_id: file.getId() });

      return {
        success: true,
        fileId: file.getId(),
        url: file.getUrl(),
        invoiceId: invoice.invoice_id
      };
    } catch (error) {
      console.error('exportToPdf error:', error);
      return { success: false, error: error.message || 'PDF_EXPORT_ERROR' };
    }
  },

  /**
   * Excel出力
   * @param {Object} invoice - 請求書データ
   * @param {Object[]} lines - 明細データ
   * @param {Object} customer - 顧客データ
   * @param {Object} company - 自社データ
   * @param {Object} options - オプション
   * @returns {Object} { success, fileId, url }
   */
  exportToExcel: function(invoice, lines, customer, company, options = {}) {
    try {
      // スプレッドシートを作成
      const sheetResult = this._createFilledSheet(invoice, lines, customer, company);
      if (!sheetResult.success) {
        return sheetResult;
      }

      const spreadsheet = sheetResult.spreadsheet;

      // Excelに変換
      const xlsxBlob = this._exportSpreadsheetToXlsx(spreadsheet.getId());

      // ファイル名を生成
      const fileName = this._generateFileName(invoice, customer, 'xlsx');
      xlsxBlob.setName(fileName);

      // 出力先フォルダに保存
      const folder = this._getOutputFolder(customer);
      const file = folder.createFile(xlsxBlob);

      // 一時スプレッドシートを削除
      if (!options.keepSheet) {
        DriveApp.getFileById(spreadsheet.getId()).setTrashed(true);
      }

      // 請求書のファイルIDを更新
      InvoiceRepository.updateFileIds(invoice.invoice_id, { excel_file_id: file.getId() });

      return {
        success: true,
        fileId: file.getId(),
        url: file.getUrl(),
        invoiceId: invoice.invoice_id
      };
    } catch (error) {
      console.error('exportToExcel error:', error);
      return { success: false, error: error.message || 'EXCEL_EXPORT_ERROR' };
    }
  },

  /**
   * 編集用スプレッドシート作成
   * @param {Object} invoice - 請求書データ
   * @param {Object[]} lines - 明細データ
   * @param {Object} customer - 顧客データ
   * @param {Object} company - 自社データ
   * @param {Object} options - オプション
   * @returns {Object} { success, sheetFileId, url }
   */
  createEditSheet: function(invoice, lines, customer, company, options = {}) {
    try {
      // スプレッドシートを作成
      const sheetResult = this._createFilledSheet(invoice, lines, customer, company);
      if (!sheetResult.success) {
        return sheetResult;
      }

      const spreadsheet = sheetResult.spreadsheet;

      // 出力先フォルダに移動
      const folder = this._getOutputFolder(customer);
      const file = DriveApp.getFileById(spreadsheet.getId());
      file.moveTo(folder);

      // ファイル名を設定
      const fileName = this._generateFileName(invoice, customer, 'sheet');
      file.setName(fileName);

      // 請求書のファイルIDを更新
      InvoiceRepository.updateFileIds(invoice.invoice_id, { sheet_file_id: spreadsheet.getId() });

      return {
        success: true,
        sheetFileId: spreadsheet.getId(),
        url: spreadsheet.getUrl(),
        invoiceId: invoice.invoice_id
      };
    } catch (error) {
      console.error('createEditSheet error:', error);
      return { success: false, error: error.message || 'EDIT_SHEET_ERROR' };
    }
  },

  // ============================================
  // Private Methods
  // ============================================

  /**
   * 請求書データを抽出
   * @param {Object} invoiceData - InvoiceService.get()の結果
   * @returns {Object} { invoice, lines, customer }
   */
  _extractInvoiceData: function(invoiceData) {
    return {
      invoice: {
        invoice_id: invoiceData.invoice_id,
        invoice_number: invoiceData.invoice_number,
        billing_year: invoiceData.billing_year,
        billing_month: invoiceData.billing_month,
        issue_date: invoiceData.issue_date,
        due_date: invoiceData.due_date,
        subtotal: invoiceData.subtotal,
        expense_amount: invoiceData.expense_amount,
        tax_amount: invoiceData.tax_amount,
        total_amount: invoiceData.total_amount,
        invoice_format: invoiceData.invoice_format,
        shipper_name: invoiceData.shipper_name,
        status: invoiceData.status,
        notes: invoiceData.notes
      },
      lines: invoiceData.lines || [],
      customer: invoiceData.customer || {}
    };
  },

  /**
   * 自社情報を取得
   * @returns {Object} 自社情報
   */
  _getCompanyInfo: function() {
    const records = getAllRecords('M_Company');
    return records.length > 0 ? records[0] : {};
  },

  /**
   * テンプレートからスプレッドシートを作成してデータを入力
   * @param {Object} invoice - 請求書データ
   * @param {Object[]} lines - 明細データ
   * @param {Object} customer - 顧客データ
   * @param {Object} company - 自社データ
   * @returns {Object} { success, spreadsheet, sheet }
   */
  _createFilledSheet: function(invoice, lines, customer, company) {
    // テンプレートIDを取得
    const templateKey = this.TEMPLATE_KEYS[invoice.invoice_format] || this.TEMPLATE_KEYS.format1;
    const templateId = PropertiesService.getScriptProperties().getProperty(templateKey);

    if (!templateId) {
      return { success: false, error: 'TEMPLATE_NOT_FOUND' };
    }

    // テンプレートをコピー
    const templateFile = DriveApp.getFileById(templateId);
    const copyName = `請求書_${invoice.invoice_number}_temp`;
    const copy = templateFile.makeCopy(copyName);
    const spreadsheet = SpreadsheetApp.openById(copy.getId());
    const sheet = spreadsheet.getSheets()[0];

    // フォーマットに応じてデータを入力
    switch (invoice.invoice_format) {
      case 'format1':
        this._populateFormat1(sheet, invoice, lines, customer, company);
        break;
      case 'format2':
        this._populateFormat2(sheet, invoice, lines, customer, company);
        break;
      case 'format3':
        this._populateFormat3(sheet, invoice, lines, customer, company);
        break;
      case 'atamagami':
        this._populateAtagami(sheet, invoice, lines, customer, company);
        break;
      default:
        this._populateFormat1(sheet, invoice, lines, customer, company);
    }

    // 変更を反映
    SpreadsheetApp.flush();

    return {
      success: true,
      spreadsheet: spreadsheet,
      sheet: sheet
    };
  },

  /**
   * 様式1のデータを入力
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - シート
   * @param {Object} invoice - 請求書データ
   * @param {Object[]} lines - 明細データ
   * @param {Object} customer - 顧客データ
   * @param {Object} company - 自社データ
   */
  _populateFormat1: function(sheet, invoice, lines, customer, company) {
    // ヘッダー部分
    sheet.getRange('A2').setValue(customer.company_name || '');
    sheet.getRange('C5').setValue(`${invoice.billing_year}年${invoice.billing_month}月分`);
    sheet.getRange('C6').setValue(invoice.shipper_name || '');
    sheet.getRange('H5').setValue(invoice.total_amount);

    // 自社情報
    if (company.company_name) {
      sheet.getRange('E2').setValue(company.company_name);
    }

    // 明細行（A10から開始）
    const startRow = 10;
    for (let i = 0; i < lines.length; i++) {
      const row = startRow + i;
      const line = lines[i];
      sheet.getRange(row, 1).setValue(line.work_date || '');      // A: 日付
      sheet.getRange(row, 2).setValue(line.site_name || '');      // B: 案件名
      sheet.getRange(row, 3).setValue(line.item_name || '');      // C: 品目
      sheet.getRange(row, 4).setValue(line.time_note || '');      // D: 時間/備考
      sheet.getRange(row, 5).setValue(line.quantity || 0);        // E: 数量
      sheet.getRange(row, 6).setValue(line.unit || '人');         // F: 単位
      sheet.getRange(row, 7).setValue(line.unit_price || 0);      // G: 単価
      sheet.getRange(row, 8).setValue(line.amount || 0);          // H: 金額
    }
  },

  /**
   * 様式2のデータを入力（発注No/営業所分離版）
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - シート
   * @param {Object} invoice - 請求書データ
   * @param {Object[]} lines - 明細データ
   * @param {Object} customer - 顧客データ
   * @param {Object} company - 自社データ
   */
  _populateFormat2: function(sheet, invoice, lines, customer, company) {
    // ヘッダー部分
    sheet.getRange('A2').setValue(customer.company_name || '');
    sheet.getRange('C5').setValue(`${invoice.billing_year}年${invoice.billing_month}月分`);
    sheet.getRange('J5').setValue(invoice.total_amount);

    // 自社情報
    if (company.company_name) {
      sheet.getRange('G2').setValue(company.company_name);
    }

    // 明細行（A10から開始）
    const startRow = 10;
    for (let i = 0; i < lines.length; i++) {
      const row = startRow + i;
      const line = lines[i];
      sheet.getRange(row, 1).setValue(line.work_date || '');       // A: 日付
      sheet.getRange(row, 2).setValue(line.site_name || '');       // B: 案件名
      sheet.getRange(row, 3).setValue(line.order_number || '');    // C: 発注No
      sheet.getRange(row, 4).setValue(line.branch_office || '');   // D: 営業所
      sheet.getRange(row, 5).setValue(line.item_name || '');       // E: 品目
      sheet.getRange(row, 6).setValue(line.time_note || '');       // F: 時間/備考
      sheet.getRange(row, 7).setValue(line.quantity || 0);         // G: 数量
      sheet.getRange(row, 8).setValue(line.unit || '人');          // H: 単位
      sheet.getRange(row, 9).setValue(line.unit_price || 0);       // I: 単価
      sheet.getRange(row, 10).setValue(line.amount || 0);          // J: 金額
    }
  },

  /**
   * 様式3のデータを入力
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - シート
   * @param {Object} invoice - 請求書データ
   * @param {Object[]} lines - 明細データ
   * @param {Object} customer - 顧客データ
   * @param {Object} company - 自社データ
   */
  _populateFormat3: function(sheet, invoice, lines, customer, company) {
    // タイトル
    sheet.getRange('A1').setValue(`${customer.company_name || ''} ${invoice.billing_year}年${invoice.billing_month}月 追加請求一覧`);

    // 明細行（A3から開始）
    const startRow = 3;
    const taxRate = customer.tax_rate || DEFAULT_TAX_RATE;

    for (let i = 0; i < lines.length; i++) {
      const row = startRow + i;
      const line = lines[i];
      const taxIncluded = Math.floor((line.amount || 0) * (1 + taxRate));

      sheet.getRange(row, 1).setValue(line.construction_div || '');  // A: 担当工事課
      sheet.getRange(row, 2).setValue(line.supervisor_name || '');   // B: 担当監督名
      sheet.getRange(row, 3).setValue(line.property_code || '');     // C: 物件コード
      sheet.getRange(row, 4).setValue(line.site_name || '');         // D: 現場名
      sheet.getRange(row, 5).setValue(line.work_date || '');         // E: 施工日
      sheet.getRange(row, 6).setValue(line.item_name || '');         // F: 内容
      sheet.getRange(row, 7).setValue(line.amount || 0);             // G: 金額（税抜）
      sheet.getRange(row, 8).setValue(taxIncluded);                  // H: 金額（税込）
    }
  },

  /**
   * 頭紙のデータを入力
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - シート
   * @param {Object} invoice - 請求書データ
   * @param {Object[]} lines - 明細データ
   * @param {Object} customer - 顧客データ
   * @param {Object} company - 自社データ
   */
  _populateAtagami: function(sheet, invoice, lines, customer, company) {
    // 発行日
    const formattedDate = this._formatDate(invoice.issue_date);
    sheet.getRange('AP2').setValue(formattedDate);

    // 請求番号
    sheet.getRange('AP3').setValue(invoice.invoice_number);

    // 宛名
    sheet.getRange('B5').setValue(`${customer.company_name || ''} 御中`);

    // 合計金額
    sheet.getRange('J14').setValue(invoice.total_amount);

    // 自社情報
    if (company.company_name) {
      sheet.getRange('AB5').setValue(company.company_name);
    }

    // 内訳
    sheet.getRange('G10').setValue(invoice.subtotal);           // 作業費
    sheet.getRange('G11').setValue(invoice.expense_amount);     // 諸経費
    sheet.getRange('G12').setValue(invoice.subtotal + invoice.expense_amount); // 小計
    sheet.getRange('G13').setValue(invoice.tax_amount);         // 消費税
    sheet.getRange('G14').setValue(invoice.total_amount);       // 合計
  },

  /**
   * シートをPDFに変換
   * @param {string} spreadsheetId - スプレッドシートID
   * @param {number} sheetId - シートID
   * @returns {GoogleAppsScript.Base.Blob} PDFブロブ
   */
  _exportSheetToPdf: function(spreadsheetId, sheetId) {
    const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?` +
      `format=pdf` +
      `&gid=${sheetId}` +
      `&portrait=true` +
      `&size=A4` +
      `&scale=4` + // Fit to page
      `&top_margin=0.5` +
      `&bottom_margin=0.5` +
      `&left_margin=0.5` +
      `&right_margin=0.5` +
      `&sheetnames=false` +
      `&printtitle=false` +
      `&pagenumbers=false` +
      `&gridlines=false` +
      `&fzr=false`;

    const token = ScriptApp.getOAuthToken();
    const response = UrlFetchApp.fetch(url, {
      headers: { 'Authorization': 'Bearer ' + token }
    });

    return response.getBlob().setContentType('application/pdf');
  },

  /**
   * スプレッドシートをExcelに変換
   * @param {string} spreadsheetId - スプレッドシートID
   * @returns {GoogleAppsScript.Base.Blob} Excelブロブ
   */
  _exportSpreadsheetToXlsx: function(spreadsheetId) {
    const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=xlsx`;

    const token = ScriptApp.getOAuthToken();
    const response = UrlFetchApp.fetch(url, {
      headers: { 'Authorization': 'Bearer ' + token }
    });

    return response.getBlob().setContentType('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  },

  /**
   * 出力先フォルダを取得
   * @param {Object} customer - 顧客データ（folder_idを持つ可能性あり）
   * @returns {GoogleAppsScript.Drive.Folder} フォルダ
   */
  _getOutputFolder: function(customer) {
    // 顧客専用フォルダがあればそれを使用
    if (customer && customer.folder_id) {
      try {
        return DriveApp.getFolderById(customer.folder_id);
      } catch (e) {
        // フォルダが見つからない場合はデフォルトを使用
      }
    }

    // デフォルトの出力先フォルダ
    const folderId = PropertiesService.getScriptProperties().getProperty(this.OUTPUT_FOLDER_KEY);
    if (folderId) {
      try {
        return DriveApp.getFolderById(folderId);
      } catch (e) {
        // フォルダが見つからない場合はルートを使用
      }
    }

    return DriveApp.getRootFolder();
  },

  /**
   * ファイル名を生成
   * @param {Object} invoice - 請求書データ
   * @param {Object} customer - 顧客データ
   * @param {string} type - ファイルタイプ（pdf/xlsx/sheet）
   * @returns {string} ファイル名
   */
  _generateFileName: function(invoice, customer, type) {
    const customerName = (customer.company_name || '不明').replace(/[\/\\?%*:|"<>]/g, '_');
    const period = `${invoice.billing_year}年${String(invoice.billing_month).padStart(2, '0')}月`;

    const extension = type === 'sheet' ? '' : `.${type}`;
    const prefix = type === 'sheet' ? '【編集用】' : '【請求書】';

    return `${prefix}${customerName}_${period}_${invoice.invoice_number}${extension}`;
  },

  /**
   * 日付をフォーマット
   * @param {string} dateStr - 日付文字列（YYYY-MM-DD）
   * @returns {string} フォーマット済み日付（令和X年X月X日）
   */
  _formatDate: function(dateStr) {
    if (!dateStr) return '';

    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;

    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();

    // 令和変換
    const reiwaYear = year - 2018;
    if (reiwaYear > 0) {
      return `令和${reiwaYear}年${month}月${day}日`;
    }

    return `${year}年${month}月${day}日`;
  }
};
