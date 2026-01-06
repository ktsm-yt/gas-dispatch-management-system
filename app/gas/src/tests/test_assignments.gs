/**
 * Assignment Tests
 *
 * 配置管理機能のテスト
 */

/**
 * 全テストを実行
 */
function runAssignmentTests() {
  console.log('=== Assignment Tests ===');

  const tests = [
    testAssignmentRepositoryInsert,
    testAssignmentRepositoryFindByJobId,
    testAssignmentRepositoryUpdate,
    testAssignmentRepositorySoftDelete,
    testAssignmentServiceGetShortage,
    testAssignmentServiceCheckDuplicate,
    testSaveAssignmentsAPI
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      test();
      console.log(`[PASS] ${test.name}`);
      passed++;
    } catch (e) {
      console.log(`[FAIL] ${test.name}: ${e.message}`);
      failed++;
    }
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  return { passed, failed };
}

/**
 * AssignmentRepository.insert テスト
 */
function testAssignmentRepositoryInsert() {
  // テスト用の案件を作成
  const testJob = JobRepository.insert({
    customer_id: 'cus_test',
    site_name: 'テスト現場（配置テスト用）',
    work_date: '2099-12-31',
    time_slot: 'shuujitsu',
    required_count: 2,
    pay_unit: 'basic'
  });

  try {
    // 配置を作成
    const assignment = AssignmentRepository.insert({
      job_id: testJob.job_id,
      staff_id: 'stf_test_001',
      worker_type: 'STAFF',
      display_time_slot: 'shuujitsu',
      pay_unit: 'FULLDAY',
      invoice_unit: 'FULLDAY'
    });

    // 検証
    assertEqual(assignment.job_id, testJob.job_id, 'job_id should match');
    assertEqual(assignment.staff_id, 'stf_test_001', 'staff_id should match');
    assertEqual(assignment.worker_type, 'STAFF', 'worker_type should be STAFF');
    assertEqual(assignment.status, 'ASSIGNED', 'default status should be ASSIGNED');
    assertTrue(assignment.assignment_id.startsWith('asg_'), 'assignment_id should start with asg_');

    // クリーンアップ
    AssignmentRepository.softDelete(assignment.assignment_id);
    JobRepository.softDelete(testJob.job_id, testJob.updated_at);

  } catch (e) {
    // クリーンアップ
    JobRepository.softDelete(testJob.job_id, testJob.updated_at);
    throw e;
  }
}

/**
 * AssignmentRepository.findByJobId テスト
 */
function testAssignmentRepositoryFindByJobId() {
  // テスト用の案件を作成
  const testJob = JobRepository.insert({
    customer_id: 'cus_test',
    site_name: 'テスト現場（findByJobId）',
    work_date: '2099-12-31',
    time_slot: 'am',
    required_count: 3,
    pay_unit: 'tobi'
  });

  try {
    // 複数の配置を作成
    const assignment1 = AssignmentRepository.insert({
      job_id: testJob.job_id,
      staff_id: 'stf_test_001',
      worker_type: 'STAFF',
      display_time_slot: 'am',
      pay_unit: 'FULLDAY',
      invoice_unit: 'FULLDAY'
    });

    const assignment2 = AssignmentRepository.insert({
      job_id: testJob.job_id,
      staff_id: 'stf_test_002',
      worker_type: 'STAFF',
      display_time_slot: 'am',
      pay_unit: 'FULLDAY',
      invoice_unit: 'FULLDAY'
    });

    // 検索
    const assignments = AssignmentRepository.findByJobId(testJob.job_id);

    // 検証
    assertEqual(assignments.length, 2, 'should find 2 assignments');

    // クリーンアップ
    AssignmentRepository.softDelete(assignment1.assignment_id);
    AssignmentRepository.softDelete(assignment2.assignment_id);
    JobRepository.softDelete(testJob.job_id, testJob.updated_at);

  } catch (e) {
    JobRepository.softDelete(testJob.job_id, testJob.updated_at);
    throw e;
  }
}

/**
 * AssignmentRepository.update テスト
 */
function testAssignmentRepositoryUpdate() {
  // テスト用データを作成
  const testJob = JobRepository.insert({
    customer_id: 'cus_test',
    site_name: 'テスト現場（update）',
    work_date: '2099-12-31',
    time_slot: 'pm',
    required_count: 1,
    pay_unit: 'basic'
  });

  const assignment = AssignmentRepository.insert({
    job_id: testJob.job_id,
    staff_id: 'stf_test_001',
    worker_type: 'STAFF',
    display_time_slot: 'pm',
    pay_unit: 'FULLDAY',
    invoice_unit: 'FULLDAY',
    transport_area: '23ku_inner',
    transport_amount: 1000
  });

  try {
    // 更新
    const result = AssignmentRepository.update({
      assignment_id: assignment.assignment_id,
      transport_amount: 1500,
      transport_is_manual: true
    });

    // 検証
    assertTrue(result.success, 'update should succeed');
    assertEqual(result.assignment.transport_amount, 1500, 'transport_amount should be updated');
    assertEqual(result.assignment.transport_is_manual, true, 'transport_is_manual should be updated');

    // クリーンアップ
    AssignmentRepository.softDelete(assignment.assignment_id);
    JobRepository.softDelete(testJob.job_id, testJob.updated_at);

  } catch (e) {
    AssignmentRepository.softDelete(assignment.assignment_id);
    JobRepository.softDelete(testJob.job_id, testJob.updated_at);
    throw e;
  }
}

/**
 * AssignmentRepository.softDelete テスト
 */
function testAssignmentRepositorySoftDelete() {
  // テスト用データを作成
  const testJob = JobRepository.insert({
    customer_id: 'cus_test',
    site_name: 'テスト現場（softDelete）',
    work_date: '2099-12-31',
    time_slot: 'jotou',
    required_count: 1,
    pay_unit: 'tobiage'
  });

  const assignment = AssignmentRepository.insert({
    job_id: testJob.job_id,
    staff_id: 'stf_test_001',
    worker_type: 'STAFF',
    display_time_slot: 'jotou',
    pay_unit: 'FULLDAY',
    invoice_unit: 'FULLDAY'
  });

  try {
    // 削除
    const result = AssignmentRepository.softDelete(assignment.assignment_id);

    // 検証
    assertTrue(result.success, 'softDelete should succeed');
    assertEqual(result.assignment.is_deleted, true, 'is_deleted should be true');
    assertEqual(result.assignment.status, 'CANCELLED', 'status should be CANCELLED');

    // findByIdでは取得できないことを確認
    const found = AssignmentRepository.findById(assignment.assignment_id);
    assertEqual(found, null, 'deleted assignment should not be found');

    // クリーンアップ
    JobRepository.softDelete(testJob.job_id, testJob.updated_at);

  } catch (e) {
    JobRepository.softDelete(testJob.job_id, testJob.updated_at);
    throw e;
  }
}

/**
 * AssignmentService.getShortage テスト
 */
function testAssignmentServiceGetShortage() {
  // テスト用データを作成
  const testJob = JobRepository.insert({
    customer_id: 'cus_test',
    site_name: 'テスト現場（shortage）',
    work_date: '2099-12-31',
    time_slot: 'shuujitsu',
    required_count: 3,
    pay_unit: 'basic'
  });

  const assignment1 = AssignmentRepository.insert({
    job_id: testJob.job_id,
    staff_id: 'stf_test_001',
    worker_type: 'STAFF',
    display_time_slot: 'shuujitsu',
    pay_unit: 'FULLDAY',
    invoice_unit: 'FULLDAY'
  });

  try {
    // 過不足を取得
    const shortage = AssignmentService.getShortage(testJob.job_id);

    // 検証
    assertEqual(shortage.required, 3, 'required should be 3');
    assertEqual(shortage.assigned, 1, 'assigned should be 1');
    assertEqual(shortage.shortage, 2, 'shortage should be 2');

    // クリーンアップ
    AssignmentRepository.softDelete(assignment1.assignment_id);
    JobRepository.softDelete(testJob.job_id, testJob.updated_at);

  } catch (e) {
    AssignmentRepository.softDelete(assignment1.assignment_id);
    JobRepository.softDelete(testJob.job_id, testJob.updated_at);
    throw e;
  }
}

/**
 * AssignmentRepository.checkDuplicateAssignment テスト
 */
function testAssignmentServiceCheckDuplicate() {
  // テスト用データを作成
  const testJob = JobRepository.insert({
    customer_id: 'cus_test',
    site_name: 'テスト現場（duplicate）',
    work_date: '2099-12-31',
    time_slot: 'am',
    required_count: 2,
    pay_unit: 'tobi'
  });

  const assignment = AssignmentRepository.insert({
    job_id: testJob.job_id,
    staff_id: 'stf_test_001',
    worker_type: 'STAFF',
    display_time_slot: 'am',
    pay_unit: 'FULLDAY',
    invoice_unit: 'FULLDAY'
  });

  try {
    // 重複チェック（同じスタッフ）
    const isDuplicate = AssignmentRepository.checkDuplicateAssignment(
      'stf_test_001',
      testJob.job_id
    );
    assertTrue(isDuplicate, 'should detect duplicate');

    // 重複チェック（別スタッフ）
    const isNotDuplicate = AssignmentRepository.checkDuplicateAssignment(
      'stf_test_999',
      testJob.job_id
    );
    assertTrue(!isNotDuplicate, 'should not detect duplicate for different staff');

    // クリーンアップ
    AssignmentRepository.softDelete(assignment.assignment_id);
    JobRepository.softDelete(testJob.job_id, testJob.updated_at);

  } catch (e) {
    AssignmentRepository.softDelete(assignment.assignment_id);
    JobRepository.softDelete(testJob.job_id, testJob.updated_at);
    throw e;
  }
}

/**
 * saveAssignments API テスト
 */
function testSaveAssignmentsAPI() {
  // テスト用データを作成
  const testJob = JobRepository.insert({
    customer_id: 'cus_test',
    site_name: 'テスト現場（API）',
    work_date: '2099-12-31',
    time_slot: 'pm',
    required_count: 2,
    pay_unit: 'basic'
  });

  try {
    // 配置を追加（APIを直接呼び出し）
    const changes = {
      upserts: [
        {
          staff_id: 'stf_test_001',
          pay_unit: 'FULLDAY',
          invoice_unit: 'FULLDAY',
          display_time_slot: 'pm'
        }
      ],
      deletes: []
    };

    const response = AssignmentService.saveAssignments(
      testJob.job_id,
      changes,
      testJob.updated_at
    );

    // 検証
    assertTrue(response.ok, 'response should be ok');
    assertEqual(response.data.inserted, 1, 'should insert 1 assignment');
    assertTrue(response.data.assignments.length >= 1, 'should have at least 1 assignment');

    // クリーンアップ
    const assignments = AssignmentRepository.findByJobId(testJob.job_id);
    for (const a of assignments) {
      AssignmentRepository.softDelete(a.assignment_id);
    }
    JobRepository.softDelete(testJob.job_id, response.data.job.updated_at);

  } catch (e) {
    const job = JobRepository.findById(testJob.job_id);
    if (job) {
      const assignments = AssignmentRepository.findByJobId(testJob.job_id);
      for (const a of assignments) {
        AssignmentRepository.softDelete(a.assignment_id);
      }
      JobRepository.softDelete(testJob.job_id, job.updated_at);
    }
    throw e;
  }
}

// ========================================
// テストヘルパー
// ========================================

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

function assertTrue(value, message) {
  if (!value) {
    throw new Error(`${message}: expected true, got ${value}`);
  }
}
