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
    format1: 'TEMPLATE_FORMAT1_ID',
    format2: 'TEMPLATE_FORMAT2_ID',
    format3: 'TEMPLATE_FORMAT3_ID',
    atamagami: 'TEMPLATE_ATAMAGAMI_ID'
  },

  /**
   * 出力先フォルダIDのScriptProperty名
   */
  OUTPUT_FOLDER_KEY: 'OUTPUT_FOLDER_ID',

  /**
   * テンプレート設定を検証
   * @param {string} format - 請求書フォーマット
   * @returns {Object} { valid: boolean, missingKey?: string, setupGuide?: string }
   */
  validateTemplateConfig: function(format) {
    const templateKey = this.TEMPLATE_KEYS[format] || this.TEMPLATE_KEYS.format1;
    const templateId = PropertiesService.getScriptProperties().getProperty(templateKey);

    if (!templateId) {
      return {
        valid: false,
        missingKey: templateKey,
        format: format,
        setupGuide: `テンプレートIDが未設定です。以下の手順で設定してください:\n` +
          `1. GASエディタで [プロジェクトの設定] を開く\n` +
          `2. [スクリプトプロパティ] に以下を追加:\n` +
          `   - プロパティ名: ${templateKey}\n` +
          `   - 値: GoogleスプレッドシートのテンプレートファイルID\n` +
          `または setInvoiceTemplateIds() 関数を実行してください。`
      };
    }

    // テンプレートファイルの存在確認
    try {
      DriveApp.getFileById(templateId);
    } catch (e) {
      return {
        valid: false,
        missingKey: templateKey,
        format: format,
        setupGuide: `テンプレートファイルが見つかりません（ID: ${templateId}）。\n` +
          `ファイルが削除されたか、アクセス権限がない可能性があります。`
      };
    }

    return { valid: true };
  },

  /**
   * 全テンプレートの設定状況を取得
   * @returns {Object} 各フォーマットの設定状況
   */
  getTemplateConfigStatus: function() {
    const status = {};
    const props = PropertiesService.getScriptProperties();

    for (const [format, key] of Object.entries(this.TEMPLATE_KEYS)) {
      const templateId = props.getProperty(key);
      status[format] = {
        key: key,
        configured: !!templateId,
        templateId: templateId || null
      };

      // ファイル存在確認
      if (templateId) {
        try {
          const file = DriveApp.getFileById(templateId);
          status[format].fileName = file.getName();
          status[format].accessible = true;
        } catch (e) {
          status[format].accessible = false;
          status[format].error = 'ファイルにアクセスできません';
        }
      }
    }

    return status;
  },

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

      // デバッグログ
      console.log('=== Export Debug ===');
      console.log('invoice_format:', invoice.invoice_format);
      console.log('customer.include_cover_page:', customer.include_cover_page);
      console.log('customer keys:', Object.keys(customer).join(', '));

      // テンプレートIDの事前検証
      const templateValidation = this.validateTemplateConfig(invoice.invoice_format);
      if (!templateValidation.valid) {
        return {
          success: false,
          error: 'TEMPLATE_NOT_CONFIGURED',
          details: templateValidation
        };
      }

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

      // PDFに変換（複数シート構成の場合は全シート、そうでなければ単一シート）
      let pdfBlob;
      if (sheetResult.hasCoverPage || sheetResult.hasPrintSheets) {
        pdfBlob = this._exportSpreadsheetToPdf(spreadsheet.getId());
      } else {
        pdfBlob = this._exportSheetToPdf(spreadsheet.getId(), sheet.getSheetId());
      }

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
   * @returns {Object} { success, spreadsheet, sheet, hasCoverPage }
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

    // 頭紙（表紙）を追加するかどうか判定
    const includeCoverPage = customer.include_cover_page === true || customer.include_cover_page === 'true';
    const supportsCoverPage = ['format1', 'format2'].includes(invoice.invoice_format);
    const hasCoverPage = includeCoverPage && supportsCoverPage;

    // デバッグログ
    console.log('=== Cover Page Debug ===');
    console.log('includeCoverPage:', includeCoverPage);
    console.log('supportsCoverPage:', supportsCoverPage);
    console.log('hasCoverPage:', hasCoverPage);
    console.log('invoice_format:', invoice.invoice_format);

    // 頭紙を先に追加（PDF出力時に先頭に来るように）
    if (hasCoverPage) {
      const coverTemplateId = PropertiesService.getScriptProperties().getProperty(this.TEMPLATE_KEYS.atamagami);
      if (coverTemplateId) {
        const coverTemplate = SpreadsheetApp.openById(coverTemplateId);
        const coverSourceSheet = coverTemplate.getSheets()[0];

        // 頭紙シートをコピー（先頭に挿入）
        const coverSheet = coverSourceSheet.copyTo(spreadsheet);
        coverSheet.setName('頭紙');
        spreadsheet.setActiveSheet(coverSheet);
        spreadsheet.moveActiveSheet(1); // 先頭に移動

        // 頭紙にデータを入力
        this._populateAtagami(coverSheet, invoice, lines, customer, company);
      }
    }

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

    // FORMAT2の場合、印刷用の3シート構成を作成
    let hasPrintSheets = false;
    if (invoice.invoice_format === 'format2' && lines.length > 0) {
      this._createPrintSheetsForFormat2(spreadsheet, sheet, lines);
      hasPrintSheets = true;
    }

    // 変更を反映
    SpreadsheetApp.flush();

    return {
      success: true,
      spreadsheet: spreadsheet,
      sheet: sheet,
      hasCoverPage: hasCoverPage,
      hasPrintSheets: hasPrintSheets
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
    // ヘッダー部分（ラベルセルを上書きしない）
    sheet.getRange('A2').setValue(customer.company_name || '');
    sheet.getRange('B5').setValue(`${invoice.billing_year}年${invoice.billing_month}月分`);  // B5に作業年月（A5はラベル）
    sheet.getRange('I5').setValue(invoice.total_amount);  // I5に合計金額

    // 荷主名（A6はラベル、B6に値）
    sheet.getRange('B6').setValue(customer.shipper_name || '');

    // 自社情報
    if (company.company_name) {
      sheet.getRange('G2').setValue(company.company_name);
    }

    // 明細行（A10から開始、視認性のため1行おき）
    const startRow = 10;
    for (let i = 0; i < lines.length; i++) {
      const row = startRow + (i * 2);  // 1行おきに入力
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
    // === デバッグログ ===
    console.log('=== _populateAtagami Debug ===');
    console.log('invoice.issue_date:', invoice.issue_date);
    console.log('invoice.invoice_number:', invoice.invoice_number);
    console.log('invoice.due_date:', invoice.due_date);
    console.log('invoice.total_amount:', invoice.total_amount);
    console.log('invoice.subtotal:', invoice.subtotal);
    console.log('invoice.expense_amount:', invoice.expense_amount);
    console.log('customer.company_name:', customer.company_name);
    console.log('customer.contact_name:', customer.contact_name);

    // === ヘッダー部分 ===

    // 顧客情報（郵便番号・住所）
    if (customer.postal_code) {
      sheet.getRange('F2').setValue(customer.postal_code);
    }
    if (customer.address) {
      sheet.getRange('E3').setValue(customer.address);
    }

    // 顧客名＋担当者名（E5: スペース区切りで同一セル）
    let customerDisplay = customer.company_name || '';
    if (customer.contact_name) {
      customerDisplay += `　${customer.contact_name}様`;  // 全角スペース
    }
    sheet.getRange('E5').setValue(customerDisplay);

    // === 直接書き込み（ラベル+値を連結、マージセル対応） ===
    // 発行日（AG2: マージセル、ラベル+値を連結）
    if (invoice.issue_date) {
      const parts = invoice.issue_date.split('-');
      const issueDateFormatted = `${parts[0]}年${parseInt(parts[1])}月${parseInt(parts[2])}日`;
      const issueDateWithLabel = `発行日　${issueDateFormatted}`;
      console.log('Writing issue_date to AG2:', issueDateWithLabel);
      sheet.getRange('AG2').setValue(issueDateWithLabel);
    }

    // 請求書No（AG3: マージセル、ラベル+値を連結）
    if (invoice.invoice_number) {
      const invoiceNoWithLabel = `No　${invoice.invoice_number}`;
      console.log('Writing invoice_number to AG3:', invoiceNoWithLabel);
      sheet.getRange('AG3').setValue(invoiceNoWithLabel);
    }

    // 支払期限（J11, M11, P11: 個別セル）
    if (invoice.due_date) {
      const dueParts = invoice.due_date.split('-');
      const dueYear = parseInt(dueParts[0]);
      const dueMonth = parseInt(dueParts[1]);
      let dueDay = parseInt(dueParts[2]);
      // 月末を超える日は月末に調整（例: 2月31日→2月28日）
      const lastDayOfMonth = new Date(dueYear, dueMonth, 0).getDate();
      if (dueDay > lastDayOfMonth) {
        dueDay = lastDayOfMonth;
      }
      console.log('Writing due_date - year:', dueYear, 'month:', dueMonth, 'day:', dueDay);
      sheet.getRange('J11').setValue(dueYear);
      sheet.getRange('M11').setValue(dueMonth);
      sheet.getRange('P11').setValue(dueDay);
    }

    // ご請求金額（A13: マージセル、ラベル+値を連結）
    const totalAmountFormatted = (invoice.total_amount || 0).toLocaleString();
    const totalAmountWithLabel = `ご請求金額　　　　　　　　¥${totalAmountFormatted}`;
    console.log('Writing total_amount to A13:', totalAmountWithLabel);
    sheet.getRange('A13').setValue(totalAmountWithLabel);

    // === 明細部分 ===

    // 年月日（A23: 作業費行）
    const billingPeriod = `${invoice.billing_year}/${String(invoice.billing_month).padStart(2, '0')}`;
    sheet.getRange('A23').setValue(billingPeriod);

    // 品目名
    sheet.getRange('F23').setValue('作業費');
    sheet.getRange('F24').setValue('諸経費');

    // 作業費金額（AI23）
    sheet.getRange('AI23').setValue(invoice.subtotal || 0);

    // 諸経費金額（AI24）
    sheet.getRange('AI24').setValue(invoice.expense_amount || 0);

    // 小計・消費税・合計（AI34, AI36, AI37）は数式で自動計算
  },

  /**
   * FORMAT2用の印刷用シートを作成（単一シート統合版）
   * - 行1-8: ヘッダー情報
   * - 行9: 列ヘッダー（凍結 → 2ページ目以降で繰り返し）
   * - 行10以降: 明細データ
   * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} spreadsheet - スプレッドシート
   * @param {GoogleAppsScript.Spreadsheet.Sheet} dataSheet - データシート
   * @param {Array} lines - 明細行データ
   */
  _createPrintSheetsForFormat2: function(spreadsheet, dataSheet, lines) {
    // 印刷用シート作成（単一シートに全データを統合）
    const printSheet = spreadsheet.insertSheet('印刷用');

    // 明細データの最終行を計算（1行おきなので）
    const startRow = 10;
    const lastDataRow = startRow + ((lines.length - 1) * 2);

    // データシートの全コンテンツを印刷用シートにコピー（行1〜最終データ行）
    const fullRange = dataSheet.getRange(`A1:J${lastDataRow}`);
    fullRange.copyTo(printSheet.getRange('A1'), SpreadsheetApp.CopyPasteType.PASTE_VALUES, false);
    fullRange.copyTo(printSheet.getRange('A1'), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);

    // 列幅をデータシートに合わせる
    for (let col = 1; col <= 10; col++) {
      printSheet.setColumnWidth(col, dataSheet.getColumnWidth(col));
    }

    // 行の高さもコピー
    for (let row = 1; row <= lastDataRow; row++) {
      printSheet.setRowHeight(row, dataSheet.getRowHeight(row));
    }

    // 凍結なし：全ページを連続的に流す（ヘッダー繰り返しなし）
    // ページ間の違和感を解消するため、自然に連続させる

    // データシートを非表示にして印刷用シートのみ表示
    dataSheet.hideSheet();
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
      `&scale=3` + // 複数ページ対応（フォントサイズ維持）
      `&top_margin=0` +
      `&bottom_margin=0` +
      `&left_margin=0.1` +
      `&right_margin=0` +
      `&sheetnames=false` +
      `&printtitle=false` +
      `&pagenumbers=false` +
      `&gridlines=false` +
      `&fzr=true`;  // 凍結行を各ページで繰り返し

    const token = ScriptApp.getOAuthToken();
    const response = UrlFetchApp.fetch(url, {
      headers: { 'Authorization': 'Bearer ' + token }
    });

    return response.getBlob().setContentType('application/pdf');
  },

  /**
   * スプレッドシート全体をPDFに変換（複数シート対応）
   * @param {string} spreadsheetId - スプレッドシートID
   * @returns {GoogleAppsScript.Base.Blob} PDFブロブ
   */
  _exportSpreadsheetToPdf: function(spreadsheetId) {
    // gidパラメータを省略して全シートを出力
    // fitw=trueで幅を1ページに収め、fzr=trueで凍結行繰り返し
    const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?` +
      `format=pdf` +
      `&portrait=true` +
      `&size=A4` +
      `&fitw=true` +  // 幅を1ページに収める
      `&fith=false` + // 高さは複数ページ可
      `&sheetnames=false` +
      `&printtitle=false` +
      `&pagenumbers=false` +
      `&gridlines=false` +
      `&fzr=true` +  // 凍結行を各ページで繰り返し
      `&printheadings=false`;

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
   * 顧客の会社フォルダ配下の「請求書」サブフォルダを返す
   * @param {Object} customer - 顧客データ（folder_idを持つ可能性あり）
   * @returns {GoogleAppsScript.Drive.Folder} フォルダ
   */
  _getOutputFolder: function(customer) {
    // 顧客専用フォルダがあればその配下の「請求書」フォルダを使用
    if (customer && customer.folder_id) {
      try {
        const invoiceFolder = CustomerFolderService.getInvoiceFolder(customer);
        if (invoiceFolder) {
          return invoiceFolder;
        }
      } catch (e) {
        Logger.log(`顧客フォルダ取得エラー: ${e.message}`);
      }
    }

    // folder_id 未設定の場合、自動作成を試みる
    if (customer && customer.customer_id && !customer.folder_id) {
      try {
        const folderResult = CustomerFolderService.createCustomerFolder(customer);
        if (folderResult.folderId) {
          CustomerFolderService._updateCustomerFolderId(
            customer.customer_id,
            folderResult.folderId
          );
          Logger.log(`請求書出力時に顧客フォルダを自動作成: ${customer.company_name}`);
          // 請求書サブフォルダを返す
          return DriveApp.getFolderById(folderResult.invoiceFolderId);
        }
      } catch (e) {
        Logger.log(`フォルダ自動作成に失敗: ${e.message}`);
      }
    }

    // デフォルトの出力先フォルダ（フォールバック）
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
   * エクスポート用フォルダをセットアップ
   * フォルダが未設定の場合は自動作成し、ScriptPropertyに保存
   * @returns {Object} { folderId: string, url: string, created: boolean }
   */
  setupExportFolder: function() {
    const props = PropertiesService.getScriptProperties();
    let folderId = props.getProperty(this.OUTPUT_FOLDER_KEY);
    let created = false;

    if (!folderId) {
      // デフォルトフォルダを作成
      const folder = DriveApp.createFolder('請求書エクスポート');
      folderId = folder.getId();
      props.setProperty(this.OUTPUT_FOLDER_KEY, folderId);
      created = true;
    }

    return {
      folderId: folderId,
      url: `https://drive.google.com/drive/folders/${folderId}`,
      created: created
    };
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
