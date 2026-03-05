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
    testPaidDateValidation,
    testProgressiveWithholdingBrackets,
    testWithholdingTaxIntegration
  ];

  let passed = 0;
  let failed = 0;
  let skipped = 0;

  for (const test of tests) {
    try {
      const result = test();
      if (result && result.skipped) {
        skipped++;
        Logger.log(`- ${test.name} SKIPPED: ${result.reason || 'no reason'}`);
      } else {
        passed++;
        Logger.log(`✓ ${test.name} PASSED`);
      }
    } catch (error) {
      failed++;
      Logger.log(`✗ ${test.name} FAILED: ${error.message}`);
    }
  }

  Logger.log(`=== Payout Tests Complete: ${passed} passed, ${failed} failed, ${skipped} skipped ===`);
  return { passed, failed, skipped };
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
  assertEqual(found.period_start, '2025-01-01', 'period_start should match');
  assertEqual(found.period_end, '2025-01-15', 'period_end should match');
  assertEqual(found.total_amount, 55000, 'total_amount should match');
  assertEqual(found.status, 'draft', 'status should be draft');
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
  assert(searchResult.length > 0, 'search should return at least 1 result');
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

  // メインの挿入データもクリーンアップ
  PayoutRepository.softDelete(inserted.payout_id, inserted.updated_at);

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
    return { skipped: true, reason: 'No active staff found' };
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
    { pay_unit: 'halfday', wage_rate: 15000, transport_amount: 500 },   // 15000 * 1.0 + 500
    { pay_unit: 'am', wage_rate: 15000, transport_amount: 500 },        // 15000 * 1.0 + 500
    { pay_unit: 'fullday', wage_rate: 20000, transport_amount: 1500 }   // 20000 * 1.0 + 1500
  ];

  const calcResult = calculateMonthlyPayout_(testAssignments, testStaff);

  // Expected:
  // baseAmount = 15000 + 15000 + 15000 + 20000 = 65000
  // transportAmount = 1000 + 500 + 500 + 1500 = 3500
  // totalAmount = 68500

  assertEqual(calcResult.baseAmount, 65000, 'baseAmount should be 65000');
  assertEqual(calcResult.transportAmount, 3500, 'transportAmount should be 3500');
  assertEqual(calcResult.totalAmount, 68500, 'totalAmount should be 68500');
  Logger.log('  CalculateMonthlyPayout: OK');

  // 2. getDailyRateByJobType_ テスト（実装に存在するケースのみ）
  assertEqual(getDailyRateByJobType_(testStaff, 'tobi'), 15000, 'tobi rate');
  // tobiageはtobi * TOBIAGE_MULTIPLIER（1.5）で計算される
  assertEqual(getDailyRateByJobType_(testStaff, 'tobiage'), 22500, 'tobiage rate (15000×1.5=22500)');
  assertEqual(getDailyRateByJobType_(testStaff, 'half'), 7500, 'half rate');
  // 存在しないジョブタイプ → basic fallback → tobi fallback = 15000
  assertEqual(getDailyRateByJobType_(testStaff, 'unknown'), 15000, 'unknown → tobi fallback');
  // 全rate未設定 → 0
  assertEqual(getDailyRateByJobType_({}, 'unknown'), 0, 'unknown + 全未設定 → 0');
  Logger.log('  DailyRateByJobType: OK');

  Logger.log('--- testPayoutCalculations PASSED ---');
}

// assert関数はtest_helpers.gsで統一定義

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
    return { skipped: true, reason: 'No active staff found' };
  }

  const testStaffId = staffList[0].staff_id;
  const endDate = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');

  // 1. 初回の未払い配置を取得
  const initialAssignments = PayoutService.getUnpaidAssignments(testStaffId, endDate);
  Logger.log(`  Initial unpaid assignments: ${initialAssignments.length}`);

  if (initialAssignments.length === 0) {
    Logger.log('  SKIP: No unpaid assignments found');
    return { skipped: true, reason: 'No unpaid assignments found' };
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
 * 源泉徴収税計算のテスト（日額テーブル版）
 * lookupDailyWithholdingTax: 日額表（甲欄・扶養0人）でテーブル参照
 */
function testWithholdingTaxCalculation() {
  Logger.log('--- testWithholdingTaxCalculation (日額テーブル版) ---');

  // 1. お客様実データ検証（12月度明細書）
  assertEqual(lookupDailyWithholdingTax(7500), 190, 'daily 7500 → 190');
  assertEqual(lookupDailyWithholdingTax(10000), 280, 'daily 10000 → 280');
  assertEqual(lookupDailyWithholdingTax(8500), 225, 'daily 8500 → 225');
  assertEqual(lookupDailyWithholdingTax(13000), 525, 'daily 13000 → 525');
  Logger.log('  お客様実データ4件: OK');

  // 2. 境界値
  assertEqual(lookupDailyWithholdingTax(0), 0, '0 → 0');
  assertEqual(lookupDailyWithholdingTax(2899), 0, '2899 → 0 (非課税)');
  assertEqual(lookupDailyWithholdingTax(2900), 5, '2900 → 5 (課税開始)');
  Logger.log('  境界値: OK');

  // 3. 24,000円超（累進計算式）
  assertEqual(lookupDailyWithholdingTax(24000), 2305, '24000 → 2305');
  Logger.log('  累進計算: OK');

  // 4. _calculateWithholdingTaxTotal: 非対象スタッフ → 0
  const staffNoTax = { staff_id: 'test', withholding_tax_applicable: false };
  const tax0 = PayoutService._calculateWithholdingTaxTotal([], staffNoTax, new Map(), new Map());
  assertEqual(tax0, 0, '非対象スタッフ → 0');

  // 5. _calculateWithholdingTaxTotal: null スタッフ → 0
  const taxNull = PayoutService._calculateWithholdingTaxTotal([], null, new Map(), new Map());
  assertEqual(taxNull, 0, 'null staff → 0');
  Logger.log('  スタッフフラグ: OK');

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

/**
 * 累進源泉徴収ブラケット全境界テスト
 * 8ブラケット × base + top + off-by-one を網羅
 * 全expected値はNode.jsで事前検算済み
 */
function testProgressiveWithholdingBrackets() {
  Logger.log('--- testProgressiveWithholdingBrackets ---');

  // brackets: [threshold, baseTax, rate]
  // [24000,2305,0.2042], [26000,2715,0.23483], [32000,4125,0.33693],
  // [57000,12550,0.4084], [72500,19060,0.4084], [73500,19655,0.4084],
  // [75000,20450,0.4084], [116500,37400,0.45945]

  const cases = [
    // Bracket 1: 24000-25999
    { amount: 24000, expected: 2305, label: 'bracket1 base' },
    { amount: 25999, expected: 2713, label: 'bracket1 top: floor(2305+1999×0.2042)=2713' },
    // Bracket 2: 26000-31999
    { amount: 26000, expected: 2715, label: 'bracket2 base' },
    { amount: 31999, expected: 4123, label: 'bracket2 top: floor(2715+5999×0.23483)=4123' },
    // Bracket 3: 32000-56999
    { amount: 32000, expected: 4125, label: 'bracket3 base' },
    { amount: 56999, expected: 12547, label: 'bracket3 top: floor(4125+24999×0.33693)=12547' },
    // Bracket 4: 57000-72499
    { amount: 57000, expected: 12550, label: 'bracket4 base' },
    { amount: 72499, expected: 18879, label: 'bracket4 top (off-by-one)' },
    // Bracket 5: 72500-73499
    { amount: 72500, expected: 19060, label: 'bracket5 base (ジャンプ)' },
    { amount: 73499, expected: 19467, label: 'bracket5 top (off-by-one)' },
    // Bracket 6: 73500-74999
    { amount: 73500, expected: 19655, label: 'bracket6 base' },
    { amount: 74999, expected: 20267, label: 'bracket6 top (off-by-one)' },
    // Bracket 7: 75000-116499
    { amount: 75000, expected: 20450, label: 'bracket7 base' },
    { amount: 116499, expected: 37398, label: 'bracket7 top (off-by-one)' },
    // Bracket 8: 116500+
    { amount: 116500, expected: 37400, label: 'bracket8 base' },
    { amount: 200000, expected: 75764, label: 'bracket8: floor(37400+83500×0.45945)=75764' }
  ];

  for (const c of cases) {
    assertEqual(lookupDailyWithholdingTax(c.amount), c.expected, c.label);
  }

  Logger.log('  全16ブラケット境界: OK');
  Logger.log('--- testProgressiveWithholdingBrackets PASSED ---');
}

/**
 * _calculateWithholdingTaxTotal 統合テスト ★最重要
 * CR-084: 配置単位で個別テーブル参照・人工割・非対象スタッフを検証
 */
function testWithholdingTaxIntegration() {
  Logger.log('--- testWithholdingTaxIntegration ---');

  // === Case A: 単一日・単一配置 ===
  // daily=15000 → lookup=725
  {
    const staff = { staff_id: 'test_a', withholding_tax_applicable: true, daily_rate_basic: 15000 };
    const assignments = [{ job_id: 'j1', wage_rate: 15000, pay_unit: 'basic', work_date: '2025-01-10' }];
    const jobMap = new Map([['j1', { work_date: '2025-01-10', required_count: 1 }]]);
    const countMap = new Map([['j1', 1]]);

    const result = PayoutService._calculateWithholdingTaxTotal(assignments, staff, jobMap, countMap);
    assertEqual(result, 725, 'Case A: 単一日15000 → 725');
  }
  Logger.log('  Case A (単一配置): OK');

  // === Case B: 同日2配置 → 配置単位で個別参照 (CR-084) ===
  // lookup(8000)=210, lookup(7000)=175 → 合計385
  // (旧ロジック: 合算15000→725)
  {
    const staff = { staff_id: 'test_b', withholding_tax_applicable: true, daily_rate_basic: 15000 };
    const assignments = [
      { job_id: 'j1', wage_rate: 8000, pay_unit: 'basic', work_date: '2025-01-10' },
      { job_id: 'j2', wage_rate: 7000, pay_unit: 'basic', work_date: '2025-01-10' }
    ];
    const jobMap = new Map([
      ['j1', { work_date: '2025-01-10', required_count: 1 }],
      ['j2', { work_date: '2025-01-10', required_count: 1 }]
    ]);
    const countMap = new Map([['j1', 1], ['j2', 1]]);

    const result = PayoutService._calculateWithholdingTaxTotal(assignments, staff, jobMap, countMap);
    assertEqual(result, 385, 'Case B: 配置単位 lookup(8000)+lookup(7000)=210+175=385');
  }
  Logger.log('  Case B (配置単位): OK');

  // === Case C: 異なる日 ===
  // j1=10000(1/10), j2=13000(1/11) → lookup(10000)+lookup(13000)=280+525=805
  {
    const staff = { staff_id: 'test_c', withholding_tax_applicable: true, daily_rate_basic: 15000 };
    const assignments = [
      { job_id: 'j1', wage_rate: 10000, pay_unit: 'basic', work_date: '2025-01-10' },
      { job_id: 'j2', wage_rate: 13000, pay_unit: 'basic', work_date: '2025-01-11' }
    ];
    const jobMap = new Map([
      ['j1', { work_date: '2025-01-10', required_count: 1 }],
      ['j2', { work_date: '2025-01-11', required_count: 1 }]
    ]);
    const countMap = new Map([['j1', 1], ['j2', 1]]);

    const result = PayoutService._calculateWithholdingTaxTotal(assignments, staff, jobMap, countMap);
    assertEqual(result, 805, 'Case C: 異なる日 10000+13000 → 280+525=805');
  }
  Logger.log('  Case C (異なる日): OK');

  // === Case D: am pay_unit + wage_rate=null ===
  // getDailyRateByJobType_('am') → basic=15000, multiplier('am')=0.5 → wage=7500
  // lookup(7500)=190
  {
    const staff = { staff_id: 'test_d', withholding_tax_applicable: true, daily_rate_basic: 15000, daily_rate_tobi: 15000 };
    const assignments = [
      { job_id: 'j1', wage_rate: null, pay_unit: 'am', work_date: '2025-01-10' }
    ];
    const jobMap = new Map([['j1', { work_date: '2025-01-10', required_count: 1 }]]);
    const countMap = new Map([['j1', 1]]);

    const result = PayoutService._calculateWithholdingTaxTotal(assignments, staff, jobMap, countMap);
    assertEqual(result, 190, 'Case D: am + null wage → basic×0.5=7500 → 190');
  }
  Logger.log('  Case D (am + null wage): OK');

  // === Case E: 人工割で日額変動 ===
  // wage=15000, required=2, actual=3 → coeff=floor(2/3*10)/10=0.6
  // adjustment = floor(15000×0.6)-15000 = 9000-15000 = -6000
  // daily = 15000 + (-6000) = 9000
  // lookup(9000)=245
  {
    const staff = { staff_id: 'test_e', withholding_tax_applicable: true, daily_rate_basic: 15000 };
    const assignments = [
      { job_id: 'j1', wage_rate: 15000, pay_unit: 'basic', work_date: '2025-01-10' }
    ];
    const jobMap = new Map([['j1', { work_date: '2025-01-10', required_count: 2 }]]);
    const countMap = new Map([['j1', 3]]);

    const result = PayoutService._calculateWithholdingTaxTotal(assignments, staff, jobMap, countMap);
    assertEqual(result, 245, 'Case E: 人工割 15000×0.6=9000 → 245');
  }
  Logger.log('  Case E (人工割): OK');

  // === Case F: 非対象スタッフ ===
  {
    const staff = { staff_id: 'test_f', withholding_tax_applicable: false, daily_rate_basic: 15000 };
    const assignments = [
      { job_id: 'j1', wage_rate: 15000, pay_unit: 'basic', work_date: '2025-01-10' }
    ];
    const jobMap = new Map([['j1', { work_date: '2025-01-10', required_count: 1 }]]);
    const countMap = new Map([['j1', 1]]);

    const result = PayoutService._calculateWithholdingTaxTotal(assignments, staff, jobMap, countMap);
    assertEqual(result, 0, 'Case F: 非対象スタッフ → 0');
  }
  Logger.log('  Case F (非対象): OK');

  // === Case G: 空 assignments + 対象スタッフ → 早期return 0 ===
  {
    const staff = { staff_id: 'test_g', withholding_tax_applicable: true, daily_rate_basic: 15000 };
    const result = PayoutService._calculateWithholdingTaxTotal([], staff, new Map(), new Map());
    assertEqual(result, 0, 'Case G: 空assignments + 対象スタッフ → 0');
  }
  Logger.log('  Case G (空assignments): OK');

  // === Case H: jobMap にない job_id → asg.work_date フォールバック ===
  // job_id='missing' は jobMap に存在しない → job=undefined → workDate は asg.work_date を使用
  {
    const staff = { staff_id: 'test_h', withholding_tax_applicable: true, daily_rate_basic: 15000 };
    const assignments = [
      { job_id: 'missing', wage_rate: 10000, pay_unit: 'basic', work_date: '2025-01-12' }
    ];
    const jobMap = new Map(); // job_id 'missing' は未登録
    const countMap = new Map();
    // job=undefined → required_count=0 → coeff=1.0 (ガード) → adjustment=0
    // wage=10000, daily=10000 → lookup(10000)=280

    const result = PayoutService._calculateWithholdingTaxTotal(assignments, staff, jobMap, countMap);
    assertEqual(result, 280, 'Case H: jobMapミスヒット → asg.work_dateフォールバック, lookup(10000)=280');
  }
  Logger.log('  Case H (jobMapミスヒット): OK');

  // === Case I: 境界値 — 2899円(税額0) / 2900円(税額5) ===
  {
    const staff = { staff_id: 'test_i', withholding_tax_applicable: true, daily_rate_basic: 15000 };
    const assignments = [
      { job_id: 'j1', wage_rate: 2899, pay_unit: 'basic', work_date: '2025-01-10' },
      { job_id: 'j2', wage_rate: 2900, pay_unit: 'basic', work_date: '2025-01-10' }
    ];
    const jobMap = new Map([
      ['j1', { work_date: '2025-01-10', required_count: 1 }],
      ['j2', { work_date: '2025-01-10', required_count: 1 }]
    ]);
    const countMap = new Map([['j1', 1], ['j2', 1]]);

    const result = PayoutService._calculateWithholdingTaxTotal(assignments, staff, jobMap, countMap);
    assertEqual(result, 5, 'Case I: 境界値 lookup(2899)=0 + lookup(2900)=5 → 5');
  }
  Logger.log('  Case I (境界値): OK');

  // === Case J: 同日3配置 + 人工割混在 ===
  // j1: wage=15000, req=2, act=3 → coeff=0.6, adj=9000-15000=-6000, assignmentWage=9000 → lookup(9000)=245
  // j2: wage=10000, req=1, act=1 → coeff=1.0, adj=0, assignmentWage=10000 → lookup(10000)=280
  // j3: wage=7500, req=1, act=1 → coeff=1.0, adj=0, assignmentWage=7500 → lookup(7500)=190
  // total = 245+280+190 = 715
  {
    const staff = { staff_id: 'test_j', withholding_tax_applicable: true, daily_rate_basic: 15000 };
    const assignments = [
      { job_id: 'j1', wage_rate: 15000, pay_unit: 'basic', work_date: '2025-01-10' },
      { job_id: 'j2', wage_rate: 10000, pay_unit: 'basic', work_date: '2025-01-10' },
      { job_id: 'j3', wage_rate: 7500, pay_unit: 'basic', work_date: '2025-01-10' }
    ];
    const jobMap = new Map([
      ['j1', { work_date: '2025-01-10', required_count: 2 }],
      ['j2', { work_date: '2025-01-10', required_count: 1 }],
      ['j3', { work_date: '2025-01-10', required_count: 1 }]
    ]);
    const countMap = new Map([['j1', 3], ['j2', 1], ['j3', 1]]);

    const result = PayoutService._calculateWithholdingTaxTotal(assignments, staff, jobMap, countMap);
    assertEqual(result, 715, 'Case J: 3配置+人工割混在 245+280+190=715');
  }
  Logger.log('  Case J (3配置+人工割混在): OK');

  // === Case K: 人工割で閾値を跨ぐ（3000円→2900円未満に減少） ===
  // wage=3000, req=1, act=2 → coeff=0.5, adj=floor(3000*0.5)-3000=1500-3000=-1500
  // assignmentWage=3000+(-1500)=1500 → lookup(1500)=0
  {
    const staff = { staff_id: 'test_k', withholding_tax_applicable: true, daily_rate_basic: 15000 };
    const assignments = [
      { job_id: 'j1', wage_rate: 3000, pay_unit: 'basic', work_date: '2025-01-10' }
    ];
    const jobMap = new Map([['j1', { work_date: '2025-01-10', required_count: 1 }]]);
    const countMap = new Map([['j1', 2]]);

    const result = PayoutService._calculateWithholdingTaxTotal(assignments, staff, jobMap, countMap);
    assertEqual(result, 0, 'Case K: 人工割で閾値跨ぎ 3000*0.5=1500 → lookup(1500)=0');
  }
  Logger.log('  Case K (人工割閾値跨ぎ): OK');

  Logger.log('--- testWithholdingTaxIntegration PASSED ---');
}
