/**
 * Payment Repository
 *
 * T_Payments テーブルのシートI/O処理
 * 入金記録の管理（論理削除対応）
 */

interface PaymentSearchQuery {
  invoice_id?: string;
  payment_method?: string;
  payment_date_from?: string;
  payment_date_to?: string;
  include_deleted?: boolean;
  limit?: number;
}

interface PaymentDeleteResult {
  success: boolean;
  error?: string;
  payment?: PaymentRecord;
  before?: Record<string, unknown>;
}

const PaymentRepository = {
  TABLE_NAME: 'T_Payments',
  ID_COLUMN: 'payment_id',

  findById: function(paymentId: string): PaymentRecord | null {
    const record = getRecordById(this.TABLE_NAME, this.ID_COLUMN, paymentId);
    if (!record || record.is_deleted) return null;

    return this._normalizeRecord(record);
  },

  findByInvoiceId: function(invoiceId: string): PaymentRecord[] {
    let records = getAllRecords(this.TABLE_NAME);

    records = records.filter(r =>
      !r.is_deleted &&
      r.invoice_id === invoiceId
    );

    // 入金日降順でソート（新しい順）
    records.sort((a, b) => {
      const dateA = this._parseLocalDate(a.payment_date as string);
      const dateB = this._parseLocalDate(b.payment_date as string);
      return (dateB?.getTime() ?? 0) - (dateA?.getTime() ?? 0);
    });

    return records.map(r => this._normalizeRecord(r));
  },

  sumByInvoiceId: function(invoiceId: string): number {
    const records = getAllRecords(this.TABLE_NAME);

    let total = 0;
    for (const r of records) {
      if (!r.is_deleted && r.invoice_id === invoiceId) {
        total += Number(r.amount) || 0;
      }
    }

    return total;
  },

  sumByInvoiceIds: function(invoiceIds: string[]): Map<string, number> {
    if (!invoiceIds || invoiceIds.length === 0) {
      return new Map();
    }

    const idSet = new Set(invoiceIds);
    const records = getAllRecords(this.TABLE_NAME);
    const sumMap = new Map<string, number>();

    for (const id of invoiceIds) {
      sumMap.set(id, 0);
    }

    for (const r of records) {
      if (!r.is_deleted && idSet.has(r.invoice_id as string)) {
        const current = sumMap.get(r.invoice_id as string) || 0;
        sumMap.set(r.invoice_id as string, current + (Number(r.amount) || 0));
      }
    }

    return sumMap;
  },

  create: function(payment: Record<string, unknown>): PaymentRecord {
    const user = getCurrentUserEmail();
    const now = getCurrentTimestamp();

    const newPayment: Record<string, unknown> = {
      payment_id: payment.payment_id || generateId('pmt'),
      invoice_id: payment.invoice_id,
      payment_date: payment.payment_date || (now as string).split('T')[0],
      amount: payment.amount || 0,
      payment_method: payment.payment_method || 'bank_transfer',
      bank_ref: payment.bank_ref || '',
      notes: payment.notes || '',
      is_deleted: false,
      created_at: now,
      created_by: user,
      deleted_at: '',
      deleted_by: ''
    };

    insertRecord(this.TABLE_NAME, newPayment);

    return this._normalizeRecord(newPayment);
  },

  softDelete: function(paymentId: string, deletedBy?: string): PaymentDeleteResult {
    const sheet = getSheet(this.TABLE_NAME);
    const rowNum = findRowById(sheet, this.ID_COLUMN, paymentId);

    if (!rowNum) {
      return { success: false, error: 'NOT_FOUND' };
    }

    const headers = getHeaders(sheet);
    const currentRow = sheet.getRange(rowNum, 1, 1, headers.length).getValues()[0];
    const currentPayment = rowToObject(headers, currentRow);

    if (currentPayment.is_deleted) {
      return { success: false, error: 'ALREADY_DELETED' };
    }

    const user = deletedBy || getCurrentUserEmail();
    const now = getCurrentTimestamp();

    const updatedPayment: Record<string, unknown> = {
      ...currentPayment,
      is_deleted: true,
      deleted_at: now,
      deleted_by: user
    };

    const newRow = objectToRow(headers, updatedPayment);
    sheet.getRange(rowNum, 1, 1, headers.length).setValues([newRow]);
    invalidateExecutionCache(this.TABLE_NAME);

    return {
      success: true,
      payment: this._normalizeRecord(updatedPayment),
      before: currentPayment
    };
  },

  search: function(query: PaymentSearchQuery = {}): PaymentRecord[] {
    let records = getAllRecords(this.TABLE_NAME);

    if (!query.include_deleted) {
      records = records.filter(r => !r.is_deleted);
    }

    if (query.invoice_id) {
      records = records.filter(r => r.invoice_id === query.invoice_id);
    }

    if (query.payment_method) {
      records = records.filter(r => r.payment_method === query.payment_method);
    }

    if (query.payment_date_from) {
      const fromDate = this._parseLocalDate(query.payment_date_from);
      records = records.filter(r => {
        const paymentDate = this._parseLocalDate(r.payment_date as string);
        return paymentDate && fromDate && paymentDate.getTime() >= fromDate.getTime();
      });
    }

    if (query.payment_date_to) {
      const toDate = this._parseLocalDate(query.payment_date_to);
      records = records.filter(r => {
        const paymentDate = this._parseLocalDate(r.payment_date as string);
        return paymentDate && toDate && paymentDate.getTime() <= toDate.getTime();
      });
    }

    // 入金日降順でソート
    records.sort((a, b) => {
      const dateA = this._parseLocalDate(a.payment_date as string);
      const dateB = this._parseLocalDate(b.payment_date as string);
      return (dateB?.getTime() ?? 0) - (dateA?.getTime() ?? 0);
    });

    if (query.limit && query.limit > 0) {
      records = records.slice(0, query.limit);
    }

    return records.map(r => this._normalizeRecord(r));
  },

  _normalizeRecord: function(record: Record<string, unknown>): PaymentRecord {
    return {
      ...record,
      payment_date: this._normalizeDate(record.payment_date),
      amount: Number(record.amount) || 0,
      is_deleted: Boolean(record.is_deleted)
    } as PaymentRecord;
  },

  _normalizeDate: function(dateValue: unknown): string {
    if (!dateValue) return '';

    if (dateValue instanceof Date) {
      return Utilities.formatDate(dateValue, 'Asia/Tokyo', 'yyyy-MM-dd');
    }

    return String(dateValue).replace(/\//g, '-');
  },

  _parseLocalDate: function(dateStr: string | unknown): Date | null {
    if (!dateStr) return null;

    const normalized = this._normalizeDate(dateStr);
    if (!normalized) return null;

    const parts = normalized.split('-');
    if (parts.length !== 3) return new Date(dateStr as string);

    const [y, m, d] = parts.map(Number);
    return new Date(y, m - 1, d);
  }
};
