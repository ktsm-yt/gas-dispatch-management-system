/**
 * Invoice Repository
 *
 * T_Invoices テーブルのシートI/O処理
 */

const InvoiceRepository = {
  TABLE_NAME: 'T_Invoices',
  ID_COLUMN: 'invoice_id',

  /**
   * IDで請求書を取得（アーカイブDBフォールバック付き）
   * @param {string} invoiceId - 請求ID
   * @returns {Object|null} 請求書レコードまたはnull
   */
  findById: function(invoiceId) {
    // 1. カレントDBを検索
    const record = getRecordById(this.TABLE_NAME, this.ID_COLUMN, invoiceId);
    if (record) {
      return this._normalizeRecord(record);
    }

    // 2. カレントDBに見つからない場合、アーカイブDBを検索
    return this._findInArchive(invoiceId);
  },

  /**
   * 顧客IDで請求書を検索
   * @param {string} customerId - 顧客ID
   * @param {Object} options - オプション
   * @param {number} options.limit - 取得件数制限
   * @returns {Object[]} 請求書配列
   */
  findByCustomerId: function(customerId, options = {}) {
    let records = getAllRecords(this.TABLE_NAME);

    records = records.filter(r => !r.is_deleted && r.customer_id === customerId);

    // 請求年月の降順でソート
    records.sort((a, b) => {
      if (a.billing_year !== b.billing_year) {
        return b.billing_year - a.billing_year;
      }
      return b.billing_month - a.billing_month;
    });

    if (options.limit && options.limit > 0) {
      records = records.slice(0, options.limit);
    }

    return records.map(r => this._normalizeRecord(r));
  },

  /**
   * 年月で請求書を検索
   * @param {number} year - 請求年
   * @param {number} month - 請求月
   * @param {Object} options - オプション
   * @param {boolean} options.includeArchive - アーカイブデータを含めるか
   * @returns {Object[]} 請求書配列
   */
  findByPeriod: function(year, month, options = {}) {
    let records = getAllRecords(this.TABLE_NAME);

    // アーカイブデータを含める場合
    if (options.includeArchive) {
      const archiveRecords = this._getArchiveRecords(year, month);
      records = records.concat(archiveRecords);
    }

    records = records.filter(r =>
      !r.is_deleted &&
      r.billing_year === year &&
      (month === null || r.billing_month === month)  // monthがnullの場合は年のみで絞り込み
    );

    // ステータスで絞り込み
    if (options.status) {
      records = records.filter(r => r.status === options.status);
    }

    // 顧客IDで絞り込み
    if (options.customer_id) {
      records = records.filter(r => r.customer_id === options.customer_id);
    }

    return records.map(r => this._normalizeRecord(r));
  },

  /**
   * 条件で請求書を検索
   * @param {Object} query - 検索条件
   * @param {string} query.customer_id - 顧客ID
   * @param {number} query.billing_year - 請求年
   * @param {number} query.billing_month - 請求月
   * @param {string} query.status - ステータス
   * @param {string} query.invoice_format - 書式
   * @param {number} query.limit - 取得件数制限
   * @param {boolean} query.includeArchive - アーカイブデータを含めるか
   * @returns {Object[]} 請求書配列
   */
  search: function(query = {}) {
    let records = getAllRecords(this.TABLE_NAME);

    // アーカイブデータを含める場合
    if (query.includeArchive && query.billing_year) {
      const archiveRecords = this._getArchiveRecords(query.billing_year, query.billing_month);
      records = records.concat(archiveRecords);
    }

    // 論理削除除外
    records = records.filter(r => !r.is_deleted);

    // 顧客IDで絞り込み
    if (query.customer_id) {
      records = records.filter(r => r.customer_id === query.customer_id);
    }

    // 年で絞り込み
    if (query.billing_year) {
      records = records.filter(r => r.billing_year === query.billing_year);
    }

    // 月で絞り込み
    if (query.billing_month) {
      records = records.filter(r => r.billing_month === query.billing_month);
    }

    // ステータスで絞り込み
    if (query.status) {
      records = records.filter(r => r.status === query.status);
    }

    // 書式で絞り込み
    if (query.invoice_format) {
      records = records.filter(r => r.invoice_format === query.invoice_format);
    }

    // ソート（デフォルト: 新しい順）
    const sortOrder = query.sort_order || 'desc';
    const sortMultiplier = sortOrder === 'asc' ? 1 : -1;

    records.sort((a, b) => {
      if (a.billing_year !== b.billing_year) {
        return (b.billing_year - a.billing_year) * sortMultiplier;
      }
      if (a.billing_month !== b.billing_month) {
        return (b.billing_month - a.billing_month) * sortMultiplier;
      }
      return (a.created_at > b.created_at ? -1 : 1) * sortMultiplier;
    });

    // 件数制限
    if (query.limit && query.limit > 0) {
      records = records.slice(0, query.limit);
    }

    return records.map(r => this._normalizeRecord(r));
  },

  /**
   * 新規請求書を作成
   * @param {Object} invoice - 請求書データ
   * @returns {Object} 作成した請求書
   */
  insert: function(invoice) {
    const user = getCurrentUserEmail();
    const now = getCurrentTimestamp();

    const newInvoice = {
      invoice_id: invoice.invoice_id || generateId('inv'),
      invoice_number: invoice.invoice_number || '',
      customer_id: invoice.customer_id,
      billing_year: invoice.billing_year,
      billing_month: invoice.billing_month,
      issue_date: invoice.issue_date || '',
      due_date: invoice.due_date || '',
      subtotal: invoice.subtotal || 0,
      expense_amount: invoice.expense_amount || 0,
      tax_amount: invoice.tax_amount || 0,
      total_amount: invoice.total_amount || 0,
      invoice_format: invoice.invoice_format || 'format1',
      shipper_name: invoice.shipper_name || '',
      pdf_file_id: invoice.pdf_file_id || '',
      excel_file_id: invoice.excel_file_id || '',
      sheet_file_id: invoice.sheet_file_id || '',
      status: invoice.status || 'unsent',
      notes: invoice.notes || '',
      created_at: now,
      created_by: user,
      updated_at: now,
      is_deleted: false
    };

    insertRecord(this.TABLE_NAME, newInvoice);

    return newInvoice;
  },

  /**
   * 請求書を更新（楽観ロック付き）
   * @param {Object} invoice - 更新データ（invoice_id必須）
   * @param {string} expectedUpdatedAt - 期待するupdated_at
   * @returns {Object} 更新結果 { success: boolean, invoice?: Object, error?: string }
   */
  update: function(invoice, expectedUpdatedAt) {
    if (!invoice.invoice_id) {
      return { success: false, error: 'invoice_id is required' };
    }

    // アーカイブデータの場合はアーカイブDBに書き込み
    if (invoice._archived && invoice._archiveFiscalYear) {
      return this._updateArchiveRecord(invoice, expectedUpdatedAt);
    }

    const sheet = getSheet(this.TABLE_NAME);
    const rowNum = findRowById(sheet, this.ID_COLUMN, invoice.invoice_id);

    if (!rowNum) {
      return { success: false, error: 'NOT_FOUND' };
    }

    const headers = getHeaders(sheet);
    const currentRow = sheet.getRange(rowNum, 1, 1, headers.length).getValues()[0];
    const currentInvoice = rowToObject(headers, currentRow);

    // 論理削除済みチェック
    if (currentInvoice.is_deleted) {
      return { success: false, error: 'NOT_FOUND' };
    }

    // 楽観ロックチェック
    if (expectedUpdatedAt && currentInvoice.updated_at !== expectedUpdatedAt) {
      return {
        success: false,
        error: 'CONFLICT_ERROR',
        currentUpdatedAt: currentInvoice.updated_at
      };
    }

    const user = getCurrentUserEmail();
    const now = getCurrentTimestamp();

    // 更新可能フィールド（ホワイトリスト）
    const updatableFields = [
      'invoice_number', 'issue_date', 'due_date',
      'subtotal', 'expense_amount', 'tax_amount', 'total_amount',
      'invoice_format', 'shipper_name',
      'pdf_file_id', 'excel_file_id', 'sheet_file_id',
      'status', 'notes', 'is_deleted'
    ];

    const updatedInvoice = { ...currentInvoice };

    for (const field of updatableFields) {
      if (invoice[field] !== undefined) {
        updatedInvoice[field] = invoice[field];
      }
    }

    updatedInvoice.updated_at = now;

    const newRow = objectToRow(headers, updatedInvoice);
    sheet.getRange(rowNum, 1, 1, headers.length).setValues([newRow]);

    return {
      success: true,
      invoice: this._normalizeRecord(updatedInvoice),
      before: currentInvoice
    };
  },

  /**
   * 論理削除
   * @param {string} invoiceId - 請求ID
   * @param {string} expectedUpdatedAt - 期待するupdated_at
   * @returns {Object} 削除結果 { success: boolean, error?: string }
   */
  softDelete: function(invoiceId, expectedUpdatedAt) {
    return this.update(
      { invoice_id: invoiceId, is_deleted: true },
      expectedUpdatedAt
    );
  },

  /**
   * 複数請求書を一括論理削除（最適化版）
   * @param {string[]} invoiceIds - 請求ID配列
   * @returns {Object} 削除結果 { success: boolean, deleted: number }
   */
  bulkSoftDelete: function(invoiceIds) {
    if (!invoiceIds || invoiceIds.length === 0) {
      return { success: true, deleted: 0 };
    }

    const sheet = getSheet(this.TABLE_NAME);
    const headers = getHeaders(sheet);
    const lastRow = sheet.getLastRow();

    if (lastRow <= 1) {
      return { success: true, deleted: 0 };
    }

    // 全データを一度に取得
    const allData = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
    const invoiceIdSet = new Set(invoiceIds);
    const invoiceIdCol = headers.indexOf('invoice_id');
    const isDeletedCol = headers.indexOf('is_deleted');
    const updatedAtCol = headers.indexOf('updated_at');

    const now = getCurrentTimestamp();
    let deleted = 0;

    // 対象行を更新（メモリ上）
    for (let i = 0; i < allData.length; i++) {
      const row = allData[i];
      if (invoiceIdSet.has(row[invoiceIdCol]) && !row[isDeletedCol]) {
        row[isDeletedCol] = true;
        row[updatedAtCol] = now;
        deleted++;
      }
    }

    // 一括で書き戻し
    if (deleted > 0) {
      sheet.getRange(2, 1, allData.length, headers.length).setValues(allData);
    }

    return { success: true, deleted };
  },

  /**
   * 複数請求書のステータスを一括更新（バルク処理）
   * @param {Object[]} updates - [{ invoiceId, expectedUpdatedAt }, ...]
   * @param {string} targetStatus - 更新先ステータス
   * @returns {Object} { success: number, failed: number, results: [], invoices: [] }
   */
  bulkUpdateStatus: function(updates, targetStatus) {
    if (!updates || updates.length === 0) {
      return { success: 0, failed: 0, results: [], invoices: [] };
    }

    // ステータス正規化
    const normalizeStatus = s => String(s || '').trim().toLowerCase();
    const normalizedTargetStatus = normalizeStatus(targetStatus);

    // 有効なステータスチェック
    const validStatuses = ['unsent', 'sent', 'unpaid', 'paid'];
    if (!validStatuses.includes(normalizedTargetStatus)) {
      return {
        success: 0,
        failed: updates.length,
        results: updates.map(u => ({
          invoiceId: u.invoiceId,
          success: false,
          error: 'INVALID_STATUS'
        })),
        invoices: []
      };
    }

    // ステータス遷移ルール
    const allowedTransitions = {
      unsent: ['sent'],
      sent: ['paid', 'unpaid', 'unsent'],
      unpaid: ['paid', 'sent'],
      paid: ['sent']
    };

    const sheet = getSheet(this.TABLE_NAME);
    const headers = getHeaders(sheet);
    const lastRow = sheet.getLastRow();

    if (lastRow <= 1) {
      return {
        success: 0,
        failed: updates.length,
        results: updates.map(u => ({
          invoiceId: u.invoiceId,
          success: false,
          error: 'NOT_FOUND'
        })),
        invoices: []
      };
    }

    // 1. 全データを一括読み込み
    const dataRange = sheet.getRange(2, 1, lastRow - 1, headers.length);
    const allData = dataRange.getValues();

    // 2. カラムインデックスを取得
    const idIndex = headers.indexOf(this.ID_COLUMN);
    const statusIndex = headers.indexOf('status');
    const updatedAtIndex = headers.indexOf('updated_at');
    const isDeletedIndex = headers.indexOf('is_deleted');

    if (idIndex === -1 || statusIndex === -1) {
      return {
        success: 0,
        failed: updates.length,
        results: updates.map(u => ({
          invoiceId: u.invoiceId,
          success: false,
          error: 'SCHEMA_ERROR'
        })),
        invoices: []
      };
    }

    // 3. 更新対象のMapを作成 (invoiceId -> expectedUpdatedAt)
    const updateMap = new Map(
      updates.map(u => [u.invoiceId, u.expectedUpdatedAt])
    );

    const now = getCurrentTimestamp();
    const results = [];
    const updatedInvoices = [];
    let successCount = 0;
    let failedCount = 0;
    let hasChanges = false;

    // 4. メモリ上でデータを更新
    for (let i = 0; i < allData.length; i++) {
      const row = allData[i];
      const invoiceId = row[idIndex];

      if (!updateMap.has(invoiceId)) continue;

      const expectedUpdatedAt = updateMap.get(invoiceId);

      // 論理削除済みチェック
      if (isDeletedIndex !== -1 && row[isDeletedIndex] === true) {
        results.push({ invoiceId, success: false, error: 'DELETED' });
        failedCount++;
        updateMap.delete(invoiceId); // 処理済みマーク
        continue;
      }

      // 楽観的ロックチェック
      const currentUpdatedAt = row[updatedAtIndex];
      if (expectedUpdatedAt && currentUpdatedAt !== expectedUpdatedAt) {
        results.push({
          invoiceId,
          success: false,
          error: 'CONFLICT_ERROR',
          currentUpdatedAt
        });
        failedCount++;
        updateMap.delete(invoiceId);
        continue;
      }

      // ステータス遷移チェック
      const currentStatus = normalizeStatus(row[statusIndex]);
      // 旧ステータス(draft, issued)はunsentとして扱う
      const normalizedCurrentStatus = (currentStatus === 'draft' || currentStatus === 'issued')
        ? 'unsent'
        : currentStatus;

      if (normalizedCurrentStatus !== normalizedTargetStatus &&
          !allowedTransitions[normalizedCurrentStatus]?.includes(normalizedTargetStatus)) {
        results.push({
          invoiceId,
          success: false,
          error: 'INVALID_STATUS_TRANSITION',
          currentStatus: normalizedCurrentStatus
        });
        failedCount++;
        updateMap.delete(invoiceId);
        continue;
      }

      // ステータス更新
      row[statusIndex] = normalizedTargetStatus;
      if (updatedAtIndex !== -1) {
        row[updatedAtIndex] = now;
      }

      hasChanges = true;
      successCount++;
      results.push({ invoiceId, success: true });

      // 更新後のレコードを構築
      const updatedRecord = rowToObject(headers, row);
      updatedInvoices.push(this._normalizeRecord(updatedRecord));

      updateMap.delete(invoiceId); // 処理済みマーク
    }

    // 5. 見つからなかったIDをエラーとして追加
    for (const [invoiceId] of updateMap) {
      results.push({ invoiceId, success: false, error: 'NOT_FOUND' });
      failedCount++;
    }

    // 6. 変更があれば一括書き込み
    if (hasChanges) {
      dataRange.setValues(allData);
    }

    return {
      success: successCount,
      failed: failedCount,
      results,
      invoices: updatedInvoices
    };
  },

  /**
   * 請求番号を生成（YYMM_SEQ形式）
   * 競合防止のためロックを取得し、一意性を保証する
   * @param {number} year - 年
   * @param {number} month - 月
   * @param {string} customerId - 顧客ID
   * @returns {string} 請求番号
   * @throws {Error} ロック取得失敗または一意番号生成失敗時
   */
  generateInvoiceNumber: function(year, month, customerId) {
    const MAX_RETRIES = 3;
    const lock = LockService.getScriptLock();

    // ロックを取得（最大5秒待機）
    const acquired = lock.tryLock(5000);
    if (!acquired) {
      throw new Error('LOCK_ACQUISITION_FAILED: 請求番号生成のロック取得に失敗しました。しばらく待ってから再試行してください。');
    }

    try {
      const yy = String(year).slice(-2);
      const mm = String(month).padStart(2, '0');
      const prefix = `${yy}${mm}_`;

      for (let retry = 0; retry < MAX_RETRIES; retry++) {
        // 全請求書から同じYYMM_で始まる番号の最大連番を取得
        const records = getAllRecords(this.TABLE_NAME);

        let maxSeq = 0;
        for (const inv of records) {
          if (!inv.is_deleted && inv.invoice_number && inv.invoice_number.startsWith(prefix)) {
            const parts = inv.invoice_number.split('_');
            if (parts.length === 2) {
              const seq = parseInt(parts[1], 10);
              if (!isNaN(seq) && seq > maxSeq) {
                maxSeq = seq;
              }
            }
          }
        }

        const candidateSeq = maxSeq + 1 + retry; // リトライ時はインクリメント
        const candidateNumber = `${prefix}${candidateSeq}`;

        // 一意性チェック
        const isDuplicate = records.some(r =>
          !r.is_deleted && r.invoice_number === candidateNumber
        );

        if (!isDuplicate) {
          return candidateNumber;
        }

        console.warn(`Invoice number collision detected: ${candidateNumber}, retrying...`);
      }

      throw new Error('INVOICE_NUMBER_GENERATION_FAILED: 一意な請求番号の生成に失敗しました。');
    } finally {
      lock.releaseLock();
    }
  },

  /**
   * 請求番号が利用可能か確認
   * @param {string} invoiceNumber - 確認する請求番号
   * @returns {boolean} 利用可能ならtrue
   */
  isInvoiceNumberAvailable: function(invoiceNumber) {
    const records = getAllRecords(this.TABLE_NAME);
    return !records.some(r => !r.is_deleted && r.invoice_number === invoiceNumber);
  },

  /**
   * 顧客IDと年月で請求書を検索（一括生成の重複チェック用）
   * @param {string} customerId - 顧客ID
   * @param {number} year - 請求年
   * @param {number} month - 請求月
   * @returns {Object|null} 請求書またはnull
   */
  findByCustomerAndPeriod: function(customerId, year, month) {
    const results = this.search({
      customer_id: customerId,
      billing_year: year,
      billing_month: month,
      limit: 1
    });
    return results.length > 0 ? results[0] : null;
  },

  /**
   * 期限超過の請求書を自動的に「未回収」ステータスに更新
   * 対象: status === 'sent' かつ due_date < 今日
   * @returns {Object} { updated: number, invoiceIds: string[] }
   */
  autoMarkOverdue: function() {
    const sheet = getSheet(this.TABLE_NAME);
    const headers = getHeaders(sheet);
    const lastRow = sheet.getLastRow();

    if (lastRow <= 1) {
      return { updated: 0, invoiceIds: [] };
    }

    const today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
    const now = getCurrentTimestamp();

    // 全データを一度に取得
    const allData = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();

    const invoiceIdCol = headers.indexOf('invoice_id');
    const statusCol = headers.indexOf('status');
    const dueDateCol = headers.indexOf('due_date');
    const isDeletedCol = headers.indexOf('is_deleted');
    const updatedAtCol = headers.indexOf('updated_at');

    const updatedIds = [];

    // 対象行を更新（メモリ上）
    for (let i = 0; i < allData.length; i++) {
      const row = allData[i];

      // 論理削除済みはスキップ
      if (row[isDeletedCol] === true) continue;

      // sentステータスのみ対象
      if (row[statusCol] !== 'sent') continue;

      // due_dateを正規化して比較
      const dueDate = this._normalizeDate(row[dueDateCol]);
      if (!dueDate || dueDate >= today) continue;

      // 期限超過 → unpaidに更新
      row[statusCol] = 'unpaid';
      row[updatedAtCol] = now;
      updatedIds.push(row[invoiceIdCol]);
    }

    // 一括で書き戻し
    if (updatedIds.length > 0) {
      sheet.getRange(2, 1, allData.length, headers.length).setValues(allData);

      // 監査ログを記録
      try {
        for (const invoiceId of updatedIds) {
          logUpdate('T_Invoices', invoiceId, {
            status: 'unpaid',
            reason: 'auto_overdue',
            due_date_exceeded: today
          });
        }
      } catch (logError) {
        console.warn('監査ログ記録エラー (autoMarkOverdue):', logError.message);
      }
    }

    return { updated: updatedIds.length, invoiceIds: updatedIds };
  },

  /**
   * ステータスで請求書を検索
   * @param {string} status - ステータス（draft/issued/sent/paid）
   * @returns {Object[]} 請求書配列
   */
  findByStatus: function(status) {
    let records = getAllRecords(this.TABLE_NAME);

    records = records.filter(r => !r.is_deleted && r.status === status);

    return records.map(r => this._normalizeRecord(r));
  },

  /**
   * ファイルIDを更新
   * @param {string} invoiceId - 請求ID
   * @param {Object} fileIds - ファイルID { pdf_file_id?, excel_file_id?, sheet_file_id? }
   * @returns {Object} 更新結果
   */
  updateFileIds: function(invoiceId, fileIds) {
    const current = this.findById(invoiceId);
    if (!current) {
      return { success: false, error: 'NOT_FOUND' };
    }

    const updateData = {
      invoice_id: invoiceId,
      ...fileIds
    };

    return this.update(updateData, current.updated_at);
  },

  /**
   * 指定年月の最大updated_atを取得（更新検知用）
   * @param {number} year - 年
   * @param {number} month - 月
   * @returns {string|null} 最大のupdated_at
   */
  getMaxUpdatedAt: function(year, month) {
    const invoices = this.findByPeriod(year, month);

    if (invoices.length === 0) {
      return null;
    }

    return invoices.reduce((max, inv) => {
      return inv.updated_at > max ? inv.updated_at : max;
    }, invoices[0].updated_at);
  },

  /**
   * レコードを正規化
   * @param {Object} record - レコード
   * @returns {Object} 正規化されたレコード
   */
  _normalizeRecord: function(record) {
    return {
      ...record,
      issue_date: this._normalizeDate(record.issue_date),
      due_date: this._normalizeDate(record.due_date),
      billing_year: Number(record.billing_year) || 0,
      billing_month: Number(record.billing_month) || 0,
      subtotal: Number(record.subtotal) || 0,
      expense_amount: Number(record.expense_amount) || 0,
      tax_amount: Number(record.tax_amount) || 0,
      total_amount: Number(record.total_amount) || 0
    };
  },

  /**
   * 日付を正規化してYYYY-MM-DD形式の文字列に変換
   * @param {Date|string} dateValue - 日付値
   * @returns {string|null} 正規化された日付文字列
   */
  _normalizeDate: function(dateValue) {
    if (!dateValue) return '';

    if (dateValue instanceof Date) {
      return Utilities.formatDate(dateValue, 'Asia/Tokyo', 'yyyy-MM-dd');
    }

    // 文字列の場合はスラッシュをハイフンに変換
    return String(dateValue).replace(/\//g, '-');
  },

  /**
   * アーカイブDBからレコードを取得（P2-5）
   * @param {number} year - 請求年
   * @param {number} month - 請求月（nullの場合は年全体）
   * @returns {Object[]} アーカイブレコード配列（_archived: trueフラグ付き）
   */
  _getArchiveRecords: function(year, month) {
    const archiveRecords = [];

    // 請求年から対象の年度を特定
    // 1-3月は前年度、4-12月は当年度
    const targetYears = [];
    if (month) {
      const fiscalYear = month >= 4 ? year : year - 1;
      targetYears.push(fiscalYear);
    } else {
      // 月が指定されていない場合は両方の年度をチェック
      targetYears.push(year);
      targetYears.push(year - 1);
    }

    for (const fiscalYear of targetYears) {
      const archiveDbId = ArchiveService.getArchiveDbId(fiscalYear);
      if (!archiveDbId) continue;

      try {
        const archiveDb = SpreadsheetApp.openById(archiveDbId);
        // TABLE_SHEET_MAPを使って日本語シート名に変換
        const sheetName = TABLE_SHEET_MAP[this.TABLE_NAME] || this.TABLE_NAME;
        const sheet = archiveDb.getSheetByName(sheetName);
        if (!sheet) continue;

        const data = sheet.getDataRange().getValues();
        if (data.length <= 1) continue;

        const headers = data[0];

        for (let i = 1; i < data.length; i++) {
          const record = {};
          for (let j = 0; j < headers.length; j++) {
            record[headers[j]] = data[i][j];
          }
          // アーカイブフラグを付与
          record._archived = true;
          record._archiveFiscalYear = fiscalYear;
          archiveRecords.push(record);
        }
      } catch (e) {
        Logger.log(`アーカイブDB読み込みエラー (${fiscalYear}): ${e.message}`);
      }
    }

    return archiveRecords;
  },

  /**
   * アーカイブDBのレコードを更新（P2-5拡張）
   * @param {Object} invoice - 更新データ（invoice_id, _archived, _archiveFiscalYear必須）
   * @param {string} expectedUpdatedAt - 期待するupdated_at
   * @returns {Object} 更新結果 { success: boolean, invoice?: Object, error?: string }
   */
  _updateArchiveRecord: function(invoice, expectedUpdatedAt) {
    const fiscalYear = invoice._archiveFiscalYear;
    const archiveDbId = ArchiveService.getArchiveDbId(fiscalYear);

    if (!archiveDbId) {
      return { success: false, error: 'ARCHIVE_DB_NOT_FOUND', message: `${fiscalYear}年度のアーカイブDBが見つかりません。` };
    }

    try {
      const archiveDb = SpreadsheetApp.openById(archiveDbId);
      const sheetName = TABLE_SHEET_MAP[this.TABLE_NAME] || this.TABLE_NAME;
      const sheet = archiveDb.getSheetByName(sheetName);

      if (!sheet) {
        return { success: false, error: 'ARCHIVE_SHEET_NOT_FOUND', message: `アーカイブDBに${sheetName}シートが見つかりません。` };
      }

      const headers = getHeaders(sheet);
      const idColIndex = headers.indexOf(this.ID_COLUMN);
      const updatedAtColIndex = headers.indexOf('updated_at');

      if (idColIndex === -1) {
        return { success: false, error: 'SCHEMA_ERROR', message: 'アーカイブDBのスキーマが不正です。' };
      }

      // IDで行を検索
      const lastRow = sheet.getLastRow();
      if (lastRow <= 1) {
        return { success: false, error: 'NOT_FOUND' };
      }

      const data = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
      let targetRowIndex = -1;
      let currentRecord = null;

      for (let i = 0; i < data.length; i++) {
        if (data[i][idColIndex] === invoice.invoice_id) {
          targetRowIndex = i;
          currentRecord = rowToObject(headers, data[i]);
          break;
        }
      }

      if (targetRowIndex === -1) {
        return { success: false, error: 'NOT_FOUND' };
      }

      // 楽観ロックチェック
      if (expectedUpdatedAt && currentRecord.updated_at !== expectedUpdatedAt) {
        return {
          success: false,
          error: 'CONFLICT_ERROR',
          currentUpdatedAt: currentRecord.updated_at
        };
      }

      const user = getCurrentUserEmail();
      const now = getCurrentTimestamp();

      // 更新可能フィールド（ホワイトリスト）
      const updatableFields = [
        'invoice_number', 'issue_date', 'due_date',
        'subtotal', 'expense_amount', 'tax_amount', 'total_amount',
        'invoice_format', 'shipper_name',
        'pdf_file_id', 'excel_file_id', 'sheet_file_id',
        'status', 'notes', 'is_deleted'
      ];

      const updatedInvoice = { ...currentRecord };

      for (const field of updatableFields) {
        if (invoice[field] !== undefined) {
          updatedInvoice[field] = invoice[field];
        }
      }

      updatedInvoice.updated_at = now;

      // アーカイブDBに書き込み
      const newRow = objectToRow(headers, updatedInvoice);
      sheet.getRange(targetRowIndex + 2, 1, 1, headers.length).setValues([newRow]);

      // アーカイブフラグを付与して返す
      const result = this._normalizeRecord(updatedInvoice);
      result._archived = true;
      result._archiveFiscalYear = fiscalYear;

      return {
        success: true,
        invoice: result,
        before: currentRecord
      };

    } catch (e) {
      Logger.log(`アーカイブDB更新エラー: ${e.message}`);
      return { success: false, error: 'ARCHIVE_UPDATE_ERROR', message: e.message };
    }
  },

  /**
   * アーカイブDBからIDで請求書を検索（P2-5: findById拡張）
   * @param {string} invoiceId - 請求ID
   * @returns {Object|null} 請求書レコード（_archived, _archiveFiscalYear付き）またはnull
   */
  _findInArchive: function(invoiceId) {
    const currentFiscalYear = ArchiveService.getCurrentFiscalYear();

    // 直近3年度分のアーカイブを検索（新しい年度から）
    for (let y = currentFiscalYear - 1; y >= currentFiscalYear - 3 && y >= 2020; y--) {
      const archiveDbId = ArchiveService.getArchiveDbId(y);
      if (!archiveDbId) continue;

      try {
        const archiveDb = SpreadsheetApp.openById(archiveDbId);
        const sheetName = TABLE_SHEET_MAP[this.TABLE_NAME] || this.TABLE_NAME;
        const sheet = archiveDb.getSheetByName(sheetName);
        if (!sheet) continue;

        const data = sheet.getDataRange().getValues();
        if (data.length <= 1) continue;

        const headers = data[0];
        const idColIndex = headers.indexOf(this.ID_COLUMN);
        if (idColIndex === -1) continue;

        for (let i = 1; i < data.length; i++) {
          if (data[i][idColIndex] === invoiceId) {
            const record = {};
            for (let j = 0; j < headers.length; j++) {
              record[headers[j]] = data[i][j];
            }
            // アーカイブフラグを付与
            record._archived = true;
            record._archiveFiscalYear = y;

            // 正規化して返す
            return this._normalizeRecord(record);
          }
        }
      } catch (e) {
        Logger.log(`アーカイブDB検索エラー (${y}): ${e.message}`);
      }
    }

    return null;
  }
};
