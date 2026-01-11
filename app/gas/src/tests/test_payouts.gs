/**
 * Payout Tests
 *
 * 支払管理機能のテスト
 * P2-3: 給与/支払管理システム
 */

/**
 * 全支払テストを実行
 */
function runPayoutTests() {
  Logger.log('=== Payout Tests Start ===');

  const tests = [
    testPayoutRepository,
    testPayoutService,
    testPayoutCalculations,
    testConfirmedWorkflow,
    testDoubleEntryPrevention,
    testWithholdingTaxCalculation,
    testPaidDateValidation
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

  Logger.log(`=== Payout Tests Complete: ${passed} passed, ${failed} failed ===`);
  return { passed, failed };
}

/**
 * PayoutRepository のテスト
 */
function testPayoutRepository() {
  Logger.log('--- testPayoutRepository ---');

  // 1. Insert テスト
  const testPayout = {
    payout_type: 'STAFF',
    staff_id: 'test_staff_' + Date.now(),
    period_start: '2025-01-01',
    period_end: '2025-01-15',
    assignment_count: 5,
    base_amount: 50000,
    transport_amount: 5000,
    adjustment_amount: 0,
    tax_amount: 0,
    total_amount: 55000,
    status: 'draft'
  };

  const inserted = PayoutRepository.insert(testPayout);
  assert(inserted.payout_id, 'insert should return payout_id');
  assert(inserted.payout_id.startsWith('pay_'), 'payout_id should start with pay_');
  Logger.log(`  Insert: OK (${inserted.payout_id})`);

  // 2. FindById テスト
  const found = PayoutRepository.findById(inserted.payout_id);
  assert(found, 'findById should return payout');
  assertEqual(found.staff_id, testPayout.staff_id, 'staff_id should match');
  assertEqual(found.base_amount, 50000, 'base_amount should match');
  Logger.log('  FindById: OK');

  // 3. FindByStaffId テスト
  const staffPayouts = PayoutRepository.findByStaffId(testPayout.staff_id);
  assert(Array.isArray(staffPayouts), 'findByStaffId should return array');
  assert(staffPayouts.length > 0, 'should find at least one payout');
  Logger.log(`  FindByStaffId: OK (${staffPayouts.length} results)`);

  // 4. FindLastPayout テスト
  const lastPayout = PayoutRepository.findLastPayout(testPayout.staff_id);
  assert(lastPayout, 'findLastPayout should return payout');
  assertEqual(lastPayout.payout_id, inserted.payout_id, 'should return the inserted payout');
  Logger.log('  FindLastPayout: OK');

  // 5. Search テスト
  const searchResult = PayoutRepository.search({
    payout_type: 'STAFF',
    status: 'draft'
  });
  assert(Array.isArray(searchResult), 'search should return array');
  Logger.log(`  Search: OK (${searchResult.length} results)`);

  // 6. Update テスト
  const updateResult = PayoutRepository.update({
    payout_id: inserted.payout_id,
    status: 'confirmed'
  }, found.updated_at);
  assert(updateResult.success, 'update should succeed');
  assertEqual(updateResult.payout.status, 'confirmed', 'status should be updated');
  Logger.log('  Update: OK');

  // 7. 楽観ロックテスト
  const conflictResult = PayoutRepository.update({
    payout_id: inserted.payout_id,
    status: 'paid'
  }, 'wrong_timestamp');
  assert(!conflictResult.success, 'update with wrong timestamp should fail');
  assertEqual(conflictResult.error, 'CONFLICT_ERROR', 'should return CONFLICT_ERROR');
  Logger.log('  OptimisticLock: OK');

  // 8. UpdateStatus テスト
  const statusResult = PayoutRepository.updateStatus(
    inserted.payout_id,
    'paid',
    updateResult.payout.updated_at
  );
  assert(statusResult.success, 'updateStatus should succeed');
  assertEqual(statusResult.payout.status, 'paid', 'status should be paid');
  assert(statusResult.payout.paid_date, 'paid_date should be set');
  Logger.log('  UpdateStatus: OK');

  // 9. SoftDelete テスト（新しいレコードで）
  const toDelete = PayoutRepository.insert({
    ...testPayout,
    staff_id: 'delete_test_' + Date.now()
  });
  const deleteResult = PayoutRepository.softDelete(toDelete.payout_id, toDelete.updated_at);
  assert(deleteResult.success, 'softDelete should succeed');

  const afterDelete = PayoutRepository.findById(toDelete.payout_id);
  assert(!afterDelete, 'findById should return null after soft delete');
  Logger.log('  SoftDelete: OK');

  Logger.log('--- testPayoutRepository PASSED ---');
}

/**
 * PayoutService のテスト（簡素化フロー対応版）
 */
function testPayoutService() {
  Logger.log('--- testPayoutService ---');

  // テスト用スタッフIDを取得
  const staffList = StaffRepository.search({ is_active: true, limit: 1 });
  if (staffList.length === 0) {
    Logger.log('  SKIP: No active staff found');
    return;
  }

  const testStaffId = staffList[0].staff_id;
  const endDate = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');

  // 1. CalculatePayout テスト
  const calcResult = PayoutService.calculatePayout(testStaffId, endDate);
  assert(calcResult !== null, 'calculatePayout should return result');
  assert(typeof calcResult.assignmentCount === 'number', 'should have assignmentCount');
  assert(typeof calcResult.baseAmount === 'number', 'should have baseAmount');
  assert(typeof calcResult.transportAmount === 'number', 'should have transportAmount');
  assert(typeof calcResult.totalAmount === 'number', 'should have totalAmount');
  Logger.log(`  CalculatePayout: OK (${calcResult.assignmentCount} assignments, ${calcResult.totalAmount} total)`);

  // 2. Search テスト
  const searchResult = PayoutService.search({ limit: 5 });
  assert(Array.isArray(searchResult), 'search should return array');
  Logger.log(`  Search: OK (${searchResult.length} results)`);

  // 3. markAsPaid テスト（新フロー：直接 paid で作成）
  if (calcResult.assignmentCount > 0) {
    const markResult = PayoutService.markAsPaid(testStaffId, endDate, {
      paid_date: endDate,
      adjustment_amount: 500,
      notes: 'テスト備考'
    });
    if (markResult.success) {
      const payout = markResult.payout;

      // paid ステータスで作成されることを確認
      assertEqual(payout.status, 'paid', 'should be created with paid status');
      assert(payout.paid_date, 'paid_date should be set');
      assertEqual(payout.adjustment_amount, 500, 'adjustment_amount should match');
      assertEqual(payout.notes, 'テスト備考', 'notes should match');

      Logger.log('  MarkAsPaid: OK');

      // 4. undoPayout テスト（取り消し）
      const undoResult = PayoutService.undoPayout(payout.payout_id, payout.updated_at);
      assert(undoResult.success, 'undoPayout should succeed');

      // 取り消し後は findById で取得できない
      const afterUndo = PayoutRepository.findById(payout.payout_id);
      assert(!afterUndo, 'payout should not be found after undo');

      Logger.log('  UndoPayout: OK');
    } else {
      Logger.log(`  MarkAsPaid: SKIP (${markResult.error})`);
    }
  } else {
    Logger.log('  MarkAsPaid/UndoPayout: SKIP (no unpaid assignments)');
  }

  // 5. updateStatus は paid のみ許可テスト
  const testPayout = PayoutRepository.insert({
    payout_type: 'STAFF',
    staff_id: 'status_test_' + Date.now(),
    period_start: '2025-01-01',
    period_end: '2025-01-15',
    assignment_count: 1,
    base_amount: 10000,
    total_amount: 10000,
    status: 'paid',
    paid_date: '2025-01-16'
  });

  // draft/confirmed への変更は不可
  const invalidResult = PayoutService.updateStatus(
    testPayout.payout_id,
    'draft',
    testPayout.updated_at
  );
  assert(!invalidResult.success, 'updateStatus to draft should fail');
  assertEqual(invalidResult.error, 'INVALID_STATUS', 'should return INVALID_STATUS');
  Logger.log('  UpdateStatusRestriction: OK');

  // クリーンアップ
  PayoutService.undoPayout(testPayout.payout_id, testPayout.updated_at);

  // 6. Delete テスト（undoPayout のエイリアス）
  const toDeletePayout = PayoutRepository.insert({
    payout_type: 'STAFF',
    staff_id: 'delete_service_test_' + Date.now(),
    period_start: '2025-01-01',
    period_end: '2025-01-15',
    assignment_count: 1,
    base_amount: 10000,
    transport_amount: 1000,
    total_amount: 11000,
    status: 'paid',
    paid_date: '2025-01-16'
  });

  // paid でも削除（取り消し）可能
  const deleteResult = PayoutService.delete(toDeletePayout.payout_id, toDeletePayout.updated_at);
  assert(deleteResult.success, 'delete (undo) paid payout should succeed');
  Logger.log('  Delete: OK');

  Logger.log('--- testPayoutService PASSED ---');
}

/**
 * 支払い計算ロジックのテスト
 */
function testPayoutCalculations() {
  Logger.log('--- testPayoutCalculations ---');

  // 1. calculateMonthlyPayout_ テスト
  // wage_rateを明示的に設定（getDailyRateByJobType_はjob_type用なので）
  const testStaff = {
    staff_id: 'calc_test',
    daily_rate_tobi: 15000,
    daily_rate_age: 12000,
    daily_rate_tobiage: 22500,  // 15000 * 1.5
    daily_rate_half: 7500
  };

  const testAssignments = [
    { pay_unit: 'fullday', wage_rate: 15000, transport_amount: 1000 },  // 15000 * 1.0 + 1000
    { pay_unit: 'halfday', wage_rate: 15000, transport_amount: 500 },   // 15000 * 0.5 + 500
    { pay_unit: 'am', wage_rate: 15000, transport_amount: 500 },        // 15000 * 0.5 + 500
    { pay_unit: 'fullday', wage_rate: 20000, transport_amount: 1500 }   // 20000 * 1.0 + 1500
  ];

  const calcResult = calculateMonthlyPayout_(testAssignments, testStaff);

  // Expected:
  // baseAmount = 15000 + 7500 + 7500 + 20000 = 50000
  // transportAmount = 1000 + 500 + 500 + 1500 = 3500
  // totalAmount = 53500

  assertEqual(calcResult.baseAmount, 50000, 'baseAmount should be 50000');
  assertEqual(calcResult.transportAmount, 3500, 'transportAmount should be 3500');
  assertEqual(calcResult.totalAmount, 53500, 'totalAmount should be 53500');
  Logger.log('  CalculateMonthlyPayout: OK');

  // 2. getUnitMultiplier_ テスト
  assertEqual(getUnitMultiplier_('fullday'), 1.0, 'fullday multiplier');
  assertEqual(getUnitMultiplier_('halfday'), 0.5, 'halfday multiplier');
  assertEqual(getUnitMultiplier_('am'), 0.5, 'am multiplier');
  assertEqual(getUnitMultiplier_('pm'), 0.5, 'pm multiplier');
  assertEqual(getUnitMultiplier_('jotou'), 1.0, 'jotou multiplier');
  assertEqual(getUnitMultiplier_('yakin'), 1.0, 'yakin multiplier');
  Logger.log('  UnitMultiplier: OK');

  // 3. getDailyRateByJobType_ テスト（実装に存在するケースのみ）
  assertEqual(getDailyRateByJobType_(testStaff, 'tobi'), 15000, 'tobi rate');
  // tobiageはtobi * TOBIAGE_MULTIPLIER（1.5）で計算される
  assertEqual(getDailyRateByJobType_(testStaff, 'tobiage'), Math.floor(15000 * 1.5), 'tobiage rate');
  assertEqual(getDailyRateByJobType_(testStaff, 'half'), 7500, 'half rate');
  // 存在しないジョブタイプは0を返す
  assertEqual(getDailyRateByJobType_(testStaff, 'unknown'), 0, 'unknown type returns 0');
  Logger.log('  DailyRateByJobType: OK');

  Logger.log('--- testPayoutCalculations PASSED ---');
}

/**
 * テストユーティリティ
 */
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

/**
 * T_Payoutsシートのヘッダーと実データを確認
 * GASエディタから実行してログを確認
 */
function debugPayoutsSheet() {
  Logger.log('=== Debug T_Payouts Sheet ===');

  const sheet = getSheet('T_Payouts');
  if (!sheet) {
    Logger.log('ERROR: T_Payouts sheet not found');
    return;
  }

  const headers = getHeaders(sheet);
  Logger.log('Headers: ' + JSON.stringify(headers));

  // 必要なカラムが存在するか確認
  const requiredColumns = ['period_start', 'period_end', 'assignment_count'];
  for (const col of requiredColumns) {
    const idx = headers.indexOf(col);
    Logger.log(`  ${col}: ${idx >= 0 ? 'Found at index ' + idx : 'MISSING!'}`);
  }

  // 最初の5件のデータを表示
  const data = sheet.getDataRange().getValues();
  Logger.log('Total rows (including header): ' + data.length);

  if (data.length > 1) {
    Logger.log('--- Sample data (first 3 rows) ---');
    for (let i = 1; i < Math.min(4, data.length); i++) {
      const row = data[i];
      const rowObj = {};
      headers.forEach((h, idx) => {
        if (row[idx] !== '' && row[idx] !== null && row[idx] !== undefined) {
          rowObj[h] = row[idx];
        }
      });
      Logger.log(`Row ${i}: ${JSON.stringify(rowObj)}`);
    }
  }

  Logger.log('=== Debug Complete ===');
}

/**
 * T_Payoutsシートのスキーマを新しい差分支払い方式に移行
 * billing_year, billing_month → period_start, period_end, assignment_count
 */
function migratePayoutsSchema() {
  Logger.log('=== Migrate T_Payouts Schema ===');

  const sheet = getSheet('T_Payouts');
  if (!sheet) {
    Logger.log('ERROR: T_Payouts sheet not found');
    return;
  }

  const currentHeaders = getHeaders(sheet);
  Logger.log('Current headers: ' + JSON.stringify(currentHeaders));

  // billing_year, billing_monthのインデックスを取得
  const billingYearIdx = currentHeaders.indexOf('billing_year');
  const billingMonthIdx = currentHeaders.indexOf('billing_month');

  if (billingYearIdx === -1 || billingMonthIdx === -1) {
    Logger.log('Old schema columns not found. Checking for new schema...');

    // 新しいカラムが既にあるか確認
    if (currentHeaders.includes('period_start')) {
      Logger.log('New schema already in place. No migration needed.');
      return;
    }

    Logger.log('ERROR: Unexpected schema state');
    return;
  }

  Logger.log('Found old schema: billing_year at ' + billingYearIdx + ', billing_month at ' + billingMonthIdx);

  // 新しいヘッダーを設定
  const newHeaders = [
    'payout_id', 'payout_type', 'staff_id', 'subcontractor_id',
    'period_start', 'period_end', 'assignment_count',
    'base_amount', 'transport_amount', 'adjustment_amount',
    'tax_amount', 'total_amount', 'status', 'paid_date', 'notes', 'created_at',
    'created_by', 'updated_at', 'updated_by', 'is_deleted'
  ];

  // ヘッダー行を更新
  sheet.getRange(1, 1, 1, newHeaders.length).setValues([newHeaders]);
  Logger.log('Updated headers to: ' + JSON.stringify(newHeaders));

  // 既存データの移行（billing_year/monthをperiod_start/endに変換）
  const dataRange = sheet.getDataRange();
  const data = dataRange.getValues();

  if (data.length > 1) {
    Logger.log('Migrating ' + (data.length - 1) + ' data rows...');

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const billingYear = row[billingYearIdx];
      const billingMonth = row[billingMonthIdx];

      // billing_year/monthからperiod_start/endを計算
      if (billingYear && billingMonth) {
        const year = parseInt(billingYear);
        const month = parseInt(billingMonth);
        const periodStart = `${year}-${String(month).padStart(2, '0')}-01`;
        const lastDay = new Date(year, month, 0).getDate();
        const periodEnd = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;

        // 新しいカラム位置に設定
        row[4] = periodStart;  // period_start
        row[5] = periodEnd;    // period_end
        row[6] = 0;            // assignment_count (不明なので0)
      } else {
        row[4] = '';  // period_start
        row[5] = '';  // period_end
        row[6] = 0;   // assignment_count
      }

      // base_amount以降のデータを正しい位置にシフト
      // Old: [0-3, billing_year, billing_month, base_amount...]
      // New: [0-3, period_start, period_end, assignment_count, base_amount...]
      // base_amountは元々index 6、新しくはindex 7
      // 既に配置されているので、シフトは不要（ヘッダーの変更のみ）
    }

    // 更新したデータを書き戻し
    sheet.getRange(1, 1, data.length, newHeaders.length).setValues(data);
  }

  Logger.log('=== Migration Complete ===');
  Logger.log('Run debugPayoutsSheet() to verify the migration.');
}

/**
 * T_Payoutsシートをリセットして新しいスキーマで再作成
 * 既存データを削除して新しいヘッダーのみを設定
 */
function resetPayoutsSheet() {
  Logger.log('=== Reset T_Payouts Sheet ===');

  const sheet = getSheet('T_Payouts');
  if (!sheet) {
    Logger.log('ERROR: T_Payouts sheet not found');
    return;
  }

  // 全データをクリア
  sheet.clear();

  // 新しいヘッダーを設定
  const newHeaders = [
    'payout_id', 'payout_type', 'staff_id', 'subcontractor_id',
    'period_start', 'period_end', 'assignment_count',
    'base_amount', 'transport_amount', 'adjustment_amount',
    'tax_amount', 'total_amount', 'status', 'paid_date', 'notes', 'created_at',
    'created_by', 'updated_at', 'updated_by', 'is_deleted'
  ];

  sheet.getRange(1, 1, 1, newHeaders.length).setValues([newHeaders]);
  Logger.log('Reset complete. New headers: ' + JSON.stringify(newHeaders));
  Logger.log('=== Reset Complete ===');
}

/**
 * 支払履歴テストデータを作成
 * GASエディタから実行して、UIで支払履歴の表示をテストする
 */
function createPayoutHistoryTestData() {
  Logger.log('=== Create Payout History Test Data ===');

  // アクティブなスタッフを取得
  const staffList = StaffRepository.search({ is_active: true, limit: 3 });
  if (staffList.length === 0) {
    Logger.log('ERROR: No active staff found');
    return;
  }

  const now = new Date();
  const results = [];

  for (const staff of staffList) {
    // 過去3ヶ月分の支払履歴を作成
    for (let monthsAgo = 1; monthsAgo <= 3; monthsAgo++) {
      const periodEnd = new Date(now.getFullYear(), now.getMonth() - monthsAgo + 1, 0);
      const periodStart = new Date(periodEnd.getFullYear(), periodEnd.getMonth(), 1);
      const paidDate = new Date(periodEnd.getFullYear(), periodEnd.getMonth() + 1, 10);

      const baseAmount = 100000 + Math.floor(Math.random() * 50000);
      const transportAmount = 5000 + Math.floor(Math.random() * 5000);
      const adjustmentAmount = Math.random() > 0.7 ? Math.floor(Math.random() * 5000) - 2500 : 0;
      const totalAmount = baseAmount + transportAmount + adjustmentAmount;

      const payout = {
        payout_type: 'STAFF',
        staff_id: staff.staff_id,
        period_start: Utilities.formatDate(periodStart, 'Asia/Tokyo', 'yyyy-MM-dd'),
        period_end: Utilities.formatDate(periodEnd, 'Asia/Tokyo', 'yyyy-MM-dd'),
        assignment_count: 10 + Math.floor(Math.random() * 10),
        base_amount: baseAmount,
        transport_amount: transportAmount,
        adjustment_amount: adjustmentAmount,
        tax_amount: 0,
        total_amount: totalAmount,
        status: 'paid',
        paid_date: Utilities.formatDate(paidDate, 'Asia/Tokyo', 'yyyy-MM-dd'),
        notes: monthsAgo === 1 ? 'テスト支払い' : ''
      };

      const inserted = PayoutRepository.insert(payout);
      // statusとpaid_dateを更新（insertでは反映されないため）
      PayoutRepository.update({
        payout_id: inserted.payout_id,
        status: 'paid',
        paid_date: payout.paid_date
      }, inserted.updated_at);

      results.push({
        staff: staff.name,
        period: payout.period_start + ' ~ ' + payout.period_end,
        amount: totalAmount
      });

      Logger.log(`Created: ${staff.name} - ${payout.period_start} ~ ${payout.period_end}: ¥${totalAmount}`);
    }
  }

  Logger.log(`=== Created ${results.length} payout history records ===`);
  return results;
}

/**
 * 支払履歴テストデータを削除
 */
function clearPayoutHistoryTestData() {
  Logger.log('=== Clear Payout History Test Data ===');

  const payouts = PayoutRepository.search({ status: 'paid' });
  let deleted = 0;

  for (const payout of payouts) {
    PayoutRepository.softDelete(payout.payout_id, payout.updated_at);
    deleted++;
  }

  Logger.log(`Deleted ${deleted} payout records`);
  Logger.log('=== Clear Complete ===');
}

// ========== P2-3改善版: 追加テスト ==========

/**
 * Confirmedワークフローのテスト
 * confirmed → paid の2段階ワークフロー
 */
function testConfirmedWorkflow() {
  Logger.log('--- testConfirmedWorkflow ---');

  // 1. テストPayoutを confirmed ステータスで作成
  const testStaffId = 'workflow_test_' + Date.now();
  const testPayout = PayoutRepository.insert({
    payout_type: 'STAFF',
    staff_id: testStaffId,
    period_start: '2025-01-01',
    period_end: '2025-01-15',
    assignment_count: 5,
    base_amount: 50000,
    transport_amount: 5000,
    total_amount: 55000,
    status: 'confirmed'
  });

  assertEqual(testPayout.status, 'confirmed', 'initial status should be confirmed');
  Logger.log('  Create confirmed: OK');

  // 2. confirmed → paid 遷移テスト
  const payResult = PayoutService.payConfirmedPayout(testPayout.payout_id, {
    paid_date: '2025-01-20',
    expectedUpdatedAt: testPayout.updated_at
  });

  assert(payResult.success, 'payConfirmedPayout should succeed');
  assertEqual(payResult.payout.status, 'paid', 'status should be paid');
  assertEqual(payResult.payout.paid_date, '2025-01-20', 'paid_date should be set');
  Logger.log('  Confirmed → Paid: OK');

  // 3. paid から他ステータスへの変更は不可
  const invalidStatusResult = PayoutService.updateStatus(
    payResult.payout.payout_id,
    'confirmed',
    payResult.payout.updated_at
  );
  assert(!invalidStatusResult.success, 'changing from paid should fail');
  assertEqual(invalidStatusResult.error, 'INVALID_STATUS', 'should return INVALID_STATUS');
  Logger.log('  Status restriction: OK');

  // 4. undoPayout でキャンセル可能
  const undoResult = PayoutService.undoPayout(
    payResult.payout.payout_id,
    payResult.payout.updated_at
  );
  assert(undoResult.success, 'undoPayout should succeed');

  const afterUndo = PayoutRepository.findById(payResult.payout.payout_id);
  assert(!afterUndo, 'payout should not be found after undo');
  Logger.log('  UndoPayout: OK');

  Logger.log('--- testConfirmedWorkflow PASSED ---');
}

/**
 * 二重計上防止のテスト
 * Assignmentにpayout_idが設定されると、未払い一覧から除外される
 */
function testDoubleEntryPrevention() {
  Logger.log('--- testDoubleEntryPrevention ---');

  // テスト用スタッフを取得
  const staffList = StaffRepository.search({ is_active: true, limit: 1 });
  if (staffList.length === 0) {
    Logger.log('  SKIP: No active staff found');
    return;
  }

  const testStaffId = staffList[0].staff_id;
  const endDate = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');

  // 1. 初回の未払い配置を取得
  const initialAssignments = PayoutService.getUnpaidAssignments(testStaffId, endDate);
  Logger.log(`  Initial unpaid assignments: ${initialAssignments.length}`);

  if (initialAssignments.length === 0) {
    Logger.log('  SKIP: No unpaid assignments found');
    return;
  }

  // 2. confirmPayout でレコード作成（payout_id紐付け）
  const confirmResult = PayoutService.confirmPayout(testStaffId, endDate, {
    notes: '二重計上防止テスト'
  });

  assert(confirmResult.success, 'confirmPayout should succeed');
  const payoutId = confirmResult.payout.payout_id;
  Logger.log(`  Created payout: ${payoutId}`);

  // 3. 同じスタッフで再度未払い取得 → 0件になるはず
  const afterConfirmAssignments = PayoutService.getUnpaidAssignments(testStaffId, endDate);
  Logger.log(`  After confirm unpaid: ${afterConfirmAssignments.length}`);

  assertEqual(afterConfirmAssignments.length, 0, 'should have no unpaid after confirm');
  Logger.log('  Double entry prevention: OK');

  // 4. undoPayout で payout_id クリア確認
  const undoResult = PayoutService.undoPayout(payoutId, confirmResult.payout.updated_at);
  assert(undoResult.success, 'undoPayout should succeed');

  // 5. 未払い配置が復元されるか確認
  const afterUndoAssignments = PayoutService.getUnpaidAssignments(testStaffId, endDate);
  Logger.log(`  After undo unpaid: ${afterUndoAssignments.length}`);

  assertEqual(afterUndoAssignments.length, initialAssignments.length,
    'should restore unpaid count after undo');
  Logger.log('  Undo restore: OK');

  Logger.log('--- testDoubleEntryPrevention PASSED ---');
}

/**
 * 源泉徴収税計算のテスト
 * withholding_tax_applicable = true の場合のみ 10.21% 控除
 */
function testWithholdingTaxCalculation() {
  Logger.log('--- testWithholdingTaxCalculation ---');

  const WITHHOLDING_TAX_RATE = 0.1021;

  // 1. 源泉徴収対象スタッフのテスト
  const staffWithTax = {
    staff_id: 'tax_test_1',
    name: 'テストスタッフ（源泉徴収あり）',
    withholding_tax_applicable: true
  };

  const baseAmount1 = 100000;
  const expectedTax = Math.floor(baseAmount1 * WITHHOLDING_TAX_RATE);  // 10,210

  const tax1 = PayoutService._calculateWithholdingTax(staffWithTax, baseAmount1);
  assertEqual(tax1, expectedTax, `withholding tax should be ${expectedTax}`);
  Logger.log(`  Tax applicable (100,000): ${tax1} (expected ${expectedTax}): OK`);

  // 2. 源泉徴収非対象スタッフのテスト
  const staffWithoutTax = {
    staff_id: 'tax_test_2',
    name: 'テストスタッフ（源泉徴収なし）',
    withholding_tax_applicable: false
  };

  const tax2 = PayoutService._calculateWithholdingTax(staffWithoutTax, baseAmount1);
  assertEqual(tax2, 0, 'no tax for non-applicable staff');
  Logger.log('  Tax not applicable: 0: OK');

  // 3. withholding_tax_applicable 未設定の場合（falsy）
  const staffNoFlag = {
    staff_id: 'tax_test_3',
    name: 'テストスタッフ（フラグなし）'
  };

  const tax3 = PayoutService._calculateWithholdingTax(staffNoFlag, baseAmount1);
  assertEqual(tax3, 0, 'no tax when flag is undefined');
  Logger.log('  Flag undefined: 0: OK');

  // 4. null スタッフの場合
  const tax4 = PayoutService._calculateWithholdingTax(null, baseAmount1);
  assertEqual(tax4, 0, 'no tax when staff is null');
  Logger.log('  Null staff: 0: OK');

  // 5. 計算精度テスト（端数切り捨て確認）
  const baseAmount2 = 123456;
  const expectedTax2 = Math.floor(baseAmount2 * WITHHOLDING_TAX_RATE);  // 12,604
  const tax5 = PayoutService._calculateWithholdingTax(staffWithTax, baseAmount2);
  assertEqual(tax5, expectedTax2, 'should floor the tax amount');
  Logger.log(`  Floor precision (123,456): ${tax5} (expected ${expectedTax2}): OK`);

  Logger.log('--- testWithholdingTaxCalculation PASSED ---');
}

/**
 * paid_dateバリデーションのテスト
 * - period_end以降であること
 * - 未来日は30日以内であること
 */
function testPaidDateValidation() {
  Logger.log('--- testPaidDateValidation ---');

  // テスト用Payoutを作成
  const testPayout = PayoutRepository.insert({
    payout_type: 'STAFF',
    staff_id: 'validation_test_' + Date.now(),
    period_start: '2025-06-01',
    period_end: '2025-06-15',
    assignment_count: 3,
    base_amount: 30000,
    total_amount: 30000,
    status: 'confirmed'
  });

  const payoutId = testPayout.payout_id;
  Logger.log(`  Created test payout: ${payoutId}, period_end: 2025-06-15`);

  // 1. period_end より前の日付は不可（API層でバリデーション）
  const validation1 = _validatePaidDate(payoutId, '2025-06-10');  // period_end (15) より前
  assert(!validation1.valid, 'paid_date before period_end should be invalid');
  assert(validation1.error.includes('period_end'), 'error should mention period_end');
  Logger.log('  Before period_end: rejected: OK');

  // 2. period_end と同日は OK
  const validation2 = _validatePaidDate(payoutId, '2025-06-15');
  assert(validation2.valid, 'paid_date equal to period_end should be valid');
  Logger.log('  Equal to period_end: accepted: OK');

  // 3. period_end より後は OK
  const validation3 = _validatePaidDate(payoutId, '2025-06-20');
  assert(validation3.valid, 'paid_date after period_end should be valid');
  Logger.log('  After period_end: accepted: OK');

  // 4. 30日以上先の未来日は不可
  const today = new Date();
  const farFuture = new Date(today);
  farFuture.setDate(farFuture.getDate() + 60);
  const farFutureStr = Utilities.formatDate(farFuture, 'Asia/Tokyo', 'yyyy-MM-dd');

  // period_endを今日以前に設定した別のPayoutでテスト
  const testPayout2 = PayoutRepository.insert({
    payout_type: 'STAFF',
    staff_id: 'future_test_' + Date.now(),
    period_start: '2024-01-01',
    period_end: '2024-01-15',  // 過去のperiod_end
    assignment_count: 1,
    base_amount: 10000,
    total_amount: 10000,
    status: 'confirmed'
  });

  const validation4 = _validatePaidDate(testPayout2.payout_id, farFutureStr);
  assert(!validation4.valid, 'paid_date 60 days in future should be invalid');
  assert(validation4.error.includes('30 days'), 'error should mention 30 days limit');
  Logger.log('  Far future (60 days): rejected: OK');

  // クリーンアップ
  PayoutRepository.softDelete(payoutId, testPayout.updated_at);
  PayoutRepository.softDelete(testPayout2.payout_id, testPayout2.updated_at);

  Logger.log('--- testPaidDateValidation PASSED ---');
}

