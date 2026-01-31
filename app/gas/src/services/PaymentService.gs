/**
 * Payment Service
 *
 * 入金記録のビジネスロジック
 * - LockServiceによる排他制御
 * - 楽観ロックによる競合検出
 * - 残高計算・ステータス自動更新
 */

const PaymentService = {
  /**
   * 入金を記録
   * @param {string} invoiceId - 請求書ID
   * @param {Object} paymentData - 入金データ
   * @param {string} paymentData.payment_date - 入金日
   * @param {number} paymentData.amount - 入金額
   * @param {string} paymentData.payment_method - 入金方法（bank_transfer/cash/other）
   * @param {string} [paymentData.bank_ref] - 銀行参照番号
   * @param {string} [paymentData.notes] - 備考
   * @param {string} expectedUpdatedAt - 請求書の期待するupdated_at（楽観ロック）
   * @returns {Object} 結果 { success, payment, outstanding, newUpdatedAt, error }
   */
  recordPayment: function(invoiceId, paymentData, expectedUpdatedAt) {
    // 1. LockService で排他制御
    const lock = LockService.getScriptLock();
    try {
      const acquired = lock.tryLock(10000); // 10秒待機
      if (!acquired) {
        return { success: false, error: 'LOCK_TIMEOUT', message: '他の処理が実行中です。しばらく待ってから再試行してください。' };
      }

      // 2. 請求書取得・楽観ロック検証
      const invoice = InvoiceRepository.findById(invoiceId);
      if (!invoice) {
        return { success: false, error: 'INVOICE_NOT_FOUND', message: '請求書が見つかりません。' };
      }

      if (expectedUpdatedAt && invoice.updated_at !== expectedUpdatedAt) {
        return {
          success: false,
          error: 'CONFLICT',
          message: '他のユーザーが編集中です。画面を更新してください。',
          currentUpdatedAt: invoice.updated_at
        };
      }

      // 3. ステータスチェック（未送付の請求書には入金記録不可）
      const payableStatuses = ['sent', 'unpaid', 'paid']; // paidでも追加入金可能（過払いチェックで制御）
      if (!payableStatuses.includes(invoice.status)) {
        return {
          success: false,
          error: 'INVALID_STATUS',
          message: '送付済みの請求書のみ入金記録できます。'
        };
      }

      // 4. バリデーション
      const amount = parseFloat(paymentData.amount);
      if (isNaN(amount) || amount <= 0) {
        return { success: false, error: 'INVALID_AMOUNT', message: '入金額は0より大きい値を入力してください。' };
      }

      // 現在の入金合計を取得
      const currentPaid = PaymentRepository.sumByInvoiceId(invoiceId);
      const newTotal = currentPaid + amount;

      // 過払いチェック
      if (newTotal > invoice.total_amount) {
        const maxAllowed = invoice.total_amount - currentPaid;
        return {
          success: false,
          error: 'OVERPAYMENT_NOT_ALLOWED',
          message: `残高（¥${maxAllowed.toLocaleString()}）を超える入金はできません。`,
          maxAmount: maxAllowed
        };
      }

      // 4. 入金記録作成
      const payment = PaymentRepository.create({
        invoice_id: invoiceId,
        payment_date: paymentData.payment_date,
        amount: amount,
        payment_method: paymentData.payment_method || 'bank_transfer',
        bank_ref: paymentData.bank_ref || '',
        notes: paymentData.notes || ''
      });

      // 5. 残高判定→ステータス自動更新
      const outstanding = invoice.total_amount - newTotal;
      let newUpdatedAt = invoice.updated_at;

      if (outstanding === 0 && invoice.status !== 'paid') {
        // 全額入金→ステータスをpaidに更新
        const updateResult = InvoiceRepository.update(
          { invoice_id: invoiceId, status: 'paid' },
          invoice.updated_at
        );
        if (updateResult.success) {
          newUpdatedAt = updateResult.invoice.updated_at;
        }
      } else if (outstanding > 0 && invoice.status === 'unsent') {
        // 部分入金でもunsentの場合はsentに（送付してないと入金されないはず）
        // 実運用を考慮して、ここでは変更しない（手動でステータス管理）
      }

      // 監査ログを記録
      try {
        logCreate('T_Payments', payment.payment_id, {
          invoice_id: invoiceId,
          payment_date: paymentData.payment_date,
          amount: amount,
          payment_method: paymentData.payment_method || 'bank_transfer',
          outstanding_after: outstanding
        });
      } catch (logError) {
        console.warn('監査ログ記録エラー (recordPayment):', logError.message);
      }

      return {
        success: true,
        payment: payment,
        invoiceId: invoiceId,
        totalPaid: newTotal,
        outstanding: outstanding,
        newUpdatedAt: newUpdatedAt,
        statusUpdated: outstanding === 0
      };

    } catch (error) {
      Logger.log(`PaymentService.recordPayment error: ${error.message}`);
      return { success: false, error: 'UNEXPECTED_ERROR', message: error.message };
    } finally {
      lock.releaseLock();
    }
  },

  /**
   * 入金を削除（論理削除）
   * @param {string} paymentId - 入金ID
   * @param {string} invoiceExpectedUpdatedAt - 請求書の期待するupdated_at（楽観ロック）
   * @returns {Object} 結果 { success, outstanding, newUpdatedAt, error }
   */
  deletePayment: function(paymentId, invoiceExpectedUpdatedAt) {
    // 1. LockService で排他制御
    const lock = LockService.getScriptLock();
    try {
      const acquired = lock.tryLock(10000);
      if (!acquired) {
        return { success: false, error: 'LOCK_TIMEOUT', message: '他の処理が実行中です。しばらく待ってから再試行してください。' };
      }

      // 2. 入金記録取得
      const payment = PaymentRepository.findById(paymentId);
      if (!payment) {
        return { success: false, error: 'PAYMENT_NOT_FOUND', message: '入金記録が見つかりません。' };
      }

      // 3. 請求書取得・楽観ロック検証
      const invoice = InvoiceRepository.findById(payment.invoice_id);
      if (!invoice) {
        return { success: false, error: 'INVOICE_NOT_FOUND', message: '請求書が見つかりません。' };
      }

      if (invoiceExpectedUpdatedAt && invoice.updated_at !== invoiceExpectedUpdatedAt) {
        return {
          success: false,
          error: 'CONFLICT',
          message: '他のユーザーが編集中です。画面を更新してください。',
          currentUpdatedAt: invoice.updated_at
        };
      }

      // 4. 論理削除
      const deleteResult = PaymentRepository.softDelete(paymentId);
      if (!deleteResult.success) {
        return deleteResult;
      }

      // 5. 残高再計算
      const newTotal = PaymentRepository.sumByInvoiceId(invoice.invoice_id);
      const outstanding = invoice.total_amount - newTotal;
      let newUpdatedAt = invoice.updated_at;

      // 6. ステータス再判定
      // paid状態で入金削除→unpaidに戻す
      if (outstanding > 0 && invoice.status === 'paid') {
        const updateResult = InvoiceRepository.update(
          { invoice_id: invoice.invoice_id, status: 'unpaid' },
          invoice.updated_at
        );
        if (updateResult.success) {
          newUpdatedAt = updateResult.invoice.updated_at;
        }
      }

      // 監査ログを記録
      try {
        logDelete('T_Payments', paymentId, {
          invoice_id: payment.invoice_id,
          payment_date: payment.payment_date,
          amount: payment.amount,
          payment_method: payment.payment_method,
          outstanding_after: outstanding
        });
      } catch (logError) {
        console.warn('監査ログ記録エラー (deletePayment):', logError.message);
      }

      return {
        success: true,
        invoiceId: invoice.invoice_id,
        totalPaid: newTotal,
        outstanding: outstanding,
        newUpdatedAt: newUpdatedAt,
        statusUpdated: outstanding > 0 && invoice.status === 'paid'
      };

    } catch (error) {
      Logger.log(`PaymentService.deletePayment error: ${error.message}`);
      return { success: false, error: 'UNEXPECTED_ERROR', message: error.message };
    } finally {
      lock.releaseLock();
    }
  },

  /**
   * 請求書の入金履歴を取得
   * @param {string} invoiceId - 請求書ID
   * @returns {Object} { success, payments, totalPaid, outstanding }
   */
  getPaymentsByInvoice: function(invoiceId) {
    // 請求書取得
    const invoice = InvoiceRepository.findById(invoiceId);
    if (!invoice) {
      return { success: false, error: 'INVOICE_NOT_FOUND', message: '請求書が見つかりません。' };
    }

    // 入金履歴取得
    const payments = PaymentRepository.findByInvoiceId(invoiceId);

    // 合計計算
    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
    const outstanding = invoice.total_amount - totalPaid;

    return {
      success: true,
      invoiceId: invoiceId,
      invoiceTotal: invoice.total_amount,
      payments: payments,
      totalPaid: totalPaid,
      outstanding: outstanding,
      updatedAt: invoice.updated_at
    };
  },

  /**
   * 未回収残高を計算
   * @param {string} invoiceId - 請求書ID
   * @returns {Object} { success, totalPaid, outstanding }
   */
  calculateOutstanding: function(invoiceId) {
    const invoice = InvoiceRepository.findById(invoiceId);
    if (!invoice) {
      return { success: false, error: 'INVOICE_NOT_FOUND' };
    }

    const totalPaid = PaymentRepository.sumByInvoiceId(invoiceId);
    const outstanding = invoice.total_amount - totalPaid;

    return {
      success: true,
      invoiceId: invoiceId,
      invoiceTotal: invoice.total_amount,
      totalPaid: totalPaid,
      outstanding: outstanding
    };
  },

  /**
   * 複数請求書の入金情報を一括取得（パフォーマンス最適化）
   * @param {string[]} invoiceIds - 請求書ID配列
   * @returns {Map<string, {totalPaid: number, outstanding: number}>}
   */
  getPaymentSummaryBulk: function(invoiceIds) {
    if (!invoiceIds || invoiceIds.length === 0) {
      return new Map();
    }

    // 入金合計を一括取得
    const paidMap = PaymentRepository.sumByInvoiceIds(invoiceIds);

    return paidMap;
  }
};
