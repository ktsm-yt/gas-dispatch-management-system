/**
 * 請求書一括出力サービス
 *
 * GASの6分制限を回避するため、ArchiveServiceと同じバックエンド完全制御型パターンを採用。
 * - PropertiesService で進捗を永続化
 * - LockService で排他制御
 * - 5分経過で安全に中断し、UIからの再呼び出しで継続
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
   * @param {Object} params - { invoiceIds: string[], exportMode: 'pdf'|'pdf_cover'|'excel' }
   * @returns {Object} 実行結果
   */
  executeBulkExport: function(params) {
    // ユーザーロックを使用（ユーザーごとに独立）
    const lock = LockService.getUserLock();

    try {
      // 排他制御を取得（3秒待機）
      if (!lock.tryLock(3000)) {
        return {
          success: false,
          error: 'ALREADY_RUNNING',
          message: '別の一括出力が実行中です。しばらく待ってから再度お試しください。'
        };
      }

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
          results: [],
          errors: [],
          startedAt: new Date().toISOString()
        };
      }

      Logger.log(`[BulkExport] 開始: ${progress.processedCount}/${progress.totalCount} 件処理済み`);

      // バッチ処理（1件ずつ処理）
      while (progress.processedCount < progress.totalCount) {
        // 5分経過チェック
        const elapsed = Date.now() - startTime;
        if (elapsed > this.TIMEOUT_MS) {
          this.saveProgress(exportKey, progress);
          Logger.log(`[BulkExport] タイムアウト: ${progress.processedCount}/${progress.totalCount} 件完了`);
          return {
            success: false,
            error: 'TIMEOUT_WILL_CONTINUE',
            progress: this._getSummary(progress)
          };
        }

        // 1件処理
        const invoiceId = progress.invoiceIds[progress.processedCount];
        this._exportOne(invoiceId, progress);
        progress.processedCount++;

        // 10件ごとに進捗を保存（クラッシュ対策）
        if (progress.processedCount % 10 === 0) {
          this.saveProgress(exportKey, progress);
        }
      }

      // 完了
      this.clearProgress(exportKey);
      Logger.log(`[BulkExport] 完了: ${progress.results.length} 件成功, ${progress.errors.length} 件エラー`);

      return {
        success: true,
        results: progress.results,
        errors: progress.errors,
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
      lock.releaseLock();
    }
  },

  /**
   * 1件の請求書を出力
   * @private
   */
  _exportOne: function(invoiceId, progress) {
    const modeConfig = this.MODES[progress.exportMode];
    if (!modeConfig) {
      progress.errors.push({
        invoiceId,
        error: 'INVALID_MODE',
        message: `無効な出力モード: ${progress.exportMode}`
      });
      return;
    }

    const exportOptions = Object.assign({ action: 'overwrite' }, modeConfig.options);

    try {
      const result = InvoiceExportService.export(invoiceId, modeConfig.mode, exportOptions);

      if (result.success) {
        progress.results.push({
          invoiceId,
          url: result.url,
          fileId: result.fileId
        });
      } else {
        progress.errors.push({
          invoiceId,
          error: result.error,
          message: result.message || result.error
        });
      }
    } catch (e) {
      progress.errors.push({
        invoiceId,
        error: 'EXPORT_ERROR',
        message: e.message
      });
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
      successCount: progress.results.length,
      errorCount: progress.errors.length,
      exportMode: progress.exportMode,
      startedAt: progress.startedAt,
      lastUpdate: new Date().toISOString()
    };
  },

  /**
   * 進捗を取得
   * @param {string} key - 進捗キー
   * @returns {Object} 進捗データ
   */
  getProgress: function(key) {
    const props = PropertiesService.getScriptProperties();
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
      results: [],
      errors: []
    };
  },

  /**
   * 進捗を保存
   * @param {string} key - 進捗キー
   * @param {Object} progress - 進捗データ
   */
  saveProgress: function(key, progress) {
    const props = PropertiesService.getScriptProperties();
    props.setProperty(this.PROGRESS_KEY_PREFIX + key, JSON.stringify({
      ...progress,
      lastUpdate: new Date().toISOString()
    }));
  },

  /**
   * 進捗をクリア
   * @param {string} key - 進捗キー
   */
  clearProgress: function(key) {
    const props = PropertiesService.getScriptProperties();
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
      errors: progress.errors
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
