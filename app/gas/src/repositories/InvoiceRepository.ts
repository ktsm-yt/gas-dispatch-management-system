/**
 * Invoice Repository
 *
 * T_Invoices テーブルのシートI/O処理
 */

interface InvoiceUpdateResult {
  success: boolean;
  invoice?: InvoiceRecord;
  error?: string;
  message?: string;
  before?: Record<string, unknown>;
  currentUpdatedAt?: string;
}

interface BulkStatusUpdateItem {
  invoiceId: string;
  expectedUpdatedAt?: string;
}

interface BulkStatusUpdateResult {
  success: number;
  failed: number;
  results: { invoiceId: string; success: boolean; error?: string; currentUpdatedAt?: unknown; currentStatus?: string }[];
  invoices: InvoiceRecord[];
}

interface FindByPeriodOptions {
  includeArchive?: boolean;
  status?: string;
  customer_id?: string;
}

// 異常入力で無限ループしないための月スキャン上限（20年分）
const ARCHIVE_FISCAL_YEAR_SCAN_MAX_MONTHS = 240;

const InvoiceRepository = {
  TABLE_NAME: 'T_Invoices',
  ID_COLUMN: 'invoice_id',

  /**
   * IDで請求書を取得（アーカイブDBフォールバック付き）
   */
  findById: function(invoiceId: string): InvoiceRecord | null {
    // 1. カレントDBを検索
    const record = getRecordById(this.TABLE_NAME, this.ID_COLUMN, invoiceId);
    if (record) {
      return this._normalizeRecord(record);
    }

    // 2. カレントDBに見つからない場合、アーカイブDBを検索
    return this._findInArchive(invoiceId);
  },

  findByCustomerId: function(customerId: string, options: { limit?: number } = {}): InvoiceRecord[] {
    let records = getAllRecords(this.TABLE_NAME);

    records = records.filter(r => !r.is_deleted && r.customer_id === customerId);

    // 請求年月の降順でソート
    records.sort((a, b) => {
      if (a.billing_year !== b.billing_year) {
        return (b.billing_year as number) - (a.billing_year as number);
      }
      return (b.billing_month as number) - (a.billing_month as number);
    });

    if (options.limit && options.limit > 0) {
      records = records.slice(0, options.limit);
    }

    return records.map(r => this._normalizeRecord(r));
  },

  findByPeriod: function(year: number, month: number | null, options: FindByPeriodOptions = {}): InvoiceRecord[] {
    let records = getAllRecords(this.TABLE_NAME);

    // アーカイブデータを含める場合
    if (options.includeArchive) {
      const archiveRecords = this._getArchiveRecords(year, month);
      records = records.concat(archiveRecords);
      // 現行DB優先で重複IDを除去（search と同じ安全策）
      records = this._dedupeByInvoiceId(records);
    }

    records = records.filter(r =>
      !r.is_deleted &&
      r.billing_year === year &&
      (month === null || r.billing_month === month)
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

  search: function(query: InvoiceSearchQuery = {}): InvoiceRecord[] {
    let records = getAllRecords(this.TABLE_NAME);

    // アーカイブデータを含める場合
    if (query.includeArchive) {
      const archiveRecords = this._getArchiveRecordsForQuery(query);
      records = records.concat(archiveRecords);
    }

    // 現行DBを優先して重複IDを除去（同一IDが混在した場合の保険）
    records = this._dedupeByInvoiceId(records);

    // 論理削除除外
    records = records.filter(r => !r.is_deleted);

    // 顧客IDで絞り込み
    if (query.customer_id) {
      records = records.filter(r => r.customer_id === query.customer_id);
    }

    // ★ 年月範囲フィルタ（YYYY-MM形式で文字列比較、年またぎ対応）
    if (query.billing_ym_from || query.billing_ym_to) {
      records = records.filter(r => {
        const billingYm = this._toBillingYm(r.billing_year, r.billing_month);
        if (!billingYm) return true;

        if (query.billing_ym_from && billingYm < query.billing_ym_from) return false;
        if (query.billing_ym_to && billingYm > query.billing_ym_to) return false;
        return true;
      });
    }

    // 年で絞り込み（billing_ym_from/to が指定されていない場合のみ）
    if (query.billing_year && !query.billing_ym_from && !query.billing_ym_to) {
      records = records.filter(r => r.billing_year === query.billing_year);
    }

    // 月で絞り込み（billing_ym_from/to が指定されていない場合のみ）
    if (query.billing_month && !query.billing_ym_from && !query.billing_ym_to) {
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
        return ((b.billing_year as number) - (a.billing_year as number)) * sortMultiplier;
      }
      if (a.billing_month !== b.billing_month) {
        return ((b.billing_month as number) - (a.billing_month as number)) * sortMultiplier;
      }
      return ((a.created_at as string) > (b.created_at as string) ? -1 : 1) * sortMultiplier;
    });

    // 件数制限
    if (query.limit && query.limit > 0) {
      records = records.slice(0, query.limit);
    }

    return records.map(r => this._normalizeRecord(r));
  },

  insert: function(invoice: Record<string, unknown>): Record<string, unknown> {
    // 必須フィールド検証
    if (!invoice.customer_id) {
      throw new Error('customer_id is required for invoice insert');
    }
    if (invoice.billing_year === undefined || invoice.billing_year === null) {
      throw new Error('billing_year is required for invoice insert');
    }
    if (invoice.billing_month === undefined || invoice.billing_month === null) {
      throw new Error('billing_month is required for invoice insert');
    }

    const user = getCurrentUserEmail();
    const now = getCurrentTimestamp();

    const newInvoice: Record<string, unknown> = {
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

  update: function(invoice: Record<string, unknown>, expectedUpdatedAt?: string): InvoiceUpdateResult {
    if (!invoice.invoice_id) {
      return { success: false, error: 'invoice_id is required' };
    }

    // アーカイブデータの場合はアーカイブDBに書き込み
    if (invoice._archived && invoice._archiveFiscalYear) {
      return this._updateArchiveRecord(invoice as Record<string, unknown>, expectedUpdatedAt);
    }

    const sheet = getSheet(this.TABLE_NAME);
    const rowNum = findRowById(sheet, this.ID_COLUMN, invoice.invoice_id as string);

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
        currentUpdatedAt: currentInvoice.updated_at as string
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
      'adjustment_total',
      'status', 'notes', 'is_deleted'
    ];

    const updatedInvoice: Record<string, unknown> = { ...currentInvoice };

    for (const field of updatableFields) {
      if (invoice[field] !== undefined) {
        updatedInvoice[field] = invoice[field];
      }
    }

    updatedInvoice.updated_at = now;

    const newRow = objectToRow(headers, updatedInvoice);
    sheet.getRange(rowNum, 1, 1, headers.length).setValues([newRow]);
    invalidateExecutionCache(this.TABLE_NAME);

    return {
      success: true,
      invoice: this._normalizeRecord(updatedInvoice),
      before: currentInvoice
    };
  },

  softDelete: function(invoiceId: string, expectedUpdatedAt?: string): InvoiceUpdateResult {
    return this.update(
      { invoice_id: invoiceId, is_deleted: true },
      expectedUpdatedAt
    );
  },

  bulkSoftDelete: function(invoiceIds: string[]): { success: boolean; deleted: number } {
    if (!invoiceIds || invoiceIds.length === 0) {
      return { success: true, deleted: 0 };
    }

    const sheet = getSheet(this.TABLE_NAME);
    const headers = getHeaders(sheet);
    const lastRow = sheet.getLastRow();

    if (lastRow <= 1) {
      return { success: true, deleted: 0 };
    }

    const allData = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
    const invoiceIdSet = new Set(invoiceIds);
    const invoiceIdCol = headers.indexOf('invoice_id');
    const isDeletedCol = headers.indexOf('is_deleted');
    const updatedAtCol = headers.indexOf('updated_at');

    const now = getCurrentTimestamp();
    let deleted = 0;

    for (let i = 0; i < allData.length; i++) {
      const row = allData[i];
      if (invoiceIdSet.has(row[invoiceIdCol]) && !row[isDeletedCol]) {
        row[isDeletedCol] = true;
        row[updatedAtCol] = now;
        deleted++;
      }
    }

    if (deleted > 0) {
      sheet.getRange(2, 1, allData.length, headers.length).setValues(allData);
      invalidateExecutionCache(this.TABLE_NAME);
    }

    return { success: true, deleted };
  },

  bulkUpdateStatus: function(updates: BulkStatusUpdateItem[], targetStatus: string): BulkStatusUpdateResult {
    if (!updates || updates.length === 0) {
      return { success: 0, failed: 0, results: [], invoices: [] };
    }

    const normalizeStatus = (s: unknown): string => String(s || '').trim().toLowerCase();
    const normalizedTargetStatus = normalizeStatus(targetStatus);

    const validStatuses = ['unsent', 'sent', 'unpaid', 'paid', 'hold'];
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

    const allowedTransitions: Record<string, string[]> = {
      unsent: ['sent', 'hold'],
      sent: ['paid', 'unpaid', 'unsent', 'hold'],
      unpaid: ['paid', 'sent', 'hold'],
      paid: ['sent', 'hold'],
      hold: ['unsent', 'sent', 'unpaid', 'paid']
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

    const dataRange = sheet.getRange(2, 1, lastRow - 1, headers.length);
    const allData = dataRange.getValues();

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

    const updateMap = new Map<string, string | undefined>(
      updates.map(u => [u.invoiceId, u.expectedUpdatedAt])
    );

    const now = getCurrentTimestamp();
    const results: BulkStatusUpdateResult['results'] = [];
    const updatedInvoices: InvoiceRecord[] = [];
    let successCount = 0;
    let failedCount = 0;
    let hasChanges = false;

    for (let i = 0; i < allData.length; i++) {
      const row = allData[i];
      const invoiceId = row[idIndex] as string;

      if (!updateMap.has(invoiceId)) continue;

      const expectedUpdatedAt = updateMap.get(invoiceId);

      if (isDeletedIndex !== -1 && row[isDeletedIndex] === true) {
        results.push({ invoiceId, success: false, error: 'DELETED' });
        failedCount++;
        updateMap.delete(invoiceId);
        continue;
      }

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

      const currentStatus = normalizeStatus(row[statusIndex]);
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

      row[statusIndex] = normalizedTargetStatus;
      if (updatedAtIndex !== -1) {
        row[updatedAtIndex] = now;
      }

      hasChanges = true;
      successCount++;
      results.push({ invoiceId, success: true });

      const updatedRecord = rowToObject(headers, row);
      updatedInvoices.push(this._normalizeRecord(updatedRecord));

      updateMap.delete(invoiceId);
    }

    for (const [invoiceId] of updateMap) {
      results.push({ invoiceId, success: false, error: 'NOT_FOUND' });
      failedCount++;
    }

    if (hasChanges) {
      dataRange.setValues(allData);
      invalidateExecutionCache(this.TABLE_NAME);
    }

    return {
      success: successCount,
      failed: failedCount,
      results,
      invoices: updatedInvoices
    };
  },

  generateInvoiceNumber: function(year: number, month: number, _customerId: string): string {
    const MAX_RETRIES = 3;
    const lock = LockService.getScriptLock();

    const acquired = lock.tryLock(5000);
    if (!acquired) {
      throw new Error('LOCK_ACQUISITION_FAILED: 請求番号生成のロック取得に失敗しました。しばらく待ってから再試行してください。');
    }

    try {
      const yy = String(year).slice(-2);
      const mm = String(month).padStart(2, '0');
      const prefix = `${yy}${mm}_`;

      for (let retry = 0; retry < MAX_RETRIES; retry++) {
        const records = getAllRecords(this.TABLE_NAME);

        let maxSeq = 0;
        for (const inv of records) {
          if (!inv.is_deleted && inv.invoice_number && (inv.invoice_number as string).startsWith(prefix)) {
            const parts = (inv.invoice_number as string).split('_');
            if (parts.length === 2) {
              const seq = parseInt(parts[1], 10);
              if (!isNaN(seq) && seq > maxSeq) {
                maxSeq = seq;
              }
            }
          }
        }

        const candidateSeq = maxSeq + 1 + retry;
        const candidateNumber = `${prefix}${candidateSeq}`;

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

  isInvoiceNumberAvailable: function(invoiceNumber: string): boolean {
    const records = getAllRecords(this.TABLE_NAME);
    return !records.some(r => !r.is_deleted && r.invoice_number === invoiceNumber);
  },

  findByCustomerAndPeriod: function(customerId: string, year: number, month: number): InvoiceRecord | null {
    const results = this.search({
      customer_id: customerId,
      billing_year: year,
      billing_month: month,
      limit: 1
    });
    return results.length > 0 ? results[0] : null;
  },

  autoMarkOverdue: function(): { updated: number; invoiceIds: string[] } {
    const sheet = getSheet(this.TABLE_NAME);
    const headers = getHeaders(sheet);
    const lastRow = sheet.getLastRow();

    if (lastRow <= 1) {
      return { updated: 0, invoiceIds: [] };
    }

    const today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
    const now = getCurrentTimestamp();

    const allData = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();

    const invoiceIdCol = headers.indexOf('invoice_id');
    const statusCol = headers.indexOf('status');
    const dueDateCol = headers.indexOf('due_date');
    const isDeletedCol = headers.indexOf('is_deleted');
    const updatedAtCol = headers.indexOf('updated_at');

    const updatedIds: string[] = [];

    for (let i = 0; i < allData.length; i++) {
      const row = allData[i];

      if (row[isDeletedCol] === true) continue;
      if (row[statusCol] !== 'sent') continue;

      const dueDate = this._normalizeDate(row[dueDateCol]);
      if (!dueDate || dueDate >= today) continue;

      row[statusCol] = 'unpaid';
      row[updatedAtCol] = now;
      updatedIds.push(row[invoiceIdCol] as string);
    }

    if (updatedIds.length > 0) {
      sheet.getRange(2, 1, allData.length, headers.length).setValues(allData);
      invalidateExecutionCache(this.TABLE_NAME);

      try {
        for (const invoiceId of updatedIds) {
          logUpdate('T_Invoices', invoiceId, { status: 'sent' }, {
            status: 'unpaid',
            reason: 'auto_overdue',
            due_date_exceeded: today
          });
        }
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        console.warn('監査ログ記録エラー (autoMarkOverdue):', msg);
      }
    }

    return { updated: updatedIds.length, invoiceIds: updatedIds };
  },

  findByStatus: function(status: string): InvoiceRecord[] {
    let records = getAllRecords(this.TABLE_NAME);

    records = records.filter(r => !r.is_deleted && r.status === status);

    return records.map(r => this._normalizeRecord(r));
  },

  updateFileIds: function(invoiceId: string, fileIds: Record<string, string>): InvoiceUpdateResult {
    const current = this.findById(invoiceId);
    if (!current) {
      return { success: false, error: 'NOT_FOUND' };
    }

    const updateData: Record<string, unknown> = {
      invoice_id: invoiceId,
      ...fileIds
    };

    return this.update(updateData, current.updated_at);
  },

  getMaxUpdatedAt: function(year: number, month: number): string | null {
    const invoices = this.findByPeriod(year, month);

    if (invoices.length === 0) {
      return null;
    }

    return invoices.reduce((max: string, inv) => {
      return inv.updated_at > max ? inv.updated_at : max;
    }, invoices[0].updated_at);
  },

  _normalizeRecord: function(record: Record<string, unknown>): InvoiceRecord {
    return {
      ...record,
      issue_date: this._normalizeDate(record.issue_date),
      due_date: this._normalizeDate(record.due_date),
      billing_year: Number(record.billing_year) || 0,
      billing_month: Number(record.billing_month) || 0,
      subtotal: Number(record.subtotal) || 0,
      expense_amount: Number(record.expense_amount) || 0,
      tax_amount: Number(record.tax_amount) || 0,
      total_amount: Number(record.total_amount) || 0,
      adjustment_total: Number(record.adjustment_total) || 0
    } as InvoiceRecord;
  },

  _normalizeDate: function(dateValue: unknown): string {
    if (!dateValue) return '';

    if (dateValue instanceof Date) {
      return Utilities.formatDate(dateValue, 'Asia/Tokyo', 'yyyy-MM-dd');
    }

    return String(dateValue).replace(/\//g, '-');
  },

  _toBillingYm: function(year: unknown, month: unknown): string {
    if (!year || !month) return '';
    const y = Number(year);
    const m = Number(month);
    if (isNaN(y) || isNaN(m) || y < 1900 || m < 1 || m > 12) return '';
    return `${y}-${String(m).padStart(2, '0')}`;
  },

  _parseBillingYm: function(ym: unknown): { year: number; month: number } | null {
    if (!ym) return null;
    const raw = String(ym).trim();
    if (!/^\d{4}-\d{2}$/.test(raw)) return null;

    const [yearStr, monthStr] = raw.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr);
    if (!year || month < 1 || month > 12) return null;
    return { year, month };
  },

  _dedupeByInvoiceId: function(records: Record<string, unknown>[]): Record<string, unknown>[] {
    const seenIds = new Set<string>();
    return records.filter((record) => {
      const id = String(record.invoice_id || '');
      if (!id) return true;
      if (seenIds.has(id)) return false;
      seenIds.add(id);
      return true;
    });
  },

  _getArchiveRecordsForQuery: function(query: InvoiceSearchQuery): Record<string, unknown>[] {
    const targetYears = this._getArchiveFiscalYearsForQuery(query);
    // includeArchive=true でも対象年月が未指定なら全アーカイブ走査は行わない
    if (targetYears.length === 0) return [];
    return this._getArchiveRecordsByFiscalYears(targetYears);
  },

  _getArchiveFiscalYearsForQuery: function(query: InvoiceSearchQuery): number[] {
    const targetYears = new Set<number>();
    const fiscalMonthEnd = _getFiscalMonthEndFromMaster_();

    const year = Number(query.billing_year);
    const month = Number(query.billing_month);

    if (!isNaN(year) && year > 0) {
      if (!isNaN(month) && month >= 1 && month <= 12) {
        targetYears.add(getFiscalYearByEndMonth_(new Date(year, month - 1, 1), fiscalMonthEnd));
      } else {
        targetYears.add(year);
        targetYears.add(year - 1);
      }
    }

    const fromYm = this._parseBillingYm(query.billing_ym_from);
    const toYm = this._parseBillingYm(query.billing_ym_to);

    if (fromYm && toYm) {
      const fromKey = fromYm.year * 100 + fromYm.month;
      const toKey = toYm.year * 100 + toYm.month;

      if (fromKey <= toKey) {
        let currentYear = fromYm.year;
        let currentMonth = fromYm.month;

        // 月単位で会計年度を算出（異常ループ回避のガード付き）
        for (let i = 0; i < ARCHIVE_FISCAL_YEAR_SCAN_MAX_MONTHS; i++) {
          const currentKey = currentYear * 100 + currentMonth;
          if (currentKey > toKey) break;

          targetYears.add(getFiscalYearByEndMonth_(new Date(currentYear, currentMonth - 1, 1), fiscalMonthEnd));

          currentMonth++;
          if (currentMonth > 12) {
            currentMonth = 1;
            currentYear++;
          }
        }
      }
    } else {
      const singleYm = fromYm || toYm;
      if (singleYm) {
        targetYears.add(getFiscalYearByEndMonth_(new Date(singleYm.year, singleYm.month - 1, 1), fiscalMonthEnd));
      }
    }

    return Array.from(targetYears).sort((a, b) => a - b);
  },

  _getArchiveRecordsByFiscalYears: function(fiscalYears: number[]): Record<string, unknown>[] {
    const archiveRecords: Record<string, unknown>[] = [];
    const uniqueYears = Array.from(new Set(fiscalYears))
      .map(y => Number(y))
      .filter(y => !isNaN(y) && y > 0);

    for (const fiscalYear of uniqueYears) {
      const archiveDbId = ArchiveService.getArchiveDbId(fiscalYear);
      if (!archiveDbId) continue;

      try {
        const archiveDb = SpreadsheetApp.openById(archiveDbId);
        const sheet = findSheetFromDb(archiveDb, this.TABLE_NAME);
        if (!sheet) continue;

        const data = sheet.getDataRange().getValues();
        if (data.length <= 1) continue;

        const headers = data[0] as string[];

        for (let i = 1; i < data.length; i++) {
          const record: Record<string, unknown> = {};
          for (let j = 0; j < headers.length; j++) {
            record[headers[j]] = data[i][j];
          }
          record._archived = true;
          record._archiveFiscalYear = fiscalYear;
          archiveRecords.push(record);
        }
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        Logger.log(`アーカイブDB読み込みエラー (${fiscalYear}): ${msg}`);
      }
    }

    return archiveRecords;
  },

  _getArchiveRecords: function(year: number, month: number | null | undefined): Record<string, unknown>[] {
    const targetYears: number[] = [];
    if (month) {
      const fiscalYear = getFiscalYearByEndMonth_(new Date(year, month - 1, 1), _getFiscalMonthEndFromMaster_());
      targetYears.push(fiscalYear);
    } else {
      targetYears.push(year);
      targetYears.push(year - 1);
    }
    return this._getArchiveRecordsByFiscalYears(targetYears);
  },

  /**
   * アーカイブDBのレコードを更新（P2-5拡張）
   * @param {Object} invoice - 更新データ（invoice_id, _archived, _archiveFiscalYear必須）
   * @param {string} expectedUpdatedAt - 期待するupdated_at
   * @returns {Object} 更新結果 { success: boolean, invoice?: Object, error?: string }
   */
  _updateArchiveRecord: function(invoice: Record<string, unknown>, expectedUpdatedAt?: string): InvoiceUpdateResult {
    const fiscalYear = Number(invoice._archiveFiscalYear);
    const archiveDbId = ArchiveService.getArchiveDbId(fiscalYear);

    if (!archiveDbId) {
      return { success: false, error: `${fiscalYear}年度のアーカイブDBが見つかりません。` };
    }

    try {
      const archiveDb = SpreadsheetApp.openById(archiveDbId);
      const sheetName = TABLE_SHEET_MAP[this.TABLE_NAME] || this.TABLE_NAME;
      const sheet = archiveDb.getSheetByName(sheetName);

      if (!sheet) {
        return { success: false, error: `アーカイブDBに${sheetName}シートが見つかりません。` };
      }

      const headers = getHeaders(sheet);
      const idColIndex = headers.indexOf(this.ID_COLUMN);
      const updatedAtColIndex = headers.indexOf('updated_at');

      if (idColIndex === -1) {
        return { success: false, error: 'アーカイブDBのスキーマが不正です。' };
      }

      // IDで行を検索
      const lastRow = sheet.getLastRow();
      if (lastRow <= 1) {
        return { success: false, error: 'NOT_FOUND' };
      }

      const data = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
      let targetRowIndex = -1;
      let currentRecord: Record<string, unknown> | null = null;

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
      if (expectedUpdatedAt && currentRecord && currentRecord.updated_at !== expectedUpdatedAt) {
        return {
          success: false,
          error: 'CONFLICT_ERROR',
          currentUpdatedAt: currentRecord.updated_at as string
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
        'adjustment_total',
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
      const result = this._normalizeRecord(updatedInvoice) as InvoiceRecord & { _archived?: boolean; _archiveFiscalYear?: number };
      result._archived = true;
      result._archiveFiscalYear = fiscalYear;

      return {
        success: true,
        invoice: result,
        before: currentRecord ?? undefined
      };

    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Logger.log(`アーカイブDB更新エラー: ${msg}`);
      return { success: false, error: msg };
    }
  },

  /**
   * アーカイブDBからIDで請求書を検索（P2-5: findById拡張）
   * @param {string} invoiceId - 請求ID
   * @returns {Object|null} 請求書レコード（_archived, _archiveFiscalYear付き）またはnull
   */
  _findInArchive: function(invoiceId: string): InvoiceRecord | null {
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
            const record: Record<string, unknown> = {};
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
        const msg = e instanceof Error ? e.message : String(e);
        Logger.log(`アーカイブDB検索エラー (${y}): ${msg}`);
      }
    }

    return null;
  }
};
