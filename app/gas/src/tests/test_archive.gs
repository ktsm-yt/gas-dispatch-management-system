/**
 * Archive Test Functions
 *
 * P2-5: データアーカイブ機能のテスト
 *
 * テスト実行方法:
 * 1. GASエディタで対象関数を選択して実行
 * 2. ログを確認（View > Logs）
 *
 * テスト順序:
 * 1. createArchiveTestData() - テストデータ作成
 * 2. testArchiveExecution() - アーカイブ実行テスト
 * 3. testArchiveDataRetrieval() - 過去データ参照テスト
 * 4. cleanupArchiveTestData() - テストデータクリーンアップ
 */

// テスト用の年度（実際の本番データに影響しないよう過去年度を使用）
const TEST_FISCAL_YEAR = 2023;

/**
 * アーカイブテスト用データを作成
 * GASエディタから実行: createArchiveTestData()
 */
function createArchiveTestData() {
  Logger.log('=== アーカイブテストデータ作成開始 ===');

  const fiscalYear = TEST_FISCAL_YEAR;
  const startDate = `${fiscalYear}-04-01`;
  const endDate = `${fiscalYear + 1}-03-31`;

  Logger.log(`対象年度: ${fiscalYear}年度 (${startDate} - ${endDate})`);

  // テスト用顧客を取得（既存の最初の顧客を使用）
  let testCustomer;
  try {
    const customers = getAllRecords('M_Customers').filter(c => !c.is_deleted);
    if (customers.length === 0) {
      Logger.log('エラー: 顧客マスタにデータがありません');
      return;
    }
    testCustomer = customers[0];
    Logger.log(`テスト用顧客: ${testCustomer.customer_name} (${testCustomer.customer_id})`);
  } catch (e) {
    Logger.log(`顧客取得エラー: ${e.message}`);
    return;
  }

  // テスト用スタッフを取得（既存の最初のスタッフを使用）
  let testStaff;
  try {
    const staffList = getAllRecords('M_Staff').filter(s => !s.is_deleted);
    if (staffList.length === 0) {
      Logger.log('警告: スタッフマスタにデータがありません');
    } else {
      testStaff = staffList[0];
      Logger.log(`テスト用スタッフ: ${testStaff.staff_name} (${testStaff.staff_id})`);
    }
  } catch (e) {
    Logger.log(`スタッフ取得エラー: ${e.message}`);
  }

  // 1. テスト用案件を作成（各月1件ずつ、計12件）
  Logger.log('\n--- テスト用案件作成 ---');
  const testJobs = [];

  for (let m = 4; m <= 12; m++) {
    const workDate = `${fiscalYear}-${String(m).padStart(2, '0')}-15`;
    const job = createTestJob(testCustomer.customer_id, workDate, m);
    testJobs.push(job);
  }
  for (let m = 1; m <= 3; m++) {
    const workDate = `${fiscalYear + 1}-${String(m).padStart(2, '0')}-15`;
    const job = createTestJob(testCustomer.customer_id, workDate, m);
    testJobs.push(job);
  }

  Logger.log(`✓ ${testJobs.length}件の案件を作成`);

  // 2. テスト用請求書を作成（各月1件ずつ）
  Logger.log('\n--- テスト用請求書作成 ---');
  const testInvoices = [];

  for (let m = 4; m <= 12; m++) {
    const invoice = createTestInvoice(testCustomer.customer_id, fiscalYear, m);
    testInvoices.push(invoice);
  }
  for (let m = 1; m <= 3; m++) {
    const invoice = createTestInvoice(testCustomer.customer_id, fiscalYear + 1, m);
    testInvoices.push(invoice);
  }

  Logger.log(`✓ ${testInvoices.length}件の請求書を作成`);

  // 3. 結果サマリー
  Logger.log('\n=== テストデータ作成完了 ===');
  Logger.log(`対象年度: ${fiscalYear}年度`);
  Logger.log(`案件: ${testJobs.length}件`);
  Logger.log(`請求書: ${testInvoices.length}件`);
  Logger.log('\n次のステップ: testArchiveExecution() を実行してアーカイブをテスト');
}

/**
 * テスト用案件を1件作成
 */
function createTestJob(customerId, workDate, month) {
  const job = JobRepository.insert({
    customer_id: customerId,
    site_name: `[テスト] アーカイブテスト現場 ${month}月`,
    site_address: 'テスト住所',
    work_date: workDate,
    time_slot: 'am',
    required_count: 2,
    pay_unit: 'day',
    status: 'completed',
    notes: `P2-5アーカイブテスト用データ (${workDate})`
  });

  Logger.log(`  作成: ${job.job_id} - ${workDate}`);
  return job;
}

/**
 * テスト用請求書を1件作成
 */
function createTestInvoice(customerId, year, month) {
  const invoice = InvoiceRepository.insert({
    customer_id: customerId,
    billing_year: year,
    billing_month: month,
    issue_date: `${year}-${String(month).padStart(2, '0')}-25`,
    subtotal: 100000,
    tax_amount: 10000,
    total_amount: 110000,
    status: 'paid',
    notes: `P2-5アーカイブテスト用データ`
  });

  Logger.log(`  作成: ${invoice.invoice_id} - ${year}/${month}`);
  return invoice;
}

/**
 * アーカイブ実行テスト
 * GASエディタから実行: testArchiveExecution()
 */
function testArchiveExecution() {
  Logger.log('=== アーカイブ実行テスト開始 ===');

  const fiscalYear = TEST_FISCAL_YEAR;

  // 1. アーカイブ前のデータ件数を確認
  Logger.log('\n--- アーカイブ前のデータ確認 ---');
  const beforeJobs = JobRepository.search({
    work_date_from: `${fiscalYear}-04-01`,
    work_date_to: `${fiscalYear + 1}-03-31`
  });
  const beforeInvoices = InvoiceRepository.search({
    billing_year: fiscalYear
  });

  Logger.log(`案件: ${beforeJobs.length}件`);
  Logger.log(`請求書: ${beforeInvoices.length}件`);

  if (beforeJobs.length === 0 && beforeInvoices.length === 0) {
    Logger.log('警告: テストデータがありません。先に createArchiveTestData() を実行してください。');
    return;
  }

  // 2. アーカイブ実行
  Logger.log('\n--- アーカイブ実行 ---');
  const result = ArchiveService.executeYearlyArchive(fiscalYear);

  if (result.success) {
    Logger.log('✓ アーカイブ成功');
    Logger.log(JSON.stringify(result.results, null, 2));
  } else if (result.error === 'TIMEOUT_WILL_CONTINUE') {
    Logger.log(`アーカイブ継続中: ${result.step} で一時停止`);
    Logger.log('再度 testArchiveExecution() を実行すると継続します');
    return;
  } else {
    Logger.log(`✗ アーカイブ失敗: ${result.error}`);
    return;
  }

  // 3. アーカイブ後のデータ件数を確認
  Logger.log('\n--- アーカイブ後のデータ確認（現行DB） ---');
  const afterJobs = JobRepository.search({
    work_date_from: `${fiscalYear}-04-01`,
    work_date_to: `${fiscalYear + 1}-03-31`
  });
  const afterInvoices = InvoiceRepository.search({
    billing_year: fiscalYear
  });

  Logger.log(`案件: ${afterJobs.length}件 (移動: ${beforeJobs.length - afterJobs.length}件)`);
  Logger.log(`請求書: ${afterInvoices.length}件 (移動: ${beforeInvoices.length - afterInvoices.length}件)`);

  // 4. アーカイブDBの確認
  Logger.log('\n--- アーカイブDB確認 ---');
  const archiveDbId = ArchiveService.getArchiveDbId(fiscalYear);
  if (archiveDbId) {
    Logger.log(`アーカイブDB ID: ${archiveDbId}`);
    const archiveDb = SpreadsheetApp.openById(archiveDbId);
    Logger.log(`アーカイブDB名: ${archiveDb.getName()}`);

    const sheets = archiveDb.getSheets();
    for (const sheet of sheets) {
      const rowCount = sheet.getLastRow() - 1; // ヘッダー除く
      Logger.log(`  ${sheet.getName()}: ${rowCount}件`);
    }
  } else {
    Logger.log('警告: アーカイブDB IDが見つかりません');
  }

  Logger.log('\n=== アーカイブ実行テスト完了 ===');
  Logger.log('\n次のステップ: testArchiveDataRetrieval() を実行して過去データ参照をテスト');
}

/**
 * 過去データ参照テスト
 * GASエディタから実行: testArchiveDataRetrieval()
 */
function testArchiveDataRetrieval() {
  Logger.log('=== 過去データ参照テスト開始 ===');

  const fiscalYear = TEST_FISCAL_YEAR;

  // 1. includeArchive: false の場合
  Logger.log('\n--- includeArchive: false ---');
  const jobsWithoutArchive = JobRepository.search({
    work_date_from: `${fiscalYear}-04-01`,
    work_date_to: `${fiscalYear + 1}-03-31`,
    includeArchive: false
  });
  Logger.log(`案件: ${jobsWithoutArchive.length}件`);

  // 2. includeArchive: true の場合
  Logger.log('\n--- includeArchive: true ---');
  const jobsWithArchive = JobRepository.search({
    work_date_from: `${fiscalYear}-04-01`,
    work_date_to: `${fiscalYear + 1}-03-31`,
    includeArchive: true
  });
  Logger.log(`案件: ${jobsWithArchive.length}件`);

  // アーカイブデータのフラグ確認
  const archivedJobs = jobsWithArchive.filter(j => j._archived);
  Logger.log(`  うちアーカイブデータ: ${archivedJobs.length}件`);

  if (archivedJobs.length > 0) {
    Logger.log('  サンプル（最初の1件）:');
    Logger.log(`    job_id: ${archivedJobs[0].job_id}`);
    Logger.log(`    work_date: ${archivedJobs[0].work_date}`);
    Logger.log(`    _archived: ${archivedJobs[0]._archived}`);
    Logger.log(`    _archiveFiscalYear: ${archivedJobs[0]._archiveFiscalYear}`);
  }

  // 3. 請求書も同様にテスト
  Logger.log('\n--- 請求書の過去データ参照 ---');
  const invoicesWithArchive = InvoiceRepository.search({
    billing_year: fiscalYear,
    includeArchive: true
  });
  Logger.log(`請求書: ${invoicesWithArchive.length}件`);

  const archivedInvoices = invoicesWithArchive.filter(i => i._archived);
  Logger.log(`  うちアーカイブデータ: ${archivedInvoices.length}件`);

  // 4. アーカイブデータの編集拒否テスト
  Logger.log('\n--- アーカイブデータ編集拒否テスト ---');
  if (archivedJobs.length > 0) {
    const testJob = archivedJobs[0];
    testJob.site_name = '編集テスト';
    const updateResult = JobRepository.update(testJob, testJob.updated_at);

    if (updateResult.error === 'ARCHIVED_DATA') {
      Logger.log('✓ アーカイブデータの編集が正しく拒否されました');
      Logger.log(`  エラーメッセージ: ${updateResult.message}`);
    } else {
      Logger.log('✗ アーカイブデータの編集拒否が機能していません');
    }
  } else {
    Logger.log('スキップ: アーカイブデータがありません');
  }

  Logger.log('\n=== 過去データ参照テスト完了 ===');
}

/**
 * テストデータをクリーンアップ
 * GASエディタから実行: cleanupArchiveTestData()
 */
function cleanupArchiveTestData() {
  Logger.log('=== テストデータクリーンアップ開始 ===');

  const fiscalYear = TEST_FISCAL_YEAR;

  // 1. 現行DBのテストデータを削除
  Logger.log('\n--- 現行DBのテストデータ削除 ---');
  const jobs = JobRepository.search({
    work_date_from: `${fiscalYear}-04-01`,
    work_date_to: `${fiscalYear + 1}-03-31`
  });

  const testJobs = jobs.filter(j => j.notes && j.notes.includes('P2-5アーカイブテスト'));
  Logger.log(`削除対象案件: ${testJobs.length}件`);

  for (const job of testJobs) {
    JobRepository.softDelete(job.job_id, job.updated_at);
  }

  // 2. アーカイブDBを削除（必要に応じて）
  Logger.log('\n--- アーカイブDB確認 ---');
  const archiveDbId = ArchiveService.getArchiveDbId(fiscalYear);
  if (archiveDbId) {
    Logger.log(`アーカイブDB ID: ${archiveDbId}`);
    Logger.log('※ アーカイブDBを削除する場合は手動で行ってください');
    Logger.log('  DriveApp.getFileById(archiveDbId).setTrashed(true)');
  }

  // 3. 進捗をクリア
  ArchiveService.clearProgress(fiscalYear);
  Logger.log('✓ アーカイブ進捗をクリア');

  Logger.log('\n=== クリーンアップ完了 ===');
}

/**
 * 未処理項目チェックテスト
 * GASエディタから実行: testCheckPendingItems()
 */
function testCheckPendingItems() {
  Logger.log('=== 未処理項目チェックテスト ===');

  const fiscalYear = ArchiveService.getCurrentFiscalYear() - 1;
  Logger.log(`対象年度: ${fiscalYear}年度`);

  const pending = ArchiveService.checkPendingItems(fiscalYear);

  Logger.log(`\n未処理項目あり: ${pending.hasItems}`);
  Logger.log(`未発行請求書: ${pending.unpaidInvoices.length}件`);
  Logger.log(`未処理給与: ${pending.unpaidPayroll.length}件`);

  if (pending.unpaidInvoices.length > 0) {
    Logger.log('\n未発行請求書（最大5件）:');
    pending.unpaidInvoices.slice(0, 5).forEach(inv => {
      Logger.log(`  - ${inv.customerName}（${inv.month}月分）`);
    });
  }

  if (pending.unpaidPayroll.length > 0) {
    Logger.log('\n未処理給与（最大5件）:');
    pending.unpaidPayroll.slice(0, 5).forEach(pay => {
      Logger.log(`  - ${pay.staffName}（${pay.period}）`);
    });
  }
}

/**
 * 進捗管理テスト
 * GASエディタから実行: testArchiveProgress()
 */
function testArchiveProgress() {
  Logger.log('=== 進捗管理テスト ===');

  const fiscalYear = TEST_FISCAL_YEAR;

  // 1. 初期状態確認
  Logger.log('\n--- 初期状態 ---');
  let progress = ArchiveService.getProgress(fiscalYear);
  Logger.log(`currentStep: ${progress.currentStep}`);
  Logger.log(`results: ${JSON.stringify(progress.results)}`);

  // 2. 進捗保存テスト
  Logger.log('\n--- 進捗保存 ---');
  ArchiveService.saveProgress(fiscalYear, 3, { test: 'data' });
  progress = ArchiveService.getProgress(fiscalYear);
  Logger.log(`currentStep: ${progress.currentStep}`);
  Logger.log(`results: ${JSON.stringify(progress.results)}`);
  Logger.log(`lastUpdate: ${progress.lastUpdate}`);

  // 3. 進捗クリアテスト
  Logger.log('\n--- 進捗クリア ---');
  ArchiveService.clearProgress(fiscalYear);
  progress = ArchiveService.getProgress(fiscalYear);
  Logger.log(`currentStep: ${progress.currentStep}`);

  Logger.log('\n=== 進捗管理テスト完了 ===');
}

// ============================================================
// ヘルパー関数（GASエディタから引数なしで実行可能）
// ============================================================

/**
 * アーカイブ進捗をリセット
 * GASエディタから実行: quickResetArchiveProgress()
 */
function quickResetArchiveProgress() {
  Logger.log('=== アーカイブ進捗リセット ===');
  Logger.log(`対象年度: ${TEST_FISCAL_YEAR}年度`);

  ArchiveService.clearProgress(TEST_FISCAL_YEAR);

  Logger.log('✓ 進捗をリセットしました');
  Logger.log('\n次のステップ: testArchiveExecution() を実行');
}

/**
 * アーカイブ進捗を確認
 * GASエディタから実行: checkArchiveProgress()
 */
function checkArchiveProgress() {
  Logger.log('=== アーカイブ進捗確認 ===');
  Logger.log(`対象年度: ${TEST_FISCAL_YEAR}年度`);

  const progress = ArchiveService.getProgress(TEST_FISCAL_YEAR);

  Logger.log(`\n現在のステップ: ${progress.currentStep}`);
  Logger.log(`最終更新: ${progress.lastUpdate || '(なし)'}`);
  Logger.log(`結果: ${JSON.stringify(progress.results || {}, null, 2)}`);

  // アーカイブDBの状態も確認
  const archiveDbId = ArchiveService.getArchiveDbId(TEST_FISCAL_YEAR);
  if (archiveDbId) {
    Logger.log(`\nアーカイブDB ID: ${archiveDbId}`);
    try {
      const archiveDb = SpreadsheetApp.openById(archiveDbId);
      Logger.log(`アーカイブDB名: ${archiveDb.getName()}`);
    } catch (e) {
      Logger.log(`アーカイブDBアクセスエラー: ${e.message}`);
    }
  } else {
    Logger.log('\nアーカイブDB: (未作成)');
  }
}

/**
 * テストデータの件数を確認（変更なし）
 * GASエディタから実行: checkTestDataCount()
 */
function checkTestDataCount() {
  Logger.log('=== テストデータ件数確認 ===');
  Logger.log(`対象年度: ${TEST_FISCAL_YEAR}年度`);

  const fiscalYear = TEST_FISCAL_YEAR;

  // 現行DBの件数
  const jobs = JobRepository.search({
    work_date_from: `${fiscalYear}-04-01`,
    work_date_to: `${fiscalYear + 1}-03-31`
  });
  const invoices = InvoiceRepository.search({
    billing_year: fiscalYear
  });

  Logger.log(`\n【現行DB】`);
  Logger.log(`  案件: ${jobs.length}件`);
  Logger.log(`  請求書: ${invoices.length}件`);

  // アーカイブDBの件数
  const archiveDbId = ArchiveService.getArchiveDbId(fiscalYear);
  if (archiveDbId) {
    try {
      const archiveDb = SpreadsheetApp.openById(archiveDbId);
      Logger.log(`\n【アーカイブDB】`);
      const sheets = archiveDb.getSheets();
      for (const sheet of sheets) {
        const rowCount = Math.max(0, sheet.getLastRow() - 1);
        Logger.log(`  ${sheet.getName()}: ${rowCount}件`);
      }
    } catch (e) {
      Logger.log(`\nアーカイブDBアクセスエラー: ${e.message}`);
    }
  } else {
    Logger.log(`\n【アーカイブDB】(未作成)`);
  }
}

// ============================================================
// メインテスト関数
// ============================================================

/**
 * 全テストを順次実行
 * GASエディタから実行: runAllArchiveTests()
 */
function runAllArchiveTests() {
  Logger.log('========================================');
  Logger.log('  P2-5 アーカイブ機能 全テスト実行');
  Logger.log('========================================\n');

  // 注意: 実際の本番データに影響を与える可能性があるため、
  // 開発環境でのみ実行してください

  Logger.log('1/5 進捗管理テスト');
  testArchiveProgress();

  Logger.log('\n\n2/5 未処理項目チェックテスト');
  testCheckPendingItems();

  Logger.log('\n\n3/5 テストデータ作成');
  createArchiveTestData();

  Logger.log('\n\n4/5 アーカイブ実行テスト');
  testArchiveExecution();

  Logger.log('\n\n5/5 過去データ参照テスト');
  testArchiveDataRetrieval();

  Logger.log('\n\n========================================');
  Logger.log('  全テスト完了');
  Logger.log('========================================');
  Logger.log('\nクリーンアップするには cleanupArchiveTestData() を実行してください');
}
