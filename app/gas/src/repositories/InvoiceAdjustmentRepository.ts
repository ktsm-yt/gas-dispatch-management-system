/**
 * Invoice Adjustment Repository
 *
 * 請求書の調整項目（材料費・値引きなど）のCRUD操作
 */

interface AdjustmentInput {
  adjustment_id?: string;
  item_name: string;
  amount: number;
  sort_order?: number;
  notes?: string;
}

const InvoiceAdjustmentRepository = {
  TABLE_NAME: 'T_InvoiceAdjustments',
  ID_COLUMN: 'adjustment_id',

  findByInvoiceId: function(invoiceId: string): InvoiceAdjustmentRecord[] {
    const records = getAllRecords(this.TABLE_NAME);
    const filtered = records
      .filter(r => r.invoice_id === invoiceId && !r.is_deleted)
      .map(r => this._normalizeRecord(r))
      .sort((a, b) => a.sort_order - b.sort_order);
    return filtered;
  },

  findById: function(adjustmentId: string): InvoiceAdjustmentRecord | null {
    const record = getRecordById(this.TABLE_NAME, this.ID_COLUMN, adjustmentId);
    if (!record || record.is_deleted) return null;
    return this._normalizeRecord(record);
  },

  bulkUpsert: function(invoiceId: string, adjustments: AdjustmentInput[]): { success: boolean; adjustments?: InvoiceAdjustmentRecord[]; error?: string } {
    const user = getCurrentUserEmail();
    const now = getCurrentTimestamp();

    const existing = this.findByInvoiceId(invoiceId);
    const existingIds = new Set(existing.map(r => r.adjustment_id));
    const sentIds = new Set<string>();

    const toInsert: Record<string, unknown>[] = [];
    const toUpdate: Record<string, unknown>[] = [];

    for (let i = 0; i < adjustments.length; i++) {
      const adj = adjustments[i];
      const sortOrder = adj.sort_order !== undefined ? adj.sort_order : i + 1;

      if (adj.adjustment_id && existingIds.has(adj.adjustment_id)) {
        sentIds.add(adj.adjustment_id);
        toUpdate.push({
          adjustment_id: adj.adjustment_id,
          item_name: adj.item_name,
          amount: adj.amount,
          sort_order: sortOrder,
          notes: adj.notes || '',
          updated_at: now,
          updated_by: user
        });
      } else {
        const newId = generateId('adj');
        sentIds.add(newId);
        toInsert.push({
          adjustment_id: newId,
          invoice_id: invoiceId,
          item_name: adj.item_name,
          amount: adj.amount,
          sort_order: sortOrder,
          notes: adj.notes || '',
          created_at: now,
          created_by: user,
          updated_at: now,
          updated_by: user,
          is_deleted: false,
          deleted_at: '',
          deleted_by: ''
        });
      }
    }

    // 送信されなかった既存項目を論理削除
    const toDelete = existing.filter(r => !sentIds.has(r.adjustment_id));
    for (const del of toDelete) {
      toUpdate.push({
        adjustment_id: del.adjustment_id,
        is_deleted: true,
        deleted_at: now,
        deleted_by: user,
        updated_at: now,
        updated_by: user
      });
    }

    // 一括処理（シート全体を読み取り→メモリ更新→一括書き込み）
    const sheet = getSheet(this.TABLE_NAME);
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0] as string[];

    // 既存行の更新
    if (toUpdate.length > 0 && lastRow > 1) {
      const data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
      const idCol = headers.indexOf('adjustment_id');

      const updateMap: Record<string, Record<string, unknown>> = {};
      for (const upd of toUpdate) {
        updateMap[upd.adjustment_id as string] = upd;
      }

      let modified = false;
      for (let i = 0; i < data.length; i++) {
        const rowId = data[i][idCol] as string;
        if (updateMap[rowId]) {
          const upd = updateMap[rowId];
          for (const [key, val] of Object.entries(upd)) {
            if (key === 'adjustment_id') continue;
            const colIdx = headers.indexOf(key);
            if (colIdx !== -1) {
              data[i][colIdx] = val;
              modified = true;
            }
          }
        }
      }

      if (modified) {
        sheet.getRange(2, 1, lastRow - 1, lastCol).setValues(data);
        invalidateExecutionCache(this.TABLE_NAME);
      }
    }

    // 新規行の挿入
    if (toInsert.length > 0) {
      insertRecords(this.TABLE_NAME, toInsert);
    }

    // 最新データを返す
    const result = this.findByInvoiceId(invoiceId);
    return { success: true, adjustments: result };
  },

  softDeleteByInvoiceId: function(invoiceId: string): { success: boolean; deleted: number } {
    const user = getCurrentUserEmail();
    const now = getCurrentTimestamp();

    const sheet = getSheet(this.TABLE_NAME);
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { success: true, deleted: 0 };

    const lastCol = sheet.getLastColumn();
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0] as string[];
    const data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

    const invoiceIdCol = headers.indexOf('invoice_id');
    const isDeletedCol = headers.indexOf('is_deleted');
    const deletedAtCol = headers.indexOf('deleted_at');
    const deletedByCol = headers.indexOf('deleted_by');
    const updatedAtCol = headers.indexOf('updated_at');
    const updatedByCol = headers.indexOf('updated_by');

    let deleted = 0;
    for (let i = 0; i < data.length; i++) {
      if (data[i][invoiceIdCol] === invoiceId && !data[i][isDeletedCol]) {
        data[i][isDeletedCol] = true;
        data[i][deletedAtCol] = now;
        data[i][deletedByCol] = user;
        data[i][updatedAtCol] = now;
        data[i][updatedByCol] = user;
        deleted++;
      }
    }

    if (deleted > 0) {
      sheet.getRange(2, 1, lastRow - 1, lastCol).setValues(data);
      invalidateExecutionCache(this.TABLE_NAME);
    }

    return { success: true, deleted: deleted };
  },

  copyToInvoice: function(fromInvoiceId: string, toInvoiceId: string): { success: boolean; copied: number } {
    const source = this.findByInvoiceId(fromInvoiceId);
    if (source.length === 0) return { success: true, copied: 0 };

    const user = getCurrentUserEmail();
    const now = getCurrentTimestamp();

    const newRecords = source.map(adj => ({
      adjustment_id: generateId('adj'),
      invoice_id: toInvoiceId,
      item_name: adj.item_name,
      amount: adj.amount,
      sort_order: adj.sort_order,
      notes: adj.notes || '',
      created_at: now,
      created_by: user,
      updated_at: now,
      updated_by: user,
      is_deleted: false,
      deleted_at: '',
      deleted_by: ''
    }));

    insertRecords(this.TABLE_NAME, newRecords);
    return { success: true, copied: source.length };
  },

  _normalizeRecord: function(record: Record<string, unknown>): InvoiceAdjustmentRecord {
    return {
      ...record,
      amount: Number(record.amount) || 0,
      sort_order: Number(record.sort_order) || 0,
      is_deleted: record.is_deleted === true || record.is_deleted === 'true'
    } as InvoiceAdjustmentRecord;
  }
};
