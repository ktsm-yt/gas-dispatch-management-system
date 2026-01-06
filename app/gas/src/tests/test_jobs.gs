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
    pay_unit: 'basic'
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
    pay_unit: 'tobi'
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
    pay_unit: 'tobiage'
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
 * searchJobs APIテスト
 */
function testSearchJobs() {
  Logger.log('=== searchJobs テスト ===');

  try {
    const query = {
      work_date_from: '2025-11-01',
      work_date_to: '2025-12-31',
      limit: 10
    };
    Logger.log('Query: ' + JSON.stringify(query));

    const result = searchJobs(query);
    Logger.log('Result: ' + JSON.stringify(result, null, 2));

    if (result && result.ok) {
      Logger.log('✓ 成功: ' + (result.data.jobs?.length || 0) + '件');
    } else {
      Logger.log('✗ 失敗: ' + (result?.error?.message || 'Unknown error'));
    }
  } catch (e) {
    Logger.log('✗ 例外: ' + e.message);
    Logger.log(e.stack);
  }
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
    // 今日の案件
    { work_date: today, time_slot: 'jotou', site_name: '○○邸 新築工事', site_address: '東京都新宿区西新宿1-1-1', required_count: 5, pay_unit: 'tobiage', status: 'pending', supervisor_name: '山田太郎' },
    { work_date: today, time_slot: 'am', site_name: '△△マンション改修', site_address: '東京都渋谷区渋谷2-2-2', required_count: 3, pay_unit: 'basic', status: 'assigned', supervisor_name: '鈴木一郎' },
    { work_date: today, time_slot: 'am', site_name: '□□ビル解体', site_address: '東京都港区六本木3-3-3', required_count: 4, pay_unit: 'tobi', status: 'pending', supervisor_name: '佐藤次郎' },
    { work_date: today, time_slot: 'pm', site_name: '◇◇倉庫建設', site_address: '東京都品川区大井4-4-4', required_count: 2, pay_unit: 'basic', status: 'pending', supervisor_name: '田中三郎' },
    { work_date: today, time_slot: 'shuujitsu', site_name: '××商業施設', site_address: '東京都中央区銀座5-5-5', required_count: 6, pay_unit: 'tobiage', status: 'assigned', supervisor_name: '高橋四郎' },
    { work_date: today, time_slot: 'yakin', site_name: '☆☆病院増築', site_address: '東京都文京区本郷6-6-6', required_count: 3, pay_unit: 'tobi', status: 'pending', supervisor_name: '伊藤五郎' },
    // 明日の案件
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
