/**
 * Payment Tests
 *
 * 入金管理機能のテスト
 * TEST-001: Payment API/Repositoryのテスト
 *
 * テスト対象:
 * - PaymentRepository: CRUD、集計
 * - PaymentService: 入金記録、削除、ステータス更新
 * - API: バリデーション
 */

/**
 * 全入金テストを実行
 */
function runPaymentTests() {
  Logger.log('=== Payment Tests Start ===');

  const tests = [
    testPaymentRepository_create,
    testPaymentRepository_findById,
    testPaymentRepository_findByInvoiceId,
    testPaymentRepository_sumByInvoiceId,
    testPaymentRepository_softDelete,
    testPaymentService_recordPayment_normalCase,
    testPaymentService_recordPayment_overPaymentError,
    testPaymentService_recordPayment_invalidAmount,
    testPaymentService_deletePayment_statusRevert,
    testPaymentService_getPaymentsByInvoice
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      test();
      passed++;
      Logger.log(`✓ ${test.name} PASSED`);
    } catch (error) {
      failed++;
      Logger.log(`✗ ${test.name} FAILED: ${error.message}`);
    }
  }

  Logger.log(`=== Payment Tests Complete: ${passed} passed, ${failed} failed ===`);
  return { passed, failed };
}

// ============================================================
// テスト用ヘルパー
// ============================================================

/**
 * テスト用の請求書を作成
 */
function _createTestInvoice(totalAmount) {
  const testInvoice = {
    customer_id: 'test_customer_' + Date.now(),
    billing_year: 2026,
    billing_month: 1,
    subtotal: Math.round(totalAmount / 1.1),
    tax_amount: Math.round(totalAmount - totalAmount / 1.1),
    total_amount: totalAmount,
    invoice_format: 'format1',
    status: 'sent'  // 入金記録可能なステータス
  };

  return InvoiceRepository.insert(testInvoice);
}

/**
 * テスト用の入金記録を作成
 */
function _createTestPayment(invoiceId, amount) {
  return PaymentRepository.create({
    invoice_id: invoiceId,
    payment_date: '2026-01-15',
    amount: amount,
    payment_method: 'bank_transfer',
    bank_ref: 'TEST-' + Date.now(),
    notes: 'テスト入金'
  });
}

// ============================================================
// PaymentRepository Tests
// ============================================================

/**
 * PaymentRepository.create のテスト
 */
function testPaymentRepository_create() {
  Logger.log('--- testPaymentRepository_create ---');

  // テスト用請求書作成
  const invoice = _createTestInvoice(110000);

  // 入金記録作成
  const payment = PaymentRepository.create({
    invoice_id: invoice.invoice_id,
    payment_date: '2026-01-20',
    amount: 50000,
    payment_method: 'bank_transfer',
    bank_ref: 'REF-001',
    notes: 'テスト入金'
  });

  assert(payment.payment_id, 'create should return payment_id');
  assert(payment.payment_id.startsWith('pmt_'), 'payment_id should start with pmt_');
  assertEqual(payment.invoice_id, invoice.invoice_id, 'invoice_id should match');
  assertEqual(payment.amount, 50000, 'amount should be 50000');
  assertEqual(payment.payment_method, 'bank_transfer', 'payment_method should match');
  Logger.log(`  Create: OK (${payment.payment_id})`);

  // クリーンアップ
  PaymentRepository.softDelete(payment.payment_id);
  InvoiceRepository.softDelete(invoice.invoice_id);
}

/**
 * PaymentRepository.findById のテスト
 */
function testPaymentRepository_findById() {
  Logger.log('--- testPaymentRepository_findById ---');

  // テスト用請求書・入金作成
  const invoice = _createTestInvoice(110000);
  const created = _createTestPayment(invoice.invoice_id, 30000);

  // findById
  const found = PaymentRepository.findById(created.payment_id);
  assert(found, 'findById should return payment');
  assertEqual(found.payment_id, created.payment_id, 'payment_id should match');
  assertEqual(found.amount, 30000, 'amount should match');
  Logger.log('  FindById: OK');

  // 存在しないID
  const notFound = PaymentRepository.findById('pmt_nonexistent');
  assertEqual(notFound, null, 'nonexistent ID should return null');
  Logger.log('  FindById (nonexistent): OK');

  // クリーンアップ
  PaymentRepository.softDelete(created.payment_id);
  InvoiceRepository.softDelete(invoice.invoice_id);
}

/**
 * PaymentRepository.findByInvoiceId のテスト
 */
function testPaymentRepository_findByInvoiceId() {
  Logger.log('--- testPaymentRepository_findByInvoiceId ---');

  // テスト用請求書・複数入金作成
  const invoice = _createTestInvoice(110000);
  const payment1 = _createTestPayment(invoice.invoice_id, 30000);
  const payment2 = _createTestPayment(invoice.invoice_id, 20000);

  // findByInvoiceId
  const payments = PaymentRepository.findByInvoiceId(invoice.invoice_id);
  assert(Array.isArray(payments), 'should return array');
  assertEqual(payments.length, 2, 'should find 2 payments');
  Logger.log(`  FindByInvoiceId: OK (${payments.length} records)`);

  // クリーンアップ
  PaymentRepository.softDelete(payment1.payment_id);
  PaymentRepository.softDelete(payment2.payment_id);
  InvoiceRepository.softDelete(invoice.invoice_id);
}

/**
 * PaymentRepository.sumByInvoiceId のテスト
 */
function testPaymentRepository_sumByInvoiceId() {
  Logger.log('--- testPaymentRepository_sumByInvoiceId ---');

  // テスト用請求書・複数入金作成
  const invoice = _createTestInvoice(110000);
  const payment1 = _createTestPayment(invoice.invoice_id, 30000);
  const payment2 = _createTestPayment(invoice.invoice_id, 25000);

  // sumByInvoiceId
  const total = PaymentRepository.sumByInvoiceId(invoice.invoice_id);
  assertEqual(total, 55000, 'sum should be 55000');
  Logger.log('  SumByInvoiceId: OK');

  // クリーンアップ
  PaymentRepository.softDelete(payment1.payment_id);
  PaymentRepository.softDelete(payment2.payment_id);

  // 削除後は合計から除外
  const totalAfterDelete = PaymentRepository.sumByInvoiceId(invoice.invoice_id);
  assertEqual(totalAfterDelete, 0, 'sum after delete should be 0');
  Logger.log('  SumByInvoiceId (after delete): OK');
  InvoiceRepository.softDelete(invoice.invoice_id);
}

/**
 * PaymentRepository.softDelete のテスト
 */
function testPaymentRepository_softDelete() {
  Logger.log('--- testPaymentRepository_softDelete ---');

  // テスト用請求書・入金作成
  const invoice = _createTestInvoice(110000);
  const payment = _createTestPayment(invoice.invoice_id, 40000);

  // 削除前は取得可能
  const beforeDelete = PaymentRepository.findById(payment.payment_id);
  assert(beforeDelete, 'should find before delete');
  Logger.log('  Before delete: OK');

  // 論理削除
  const result = PaymentRepository.softDelete(payment.payment_id);
  assert(result.success, 'softDelete should succeed');
  Logger.log('  SoftDelete: OK');

  // 削除後は取得不可
  const afterDelete = PaymentRepository.findById(payment.payment_id);
  assertEqual(afterDelete, null, 'should not find after delete');
  Logger.log('  After delete: OK');

  // 二重削除はエラー
  const doubleDelete = PaymentRepository.softDelete(payment.payment_id);
  assertEqual(doubleDelete.success, false, 'double delete should fail');
  assertEqual(doubleDelete.error, 'ALREADY_DELETED', 'error should be ALREADY_DELETED');
  Logger.log('  Double delete prevention: OK');
  InvoiceRepository.softDelete(invoice.invoice_id);
}

// ============================================================
// PaymentService Tests
// ============================================================

/**
 * PaymentService.recordPayment 正常系テスト
 */
function testPaymentService_recordPayment_normalCase() {
  Logger.log('--- testPaymentService_recordPayment_normalCase ---');

  // テスト用請求書作成
  const invoice = _createTestInvoice(110000);

  // 入金記録
  const result = PaymentService.recordPayment(
    invoice.invoice_id,
    {
      payment_date: '2026-01-25',
      amount: 50000,
      payment_method: 'bank_transfer'
    },
    invoice.updated_at
  );

  assert(result.success, 'recordPayment should succeed');
  assert(result.payment, 'should return payment');
  assertEqual(result.totalPaid, 50000, 'totalPaid should be 50000');
  assertEqual(result.outstanding, 60000, 'outstanding should be 60000');
  assertEqual(result.statusUpdated, false, 'status should not be updated (partial payment)');
  Logger.log('  Partial payment: OK');

  // 全額入金でステータス更新
  const result2 = PaymentService.recordPayment(
    invoice.invoice_id,
    {
      payment_date: '2026-01-26',
      amount: 60000,
      payment_method: 'bank_transfer'
    },
    result.newUpdatedAt
  );

  assert(result2.success, 'full payment should succeed');
  assertEqual(result2.totalPaid, 110000, 'totalPaid should be 110000');
  assertEqual(result2.outstanding, 0, 'outstanding should be 0');
  assertEqual(result2.statusUpdated, true, 'status should be updated to paid');
  Logger.log('  Full payment + status update: OK');

  // クリーンアップ
  PaymentRepository.softDelete(result.payment.payment_id);
  PaymentRepository.softDelete(result2.payment.payment_id);
  InvoiceRepository.softDelete(invoice.invoice_id);
}

/**
 * PaymentService.recordPayment 過払いエラーテスト
 */
function testPaymentService_recordPayment_overPaymentError() {
  Logger.log('--- testPaymentService_recordPayment_overPaymentError ---');

  // テスト用請求書作成
  const invoice = _createTestInvoice(110000);

  // 一部入金
  const result1 = PaymentService.recordPayment(
    invoice.invoice_id,
    {
      payment_date: '2026-01-25',
      amount: 100000,
      payment_method: 'bank_transfer'
    },
    invoice.updated_at
  );
  assert(result1.success, 'first payment should succeed');

  // 過払いを試行
  const result2 = PaymentService.recordPayment(
    invoice.invoice_id,
    {
      payment_date: '2026-01-26',
      amount: 20000,  // 残り10000円なのに20000円支払い
      payment_method: 'bank_transfer'
    },
    result1.newUpdatedAt
  );

  assertEqual(result2.success, false, 'overpayment should fail');
  assertEqual(result2.error, 'OVERPAYMENT_NOT_ALLOWED', 'error should be OVERPAYMENT_NOT_ALLOWED');
  assertEqual(result2.maxAmount, 10000, 'maxAmount should be 10000');
  Logger.log('  Overpayment prevention: OK');

  // クリーンアップ
  PaymentRepository.softDelete(result1.payment.payment_id);
  InvoiceRepository.softDelete(invoice.invoice_id);
}

/**
 * PaymentService.recordPayment 無効な金額テスト
 */
function testPaymentService_recordPayment_invalidAmount() {
  Logger.log('--- testPaymentService_recordPayment_invalidAmount ---');

  // テスト用請求書作成
  const invoice = _createTestInvoice(110000);

  // ゼロ金額
  const result1 = PaymentService.recordPayment(
    invoice.invoice_id,
    {
      payment_date: '2026-01-25',
      amount: 0,
      payment_method: 'bank_transfer'
    },
    invoice.updated_at
  );
  assertEqual(result1.success, false, 'zero amount should fail');
  assertEqual(result1.error, 'INVALID_AMOUNT', 'error should be INVALID_AMOUNT');
  Logger.log('  Zero amount validation: OK');

  // 負の金額
  const result2 = PaymentService.recordPayment(
    invoice.invoice_id,
    {
      payment_date: '2026-01-25',
      amount: -1000,
      payment_method: 'bank_transfer'
    },
    invoice.updated_at
  );
  assertEqual(result2.success, false, 'negative amount should fail');
  assertEqual(result2.error, 'INVALID_AMOUNT', 'error should be INVALID_AMOUNT');
  Logger.log('  Negative amount validation: OK');

  // 文字列（parseFloatで変換不可）
  const result3 = PaymentService.recordPayment(
    invoice.invoice_id,
    {
      payment_date: '2026-01-25',
      amount: 'abc',
      payment_method: 'bank_transfer'
    },
    invoice.updated_at
  );
  assertEqual(result3.success, false, 'non-numeric amount should fail');
  assertEqual(result3.error, 'INVALID_AMOUNT', 'error should be INVALID_AMOUNT');
  Logger.log('  Non-numeric amount validation: OK');
  InvoiceRepository.softDelete(invoice.invoice_id);
}

/**
 * PaymentService.deletePayment ステータス復元テスト
 */
function testPaymentService_deletePayment_statusRevert() {
  Logger.log('--- testPaymentService_deletePayment_statusRevert ---');

  // テスト用請求書作成
  const invoice = _createTestInvoice(110000);

  // 全額入金（ステータスがpaidになる）
  const paymentResult = PaymentService.recordPayment(
    invoice.invoice_id,
    {
      payment_date: '2026-01-25',
      amount: 110000,
      payment_method: 'bank_transfer'
    },
    invoice.updated_at
  );
  assert(paymentResult.success, 'full payment should succeed');
  assert(paymentResult.statusUpdated, 'status should be updated to paid');

  // 請求書がpaidになったことを確認
  const invoiceAfterPayment = InvoiceRepository.findById(invoice.invoice_id);
  assertEqual(invoiceAfterPayment.status, 'paid', 'invoice should be paid');
  Logger.log('  Invoice status = paid: OK');

  // 入金削除
  const deleteResult = PaymentService.deletePayment(
    paymentResult.payment.payment_id,
    paymentResult.newUpdatedAt
  );
  assert(deleteResult.success, 'delete should succeed');
  assertEqual(deleteResult.outstanding, 110000, 'outstanding should be full amount');
  Logger.log('  Delete payment: OK');

  // 請求書がunpaidに戻ることを確認
  const invoiceAfterDelete = InvoiceRepository.findById(invoice.invoice_id);
  assertEqual(invoiceAfterDelete.status, 'unpaid', 'invoice should revert to unpaid');
  Logger.log('  Invoice status reverted to unpaid: OK');
  InvoiceRepository.softDelete(invoice.invoice_id);
}

/**
 * PaymentService.getPaymentsByInvoice テスト
 */
function testPaymentService_getPaymentsByInvoice() {
  Logger.log('--- testPaymentService_getPaymentsByInvoice ---');

  // テスト用請求書・入金作成
  const invoice = _createTestInvoice(110000);
  const payment1 = _createTestPayment(invoice.invoice_id, 30000);
  const payment2 = _createTestPayment(invoice.invoice_id, 40000);

  // 入金履歴取得
  const result = PaymentService.getPaymentsByInvoice(invoice.invoice_id);

  assert(result.success, 'should succeed');
  assertEqual(result.payments.length, 2, 'should have 2 payments');
  assertEqual(result.totalPaid, 70000, 'totalPaid should be 70000');
  assertEqual(result.outstanding, 40000, 'outstanding should be 40000');
  assertEqual(result.invoiceTotal, 110000, 'invoiceTotal should be 110000');
  Logger.log('  GetPaymentsByInvoice: OK');

  // 存在しない請求書
  const notFoundResult = PaymentService.getPaymentsByInvoice('inv_nonexistent');
  assertEqual(notFoundResult.success, false, 'nonexistent invoice should fail');
  assertEqual(notFoundResult.error, 'INVOICE_NOT_FOUND', 'error should be INVOICE_NOT_FOUND');
  Logger.log('  GetPaymentsByInvoice (not found): OK');

  // クリーンアップ
  PaymentRepository.softDelete(payment1.payment_id);
  PaymentRepository.softDelete(payment2.payment_id);
  InvoiceRepository.softDelete(invoice.invoice_id);
}

// ============================================================
// テストヘルパー関数（test_utils.gsと重複しない場合の定義）
// ============================================================

// assert, assertEqual は test_utils.gs で定義済み
// 定義がない場合のフォールバック
if (typeof assert === 'undefined') {
  function assert(value, message) {
    if (!value) {
      throw new Error(message || 'Assertion failed');
    }
  }
}

if (typeof assertEqual === 'undefined') {
  function assertEqual(actual, expected, message) {
    if (actual !== expected) {
      throw new Error(`${message}: expected "${expected}", got "${actual}"`);
    }
  }
}
