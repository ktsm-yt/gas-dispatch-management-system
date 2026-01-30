/**
 * 請求書一括出力サービス
 *
 * GASの6分制限を回避するため、ArchiveServiceと同じバックエンド完全制御型パターンを採用。
 * - UserProperties で進捗を永続化（ユーザーごとに独立、競合を防ぐ）
 * - LockService で排他制御
 * - 5分経過で安全に中断し、UIからの再呼び出しで継続
 *
 * 【設計上の注意】
 * - UserPropertiesの9KB制限を考慮し、進捗データは軽量に保つ
 * - results/errorsは完了時のみ構築、保存時はカウントのみ
 *
 * 【高速化対応】
 * - 対象請求書・明細・顧客を一括事前ロード（シートI/O削減）
 * - 会社マスタをMasterCache経由でキャッシュ
 * - exportWithData()で二重読み込みを解消
 */
const InvoiceBulkExportService = {
  /** 5分タイムアウト（余裕を持って6分制限前に中断） */
  TIMEOUT_MS: 300000,

  /** 出力モード定義 */
  MODES: {
    pdf: { mode: 'pdf', options: { includeCoverPage: false } },
    pdf_cover: { mode: 'pdf', options: { includeCoverPage: true } },
    excel: { mode: 'excel', options: { includeCoverPage: false } }
  },

  /** PropertiesServiceのキープレフィックス */
  PROGRESS_KEY_PREFIX: 'BULK_EXPORT_PROGRESS_',

  /**
   * 一括出力を実行
   * @param {Object} params - { invoiceIds: string[], exportMode: 'pdf'|'pdf_cover'|'excel', enableUrlSharing?: boolean }
   * @returns {Object} 実行結果
   */
  executeBulkExport: function(params) {
    // ユーザーロックを使用（ユーザーごとに独立）
    const lock = LockService.getUserLock();
    let lockAcquired = false;

    try {
      // 排他制御を取得（3秒待機）
      if (!lock.tryLock(3000)) {
        return {
          success: false,
          error: 'ALREADY_RUNNING',
          message: '別の一括出力が実行中です。しばらく待ってから再度お試しください。'
        };
      }
      lockAcquired = true;

      const exportKey = this._generateKey(params);
      let progress = this.getProgress(exportKey);
      const startTime = Date.now();

      // 初回実行時は対象請求書をセット
      if (!progress.invoiceIds || progress.invoiceIds.length === 0) {
        progress = {
          invoiceIds: params.invoiceIds,
          exportMode: params.exportMode,
          totalCount: params.invoiceIds.length,
          processedCount: 0,
          successCount: 0,
          errorCount: 0,
          errorMessages: [],  // 軽量化: エラーのinvoiceIdとメッセージのみ
          startedAt: new Date().toISOString(),
          currentInvoiceNumber: ''  // インジケーター用：現在処理中の請求書番号
        };
      }

      // 実行中に構築する結果配列（保存はしない）
      const results = [];
      const errors = [];

      Logger.log(`[BulkExport] 開始: ${progress.processedCount}/${progress.totalCount} 件処理済み`);

      // ============================
      // 高速化: 一括事前ロード
      // ============================
      const preloadStart = Date.now();
      const preloadedData = this._preloadInvoiceData(progress.invoiceIds, progress.processedCount);
      Logger.log(`[BulkExport] 事前ロード完了: ${Object.keys(preloadedData.invoiceMap).length}件, ${Date.now() - preloadStart}ms`);

      // 会社情報を1回だけ取得（日本語ヘッダーマッピング対応）
      const company = InvoiceExportService._getCompanyInfo();

      // バッチ処理（1件ずつ処理）
      while (progress.processedCount < progress.totalCount) {
        // 5分経過チェック
        const elapsed = Date.now() - startTime;
        if (elapsed > this.TIMEOUT_MS) {
          // タイムアウト前にURL共有の権限設定をバッチ適用
          if (params.enableUrlSharing && results.length > 0) {
            this._applyUrlSharingBatch(results);
          }
          this.saveProgress(exportKey, progress);
          Logger.log(`[BulkExport] タイムアウト: ${progress.processedCount}/${progress.totalCount} 件完了, ${results.length}件の部分結果を返却`);
          return {
            success: false,
            error: 'TIMEOUT_WILL_CONTINUE',
            progress: this._getSummary(progress),
            partialResults: results,  // 今回のバッチで処理した結果を返す
            partialErrors: errors
          };
        }

        // 1件処理
        const invoiceId = progress.invoiceIds[progress.processedCount];
        const exportResult = this._exportOneWithPreload(invoiceId, progress, params, preloadedData, company);

        // 結果を記録（メモリ上のみ）
        if (exportResult.success) {
          results.push(exportResult.result);
          progress.successCount++;
        } else {
          errors.push(exportResult.error);
          progress.errorCount++;
          // 軽量化: 直近のエラーのみ保存（最大20件）
          if (progress.errorMessages.length < 20) {
            progress.errorMessages.push({
              invoiceId: exportResult.error.invoiceId,
              message: exportResult.error.message
            });
          }
        }

        progress.processedCount++;

        // 10件ごとに進捗を保存（クラッシュ対策）
        if (progress.processedCount % 10 === 0) {
          this.saveProgress(exportKey, progress);
        }
      }

      // 完了 - URL共有が有効な場合、まとめて権限設定（Drive API v3）
      if (params.enableUrlSharing) {
        this._applyUrlSharingBatch(results);
      }

      this.clearProgress(exportKey);
      Logger.log(`[BulkExport] 完了: ${results.length} 件成功, ${errors.length} 件エラー`);

      return {
        success: true,
        results: results,
        errors: errors,
        summary: this._getSummary(progress)
      };

    } catch (error) {
      Logger.log(`[BulkExport] エラー: ${error.message}`);
      return {
        success: false,
        error: 'SYSTEM_ERROR',
        message: error.message
      };
    } finally {
      // ロックが取得できた場合のみ解放
      if (lockAcquired) {
        lock.releaseLock();
      }
    }
  },

  /**
   * 請求書データを一括事前ロード
   * T_Invoices, T_InvoiceLines, M_Customers を1回ずつ読み込み、
   * invoiceId → データ のマップを作成
   *
   * @private
   * @param {string[]} invoiceIds - 全対象請求書ID
   * @param {number} processedCount - 既に処理済みの件数（再開時用）
   * @returns {Object} { invoiceMap, customerMap }
   */
  _preloadInvoiceData: function(invoiceIds, processedCount) {
    // 未処理の請求書IDのみ対象
    const targetIds = invoiceIds.slice(processedCount);
    // 型の正規化（スプレッドシートから読み込む値との比較で型ずれを防ぐ）
    const targetIdSet = new Set(targetIds.map(id => String(id)));

    // 請求書データを取得（対象IDのみフィルタ）
    // search({}) で全件取得し、対象IDでフィルタ
    const allInvoices = InvoiceRepository.search({});
    const targetInvoices = allInvoices.filter(inv => targetIdSet.has(String(inv.invoice_id)));

    // 顧客IDを収集
    const customerIds = new Set(targetInvoices.map(inv => inv.customer_id));

    // 顧客データをMasterCache経由で取得（キャッシュ済み）
    const allCustomers = MasterCache.getCustomers();
    const customerMap = {};
    for (const customer of allCustomers) {
      if (customerIds.has(customer.customer_id)) {
        customerMap[customer.customer_id] = customer;
      }
    }

    // 明細データをチャンク読み込み（メモリ効率化: 全件読み込みを回避）
    const linesByInvoiceId = this._loadLinesInChunks(targetIdSet);

    // 各明細をline_number順にソート
    for (const invoiceId of Object.keys(linesByInvoiceId)) {
      linesByInvoiceId[invoiceId].sort((a, b) => (a.line_number || 0) - (b.line_number || 0));
    }

    // invoiceId → { ...invoice, lines, customer } のマップを作成
    const invoiceMap = {};
    for (const invoice of targetInvoices) {
      const customer = customerMap[invoice.customer_id] || {};
      invoiceMap[invoice.invoice_id] = {
        ...invoice,
        lines: linesByInvoiceId[invoice.invoice_id] || [],
        customer: customer
      };
    }

    return { invoiceMap, customerMap };
  },

  /**
   * 明細レコードを正規化（InvoiceLineRepositoryと同じ処理）
   * @private
   */
  _normalizeLineRecord: function(record) {
    return {
      ...record,
      work_date: this._normalizeDate(record.work_date),
      line_number: Number(record.line_number) || 0,
      quantity: Number(record.quantity) || 0,
      unit_price: Number(record.unit_price) || 0,
      amount: Number(record.amount) || 0,
      tax_amount: Number(record.tax_amount) || 0
    };
  },

  /**
   * 日付を正規化
   * @private
   */
  _normalizeDate: function(dateValue) {
    if (!dateValue) return '';
    if (dateValue instanceof Date) {
      return Utilities.formatDate(dateValue, 'Asia/Tokyo', 'yyyy-MM-dd');
    }
    return String(dateValue).replace(/\//g, '-');
  },

  /**
   * 明細データをチャンク読み込み（メモリ効率化）
   * 全件読み込みを回避し、CHUNK_SIZE行ずつ読み込んでフィルタリング
   *
   * @private
   * @param {Set<string>} targetIdSet - 対象請求書IDのSet
   * @returns {Object} invoice_id -> lines[] のマップ
   */
  _loadLinesInChunks: function(targetIdSet) {
    const CHUNK_SIZE = 3000;  // GAS制約を考慮した適切なチャンクサイズ
    const config = TABLE_CONFIG.T_InvoiceLines;
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(config.sheetName);

    if (!sheet) {
      Logger.log('[BulkExport] T_InvoiceLines シートが見つかりません');
      return {};
    }

    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();

    // データがない場合
    if (lastRow < 2) {
      return {};
    }

    // ヘッダーを取得
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    const invoiceIdColIdx = headers.indexOf('invoice_id');
    const isDeletedColIdx = headers.indexOf('is_deleted');

    if (invoiceIdColIdx < 0) {
      Logger.log('[BulkExport] invoice_id カラムが見つかりません');
      return {};
    }

    const linesByInvoiceId = {};
    let processedRows = 0;

    // チャンク単位で読み込み
    for (let startRow = 2; startRow <= lastRow; startRow += CHUNK_SIZE) {
      const numRows = Math.min(CHUNK_SIZE, lastRow - startRow + 1);
      const chunkData = sheet.getRange(startRow, 1, numRows, lastCol).getValues();

      // チャンク内をフィルタリング
      for (const row of chunkData) {
        // is_deleted チェック（様々な形式に対応）
        const isDeleted = isDeletedColIdx >= 0 ? row[isDeletedColIdx] : false;
        if (isDeleted === true || isDeleted === 'TRUE' || isDeleted === 1 || isDeleted === '1') {
          continue;
        }

        // invoice_id チェック（型の正規化）
        const invoiceId = String(row[invoiceIdColIdx] || '');
        if (!invoiceId || !targetIdSet.has(invoiceId)) {
          continue;
        }

        // 行データをオブジェクトに変換
        const line = {};
        for (let i = 0; i < headers.length; i++) {
          line[headers[i]] = row[i];
        }

        // 明細を収集
        if (!linesByInvoiceId[invoiceId]) {
          linesByInvoiceId[invoiceId] = [];
        }
        linesByInvoiceId[invoiceId].push(this._normalizeLineRecord(line));
      }

      processedRows += numRows;
    }

    // 各明細をline_number順にソート
    for (const invoiceId of Object.keys(linesByInvoiceId)) {
      linesByInvoiceId[invoiceId].sort((a, b) => (a.line_number || 0) - (b.line_number || 0));
    }

    Logger.log(`[BulkExport] 明細チャンク読み込み完了: ${processedRows}行スキャン, ${Object.keys(linesByInvoiceId).length}件の請求書分を抽出`);

    return linesByInvoiceId;
  },

  /**
   * 1件の請求書を出力（事前ロード済みデータを使用）
   * @private
   * @param {string} invoiceId - 請求書ID
   * @param {Object} progress - 進捗オブジェクト（exportModeを参照）
   * @param {Object} params - 元のパラメータ（enableUrlSharing等を参照）
   * @param {Object} preloadedData - 事前ロード済みデータ { invoiceMap }
   * @param {Object} company - 会社情報
   * @returns {Object} { success: boolean, result?: {...}, error?: {...} }
   */
  _exportOneWithPreload: function(invoiceId, progress, params, preloadedData, company) {
    const modeConfig = this.MODES[progress.exportMode];
    if (!modeConfig) {
      return {
        success: false,
        error: {
          invoiceId,
          error: 'INVALID_MODE',
          message: `無効な出力モード: ${progress.exportMode}`
        }
      };
    }

    const exportOptions = Object.assign(
      { action: 'overwrite', company: company },
      modeConfig.options
    );

    try {
      // 事前ロード済みデータを使用
      const invoiceData = preloadedData.invoiceMap[invoiceId];
      if (!invoiceData) {
        return {
          success: false,
          error: {
            invoiceId,
            error: 'NOT_FOUND',
            message: '請求書が見つかりません（事前ロードデータに存在しません）'
          }
        };
      }

      // インジケーター用: 現在処理中の請求書番号を更新
      progress.currentInvoiceNumber = invoiceData.invoice_number || '';

      // exportWithData を使用（InvoiceService.get() をスキップ）
      const result = InvoiceExportService.exportWithData(invoiceData, modeConfig.mode, exportOptions);

      if (result.success) {
        // 顧客情報を抽出
        const customer = invoiceData.customer || {};

        // 注意: URL共有の権限設定は後でバッチ処理（_applyUrlSharingBatch）で行う
        // ここでは fileId を記録するだけ
        const needsSharing = params.enableUrlSharing && result.fileId;

        return {
          success: true,
          result: {
            invoiceId,
            url: result.url,
            fileId: result.fileId,
            // pdfUrl は権限設定後に確定（暫定でDrive URLを設定）
            pdfUrl: needsSharing
              ? `https://drive.google.com/file/d/${result.fileId}/view`
              : result.url,
            // CSV出力用の追加情報
            companyName: customer.company_name || '',
            contactName: customer.contact_name || '',
            honorific: customer.honorific || '',
            email: customer.email || '',
            invoiceNumber: invoiceData.invoice_number,
            totalAmount: invoiceData.total_amount,
            needsSharing: needsSharing,  // 後で権限設定が必要かどうか
            sharingError: null,
            status: 'pending_sharing'
          }
        };
      } else {
        return {
          success: false,
          error: {
            invoiceId,
            error: result.error,
            message: result.message || result.error
          }
        };
      }
    } catch (e) {
      return {
        success: false,
        error: {
          invoiceId,
          error: 'EXPORT_ERROR',
          message: e.message
        }
      };
    }
  },

  /**
   * 1件の請求書を出力（後方互換用 - 非一括出力時）
   * @private
   * @param {string} invoiceId - 請求書ID
   * @param {Object} progress - 進捗オブジェクト（exportModeを参照）
   * @param {Object} params - 元のパラメータ（enableUrlSharing等を参照）
   * @returns {Object} { success: boolean, result?: {...}, error?: {...} }
   */
  _exportOne: function(invoiceId, progress, params) {
    const modeConfig = this.MODES[progress.exportMode];
    if (!modeConfig) {
      return {
        success: false,
        error: {
          invoiceId,
          error: 'INVALID_MODE',
          message: `無効な出力モード: ${progress.exportMode}`
        }
      };
    }

    const exportOptions = Object.assign({ action: 'overwrite' }, modeConfig.options);

    try {
      // 請求書データを取得（顧客情報を含む）
      const invoiceData = InvoiceService.get(invoiceId);
      if (!invoiceData) {
        return {
          success: false,
          error: {
            invoiceId,
            error: 'NOT_FOUND',
            message: '請求書が見つかりません'
          }
        };
      }

      const result = InvoiceExportService.export(invoiceId, modeConfig.mode, exportOptions);

      if (result.success) {
        // 顧客情報を抽出
        const customer = invoiceData.customer || {};

        // 注意: URL共有の権限設定は後でバッチ処理（_applyUrlSharingBatch）で行う
        const needsSharing = params.enableUrlSharing && result.fileId;

        return {
          success: true,
          result: {
            invoiceId,
            url: result.url,
            fileId: result.fileId,
            pdfUrl: needsSharing
              ? `https://drive.google.com/file/d/${result.fileId}/view`
              : result.url,
            // CSV出力用の追加情報
            companyName: customer.company_name || '',
            contactName: customer.contact_name || '',
            honorific: customer.honorific || '',
            email: customer.email || '',
            invoiceNumber: invoiceData.invoice_number,
            totalAmount: invoiceData.total_amount,
            needsSharing: needsSharing,
            sharingError: null,
            status: 'pending_sharing'
          }
        };
      } else {
        return {
          success: false,
          error: {
            invoiceId,
            error: result.error,
            message: result.message || result.error
          }
        };
      }
    } catch (e) {
      return {
        success: false,
        error: {
          invoiceId,
          error: 'EXPORT_ERROR',
          message: e.message
        }
      };
    }
  },

  /**
   * 進捗サマリを取得
   * @private
   */
  _getSummary: function(progress) {
    return {
      totalCount: progress.totalCount,
      processedCount: progress.processedCount,
      successCount: progress.successCount || 0,
      errorCount: progress.errorCount || 0,
      exportMode: progress.exportMode,
      startedAt: progress.startedAt,
      lastUpdate: new Date().toISOString(),
      currentInvoiceNumber: progress.currentInvoiceNumber || ''  // インジケーター用
    };
  },

  /**
   * URL共有の権限設定をバッチで適用（Drive API v3使用）
   * DriveApp.setSharing() より高速
   * @private
   * @param {Array} results - 出力結果の配列（needsSharing=trueのものを処理）
   */
  _applyUrlSharingBatch: function(results) {
    const startTime = Date.now();
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (!result.needsSharing || !result.fileId) {
        continue;
      }

      try {
        // Drive API v3 で権限を追加（DriveApp.setSharing より高速）
        // supportsAllDrives: true で共有ドライブのファイルにも対応
        Drive.Permissions.create(
          {
            role: 'reader',
            type: 'anyone'
          },
          result.fileId,
          {
            sendNotificationEmail: false,
            supportsAllDrives: true
          }
        );
        result.status = 'success';
        result.sharingError = null;
        successCount++;
      } catch (e) {
        // Workspaceポリシーで禁止されている場合など
        result.sharingError = e.message;
        result.status = 'sharing_failed';
        result.pdfUrl = result.url;  // フォールバック
        errorCount++;
        Logger.log(`[BulkExport] 共有設定失敗 (${result.invoiceNumber}): ${e.message}`);
      }
    }

    const elapsed = Date.now() - startTime;
    Logger.log(`[BulkExport] URL共有バッチ完了: ${successCount}件成功, ${errorCount}件失敗, ${elapsed}ms`);
  },

  /**
   * 進捗を取得
   * UserPropertiesを使用（ユーザーごとに独立、競合を防ぐ）
   * @param {string} key - 進捗キー
   * @returns {Object} 進捗データ
   */
  getProgress: function(key) {
    const props = PropertiesService.getUserProperties();
    const progressJson = props.getProperty(this.PROGRESS_KEY_PREFIX + key);

    if (progressJson) {
      try {
        return JSON.parse(progressJson);
      } catch (e) {
        Logger.log(`[BulkExport] 進捗データのパースエラー: ${e.message}`);
      }
    }

    return {
      invoiceIds: [],
      exportMode: null,
      totalCount: 0,
      processedCount: 0,
      successCount: 0,
      errorCount: 0,
      errorMessages: [],
      currentInvoiceNumber: ''
    };
  },

  /**
   * 進捗を保存
   * UserPropertiesを使用（軽量化: URLは保存しない）
   * @param {string} key - 進捗キー
   * @param {Object} progress - 進捗データ
   */
  saveProgress: function(key, progress) {
    const props = PropertiesService.getUserProperties();
    // 軽量化: 保存に必要な最小限のデータのみ
    const saveData = {
      invoiceIds: progress.invoiceIds,
      exportMode: progress.exportMode,
      totalCount: progress.totalCount,
      processedCount: progress.processedCount,
      successCount: progress.successCount,
      errorCount: progress.errorCount,
      errorMessages: progress.errorMessages,  // 最大20件に制限済み
      startedAt: progress.startedAt,
      lastUpdate: new Date().toISOString(),
      currentInvoiceNumber: progress.currentInvoiceNumber || ''
    };
    props.setProperty(this.PROGRESS_KEY_PREFIX + key, JSON.stringify(saveData));
  },

  /**
   * 進捗をクリア
   * @param {string} key - 進捗キー
   */
  clearProgress: function(key) {
    const props = PropertiesService.getUserProperties();
    props.deleteProperty(this.PROGRESS_KEY_PREFIX + key);
  },

  /**
   * 進捗キーを生成
   * @param {Object} params - パラメータ
   * @returns {string} 進捗キー
   */
  _generateKey: function(params) {
    // invoiceIdsのハッシュを使用（同じ請求書セットなら同じキー）
    const idsHash = params.invoiceIds.sort().join(',').substring(0, 100);
    return `${params.exportMode}_${Utilities.computeDigest(
      Utilities.DigestAlgorithm.MD5,
      idsHash
    ).map(b => (b < 0 ? b + 256 : b).toString(16).padStart(2, '0')).join('').substring(0, 8)}`;
  },

  /**
   * 進捗を取得（APIから呼び出し用）
   * @param {Object} params - { invoiceIds: string[], exportMode: string }
   * @returns {Object} 進捗データ
   */
  getProgressForApi: function(params) {
    const key = this._generateKey(params);
    const progress = this.getProgress(key);
    return {
      hasProgress: progress.invoiceIds.length > 0,
      ...this._getSummary(progress),
      errors: progress.errorMessages || []  // 軽量化されたエラーリスト
    };
  },

  /**
   * 進捗をキャンセル（APIから呼び出し用）
   * @param {Object} params - { invoiceIds: string[], exportMode: string }
   * @returns {Object} 結果
   */
  cancelExport: function(params) {
    const key = this._generateKey(params);
    this.clearProgress(key);
    return { cancelled: true };
  }
};
