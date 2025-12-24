/**
 * パフォーマンステスト
 *
 * GAS 6分制限の確認と最適化検証
 * GASエディタから runPerformanceTests() を実行してください
 */

// ============================================================
// 設定
// ============================================================

const PERF_TEST_CONFIG = {
  // GAS制限
  MAX_EXECUTION_TIME_MS: 6 * 60 * 1000, // 6分
  WARNING_THRESHOLD_MS: 5 * 60 * 1000,  // 5分で警告

  // テスト回数
  ITERATIONS: 3,  // 各テストの繰り返し回数

  // 許容時間（ms）
  THRESHOLDS: {
    getDashboard: 3000,       // ダッシュボード取得
    searchJobs: 15000,        // 案件検索（大量データ対応）
    getAllCustomers: 2000,    // 顧客一覧
    getAllStaff: 2000,        // スタッフ一覧
    saveJob: 1000,            // 案件保存
    saveAssignment: 1000,     // 配置保存
    bulkInsert: 10000         // 一括挿入（100件）
  }
};

// ============================================================
// メインテスト関数
// ============================================================

/**
 * 全パフォーマンステストを実行
 */
function runPerformanceTests() {
  const startTime = Date.now();
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║         パフォーマンステスト実行                   ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  const results = {
    tests: [],
    passed: 0,
    failed: 0,
    warnings: []
  };

  // データ件数確認
  console.log('--- データ件数確認 ---');
  const counts = checkDataCounts();
  console.log(`顧客: ${counts.customers}, スタッフ: ${counts.staff}, 案件: ${counts.jobs}, 配置: ${counts.assignments}\n`);

  if (counts.jobs < 100) {
    console.log('⚠️ テストデータが少ないです。createBulkTestData() を先に実行することを推奨します。\n');
  }

  // 1. 読み取りパフォーマンス
  console.log('\n=== 1. 読み取りパフォーマンス ===');
  results.tests.push(testGetDashboard());
  results.tests.push(testSearchJobs());
  results.tests.push(testGetAllCustomers());
  results.tests.push(testGetAllStaff());

  // 2. 書き込みパフォーマンス
  console.log('\n=== 2. 書き込みパフォーマンス ===');
  results.tests.push(testSaveJob());
  results.tests.push(testSaveAssignment());

  // 3. 一括処理パフォーマンス
  console.log('\n=== 3. 一括処理パフォーマンス ===');
  results.tests.push(testBulkOperations());

  // 4. 競合処理テスト（楽観ロック）
  console.log('\n=== 4. 楽観ロック動作確認 ===');
  results.tests.push(testOptimisticLocking());

  // 5. キャッシュ効果測定
  console.log('\n=== 5. キャッシュ効果測定 ===');
  results.tests.push(testCacheEffectiveness());

  // 結果集計
  for (const test of results.tests) {
    if (test.passed) {
      results.passed++;
    } else {
      results.failed++;
    }
    if (test.warning) {
      results.warnings.push(test.name + ': ' + test.warning);
    }
  }

  // レポート出力
  const elapsed = Date.now() - startTime;
  printPerformanceReport(results, elapsed, counts);

  return results;
}

// ============================================================
// 個別テスト関数
// ============================================================

/**
 * ダッシュボード取得テスト
 */
function testGetDashboard() {
  const testName = 'getDashboard';
  const threshold = PERF_TEST_CONFIG.THRESHOLDS.getDashboard;
  const times = [];

  const today = formatDateForPerf(new Date());

  for (let i = 0; i < PERF_TEST_CONFIG.ITERATIONS; i++) {
    const start = Date.now();
    try {
      JobService.getDashboard(today);
    } catch (e) {
      return { name: testName, passed: false, error: e.message };
    }
    times.push(Date.now() - start);
  }

  const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
  const passed = avg <= threshold;
  const warning = avg > threshold * 0.8 ? `閾値の80%超過 (${avg}ms / ${threshold}ms)` : null;

  console.log(`${passed ? '✅' : '❌'} ${testName}: 平均 ${avg}ms (閾値: ${threshold}ms)`);

  return { name: testName, avg, threshold, passed, warning, times };
}

/**
 * 案件検索テスト
 */
function testSearchJobs() {
  const testName = 'searchJobs';
  const threshold = PERF_TEST_CONFIG.THRESHOLDS.searchJobs;
  const times = [];

  const today = new Date();
  const tenDaysLater = new Date(today);
  tenDaysLater.setDate(tenDaysLater.getDate() + 10);

  for (let i = 0; i < PERF_TEST_CONFIG.ITERATIONS; i++) {
    const start = Date.now();
    try {
      JobService.search({
        date_from: formatDateForPerf(today),
        date_to: formatDateForPerf(tenDaysLater)
      });
    } catch (e) {
      return { name: testName, passed: false, error: e.message };
    }
    times.push(Date.now() - start);
  }

  const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
  const passed = avg <= threshold;

  console.log(`${passed ? '✅' : '❌'} ${testName}: 平均 ${avg}ms (閾値: ${threshold}ms)`);

  return { name: testName, avg, threshold, passed, times };
}

/**
 * 顧客一覧取得テスト
 */
function testGetAllCustomers() {
  const testName = 'getAllCustomers';
  const threshold = PERF_TEST_CONFIG.THRESHOLDS.getAllCustomers;
  const times = [];
  let count = 0;

  for (let i = 0; i < PERF_TEST_CONFIG.ITERATIONS; i++) {
    const start = Date.now();
    try {
      const result = getAllRecords('M_Customers');
      count = result.length;
    } catch (e) {
      return { name: testName, passed: false, error: e.message };
    }
    times.push(Date.now() - start);
  }

  const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
  const passed = avg <= threshold;

  console.log(`${passed ? '✅' : '❌'} ${testName}: 平均 ${avg}ms (${count}件, 閾値: ${threshold}ms)`);

  return { name: testName, avg, threshold, passed, count, times };
}

/**
 * スタッフ一覧取得テスト
 */
function testGetAllStaff() {
  const testName = 'getAllStaff';
  const threshold = PERF_TEST_CONFIG.THRESHOLDS.getAllStaff;
  const times = [];
  let count = 0;

  for (let i = 0; i < PERF_TEST_CONFIG.ITERATIONS; i++) {
    const start = Date.now();
    try {
      const result = getAllRecords('M_Staff');
      count = result.length;
    } catch (e) {
      return { name: testName, passed: false, error: e.message };
    }
    times.push(Date.now() - start);
  }

  const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
  const passed = avg <= threshold;

  console.log(`${passed ? '✅' : '❌'} ${testName}: 平均 ${avg}ms (${count}件, 閾値: ${threshold}ms)`);

  return { name: testName, avg, threshold, passed, count, times };
}

/**
 * 案件保存テスト
 */
function testSaveJob() {
  const testName = 'saveJob';
  const threshold = PERF_TEST_CONFIG.THRESHOLDS.saveJob;
  const times = [];

  // テスト用顧客取得
  const customers = getAllRecords('M_Customers').filter(c => !c.is_deleted);
  if (customers.length === 0) {
    console.log(`⚠️ ${testName}: テスト顧客がありません`);
    return { name: testName, passed: true, skipped: true };
  }

  const customer = customers[0];
  const testJobIds = [];

  for (let i = 0; i < PERF_TEST_CONFIG.ITERATIONS; i++) {
    const job = {
      customer_id: customer.customer_id,
      site_name: `パフォーマンステスト現場_${Date.now()}`,
      site_address: '東京都千代田区1-1-1',
      work_date: formatDateForPerf(new Date()),
      time_slot: 'shuujitsu',
      start_time: '08:00',
      required_count: 2,
      job_type: 'tobi',
      status: 'pending'
    };

    const start = Date.now();
    try {
      const result = JobService.save(job, null);
      if (result.success && result.job) {
        testJobIds.push(result.job.job_id);
      }
    } catch (e) {
      return { name: testName, passed: false, error: e.message };
    }
    times.push(Date.now() - start);
  }

  // テストデータ削除
  for (const jobId of testJobIds) {
    try {
      const job = JobRepository.findById(jobId);
      if (job) {
        JobRepository.softDelete(jobId, job.updated_at);
      }
    } catch (e) { }
  }

  const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
  const passed = avg <= threshold;

  console.log(`${passed ? '✅' : '❌'} ${testName}: 平均 ${avg}ms (閾値: ${threshold}ms)`);

  return { name: testName, avg, threshold, passed, times };
}

/**
 * 配置保存テスト
 */
function testSaveAssignment() {
  const testName = 'saveAssignment';
  const threshold = PERF_TEST_CONFIG.THRESHOLDS.saveAssignment;
  const times = [];

  // テスト用案件・スタッフ取得
  const jobs = getAllRecords('T_Jobs').filter(j => !j.is_deleted && j.status === 'pending');
  const staff = getAllRecords('M_Staff').filter(s => !s.is_deleted);

  if (jobs.length === 0 || staff.length === 0) {
    console.log(`⚠️ ${testName}: テストデータがありません`);
    return { name: testName, passed: true, skipped: true };
  }

  const job = jobs[0];
  const testAssignmentIds = [];

  for (let i = 0; i < PERF_TEST_CONFIG.ITERATIONS; i++) {
    const staffMember = staff[i % staff.length];

    const assignment = {
      job_id: job.job_id,
      staff_id: staffMember.staff_id,
      worker_type: 'STAFF',
      wage_rate: 15000,
      invoice_rate: 25000,
      transport_amount: 500,
      status: 'assigned'
    };

    const start = Date.now();
    try {
      const result = AssignmentRepository.insert(assignment);
      if (result && result.assignment_id) {
        testAssignmentIds.push(result.assignment_id);
      }
    } catch (e) {
      // 重複エラーは無視
      if (!e.message.includes('duplicate')) {
        return { name: testName, passed: false, error: e.message };
      }
    }
    times.push(Date.now() - start);
  }

  // テストデータ削除
  for (const asgId of testAssignmentIds) {
    try {
      AssignmentRepository.softDelete(asgId);
    } catch (e) { }
  }

  const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
  const passed = avg <= threshold;

  console.log(`${passed ? '✅' : '❌'} ${testName}: 平均 ${avg}ms (閾値: ${threshold}ms)`);

  return { name: testName, avg, threshold, passed, times };
}

/**
 * 一括処理テスト（バッチ最適化版）
 */
function testBulkOperations() {
  const testName = 'bulkInsert (100件)';
  const threshold = PERF_TEST_CONFIG.THRESHOLDS.bulkInsert;
  const BULK_COUNT = 100;

  // テスト用顧客取得
  const customers = getAllRecords('M_Customers').filter(c => !c.is_deleted);
  if (customers.length === 0) {
    console.log(`⚠️ ${testName}: テスト顧客がありません`);
    return { name: testName, passed: true, skipped: true };
  }

  const customer = customers[0];
  const baseDate = new Date();
  baseDate.setDate(baseDate.getDate() + 30); // 30日後を使用
  const workDate = formatDateForPerf(baseDate);
  const timestamp = Date.now();

  // バッチ挿入用データ準備
  const jobsToInsert = [];
  for (let i = 0; i < BULK_COUNT; i++) {
    jobsToInsert.push({
      customer_id: customer.customer_id,
      site_name: `一括テスト現場_${timestamp}_${i}`,
      site_address: '東京都港区1-1-1',
      work_date: workDate,
      time_slot: ['shuujitsu', 'am', 'pm'][i % 3],
      start_time: '08:00',
      required_count: 1,
      job_type: 'tobi',
      status: 'pending'
    });
  }

  // 一括挿入（バッチ）
  const startInsert = Date.now();
  try {
    insertRecords('T_Jobs', jobsToInsert);
  } catch (e) {
    console.log(`挿入エラー: ${e.message}`);
  }
  const insertTime = Date.now() - startInsert;

  // 一括読み込み
  const startRead = Date.now();
  JobService.getDashboard(workDate);
  const readTime = Date.now() - startRead;

  // 一括削除（バッチ: is_deletedフラグを一括更新）
  const startDelete = Date.now();
  try {
    // テストデータを特定して一括削除
    const allJobs = getAllRecords('T_Jobs');
    const testJobs = allJobs.filter(j =>
      j.site_name && j.site_name.includes(`一括テスト現場_${timestamp}_`)
    );

    if (testJobs.length > 0) {
      // シートを直接操作して一括削除
      const ss = SpreadsheetApp.openById(getSpreadsheetId());
      const sheet = ss.getSheetByName('T_Jobs');
      const data = sheet.getDataRange().getValues();
      const headers = data[0];
      const isDeletedIdx = headers.indexOf('is_deleted');
      const siteNameIdx = headers.indexOf('site_name');

      // 対象行を特定して一括更新
      const updates = [];
      for (let i = 1; i < data.length; i++) {
        const siteName = data[i][siteNameIdx];
        if (siteName && siteName.includes(`一括テスト現場_${timestamp}_`)) {
          updates.push({ row: i + 1, col: isDeletedIdx + 1 });
        }
      }

      // 一括で is_deleted を true に設定
      for (const u of updates) {
        sheet.getRange(u.row, u.col).setValue(true);
      }
    }
  } catch (e) {
    console.log(`削除エラー: ${e.message}`);
  }
  const deleteTime = Date.now() - startDelete;

  const totalTime = insertTime + readTime + deleteTime;
  const passed = totalTime <= threshold;

  console.log(`${passed ? '✅' : '❌'} ${testName}: 合計 ${totalTime}ms (挿入: ${insertTime}ms, 読込: ${readTime}ms, 削除: ${deleteTime}ms)`);

  return {
    name: testName,
    insertTime,
    readTime,
    deleteTime,
    total: totalTime,
    threshold,
    passed,
    count: BULK_COUNT
  };
}

/**
 * 楽観ロック動作確認テスト
 */
function testOptimisticLocking() {
  const testName = 'optimisticLocking';

  // UUID形式の顧客を探す（テストデータはcus_bulk_形式なのでバリデーション通過しない）
  const customers = getAllRecords('M_Customers').filter(c => !c.is_deleted);
  if (customers.length === 0) {
    console.log(`⚠️ ${testName}: テスト顧客がありません（スキップ）`);
    return { name: testName, passed: true, skipped: true };
  }

  // UUID形式の顧客を優先的に使用（8-4-4-4-12形式）
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let customer = customers.find(c => c.customer_id && uuidRegex.test(c.customer_id));

  // UUID顧客がない場合はJobRepository.insert()で直接挿入（バリデーションスキップ）
  const useDirectInsert = !customer;
  if (!customer) {
    customer = customers[0];
  }
  const customerId = customer.customer_id;

  if (!customerId) {
    console.log(`⚠️ ${testName}: 顧客IDが無効です（スキップ）`);
    return { name: testName, passed: true, skipped: true };
  }

  let testJobId = null;
  let passed = true;
  let errorMessage = null;

  try {
    // 1. テスト案件作成
    const job = {
      customer_id: customerId,
      site_name: '楽観ロックテスト現場_' + Date.now(),
      site_address: '東京都渋谷区1-1-1',
      work_date: formatDateForPerf(new Date()),
      time_slot: 'shuujitsu',
      start_time: '08:00',
      required_count: 1,
      job_type: 'tobi',
      status: 'pending'
    };

    let createdJob;
    if (useDirectInsert) {
      // UUID形式でない顧客の場合、JobRepository.insert()を直接使用（バリデーションスキップ）
      createdJob = JobRepository.insert(job);
      if (!createdJob || !createdJob.job_id) {
        throw new Error('案件作成失敗（直接挿入）');
      }
    } else {
      const createResult = JobService.save(job, null);
      if (!createResult.success) {
        const errorDetail = createResult.details ?
          JSON.stringify(createResult.details) :
          (createResult.error || '不明なエラー');
        throw new Error('案件作成失敗: ' + errorDetail);
      }
      createdJob = createResult.job;
    }
    testJobId = createdJob.job_id;
    const originalUpdatedAt = createdJob.updated_at;

    // 2. 正常更新（正しいupdated_at）
    let update1;
    if (useDirectInsert) {
      // JobRepository.updateを直接使用
      update1 = JobRepository.update({ job_id: testJobId, notes: '更新1' }, originalUpdatedAt);
    } else {
      update1 = JobService.save({ job_id: testJobId, notes: '更新1' }, originalUpdatedAt);
    }
    if (!update1.success) {
      const errorDetail = update1.details ?
        JSON.stringify(update1.details) :
        (update1.error || '不明なエラー');
      throw new Error('正常更新が失敗: ' + errorDetail);
    }

    // 3. 競合更新（古いupdated_at）
    let update2;
    if (useDirectInsert) {
      update2 = JobRepository.update({ job_id: testJobId, notes: '更新2' }, originalUpdatedAt);
    } else {
      update2 = JobService.save({ job_id: testJobId, notes: '更新2' }, originalUpdatedAt);
    }

    if (update2.success) {
      passed = false;
      errorMessage = '競合が検出されるべきだが成功した';
    } else if (update2.error !== 'CONFLICT_ERROR') {
      passed = false;
      errorMessage = `期待: CONFLICT_ERROR, 実際: ${update2.error}`;
    }

  } catch (e) {
    passed = false;
    errorMessage = e.message;
  } finally {
    // テストデータ削除
    if (testJobId) {
      try {
        const job = JobRepository.findById(testJobId);
        if (job) {
          JobRepository.softDelete(testJobId, job.updated_at);
        }
      } catch (e) { }
    }
  }

  console.log(`${passed ? '✅' : '❌'} ${testName}: ${passed ? '楽観ロック正常動作' : errorMessage}`);

  return { name: testName, passed, error: errorMessage };
}

/**
 * キャッシュ効果測定テスト
 */
function testCacheEffectiveness() {
  const testName = 'cacheEffectiveness';

  const times = {
    firstCall: [],
    secondCall: []
  };

  // 同じデータを連続で取得して、2回目が速いことを確認
  for (let i = 0; i < 3; i++) {
    // 1回目
    const start1 = Date.now();
    getAllRecords('M_Customers');
    times.firstCall.push(Date.now() - start1);

    // 2回目（キャッシュが効いていれば速い）
    const start2 = Date.now();
    getAllRecords('M_Customers');
    times.secondCall.push(Date.now() - start2);
  }

  const avgFirst = Math.round(times.firstCall.reduce((a, b) => a + b, 0) / times.firstCall.length);
  const avgSecond = Math.round(times.secondCall.reduce((a, b) => a + b, 0) / times.secondCall.length);

  // 2回目が1回目の80%以下なら効果あり
  const cacheEffective = avgSecond <= avgFirst * 0.8 || avgSecond < 100;
  const improvement = avgFirst > 0 ? Math.round((1 - avgSecond / avgFirst) * 100) : 0;

  console.log(`${cacheEffective ? '✅' : '⚠️'} ${testName}: 1回目 ${avgFirst}ms → 2回目 ${avgSecond}ms (${improvement}%改善)`);

  return {
    name: testName,
    passed: true, // キャッシュが効かなくても失敗ではない
    cacheEffective,
    avgFirst,
    avgSecond,
    improvement: improvement + '%'
  };
}

// ============================================================
// ユーティリティ
// ============================================================

/**
 * データ件数確認
 */
function checkDataCounts() {
  return {
    customers: getAllRecords('M_Customers').filter(c => !c.is_deleted).length,
    staff: getAllRecords('M_Staff').filter(s => !s.is_deleted).length,
    jobs: getAllRecords('T_Jobs').filter(j => !j.is_deleted).length,
    assignments: getAllRecords('T_JobAssignments').filter(a => !a.is_deleted).length
  };
}

/**
 * 日付フォーマット
 */
function formatDateForPerf(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * レポート出力
 */
function printPerformanceReport(results, totalElapsed, counts) {
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║           パフォーマンステスト結果                 ║');
  console.log('╠════════════════════════════════════════════════════╣');

  // 個別結果
  for (const test of results.tests) {
    const status = test.skipped ? '⏭️' : (test.passed ? '✅' : '❌');
    const time = test.avg ? `${test.avg}ms` : (test.total ? `${test.total}ms` : '-');
    const line = `${status} ${test.name}: ${time}`;
    console.log(`║ ${line.padEnd(50)} ║`);
  }

  console.log('╠════════════════════════════════════════════════════╣');

  // サマリー
  const summaryLine = `合計: ${results.passed} passed, ${results.failed} failed`;
  console.log(`║ ${summaryLine.padEnd(50)} ║`);

  const timeLine = `実行時間: ${(totalElapsed / 1000).toFixed(2)}s`;
  console.log(`║ ${timeLine.padEnd(50)} ║`);

  const dataLine = `データ: 顧客${counts.customers} スタッフ${counts.staff} 案件${counts.jobs} 配置${counts.assignments}`;
  console.log(`║ ${dataLine.padEnd(50)} ║`);

  console.log('╚════════════════════════════════════════════════════╝');

  // 警告
  if (results.warnings.length > 0) {
    console.log('\n⚠️ 警告:');
    for (const w of results.warnings) {
      console.log(`  - ${w}`);
    }
  }

  // GAS制限確認
  if (totalElapsed > PERF_TEST_CONFIG.WARNING_THRESHOLD_MS) {
    console.log('\n⚠️ 実行時間が5分を超えています。本番環境では注意が必要です。');
  } else {
    const remaining = (PERF_TEST_CONFIG.MAX_EXECUTION_TIME_MS - totalElapsed) / 1000;
    console.log(`\n✅ GAS 6分制限: 残り約 ${remaining.toFixed(0)} 秒`);
  }
}

// ============================================================
// 追加テスト関数
// ============================================================

/**
 * 長時間実行テスト（GAS制限確認用）
 * 警告: 実行に時間がかかります
 */
function runLongRunningTest() {
  console.log('=== 長時間実行テスト開始 ===');
  console.log('このテストはGAS 6分制限の確認用です。\n');

  const startTime = Date.now();
  let iterations = 0;

  // 5分間繰り返し実行
  const TARGET_DURATION = 5 * 60 * 1000; // 5分

  while (Date.now() - startTime < TARGET_DURATION) {
    // ダッシュボード取得
    const today = formatDateForPerf(new Date());
    JobService.getDashboard(today);

    iterations++;

    // 1分ごとに進捗表示
    const elapsed = Date.now() - startTime;
    if (iterations % 100 === 0) {
      console.log(`経過: ${(elapsed / 1000 / 60).toFixed(1)}分, 反復: ${iterations}回`);
    }

    // 6分制限の手前で停止
    if (elapsed > 5.5 * 60 * 1000) {
      console.log('5.5分経過、安全のため停止');
      break;
    }
  }

  const totalElapsed = Date.now() - startTime;
  console.log(`\n=== 長時間実行テスト完了 ===`);
  console.log(`実行時間: ${(totalElapsed / 1000 / 60).toFixed(2)}分`);
  console.log(`反復回数: ${iterations}回`);
  console.log(`平均: ${Math.round(totalElapsed / iterations)}ms/回`);

  return {
    elapsed: totalElapsed,
    iterations: iterations,
    avgPerIteration: Math.round(totalElapsed / iterations)
  };
}

/**
 * 特定処理のベンチマーク
 */
function benchmarkOperation(operationName, fn, iterations) {
  iterations = iterations || 10;
  const times = [];

  console.log(`=== ${operationName} ベンチマーク (${iterations}回) ===`);

  for (let i = 0; i < iterations; i++) {
    const start = Date.now();
    fn();
    times.push(Date.now() - start);
  }

  const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
  const min = Math.min(...times);
  const max = Math.max(...times);

  console.log(`平均: ${avg}ms, 最小: ${min}ms, 最大: ${max}ms`);

  return { avg, min, max, times };
}
