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
    testPayoutCalculations
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
 * PayoutService のテスト
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

  // 3. Status Transition テスト
  // 新規支払いを作成
  if (calcResult.assignmentCount > 0) {
    const generateResult = PayoutService.generatePayout(testStaffId, endDate);
    if (generateResult.success) {
      const payout = generateResult.payout;

      // draft -> confirmed
      const confirmResult = PayoutService.updateStatus(
        payout.payout_id,
        'confirmed',
        payout.updated_at
      );
      assert(confirmResult.success, 'draft -> confirmed should succeed');

      // confirmed -> paid
      const paidResult = PayoutService.updateStatus(
        payout.payout_id,
        'paid',
        confirmResult.payout.updated_at
      );
      assert(paidResult.success, 'confirmed -> paid should succeed');

      // paid -> draft は不可
      const invalidResult = PayoutService.updateStatus(
        payout.payout_id,
        'draft',
        paidResult.payout.updated_at
      );
      assert(!invalidResult.success, 'paid -> draft should fail');
      assertEqual(invalidResult.error, 'INVALID_STATUS_TRANSITION', 'should return INVALID_STATUS_TRANSITION');

      Logger.log('  StatusTransition: OK');
    } else {
      Logger.log(`  StatusTransition: SKIP (${generateResult.error})`);
    }
  } else {
    Logger.log('  StatusTransition: SKIP (no unpaid assignments)');
  }

  // 4. Delete テスト
  const toDeletePayout = PayoutRepository.insert({
    payout_type: 'STAFF',
    staff_id: 'delete_service_test_' + Date.now(),
    period_start: '2025-01-01',
    period_end: '2025-01-15',
    assignment_count: 1,
    base_amount: 10000,
    transport_amount: 1000,
    total_amount: 11000,
    status: 'draft'
  });

  const deleteResult = PayoutService.delete(toDeletePayout.payout_id, toDeletePayout.updated_at);
  assert(deleteResult.success, 'delete draft payout should succeed');
  Logger.log('  Delete: OK');

  // 5. Delete paid payout は不可
  const paidPayout = PayoutRepository.insert({
    payout_type: 'STAFF',
    staff_id: 'paid_delete_test_' + Date.now(),
    period_start: '2025-01-01',
    period_end: '2025-01-15',
    assignment_count: 1,
    base_amount: 10000,
    total_amount: 10000,
    status: 'paid',
    paid_date: '2025-01-16'
  });

  const deletePaidResult = PayoutService.delete(paidPayout.payout_id, paidPayout.updated_at);
  assert(!deletePaidResult.success, 'delete paid payout should fail');
  assertEqual(deletePaidResult.error, 'CANNOT_DELETE_PAID', 'should return CANNOT_DELETE_PAID');
  Logger.log('  DeletePaidFail: OK');

  Logger.log('--- testPayoutService PASSED ---');
}

/**
 * 支払い計算ロジックのテスト
 */
function testPayoutCalculations() {
  Logger.log('--- testPayoutCalculations ---');

  // 1. calculateMonthlyPayout_ テスト
  const testStaff = {
    staff_id: 'calc_test',
    daily_rate_tobi: 15000,
    daily_rate_age: 12000,
    daily_rate_tobiage: 22500,  // 15000 * 1.5
    daily_rate_half: 7500
  };

  const testAssignments = [
    { pay_unit: 'fullday', wage_rate: null, transport_amount: 1000 },  // 15000 * 1.0 + 1000
    { pay_unit: 'halfday', wage_rate: null, transport_amount: 500 },   // 15000 * 0.5 + 500
    { pay_unit: 'am', wage_rate: null, transport_amount: 500 },        // 15000 * 0.5 + 500
    { pay_unit: 'fullday', wage_rate: 20000, transport_amount: 1500 }  // 20000 * 1.0 + 1500 (override)
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

  // 3. getDailyRateByJobType_ テスト
  assertEqual(getDailyRateByJobType_(testStaff, 'tobi'), 15000, 'tobi rate');
  assertEqual(getDailyRateByJobType_(testStaff, 'age'), 12000, 'age rate');
  assertEqual(getDailyRateByJobType_(testStaff, 'tobiage'), 22500, 'tobiage rate');
  assertEqual(getDailyRateByJobType_(testStaff, 'half'), 7500, 'half rate');
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
