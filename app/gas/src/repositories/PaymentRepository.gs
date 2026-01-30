/**
 * Payment Repository
 *
 * T_Payments テーブルのシートI/O処理
 * 入金記録の管理（論理削除対応）
 */

const PaymentRepository = {
  TABLE_NAME: 'T_Payments',
  ID_COLUMN: 'payment_id',

  /**
   * IDで入金記録を取得
   * @param {string} paymentId - 入金ID
   * @returns {Object|null} 入金レコードまたはnull
   */
  findById: function(paymentId) {
    const record = getRecordById(this.TABLE_NAME, this.ID_COLUMN, paymentId);
    if (!record || record.is_deleted) return null;

    return this._normalizeRecord(record);
  },

  /**
   * 請求書IDで入金記録を検索
   * @param {string} invoiceId - 請求書ID
   * @returns {Object[]} 入金記録配列（削除済み除外、日付降順）
   */
  findByInvoiceId: function(invoiceId) {
    let records = getAllRecords(this.TABLE_NAME);

    records = records.filter(r =>
      !r.is_deleted &&
      r.invoice_id === invoiceId
    );

    // 入金日降順でソート（新しい順）
    records.sort((a, b) => {
      const dateA = this._parseLocalDate(a.payment_date);
      const dateB = this._parseLocalDate(b.payment_date);
      return dateB - dateA;
    });

    return records.map(r => this._normalizeRecord(r));
  },

  /**
   * 請求書IDで入金合計を取得
   * @param {string} invoiceId - 請求書ID
   * @returns {number} 入金合計額
   */
  sumByInvoiceId: function(invoiceId) {
    const records = getAllRecords(this.TABLE_NAME);

    let total = 0;
    for (const r of records) {
      if (!r.is_deleted && r.invoice_id === invoiceId) {
        total += Number(r.amount) || 0;
      }
    }

    return total;
  },

  /**
   * 複数の請求書IDで入金合計を一括取得（パフォーマンス最適化）
   * @param {string[]} invoiceIds - 請求書ID配列
   * @returns {Map<string, number>} 請求書ID → 入金合計のMap
   */
  sumByInvoiceIds: function(invoiceIds) {
    if (!invoiceIds || invoiceIds.length === 0) {
      return new Map();
    }

    const idSet = new Set(invoiceIds);
    const records = getAllRecords(this.TABLE_NAME);
    const sumMap = new Map();

    // 初期化
    for (const id of invoiceIds) {
      sumMap.set(id, 0);
    }

    // 一括集計
    for (const r of records) {
      if (!r.is_deleted && idSet.has(r.invoice_id)) {
        const current = sumMap.get(r.invoice_id) || 0;
        sumMap.set(r.invoice_id, current + (Number(r.amount) || 0));
      }
    }

    return sumMap;
  },

  /**
   * 新規入金記録を作成
   * @param {Object} payment - 入金データ
   * @returns {Object} 作成した入金記録
   */
  create: function(payment) {
    const user = getCurrentUserEmail();
    const now = getCurrentTimestamp();

    const newPayment = {
      payment_id: payment.payment_id || generateId('pmt'),
      invoice_id: payment.invoice_id,
      payment_date: payment.payment_date || now.split('T')[0],
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

  /**
   * 論理削除
   * @param {string} paymentId - 入金ID
   * @param {string} deletedBy - 削除者（省略時は現在ユーザー）
   * @returns {Object} 削除結果 { success: boolean, error?: string }
   */
  softDelete: function(paymentId, deletedBy) {
    const sheet = getSheet(this.TABLE_NAME);
    const rowNum = findRowById(sheet, this.ID_COLUMN, paymentId);

    if (!rowNum) {
      return { success: false, error: 'NOT_FOUND' };
    }

    const headers = getHeaders(sheet);
    const currentRow = sheet.getRange(rowNum, 1, 1, headers.length).getValues()[0];
    const currentPayment = rowToObject(headers, currentRow);

    // 既に削除済みチェック
    if (currentPayment.is_deleted) {
      return { success: false, error: 'ALREADY_DELETED' };
    }

    const user = deletedBy || getCurrentUserEmail();
    const now = getCurrentTimestamp();

    // 論理削除フラグを設定
    const updatedPayment = {
      ...currentPayment,
      is_deleted: true,
      deleted_at: now,
      deleted_by: user
    };

    const newRow = objectToRow(headers, updatedPayment);
    sheet.getRange(rowNum, 1, 1, headers.length).setValues([newRow]);

    return {
      success: true,
      payment: this._normalizeRecord(updatedPayment),
      before: currentPayment
    };
  },

  /**
   * 入金記録を検索
   * @param {Object} query - 検索条件
   * @param {string} query.invoice_id - 請求書ID
   * @param {string} query.payment_method - 入金方法
   * @param {string} query.payment_date_from - 入金日（以降）
   * @param {string} query.payment_date_to - 入金日（以前）
   * @param {boolean} query.include_deleted - 削除済みを含む
   * @param {number} query.limit - 取得件数制限
   * @returns {Object[]} 入金記録配列
   */
  search: function(query = {}) {
    let records = getAllRecords(this.TABLE_NAME);

    // 論理削除除外（デフォルト）
    if (!query.include_deleted) {
      records = records.filter(r => !r.is_deleted);
    }

    // 請求書IDで絞り込み
    if (query.invoice_id) {
      records = records.filter(r => r.invoice_id === query.invoice_id);
    }

    // 入金方法で絞り込み
    if (query.payment_method) {
      records = records.filter(r => r.payment_method === query.payment_method);
    }

    // 入金日（以降）で絞り込み
    if (query.payment_date_from) {
      const fromDate = this._parseLocalDate(query.payment_date_from);
      records = records.filter(r => {
        const paymentDate = this._parseLocalDate(r.payment_date);
        return paymentDate && paymentDate >= fromDate;
      });
    }

    // 入金日（以前）で絞り込み
    if (query.payment_date_to) {
      const toDate = this._parseLocalDate(query.payment_date_to);
      records = records.filter(r => {
        const paymentDate = this._parseLocalDate(r.payment_date);
        return paymentDate && paymentDate <= toDate;
      });
    }

    // 入金日降順でソート
    records.sort((a, b) => {
      const dateA = this._parseLocalDate(a.payment_date);
      const dateB = this._parseLocalDate(b.payment_date);
      return dateB - dateA;
    });

    // 件数制限
    if (query.limit && query.limit > 0) {
      records = records.slice(0, query.limit);
    }

    return records.map(r => this._normalizeRecord(r));
  },

  /**
   * レコードを正規化
   * @param {Object} record - レコード
   * @returns {Object} 正規化されたレコード
   */
  _normalizeRecord: function(record) {
    return {
      ...record,
      payment_date: this._normalizeDate(record.payment_date),
      amount: Number(record.amount) || 0,
      is_deleted: Boolean(record.is_deleted)
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
   * 日付文字列をローカルタイムゾーンでパース（UTC解釈回避）
   * @param {string} dateStr - 日付文字列（YYYY-MM-DD形式）
   * @returns {Date|null} パースされた日付またはnull
   */
  _parseLocalDate: function(dateStr) {
    if (!dateStr) return null;

    const normalized = this._normalizeDate(dateStr);
    if (!normalized) return null;

    const parts = normalized.split('-');
    if (parts.length !== 3) return new Date(dateStr); // フォールバック

    const [y, m, d] = parts.map(Number);
    return new Date(y, m - 1, d); // ローカルタイムゾーンで作成
  }
};
