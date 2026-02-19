/**
 * Job Module Tests
 *
 * 案件管理モジュールのテスト関数
 * assert関数はtest_helpers.gsで定義
 */

/**
 * 全テスト実行
 * @returns {Object} { passed, failed, errors }
 */
function runAllJobTests() {
  Logger.log('=== 案件管理モジュール テスト開始 ===\n');

  const results = {
    passed: 0,
    failed: 0,
    errors: []
  };

  const tests = [
    { name: 'testUtils', fn: testUtils },
    { name: 'testJobRepository', fn: testJobRepository },
    { name: 'testJobService', fn: testJobService },
    { name: 'testJobApi', fn: testJobApi }
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
    }
  }

  Logger.log('\n=== 全テスト完了 ===');
  Logger.log(`結果: ${results.passed} passed, ${results.failed} failed`);

  return results;
}

/**
 * ユーティリティ関数テスト
 */
function testUtils() {
  Logger.log('--- Utils Tests ---');

  // generateId
  const jobId = generateId('job');
  assertTrue(jobId.startsWith('job_'), 'generateId should start with job_');

  // validateRequired
  const result1 = validateRequired({ a: 1, b: '', c: null }, ['a', 'b', 'c']);
  assertFalse(result1.valid, 'validateRequired should be invalid with empty/null fields');
  assert(result1.missing.length > 0, 'validateRequired should report missing fields');

  // isValidDate
  assertTrue(isValidDate('2025-12-15'), 'isValidDate should accept valid date');
  assertFalse(isValidDate('invalid'), 'isValidDate should reject invalid date');

  // buildSuccessResponse
  const successResp = buildSuccessResponse({ test: 'data' });
  assertTrue(successResp.ok, 'buildSuccessResponse ok should be true');
  assert(successResp.requestId, 'buildSuccessResponse should have requestId');

  // buildErrorResponse
  const errorResp = buildErrorResponse('TEST_ERROR', 'Test message');
  assertFalse(errorResp.ok, 'buildErrorResponse ok should be false');
  assertEqual(errorResp.error.code, 'TEST_ERROR', 'buildErrorResponse error code');

  Logger.log('  All utils assertions passed');
}

/**
 * JobRepositoryテスト
 */
function testJobRepository() {
  Logger.log('--- JobRepository Tests ---');

  const testDate = '2025-12-20';
  const testCustomerId = 'cus_test_' + Utilities.getUuid().substring(0, 8);

  // insert
  const newJob = JobRepository.insert({
    customer_id: testCustomerId,
    site_name: 'テスト現場',
    work_date: testDate,
    time_slot: 'am',
    required_count: 3,
    pay_unit: 'basic'
  });
  assert(newJob.job_id, 'insert should return job_id');
  assertTrue(newJob.job_id.startsWith('job_'), 'job_id should start with job_');

  // findById
  const found = JobRepository.findById(newJob.job_id);
  assert(found, 'findById should return a job');
  assertEqual(found.site_name, 'テスト現場', 'findById site_name should match');
  assertEqual(found.customer_id, testCustomerId, 'findById customer_id should match');
  assertEqual(found.work_date, testDate, 'findById work_date should match');
  assertEqual(found.time_slot, 'am', 'findById time_slot should match');
  assertEqual(found.required_count, 3, 'findById required_count should match');

  // findByDate
  const byDate = JobRepository.findByDate(testDate);
  assert(byDate.length > 0, 'findByDate should return results');
  assertTrue(byDate.some(j => j.job_id === newJob.job_id), 'findByDate should contain test job');

  // search
  const searchResult = JobRepository.search({ customer_id: testCustomerId });
  assert(searchResult.length > 0, 'search should return results');
  assertEqual(searchResult[0].job_id, newJob.job_id, 'search should find the test job');

  // update
  const updateResult = JobRepository.update(
    { job_id: newJob.job_id, site_name: 'テスト現場（更新）' },
    newJob.updated_at
  );
  assertTrue(updateResult.success, 'update should succeed');
  assertEqual(updateResult.job.site_name, 'テスト現場（更新）', 'update site_name should be changed');

  // 競合テスト（古いupdated_atで更新を試みる）
  const conflictResult = JobRepository.update(
    { job_id: newJob.job_id, notes: 'conflict test' },
    newJob.updated_at // 古いタイムスタンプ
  );
  assertEqual(conflictResult.error, 'CONFLICT_ERROR', 'conflict should return CONFLICT_ERROR');

  // getMaxUpdatedAt
  const maxUpdatedAt = JobRepository.getMaxUpdatedAt(testDate);
  assert(maxUpdatedAt, 'getMaxUpdatedAt should return a value');

  // softDelete（クリーンアップ）
  const deleteResult = JobRepository.softDelete(newJob.job_id, updateResult.job.updated_at);
  assertTrue(deleteResult.success, 'softDelete should succeed');

  Logger.log('  All JobRepository assertions passed');
}

/**
 * JobServiceテスト
 */
function testJobService() {
  Logger.log('--- JobService Tests ---');

  const testDate = '2025-12-21';

  // save (create)
  const createResult = JobService.save({
    customer_id: 'cus_test_service',
    site_name: 'サービステスト現場',
    work_date: testDate,
    time_slot: 'pm',
    required_count: 2,
    pay_unit: 'tobi'
  }, null);
  assertTrue(createResult.success, 'save (create) should succeed');
  assert(createResult.job.job_id, 'save should return job_id');

  const jobId = createResult.job.job_id;

  // get
  const getResult = JobService.get(jobId);
  assert(getResult, 'get should return result');
  assert(getResult.job, 'get should have job');
  assertTrue(Array.isArray(getResult.assignments), 'get should have assignments array');

  // getDashboard
  const dashboard = JobService.getDashboard(testDate);
  assert(dashboard.jobs.length > 0, 'getDashboard should return jobs');
  assert(typeof dashboard.stats.total === 'number', 'getDashboard should have stats.total');
  assert(dashboard.stats.byTimeSlot, 'getDashboard should have byTimeSlot');

  // getDashboardMeta
  const meta = JobService.getDashboardMeta(testDate);
  assert(meta.maxUpdatedAt, 'getDashboardMeta should return maxUpdatedAt');

  // save (update)
  const updateResult = JobService.save(
    { job_id: jobId, notes: 'Updated via service' },
    createResult.job.updated_at
  );
  assertTrue(updateResult.success, 'save (update) should succeed');

  // updateStatus
  const statusResult = JobService.updateStatus(
    jobId,
    'assigned',
    updateResult.job.updated_at
  );
  assertTrue(statusResult.success, 'updateStatus should succeed');
  assertEqual(statusResult.job.status, 'assigned', 'status should be assigned');

  // validation error test
  const invalidResult = JobService.save({
    customer_id: 'test',
    // missing required fields
  }, null);
  assertEqual(invalidResult.error, 'VALIDATION_ERROR', 'missing fields should return VALIDATION_ERROR');

  // クリーンアップ
  JobRepository.softDelete(jobId, statusResult.job.updated_at);

  Logger.log('  All JobService assertions passed');
}

/**
 * Job APIテスト
 */
function testJobApi() {
  Logger.log('--- Job API Tests ---');

  const testDate = '2025-12-22';

  // saveJob (create)
  const createResp = saveJob({
    customer_id: 'cus_api_test',
    site_name: 'APIテスト現場',
    work_date: testDate,
    time_slot: 'jotou',
    required_count: 5,
    pay_unit: 'tobiage'
  }, null);
  assertTrue(createResp.ok, 'saveJob (create) should be ok');
  assert(createResp.requestId, 'saveJob should have requestId');
  assert(createResp.serverTime, 'saveJob should have serverTime');

  const jobId = createResp.data.job.job_id;
  const updatedAt = createResp.data.job.updated_at;

  // getJob
  const getResp = getJob(jobId);
  assertTrue(getResp.ok, 'getJob should be ok');
  assert(getResp.data.job, 'getJob should have job');
  assertEqual(getResp.data.job.site_name, 'APIテスト現場', 'getJob site_name should match');

  // getDashboard
  const dashResp = getDashboard(testDate);
  assertTrue(dashResp.ok, 'getDashboard should be ok');
  assert(dashResp.data.jobs.length > 0, 'getDashboard should have jobs');

  // getDashboardMeta
  const metaResp = getDashboardMeta(testDate);
  assertTrue(metaResp.ok, 'getDashboardMeta should be ok');

  // searchJobs
  const searchResp = searchJobs({ work_date_from: testDate, work_date_to: testDate });
  assertTrue(searchResp.ok, 'searchJobs should be ok');
  assert(searchResp.data.jobs.length > 0, 'searchJobs should return results');

  // saveJob (update)
  const updateResp = saveJob(
    { job_id: jobId, required_count: 6 },
    updatedAt
  );
  assertTrue(updateResp.ok, 'saveJob (update) should be ok');

  // updateJobStatus
  const statusResp = updateJobStatus(jobId, 'hold', updateResp.data.job.updated_at);
  assertTrue(statusResp.ok, 'updateJobStatus should be ok');

  // エラーケース: NOT_FOUND
  const notFoundResp = getJob('job_nonexistent');
  assertFalse(notFoundResp.ok, 'getJob (not found) should not be ok');
  assertEqual(notFoundResp.error.code, 'NOT_FOUND', 'should return NOT_FOUND');

  // エラーケース: VALIDATION_ERROR
  const validationResp = saveJob({ customer_id: 'test' }, null);
  assertFalse(validationResp.ok, 'saveJob (validation) should not be ok');
  assertEqual(validationResp.error.code, 'VALIDATION_ERROR', 'should return VALIDATION_ERROR');

  // クリーンアップ
  const finalJob = statusResp.data.job || updateResp.data.job;
  if (finalJob) {
    JobRepository.softDelete(jobId, finalJob.updated_at);
  }

  Logger.log('  All Job API assertions passed');
}

/**
 * searchJobs APIテスト
 */
function testSearchJobs() {
  Logger.log('=== searchJobs テスト ===');

  const query = {
    work_date_from: '2025-11-01',
    work_date_to: '2025-12-31',
    limit: 10
  };

  const result = searchJobs(query);
  assertTrue(result.ok, 'searchJobs should be ok');
  assertTrue(Array.isArray(result.data.jobs), 'searchJobs should return jobs array');
}

/**
 * 簡易テスト（開発中の確認用）
 */
function quickTest() {
  Logger.log('=== Quick Test ===');

  const today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  const dashResp = getDashboard(today);
  assertTrue(dashResp.ok, 'getDashboard should be ok');
  assert(typeof dashResp.data.jobs.length === 'number', 'should have jobs array');
  assert(typeof dashResp.data.stats.total === 'number', 'should have stats.total');
}

/**
 * work_dateの値をデバッグ
 */
function debugWorkDate() {
  const sheet = getSheet('T_Jobs');
  const data = sheet.getDataRange().getValues();

  Logger.log('=== work_date デバッグ ===');
  Logger.log(`行数: ${data.length}`);

  if (data.length > 1) {
    const headers = data[0];
    const workDateIdx = headers.indexOf('work_date');
    Logger.log(`work_date列インデックス: ${workDateIdx}`);

    for (let i = 1; i < Math.min(data.length, 5); i++) {
      const val = data[i][workDateIdx];
      Logger.log(`行${i+1}: value="${val}", type=${typeof val}, isDate=${val instanceof Date}`);
      if (val instanceof Date) {
        Logger.log(`  -> formatted: ${Utilities.formatDate(val, 'Asia/Tokyo', 'yyyy-MM-dd')}`);
      }
    }
  }
}

/**
 * テストデータ投入（今日と明日の案件を作成）
 */
function insertTestData() {
  Logger.log('=== テストデータ投入開始 ===');

  const today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  const tomorrow = Utilities.formatDate(
    new Date(Date.now() + 24 * 60 * 60 * 1000),
    'Asia/Tokyo',
    'yyyy-MM-dd'
  );

  const testJobs = [
    { work_date: today, time_slot: 'jotou', site_name: '○○邸 新築工事', site_address: '東京都新宿区西新宿1-1-1', required_count: 5, pay_unit: 'tobiage', status: 'pending', supervisor_name: '山田太郎' },
    { work_date: today, time_slot: 'am', site_name: '△△マンション改修', site_address: '東京都渋谷区渋谷2-2-2', required_count: 3, pay_unit: 'basic', status: 'assigned', supervisor_name: '鈴木一郎' },
    { work_date: today, time_slot: 'am', site_name: '□□ビル解体', site_address: '東京都港区六本木3-3-3', required_count: 4, pay_unit: 'tobi', status: 'pending', supervisor_name: '佐藤次郎' },
    { work_date: today, time_slot: 'pm', site_name: '◇◇倉庫建設', site_address: '東京都品川区大井4-4-4', required_count: 2, pay_unit: 'basic', status: 'pending', supervisor_name: '田中三郎' },
    { work_date: today, time_slot: 'shuujitsu', site_name: '××商業施設', site_address: '東京都中央区銀座5-5-5', required_count: 6, pay_unit: 'tobiage', status: 'assigned', supervisor_name: '高橋四郎' },
    { work_date: today, time_slot: 'yakin', site_name: '☆☆病院増築', site_address: '東京都文京区本郷6-6-6', required_count: 3, pay_unit: 'tobi', status: 'pending', supervisor_name: '伊藤五郎' },
    { work_date: tomorrow, time_slot: 'am', site_name: '▲▲学校体育館', site_address: '東京都世田谷区三軒茶屋7-7-7', required_count: 4, pay_unit: 'basic', status: 'pending', supervisor_name: '渡辺六郎' },
    { work_date: tomorrow, time_slot: 'pm', site_name: '●●オフィスビル', site_address: '東京都千代田区丸の内8-8-8', required_count: 5, pay_unit: 'tobiage', status: 'pending', supervisor_name: '小林七郎' },
  ];

  let successCount = 0;
  for (const job of testJobs) {
    try {
      const result = JobRepository.insert(job);
      Logger.log(`✓ 作成: ${job.site_name} (${result.job_id})`);
      successCount++;
    } catch (error) {
      Logger.log(`✗ 失敗: ${job.site_name} - ${error.message}`);
    }
  }

  Logger.log(`\n=== 完了: ${successCount}/${testJobs.length} 件作成 ===`);
}
