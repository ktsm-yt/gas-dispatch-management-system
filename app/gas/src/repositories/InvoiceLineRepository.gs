/**
 * Invoice Line Repository
 *
 * T_InvoiceLines テーブルのシートI/O処理
 */

const InvoiceLineRepository = {
  TABLE_NAME: 'T_InvoiceLines',
  ID_COLUMN: 'line_id',

  /**
   * IDで明細を取得
   * @param {string} lineId - 明細ID
   * @returns {Object|null} 明細レコードまたはnull
   */
  findById: function(lineId) {
    const record = getRecordById(this.TABLE_NAME, this.ID_COLUMN, lineId);
    if (!record) return null;

    return this._normalizeRecord(record);
  },

  /**
   * 請求IDで明細を取得
   * @param {string} invoiceId - 請求ID
   * @returns {Object[]} 明細配列（line_number順）
   */
  findByInvoiceId: function(invoiceId) {
    let records = getAllRecords(this.TABLE_NAME);

    records = records.filter(r =>
      !r.is_deleted && r.invoice_id === invoiceId
    );

    // 行番号順でソート
    records.sort((a, b) => {
      const numA = Number(a.line_number) || 0;
      const numB = Number(b.line_number) || 0;
      return numA - numB;
    });

    return records.map(r => this._normalizeRecord(r));
  },

  /**
   * 案件IDで明細を検索
   * @param {string} jobId - 案件ID
   * @returns {Object[]} 明細配列
   */
  findByJobId: function(jobId) {
    let records = getAllRecords(this.TABLE_NAME);

    records = records.filter(r =>
      !r.is_deleted && r.job_id === jobId
    );

    return records.map(r => this._normalizeRecord(r));
  },

  /**
   * 配置IDで明細を検索
   * @param {string} assignmentId - 配置ID
   * @returns {Object[]} 明細配列
   */
  findByAssignmentId: function(assignmentId) {
    let records = getAllRecords(this.TABLE_NAME);

    records = records.filter(r =>
      !r.is_deleted && r.assignment_id === assignmentId
    );

    return records.map(r => this._normalizeRecord(r));
  },

  /**
   * 新規明細を作成
   * @param {Object} line - 明細データ
   * @returns {Object} 作成した明細
   */
  insert: function(line) {
    const now = getCurrentTimestamp();

    const newLine = {
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

  /**
   * 複数明細を一括挿入
   * @param {Object[]} lines - 明細配列
   * @returns {Object[]} 挿入した明細配列
   */
  bulkInsert: function(lines) {
    if (!lines || lines.length === 0) {
      return [];
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

    return newLines;
  },

  /**
   * 明細を更新
   * @param {Object} line - 更新データ（line_id必須）
   * @returns {Object} 更新結果 { success: boolean, line?: Object, error?: string }
   */
  update: function(line) {
    if (!line.line_id) {
      return { success: false, error: 'line_id is required' };
    }

    const sheet = getSheet(this.TABLE_NAME);
    const rowNum = findRowById(sheet, this.ID_COLUMN, line.line_id);

    if (!rowNum) {
      return { success: false, error: 'NOT_FOUND' };
    }

    const headers = getHeaders(sheet);
    const currentRow = sheet.getRange(rowNum, 1, 1, headers.length).getValues()[0];
    const currentLine = rowToObject(headers, currentRow);

    // 論理削除済みチェック
    if (currentLine.is_deleted) {
      return { success: false, error: 'NOT_FOUND' };
    }

    const now = getCurrentTimestamp();

    // 更新可能フィールド（ホワイトリスト）
    const updatableFields = [
      'line_number', 'work_date', 'site_name', 'item_name', 'time_note',
      'quantity', 'unit', 'unit_price', 'amount',
      'order_number', 'branch_office', 'construction_div',
      'supervisor_name', 'property_code', 'tax_amount'
    ];

    const updatedLine = { ...currentLine };

    for (const field of updatableFields) {
      if (line[field] !== undefined) {
        updatedLine[field] = line[field];
      }
    }

    updatedLine.updated_at = now;

    const newRow = objectToRow(headers, updatedLine);
    sheet.getRange(rowNum, 1, 1, headers.length).setValues([newRow]);

    return {
      success: true,
      line: this._normalizeRecord(updatedLine)
    };
  },

  /**
   * 複数明細を一括更新
   * @param {Object[]} lines - 更新データ配列（各要素にline_id必須）
   * @returns {Object} 更新結果 { success: boolean, updated: number, errors: string[] }
   */
  bulkUpdate: function(lines) {
    if (!lines || lines.length === 0) {
      return { success: true, updated: 0, errors: [] };
    }

    const errors = [];
    let updated = 0;

    for (const line of lines) {
      const result = this.update(line);
      if (result.success) {
        updated++;
      } else {
        errors.push(`${line.line_id}: ${result.error}`);
      }
    }

    return {
      success: errors.length === 0,
      updated,
      errors
    };
  },

  /**
   * 請求IDに紐づく明細を全て論理削除
   * @param {string} invoiceId - 請求ID
   * @returns {Object} 削除結果 { success: boolean, deleted: number }
   */
  deleteByInvoiceId: function(invoiceId) {
    const lines = this.findByInvoiceId(invoiceId);

    if (lines.length === 0) {
      return { success: true, deleted: 0 };
    }

    const sheet = getSheet(this.TABLE_NAME);
    const headers = getHeaders(sheet);
    const now = getCurrentTimestamp();

    let deleted = 0;

    for (const line of lines) {
      const rowNum = findRowById(sheet, this.ID_COLUMN, line.line_id);
      if (rowNum) {
        const currentRow = sheet.getRange(rowNum, 1, 1, headers.length).getValues()[0];
        const currentLine = rowToObject(headers, currentRow);

        currentLine.is_deleted = true;
        currentLine.updated_at = now;

        const newRow = objectToRow(headers, currentLine);
        sheet.getRange(rowNum, 1, 1, headers.length).setValues([newRow]);
        deleted++;
      }
    }

    return { success: true, deleted };
  },

  /**
   * 明細の行番号を再採番
   * @param {string} invoiceId - 請求ID
   * @returns {Object} 結果 { success: boolean, reordered: number }
   */
  reorderLines: function(invoiceId) {
    const lines = this.findByInvoiceId(invoiceId);

    if (lines.length === 0) {
      return { success: true, reordered: 0 };
    }

    // 作業日順、現場名順でソート後に番号振り直し
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

    const sheet = getSheet(this.TABLE_NAME);
    const headers = getHeaders(sheet);
    const now = getCurrentTimestamp();

    let reordered = 0;

    for (let i = 0; i < lines.length; i++) {
      const newLineNumber = i + 1;
      if (lines[i].line_number !== newLineNumber) {
        const rowNum = findRowById(sheet, this.ID_COLUMN, lines[i].line_id);
        if (rowNum) {
          const currentRow = sheet.getRange(rowNum, 1, 1, headers.length).getValues()[0];
          const currentLine = rowToObject(headers, currentRow);

          currentLine.line_number = newLineNumber;
          currentLine.updated_at = now;

          const newRow = objectToRow(headers, currentLine);
          sheet.getRange(rowNum, 1, 1, headers.length).setValues([newRow]);
          reordered++;
        }
      }
    }

    return { success: true, reordered };
  },

  /**
   * 請求IDの明細合計を計算
   * @param {string} invoiceId - 請求ID
   * @returns {Object} 合計 { subtotal, taxAmount, totalAmount, lineCount }
   */
  calculateTotals: function(invoiceId) {
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

  /**
   * レコードを正規化
   * @param {Object} record - レコード
   * @returns {Object} 正規化されたレコード
   */
  _normalizeRecord: function(record) {
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
   * 日付を正規化してYYYY-MM-DD形式の文字列に変換
   * @param {Date|string} dateValue - 日付値
   * @returns {string} 正規化された日付文字列
   */
  _normalizeDate: function(dateValue) {
    if (!dateValue) return '';

    if (dateValue instanceof Date) {
      return Utilities.formatDate(dateValue, 'Asia/Tokyo', 'yyyy-MM-dd');
    }

    // 文字列の場合はスラッシュをハイフンに変換
    return String(dateValue).replace(/\//g, '-');
  }
};
