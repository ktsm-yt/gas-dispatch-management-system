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
  INVOICE_EXPORT_FOLDER_KEY: 'INVOICE_EXPORT_FOLDER_ID',

  /**
   * テンプレートスプレッドシートを取得（エラーハンドリング付き）
   * ScriptPropertyからテンプレートIDを取得し、スプレッドシートを開く
   * 未設定や不正なIDの場合は明確なエラーメッセージを生成
   *
   * @param {string} templateKey - ScriptPropertyのキー名（TEMPLATE_FORMAT1_ID等）
   * @returns {GoogleAppsScript.Spreadsheet.Spreadsheet} テンプレートスプレッドシート
   * @throws {Error} テンプレートID未設定または無効な場合
   */
  _getTemplateSpreadsheet: function(templateKey: string) {
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
    } catch (e: unknown) {
      throw new Error(
        `テンプレートを開けません: ${templateKey}=${templateId}\n` +
        `原因: ${((e instanceof Error) ? e.message : String(e))}\n` +
        `ファイルが削除されたか、アクセス権限がない可能性があります。`
      );
    }
  },

  /**
   * テンプレート設定を検証
   * @param {string} format - 請求書フォーマット
   * @returns {Object} { valid: boolean, missingKey?: string, setupGuide?: string }
   */
  validateTemplateConfig: function(format: string) {
    const templateKey = (this.TEMPLATE_KEYS as Record<string, string>)[format] || this.TEMPLATE_KEYS.format1;
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
    } catch (e: unknown) {
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
    const status: Record<string, unknown> = {};
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
          (status[format] as unknown as Record<string, unknown>).fileName = file.getName();
          (status[format] as unknown as Record<string, unknown>).accessible = true;
        } catch (e: unknown) {
          (status[format] as unknown as Record<string, unknown>).accessible = false;
          (status[format] as unknown as Record<string, unknown>).error = 'ファイルにアクセスできません';
        }
      }
    }

    return status;
  },

  /**
   * 同名ファイルの存在をチェック
   * @param {string} invoiceId - 請求ID
   * @param {string} mode - 出力モード（pdf/excel/cover）
   * @param {Object} options - オプション（includeCoverPage: true で頭紙付きファイル名をチェック）
   * @returns {Object} { exists: boolean, existingFile?: { id, name, url, modifiedDate } }
   */
  checkExistingFile: function(invoiceId: string, mode: string, options: Record<string, unknown> = {}) {
    try {
      const invoiceData = InvoiceService.get(invoiceId);
      if (!invoiceData) {
        return { exists: false, error: 'INVOICE_NOT_FOUND' };
      }

      const { invoice, customer } = this._extractInvoiceData(invoiceData as unknown as Record<string, unknown>);
      const folder = this._getOutputFolder(customer);

      // modeとoptionsに基づいてファイル名オプションを決定
      let fileType, fileNameOptions;
      if (mode === 'cover') {
        // 頭紙のみ出力
        fileType = 'xlsx';
        fileNameOptions = { coverOnly: true };
      } else {
        fileType = mode === 'excel' ? 'xlsx' : 'pdf';
        fileNameOptions = { withCover: options.includeCoverPage === true };
      }

      const fileName = this._generateFileName(invoice as Record<string, unknown>, customer, fileType, fileNameOptions);

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
      logErr('checkExistingFile', error);
      return { exists: false, error: ((error instanceof Error) ? error.message : String(error)) };
    }
  },

  /**
   * 請求書を出力
   * @param {string} invoiceId - 請求ID
   * @param {string} mode - 出力モード（pdf/excel/cover）
   * @param {Object} options - オプション（action: 'overwrite'|'rename' で重複ファイル処理を指定）
   * @returns {Object} { success, fileId, url, error }
   */
  export: function(invoiceId: string, mode: string, options: Record<string, unknown> = {}) {
    try {
      // 請求書データを取得
      const invoiceData = InvoiceService.get(invoiceId);
      if (!invoiceData) {
        return { success: false, error: 'INVOICE_NOT_FOUND' };
      }

      const { invoice, lines, customer } = this._extractInvoiceData(invoiceData as unknown as Record<string, unknown>);

      // デバッグログ
      console.log('=== Export Debug ===');
      console.log('invoice_format:', invoice.invoice_format);
      console.log('customer.include_cover_page:', (customer as unknown as Record<string, unknown>).include_cover_page);
      console.log('customer keys:', Object.keys(customer).join(', '));

      // テンプレートIDの事前検証
      const templateValidation = this.validateTemplateConfig(String(invoice.invoice_format));
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
          return this.exportToPdf(invoice as Record<string, unknown>, lines as Record<string, unknown>[], customer, company, options);
        case 'excel':
          return this.exportToExcel(invoice as Record<string, unknown>, lines as Record<string, unknown>[], customer, company, options);
        case 'cover':
          return this.exportCoverOnly(invoice as Record<string, unknown>, lines as Record<string, unknown>[], customer, company, options);
        default:
          return { success: false, error: 'INVALID_MODE' };
      }
    } catch (error: unknown) {
      logErr('InvoiceExportService.export', error);
      return { success: false, error: ((error instanceof Error) ? error.message : String(error)) || 'EXPORT_ERROR' };
    }
  },

  /**
   * 事前ロード済みデータで請求書を出力（一括出力最適化用）
   * InvoiceService.get() をスキップしてシートI/Oを削減
   *
   * @param {Object} invoiceData - InvoiceService.get()相当のデータ
   * @param {string} mode - 出力モード（pdf/excel/cover）
   * @param {Object} options - オプション
   * @param {Object} options.company - 自社情報（省略時は内部で取得）
   * @returns {Object} { success, fileId, url, error }
   */
  exportWithData: function(invoiceData: Record<string, unknown>, mode: string, options: Record<string, unknown> = {}) {
    try {
      if (!invoiceData) {
        return { success: false, error: 'INVOICE_DATA_REQUIRED' };
      }

      const { invoice, lines, customer } = this._extractInvoiceData(invoiceData as unknown as Record<string, unknown>);

      // テンプレートIDの事前検証
      const templateValidation = this.validateTemplateConfig(String(invoice.invoice_format));
      if (!templateValidation.valid) {
        return {
          success: false,
          error: 'TEMPLATE_NOT_CONFIGURED',
          details: templateValidation
        };
      }

      // 自社情報（事前ロード済みなら使い回し）
      const company = options.company || this._getCompanyInfo();

      // フォーマットに応じた処理
      switch (mode) {
        case 'pdf':
          return this.exportToPdf(invoice as Record<string, unknown>, lines as Record<string, unknown>[], customer, company as Record<string, unknown>, options);
        case 'excel':
          return this.exportToExcel(invoice as Record<string, unknown>, lines as Record<string, unknown>[], customer, company as Record<string, unknown>, options);
        case 'cover':
          return this.exportCoverOnly(invoice as Record<string, unknown>, lines as Record<string, unknown>[], customer, company as Record<string, unknown>, options);
        default:
          return { success: false, error: 'INVALID_MODE' };
      }
    } catch (error: unknown) {
      logErr('InvoiceExportService.exportWithData', error);
      return { success: false, error: ((error instanceof Error) ? error.message : String(error)) || 'EXPORT_ERROR' };
    }
  },

  /**
   * PDF出力
   * @param {Object} invoice - 請求書データ
   * @param {Object[]} lines - 明細データ
   * @param {Object} customer - 顧客データ
   * @param {Object} company - 自社データ
   * @param {Object} options - オプション（action: 'overwrite'|'rename' で重複ファイル処理を指定）
   * @returns {Object} { success, fileId, url }
   */
  exportToPdf: function(invoice: Record<string, unknown>, lines: Record<string, unknown>[], customer: Record<string, unknown>, company: Record<string, unknown>, options: Record<string, unknown> = {}) {
    try {
      const timings: Record<string, number> = { start: Date.now() };
      Logger.log(`[TIMING] exportToPdf START - invoice: ${invoice.invoice_number}`);

      // スプレッドシートを作成（PDF用：ページ分割あり）
      const mergedOptions = Object.assign({}, options, { forPdf: true });
      const sheetResult = this._createFilledSheet(invoice, lines, customer, company, mergedOptions);
      timings.createSheet = Date.now();
      Logger.log(`[TIMING] _createFilledSheet: ${timings.createSheet - timings.start}ms`);

      if (!sheetResult.success) {
        return sheetResult;
      }

      const spreadsheet = sheetResult.spreadsheet;
      const sheet = sheetResult.sheet;

      // PDFに変換（複数シート構成の場合は全シート、そうでなければ単一シート）
      // format3は横向き印刷
      const pdfOptions = { landscape: invoice.invoice_format === 'format3' };
      let pdfBlob;
      if (sheetResult.hasCoverPage || sheetResult.hasPrintSheets) {
        pdfBlob = this._exportSpreadsheetToPdf(spreadsheet!.getId(), pdfOptions);
      } else {
        pdfBlob = this._exportSheetToPdf(spreadsheet!.getId(), sheet!.getSheetId(), pdfOptions);
      }
      timings.exportPdf = Date.now();
      Logger.log(`[TIMING] PDF export: ${timings.exportPdf - timings.createSheet}ms`);

      // 出力先フォルダを取得
      const folder = this._getOutputFolder(customer);
      timings.getFolder = Date.now();
      Logger.log(`[TIMING] getOutputFolder: ${timings.getFolder - timings.exportPdf}ms`);

      // ファイル名を生成（renameの場合はタイムスタンプ付き、頭紙付きの場合は区別）
      const addTimestamp = options.action === 'rename';
      const withCover = sheetResult.hasCoverPage;
      const fileName = this._generateFileName(invoice, customer, 'pdf', { addTimestamp, withCover });
      pdfBlob.setName(fileName);

      // 上書きの場合は既存ファイルを削除（同じ頭紙設定のファイルのみ）
      if (options.action === 'overwrite') {
        const existingFiles = folder.getFilesByName(this._generateFileName(invoice, customer, 'pdf', { withCover }));
        while (existingFiles.hasNext()) {
          existingFiles.next().setTrashed(true);
        }
      }
      timings.deleteExisting = Date.now();
      Logger.log(`[TIMING] delete existing: ${timings.deleteExisting - timings.getFolder}ms`);

      // 出力先フォルダに保存
      const file = folder.createFile(pdfBlob);
      timings.createFile = Date.now();
      Logger.log(`[TIMING] createFile: ${timings.createFile - timings.deleteExisting}ms`);

      // 一時スプレッドシートを削除
      if (!options.keepSheet) {
        DriveApp.getFileById(spreadsheet!.getId()).setTrashed(true);
      }
      timings.cleanup = Date.now();
      Logger.log(`[TIMING] cleanup temp sheet: ${timings.cleanup - timings.createFile}ms`);

      // 請求書のファイルIDを更新
      InvoiceRepository.updateFileIds(String(invoice.invoice_id), { pdf_file_id: file.getId() });
      timings.updateDb = Date.now();
      Logger.log(`[TIMING] updateFileIds: ${timings.updateDb - timings.cleanup}ms`);
      Logger.log(`[TIMING] exportToPdf TOTAL: ${timings.updateDb - timings.start}ms`);

      const result: Record<string, unknown> = {
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
    } catch (error: unknown) {
      logErr('exportToPdf', error);
      return { success: false, error: ((error instanceof Error) ? error.message : String(error)) || 'PDF_EXPORT_ERROR' };
    }
  },

  /**
   * Excel出力
   * @param {Object} invoice - 請求書データ
   * @param {Object[]} lines - 明細データ
   * @param {Object} customer - 顧客データ
   * @param {Object} company - 自社データ
   * @param {Object} options - オプション（action: 'overwrite'|'rename' で重複ファイル処理を指定）
   * @returns {Object} { success, fileId, url }
   */
  exportToExcel: function(invoice: Record<string, unknown>, lines: Record<string, unknown>[], customer: Record<string, unknown>, company: Record<string, unknown>, options: Record<string, unknown> = {}) {
    try {
      // デバッグログ
      console.log('=== exportToExcel Debug ===');
      console.log('options:', JSON.stringify(options));
      console.log('options.includeCoverPage:', options.includeCoverPage);

      // スプレッドシートを作成（Excel用：ページ分割なし、連続データ）
      // optionsをマージ（includeCoverPage等を保持）
      const mergedOptions = Object.assign({}, options, { forPdf: false });
      console.log('mergedOptions:', JSON.stringify(mergedOptions));
      const sheetResult = this._createFilledSheet(invoice, lines, customer, company, mergedOptions);
      if (!sheetResult.success) {
        return sheetResult;
      }

      const spreadsheet = sheetResult.spreadsheet;

      // Excelに変換
      const xlsxBlob = this._exportSpreadsheetToXlsx(spreadsheet!.getId());

      // 出力先フォルダを取得
      const folder = this._getOutputFolder(customer);

      // ファイル名を生成（renameの場合はタイムスタンプ付き、頭紙付きの場合は区別）
      const addTimestamp = options.action === 'rename';
      const withCover = sheetResult.hasCoverPage;
      const fileName = this._generateFileName(invoice, customer, 'xlsx', { addTimestamp, withCover });
      xlsxBlob.setName(fileName);

      // 上書きの場合は既存ファイルを削除（同じ頭紙設定のファイルのみ）
      if (options.action === 'overwrite') {
        const existingFiles = folder.getFilesByName(this._generateFileName(invoice, customer, 'xlsx', { withCover }));
        while (existingFiles.hasNext()) {
          existingFiles.next().setTrashed(true);
        }
      }

      // 出力先フォルダに保存
      const file = folder.createFile(xlsxBlob);

      // 一時スプレッドシートを削除
      if (!options.keepSheet) {
        DriveApp.getFileById(spreadsheet!.getId()).setTrashed(true);
      }

      // 請求書のファイルIDを更新
      InvoiceRepository.updateFileIds(String(invoice.invoice_id), { excel_file_id: file.getId() });

      const result: Record<string, unknown> = {
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
    } catch (error: unknown) {
      logErr('exportToExcel', error);
      return { success: false, error: ((error instanceof Error) ? error.message : String(error)) || 'EXCEL_EXPORT_ERROR' };
    }
  },

  /**
   * 頭紙のみをExcel出力
   * @param {Object} invoice - 請求書データ
   * @param {Object[]} lines - 明細データ
   * @param {Object} customer - 顧客データ
   * @param {Object} company - 自社データ
   * @param {Object} options - オプション
   * @returns {Object} { success, fileId, url }
   */
  exportCoverOnly: function(invoice: Record<string, unknown>, lines: Record<string, unknown>[], customer: Record<string, unknown>, company: Record<string, unknown>, options: Record<string, unknown> = {}) {
    try {
      // format1/format2のみ頭紙対応
      const supportsCoverPage = ['format1', 'format2'].includes(String(invoice.invoice_format));
      if (!supportsCoverPage) {
        return { success: false, error: 'このフォーマットは頭紙に対応していません' };
      }

      // 頭紙テンプレートを取得
      const coverTemplateId = PropertiesService.getScriptProperties().getProperty(this.TEMPLATE_KEYS.atamagami);
      if (!coverTemplateId) {
        return { success: false, error: '頭紙テンプレートが設定されていません（TEMPLATE_ATAMAGAMI_ID）' };
      }

      let coverTemplate;
      try {
        coverTemplate = SpreadsheetApp.openById(coverTemplateId);
      } catch (e: unknown) {
        return { success: false, error: `頭紙テンプレートにアクセスできません: ${((e instanceof Error) ? e.message : String(e))}` };
      }

      // テンプレートをコピー
      const copyName = `頭紙_${invoice.invoice_number}_temp`;
      const templateFile = DriveApp.getFileById(coverTemplateId);
      const copy = templateFile.makeCopy(copyName);
      const spreadsheet = SpreadsheetApp.openById(copy.getId());

      // 原本シートを取得
      const sheet = spreadsheet.getSheetByName('原本') || spreadsheet.getSheets()[0];

      // 頭紙にデータを入力
      this._populateAtagami(sheet, invoice, lines, customer, company);

      // 変更を反映
      SpreadsheetApp.flush();

      // Excelに変換
      const xlsxBlob = this._exportSpreadsheetToXlsx(spreadsheet!.getId());

      // 出力先フォルダを取得
      const folder = this._getOutputFolder(customer);

      // ファイル名を生成
      const addTimestamp = options.action === 'rename';
      const fileName = this._generateFileName(invoice, customer, 'xlsx', { addTimestamp, coverOnly: true });
      xlsxBlob.setName(fileName);

      // 上書きの場合は既存ファイルを削除
      if (options.action === 'overwrite') {
        const existingFiles = folder.getFilesByName(this._generateFileName(invoice, customer, 'xlsx', { coverOnly: true }));
        while (existingFiles.hasNext()) {
          existingFiles.next().setTrashed(true);
        }
      }

      // 出力先フォルダに保存
      const file = folder.createFile(xlsxBlob);

      // 一時スプレッドシートを削除
      DriveApp.getFileById(spreadsheet!.getId()).setTrashed(true);

      return {
        success: true,
        fileId: file.getId(),
        url: file.getUrl(),
        invoiceId: invoice.invoice_id
      };
    } catch (error: unknown) {
      logErr('exportCoverOnly', error);
      return { success: false, error: ((error instanceof Error) ? error.message : String(error)) || 'COVER_EXPORT_ERROR' };
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
  _extractInvoiceData: function(invoiceData: Record<string, unknown>): { invoice: Record<string, unknown>; lines: Record<string, unknown>[]; customer: Record<string, unknown> } {
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
      lines: (invoiceData.lines || []) as Record<string, unknown>[],
      customer: (invoiceData.customer || {}) as Record<string, unknown>
    };
  },

  /**
   * 自社情報を取得
   * MasterCacheを使用してキャッシュ化（一括出力時の重複読み込みを削減）
   * 注意: M_Companyシートの列名が日本語の場合もマッピングする
   * @returns {Object} 自社情報
   */
  _getCompanyInfo: function() {
    // MasterCacheを使用（複数回の呼び出しでもシートI/Oは1回）
    const raw = MasterCache.getCompany();
    if (!raw || Object.keys(raw).length === 0) {
      console.warn('[InvoiceExportService] M_Company にレコードがありません');
      return {};
    }

    // 日本語列名のマッピング（シートの列名が日本語の場合に対応）
    // db_init.gs の M_Company 定義に準拠したフィールド名を使用
    const company = {
      ...raw,
      // 基本情報
      company_name: raw.company_name || raw['会社名'] || raw['自社名'] || '',
      postal_code: raw.postal_code || raw['郵便番号'] || '',
      address: raw.address || raw['住所'] || raw['所在地'] || '',
      phone: raw.phone || raw['電話番号'] || raw['TEL'] || '',
      fax: raw.fax || raw['FAX'] || raw['ファックス'] || '',
      // インボイス登録番号
      invoice_registration_number: raw.invoice_registration_number || raw['登録番号'] || raw['インボイス番号'] || '',
      // 銀行情報（個別フィールド）
      bank_name: raw.bank_name || raw['銀行名'] || '',
      bank_branch: raw.bank_branch || raw['支店名'] || '',
      bank_account_type: raw.bank_account_type || raw['口座種別'] || '',
      bank_account_number: raw.bank_account_number || raw['口座番号'] || '',
      bank_account_name: raw.bank_account_name || raw['口座名義'] || ''
    };

    // 請求書に必要なフィールドの確認
    if (!company.postal_code) {
      console.warn('[InvoiceExportService] M_Company.postal_code が未設定です（日本語キーも確認済み）');
    }
    if (!company.address) {
      console.warn('[InvoiceExportService] M_Company.address が未設定です（日本語キーも確認済み）');
    }
    return company;
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
  _createFilledSheet: function(invoice: Record<string, unknown>, lines: Record<string, unknown>[], customer: Record<string, unknown>, company: Record<string, unknown>, options: Record<string, unknown> = {}) {
    const _t: Record<string, number> = { start: Date.now() };  // タイミング計測用
    const forPdf = options.forPdf !== false;  // デフォルトはtrue（後方互換）
    // テンプレートIDを取得
    const templateKey = (this.TEMPLATE_KEYS as Record<string, string>)[invoice.invoice_format as string] || this.TEMPLATE_KEYS.format1;
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
    } catch (e: unknown) {
      return {
        success: false,
        error: 'TEMPLATE_ACCESS_ERROR',
        details: {
          templateKey: templateKey,
          templateId: templateId,
          message: `テンプレートファイルにアクセスできません: ${((e instanceof Error) ? e.message : String(e))}`
        }
      };
    }
    _t.getTemplate = Date.now();
    Logger.log(`[TIMING][_createFilledSheet] getFileById: ${_t.getTemplate - _t.start}ms`);

    const copyName = `請求書_${invoice.invoice_number}_temp`;
    const copy = templateFile.makeCopy(copyName);
    _t.makeCopy = Date.now();
    Logger.log(`[TIMING][_createFilledSheet] makeCopy: ${_t.makeCopy - _t.getTemplate}ms`);

    const spreadsheet = SpreadsheetApp.openById(copy.getId());
    const sheet = spreadsheet.getSheets()[0];
    _t.openSheet = Date.now();
    Logger.log(`[TIMING][_createFilledSheet] openById+getSheets: ${_t.openSheet - _t.makeCopy}ms`);

    // 頭紙（表紙）を追加するかどうか判定
    // - ユーザーが明示指定した場合: その値を優先
    // - 指定がない場合: PDF出力時は顧客設定(include_cover_page)に従う、Excel出力時は頭紙なし
    const customerWantsCover = customer.include_cover_page === true || customer.include_cover_page === 'true';
    const supportsCoverPage = ['format1', 'format2'].includes(String(invoice.invoice_format));

    // ユーザー指定を正規化（文字列"true"/"false"も考慮）
    let userWantsCover = null;
    if (options.includeCoverPage === true || options.includeCoverPage === 'true') {
      userWantsCover = true;
    } else if (options.includeCoverPage === false || options.includeCoverPage === 'false') {
      userWantsCover = false;
    }

    // 頭紙を付けるかどうかの最終判定
    let hasCoverPage = false;
    if (supportsCoverPage) {
      if (userWantsCover !== null) {
        // ユーザーが明示指定した場合はその値を使用
        hasCoverPage = userWantsCover;
      } else if (forPdf) {
        // PDF出力時は顧客設定に従う
        hasCoverPage = customerWantsCover;
      }
      // Excel出力時でユーザー指定がない場合は頭紙なし（hasCoverPage = false）
    }

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
        } catch (e: unknown) {
          console.warn(`頭紙テンプレートにアクセスできません: ${((e instanceof Error) ? e.message : String(e))}`);
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
    _t.coverPage = Date.now();
    Logger.log(`[TIMING][_createFilledSheet] coverPage (hasCover=${hasCoverPage}): ${_t.coverPage - _t.openSheet}ms`);

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
    _t.populate = Date.now();
    Logger.log(`[TIMING][_createFilledSheet] populate (${invoice.invoice_format}): ${_t.populate - _t.coverPage}ms`);

    // PDFページ分割用シート作成（format1/format2共通）
    let hasPrintSheets = false;
    if (lines.length > 0 && forPdf) {
      if (invoice.invoice_format === 'format1') {
        this._createPrintSheetsForFormat1(spreadsheet, sheet, lines, invoice);
        hasPrintSheets = true;
      } else if (invoice.invoice_format === 'format2') {
        this._createPrintSheetsForFormat2(spreadsheet, sheet, lines, invoice);
        hasPrintSheets = true;
      }
    }
    _t.printSheets = Date.now();
    Logger.log(`[TIMING][_createFilledSheet] printSheets (lines=${lines.length}): ${_t.printSheets - _t.populate}ms`);

    // 変更を反映
    SpreadsheetApp.flush();
    _t.flush = Date.now();
    Logger.log(`[TIMING][_createFilledSheet] flush: ${_t.flush - _t.printSheets}ms`);
    Logger.log(`[TIMING][_createFilledSheet] TOTAL: ${_t.flush - _t.start}ms`);

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
  _populateFormat1: function(sheet: GoogleAppsScript.Spreadsheet.Sheet, invoice: Record<string, unknown>, lines: Record<string, unknown>[], customer: Record<string, unknown>, company: Record<string, unknown>) {
    const spreadsheet = sheet.getParent();
    const dataSheet = spreadsheet.getSheetByName('データ');

    // P2-8: 合計金額は税抜（作業費 + 諸経費）
    const totalBeforeTax = Number(invoice.subtotal || 0) + Number(invoice.expense_amount || 0);

    // === ヘッダー情報 ===
    if (dataSheet) {
      // データシートがある場合はそちらに書き込み（数式で参照される）
      dataSheet.getRange('B2').setValue(customer.company_name || '');  // 請求先会社名
      dataSheet.getRange('B3').setValue(`${invoice.billing_year}年${invoice.billing_month}月分`);  // 作業年月
      dataSheet.getRange('B4').setValue(totalBeforeTax);  // P2-8: 税抜合計金額
      dataSheet.getRange('B5').setValue(invoice.shipper_name || '');  // 荷主名
      dataSheet.getRange('B6').setValue(company.company_name || '');  // 自社名
    } else {
      // データシートがない場合は直接書き込み
      sheet.getRange('A2').setValue(customer.company_name || '');
      sheet.getRange('C5').setValue(`${invoice.billing_year}年${invoice.billing_month}月分`);
      sheet.getRange('C6').setValue(invoice.shipper_name || '');
      sheet.getRange('H5').setValue(totalBeforeTax);  // P2-8: 税抜合計金額
      if (company.company_name) {
        sheet.getRange('E2').setValue(company.company_name);
      }
    }

    // === 明細行（A10から開始、視認性のため1行おき）===
    // テンプレート列構成: A=日付, B=案件名, C=(空), D=品目, E=(空), F=時間/備考, G=数量, H=単位, I=単価, J=金額
    const startRow = 10;
    const templateFormatRow = 10;
    const lastTemplateRow = sheet.getLastRow();

    // P2-8: 案件間の空行数を計算（同一案件内は連続、案件が変わる時に空行）
    let jobTransitions = 0;
    let prevJobIdForCount = null;
    for (const line of lines) {
      if (prevJobIdForCount !== null && line.job_id !== prevJobIdForCount) {
        jobTransitions++;
      }
      prevJobIdForCount = line.job_id;
    }
    const totalRowsNeeded = lines.length + jobTransitions;
    const lastNeededRow = startRow + totalRowsNeeded - 1;

    // テンプレートの行数が足りない場合、書式を一括拡張
    if (lastNeededRow > lastTemplateRow) {
      const rowsToExtend = lastNeededRow - lastTemplateRow + 1;
      this._batchExtendFormat(sheet, templateFormatRow, lastTemplateRow + 1, rowsToExtend, 10);
    }

    // P2-8: 明細データを2D配列として構築（バルク処理）
    // 案件間の空行と日付+現場の重複表示抑制を維持
    let prevDateSite = null;
    let prevJobId = null;
    const rowsData = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // P2-8: 案件が変わったら空行を挿入（同一案件内は連続配置）
      if (prevJobId !== null && line.job_id !== prevJobId) {
        // 空行を追加（10列分の空文字列）
        rowsData.push(['', '', '', '', '', '', '', '', '', '']);
      }
      prevJobId = line.job_id;

      // P2-8: 同じ日付+現場の続き行は日付・現場名を空にする
      const currentDateSite = `${line.work_date || ''}_${line.site_name || ''}`;
      const isFirstLineForDateSite = (currentDateSite !== prevDateSite);
      prevDateSite = currentDateSite;

      // 行データを構築（A〜J列、C・Eはスキップなので空文字）
      rowsData.push([
        isFirstLineForDateSite ? (line.work_date || '') : '',  // A: 日付
        isFirstLineForDateSite ? (line.site_name || '') : '',  // B: 案件名
        '',                                                     // C: スキップ
        line.item_name || '',                                   // D: 品目
        '',                                                     // E: スキップ
        this._formatTimeValue(line.time_note),                  // F: 時間/備考
        line.quantity || 0,                                     // G: 数量
        line.unit || '人',                                      // H: 単位
        line.unit_price || 0,                                   // I: 単価
        line.amount || 0                                        // J: 金額
      ]);
    }

    // 一括書き込み
    if (rowsData.length > 0) {
      sheet.getRange(startRow, 1, rowsData.length, 10).setValues(rowsData);
    }
    const currentRow = startRow + rowsData.length;

    // === 合計行を追加（税別小計 = 作業費 + 諸経費）===
    let totalRow;
    if (lines.length > 0) {
      const lastDataRow = currentRow - 1;  // 最後に書き込んだ行
      totalRow = lastDataRow + 2;  // 最終明細行の2行下に合計行
      sheet.getRange(totalRow, 9).setValue('合計');                // I: ラベル
      // P2-8: 合計は作業費(subtotal) + 諸経費(expense_amount)
      const totalBeforeTax = Number(invoice.subtotal || 0) + Number(invoice.expense_amount || 0);
      sheet.getRange(totalRow, 10).setValue(totalBeforeTax);       // J: 税別合計

      // 合計行の上下に罫線を追加
      sheet.getRange(totalRow, 1, 1, 10).setBorder(
        true, true, true, true, null, null,
        '#000000', SpreadsheetApp.BorderStyle.SOLID
      );
    } else {
      totalRow = startRow;
    }

    // === 余分な行を削除（テンプレートより明細が少ない場合）===
    const currentLastRow = sheet.getLastRow();
    if (currentLastRow > totalRow) {
      // 合計行の下の余分な行を削除
      const rowsToDelete = currentLastRow - totalRow;
      if (rowsToDelete > 0) {
        sheet.deleteRows(totalRow + 1, rowsToDelete);
      }
    }

    // === 合計行より下の罫線をクリア（書式拡張で残った縦罫線を除去）===
    const maxRows = sheet.getMaxRows();
    if (maxRows > totalRow) {
      const rowsBelow = maxRows - totalRow;
      sheet.getRange(totalRow + 1, 1, rowsBelow, 10).setBorder(
        false, false, false, false, false, false
      );
      // 合計行の下罫線を再設定（隣接セルの罫線クリアで消えた分を復元）
      sheet.getRange(totalRow, 1, 1, 10).setBorder(
        null, null, true, null, null, null,
        '#000000', SpreadsheetApp.BorderStyle.SOLID
      );
    }

    // データシートを非表示
    if (dataSheet) {
      dataSheet.hideSheet();
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
  _populateFormat2: function(sheet: GoogleAppsScript.Spreadsheet.Sheet, invoice: Record<string, unknown>, lines: Record<string, unknown>[], customer: Record<string, unknown>, company: Record<string, unknown>) {
    // データシートを取得（atamagamiと同じアーキテクチャ）
    const spreadsheet = sheet.getParent();
    const dataSheet = spreadsheet.getSheetByName('データ');

    if (!dataSheet) {
      throw new Error(`format2 template invalid: required sheet "データ" is missing (templateId=${spreadsheet!.getId()})`);
    }

    // P2-8: 合計金額は税抜（作業費 + 諸経費）
    const totalBeforeTax = Number(invoice.subtotal || 0) + Number(invoice.expense_amount || 0);

    // === ヘッダー情報をデータシートに書き込み ===
    // （売上シートは数式で自動参照）
    dataSheet.getRange('B2').setValue(customer.company_name || '');  // 請求先会社名
    dataSheet.getRange('B3').setValue(`${invoice.billing_year}年${invoice.billing_month}月分`);  // 作業年月
    dataSheet.getRange('B4').setValue(totalBeforeTax);  // P2-8: 税抜合計金額
    dataSheet.getRange('B5').setValue(invoice.shipper_name || '');  // 荷主名（format1と統一）
    dataSheet.getRange('B6').setValue(company.company_name || '');  // 自社名
    dataSheet.getRange('B7').setValue(company.postal_code ? '〒' + company.postal_code : '');  // 自社郵便番号
    dataSheet.getRange('B8').setValue(company.address || '');  // 自社住所

    // === 明細行を売上シートに直接書き込み ===
    // （A10から開始、同一案件内は連続・案件変更時に空行）
    const startRow = 10;
    const templateFormatRow = 10;  // 書式コピー元の行（テンプレートの最初のデータ行）
    const lastTemplateRow = sheet.getLastRow();  // テンプレートの最終行

    // P2-8: 案件間の空行数を計算（同一案件内は連続、案件が変わる時に空行）
    let jobTransitions = 0;
    let prevJobIdForCount = null;
    for (const line of lines) {
      if (prevJobIdForCount !== null && line.job_id !== prevJobIdForCount) {
        jobTransitions++;
      }
      prevJobIdForCount = line.job_id;
    }
    const totalRowsNeeded = lines.length + jobTransitions;
    const lastNeededRow = startRow + totalRowsNeeded - 1;

    // テンプレートの行数が足りない場合、書式を一括拡張（パフォーマンス最適化）
    if (lastNeededRow > lastTemplateRow) {
      const rowsToExtend = lastNeededRow - lastTemplateRow + 1;
      this._batchExtendFormat(sheet, templateFormatRow, lastTemplateRow + 1, rowsToExtend, 10);
    }

    // P2-8: 明細データを2D配列として構築（バルク処理）
    // 案件間の空行と日付+現場の重複表示抑制を維持
    let prevDateSite = null;
    let prevJobId = null;
    const rowsData = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // P2-8: 案件が変わったら空行を挿入（同一案件内は連続配置）
      if (prevJobId !== null && line.job_id !== prevJobId) {
        // 空行を追加（10列分の空文字列）
        rowsData.push(['', '', '', '', '', '', '', '', '', '']);
      }
      prevJobId = line.job_id;

      // P2-8: 同じ日付+現場の続き行は日付・現場名を空にする
      const currentDateSite = `${line.work_date || ''}_${line.site_name || ''}`;
      const isFirstLineForDateSite = (currentDateSite !== prevDateSite);
      prevDateSite = currentDateSite;

      // 行データを構築（A〜J列）
      rowsData.push([
        isFirstLineForDateSite ? (line.work_date || '') : '',  // A: 日付
        isFirstLineForDateSite ? (line.site_name || '') : '',  // B: 案件名
        line.order_number || '',                                // C: 発注No
        line.branch_office || '',                               // D: 営業所
        line.item_name || '',                                   // E: 品目
        this._formatTimeValue(line.time_note),                  // F: 時間/備考
        line.quantity || 0,                                     // G: 数量
        line.unit || '人',                                      // H: 単位
        line.unit_price || 0,                                   // I: 単価
        line.amount || 0                                        // J: 金額
      ]);
    }

    // 一括書き込み
    if (rowsData.length > 0) {
      sheet.getRange(startRow, 1, rowsData.length, 10).setValues(rowsData);
    }
    const currentRow = startRow + rowsData.length;

    // === 合計行を追加（税別小計 = 作業費 + 諸経費）===
    let totalRow;
    if (lines.length > 0) {
      const lastDataRow = currentRow - 1;  // 最後に書き込んだ行
      totalRow = lastDataRow + 2;  // 最終明細行の2行下に合計行
      sheet.getRange(totalRow, 9).setValue('合計');               // I: ラベル
      // P2-8: 合計は作業費(subtotal) + 諸経費(expense_amount)
      const totalBeforeTax = Number(invoice.subtotal || 0) + Number(invoice.expense_amount || 0);
      sheet.getRange(totalRow, 10).setValue(totalBeforeTax);      // J: 税別合計

      // 合計行の上下に罫線を追加
      sheet.getRange(totalRow, 1, 1, 10).setBorder(
        true, true, true, true, null, null,
        '#000000', SpreadsheetApp.BorderStyle.SOLID
      );
    } else {
      totalRow = startRow;
    }

    // === 余分な行を削除（テンプレートより明細が少ない場合）===
    const currentLastRow = sheet.getLastRow();
    if (currentLastRow > totalRow) {
      const rowsToDelete = currentLastRow - totalRow;
      if (rowsToDelete > 0) {
        sheet.deleteRows(totalRow + 1, rowsToDelete);
      }
    }

    // === 合計行より下の罫線をクリア（書式拡張で残った縦罫線を除去）===
    const maxRows = sheet.getMaxRows();
    if (maxRows > totalRow) {
      const rowsBelow = maxRows - totalRow;
      sheet.getRange(totalRow + 1, 1, rowsBelow, 10).setBorder(
        false, false, false, false, false, false
      );
      // 合計行の下罫線を再設定（隣接セルの罫線クリアで消えた分を復元）
      sheet.getRange(totalRow, 1, 1, 10).setBorder(
        null, null, true, null, null, null,
        '#000000', SpreadsheetApp.BorderStyle.SOLID
      );
    }

    // データシートを非表示（PDF/Excel出力時に見えないように）
    dataSheet.hideSheet();
  },

  /**
   * 様式3のデータを入力
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - シート
   * @param {Object} invoice - 請求書データ
   * @param {Object[]} lines - 明細データ
   * @param {Object} customer - 顧客データ
   * @param {Object} company - 自社データ
   */
  _populateFormat3: function(sheet: GoogleAppsScript.Spreadsheet.Sheet, invoice: Record<string, unknown>, lines: Record<string, unknown>[], customer: Record<string, unknown>, company: Record<string, unknown>) {
    // タイトル（B1に配置、顧客Bフォーマット準拠）
    sheet.getRange('B1').setValue(`${customer.company_name || ''} ${invoice.billing_year}年${invoice.billing_month}月 追加請求一覧`);

    if (lines.length === 0) return;

    // 明細行（A3から開始、9列構成：№, 担当工事課, 担当監督名, 物件コード, 現場名, 施工日, 内容, 金額（税抜）, 金額（税込）
    const startRow = 3;
    const taxRate = normalizeTaxRate_(customer.tax_rate);
    const taxRoundingMode = normalizeRoundingMode_(customer.tax_rounding_mode);

    // 明細データを2D配列として構築（バルク処理）
    const rowsData = lines.map((line, i) => {
      const taxIncluded = calculateTaxIncluded_(Number(line.amount || 0), taxRate, taxRoundingMode);
      return [
        i + 1,                          // A: № (連番)
        line.construction_div || '',    // B: 担当工事課
        line.supervisor_name || '',     // C: 担当監督名
        line.property_code || '',       // D: 物件コード
        line.site_name || '',           // E: 現場名
        line.work_date || '',           // F: 施工日
        line.item_name || '',           // G: 内容
        line.amount || 0,               // H: 金額（税抜）
        taxIncluded                     // I: 金額（税込）
      ];
    });

    // 一括書き込み
    sheet.getRange(startRow, 1, rowsData.length, 9).setValues(rowsData);
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
  _populateAtagami: function(sheet: GoogleAppsScript.Spreadsheet.Sheet, invoice: Record<string, unknown>, lines: Record<string, unknown>[], customer: Record<string, unknown>, company: Record<string, unknown>) {
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
      throw new Error(`atagami template invalid: required sheet "データ" or "頭紙データ" is missing (templateId=${spreadsheet!.getId()})`);
    }

    // === 顧客情報（原本シートに直接書き込み） ===
    if (customer.postal_code) {
      sheet.getRange('F2').setValue(customer.postal_code);
    }
    if (customer.address) {
      sheet.getRange('E3').setValue(customer.address);
    }

    // 顧客名＋担当者名（敬称は顧客設定に従う）
    let customerDisplay = customer.company_name || '';
    if (customer.contact_name) {
      const honorific = customer.honorific === 'なし' ? '' : (customer.honorific || '様');
      customerDisplay += `\u3000${customer.contact_name}${honorific ? '\u3000' + honorific : ''}`;
    }
    sheet.getRange('E5').setValue(customerDisplay);

    // === 動的フィールド ===
    // データシートに書き込み + 原本シートの値セルにも直接書き込み
    // （シートコピー時に数式の参照先シート名がずれる問題を回避）

    // 発行日
    if (invoice.issue_date) {
      const parts = String(invoice.issue_date).split('-');
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
      const dueParts = String(invoice.due_date).split('-');
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

    // === 行23: 作業費（固定） ===
    sheet.getRange('F23').setValue('作業費');
    sheet.getRange('AI23').setValue(invoice.subtotal || 0);

    // === 行24〜: 諸経費（あれば）→ 調整項目を動的配置 ===
    let currentRow = 24;
    const expenseAmount = Number(invoice.expense_amount || 0);
    if (expenseAmount > 0) {
      sheet.getRange('F' + currentRow).setValue('諸経費');
      sheet.getRange('AC' + currentRow).setValue(1);
      sheet.getRange('AF' + currentRow).setValue('式');
      sheet.getRange('AI' + currentRow).setValue(expenseAmount);
      currentRow++;
    }

    const adjustments = InvoiceAdjustmentRepository.findByInvoiceId(String(invoice.invoice_id));
    adjustments.forEach(function(adj, i) {
      if (i >= 5) return;
      sheet.getRange('F' + currentRow).setValue(adj.item_name);
      sheet.getRange('AC' + currentRow).setValue(1);
      sheet.getRange('AF' + currentRow).setValue('式');
      sheet.getRange('AI' + currentRow).setValue(adj.amount);
      currentRow++;
    });
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
  _batchCopyInterleavedRows: function(sourceSheet: GoogleAppsScript.Spreadsheet.Sheet, targetSheet: GoogleAppsScript.Spreadsheet.Sheet, sourceStartRow: number, targetStartRow: number, itemCount: number, columnsCount: number, includeFormat: boolean) {
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
  _batchSetRowHeights: function(sourceSheet: GoogleAppsScript.Spreadsheet.Sheet, targetSheet: GoogleAppsScript.Spreadsheet.Sheet, sourceStartRow: number, targetStartRow: number, rowCount: number) {
    if (rowCount === 0) return;

    // === 最適化版: 2行パターンの高さだけ取得（getRowHeight 2回のみ） ===
    // format1/format2 は「データ行 + 空行」の2行パターンの繰り返し
    const dataRowHeight = sourceSheet.getRowHeight(sourceStartRow);
    const emptyRowHeight = sourceSheet.getRowHeight(sourceStartRow + 1);

    Logger.log(`[TIMING] _batchSetRowHeights: dataRowHeight=${dataRowHeight}, emptyRowHeight=${emptyRowHeight}, rowCount=${rowCount}`);

    // パターンが同じなら全行一括設定（1回のsetRowHeightsで完了）
    if (dataRowHeight === emptyRowHeight) {
      targetSheet.setRowHeights(targetStartRow, rowCount, dataRowHeight);
      Logger.log(`[TIMING] _batchSetRowHeights: 同一高さ一括設定完了`);
      return;
    }

    // 異なる高さの場合: 平均値で全行一括設定（若干のずれを許容して高速化）
    // ※ 厳密なレイアウトが必要な場合は、コメントアウトして下の個別設定を使用
    const avgHeight = Math.round((dataRowHeight + emptyRowHeight) / 2);
    targetSheet.setRowHeights(targetStartRow, rowCount, avgHeight);
    Logger.log(`[TIMING] _batchSetRowHeights: 平均高さ(${avgHeight})で一括設定完了`);

    /*
    // === 厳密版（遅いが正確）: 異なる高さを個別設定 ===
    const pairCount = Math.floor(rowCount / 2);
    for (let i = 0; i < pairCount; i++) {
      const rowOffset = i * 2;
      targetSheet.setRowHeight(targetStartRow + rowOffset, dataRowHeight);
      targetSheet.setRowHeight(targetStartRow + rowOffset + 1, emptyRowHeight);
    }
    if (rowCount % 2 === 1) {
      targetSheet.setRowHeight(targetStartRow + rowCount - 1, dataRowHeight);
    }
    */
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
  _batchExtendFormat: function(sheet: GoogleAppsScript.Spreadsheet.Sheet, sourceRow: number, targetStartRow: number, targetRowCount: number, columnsCount: number) {
    if (targetRowCount <= 0) return;

    const sourceRange = sheet.getRange(sourceRow, 1, 2, columnsCount);

    // copyToはソース範囲のサイズ分しかコピーしないため、
    // 2行パターンを繰り返しコピーしてターゲット範囲全体に適用
    for (let i = 0; i < targetRowCount; i += 2) {
      const targetRow = targetStartRow + i;
      const rowsToCopy = Math.min(2, targetRowCount - i);
      const targetRange = sheet.getRange(targetRow, 1, rowsToCopy, columnsCount);
      sourceRange.copyTo(targetRange, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
    }

    // 内部の横罫線を削除（外枠の縦線は維持）
    const fullRange = sheet.getRange(targetStartRow, 1, targetRowCount, columnsCount);
    fullRange.setBorder(null, null, null, null, null, false);

    console.log(`書式を一括拡張: 行${targetStartRow} から ${targetRowCount}行`);
  },

  /**
   * FORMAT2用の印刷用シートを作成（単一シート統合版）
   * - 行1-8: ヘッダー情報
   * - 行9: 列ヘッダー（凍結 → 2ページ目以降で繰り返し）
   * - 行10以降: 明細データ
   * - 最終: 合計行
   * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} spreadsheet - スプレッドシート
   * @param {GoogleAppsScript.Spreadsheet.Sheet} dataSheet - データシート
   * @param {Array} lines - 明細行データ
   * @param {Object} invoice - 請求書データ（subtotal等を参照）
   */
  _createPrintSheetsForFormat2: function(spreadsheet: GoogleAppsScript.Spreadsheet.Spreadsheet, dataSheet: GoogleAppsScript.Spreadsheet.Sheet, lines: Record<string, unknown>[], invoice: Record<string, unknown>) {
    // === 2シート構成アプローチ（改良版） ===
    // 1. 表紙シート: 行1-9（ヘッダー全体）+ 1ページ目のデータ + (合計行:1ページに収まる場合)
    // 2. 明細シート: 行9（列ヘッダー）を凍結 + 残りのデータ + 合計行
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

    // 元シートの合計行位置を計算
    const lastDataRowInSource = dataStartRow + ((lines.length - 1) * 2);
    const totalRowInSource = lastDataRowInSource + 2;

    console.log(`表紙データ行: ${coverDataRows}, 明細データ行: ${detailDataRows}`);
    console.log(`元シート合計行: ${totalRowInSource}`);

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
      const detailLastDataRow = 1 + detailDataRows * 2;

      // 合計行を明細シートの最後に追加
      const targetTotalRow = detailLastDataRow + 1;  // 最終データ行の直下
      const totalRange = dataSheet.getRange(totalRowInSource, 1, 1, 10);
      totalRange.copyTo(detailSheet.getRange(targetTotalRow, 1), SpreadsheetApp.CopyPasteType.PASTE_VALUES, false);
      totalRange.copyTo(detailSheet.getRange(targetTotalRow, 1), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
      detailSheet.setRowHeight(targetTotalRow, dataSheet.getRowHeight(totalRowInSource));

      console.log(`明細シート作成完了（バッチ処理）: ${targetTotalRow}行（合計行含む）`);
    } else {
      // データが1ページに収まる場合は表紙に合計行を追加
      const targetTotalRow = coverLastRow + 1;  // 最終データ行の直下
      const totalRange = dataSheet.getRange(totalRowInSource, 1, 1, 10);
      totalRange.copyTo(coverSheet.getRange(targetTotalRow, 1), SpreadsheetApp.CopyPasteType.PASTE_VALUES, false);
      totalRange.copyTo(coverSheet.getRange(targetTotalRow, 1), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
      coverSheet.setRowHeight(targetTotalRow, dataSheet.getRowHeight(totalRowInSource));

      console.log(`明細シート不要（1ページで収まる、合計行含む）`);
    }

    // データシートを非表示
    dataSheet.hideSheet();

    console.log(`2シート構成完了`);
  },

  /**
   * FORMAT1用の印刷用シートを作成（2シート構成）
   * - 行1-9: ヘッダー情報
   * - 行9: 列ヘッダー（凍結 → 2ページ目以降で繰り返し）
   * - 行10以降: 明細データ（1行おき）
   * - 最終: 合計行
   * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} spreadsheet - スプレッドシート
   * @param {GoogleAppsScript.Spreadsheet.Sheet} dataSheet - データシート
   * @param {Array} lines - 明細行データ
   * @param {Object} invoice - 請求書データ（subtotal等を参照）
   */
  _createPrintSheetsForFormat1: function(spreadsheet: GoogleAppsScript.Spreadsheet.Spreadsheet, dataSheet: GoogleAppsScript.Spreadsheet.Sheet, lines: Record<string, unknown>[], invoice: Record<string, unknown>) {
    console.log(`=== FORMAT1 2シート構成 ===`);
    console.log(`明細行数: ${lines.length}`);

    const FIRST_PAGE_DATA_ROWS = 27;  // 1ページ目に入るデータ行数
    const dataStartRow = 10;

    const coverDataRows = Math.min(FIRST_PAGE_DATA_ROWS, lines.length);
    const detailDataRows = lines.length - coverDataRows;

    // 元シートの合計行位置
    const lastDataRowInSource = dataStartRow + ((lines.length - 1) * 2);
    const totalRowInSource = lastDataRowInSource + 2;

    console.log(`表紙データ行: ${coverDataRows}, 明細データ行: ${detailDataRows}`);
    console.log(`元シート合計行: ${totalRowInSource}`);

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

    // 表紙にデータ行をバッチコピー
    if (coverDataRows > 0) {
      this._batchCopyInterleavedRows(dataSheet, coverSheet, dataStartRow, 10, coverDataRows, 10, true);
    }
    const coverLastRow = 9 + coverDataRows * 2;

    console.log(`表紙シート作成完了（バッチ処理）: ${coverLastRow}行`);

    // === 2. 明細シートを作成（残りデータがある場合のみ）===
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

      // 残りのデータ行をバッチコピー
      const detailSourceStart = dataStartRow + coverDataRows * 2;
      this._batchCopyInterleavedRows(dataSheet, detailSheet, detailSourceStart, 2, detailDataRows, 10, true);
      const detailLastDataRow = 1 + detailDataRows * 2;

      // 合計行を明細シートの最後に追加
      const targetTotalRow = detailLastDataRow + 1;  // 最終データ行の直下
      const totalRange = dataSheet.getRange(totalRowInSource, 1, 1, 10);
      totalRange.copyTo(detailSheet.getRange(targetTotalRow, 1), SpreadsheetApp.CopyPasteType.PASTE_VALUES, false);
      totalRange.copyTo(detailSheet.getRange(targetTotalRow, 1), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
      detailSheet.setRowHeight(targetTotalRow, dataSheet.getRowHeight(totalRowInSource));

      console.log(`明細シート作成完了: ${targetTotalRow}行（合計行含む）`);
    } else {
      // データが1ページに収まる場合は表紙に合計行を追加
      const targetTotalRow = coverLastRow + 1;  // 最終データ行の直下
      const totalRange = dataSheet.getRange(totalRowInSource, 1, 1, 10);
      totalRange.copyTo(coverSheet.getRange(targetTotalRow, 1), SpreadsheetApp.CopyPasteType.PASTE_VALUES, false);
      totalRange.copyTo(coverSheet.getRange(targetTotalRow, 1), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
      coverSheet.setRowHeight(targetTotalRow, dataSheet.getRowHeight(totalRowInSource));

      console.log(`表紙シート作成完了: ${targetTotalRow}行（合計行含む）`);
    }

    // データシートを非表示
    dataSheet.hideSheet();

    console.log(`FORMAT1 2シート構成完了`);
  },

  /**
   * シートをPDFに変換
   * @param {string} spreadsheetId - スプレッドシートID
   * @param {number} sheetId - シートID
   * @param {Object} options - オプション
   * @param {boolean} options.landscape - 横向き印刷（デフォルト: false）
   * @returns {GoogleAppsScript.Base.Blob} PDFブロブ
   */
  _exportSheetToPdf: function(spreadsheetId: string, sheetId: string | number, options: Record<string, unknown> = {}) {
    const isLandscape = options.landscape === true;
    const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?` +
      `format=pdf` +
      `&gid=${sheetId}` +
      `&portrait=${!isLandscape}` +
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
   * @param {Object} options - オプション
   * @param {boolean} options.landscape - 横向き印刷（デフォルト: false）
   * @returns {GoogleAppsScript.Base.Blob} PDFブロブ
   */
  _exportSpreadsheetToPdf: function(spreadsheetId: string, options: Record<string, unknown> = {}) {
    const isLandscape = options.landscape === true;
    // gidパラメータを省略して全シートを出力
    // fitw=trueで幅を1ページに収め、fzr=trueで凍結行繰り返し
    // horizontal_alignment=CENTERで水平方向中央揃え
    const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?` +
      `format=pdf` +
      `&portrait=${!isLandscape}` +
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
  _exportSpreadsheetToXlsx: function(spreadsheetId: string) {
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
  _getOutputFolder: function(customer: Record<string, unknown>) {
    // 顧客専用フォルダがあればその配下の「請求書」フォルダを使用
    if (customer && customer.folder_id) {
      try {
        const invoiceFolder = CustomerFolderService.getInvoiceFolder(customer);
        if (invoiceFolder) {
          return invoiceFolder;
        }
      } catch (e: unknown) {
        Logger.log(`顧客フォルダ取得エラー: ${((e instanceof Error) ? e.message : String(e))}`);
      }
    }

    // folder_id 未設定の場合、自動作成を試みる
    if (customer && customer.customer_id && !customer.folder_id) {
      try {
        const folderResult = CustomerFolderService.createCustomerFolder(customer);
        if (folderResult.folderId) {
          CustomerFolderService._updateCustomerFolderId(
            String(customer.customer_id),
            folderResult.folderId
          );
          Logger.log(`請求書出力時に顧客フォルダを自動作成: ${customer.company_name}`);
          // 請求書サブフォルダを返す
          return DriveApp.getFolderById(folderResult.invoiceFolderId);
        }
      } catch (e: unknown) {
        Logger.log(`フォルダ自動作成に失敗: ${((e instanceof Error) ? e.message : String(e))}`);
      }
    }

    // デフォルトの出力先フォルダ（ScriptPropertiesから取得）
    const props = PropertiesService.getScriptProperties();
    const folderId = props.getProperty(this.INVOICE_EXPORT_FOLDER_KEY);

    if (folderId) {
      try {
        return DriveApp.getFolderById(folderId);
      } catch (e: unknown) {
        throw new Error(
          `請求書エクスポートフォルダにアクセスできません（ID: ${folderId}）。\n` +
          `フォルダが削除されたか、アクセス権限がない可能性があります。`
        );
      }
    }

    throw new Error(
      `INVOICE_EXPORT_FOLDER_ID が未設定です。\n` +
      `GASエディタで setInvoiceExportFolderId() を実行してください。`
    );
  },

  /**
   * エクスポートフォルダの設定状況を確認
   * @returns {Object} { configured: boolean, folderId: string, url: string }
   */
  getExportFolderStatus: function() {
    const props = PropertiesService.getScriptProperties();
    const folderId = props.getProperty(this.INVOICE_EXPORT_FOLDER_KEY);

    if (!folderId) {
      return {
        configured: false,
        setupGuide: 'GASエディタで setInvoiceExportFolderId() を実行してください。'
      };
    }

    try {
      const folder = DriveApp.getFolderById(folderId);
      return {
        configured: true,
        folderId: folderId,
        folderName: folder.getName(),
        url: `https://drive.google.com/drive/folders/${folderId}`
      };
    } catch (e: unknown) {
      return {
        configured: false,
        folderId: folderId,
        error: 'フォルダにアクセスできません',
        setupGuide: 'setInvoiceExportFolderId() を再実行してフォルダIDを更新してください。'
      };
    }
  },

  /**
   * ファイル名を生成
   * @param {Object} invoice - 請求書データ
   * @param {Object} customer - 顧客データ
   * @param {string} type - ファイルタイプ（pdf/xlsx/sheet）
   * @param {Object} options - オプション（addTimestamp: true で日付を追加）
   * @returns {string} ファイル名
   */
  _generateFileName: function(invoice: Record<string, unknown>, customer: Record<string, unknown>, type: string, options: Record<string, unknown> = {}) {
    const customerName = String(customer.company_name || '不明').replace(/[/\\?%*:|"<>]/g, '_');
    const period = `${invoice.billing_year}年${String(invoice.billing_month).padStart(2, '0')}月`;

    const extension = type === 'sheet' ? '' : `.${type}`;

    // プレフィックス（頭紙のみ/頭紙付き/通常で区別）
    let prefix;
    if (type === 'sheet') {
      prefix = '【編集用】';
    } else if (options.coverOnly) {
      prefix = '【頭紙】';
    } else if (options.withCover) {
      prefix = '【請求書・頭紙付】';
    } else {
      prefix = '【請求書】';
    }

    // タイムスタンプを追加（別名保存時）
    const timestamp = options.addTimestamp
      ? '_' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd')
      : '';

    return `${prefix}${customerName}_${period}_${invoice.invoice_number}${timestamp}${extension}`;
  },

  /**
   * 時間値を文字列に変換（Date型対応）
   * Google SheetsからのDate型を "HH:mm" 形式の文字列に変換
   * @param {Date|string|number|null} value - 時間値
   * @returns {string} 時間文字列または空文字
   */
  _formatTimeValue: function(value: unknown) {
    if (!value) return '';

    // 既に文字列の場合はそのまま返す
    if (typeof value === 'string') {
      return value;
    }

    // Date型の場合は時間部分を抽出
    if (value instanceof Date) {
      try {
        // 1899-1900年のDateは時間のみを表すSheets内部形式
        const year = value.getFullYear();
        if (year < 1910) {
          const hours = value.getHours();
          const minutes = value.getMinutes();
          if (hours === 0 && minutes === 0) {
            return '';  // 00:00は空とみなす
          }
          return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
        }
        return Utilities.formatDate(value, 'Asia/Tokyo', 'HH:mm');
      } catch (e: unknown) {
        return '';
      }
    }

    // 数値の場合は文字列に変換
    if (typeof value === 'number') {
      return String(value);
    }

    return '';
  },

  /**
   * 日付をフォーマット
   * @param {string} dateStr - 日付文字列（YYYY-MM-DD）
   * @returns {string} フォーマット済み日付（令和X年X月X日）
   */
  _formatDate: function(dateStr: string) {
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
 * 請求書エクスポートフォルダを設定（GASエディタから一度だけ実行）
 * gas-dispatch-system > 出力 > 請求書
 * https://drive.google.com/drive/folders/1yfVVTmRpeizoM9AR1_zgbcLriCZxGCj5
 */
function setInvoiceExportFolderId() {
  const folderId = '1yfVVTmRpeizoM9AR1_zgbcLriCZxGCj5';
  PropertiesService.getScriptProperties().setProperty('INVOICE_EXPORT_FOLDER_ID', folderId);
  Logger.log('Invoice export folder set to: ' + folderId);
  Logger.log('URL: https://drive.google.com/drive/folders/' + folderId);
}
