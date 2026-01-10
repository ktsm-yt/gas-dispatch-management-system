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
   * テンプレートスプレッドシートを取得（エラーハンドリング付き）
   * ScriptPropertyからテンプレートIDを取得し、スプレッドシートを開く
   * 未設定や不正なIDの場合は明確なエラーメッセージを生成
   *
   * @param {string} templateKey - ScriptPropertyのキー名（TEMPLATE_FORMAT1_ID等）
   * @returns {GoogleAppsScript.Spreadsheet.Spreadsheet} テンプレートスプレッドシート
   * @throws {Error} テンプレートID未設定または無効な場合
   */
  _getTemplateSpreadsheet: function(templateKey) {
    const props = PropertiesService.getScriptProperties();
    const templateId = props.getProperty(templateKey);

    if (!templateId) {
      throw new Error(
        `テンプレートID未設定: ${templateKey}\n` +
        `以下の手順で設定してください:\n` +
        `1. GASエディタで [プロジェクトの設定] を開く\n` +
        `2. [スクリプトプロパティ] に以下を追加:\n` +
        `   - プロパティ名: ${templateKey}\n` +
        `   - 値: GoogleスプレッドシートのテンプレートファイルID\n` +
        `または setInvoiceTemplateIds() 関数を実行してください。`
      );
    }

    try {
      return SpreadsheetApp.openById(templateId);
    } catch (e) {
      throw new Error(
        `テンプレートを開けません: ${templateKey}=${templateId}\n` +
        `原因: ${e.message}\n` +
        `ファイルが削除されたか、アクセス権限がない可能性があります。`
      );
    }
  },

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
      // スプレッドシートを作成（PDF用：ページ分割あり）
      const sheetResult = this._createFilledSheet(invoice, lines, customer, company, { forPdf: true });
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

      const result = {
        success: true,
        fileId: file.getId(),
        url: file.getUrl(),
        invoiceId: invoice.invoice_id
      };

      // 警告があれば追加（例: 頭紙テンプレート未設定）
      if (sheetResult.warning) {
        result.warning = sheetResult.warning;
      }

      return result;
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
      // スプレッドシートを作成（Excel用：ページ分割なし、連続データ）
      // optionsをマージ（includeCoverPage等を保持）
      const sheetResult = this._createFilledSheet(invoice, lines, customer, company, Object.assign({}, options, { forPdf: false }));
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

      const result = {
        success: true,
        fileId: file.getId(),
        url: file.getUrl(),
        invoiceId: invoice.invoice_id
      };

      // 警告があれば追加（例: 頭紙テンプレート未設定）
      if (sheetResult.warning) {
        result.warning = sheetResult.warning;
      }

      return result;
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
      // スプレッドシートを作成（編集用：ページ分割なし、連続データ）
      const sheetResult = this._createFilledSheet(invoice, lines, customer, company, { forPdf: false });
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
   * @param {Object} options - オプション（forPdf: PDF用処理を行うか）
   * @returns {Object} { success, spreadsheet, sheet, hasCoverPage }
   */
  _createFilledSheet: function(invoice, lines, customer, company, options = {}) {
    const forPdf = options.forPdf !== false;  // デフォルトはtrue（後方互換）
    // テンプレートIDを取得
    const templateKey = this.TEMPLATE_KEYS[invoice.invoice_format] || this.TEMPLATE_KEYS.format1;
    const templateId = PropertiesService.getScriptProperties().getProperty(templateKey);

    if (!templateId) {
      return {
        success: false,
        error: 'TEMPLATE_NOT_FOUND',
        details: {
          missingKey: templateKey,
          setupGuide: `テンプレートIDが未設定です。ScriptPropertiesに${templateKey}を設定してください。`
        }
      };
    }

    // テンプレートをコピー（エラーハンドリング付き）
    let templateFile;
    try {
      templateFile = DriveApp.getFileById(templateId);
    } catch (e) {
      return {
        success: false,
        error: 'TEMPLATE_ACCESS_ERROR',
        details: {
          templateKey: templateKey,
          templateId: templateId,
          message: `テンプレートファイルにアクセスできません: ${e.message}`
        }
      };
    }

    const copyName = `請求書_${invoice.invoice_number}_temp`;
    const copy = templateFile.makeCopy(copyName);
    const spreadsheet = SpreadsheetApp.openById(copy.getId());
    const sheet = spreadsheet.getSheets()[0];

    // 頭紙（表紙）を追加するかどうか判定
    // - PDF出力時: 顧客設定(include_cover_page)に従う
    // - Excel出力時: options.includeCoverPageで明示指定された場合のみ
    const customerWantsCover = customer.include_cover_page === true || customer.include_cover_page === 'true';
    const supportsCoverPage = ['format1', 'format2'].includes(invoice.invoice_format);
    const includeCoverByOption = options.includeCoverPage === true;
    const hasCoverPage = supportsCoverPage && (forPdf ? customerWantsCover : includeCoverByOption);

    // デバッグログ
    console.log('=== Cover Page Debug ===');
    console.log('forPdf:', forPdf);
    console.log('customerWantsCover:', customerWantsCover);
    console.log('includeCoverByOption:', includeCoverByOption);
    console.log('supportsCoverPage:', supportsCoverPage);
    console.log('hasCoverPage:', hasCoverPage);
    console.log('invoice_format:', invoice.invoice_format);

    // 頭紙を先に追加（PDF出力時に先頭に来るように）
    let coverPageWarning = null;
    if (hasCoverPage) {
      const coverTemplateId = PropertiesService.getScriptProperties().getProperty(this.TEMPLATE_KEYS.atamagami);
      if (!coverTemplateId) {
        console.warn('頭紙テンプレートが設定されていません（TEMPLATE_ATAMAGAMI_ID）');
        coverPageWarning = '頭紙テンプレートが未設定のため、頭紙なしで出力しました。ScriptPropertiesにTEMPLATE_ATAMAGAMI_IDを設定してください。';
      } else {
        let coverTemplate;
        try {
          coverTemplate = SpreadsheetApp.openById(coverTemplateId);
        } catch (e) {
          console.warn(`頭紙テンプレートにアクセスできません: ${e.message}`);
          coverPageWarning = `頭紙テンプレートにアクセスできません（ID: ${coverTemplateId}）。ファイルが削除されたか、アクセス権限がない可能性があります。`;
        }
        if (coverTemplate) {
          const coverSourceSheet = coverTemplate.getSheetByName('原本') || coverTemplate.getSheets()[0];
          const coverDataSheet = coverTemplate.getSheetByName('データ');

          // 頭紙の原本シートをコピー（先頭に挿入）
          const coverSheet = coverSourceSheet.copyTo(spreadsheet);
          coverSheet.setName('頭紙');
          spreadsheet.setActiveSheet(coverSheet);
          spreadsheet.moveActiveSheet(1); // 先頭に移動

          // 頭紙のデータシートもコピー（数式参照用）
          let coverDataSheetCopy = null;
          if (coverDataSheet) {
            coverDataSheetCopy = coverDataSheet.copyTo(spreadsheet);
            coverDataSheetCopy.setName('頭紙データ');
          }

          // 頭紙にデータを入力
          this._populateAtagami(coverSheet, invoice, lines, customer, company);

          // 頭紙データシートを非表示
          if (coverDataSheetCopy) {
            coverDataSheetCopy.hideSheet();
          }
        }
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

    // FORMAT2のPDF出力の場合、ページ分割された印刷用シートを作成
    let hasPrintSheets = false;
    if (invoice.invoice_format === 'format2' && lines.length > 0 && forPdf) {
      this._createPrintSheetsForFormat2(spreadsheet, sheet, lines);
      hasPrintSheets = true;
    }

    // 変更を反映
    SpreadsheetApp.flush();

    return {
      success: true,
      spreadsheet: spreadsheet,
      sheet: sheet,
      hasCoverPage: hasCoverPage && !coverPageWarning,  // 実際に頭紙が付いたかどうか
      hasPrintSheets: hasPrintSheets,
      warning: coverPageWarning  // テンプレート未設定時の警告
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
    // データシートを取得（atamagamiと同じアーキテクチャ）
    const spreadsheet = sheet.getParent();
    let dataSheet = spreadsheet.getSheetByName('データ');

    if (!dataSheet) {
      console.error('データシートが見つかりません。従来の方式で書き込みます。');
      // フォールバック: 従来の直接書き込み
      this._populateFormat2Legacy(sheet, invoice, lines, customer, company);
      return;
    }

    // === ヘッダー情報をデータシートに書き込み ===
    // （売上シートは数式で自動参照）
    dataSheet.getRange('B2').setValue(customer.company_name || '');  // 請求先会社名
    dataSheet.getRange('B3').setValue(`${invoice.billing_year}年${invoice.billing_month}月分`);  // 作業年月
    dataSheet.getRange('B4').setValue(invoice.total_amount || 0);  // 合計金額
    dataSheet.getRange('B5').setValue(invoice.shipper_name || '');  // 荷主名（format1と統一）
    dataSheet.getRange('B6').setValue(company.company_name || '');  // 自社名
    dataSheet.getRange('B7').setValue(company.postal_code ? '〒' + company.postal_code : '');  // 自社郵便番号
    dataSheet.getRange('B8').setValue(company.address || '');  // 自社住所

    // === 明細行を売上シートに直接書き込み ===
    // （A10から開始、視認性のため1行おき）
    const startRow = 10;
    const templateFormatRow = 10;  // 書式コピー元の行（テンプレートの最初のデータ行）
    const lastTemplateRow = sheet.getLastRow();  // テンプレートの最終行
    const lastNeededRow = startRow + ((lines.length - 1) * 2);  // 必要な最終行

    // テンプレートの行数が足りない場合、書式を一括拡張（パフォーマンス最適化）
    if (lastNeededRow > lastTemplateRow) {
      const rowsToExtend = lastNeededRow - lastTemplateRow + 1;
      this._batchExtendFormat(sheet, templateFormatRow, lastTemplateRow + 1, rowsToExtend, 10);
    }

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

    // === 最終行に閉じる罫線を追加 ===
    if (lines.length > 0) {
      const lastRow = startRow + ((lines.length - 1) * 2);
      sheet.getRange(lastRow, 1, 1, 10).setBorder(
        null, null, true, null, null, null,
        '#000000', SpreadsheetApp.BorderStyle.SOLID
      );
    }

    // データシートを非表示（PDF/Excel出力時に見えないように）
    dataSheet.hideSheet();
  },

  /**
   * 様式2のデータを入力（レガシー：データシートがない場合のフォールバック）
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - シート
   * @param {Object} invoice - 請求書データ
   * @param {Object[]} lines - 明細データ
   * @param {Object} customer - 顧客データ
   * @param {Object} company - 自社データ
   */
  _populateFormat2Legacy: function(sheet, invoice, lines, customer, company) {
    // ヘッダー部分（ラベルセルを上書きしない）
    sheet.getRange('B2').setValue(customer.company_name || '');
    sheet.getRange('B5').setValue(`${invoice.billing_year}年${invoice.billing_month}月分`);
    sheet.getRange('I5').setValue(invoice.total_amount);
    sheet.getRange('B6').setValue(invoice.shipper_name || '');
    if (company.company_name) {
      sheet.getRange('G2').setValue(company.company_name);
    }
    if (company.postal_code) {
      sheet.getRange('G3').setValue('〒' + company.postal_code);
    }
    if (company.address) {
      sheet.getRange('I3').setValue(company.address);
    }

    // 明細行
    const startRow = 10;
    const templateFormatRow = 10;
    const lastTemplateRow = sheet.getLastRow();
    const lastNeededRow = startRow + ((lines.length - 1) * 2);

    // テンプレートの行数が足りない場合、書式を一括拡張（パフォーマンス最適化）
    if (lastNeededRow > lastTemplateRow) {
      const rowsToExtend = lastNeededRow - lastTemplateRow + 1;
      this._batchExtendFormat(sheet, templateFormatRow, lastTemplateRow + 1, rowsToExtend, 10);
    }

    for (let i = 0; i < lines.length; i++) {
      const row = startRow + (i * 2);
      const line = lines[i];
      sheet.getRange(row, 1).setValue(line.work_date || '');
      sheet.getRange(row, 2).setValue(line.site_name || '');
      sheet.getRange(row, 3).setValue(line.order_number || '');
      sheet.getRange(row, 4).setValue(line.branch_office || '');
      sheet.getRange(row, 5).setValue(line.item_name || '');
      sheet.getRange(row, 6).setValue(line.time_note || '');
      sheet.getRange(row, 7).setValue(line.quantity || 0);
      sheet.getRange(row, 8).setValue(line.unit || '人');
      sheet.getRange(row, 9).setValue(line.unit_price || 0);
      sheet.getRange(row, 10).setValue(line.amount || 0);
    }

    // 最終行に閉じる罫線
    if (lines.length > 0) {
      const lastRow = startRow + ((lines.length - 1) * 2);
      sheet.getRange(lastRow, 1, 1, 10).setBorder(
        null, null, true, null, null, null,
        '#000000', SpreadsheetApp.BorderStyle.SOLID
      );
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
    // タイトル（B1に配置、ポラテックフォーマット準拠）
    sheet.getRange('B1').setValue(`${customer.company_name || ''} ${invoice.billing_year}年${invoice.billing_month}月 追加請求一覧`);

    // 明細行（A3から開始、9列構成：№, 担当工事課, 担当監督名, 物件コード, 現場名, 施工日, 内容, 金額（税抜）, 金額（税込）
    const startRow = 3;
    const taxRate = customer.tax_rate || DEFAULT_TAX_RATE;

    for (let i = 0; i < lines.length; i++) {
      const row = startRow + i;
      const line = lines[i];
      const taxIncluded = Math.floor((line.amount || 0) * (1 + taxRate));

      sheet.getRange(row, 1).setValue(i + 1);                        // A: № (連番)
      sheet.getRange(row, 2).setValue(line.construction_div || '');  // B: 担当工事課
      sheet.getRange(row, 3).setValue(line.supervisor_name || '');   // C: 担当監督名
      sheet.getRange(row, 4).setValue(line.property_code || '');     // D: 物件コード
      sheet.getRange(row, 5).setValue(line.site_name || '');         // E: 現場名
      sheet.getRange(row, 6).setValue(line.work_date || '');         // F: 施工日
      sheet.getRange(row, 7).setValue(line.item_name || '');         // G: 内容
      sheet.getRange(row, 8).setValue(line.amount || 0);             // H: 金額（税抜）
      sheet.getRange(row, 9).setValue(taxIncluded);                  // I: 金額（税込）
    }
  },

  /**
   * 頭紙のデータを入力
   * テンプレートの「データ」シートに値を書き込み、「原本」シートは数式で自動参照
   *
   * セルマッピング:
   * - データ!B2: 発行日 (YYYY-MM-DD) → 原本!AO2 で数式参照
   * - データ!B3: No → 原本!AO3 で数式参照
   * - データ!B4: 年, B5: 月, B6: 日 → 原本!H11, L11, O11 で数式参照
   * - データ!B7: 請求金額 → 原本!I13 で数式参照
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - 原本シート
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

    // データシートを取得（「データ」または「頭紙データ」を探す）
    const spreadsheet = sheet.getParent();
    let dataSheet = spreadsheet.getSheetByName('データ');
    if (!dataSheet) {
      dataSheet = spreadsheet.getSheetByName('頭紙データ');
    }

    if (!dataSheet) {
      console.error('データシートが見つかりません。従来の方式で書き込みます。');
      this._populateAtagamiLegacy(sheet, invoice, lines, customer, company);
      return;
    }

    // === 顧客情報（原本シートに直接書き込み） ===
    if (customer.postal_code) {
      sheet.getRange('F2').setValue(customer.postal_code);
    }
    if (customer.address) {
      sheet.getRange('E3').setValue(customer.address);
    }

    // 顧客名＋担当者名
    let customerDisplay = customer.company_name || '';
    if (customer.contact_name) {
      customerDisplay += `　${customer.contact_name}様`;
    }
    sheet.getRange('E5').setValue(customerDisplay);

    // === 動的フィールド ===
    // データシートに書き込み + 原本シートの値セルにも直接書き込み
    // （シートコピー時に数式の参照先シート名がずれる問題を回避）

    // 発行日
    if (invoice.issue_date) {
      const parts = invoice.issue_date.split('-');
      const issueDateFormatted = `${parts[0]}年${parseInt(parts[1])}月${parseInt(parts[2])}日`;
      dataSheet.getRange('B2').setValue(invoice.issue_date);
      sheet.getRange('AO2').setValue(issueDateFormatted);  // 原本シートの値セルに直接書き込み
      console.log('Writing issue_date:', issueDateFormatted);
    }

    // No
    if (invoice.invoice_number) {
      dataSheet.getRange('B3').setValue(invoice.invoice_number);
      sheet.getRange('AO3').setValue(invoice.invoice_number);  // 原本シートの値セルに直接書き込み
      console.log('Writing invoice_number:', invoice.invoice_number);
    }

    // 支払期限 年/月/日
    if (invoice.due_date) {
      const dueParts = invoice.due_date.split('-');
      const dueYear = parseInt(dueParts[0]);
      const dueMonth = parseInt(dueParts[1]);
      let dueDay = parseInt(dueParts[2]);
      // 月末を超える日は月末に調整
      const lastDayOfMonth = new Date(dueYear, dueMonth, 0).getDate();
      if (dueDay > lastDayOfMonth) {
        dueDay = lastDayOfMonth;
      }
      dataSheet.getRange('B4').setValue(dueYear);
      dataSheet.getRange('B5').setValue(dueMonth);
      dataSheet.getRange('B6').setValue(dueDay);
      // 原本シートの値セルに直接書き込み
      sheet.getRange('H11').setValue(dueYear);
      sheet.getRange('L11').setValue(dueMonth);
      sheet.getRange('O11').setValue(dueDay);
      console.log('Writing due_date:', dueYear, dueMonth, dueDay);
    }

    // 請求金額
    const totalAmount = invoice.total_amount || 0;
    const totalAmountFormatted = totalAmount.toLocaleString();
    dataSheet.getRange('B7').setValue(totalAmount);
    sheet.getRange('I13').setValue(totalAmountFormatted);  // 原本シートの値セルに直接書き込み
    console.log('Writing total_amount:', totalAmountFormatted);

    // === 自社情報（IMPORTRANGEはコピー時に権限問題があるため、GASから直接書き込み） ===
    // セルマッピング: AD12=会社名, AQ13=郵便番号, AF14=住所, AO15=TEL, AO16=FAX, AM17=登録番号
    if (company.company_name) {
      sheet.getRange('AD12').setValue(company.company_name);
    }
    if (company.postal_code) {
      sheet.getRange('AQ13').setValue(company.postal_code);
    }
    if (company.address) {
      sheet.getRange('AF14').setValue(company.address);
    }
    if (company.phone) {
      sheet.getRange('AO15').setValue(company.phone);
    }
    if (company.fax) {
      sheet.getRange('AO16').setValue(company.fax);
    }
    if (company.invoice_registration_number) {
      sheet.getRange('AM17').setValue(company.invoice_registration_number);
    }

    // === 銀行情報 ===
    // セルマッピング: F35=銀行名, F36=支店, F37=口座番号, F38=口座名義
    if (company.bank_name) {
      sheet.getRange('F35').setValue(company.bank_name);
    }
    if (company.bank_branch) {
      sheet.getRange('F36').setValue(company.bank_branch);
    }
    if (company.bank_account_number) {
      sheet.getRange('F37').setValue(company.bank_account_number);
    }
    if (company.bank_account_name) {
      sheet.getRange('F38').setValue(company.bank_account_name);
    }

    // データシートを非表示
    dataSheet.hideSheet();

    // === 明細部分（原本シートに直接書き込み） ===
    const billingPeriod = `${invoice.billing_year}/${String(invoice.billing_month).padStart(2, '0')}`;
    sheet.getRange('A23').setValue(billingPeriod);

    sheet.getRange('F23').setValue('作業費');
    sheet.getRange('F24').setValue('諸経費');

    sheet.getRange('AI23').setValue(invoice.subtotal || 0);
    sheet.getRange('AI24').setValue(invoice.expense_amount || 0);
  },

  /**
   * 頭紙のデータを入力（従来方式 - フォールバック用）
   * データシートがない場合に使用
   */
  _populateAtagamiLegacy: function(sheet, invoice, lines, customer, company) {
    // 顧客情報
    if (customer.postal_code) sheet.getRange('F2').setValue(customer.postal_code);
    if (customer.address) sheet.getRange('E3').setValue(customer.address);

    let customerDisplay = customer.company_name || '';
    if (customer.contact_name) customerDisplay += `　${customer.contact_name}様`;
    sheet.getRange('E5').setValue(customerDisplay);

    // 発行日（ラベル+値を連結）
    if (invoice.issue_date) {
      const parts = invoice.issue_date.split('-');
      const formatted = `発行日　${parts[0]}年${parseInt(parts[1])}月${parseInt(parts[2])}日`;
      sheet.getRange('AG2').setValue(formatted);
    }

    // No
    if (invoice.invoice_number) {
      sheet.getRange('AG3').setValue(`No　${invoice.invoice_number}`);
    }

    // 支払期限
    if (invoice.due_date) {
      const dueParts = invoice.due_date.split('-');
      sheet.getRange('J11').setValue(parseInt(dueParts[0]));
      sheet.getRange('M11').setValue(parseInt(dueParts[1]));
      sheet.getRange('P11').setValue(parseInt(dueParts[2]));
    }

    // 請求金額
    const totalFormatted = (invoice.total_amount || 0).toLocaleString();
    sheet.getRange('A13').setValue(`ご請求金額　　　　　　　　¥${totalFormatted}`);

    // 明細
    const billingPeriod = `${invoice.billing_year}/${String(invoice.billing_month).padStart(2, '0')}`;
    sheet.getRange('A23').setValue(billingPeriod);
    sheet.getRange('F23').setValue('作業費');
    sheet.getRange('F24').setValue('諸経費');
    sheet.getRange('AI23').setValue(invoice.subtotal || 0);
    sheet.getRange('AI24').setValue(invoice.expense_amount || 0);
  },

  // ============================================
  // Batch Copy Helpers（パフォーマンス最適化）
  // ============================================

  /**
   * 交互配置の行を一括コピー（バッチ処理）
   * データシートの交互配置（データ行、空白行、データ行...）を
   * ターゲットシートに一括でコピーする
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sourceSheet - コピー元シート
   * @param {GoogleAppsScript.Spreadsheet.Sheet} targetSheet - コピー先シート
   * @param {number} sourceStartRow - コピー元の開始行（1-based）
   * @param {number} targetStartRow - コピー先の開始行（1-based）
   * @param {number} itemCount - コピーするアイテム数（1アイテム=2行）
   * @param {number} columnsCount - コピーする列数
   * @param {boolean} includeFormat - 書式もコピーするか
   */
  _batchCopyInterleavedRows: function(sourceSheet, targetSheet, sourceStartRow, targetStartRow, itemCount, columnsCount, includeFormat) {
    if (itemCount === 0) return;

    const sourceRowCount = itemCount * 2;

    // 一括でソース範囲を取得
    const sourceRange = sourceSheet.getRange(sourceStartRow, 1, sourceRowCount, columnsCount);
    const targetRange = targetSheet.getRange(targetStartRow, 1, sourceRowCount, columnsCount);

    // 値を一括コピー
    targetRange.setValues(sourceRange.getValues());

    // 書式を一括コピー
    if (includeFormat) {
      sourceRange.copyTo(targetRange, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
    }

    // 行高さを一括設定
    this._batchSetRowHeights(sourceSheet, targetSheet, sourceStartRow, targetStartRow, sourceRowCount);

    console.log(`バッチコピー完了: ${itemCount}アイテム (${sourceRowCount}行)`);
  },

  /**
   * 行高さを一括設定（同じ高さの行をグループ化して効率化）
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sourceSheet - コピー元シート
   * @param {GoogleAppsScript.Spreadsheet.Sheet} targetSheet - コピー先シート
   * @param {number} sourceStartRow - コピー元の開始行
   * @param {number} targetStartRow - コピー先の開始行
   * @param {number} rowCount - 行数
   */
  _batchSetRowHeights: function(sourceSheet, targetSheet, sourceStartRow, targetStartRow, rowCount) {
    if (rowCount === 0) return;

    // ソースの行高さを収集
    const heights = [];
    for (let i = 0; i < rowCount; i++) {
      heights.push(sourceSheet.getRowHeight(sourceStartRow + i));
    }

    // 連続する同じ高さの行をグループ化して一括設定
    let groupStart = 0;
    let currentHeight = heights[0];

    for (let i = 1; i <= heights.length; i++) {
      if (i === heights.length || heights[i] !== currentHeight) {
        // グループを一括設定
        const groupRowCount = i - groupStart;
        targetSheet.setRowHeights(targetStartRow + groupStart, groupRowCount, currentHeight);

        if (i < heights.length) {
          groupStart = i;
          currentHeight = heights[i];
        }
      }
    }
  },

  /**
   * 書式パターンを繰り返し適用（バッチ処理）
   * 2行パターン（データ行+空白行）を必要な行数分だけ一括拡張
   *
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - シート
   * @param {number} sourceRow - 書式コピー元の開始行
   * @param {number} targetStartRow - 書式適用先の開始行
   * @param {number} targetRowCount - 適用する行数
   * @param {number} columnsCount - 列数
   */
  _batchExtendFormat: function(sheet, sourceRow, targetStartRow, targetRowCount, columnsCount) {
    if (targetRowCount <= 0) return;

    const sourceRange = sheet.getRange(sourceRow, 1, 2, columnsCount);
    const targetRange = sheet.getRange(targetStartRow, 1, targetRowCount, columnsCount);

    // 書式を一括コピー（copyToは範囲全体に適用される）
    sourceRange.copyTo(targetRange, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);

    console.log(`書式を一括拡張: 行${targetStartRow} から ${targetRowCount}行`);
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
    // === 2シート構成アプローチ（改良版） ===
    // 1. 表紙シート: 行1-9（ヘッダー全体）+ 1ページ目のデータ
    // 2. 明細シート: 行9（列ヘッダー）を凍結 + 残りのデータ
    // → fzr=true で凍結行が各ページに自動繰り返し

    console.log(`=== FORMAT2 2シート構成（改良版） ===`);
    console.log(`明細行数: ${lines.length}`);

    // 1ページ目に入るデータ行数（控えめに設定）
    const FIRST_PAGE_DATA_ROWS = 27;
    const dataStartRow = 10;

    // 表紙に入れるデータ行数
    const coverDataRows = Math.min(FIRST_PAGE_DATA_ROWS, lines.length);
    // 明細シートに入れるデータ行数
    const detailDataRows = lines.length - coverDataRows;

    console.log(`表紙データ行: ${coverDataRows}, 明細データ行: ${detailDataRows}`);

    // === 1. 表紙シートを作成 ===
    const coverSheet = spreadsheet.insertSheet('表紙');

    // 列幅をコピー
    for (let col = 1; col <= 10; col++) {
      coverSheet.setColumnWidth(col, dataSheet.getColumnWidth(col));
    }

    // 行1-9（ヘッダー全体）をコピー
    const headerRange = dataSheet.getRange('A1:J9');
    headerRange.copyTo(coverSheet.getRange('A1'), SpreadsheetApp.CopyPasteType.PASTE_VALUES, false);
    headerRange.copyTo(coverSheet.getRange('A1'), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);

    // 行高さをコピー（行1-9）
    for (let row = 1; row <= 9; row++) {
      coverSheet.setRowHeight(row, dataSheet.getRowHeight(row));
    }

    // 表紙にデータ行をバッチコピー（行10以降）- パフォーマンス最適化
    if (coverDataRows > 0) {
      this._batchCopyInterleavedRows(dataSheet, coverSheet, dataStartRow, 10, coverDataRows, 10, true);
    }
    const coverLastRow = 9 + coverDataRows * 2;

    console.log(`表紙シート作成完了（バッチ処理）: ${coverLastRow}行`);

    // === 2. 明細シートを作成（残りデータがある場合のみ） ===
    if (detailDataRows > 0) {
      const detailSheet = spreadsheet.insertSheet('明細');

      // 列幅をコピー
      for (let col = 1; col <= 10; col++) {
        detailSheet.setColumnWidth(col, dataSheet.getColumnWidth(col));
      }

      // 行9（列ヘッダー）を明細シートの1行目にコピー
      const columnHeaderRange = dataSheet.getRange('A9:J9');
      columnHeaderRange.copyTo(detailSheet.getRange('A1'), SpreadsheetApp.CopyPasteType.PASTE_VALUES, false);
      columnHeaderRange.copyTo(detailSheet.getRange('A1'), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
      detailSheet.setRowHeight(1, dataSheet.getRowHeight(9));

      // 1行目を凍結（各ページで繰り返される）
      detailSheet.setFrozenRows(1);

      // 残りのデータ行をバッチコピー - パフォーマンス最適化
      const detailSourceStart = dataStartRow + coverDataRows * 2;  // 表紙分をスキップ
      this._batchCopyInterleavedRows(dataSheet, detailSheet, detailSourceStart, 2, detailDataRows, 10, true);
      const detailLastRow = 1 + detailDataRows * 2;

      // 最終行に閉じる罫線
      detailSheet.getRange(detailLastRow, 1, 1, 10).setBorder(
        null, null, true, null, null, null,
        '#000000', SpreadsheetApp.BorderStyle.SOLID
      );

      console.log(`明細シート作成完了（バッチ処理）: ${detailLastRow}行`);
    } else {
      // データが1ページに収まる場合は表紙の最終行に罫線
      coverSheet.getRange(coverLastRow, 1, 1, 10).setBorder(
        null, null, true, null, null, null,
        '#000000', SpreadsheetApp.BorderStyle.SOLID
      );
      console.log(`明細シート不要（1ページで収まる）`);
    }

    // データシートを非表示
    dataSheet.hideSheet();

    console.log(`2シート構成完了`);
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
      `&fzr=true` +  // 凍結行を各ページで繰り返し
      `&horizontal_alignment=CENTER`;  // 水平方向中央揃え

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
    // horizontal_alignment=CENTERで水平方向中央揃え
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
      `&printheadings=false` +
      `&horizontal_alignment=CENTER`;  // 水平方向中央揃え

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

/**
 * 出力先フォルダを設定（GASエディタから一度だけ実行）
 * gas-dispatch-system > 出力 > 請求
 */
function setOutputFolderId() {
  const folderId = '1yfVVTmRpeizoM9AR1_zgbcLriCZxGCj5';
  PropertiesService.getScriptProperties().setProperty('OUTPUT_FOLDER_ID', folderId);
  Logger.log('Output folder set to: ' + folderId);
  Logger.log('URL: https://drive.google.com/drive/folders/' + folderId);
}
