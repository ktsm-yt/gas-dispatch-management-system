/**
 * Invoice Tests
 *
 * 請求管理機能のテスト
 * KTSM-86: Phase 2 請求管理機能
 */

/**
 * 全請求テストを実行
 */
function runInvoiceTests() {
  Logger.log('=== Invoice Tests Start ===');

  const tests = [
    testInvoiceRepository,
    testInvoiceLineRepository,
    testInvoiceService,
    testInvoiceCalculations
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

  Logger.log(`=== Invoice Tests Complete: ${passed} passed, ${failed} failed ===`);
  return { passed, failed };
}

/**
 * InvoiceRepository のテスト
 */
function testInvoiceRepository() {
  Logger.log('--- testInvoiceRepository ---');

  // 1. Insert テスト
  const testInvoice = {
    customer_id: 'test_customer_' + Date.now(),
    billing_year: 2025,
    billing_month: 1,
    subtotal: 100000,
    tax_amount: 10000,
    total_amount: 110000,
    invoice_format: 'format1',
    status: 'draft'
  };

  const inserted = InvoiceRepository.insert(testInvoice);
  assert(inserted.invoice_id, 'insert should return invoice_id');
  assert(inserted.invoice_id.startsWith('inv_'), 'invoice_id should start with inv_');
  Logger.log(`  Insert: OK (${inserted.invoice_id})`);

  // 2. FindById テスト
  const found = InvoiceRepository.findById(inserted.invoice_id);
  assert(found, 'findById should return invoice');
  assertEqual(found.customer_id, testInvoice.customer_id, 'customer_id should match');
  assertEqual(found.billing_year, 2025, 'billing_year should match');
  Logger.log('  FindById: OK');

  // 3. Search テスト
  const searchResult = InvoiceRepository.search({
    billing_year: 2025,
    billing_month: 1
  });
  assert(Array.isArray(searchResult), 'search should return array');
  Logger.log(`  Search: OK (${searchResult.length} results)`);

  // 4. Update テスト
  const updateResult = InvoiceRepository.update({
    invoice_id: inserted.invoice_id,
    status: 'issued'
  }, found.updated_at);
  assert(updateResult.success, 'update should succeed');
  assertEqual(updateResult.invoice.status, 'issued', 'status should be updated');
  Logger.log('  Update: OK');

  // 5. 楽観ロックテスト
  const conflictResult = InvoiceRepository.update({
    invoice_id: inserted.invoice_id,
    status: 'sent'
  }, 'wrong_timestamp');
  assert(!conflictResult.success, 'update with wrong timestamp should fail');
  assertEqual(conflictResult.error, 'CONFLICT_ERROR', 'should return CONFLICT_ERROR');
  Logger.log('  OptimisticLock: OK');

  // 6. GenerateInvoiceNumber テスト
  const invoiceNumber = InvoiceRepository.generateInvoiceNumber(2025, 1, testInvoice.customer_id);
  assert(invoiceNumber, 'generateInvoiceNumber should return value');
  assert(invoiceNumber.startsWith('2501_'), 'invoice number format should be YYMM_');
  Logger.log(`  GenerateInvoiceNumber: OK (${invoiceNumber})`);

  // 7. SoftDelete テスト
  const currentInvoice = InvoiceRepository.findById(inserted.invoice_id);
  const deleteResult = InvoiceRepository.softDelete(inserted.invoice_id, currentInvoice.updated_at);
  assert(deleteResult.success, 'softDelete should succeed');
  const deletedInvoice = InvoiceRepository.findById(inserted.invoice_id);
  assert(!deletedInvoice, 'findById should return null for deleted invoice');
  Logger.log('  SoftDelete: OK');
}

/**
 * InvoiceLineRepository のテスト
 */
function testInvoiceLineRepository() {
  Logger.log('--- testInvoiceLineRepository ---');

  const testInvoiceId = 'test_invoice_' + Date.now();

  // 1. BulkInsert テスト
  const testLines = [
    {
      invoice_id: testInvoiceId,
      line_number: 1,
      work_date: '2025-01-15',
      site_name: 'テスト現場A',
      item_name: '作業員',
      quantity: 2,
      unit: '人',
      unit_price: 15000,
      amount: 30000
    },
    {
      invoice_id: testInvoiceId,
      line_number: 2,
      work_date: '2025-01-16',
      site_name: 'テスト現場B',
      item_name: '作業員（ハーフ）',
      quantity: 1,
      unit: '人',
      unit_price: 8000,
      amount: 8000
    }
  ];

  const inserted = InvoiceLineRepository.bulkInsert(testLines);
  assertEqual(inserted.length, 2, 'bulkInsert should insert 2 lines');
  assert(inserted[0].line_id.startsWith('line_'), 'line_id should start with line_');
  Logger.log(`  BulkInsert: OK (${inserted.length} lines)`);

  // 2. FindByInvoiceId テスト
  const foundLines = InvoiceLineRepository.findByInvoiceId(testInvoiceId);
  assertEqual(foundLines.length, 2, 'findByInvoiceId should return 2 lines');
  assertEqual(foundLines[0].line_number, 1, 'lines should be ordered by line_number');
  Logger.log('  FindByInvoiceId: OK');

  // 3. CalculateTotals テスト
  const totals = InvoiceLineRepository.calculateTotals(testInvoiceId);
  assertEqual(totals.subtotal, 38000, 'subtotal should be 30000 + 8000');
  assertEqual(totals.lineCount, 2, 'lineCount should be 2');
  Logger.log(`  CalculateTotals: OK (subtotal: ${totals.subtotal})`);

  // 4. Update テスト
  const updateResult = InvoiceLineRepository.update({
    line_id: inserted[0].line_id,
    quantity: 3,
    amount: 45000
  });
  assert(updateResult.success, 'update should succeed');
  assertEqual(updateResult.line.quantity, 3, 'quantity should be updated');
  Logger.log('  Update: OK');

  // 5. DeleteByInvoiceId テスト
  const deleteResult = InvoiceLineRepository.deleteByInvoiceId(testInvoiceId);
  assert(deleteResult.success, 'deleteByInvoiceId should succeed');
  assertEqual(deleteResult.deleted, 2, 'should delete 2 lines');
  Logger.log('  DeleteByInvoiceId: OK');
}

/**
 * InvoiceService のテスト
 */
function testInvoiceService() {
  Logger.log('--- testInvoiceService ---');

  // 1. Get テスト（存在しないID）
  const notFound = InvoiceService.get('non_existent_id');
  assert(!notFound, 'get should return null for non-existent id');
  Logger.log('  Get (not found): OK');

  // 2. Search テスト
  const searchResult = InvoiceService.search({ billing_year: 2025 });
  assert(Array.isArray(searchResult), 'search should return array');
  Logger.log(`  Search: OK (${searchResult.length} results)`);

  // 3. CalculateDates テスト（内部メソッド）
  // この部分はprivateメソッドなので、直接テストする代わりに
  // generate時の結果を検証
  Logger.log('  Internal methods: Skipped (tested via integration)');
}

/**
 * 計算ロジックのテスト
 */
function testInvoiceCalculations() {
  Logger.log('--- testInvoiceCalculations ---');

  // 1. 税額計算テスト
  const taxAmount = calculateTaxAmount_(100000, 0.10);
  assertEqual(taxAmount, 10000, 'tax amount should be 10000 for 100000 @ 10%');
  Logger.log('  CalculateTaxAmount: OK');

  // 2. 端数処理テスト（切り捨て）
  const floorResult = applyRounding_(12345.6, RoundingMode.FLOOR);
  assertEqual(floorResult, 12345, 'floor rounding should truncate');
  Logger.log('  Rounding (floor): OK');

  // 3. 諸経費計算テスト
  const expense = calculateExpense_(100000, 5);
  assertEqual(expense, 5000, 'expense should be 5% of base');
  Logger.log('  CalculateExpense: OK');

  // 4. 鳶揚げ係数テスト
  assertEqual(TOBIAGE_MULTIPLIER, 1.5, 'TOBIAGE_MULTIPLIER should be 1.5');
  Logger.log('  TOBIAGE_MULTIPLIER: OK');

  // 5. 請求合計計算テスト
  const lines = [
    { quantity: 2, unit_price: 15000, amount: 30000 },
    { quantity: 1, unit_price: 10000, amount: 10000 }
  ];
  const totals = calculateInvoiceTotals_(lines, 0.10);
  assertEqual(totals.subtotal, 40000, 'subtotal should be 40000');
  assertEqual(totals.taxAmount, 4000, 'taxAmount should be 4000');
  assertEqual(totals.totalAmount, 44000, 'totalAmount should be 44000');
  Logger.log('  CalculateInvoiceTotals: OK');
}

// ============================================
// Test Utilities
// ============================================

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

function assertNotEqual(actual, expected, message) {
  if (actual === expected) {
    throw new Error(`${message}: expected not ${expected}, but got same value`);
  }
}

/**
 * テストデータをクリーンアップ
 */
function cleanupInvoiceTestData() {
  Logger.log('Cleaning up test data...');

  // テスト用の請求書を検索して削除
  const invoices = InvoiceRepository.search({});
  let cleaned = 0;

  for (const inv of invoices) {
    if (inv.customer_id && inv.customer_id.startsWith('test_customer_')) {
      // 明細も削除
      InvoiceLineRepository.deleteByInvoiceId(inv.invoice_id);
      // 請求書を物理削除ではなく論理削除
      InvoiceRepository.softDelete(inv.invoice_id, inv.updated_at);
      cleaned++;
    }
  }

  Logger.log(`Cleaned up ${cleaned} test invoices`);
}
