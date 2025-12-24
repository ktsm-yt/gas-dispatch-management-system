/**
 * マスターCRUDテスト
 *
 * テスト対象:
 * - CustomerRepository / CustomerService
 * - StaffRepository / StaffService
 * - TransportFeeRepository
 */

// ============================================================
// テスト実行
// ============================================================

/**
 * 全マスターテストを実行
 */
function runAllMasterTests() {
  console.log('=== マスターCRUDテスト ===\n');

  const results = {
    passed: 0,
    failed: 0,
    errors: []
  };

  const testSuites = [
    { name: 'Customer Tests', fn: runCustomerTests },
    { name: 'Staff Tests', fn: runStaffTests },
    { name: 'TransportFee Tests', fn: runTransportFeeTests }
  ];

  for (const suite of testSuites) {
    console.log(`\n--- ${suite.name} ---`);
    try {
      const suiteResult = suite.fn();
      results.passed += suiteResult.passed;
      results.failed += suiteResult.failed;
      results.errors.push(...suiteResult.errors);
    } catch (e) {
      console.log(`[ERROR] ${suite.name}: ${e.message}`);
      results.failed++;
      results.errors.push({ suite: suite.name, error: e.message });
    }
  }

  console.log('\n=== テスト結果サマリー ===');
  console.log(`Passed: ${results.passed}`);
  console.log(`Failed: ${results.failed}`);

  return results;
}

// ============================================================
// Customer Tests
// ============================================================

function runCustomerTests() {
  const results = { passed: 0, failed: 0, errors: [] };

  const tests = [
    testCustomerInsert,
    testCustomerFindById,
    testCustomerUpdate,
    testCustomerSearch,
    testCustomerSoftDelete
  ];

  for (const test of tests) {
    try {
      test();
      console.log(`[PASS] ${test.name}`);
      results.passed++;
    } catch (e) {
      console.log(`[FAIL] ${test.name}: ${e.message}`);
      results.failed++;
      results.errors.push({ test: test.name, error: e.message });
    }
  }

  return results;
}

function testCustomerInsert() {
  const testId = 'cus_test_' + Utilities.getUuid().substring(0, 8);

  const customer = {
    customer_id: testId,
    company_name: 'テスト建設株式会社',
    branch_name: '東京支店',
    contact_name: '山田太郎',
    honorific: '様',
    postal_code: '100-0001',
    address: '東京都千代田区千代田1-1',
    phone: '03-1234-5678',
    unit_price_tobi: 25000,
    unit_price_age: 20000,
    unit_price_tobiage: 28000,
    unit_price_half: 12000,
    closing_day: 31,
    payment_month_offset: 1,
    payment_day: 25,
    invoice_format: 'format1',
    tax_rate: 10,
    is_active: true
  };

  try {
    // 挿入
    insertRecord('M_Customers', {
      ...customer,
      created_at: getCurrentTimestamp(),
      created_by: 'test',
      updated_at: getCurrentTimestamp(),
      updated_by: 'test',
      is_deleted: false
    });

    // 確認
    const sheet = getSheet('M_Customers');
    const row = findRowById(sheet, 'customer_id', testId);
    assertTruthy(row, 'customer should be inserted');

    // クリーンアップ
    softDeleteMasterRecord('M_Customers', 'customer_id', testId);

  } catch (e) {
    softDeleteMasterRecord('M_Customers', 'customer_id', testId);
    throw e;
  }
}

function testCustomerFindById() {
  const testId = 'cus_test_find_' + Utilities.getUuid().substring(0, 8);

  // 準備
  insertRecord('M_Customers', {
    customer_id: testId,
    company_name: 'テスト検索会社',
    is_active: true,
    created_at: getCurrentTimestamp(),
    created_by: 'test',
    updated_at: getCurrentTimestamp(),
    updated_by: 'test',
    is_deleted: false
  });

  try {
    // 検索
    const customers = getAllRecords('M_Customers').filter(c =>
      c.customer_id === testId && !c.is_deleted
    );

    assertEq(customers.length, 1, 'should find 1 customer');
    assertEq(customers[0].company_name, 'テスト検索会社', 'company_name should match');

    // クリーンアップ
    softDeleteMasterRecord('M_Customers', 'customer_id', testId);

  } catch (e) {
    softDeleteMasterRecord('M_Customers', 'customer_id', testId);
    throw e;
  }
}

function testCustomerUpdate() {
  const testId = 'cus_test_update_' + Utilities.getUuid().substring(0, 8);

  // 準備
  insertRecord('M_Customers', {
    customer_id: testId,
    company_name: '更新前会社',
    is_active: true,
    created_at: getCurrentTimestamp(),
    created_by: 'test',
    updated_at: getCurrentTimestamp(),
    updated_by: 'test',
    is_deleted: false
  });

  try {
    // 更新
    const sheet = getSheet('M_Customers');
    const row = findRowById(sheet, 'customer_id', testId);
    const headers = getHeaders(sheet);
    const companyNameCol = headers.indexOf('company_name');
    const updatedAtCol = headers.indexOf('updated_at');

    sheet.getRange(row, companyNameCol + 1).setValue('更新後会社');
    sheet.getRange(row, updatedAtCol + 1).setValue(getCurrentTimestamp());

    // 確認
    const customers = getAllRecords('M_Customers').filter(c => c.customer_id === testId);
    assertEq(customers[0].company_name, '更新後会社', 'company_name should be updated');

    // クリーンアップ
    softDeleteMasterRecord('M_Customers', 'customer_id', testId);

  } catch (e) {
    softDeleteMasterRecord('M_Customers', 'customer_id', testId);
    throw e;
  }
}

function testCustomerSearch() {
  const prefix = 'cus_test_search_' + Utilities.getUuid().substring(0, 4);
  const testIds = [];

  // 複数の顧客を作成
  for (let i = 1; i <= 3; i++) {
    const testId = prefix + '_' + i;
    testIds.push(testId);
    insertRecord('M_Customers', {
      customer_id: testId,
      company_name: `検索テスト会社${i}`,
      is_active: i !== 3, // 3番目は非アクティブ
      created_at: getCurrentTimestamp(),
      created_by: 'test',
      updated_at: getCurrentTimestamp(),
      updated_by: 'test',
      is_deleted: false
    });
  }

  try {
    // 全件検索
    const allCustomers = getAllRecords('M_Customers').filter(c =>
      c.customer_id && c.customer_id.startsWith(prefix) && !c.is_deleted
    );
    assertEq(allCustomers.length, 3, 'should find 3 customers');

    // アクティブのみ
    const activeCustomers = allCustomers.filter(c => c.is_active);
    assertEq(activeCustomers.length, 2, 'should find 2 active customers');

    // クリーンアップ
    for (const id of testIds) {
      softDeleteMasterRecord('M_Customers', 'customer_id', id);
    }

  } catch (e) {
    for (const id of testIds) {
      softDeleteMasterRecord('M_Customers', 'customer_id', id);
    }
    throw e;
  }
}

function testCustomerSoftDelete() {
  const testId = 'cus_test_delete_' + Utilities.getUuid().substring(0, 8);

  // 準備
  insertRecord('M_Customers', {
    customer_id: testId,
    company_name: '削除テスト会社',
    is_active: true,
    created_at: getCurrentTimestamp(),
    created_by: 'test',
    updated_at: getCurrentTimestamp(),
    updated_by: 'test',
    is_deleted: false
  });

  // 論理削除
  softDeleteMasterRecord('M_Customers', 'customer_id', testId);

  // 確認
  const customers = getAllRecords('M_Customers').filter(c =>
    c.customer_id === testId && !c.is_deleted
  );
  assertEq(customers.length, 0, 'deleted customer should not be found');

  // is_deleted = true で検索
  const deletedCustomers = getAllRecords('M_Customers', { includeDeleted: true }).filter(c =>
    c.customer_id === testId
  );
  assertEq(deletedCustomers.length, 1, 'deleted customer should exist with is_deleted=true');
  assertTruthy(deletedCustomers[0].is_deleted, 'is_deleted should be true');
}

// ============================================================
// Staff Tests
// ============================================================

function runStaffTests() {
  const results = { passed: 0, failed: 0, errors: [] };

  const tests = [
    testStaffInsert,
    testStaffFindById,
    testStaffUpdate,
    testStaffWithNgCustomers,
    testStaffSoftDelete
  ];

  for (const test of tests) {
    try {
      test();
      console.log(`[PASS] ${test.name}`);
      results.passed++;
    } catch (e) {
      console.log(`[FAIL] ${test.name}: ${e.message}`);
      results.failed++;
      results.errors.push({ test: test.name, error: e.message });
    }
  }

  return results;
}

function testStaffInsert() {
  const testId = 'stf_test_' + Utilities.getUuid().substring(0, 8);

  const staff = {
    staff_id: testId,
    name: '山田太郎',
    name_kana: 'ヤマダタロウ',
    phone: '090-1234-5678',
    skills: '鳶,揚げ',
    has_motorbike: true,
    daily_rate_tobi: 15000,
    daily_rate_age: 13000,
    daily_rate_tobiage: 16000,
    daily_rate_half: 8000,
    staff_type: 'regular',
    employment_type: 'employee',
    withholding_tax_applicable: true,
    is_active: true
  };

  try {
    // 挿入
    insertRecord('M_Staff', {
      ...staff,
      created_at: getCurrentTimestamp(),
      created_by: 'test',
      updated_at: getCurrentTimestamp(),
      updated_by: 'test',
      is_deleted: false
    });

    // 確認
    const staffRecords = getAllRecords('M_Staff').filter(s =>
      s.staff_id === testId && !s.is_deleted
    );
    assertEq(staffRecords.length, 1, 'staff should be inserted');
    assertEq(staffRecords[0].name, '山田太郎', 'name should match');
    assertEq(staffRecords[0].daily_rate_tobi, 15000, 'daily_rate_tobi should match');

    // クリーンアップ
    softDeleteMasterRecord('M_Staff', 'staff_id', testId);

  } catch (e) {
    softDeleteMasterRecord('M_Staff', 'staff_id', testId);
    throw e;
  }
}

function testStaffFindById() {
  const testId = 'stf_test_find_' + Utilities.getUuid().substring(0, 8);

  // 準備
  insertRecord('M_Staff', {
    staff_id: testId,
    name: '検索テストスタッフ',
    staff_type: 'regular',
    is_active: true,
    created_at: getCurrentTimestamp(),
    created_by: 'test',
    updated_at: getCurrentTimestamp(),
    updated_by: 'test',
    is_deleted: false
  });

  try {
    // 検索
    const staffRecords = getAllRecords('M_Staff').filter(s =>
      s.staff_id === testId && !s.is_deleted
    );

    assertEq(staffRecords.length, 1, 'should find 1 staff');
    assertEq(staffRecords[0].name, '検索テストスタッフ', 'name should match');

    // クリーンアップ
    softDeleteMasterRecord('M_Staff', 'staff_id', testId);

  } catch (e) {
    softDeleteMasterRecord('M_Staff', 'staff_id', testId);
    throw e;
  }
}

function testStaffUpdate() {
  const testId = 'stf_test_update_' + Utilities.getUuid().substring(0, 8);

  // 準備
  insertRecord('M_Staff', {
    staff_id: testId,
    name: '更新前スタッフ',
    daily_rate_tobi: 14000,
    staff_type: 'regular',
    is_active: true,
    created_at: getCurrentTimestamp(),
    created_by: 'test',
    updated_at: getCurrentTimestamp(),
    updated_by: 'test',
    is_deleted: false
  });

  try {
    // 更新
    const sheet = getSheet('M_Staff');
    const row = findRowById(sheet, 'staff_id', testId);
    const headers = getHeaders(sheet);
    const dailyRateCol = headers.indexOf('daily_rate_tobi');

    sheet.getRange(row, dailyRateCol + 1).setValue(16000);

    // 確認
    const staffRecords = getAllRecords('M_Staff').filter(s => s.staff_id === testId);
    assertEq(staffRecords[0].daily_rate_tobi, 16000, 'daily_rate_tobi should be updated');

    // クリーンアップ
    softDeleteMasterRecord('M_Staff', 'staff_id', testId);

  } catch (e) {
    softDeleteMasterRecord('M_Staff', 'staff_id', testId);
    throw e;
  }
}

function testStaffWithNgCustomers() {
  const testId = 'stf_test_ng_' + Utilities.getUuid().substring(0, 8);
  const ngCustomerIds = 'cus_ng_001,cus_ng_002,cus_ng_003';

  // NG顧客付きスタッフを作成
  insertRecord('M_Staff', {
    staff_id: testId,
    name: 'NG顧客テストスタッフ',
    staff_type: 'regular',
    ng_customers: ngCustomerIds,
    is_active: true,
    created_at: getCurrentTimestamp(),
    created_by: 'test',
    updated_at: getCurrentTimestamp(),
    updated_by: 'test',
    is_deleted: false
  });

  try {
    // 確認
    const staffRecords = getAllRecords('M_Staff').filter(s => s.staff_id === testId);
    assertEq(staffRecords[0].ng_customers, ngCustomerIds, 'ng_customers should match');

    // NG顧客リストをパース
    const ngList = staffRecords[0].ng_customers.split(',');
    assertEq(ngList.length, 3, 'should have 3 NG customers');
    assertTruthy(ngList.includes('cus_ng_002'), 'should include cus_ng_002');

    // クリーンアップ
    softDeleteMasterRecord('M_Staff', 'staff_id', testId);

  } catch (e) {
    softDeleteMasterRecord('M_Staff', 'staff_id', testId);
    throw e;
  }
}

function testStaffSoftDelete() {
  const testId = 'stf_test_delete_' + Utilities.getUuid().substring(0, 8);

  // 準備
  insertRecord('M_Staff', {
    staff_id: testId,
    name: '削除テストスタッフ',
    staff_type: 'regular',
    is_active: true,
    created_at: getCurrentTimestamp(),
    created_by: 'test',
    updated_at: getCurrentTimestamp(),
    updated_by: 'test',
    is_deleted: false
  });

  // 論理削除
  softDeleteMasterRecord('M_Staff', 'staff_id', testId);

  // 確認
  const staffRecords = getAllRecords('M_Staff').filter(s =>
    s.staff_id === testId && !s.is_deleted
  );
  assertEq(staffRecords.length, 0, 'deleted staff should not be found');
}

// ============================================================
// TransportFee Tests
// ============================================================

function runTransportFeeTests() {
  const results = { passed: 0, failed: 0, errors: [] };

  const tests = [
    testTransportFeeInsert,
    testTransportFeeFindByArea,
    testTransportFeeGetAll
  ];

  for (const test of tests) {
    try {
      test();
      console.log(`[PASS] ${test.name}`);
      results.passed++;
    } catch (e) {
      console.log(`[FAIL] ${test.name}: ${e.message}`);
      results.failed++;
      results.errors.push({ test: test.name, error: e.message });
    }
  }

  return results;
}

function testTransportFeeInsert() {
  const testAreaCode = 'test_area_' + Utilities.getUuid().substring(0, 4);

  try {
    // 挿入
    insertRecord('M_TransportFee', {
      area_code: testAreaCode,
      area_name: 'テストエリア',
      default_fee: 1200
    });

    // 確認
    const fees = getAllRecords('M_TransportFee').filter(f => f.area_code === testAreaCode);
    assertEq(fees.length, 1, 'transport fee should be inserted');
    assertEq(fees[0].default_fee, 1200, 'default_fee should match');

    // クリーンアップ（物理削除）
    const sheet = getSheet('M_TransportFee');
    const row = findRowById(sheet, 'area_code', testAreaCode);
    if (row) {
      sheet.deleteRow(row);
    }

  } catch (e) {
    const sheet = getSheet('M_TransportFee');
    const row = findRowById(sheet, 'area_code', testAreaCode);
    if (row) {
      sheet.deleteRow(row);
    }
    throw e;
  }
}

function testTransportFeeFindByArea() {
  // 既存のエリアを検索（23ku_inner等があれば）
  const fees = getAllRecords('M_TransportFee');

  if (fees.length > 0) {
    const firstFee = fees[0];
    const found = fees.filter(f => f.area_code === firstFee.area_code);
    assertEq(found.length, 1, 'should find exactly 1 fee for area_code');
    assertTruthy(found[0].default_fee >= 0, 'default_fee should be non-negative');
  } else {
    console.log('  (No transport fees in database, skipping)');
  }
}

function testTransportFeeGetAll() {
  const fees = getAllRecords('M_TransportFee');
  assertTruthy(Array.isArray(fees), 'should return array');

  // 各レコードに必須項目があるか確認
  for (const fee of fees) {
    assertTruthy(fee.area_code, 'area_code should exist');
    assertTruthy(fee.area_name !== undefined, 'area_name should exist');
    assertTruthy(fee.default_fee !== undefined, 'default_fee should exist');
  }
}

// ============================================================
// ヘルパー関数
// ============================================================

function softDeleteMasterRecord(tableName, idColumn, idValue) {
  try {
    const sheet = getSheet(tableName);
    const row = findRowById(sheet, idColumn, idValue);
    if (row) {
      const headers = getHeaders(sheet);
      const isDeletedCol = headers.indexOf('is_deleted');
      const updatedAtCol = headers.indexOf('updated_at');
      if (isDeletedCol >= 0) {
        sheet.getRange(row, isDeletedCol + 1).setValue(true);
      }
      if (updatedAtCol >= 0) {
        sheet.getRange(row, updatedAtCol + 1).setValue(getCurrentTimestamp());
      }
    }
  } catch (e) {
    // クリーンアップ失敗は無視
  }
}

function assertEq(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected "${expected}", got "${actual}"`);
  }
}

function assertTruthy(value, message) {
  if (!value) {
    throw new Error(`${message}: expected truthy, got ${value}`);
  }
}
