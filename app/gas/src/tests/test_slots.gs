/**
 * Slot Module Tests
 *
 * 枠（Slot）システムのテスト関数
 * KTSM-XX: 案件枠システム追加
 * assert関数はtest_helpers.gsで定義
 */

/**
 * 全スロットテスト実行
 * @returns {Object} { passed, failed, errors }
 */
function runAllSlotTests() {
  Logger.log('=== 枠（Slot）システム テスト開始 ===\n');

  const results = {
    passed: 0,
    failed: 0,
    errors: []
  };

  const tests = [
    { name: 'testSlotRepository', fn: testSlotRepository },
    { name: 'testSlotService', fn: testSlotService },
    { name: 'testSlotWithJob', fn: testSlotWithJob },
    { name: 'testSlotAssignment', fn: testSlotAssignment }
  ];

  for (const test of tests) {
    try {
      test.fn();
      results.passed++;
      Logger.log(`✅ ${test.name}`);
    } catch (e) {
      results.failed++;
      results.errors.push({ test: test.name, error: e.message });
      Logger.log(`❌ ${test.name}: ${e.message}`);
      Logger.log(e.stack);
    }
  }

  Logger.log('\n=== 全テスト完了 ===');
  Logger.log(`結果: ${results.passed} passed, ${results.failed} failed`);

  return results;
}

/**
 * SlotRepositoryテスト
 */
function testSlotRepository() {
  Logger.log('--- SlotRepository Tests ---');

  // テスト用案件を作成
  const testJob = JobRepository.insert({
    customer_id: 'cus_slot_test_' + Utilities.getUuid().substring(0, 8),
    site_name: '枠テスト現場',
    work_date: '2025-12-25',
    time_slot: 'am',
    required_count: 1,
    pay_unit: 'basic'
  });
  assert(testJob.job_id, 'test job should be created');

  try {
    // insert
    const insertResult = SlotRepository.insert({
      job_id: testJob.job_id,
      slot_time_slot: 'am',
      slot_pay_unit: 'basic',
      slot_count: 2,
      notes: 'テスト枠1'
    });
    const newSlot = insertResult.slot;
    assertTrue(insertResult.success, 'insert should succeed');
    assert(newSlot.slot_id, 'insert should return slot_id');
    assertEqual(newSlot.job_id, testJob.job_id, 'slot should have correct job_id');

    // findById
    const found = SlotRepository.findById(newSlot.slot_id);
    assert(found, 'findById should return slot');
    assertEqual(found.slot_count, 2, 'findById slot_count should match');

    // findByJobId
    const byJob = SlotRepository.findByJobId(testJob.job_id);
    assert(byJob.length > 0, 'findByJobId should return results');
    assertTrue(byJob.some(s => s.slot_id === newSlot.slot_id), 'findByJobId should contain test slot');

    // 2つ目の枠を追加
    const slot2Result = SlotRepository.insert({
      job_id: testJob.job_id,
      slot_time_slot: 'pm',
      slot_pay_unit: 'tobi',
      slot_count: 3,
      notes: 'テスト枠2'
    });
    assertTrue(slot2Result.success, 'second insert should succeed');
    const slot2 = slot2Result.slot;
    assert(slot2.slot_id, 'second slot should have slot_id');

    // getTotalCount
    const totalCount = SlotRepository.getTotalCount(testJob.job_id);
    assertEqual(totalCount, 5, 'getTotalCount should be 2+3=5');

    // update
    const updateResult = SlotRepository.update(
      { slot_id: newSlot.slot_id, slot_count: 4 },
      newSlot.updated_at
    );
    assertTrue(updateResult.success, 'update should succeed');
    assertEqual(updateResult.slot.slot_count, 4, 'update slot_count should be 4');

    // 競合テスト
    const conflictResult = SlotRepository.update(
      { slot_id: newSlot.slot_id, notes: 'conflict test' },
      newSlot.updated_at  // 古いタイムスタンプ
    );
    assertEqual(conflictResult.error, 'CONFLICT_ERROR', 'conflict should return CONFLICT_ERROR');

    // findByJobIds
    const byJobIds = SlotRepository.findByJobIds([testJob.job_id]);
    assert(byJobIds[testJob.job_id], 'findByJobIds should have key');
    assertEqual(byJobIds[testJob.job_id].length, 2, 'findByJobIds should have 2 slots');

    // softDelete
    const deleteResult1 = SlotRepository.softDelete(newSlot.slot_id, updateResult.slot.updated_at);
    const deleteResult2 = SlotRepository.softDelete(slot2.slot_id, slot2.updated_at);
    assertTrue(deleteResult1.success, 'softDelete 1 should succeed');
    assertTrue(deleteResult2.success, 'softDelete 2 should succeed');

    // 削除後のfindByJobId
    const afterDelete = SlotRepository.findByJobId(testJob.job_id);
    assertEqual(afterDelete.length, 0, 'after delete should be empty');

  } finally {
    JobRepository.softDelete(testJob.job_id, testJob.updated_at);
  }

  Logger.log('  All SlotRepository assertions passed');
}

/**
 * SlotServiceテスト
 */
function testSlotService() {
  Logger.log('--- SlotService Tests ---');

  const testJob = JobRepository.insert({
    customer_id: 'cus_slot_svc_' + Utilities.getUuid().substring(0, 8),
    site_name: 'SlotServiceテスト現場',
    work_date: '2025-12-26',
    time_slot: 'pm',
    required_count: 1,
    pay_unit: 'basic'
  });
  assert(testJob.job_id, 'test job should be created');

  try {
    // getSlotsByJobId (empty)
    const emptySlots = SlotService.getSlotsByJobId(testJob.job_id);
    assertEqual(emptySlots.slots.length, 0, 'initial slots should be empty');
    assertEqual(emptySlots.totalCount, 0, 'initial totalCount should be 0');

    // saveSlots
    const slots = [
      { slot_time_slot: 'am', slot_pay_unit: 'basic', slot_count: 2 },
      { slot_time_slot: 'pm', slot_pay_unit: 'tobi', slot_count: 3 }
    ];
    const saveResult = SlotService.saveSlots(testJob.job_id, slots, null);
    assertTrue(saveResult.ok, 'saveSlots should be ok');
    assertEqual(saveResult.data.slots.length, 2, 'saveSlots should create 2 slots');
    assertEqual(saveResult.data.totalCount, 5, 'saveSlots totalCount should be 5');

    // getSlotsByJobId (with data)
    const withSlots = SlotService.getSlotsByJobId(testJob.job_id);
    assertEqual(withSlots.slots.length, 2, 'should have 2 slots');

    // getSlotStatus
    const slotStatus = SlotService.getSlotStatus(testJob.job_id);
    assertEqual(slotStatus.slotStatuses.length, 2, 'should have 2 slot statuses');
    assertEqual(slotStatus.total.required, 5, 'total required should be 5');
    assertEqual(slotStatus.total.assigned, 0, 'total assigned should be 0');
    assertEqual(slotStatus.total.shortage, 5, 'total shortage should be 5');

    // 枠を更新
    const slot1 = saveResult.data.slots[0];
    const updateSlots = [
      { slot_id: slot1.slot_id, slot_time_slot: 'am', slot_pay_unit: 'halfday', slot_count: 4 },
      { slot_time_slot: 'yakin', slot_pay_unit: 'night', slot_count: 1 }
    ];
    const updateResult = SlotService.saveSlots(testJob.job_id, updateSlots, saveResult.data.job.updated_at);
    assertTrue(updateResult.ok, 'saveSlots (update) should be ok');
    assert(updateResult.data.changes, 'update result should have changes');

    // すべての枠を削除
    const latestUpdatedAt = updateResult.data.job.updated_at || saveResult.data.job.updated_at;
    const deleteResult = SlotService.saveSlots(testJob.job_id, [], latestUpdatedAt);
    assertTrue(deleteResult.ok, 'saveSlots (delete all) should be ok');
    assertEqual(deleteResult.data.slots.length, 0, 'after delete all slots should be empty');

  } finally {
    const latestJob = JobRepository.findById(testJob.job_id);
    if (latestJob) {
      JobRepository.softDelete(testJob.job_id, latestJob.updated_at);
    }
  }

  Logger.log('  All SlotService assertions passed');
}

/**
 * 案件と枠の連携テスト
 */
function testSlotWithJob() {
  Logger.log('--- Slot with Job Integration Tests ---');

  const slots = [
    { slot_time_slot: 'am', slot_pay_unit: 'basic', slot_count: 2 },
    { slot_time_slot: 'pm', slot_pay_unit: 'tobi', slot_count: 3 }
  ];

  const createResult = JobService.save({
    customer_id: 'cus_slot_job_' + Utilities.getUuid().substring(0, 8),
    site_name: '枠連携テスト現場',
    work_date: '2025-12-27',
    time_slot: 'shuujitsu',
    required_count: 1,
    pay_unit: 'basic'
  }, null, slots);

  assertTrue(createResult.success, 'JobService.save with slots should succeed');
  assert(createResult.job.job_id, 'should have job_id');
  assertEqual(createResult.slots.length, 2, 'should have 2 slots');
  assertEqual(createResult.job.required_count, 5, 'required_count should be updated to slot total');

  const jobId = createResult.job.job_id;

  // JobService.get で枠情報も取得
  const getResult = JobService.get(jobId);
  assert(getResult.slots.length > 0, 'get should return slots');
  assert(getResult.slotStatus, 'get should return slotStatus');

  // 枠を更新して案件も更新
  const newSlots = [
    { slot_id: createResult.slots[0].slot_id, slot_time_slot: 'am', slot_pay_unit: 'halfday', slot_count: 4 }
  ];
  const updateResult = JobService.save(
    { job_id: jobId, notes: 'Updated with slots' },
    createResult.job.updated_at,
    newSlots
  );
  assertTrue(updateResult.success, 'update with slots should succeed');
  assertEqual(updateResult.slots.length, 1, 'should have 1 slot after update');
  assertEqual(updateResult.job.required_count, 4, 'required_count should be updated to 4');

  // クリーンアップ
  const latestJob = JobRepository.findById(jobId);
  if (latestJob) {
    JobRepository.softDelete(jobId, latestJob.updated_at);
  }

  Logger.log('  All Slot-Job integration assertions passed');
}

/**
 * 枠と配置の連携テスト
 */
function testSlotAssignment() {
  Logger.log('--- Slot Assignment Integration Tests ---');

  const createResult = JobService.save({
    customer_id: 'cus_slot_asgn_' + Utilities.getUuid().substring(0, 8),
    site_name: '枠配置連携テスト',
    work_date: '2025-12-28',
    time_slot: 'am',
    required_count: 1,
    pay_unit: 'basic'
  }, null, [
    { slot_time_slot: 'am', slot_pay_unit: 'basic', slot_count: 2 },
    { slot_time_slot: 'pm', slot_pay_unit: 'tobi', slot_count: 1 }
  ]);

  assertTrue(createResult.success, 'test job creation should succeed');

  const jobId = createResult.job.job_id;
  const slot1 = createResult.slots[0];
  const slot2 = createResult.slots[1];
  assert(slot1.slot_id, 'slot1 should have id');
  assert(slot2.slot_id, 'slot2 should have id');

  try {
    // テスト用スタッフを取得
    const allStaff = getAllRecords('M_Staff');
    const activeStaff = allStaff.filter(s => !s.is_deleted);

    if (activeStaff.length < 2) {
      Logger.log('Not enough staff for testing. Skipping assignment tests.');
      return;
    }

    const staff1 = activeStaff[0];

    // 配置を作成（枠IDなし）
    const assignment1 = AssignmentRepository.insert({
      job_id: jobId,
      staff_id: staff1.staff_id,
      worker_type: 'STAFF',
      status: 'CONFIRMED',
      display_time_slot: 'am',
      pay_unit: 'basic',
      invoice_unit: 'basic'
    });
    assert(assignment1.assignment_id, 'assignment should be created');

    // 枠充足状況を確認
    const status1 = SlotService.getSlotStatus(jobId);
    assert(status1.unassignedToSlot.length > 0, 'should have unassigned-to-slot assignments');

    // 配置を枠に割り当て
    const assignResult = SlotService.assignToSlot(
      assignment1.assignment_id,
      slot1.slot_id,
      assignment1.updated_at
    );
    assertTrue(assignResult.ok, 'assignToSlot should be ok');
    assertEqual(assignResult.data.assignment.slot_id, slot1.slot_id, 'slot_id should be set');
    assertEqual(assignResult.data.assignment.pay_unit, slot1.slot_pay_unit, 'pay_unit should auto-set from slot');

    // 枠充足状況を再確認
    const status2 = SlotService.getSlotStatus(jobId);
    const slotStatus1 = status2.slotStatuses.find(s => s.slot_id === slot1.slot_id);
    assert(slotStatus1, 'slot1 status should exist');
    assertEqual(slotStatus1.assigned, 1, 'slot1 should have 1 assigned');
    assertEqual(slotStatus1.shortage, 1, 'slot1 shortage should be 1 (2 required - 1 assigned)');

    // 配置がある枠を削除しようとする（エラーになるはず）
    const deleteWithAssignments = SlotService.saveSlots(jobId, [], createResult.job.updated_at);
    assertFalse(deleteWithAssignments.ok, 'delete slots with assignments should fail');

    // 配置を削除
    AssignmentRepository.softDelete(assignment1.assignment_id, assignResult.data.assignment.updated_at);

    // 枠を削除（今度は成功するはず）
    const latestJob = JobRepository.findById(jobId);
    const deleteSlots = SlotService.saveSlots(jobId, [], latestJob.updated_at);
    assertTrue(deleteSlots.ok, 'delete slots without assignments should succeed');

  } finally {
    const latestJob = JobRepository.findById(jobId);
    if (latestJob) {
      JobRepository.softDelete(jobId, latestJob.updated_at);
    }
  }

  Logger.log('  All Slot-Assignment integration assertions passed');
}

/**
 * 枠システム クイックテスト
 */
function quickSlotTest() {
  Logger.log('=== Quick Slot Test ===');

  const today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');

  const result = saveJob({
    customer_id: 'cus_quick_test',
    site_name: 'クイックテスト現場',
    work_date: today,
    time_slot: 'am',
    required_count: 1,
    pay_unit: 'basic'
  }, null, [
    { slot_time_slot: 'am', slot_pay_unit: 'basic', slot_count: 2 },
    { slot_time_slot: 'pm', slot_pay_unit: 'tobi', slot_count: 3 }
  ]);

  assertTrue(result.ok, 'saveJob with slots should be ok');
  assert(result.data.job.job_id, 'should have job_id');
  assertEqual(result.data.job.required_count, 5, 'required_count should be 5');
  assertEqual(result.data.slots.length, 2, 'should have 2 slots');

  // 取得テスト
  const getResult = getJob(result.data.job.job_id);
  assertTrue(getResult.ok, 'getJob should be ok');
  assert(getResult.data.slots.length > 0, 'should have slots');
  assert(getResult.data.slotStatus, 'should have slotStatus');

  // クリーンアップ
  const job = result.data.job;
  JobRepository.softDelete(job.job_id, job.updated_at);
}
