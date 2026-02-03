/**
 * Invoice Line Repository
 *
 * T_InvoiceLines テーブルのシートI/O処理
 */

const InvoiceLineRepository = {
  TABLE_NAME: 'T_InvoiceLines',
  ID_COLUMN: 'line_id',

  /**
   * 明細データのバリデーション
   * @param {Object} line - 明細データ
   * @returns {Object} { valid: boolean, errors: string[] }
   */
  validateLine: function(line) {
    const errors = [];

    // 必須項目チェック
    if (!line.invoice_id) {
      errors.push('invoice_id は必須です');
    }
    if (!line.site_name && line.site_name !== '') {
      // 空文字は許可（頭紙の場合など）
    }
    if (!line.item_name) {
      errors.push('item_name（品目）は必須です');
    }

    // 数値チェック
    const quantity = Number(line.quantity) || 0;
    const unitPrice = Number(line.unit_price) || 0;
    const amount = Number(line.amount) || 0;

    if (quantity < 0) {
      errors.push('quantity（数量）は0以上である必要があります');
    }
    if (unitPrice < 0) {
      errors.push('unit_price（単価）は0以上である必要があります');
    }

    // 金額整合性チェック（quantity × unit_price = amount）
    // 小数点以下の誤差を考慮して1円未満の差は許容
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

  /**
   * 複数明細データのバリデーション
   * @param {Object[]} lines - 明細データ配列
   * @returns {Object} { valid: boolean, errors: { lineNumber: number, errors: string[] }[] }
   */
  validateLines: function(lines) {
    const allErrors = [];

    for (let i = 0; i < lines.length; i++) {
      const result = this.validateLine(lines[i]);
      if (!result.valid) {
        allErrors.push({
          lineNumber: lines[i].line_number || (i + 1),
          errors: result.errors
        });
      }
    }

    return {
      valid: allErrors.length === 0,
      errors: allErrors
    };
  },

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
   * 複数明細を一括挿入（バリデーション付き）
   * @param {Object[]} lines - 明細配列
   * @param {Object} options - オプション { skipValidation: false }
   * @returns {Object} { success: boolean, lines?: Object[], errors?: Object[] }
   */
  bulkInsert: function(lines, options = {}) {
    if (!lines || lines.length === 0) {
      return { success: true, lines: [] };
    }

    // バリデーション実行（skipValidation: true で省略可）
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

  /**
   * 明細を更新（バリデーション付き）
   * @param {Object} line - 更新データ（line_id必須）
   * @param {Object} options - オプション { skipValidation: false }
   * @returns {Object} 更新結果 { success: boolean, line?: Object, error?: string }
   */
  update: function(line, options = {}) {
    if (!line.line_id) {
      return { success: false, error: 'line_id is required' };
    }

    // バリデーション実行（skipValidation: true で省略可）
    // 更新時は部分更新の可能性があるため、金額整合性のみチェック
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
   * 複数明細を一括更新（バルク処理版）
   * @param {Object[]} lines - 更新データ配列（各要素にline_id必須）
   * @returns {Object} 更新結果 { success: boolean, updated: number, errors: string[] }
   */
  bulkUpdate: function(lines) {
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

    // 1. 全データを一括読み込み
    const dataRange = sheet.getRange(2, 1, lastRow - 1, headers.length);
    const allData = dataRange.getValues();

    // 2. カラムインデックスを取得
    const idIndex = headers.indexOf(this.ID_COLUMN);
    const isDeletedIndex = headers.indexOf('is_deleted');
    const updatedAtIndex = headers.indexOf('updated_at');

    // 更新可能フィールドのインデックスマップ
    const updatableFields = [
      'line_number', 'work_date', 'site_name', 'item_name', 'time_note',
      'quantity', 'unit', 'unit_price', 'amount',
      'order_number', 'branch_office', 'construction_div',
      'supervisor_name', 'property_code', 'tax_amount'
    ];
    const fieldIndexMap = {};
    for (const field of updatableFields) {
      const idx = headers.indexOf(field);
      if (idx !== -1) {
        fieldIndexMap[field] = idx;
      }
    }

    // 3. 更新対象のMapを作成 (line_id -> line data)
    const updateMap = new Map(lines.map(l => [l.line_id, l]));

    const now = getCurrentTimestamp();
    const errors = [];
    let updated = 0;
    let hasChanges = false;

    // 4. メモリ上でデータを更新
    for (let i = 0; i < allData.length; i++) {
      const row = allData[i];
      const lineId = row[idIndex];

      if (!updateMap.has(lineId)) continue;

      const lineData = updateMap.get(lineId);

      // 論理削除済みチェック
      if (isDeletedIndex !== -1 && row[isDeletedIndex] === true) {
        errors.push(`${lineId}: DELETED`);
        updateMap.delete(lineId);
        continue;
      }

      // フィールドを更新
      for (const field of updatableFields) {
        if (lineData[field] !== undefined && fieldIndexMap[field] !== undefined) {
          row[fieldIndexMap[field]] = lineData[field];
        }
      }

      // updated_atを更新
      if (updatedAtIndex !== -1) {
        row[updatedAtIndex] = now;
      }

      hasChanges = true;
      updated++;
      updateMap.delete(lineId);
    }

    // 5. 見つからなかったIDをエラーとして追加
    for (const [lineId] of updateMap) {
      errors.push(`${lineId}: NOT_FOUND`);
    }

    // 6. 変更があれば一括書き込み
    if (hasChanges) {
      dataRange.setValues(allData);
    }

    return {
      success: errors.length === 0,
      updated,
      errors
    };
  },

  /**
   * 請求IDに紐づく明細を全て論理削除
   * 内部でbulkDeleteByInvoiceIdsを使用して一括処理
   * @param {string} invoiceId - 請求ID
   * @returns {Object} 削除結果 { success: boolean, deleted: number }
   */
  deleteByInvoiceId: function(invoiceId) {
    return this.bulkDeleteByInvoiceIds([invoiceId]);
  },

  /**
   * 複数請求IDに紐づく明細を一括論理削除（最適化版）
   * @param {string[]} invoiceIds - 請求ID配列
   * @returns {Object} 削除結果 { success: boolean, deleted: number }
   */
  bulkDeleteByInvoiceIds: function(invoiceIds) {
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
   * 明細の行番号を再採番（バルク処理版）
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

    // 新しい行番号のマップを作成 (line_id -> newLineNumber)
    const lineNumberMap = new Map();
    for (let i = 0; i < lines.length; i++) {
      const newLineNumber = i + 1;
      if (lines[i].line_number !== newLineNumber) {
        lineNumberMap.set(lines[i].line_id, newLineNumber);
      }
    }

    // 変更が必要な行がなければ早期リターン
    if (lineNumberMap.size === 0) {
      return { success: true, reordered: 0 };
    }

    const sheet = getSheet(this.TABLE_NAME);
    const headers = getHeaders(sheet);
    const lastRow = sheet.getLastRow();

    if (lastRow <= 1) {
      return { success: true, reordered: 0 };
    }

    // 1. 全データを一括読み込み
    const dataRange = sheet.getRange(2, 1, lastRow - 1, headers.length);
    const allData = dataRange.getValues();

    // 2. カラムインデックスを取得
    const idIndex = headers.indexOf(this.ID_COLUMN);
    const lineNumberIndex = headers.indexOf('line_number');
    const updatedAtIndex = headers.indexOf('updated_at');

    const now = getCurrentTimestamp();
    let reordered = 0;
    let hasChanges = false;

    // 3. メモリ上でデータを更新
    for (let i = 0; i < allData.length; i++) {
      const row = allData[i];
      const lineId = row[idIndex];

      if (lineNumberMap.has(lineId)) {
        row[lineNumberIndex] = lineNumberMap.get(lineId);
        if (updatedAtIndex !== -1) {
          row[updatedAtIndex] = now;
        }
        hasChanges = true;
        reordered++;
      }
    }

    // 4. 変更があれば一括書き込み
    if (hasChanges) {
      dataRange.setValues(allData);
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
      time_note: this._normalizeTime(record.time_note),
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
  },

  /**
   * 時刻を正規化してHH:mm形式の文字列に変換
   * スプレッドシートは "08:00" を時刻型に自動変換することがある
   * @param {Date|string|number} timeValue - 時刻値
   * @returns {string} 正規化された時刻文字列
   */
  _normalizeTime: function(timeValue) {
    // null/undefined/空文字はそのまま空文字を返す
    if (timeValue === null || timeValue === undefined || timeValue === '') {
      return '';
    }

    try {
      // Date型の場合（スプレッドシートの時刻セル）
      if (timeValue instanceof Date) {
        return Utilities.formatDate(timeValue, 'Asia/Tokyo', 'HH:mm');
      }

      // 数値型の場合（スプレッドシートの時刻は0〜1の小数）
      if (typeof timeValue === 'number') {
        const totalMinutes = Math.round(timeValue * 24 * 60);
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        // padStartの代わりに手動でゼロパディング
        const hh = hours < 10 ? '0' + hours : String(hours);
        const mm = minutes < 10 ? '0' + minutes : String(minutes);
        return hh + ':' + mm;
      }

      // 既に文字列の場合はそのまま返す
      return String(timeValue);
    } catch (e) {
      // エラー時は空文字を返す（ログは出力）
      console.warn('_normalizeTime error:', e.message, 'value:', timeValue);
      return '';
    }
  }
};
