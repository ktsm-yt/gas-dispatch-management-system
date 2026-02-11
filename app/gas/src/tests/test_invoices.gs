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
    status: 'unsent'
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

  // 6. 顧客別税端数処理テスト（切り上げ）
  const floorTotals = InvoiceService._calculateTotals(
    [{ amount: 10001, item_name: '作業費' }],
    0.10,
    0,
    'format1',
    'floor'
  );
  const ceilTotals = InvoiceService._calculateTotals(
    [{ amount: 10001, item_name: '作業費' }],
    0.10,
    0,
    'format1',
    'ceil'
  );
  assertEqual(floorTotals.taxAmount, 1000, 'floor tax should be 1000');
  assertEqual(ceilTotals.taxAmount, 1001, 'ceil tax should be 1001');
  Logger.log('  Customer tax rounding mode: OK');
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

/**
 * FORMAT2エクスポートテスト
 * GASエディタから直接実行可能
 */
function testFormat2Export() {
  Logger.log('=== FORMAT2 Export Test ===');

  // テスト用請求書データを作成
  const testCustomerId = 'test_customer_' + Date.now();
  const testInvoice = InvoiceRepository.insert({
    customer_id: testCustomerId,
    billing_year: 2025,
    billing_month: 1,
    subtotal: 100000,
    tax_amount: 10000,
    total_amount: 110000,
    invoice_format: 'format2',
    status: 'unsent',
    shipper_name: 'テスト荷主'
  });
  Logger.log(`✓ 請求書作成: ${testInvoice.invoice_id}`);

  // テスト用明細を追加
  const testLines = [
    {
      invoice_id: testInvoice.invoice_id,
      work_date: '2025-01-15',
      site_name: 'テスト現場A',
      order_number: 'ORD-001',
      branch_office: '東京営業所',
      item_name: '荷揚げ',
      time_note: '8:00-17:00',
      quantity: 2,
      unit: '人',
      unit_price: 18000,
      amount: 36000
    },
    {
      invoice_id: testInvoice.invoice_id,
      work_date: '2025-01-16',
      site_name: 'テスト現場B',
      order_number: 'ORD-002',
      branch_office: '埼玉営業所',
      item_name: '鳶作業',
      time_note: '9:00-18:00',
      quantity: 3,
      unit: '人',
      unit_price: 21333,
      amount: 64000
    }
  ];

  for (const line of testLines) {
    InvoiceLineRepository.insert(line);
  }
  Logger.log(`✓ 明細追加: ${testLines.length}件`);

  // テスト用顧客データ（M_Customerがなければダミー）
  let testCustomer;
  try {
    const customers = getAllRecords('M_Customer');
    testCustomer = customers.find(c => c.customer_id === testCustomerId) || {
      customer_id: testCustomerId,
      company_name: 'テスト株式会社',
      shipper_name: 'テスト荷主名'
    };
  } catch (e) {
    testCustomer = {
      customer_id: testCustomerId,
      company_name: 'テスト株式会社',
      shipper_name: 'テスト荷主名'
    };
  }

  // エクスポート実行（Excel出力）
  const result = InvoiceExportService.export(testInvoice.invoice_id, 'excel');

  if (result.success) {
    Logger.log(`✓ エクスポート成功!`);
    Logger.log(`  シートURL: ${result.url}`);
    Logger.log(`  シートID: ${result.sheetFileId}`);
  } else {
    Logger.log(`✗ エクスポート失敗: ${result.error}`);
    if (result.details) {
      Logger.log(`  詳細: ${JSON.stringify(result.details)}`);
    }
  }

  Logger.log('=== Test Complete ===');
  return result;
}

/**
 * 顧客マスタベースでFORMAT2エクスポートテスト
 * GASエディタから直接実行可能
 */
function testFormat2ExportFromCustomer() {
  Logger.log('=== FORMAT2 Export Test (From Customer) ===');

  // 顧客マスタから取得（荷主名設定済みを優先）
  const customers = getAllRecords('M_Customers');
  Logger.log(`顧客マスタ: ${customers.length}件`);

  if (customers.length === 0) {
    Logger.log('✗ 顧客が見つかりません');
    return { success: false, error: 'NO_CUSTOMERS' };
  }

  // 荷主名が設定されている顧客を優先、なければ最初の顧客
  let customer = customers.find(c => c.shipper_name && c.shipper_name.trim() !== '');
  if (!customer) {
    customer = customers[0];
    Logger.log('※ 荷主名設定済み顧客なし、最初の顧客を使用');
  }
  Logger.log(`✓ 顧客: ${customer.company_name} (${customer.customer_id})`);
  Logger.log(`  荷主名: ${customer.shipper_name || '(未設定)'}`);

  // この顧客の請求書を検索
  const invoices = InvoiceRepository.search({ customer_id: customer.customer_id });
  Logger.log(`  請求書: ${invoices.length}件`);

  let invoiceId;

  if (invoices.length > 0) {
    // 既存の請求書を使用
    invoiceId = invoices[0].invoice_id;
    Logger.log(`✓ 既存請求書を使用: ${invoiceId}`);
  } else {
    // 新規請求書を作成
    const newInvoice = InvoiceRepository.insert({
      customer_id: customer.customer_id,
      billing_year: 2025,
      billing_month: 1,
      subtotal: 100000,
      tax_amount: 10000,
      total_amount: 110000,
      invoice_format: 'format2',
      status: 'unsent',
      shipper_name: customer.shipper_name || ''
    });
    invoiceId = newInvoice.invoice_id;
    Logger.log(`✓ 新規請求書作成: ${invoiceId}`);

    // 明細も追加
    InvoiceLineRepository.insert({
      invoice_id: invoiceId,
      work_date: '2025-01-15',
      site_name: 'テスト現場',
      order_number: 'ORD-001',
      branch_office: '東京',
      item_name: '荷揚げ',
      time_note: '9:00～',
      quantity: 2,
      unit: '人',
      unit_price: 18000,
      amount: 36000
    });
  }

  // エクスポート実行
  const result = InvoiceExportService.export(invoiceId, 'excel');

  if (result.success) {
    Logger.log(`✓ エクスポート成功!`);
    Logger.log(`  シートURL: ${result.url}`);
  } else {
    Logger.log(`✗ エクスポート失敗: ${result.error}`);
  }

  Logger.log('=== Test Complete ===');
  return result;
}

/**
 * 既存の請求書でFORMAT2エクスポートテスト
 * GASエディタから直接実行可能
 */
function testFormat2ExportWithExistingInvoice() {
  Logger.log('=== FORMAT2 Export Test (Existing Invoice) ===');

  // 既存のformat2請求書を検索
  const invoices = InvoiceRepository.search({ invoice_format: 'format2' });

  if (invoices.length === 0) {
    Logger.log('✗ format2の請求書が見つかりません');
    return { success: false, error: 'NO_FORMAT2_INVOICE' };
  }

  // 最初の請求書を使用
  const invoice = invoices[0];
  Logger.log(`✓ 請求書を使用: ${invoice.invoice_id} (${invoice.invoice_number || 'No number'})`);

  // エクスポート実行（Excel出力）
  const result = InvoiceExportService.export(invoice.invoice_id, 'excel');

  if (result.success) {
    Logger.log(`✓ エクスポート成功!`);
    Logger.log(`  シートURL: ${result.url}`);
    Logger.log(`  シートID: ${result.sheetFileId}`);
  } else {
    Logger.log(`✗ エクスポート失敗: ${result.error}`);
    if (result.details) {
      Logger.log(`  詳細: ${JSON.stringify(result.details)}`);
    }
  }

  Logger.log('=== Test Complete ===');
  return result;
}

/**
 * 複数ページFORMAT2テスト（3シート構成）
 * 多数の明細行を生成してPDF出力を確認
 * GASエディタから直接実行可能
 */
function testFormat2MultiPage() {
  Logger.log('=== FORMAT2 Multi-Page Test ===');

  // 顧客マスタから取得
  const customers = getAllRecords('M_Customers');
  if (customers.length === 0) {
    Logger.log('✗ 顧客が見つかりません');
    return { success: false, error: 'NO_CUSTOMERS' };
  }

  let customer = customers.find(c => c.shipper_name && c.shipper_name.trim() !== '') || customers[0];
  Logger.log(`✓ 顧客: ${customer.company_name} (${customer.customer_id})`);

  // 新規請求書を作成（多数の明細用）
  // 発行日・支払期限を顧客設定から計算
  const closingDay = customer.closing_day || 31;
  const paymentDay = customer.payment_day || 31;
  const paymentMonthOffset = customer.payment_month_offset || 1;

  // 発行日（末日締め→翌月1日発行）
  const issueDate = closingDay === 31 ? '2025-02-01' : `2025-01-${String(closingDay + 1).padStart(2, '0')}`;

  // 支払期限（翌月または翌々月の支払日）
  const dueMonth = 1 + paymentMonthOffset;
  const dueDate = `2025-${String(dueMonth).padStart(2, '0')}-${String(paymentDay).padStart(2, '0')}`;

  // 請求番号を生成
  const invoiceNumber = InvoiceRepository.generateInvoiceNumber(2025, 1, customer.customer_id);

  const newInvoice = InvoiceRepository.insert({
    customer_id: customer.customer_id,
    billing_year: 2025,
    billing_month: 1,
    invoice_number: invoiceNumber,
    issue_date: issueDate,
    due_date: dueDate,
    subtotal: 500000,
    tax_amount: 50000,
    total_amount: 550000,
    invoice_format: 'format2',
    status: 'unsent',
    shipper_name: customer.shipper_name || ''
  });
  const invoiceId = newInvoice.invoice_id;
  Logger.log(`✓ 新規請求書作成: ${invoiceId}`);

  // 100行の明細を追加（4ページにまたがる）
  const itemNames = ['荷揚げ', '作業員', '運搬', '搬入', '据付'];
  const branches = ['東京', '埼玉', '神奈川', '千葉'];
  for (let i = 0; i < 100; i++) {
    InvoiceLineRepository.insert({
      invoice_id: invoiceId,
      work_date: `2025-01-${String((i % 28) + 1).padStart(2, '0')}`,
      site_name: `現場${String.fromCharCode(65 + (i % 10))}`,
      order_number: `ORD-${String(i + 1).padStart(3, '0')}`,
      branch_office: branches[i % branches.length],
      item_name: itemNames[i % itemNames.length],
      time_note: '9:00～',
      quantity: (i % 3) + 1,
      unit: '人',
      unit_price: 15000 + (i % 5) * 1000,
      amount: ((i % 3) + 1) * (15000 + (i % 5) * 1000)
    });
  }
  Logger.log(`✓ 100件の明細を追加（4ページ分）`);

  // PDFエクスポート実行（4ページ分を確認）
  const result = InvoiceExportService.export(invoiceId, 'pdf', { keepSheet: true });

  if (result.success) {
    Logger.log(`✓ エクスポート成功!`);
    Logger.log(`  PDF URL: ${result.url}`);
    Logger.log(`  ※ PDFを確認して、表紙（1ページ目）と明細（4ページ分）を確認してください`);
    Logger.log(`  ※ 明細ページには列ヘッダーが繰り返され、ページ境界にパディング行が挿入されます`);
  } else {
    Logger.log(`✗ エクスポート失敗: ${result.error}`);
  }

  Logger.log('=== Test Complete ===');
  return result;
}

/**
 * FORMAT3（顧客B型）エクスポートテスト
 * GASエディタから直接実行可能
 *
 * 列構成: №, 担当工事課, 担当監督名, 物件コード, 現場名, 施工日, 内容, 金額（税抜）, 金額（税込）
 */
function testFormat3Export() {
  Logger.log('=== FORMAT3 Export Test (顧客B型) ===');

  // テスト用請求書データを作成
  const testCustomerId = 'test_polatech_' + Date.now();

  // 請求書を作成
  const testInvoice = InvoiceRepository.insert({
    customer_id: testCustomerId,
    billing_year: 2025,
    billing_month: 1,
    subtotal: 200000,
    tax_amount: 20000,
    total_amount: 220000,
    invoice_format: 'format3',
    status: 'unsent'
  });
  Logger.log(`✓ 請求書作成: ${testInvoice.invoice_id}`);

  // テスト用明細を追加（format3固有フィールドを含む）
  const testLines = [
    {
      invoice_id: testInvoice.invoice_id,
      construction_div: '埼玉中央工事課',
      supervisor_name: '山田',
      property_code: 'EWC161',
      site_name: '和光16-1-2',
      work_date: '2025-01-22',
      item_name: '荷揚げ3名   上棟荷揚げ',
      quantity: 3,
      unit: '人',
      unit_price: 18000,
      amount: 54000
    },
    {
      invoice_id: testInvoice.invoice_id,
      construction_div: '千葉西工事課',
      supervisor_name: '二宮',
      property_code: '',
      site_name: '北小金66-1-7',
      work_date: '2025-01-22',
      item_name: '荷揚げ1名   資材',
      quantity: 1,
      unit: '人',
      unit_price: 13000,
      amount: 13000
    },
    {
      invoice_id: testInvoice.invoice_id,
      construction_div: '千葉西工事課',
      supervisor_name: '橘高',
      property_code: 'EWB201',
      site_name: '柏B20-1',
      work_date: '2025-01-23',
      item_name: '荷揚げ4名   資材',
      quantity: 4,
      unit: '人',
      unit_price: 18000,
      amount: 72000
    },
    {
      invoice_id: testInvoice.invoice_id,
      construction_div: '東京西工事課',
      supervisor_name: '室井',
      property_code: '12501039',
      site_name: 'PO多摩市AS.AS様邸',
      work_date: '2025-01-23',
      item_name: '荷揚げ2名   資材',
      quantity: 2,
      unit: '人',
      unit_price: 18000,
      amount: 36000
    },
    {
      invoice_id: testInvoice.invoice_id,
      construction_div: '千葉西工事課',
      supervisor_name: '尾張',
      property_code: 'EKD691',
      site_name: '北小金69-1-4',
      work_date: '2025-01-24',
      item_name: '荷揚げ2名   上棟荷揚げ',
      quantity: 2,
      unit: '人',
      unit_price: 18000,
      amount: 36000
    }
  ];

  for (const line of testLines) {
    InvoiceLineRepository.insert(line);
  }
  Logger.log(`✓ 明細追加: ${testLines.length}件`);

  // エクスポート実行（Excel出力）
  const result = InvoiceExportService.export(testInvoice.invoice_id, 'excel');

  if (result.success) {
    Logger.log(`✓ エクスポート成功!`);
    Logger.log(`  シートURL: ${result.url}`);
    Logger.log(`  シートID: ${result.sheetFileId}`);
    Logger.log('');
    Logger.log('確認ポイント:');
    Logger.log('  1. タイトル: B1に「(顧客名) 2025年1月 追加請求一覧」');
    Logger.log('  2. ヘッダー: 2行目に №, 担当工事課, ... , 金額（税込）');
    Logger.log('  3. データ: 3行目から5件の明細、A列に連番1-5');
    Logger.log('  4. 金額: H列に税抜、I列に税込（税込計算済み）');
  } else {
    Logger.log(`✗ エクスポート失敗: ${result.error}`);
    if (result.details) {
      Logger.log(`  詳細: ${JSON.stringify(result.details)}`);
    }
  }

  Logger.log('=== Test Complete ===');
  return result;
}

/**
 * FORMAT1/FORMAT2 大量明細テスト（列配置・合計行確認用）
 * GASエディタから直接実行: testFormat1And2BulkLines()
 *
 * format1とformat2の顧客に対して30件の明細を持つ請求書を作成し、
 * Excel/PDFエクスポートで列配置と合計行を確認する
 */
function testFormat1And2BulkLines() {
  Logger.log('=== FORMAT1/FORMAT2 Bulk Lines Test ===');

  const customers = getAllRecords('M_Customers').filter(c =>
    !c.is_deleted && c.is_active !== false &&
    (c.invoice_format === 'format1' || c.invoice_format === 'format2')
  );

  if (customers.length === 0) {
    Logger.log('✗ format1/format2の顧客が見つかりません');
    return { success: false, error: 'NO_CUSTOMERS' };
  }

  Logger.log(`対象顧客: ${customers.length}件`);

  const results = [];
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  // format1とformat2の顧客を1件ずつ処理
  const format1Customer = customers.find(c => c.invoice_format === 'format1');
  const format2Customer = customers.find(c => c.invoice_format === 'format2');

  const targetCustomers = [format1Customer, format2Customer].filter(Boolean);

  for (const customer of targetCustomers) {
    Logger.log(`\n--- ${customer.invoice_format}: ${customer.company_name} ---`);

    // 請求番号を生成
    const invoiceNumber = InvoiceRepository.generateInvoiceNumber(year, month, customer.customer_id);

    // 請求書を作成
    const invoice = InvoiceRepository.insert({
      customer_id: customer.customer_id,
      billing_year: year,
      billing_month: month,
      invoice_number: invoiceNumber,
      issue_date: `${year}-${String(month).padStart(2, '0')}-01`,
      due_date: `${year}-${String(month + 1).padStart(2, '0')}-${customer.payment_day || 25}`,
      subtotal: 0,  // 後で更新
      tax_amount: 0,
      total_amount: 0,
      invoice_format: customer.invoice_format,
      status: 'unsent',
      shipper_name: customer.shipper_name || ''
    });
    Logger.log(`✓ 請求書作成: ${invoice.invoice_id}`);

    // 30件の明細を追加
    const itemNames = ['作業員', '鳶工', '荷揚げ', '搬入', '資材運搬'];
    const siteNames = ['高橋倉庫外装工事', '林倉庫内装工事', '山口倉庫解体工事', '松本店舗新築工事', '鈴木病院外装工事', '加藤アパート設備工事', '佐藤住宅増築工事', '清水アパート増築工事'];
    const branches = ['特需1', '世田谷', '立川', '本社', '横浜'];
    let subtotal = 0;

    for (let i = 0; i < 30; i++) {
      const day = (i % 28) + 1;
      const quantity = (i % 3) + 1;
      const unitPrice = 21500 + (i % 5) * 1000;
      const amount = quantity * unitPrice;
      subtotal += amount;

      const lineData = {
        invoice_id: invoice.invoice_id,
        line_number: i + 1,
        work_date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        site_name: siteNames[i % siteNames.length],
        item_name: itemNames[i % itemNames.length],
        time_note: `12/29/18`,
        quantity: quantity,
        unit: '人',
        unit_price: unitPrice,
        amount: amount
      };

      // format2固有フィールド
      if (customer.invoice_format === 'format2') {
        lineData.order_number = `ORD-${String(30000 + i).padStart(6, '0')}`;
        lineData.branch_office = branches[i % branches.length];
      }

      InvoiceLineRepository.insert(lineData);
    }
    Logger.log(`✓ 30件の明細を追加`);

    // 請求書の合計を更新
    const taxRate = (customer.tax_rate || 10) / 100;
    const taxAmount = Math.floor(subtotal * taxRate);
    InvoiceRepository.update({
      invoice_id: invoice.invoice_id,
      subtotal: subtotal,
      tax_amount: taxAmount,
      total_amount: subtotal + taxAmount
    }, invoice.updated_at);
    Logger.log(`✓ 合計更新: 税抜 ${subtotal.toLocaleString()}円`);

    // Excelエクスポート
    const excelResult = InvoiceExportService.export(invoice.invoice_id, 'excel', { keepSheet: true });
    if (excelResult.success) {
      Logger.log(`✓ Excel出力成功: ${excelResult.url}`);
    } else {
      Logger.log(`✗ Excel出力失敗: ${excelResult.error}`);
    }

    results.push({
      format: customer.invoice_format,
      customer: customer.company_name,
      invoiceId: invoice.invoice_id,
      subtotal: subtotal,
      excelResult: excelResult
    });
  }

  Logger.log('\n=== Test Complete ===');
  Logger.log('確認ポイント:');
  Logger.log('  1. 列配置が正しいか（ヘッダーとデータの対応）');
  Logger.log('  2. 合計行が表示されているか');
  Logger.log('  3. 合計行の上に罫線があるか');

  return { success: true, results };
}

/**
 * FORMAT3（顧客B型）PDFエクスポートテスト
 * GASエディタから直接実行可能
 */
function testFormat3ExportPdf() {
  Logger.log('=== FORMAT3 PDF Export Test (顧客B型) ===');

  // まずformat3の請求書を検索
  const invoices = InvoiceRepository.search({ invoice_format: 'format3' });

  if (invoices.length === 0) {
    Logger.log('format3の請求書がないため、新規作成します...');
    const editResult = testFormat3Export();
    if (!editResult.success) {
      return editResult;
    }
    // 作成した請求書を再検索
    const newInvoices = InvoiceRepository.search({ invoice_format: 'format3' });
    if (newInvoices.length === 0) {
      return { success: false, error: 'NO_FORMAT3_INVOICE' };
    }
    var invoice = newInvoices[0];
  } else {
    var invoice = invoices[0];
  }

  Logger.log(`✓ 請求書を使用: ${invoice.invoice_id}`);

  // PDFエクスポート実行
  const result = InvoiceExportService.export(invoice.invoice_id, 'pdf', { keepSheet: false });

  if (result.success) {
    Logger.log(`✓ PDFエクスポート成功!`);
    Logger.log(`  PDF URL: ${result.url}`);
    Logger.log(`  PDF ID: ${result.pdfFileId}`);
  } else {
    Logger.log(`✗ エクスポート失敗: ${result.error}`);
  }

  Logger.log('=== Test Complete ===');
  return result;
}
