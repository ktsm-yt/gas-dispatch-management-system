/**
 * Slot Module Tests
 *
 * 枠（Slot）システムのテスト関数
 * KTSM-XX: 案件枠システム追加
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
  Logger.log(`Test job created: ${testJob.job_id}`);

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
    Logger.log(`insert: success=${insertResult.success}, slot_id=${newSlot?.slot_id}`);
    Logger.log(`  ✓ Created: ${!!newSlot?.slot_id}`);
    Logger.log(`  ✓ Has job_id: ${newSlot?.job_id === testJob.job_id}`);

    // findById
    const found = SlotRepository.findById(newSlot.slot_id);
    Logger.log(`findById: found=${!!found}`);
    Logger.log(`  ✓ slot_count matches: ${found && found.slot_count === 2}`);

    // findByJobId
    const byJob = SlotRepository.findByJobId(testJob.job_id);
    Logger.log(`findByJobId: count=${byJob.length}`);
    Logger.log(`  ✓ Contains test slot: ${byJob.some(s => s.slot_id === newSlot.slot_id)}`);

    // 2つ目の枠を追加
    const slot2Result = SlotRepository.insert({
      job_id: testJob.job_id,
      slot_time_slot: 'pm',
      slot_pay_unit: 'tobi',
      slot_count: 3,
      notes: 'テスト枠2'
    });
    const slot2 = slot2Result.slot;
    Logger.log(`insert second slot: success=${slot2Result.success}, slot_id=${slot2?.slot_id}`);

    // getTotalCount
    const totalCount = SlotRepository.getTotalCount(testJob.job_id);
    Logger.log(`getTotalCount: ${totalCount}`);
    Logger.log(`  ✓ Total is 5: ${totalCount === 5}`);

    // update
    const updateResult = SlotRepository.update(
      { slot_id: newSlot.slot_id, slot_count: 4 },
      newSlot.updated_at
    );
    Logger.log(`update: success=${updateResult.success}`);
    Logger.log(`  ✓ slot_count updated: ${updateResult.slot && updateResult.slot.slot_count === 4}`);

    // 競合テスト
    const conflictResult = SlotRepository.update(
      { slot_id: newSlot.slot_id, notes: 'conflict test' },
      newSlot.updated_at  // 古いタイムスタンプ
    );
    Logger.log(`conflict test: error=${conflictResult.error}`);
    Logger.log(`  ✓ CONFLICT_ERROR: ${conflictResult.error === 'CONFLICT_ERROR'}`);

    // findByJobIds
    const byJobIds = SlotRepository.findByJobIds([testJob.job_id]);
    Logger.log(`findByJobIds: has key=${!!byJobIds[testJob.job_id]}`);
    Logger.log(`  ✓ Count is 2: ${byJobIds[testJob.job_id]?.length === 2}`);

    // softDelete
    const deleteResult1 = SlotRepository.softDelete(newSlot.slot_id, updateResult.slot.updated_at);
    const deleteResult2 = SlotRepository.softDelete(slot2.slot_id, slot2.updated_at);
    Logger.log(`softDelete: success1=${deleteResult1.success}, success2=${deleteResult2.success}`);

    // 削除後のfindByJobId
    const afterDelete = SlotRepository.findByJobId(testJob.job_id);
    Logger.log(`After delete count: ${afterDelete.length}`);
    Logger.log(`  ✓ Empty after delete: ${afterDelete.length === 0}`);

  } finally {
    // クリーンアップ：テスト案件を削除
    JobRepository.softDelete(testJob.job_id, testJob.updated_at);
  }

  Logger.log('');
}

/**
 * SlotServiceテスト
 */
function testSlotService() {
  Logger.log('--- SlotService Tests ---');

  // テスト用案件を作成
  const testJob = JobRepository.insert({
    customer_id: 'cus_slot_svc_' + Utilities.getUuid().substring(0, 8),
    site_name: 'SlotServiceテスト現場',
    work_date: '2025-12-26',
    time_slot: 'pm',
    required_count: 1,
    pay_unit: 'basic'
  });
  Logger.log(`Test job created: ${testJob.job_id}`);

  try {
    // getSlotsByJobId (empty)
    const emptySlots = SlotService.getSlotsByJobId(testJob.job_id);
    Logger.log(`getSlotsByJobId (empty): count=${emptySlots.slots.length}, total=${emptySlots.totalCount}`);
    Logger.log(`  ✓ Empty: ${emptySlots.slots.length === 0}`);

    // saveSlots
    const slots = [
      { slot_time_slot: 'am', slot_pay_unit: 'basic', slot_count: 2 },
      { slot_time_slot: 'pm', slot_pay_unit: 'tobi', slot_count: 3 }
    ];
    const saveResult = SlotService.saveSlots(testJob.job_id, slots, null);
    Logger.log(`saveSlots: ok=${saveResult.ok}`);
    Logger.log(`  ✓ Created 2 slots: ${saveResult.data?.slots?.length === 2}`);
    Logger.log(`  ✓ TotalCount is 5: ${saveResult.data?.totalCount === 5}`);

    // getSlotsByJobId (with data)
    const withSlots = SlotService.getSlotsByJobId(testJob.job_id);
    Logger.log(`getSlotsByJobId: count=${withSlots.slots.length}, total=${withSlots.totalCount}`);
    Logger.log(`  ✓ Has 2 slots: ${withSlots.slots.length === 2}`);

    // getSlotStatus
    const slotStatus = SlotService.getSlotStatus(testJob.job_id);
    Logger.log(`getSlotStatus: slotStatuses=${slotStatus.slotStatuses.length}`);
    Logger.log(`  ✓ Total required: ${slotStatus.total.required}`);
    Logger.log(`  ✓ Total assigned: ${slotStatus.total.assigned}`);
    Logger.log(`  ✓ Total shortage: ${slotStatus.total.shortage}`);

    // 枠を更新（1つ目を更新、2つ目を削除、3つ目を追加）
    const slot1 = saveResult.data.slots[0];
    const updateSlots = [
      { slot_id: slot1.slot_id, slot_time_slot: 'am', slot_pay_unit: 'halfday', slot_count: 4 },
      { slot_time_slot: 'yakin', slot_pay_unit: 'night', slot_count: 1 }  // 新規
    ];
    const updateResult = SlotService.saveSlots(testJob.job_id, updateSlots, saveResult.data.job.updated_at);
    Logger.log(`saveSlots (update): ok=${updateResult.ok}`);
    if (!updateResult.ok) {
      Logger.log(`  ERROR: code=${updateResult.error?.code}, message=${updateResult.error?.message}`);
      Logger.log(`  Details: ${JSON.stringify(updateResult.error?.details)}`);
    }
    Logger.log(`  ✓ Changes: created=${updateResult.data?.changes?.created}, updated=${updateResult.data?.changes?.updated}, deleted=${updateResult.data?.changes?.deleted}`);

    // すべての枠を削除
    // Use the latest job's updated_at (either from updateResult or saveResult)
    const latestUpdatedAt = updateResult.data?.job?.updated_at || saveResult.data.job.updated_at;
    const deleteResult = SlotService.saveSlots(testJob.job_id, [], latestUpdatedAt);
    Logger.log(`saveSlots (delete all): ok=${deleteResult.ok}`);
    if (!deleteResult.ok) {
      Logger.log(`  ERROR: code=${deleteResult.error?.code}, message=${deleteResult.error?.message}`);
    }
    Logger.log(`  ✓ Deleted all: ${deleteResult.data?.slots?.length === 0}`);

  } finally {
    // クリーンアップ
    const latestJob = JobRepository.findById(testJob.job_id);
    if (latestJob) {
      JobRepository.softDelete(testJob.job_id, latestJob.updated_at);
    }
  }

  Logger.log('');
}

/**
 * 案件と枠の連携テスト
 */
function testSlotWithJob() {
  Logger.log('--- Slot with Job Integration Tests ---');

  // 案件作成時に枠も一緒に作成
  const slots = [
    { slot_time_slot: 'am', slot_pay_unit: 'basic', slot_count: 2 },
    { slot_time_slot: 'pm', slot_pay_unit: 'tobi', slot_count: 3 }
  ];

  const createResult = JobService.save({
    customer_id: 'cus_slot_job_' + Utilities.getUuid().substring(0, 8),
    site_name: '枠連携テスト現場',
    work_date: '2025-12-27',
    time_slot: 'shuujitsu',
    required_count: 1,  // 初期値（枠合計で上書きされる）
    pay_unit: 'basic'
  }, null, slots);

  Logger.log(`JobService.save with slots: success=${createResult.success}`);
  Logger.log(`  ✓ Has job: ${!!createResult.job?.job_id}`);
  Logger.log(`  ✓ Has slots: ${createResult.slots?.length === 2}`);
  Logger.log(`  ✓ required_count updated: ${createResult.job?.required_count === 5}`);

  if (createResult.success) {
    const jobId = createResult.job.job_id;

    // JobService.get で枠情報も取得できるか確認
    const getResult = JobService.get(jobId);
    Logger.log(`JobService.get: hasSlots=${getResult.slots?.length > 0}`);
    Logger.log(`  ✓ slots array: ${getResult.slots?.length}`);
    Logger.log(`  ✓ slotStatus: ${!!getResult.slotStatus}`);

    // 枠を更新して案件も更新
    const newSlots = [
      { slot_id: createResult.slots[0].slot_id, slot_time_slot: 'am', slot_pay_unit: 'halfday', slot_count: 4 }
    ];
    const updateResult = JobService.save(
      { job_id: jobId, notes: 'Updated with slots' },
      createResult.job.updated_at,
      newSlots
    );
    Logger.log(`JobService.save (update): success=${updateResult.success}`);
    Logger.log(`  ✓ Slots updated: ${updateResult.slots?.length === 1}`);
    Logger.log(`  ✓ required_count updated: ${updateResult.job?.required_count === 4}`);

    // クリーンアップ
    const latestJob = JobRepository.findById(jobId);
    if (latestJob) {
      JobRepository.softDelete(jobId, latestJob.updated_at);
    }
  }

  Logger.log('');
}

/**
 * 枠と配置の連携テスト
 */
function testSlotAssignment() {
  Logger.log('--- Slot Assignment Integration Tests ---');

  // テスト用案件と枠を作成
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

  if (!createResult.success) {
    Logger.log('Failed to create test job');
    return;
  }

  const jobId = createResult.job.job_id;
  const slot1 = createResult.slots[0];
  const slot2 = createResult.slots[1];
  Logger.log(`Test job: ${jobId}`);
  Logger.log(`Slot1: ${slot1.slot_id} (${slot1.slot_pay_unit})`);
  Logger.log(`Slot2: ${slot2.slot_id} (${slot2.slot_pay_unit})`);

  try {
    // テスト用スタッフを取得（既存のスタッフを使用）
    const allStaff = getAllRecords('M_Staff');
    const activeStaff = allStaff.filter(s => !s.is_deleted);

    if (activeStaff.length < 2) {
      Logger.log('Not enough staff for testing. Skipping assignment tests.');
      return;
    }

    const staff1 = activeStaff[0];
    const staff2 = activeStaff[1];
    Logger.log(`Test staff: ${staff1.name}, ${staff2.name}`);

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
    Logger.log(`Assignment1 created: ${assignment1.assignment_id}`);

    // 枠充足状況を確認（枠に未割当の配置がある）
    const status1 = SlotService.getSlotStatus(jobId);
    Logger.log(`Slot status (before assign to slot):`);
    Logger.log(`  ✓ unassignedToSlot: ${status1.unassignedToSlot?.length}`);

    // 配置を枠に割り当て
    const assignResult = SlotService.assignToSlot(
      assignment1.assignment_id,
      slot1.slot_id,
      assignment1.updated_at
    );
    Logger.log(`assignToSlot: ok=${assignResult.ok}`);
    Logger.log(`  ✓ slot_id set: ${assignResult.data?.assignment?.slot_id === slot1.slot_id}`);
    Logger.log(`  ✓ pay_unit auto-set: ${assignResult.data?.assignment?.pay_unit === slot1.slot_pay_unit}`);

    // 枠充足状況を再確認
    const status2 = SlotService.getSlotStatus(jobId);
    Logger.log(`Slot status (after assign to slot):`);
    const slotStatus1 = status2.slotStatuses.find(s => s.slot_id === slot1.slot_id);
    Logger.log(`  ✓ Slot1 assigned: ${slotStatus1?.assigned}`);
    Logger.log(`  ✓ Slot1 shortage: ${slotStatus1?.shortage}`);

    // 配置がある枠を削除しようとする（エラーになるはず）
    const deleteWithAssignments = SlotService.saveSlots(jobId, [], createResult.job.updated_at);
    Logger.log(`Delete slots with assignments: ok=${deleteWithAssignments.ok}`);
    Logger.log(`  ✓ Should fail: ${!deleteWithAssignments.ok}`);

    // 配置を削除
    AssignmentRepository.softDelete(assignment1.assignment_id, assignResult.data.assignment.updated_at);
    Logger.log('Assignment deleted');

    // 枠を削除（今度は成功するはず）
    const latestJob = JobRepository.findById(jobId);
    const deleteSlots = SlotService.saveSlots(jobId, [], latestJob.updated_at);
    Logger.log(`Delete slots (no assignments): ok=${deleteSlots.ok}`);
    Logger.log(`  ✓ Should succeed: ${deleteSlots.ok}`);

  } finally {
    // クリーンアップ
    const latestJob = JobRepository.findById(jobId);
    if (latestJob) {
      JobRepository.softDelete(jobId, latestJob.updated_at);
    }
  }

  Logger.log('');
}

/**
 * 枠システム クイックテスト
 */
function quickSlotTest() {
  Logger.log('=== Quick Slot Test ===');

  // 今日の日付で枠付き案件を作成
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

  Logger.log(`saveJob with slots: ok=${result.ok}`);

  if (result.ok) {
    Logger.log(`  Job ID: ${result.data.job.job_id}`);
    Logger.log(`  Required Count: ${result.data.job.required_count}`);
    Logger.log(`  Slots: ${result.data.slots?.length}`);

    // 取得テスト
    const getResult = getJob(result.data.job.job_id);
    Logger.log(`getJob: ok=${getResult.ok}`);
    Logger.log(`  Has slots: ${getResult.data?.slots?.length > 0}`);
    Logger.log(`  Has slotStatus: ${!!getResult.data?.slotStatus}`);

    // クリーンアップ
    const job = result.data.job;
    JobRepository.softDelete(job.job_id, job.updated_at);
    Logger.log('Cleanup done');
  }
}
