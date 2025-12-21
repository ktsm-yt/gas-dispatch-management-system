/**
 * Job Module Tests
 *
 * 案件管理モジュールのテスト関数
 */

/**
 * 全テスト実行
 */
function runAllJobTests() {
  Logger.log('=== 案件管理モジュール テスト開始 ===\n');

  testUtils();
  testJobRepository();
  testJobService();
  testJobApi();

  Logger.log('\n=== 全テスト完了 ===');
}

/**
 * ユーティリティ関数テスト
 */
function testUtils() {
  Logger.log('--- Utils Tests ---');

  // generateId
  const jobId = generateId('job');
  Logger.log(`generateId('job'): ${jobId}`);
  Logger.log(`  ✓ Starts with 'job_': ${jobId.startsWith('job_')}`);

  // validateRequired
  const result1 = validateRequired({ a: 1, b: '', c: null }, ['a', 'b', 'c']);
  Logger.log(`validateRequired: valid=${result1.valid}, missing=${result1.missing.join(',')}`);

  // isValidDate
  Logger.log(`isValidDate('2025-12-15'): ${isValidDate('2025-12-15')}`);
  Logger.log(`isValidDate('invalid'): ${isValidDate('invalid')}`);

  // buildSuccessResponse
  const successResp = buildSuccessResponse({ test: 'data' });
  Logger.log(`buildSuccessResponse: ok=${successResp.ok}, hasRequestId=${!!successResp.requestId}`);

  // buildErrorResponse
  const errorResp = buildErrorResponse('TEST_ERROR', 'Test message');
  Logger.log(`buildErrorResponse: ok=${errorResp.ok}, code=${errorResp.error.code}`);

  Logger.log('');
}

/**
 * JobRepositoryテスト
 */
function testJobRepository() {
  Logger.log('--- JobRepository Tests ---');

  // テストデータ作成
  const testDate = '2025-12-20';
  const testCustomerId = 'cus_test_' + Utilities.getUuid().substring(0, 8);

  // insert
  const newJob = JobRepository.insert({
    customer_id: testCustomerId,
    site_name: 'テスト現場',
    work_date: testDate,
    time_slot: 'am',
    required_count: 3,
    job_type: '揚げ'
  });
  Logger.log(`insert: job_id=${newJob.job_id}`);
  Logger.log(`  ✓ Created: ${!!newJob.job_id}`);

  // findById
  const found = JobRepository.findById(newJob.job_id);
  Logger.log(`findById: found=${!!found}`);
  Logger.log(`  ✓ site_name matches: ${found && found.site_name === 'テスト現場'}`);

  // findByDate
  const byDate = JobRepository.findByDate(testDate);
  Logger.log(`findByDate('${testDate}'): count=${byDate.length}`);
  Logger.log(`  ✓ Contains test job: ${byDate.some(j => j.job_id === newJob.job_id)}`);

  // search
  const searchResult = JobRepository.search({ customer_id: testCustomerId });
  Logger.log(`search(customer_id): count=${searchResult.length}`);

  // update
  const updateResult = JobRepository.update(
    { job_id: newJob.job_id, site_name: 'テスト現場（更新）' },
    newJob.updated_at
  );
  Logger.log(`update: success=${updateResult.success}`);
  Logger.log(`  ✓ site_name updated: ${updateResult.job && updateResult.job.site_name === 'テスト現場（更新）'}`);

  // 競合テスト（古いupdated_atで更新を試みる）
  const conflictResult = JobRepository.update(
    { job_id: newJob.job_id, notes: 'conflict test' },
    newJob.updated_at // 古いタイムスタンプ
  );
  Logger.log(`conflict test: error=${conflictResult.error}`);
  Logger.log(`  ✓ CONFLICT_ERROR: ${conflictResult.error === 'CONFLICT_ERROR'}`);

  // getMaxUpdatedAt
  const maxUpdatedAt = JobRepository.getMaxUpdatedAt(testDate);
  Logger.log(`getMaxUpdatedAt: ${maxUpdatedAt}`);

  // softDelete（クリーンアップ）
  const deleteResult = JobRepository.softDelete(newJob.job_id, updateResult.job.updated_at);
  Logger.log(`softDelete: success=${deleteResult.success}`);

  Logger.log('');
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
    job_type: '鳶'
  }, null);
  Logger.log(`save (create): success=${createResult.success}`);
  Logger.log(`  ✓ Has job_id: ${!!createResult.job?.job_id}`);

  if (createResult.success) {
    const jobId = createResult.job.job_id;

    // get
    const getResult = JobService.get(jobId);
    Logger.log(`get: found=${!!getResult}`);
    Logger.log(`  ✓ Has job: ${!!getResult?.job}`);
    Logger.log(`  ✓ Has assignments array: ${Array.isArray(getResult?.assignments)}`);

    // getDashboard
    const dashboard = JobService.getDashboard(testDate);
    Logger.log(`getDashboard: jobs=${dashboard.jobs.length}, total=${dashboard.stats.total}`);
    Logger.log(`  ✓ Has byTimeSlot: ${!!dashboard.stats.byTimeSlot}`);

    // getDashboardMeta
    const meta = JobService.getDashboardMeta(testDate);
    Logger.log(`getDashboardMeta: maxUpdatedAt=${meta.maxUpdatedAt}`);

    // save (update)
    const updateResult = JobService.save(
      { job_id: jobId, notes: 'Updated via service' },
      createResult.job.updated_at
    );
    Logger.log(`save (update): success=${updateResult.success}`);

    // updateStatus
    const statusResult = JobService.updateStatus(
      jobId,
      'assigned',
      updateResult.job.updated_at
    );
    Logger.log(`updateStatus: success=${statusResult.success}`);
    Logger.log(`  ✓ Status is 'assigned': ${statusResult.job?.status === 'assigned'}`);

    // validation error test
    const invalidResult = JobService.save({
      customer_id: 'test',
      // missing required fields
    }, null);
    Logger.log(`validation test: error=${invalidResult.error}`);
    Logger.log(`  ✓ VALIDATION_ERROR: ${invalidResult.error === 'VALIDATION_ERROR'}`);

    // クリーンアップ
    JobRepository.softDelete(jobId, statusResult.job.updated_at);
  }

  Logger.log('');
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
    job_type: '鳶揚げ'
  }, null);
  Logger.log(`saveJob (create): ok=${createResp.ok}`);
  Logger.log(`  ✓ Has requestId: ${!!createResp.requestId}`);
  Logger.log(`  ✓ Has serverTime: ${!!createResp.serverTime}`);

  if (createResp.ok) {
    const jobId = createResp.data.job.job_id;
    const updatedAt = createResp.data.job.updated_at;

    // getJob
    const getResp = getJob(jobId);
    Logger.log(`getJob: ok=${getResp.ok}`);
    Logger.log(`  ✓ Has job: ${!!getResp.data?.job}`);

    // getDashboard
    const dashResp = getDashboard(testDate);
    Logger.log(`getDashboard: ok=${dashResp.ok}, jobs=${dashResp.data?.jobs?.length}`);

    // getDashboardMeta
    const metaResp = getDashboardMeta(testDate);
    Logger.log(`getDashboardMeta: ok=${metaResp.ok}`);

    // searchJobs
    const searchResp = searchJobs({ work_date_from: testDate, work_date_to: testDate });
    Logger.log(`searchJobs: ok=${searchResp.ok}, count=${searchResp.data?.jobs?.length}`);

    // saveJob (update)
    const updateResp = saveJob(
      { job_id: jobId, required_count: 6 },
      updatedAt
    );
    Logger.log(`saveJob (update): ok=${updateResp.ok}`);

    // updateJobStatus
    const statusResp = updateJobStatus(jobId, 'hold', updateResp.data?.job?.updated_at);
    Logger.log(`updateJobStatus: ok=${statusResp.ok}`);

    // エラーケース: NOT_FOUND
    const notFoundResp = getJob('job_nonexistent');
    Logger.log(`getJob (not found): ok=${notFoundResp.ok}, code=${notFoundResp.error?.code}`);
    Logger.log(`  ✓ NOT_FOUND: ${notFoundResp.error?.code === 'NOT_FOUND'}`);

    // エラーケース: VALIDATION_ERROR
    const validationResp = saveJob({ customer_id: 'test' }, null); // missing fields
    Logger.log(`saveJob (validation): ok=${validationResp.ok}, code=${validationResp.error?.code}`);
    Logger.log(`  ✓ VALIDATION_ERROR: ${validationResp.error?.code === 'VALIDATION_ERROR'}`);

    // クリーンアップ
    const finalJob = statusResp.data?.job || updateResp.data?.job;
    if (finalJob) {
      JobRepository.softDelete(jobId, finalJob.updated_at);
    }
  }

  Logger.log('');
}

/**
 * 簡易テスト（開発中の確認用）
 */
function quickTest() {
  Logger.log('=== Quick Test ===');

  // 今日の日付でダッシュボード取得
  const today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  Logger.log(`Today: ${today}`);

  const dashResp = getDashboard(today);
  Logger.log(`Dashboard: ok=${dashResp.ok}`);

  if (dashResp.ok) {
    Logger.log(`  Jobs: ${dashResp.data.jobs.length}`);
    Logger.log(`  Stats: total=${dashResp.data.stats.total}, pending=${dashResp.data.stats.pending}`);
  } else {
    Logger.log(`  Error: ${dashResp.error?.message}`);
  }
}
