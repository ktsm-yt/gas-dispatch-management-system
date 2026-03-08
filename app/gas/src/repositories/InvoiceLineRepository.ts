/**
 * Invoice Line Repository
 *
 * T_InvoiceLines テーブルのシートI/O処理
 */

interface LineValidationResult {
  valid: boolean;
  errors: string[];
}

interface LinesValidationResult {
  valid: boolean;
  errors: { lineNumber: number; errors: string[] }[];
}

interface BulkInsertResult {
  success: boolean;
  lines?: Record<string, unknown>[];
  error?: string;
  errors?: { lineNumber: number; errors: string[] }[];
}

interface LineUpdateResult {
  success: boolean;
  line?: InvoiceLineRecord;
  error?: string;
  errors?: string[];
}

interface BulkUpdateLinesResult {
  success: boolean;
  updated: number;
  errors: string[];
}

const InvoiceLineRepository = {
  TABLE_NAME: 'T_InvoiceLines',
  ID_COLUMN: 'line_id',

  validateLine: function(line: Record<string, unknown>): LineValidationResult {
    const errors: string[] = [];

    if (!line.invoice_id) {
      errors.push('invoice_id は必須です');
    }
    if (!line.site_name && line.site_name !== '') {
      // 空文字は許可（頭紙の場合など）
    }
    if (!line.item_name) {
      errors.push('item_name（品目）は必須です');
    }

    const quantity = Number(line.quantity) || 0;
    const unitPrice = Number(line.unit_price) || 0;
    const amount = Number(line.amount) || 0;

    if (quantity < 0) {
      errors.push('quantity（数量）は0以上である必要があります');
    }
    // CR-091: 調整行は負の単価を許可（値引き対応）
    const isAdjustmentLine = line.item_name === ADJUSTMENT_ITEM_NAME;
    if (unitPrice < 0 && !isAdjustmentLine) {
      errors.push('unit_price（単価）は0以上である必要があります');
    }

    const expectedAmount = quantity * unitPrice;
    if (Math.abs(expectedAmount - amount) >= 1) {
      errors.push(
        `金額の計算が一致しません: ${quantity} × ${unitPrice} = ${expectedAmount}（期待値）, ${amount}（実際）`
      );
    }

    return {
      valid: errors.length === 0,
      errors: errors
    };
  },

  validateLines: function(lines: Record<string, unknown>[]): LinesValidationResult {
    const allErrors: { lineNumber: number; errors: string[] }[] = [];

    for (let i = 0; i < lines.length; i++) {
      const result = this.validateLine(lines[i]);
      if (!result.valid) {
        allErrors.push({
          lineNumber: (lines[i].line_number as number) || (i + 1),
          errors: result.errors
        });
      }
    }

    return {
      valid: allErrors.length === 0,
      errors: allErrors
    };
  },

  findById: function(lineId: string): InvoiceLineRecord | null {
    const record = getRecordById(this.TABLE_NAME, this.ID_COLUMN, lineId);
    if (!record) return null;

    return this._normalizeRecord(record);
  },

  findByInvoiceId: function(invoiceId: string): InvoiceLineRecord[] {
    let records = getAllRecords(this.TABLE_NAME);

    records = records.filter(r =>
      !r.is_deleted && r.invoice_id === invoiceId
    );

    // カレントDBに見つからない場合、アーカイブDBを検索
    if (records.length === 0) {
      const archiveLines = this._findInArchiveByInvoiceId(invoiceId);
      if (archiveLines.length > 0) {
        return archiveLines;
      }
    }

    records.sort((a, b) => {
      const numA = Number(a.line_number) || 0;
      const numB = Number(b.line_number) || 0;
      return numA - numB;
    });

    return records.map(r => this._normalizeRecord(r));
  },

  findByJobId: function(jobId: string): InvoiceLineRecord[] {
    let records = getAllRecords(this.TABLE_NAME);

    records = records.filter(r =>
      !r.is_deleted && r.job_id === jobId
    );

    return records.map(r => this._normalizeRecord(r));
  },

  findByAssignmentId: function(assignmentId: string): InvoiceLineRecord[] {
    let records = getAllRecords(this.TABLE_NAME);

    records = records.filter(r =>
      !r.is_deleted && r.assignment_id === assignmentId
    );

    return records.map(r => this._normalizeRecord(r));
  },

  insert: function(line: Record<string, unknown>): Record<string, unknown> {
    const now = getCurrentTimestamp();

    const newLine: Record<string, unknown> = {
      line_id: line.line_id || generateId('line'),
      invoice_id: line.invoice_id,
      line_number: line.line_number || 1,
      work_date: line.work_date || '',
      job_id: line.job_id || '',
      assignment_id: line.assignment_id || '',
      site_name: line.site_name || '',
      item_name: line.item_name || '',
      time_note: line.time_note || '',
      quantity: line.quantity || 0,
      unit: line.unit || '人',
      unit_price: line.unit_price || 0,
      amount: line.amount || 0,
      order_number: line.order_number || '',
      branch_office: line.branch_office || '',
      construction_div: line.construction_div || '',
      supervisor_name: line.supervisor_name || '',
      property_code: line.property_code || '',
      tax_amount: line.tax_amount || 0,
      created_at: now,
      updated_at: now,
      is_deleted: false
    };

    insertRecord(this.TABLE_NAME, newLine);

    return newLine;
  },

  bulkInsert: function(lines: Record<string, unknown>[], options: { skipValidation?: boolean } = {}): BulkInsertResult {
    if (!lines || lines.length === 0) {
      return { success: true, lines: [] };
    }

    if (!options.skipValidation) {
      const validation = this.validateLines(lines);
      if (!validation.valid) {
        return {
          success: false,
          error: 'VALIDATION_ERROR',
          errors: validation.errors
        };
      }
    }

    const now = getCurrentTimestamp();

    const newLines = lines.map((line, index) => ({
      line_id: line.line_id || generateId('line'),
      invoice_id: line.invoice_id,
      line_number: line.line_number || (index + 1),
      work_date: line.work_date || '',
      job_id: line.job_id || '',
      assignment_id: line.assignment_id || '',
      site_name: line.site_name || '',
      item_name: line.item_name || '',
      time_note: line.time_note || '',
      quantity: line.quantity || 0,
      unit: line.unit || '人',
      unit_price: line.unit_price || 0,
      amount: line.amount || 0,
      order_number: line.order_number || '',
      branch_office: line.branch_office || '',
      construction_div: line.construction_div || '',
      supervisor_name: line.supervisor_name || '',
      property_code: line.property_code || '',
      tax_amount: line.tax_amount || 0,
      created_at: now,
      updated_at: now,
      is_deleted: false
    }));

    insertRecords(this.TABLE_NAME, newLines);

    return { success: true, lines: newLines };
  },

  update: function(line: Record<string, unknown>, options: { skipValidation?: boolean } = {}): LineUpdateResult {
    if (!line.line_id) {
      return { success: false, error: 'line_id is required' };
    }

    if (!options.skipValidation && line.quantity !== undefined && line.unit_price !== undefined && line.amount !== undefined) {
      const validation = this.validateLine(line);
      if (!validation.valid) {
        return {
          success: false,
          error: 'VALIDATION_ERROR',
          errors: validation.errors
        };
      }
    }

    const sheet = getSheet(this.TABLE_NAME);
    const rowNum = findRowById(sheet, this.ID_COLUMN, line.line_id as string);

    if (!rowNum) {
      return { success: false, error: 'NOT_FOUND' };
    }

    const headers = getHeaders(sheet);
    const currentRow = sheet.getRange(rowNum, 1, 1, headers.length).getValues()[0];
    const currentLine = rowToObject(headers, currentRow);

    if (currentLine.is_deleted) {
      return { success: false, error: 'NOT_FOUND' };
    }

    const now = getCurrentTimestamp();

    const updatableFields = [
      'line_number', 'work_date', 'site_name', 'item_name', 'time_note',
      'quantity', 'unit', 'unit_price', 'amount',
      'order_number', 'branch_office', 'construction_div',
      'supervisor_name', 'property_code', 'tax_amount'
    ];

    const updatedLine: Record<string, unknown> = { ...currentLine };

    for (const field of updatableFields) {
      if (line[field] !== undefined) {
        updatedLine[field] = line[field];
      }
    }

    updatedLine.updated_at = now;

    const newRow = objectToRow(headers, updatedLine);
    sheet.getRange(rowNum, 1, 1, headers.length).setValues([newRow]);
    invalidateExecutionCache('T_InvoiceLines');

    return {
      success: true,
      line: this._normalizeRecord(updatedLine)
    };
  },

  bulkUpdate: function(lines: Record<string, unknown>[]): BulkUpdateLinesResult {
    if (!lines || lines.length === 0) {
      return { success: true, updated: 0, errors: [] };
    }

    const sheet = getSheet(this.TABLE_NAME);
    const headers = getHeaders(sheet);
    const lastRow = sheet.getLastRow();

    if (lastRow <= 1) {
      return {
        success: false,
        updated: 0,
        errors: lines.map(l => `${l.line_id}: NOT_FOUND`)
      };
    }

    const dataRange = sheet.getRange(2, 1, lastRow - 1, headers.length);
    const allData = dataRange.getValues();

    const idIndex = headers.indexOf(this.ID_COLUMN);
    const isDeletedIndex = headers.indexOf('is_deleted');
    const updatedAtIndex = headers.indexOf('updated_at');

    const updatableFields = [
      'line_number', 'work_date', 'site_name', 'item_name', 'time_note',
      'quantity', 'unit', 'unit_price', 'amount',
      'order_number', 'branch_office', 'construction_div',
      'supervisor_name', 'property_code', 'tax_amount'
    ];
    const fieldIndexMap: Record<string, number> = {};
    for (const field of updatableFields) {
      const idx = headers.indexOf(field);
      if (idx !== -1) {
        fieldIndexMap[field] = idx;
      }
    }

    const updateMap = new Map<string, Record<string, unknown>>(
      lines.map(l => [l.line_id as string, l])
    );

    const now = getCurrentTimestamp();
    const errors: string[] = [];
    let updated = 0;
    let hasChanges = false;

    for (let i = 0; i < allData.length; i++) {
      const row = allData[i];
      const lineId = row[idIndex] as string;

      if (!updateMap.has(lineId)) continue;

      const lineData = updateMap.get(lineId)!;

      if (isDeletedIndex !== -1 && row[isDeletedIndex] === true) {
        errors.push(`${lineId}: DELETED`);
        updateMap.delete(lineId);
        continue;
      }

      for (const field of updatableFields) {
        if (lineData[field] !== undefined && fieldIndexMap[field] !== undefined) {
          row[fieldIndexMap[field]] = lineData[field];
        }
      }

      if (updatedAtIndex !== -1) {
        row[updatedAtIndex] = now;
      }

      hasChanges = true;
      updated++;
      updateMap.delete(lineId);
    }

    for (const [lineId] of updateMap) {
      errors.push(`${lineId}: NOT_FOUND`);
    }

    if (hasChanges) {
      dataRange.setValues(allData);
      invalidateExecutionCache('T_InvoiceLines');
    }

    return {
      success: errors.length === 0,
      updated,
      errors
    };
  },

  deleteByInvoiceId: function(invoiceId: string): { success: boolean; deleted: number } {
    return this.bulkDeleteByInvoiceIds([invoiceId]);
  },

  bulkDeleteByInvoiceIds: function(invoiceIds: string[]): { success: boolean; deleted: number } {
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
      invalidateExecutionCache('T_InvoiceLines');
    }

    return { success: true, deleted };
  },

  reorderLines: function(invoiceId: string): { success: boolean; reordered: number } {
    const lines = this.findByInvoiceId(invoiceId);

    if (lines.length === 0) {
      return { success: true, reordered: 0 };
    }

    lines.sort((a, b) => {
      const dateA = a.work_date || '';
      const dateB = b.work_date || '';
      if (dateA !== dateB) {
        return dateA < dateB ? -1 : 1;
      }
      const siteA = a.site_name || '';
      const siteB = b.site_name || '';
      return siteA.localeCompare(siteB);
    });

    const lineNumberMap = new Map<string, number>();
    for (let i = 0; i < lines.length; i++) {
      const newLineNumber = i + 1;
      if (lines[i].line_number !== newLineNumber) {
        lineNumberMap.set(lines[i].line_id, newLineNumber);
      }
    }

    if (lineNumberMap.size === 0) {
      return { success: true, reordered: 0 };
    }

    const sheet = getSheet(this.TABLE_NAME);
    const headers = getHeaders(sheet);
    const lastRow = sheet.getLastRow();

    if (lastRow <= 1) {
      return { success: true, reordered: 0 };
    }

    const dataRange = sheet.getRange(2, 1, lastRow - 1, headers.length);
    const allData = dataRange.getValues();

    const idIndex = headers.indexOf(this.ID_COLUMN);
    const lineNumberIndex = headers.indexOf('line_number');
    const updatedAtIndex = headers.indexOf('updated_at');

    const now = getCurrentTimestamp();
    let reordered = 0;
    let hasChanges = false;

    for (let i = 0; i < allData.length; i++) {
      const row = allData[i];
      const lineId = row[idIndex] as string;

      if (lineNumberMap.has(lineId)) {
        row[lineNumberIndex] = lineNumberMap.get(lineId);
        if (updatedAtIndex !== -1) {
          row[updatedAtIndex] = now;
        }
        hasChanges = true;
        reordered++;
      }
    }

    if (hasChanges) {
      dataRange.setValues(allData);
      invalidateExecutionCache('T_InvoiceLines');
    }

    return { success: true, reordered };
  },

  calculateTotals: function(invoiceId: string): { subtotal: number; taxAmount: number; totalAmount: number; lineCount: number } {
    const lines = this.findByInvoiceId(invoiceId);

    let subtotal = 0;
    let taxAmount = 0;

    for (const line of lines) {
      subtotal += Number(line.amount) || 0;
      taxAmount += Number(line.tax_amount) || 0;
    }

    return {
      subtotal: Math.floor(subtotal),
      taxAmount: Math.floor(taxAmount),
      totalAmount: Math.floor(subtotal + taxAmount),
      lineCount: lines.length
    };
  },

  _findInArchiveByInvoiceId: function(invoiceId: string): InvoiceLineRecord[] {
    const currentFiscalYear = ArchiveService.getCurrentFiscalYear();

    for (let fy = currentFiscalYear - 1; fy >= currentFiscalYear - 3; fy--) {
      try {
        const archiveDbId = ArchiveService.getArchiveDbId(fy);
        if (!archiveDbId) continue;

        const archiveDb = SpreadsheetApp.openById(archiveDbId);
        const sheet = findSheetFromDb(archiveDb, this.TABLE_NAME);
        if (!sheet) continue;

        const headers = getHeaders(sheet);
        const lastRow = sheet.getLastRow();
        if (lastRow <= 1) continue;

        const data = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
        const invoiceIdIdx = headers.indexOf('invoice_id');
        const isDeletedIdx = headers.indexOf('is_deleted');

        const lines: InvoiceLineRecord[] = [];
        for (let i = 0; i < data.length; i++) {
          if (data[i][invoiceIdIdx] === invoiceId && !data[i][isDeletedIdx]) {
            const record = rowToObject(headers, data[i]);
            const normalized = this._normalizeRecord(record);
            normalized._archived = true;
            normalized._archiveFiscalYear = fy;
            lines.push(normalized);
          }
        }

        if (lines.length > 0) {
          lines.sort((a, b) => (Number(a.line_number) || 0) - (Number(b.line_number) || 0));
          return lines;
        }
      } catch (e) {
        console.warn(`Archive DB search failed for FY${fy}:`, e);
      }
    }

    return [];
  },

  /**
   * 日付範囲で明細を検索（日別売上集計用）
   * @param startDate 'yyyy-MM-dd'
   * @param endDate 'yyyy-MM-dd'
   */
  findByDateRange: function(startDate: string, endDate: string): InvoiceLineRecord[] {
    let records = getAllRecords(this.TABLE_NAME);

    records = records.filter(r => {
      if (r.is_deleted) return false;
      const wd = this._normalizeDate(r.work_date);
      return wd >= startDate && wd <= endDate;
    });

    return records.map(r => this._normalizeRecord(r));
  },

  _normalizeRecord: function(record: Record<string, unknown>): InvoiceLineRecord {
    return {
      ...record,
      work_date: this._normalizeDate(record.work_date),
      time_note: this._normalizeTime(record.time_note),
      line_number: Number(record.line_number) || 0,
      quantity: Number(record.quantity) || 0,
      unit_price: Number(record.unit_price) || 0,
      amount: Number(record.amount) || 0,
      tax_amount: Number(record.tax_amount) || 0
    } as InvoiceLineRecord;
  },

  _normalizeDate: function(dateValue: unknown): string {
    if (!dateValue) return '';

    if (dateValue instanceof Date) {
      return Utilities.formatDate(dateValue, 'Asia/Tokyo', 'yyyy-MM-dd');
    }

    return String(dateValue).replace(/\//g, '-');
  },

  _normalizeTime: function(timeValue: unknown): string {
    if (timeValue === null || timeValue === undefined || timeValue === '') {
      return '';
    }

    try {
      if (timeValue instanceof Date) {
        return Utilities.formatDate(timeValue, 'Asia/Tokyo', 'HH:mm');
      }

      if (typeof timeValue === 'number') {
        const totalMinutes = Math.round(timeValue * 24 * 60);
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        const hh = hours < 10 ? '0' + hours : String(hours);
        const mm = minutes < 10 ? '0' + minutes : String(minutes);
        return hh + ':' + mm;
      }

      return String(timeValue);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn('_normalizeTime error:', msg, 'value:', timeValue);
      return '';
    }
  }
};
