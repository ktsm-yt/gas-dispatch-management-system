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
 * 4. testInvoiceYmRangeArchiveSearch() - 年月範囲×アーカイブ検索テスト
 * 5. testArchiveEditing() - アーカイブデータ編集テスト ★NEW
 * 6. cleanupArchiveTestData() - テストデータクリーンアップ
 */

// テスト用の年度（実際の本番データに影響しないよう過去年度を使用）
// 年度は3月〜2月（例: FY2023 = 2023-03-01 〜 2024-02-29）
const TEST_FISCAL_YEAR = 2023;
const TEST_FISCAL_YEARS = [2022, 2023]; // 複数年度テスト用

/**
 * アーカイブフォルダIDを設定（初回のみ実行）
 * GASエディタから実行: setupArchiveFolderId()
 */
function setupArchiveFolderId() {
  const ARCHIVE_FOLDER_ID = '1o5lKHrfzJDdDSeiDWGkmyPlke-YDw5t7';

  const props = PropertiesService.getScriptProperties();
  props.setProperty('ARCHIVE_FOLDER_ID', ARCHIVE_FOLDER_ID);

  Logger.log('✓ ARCHIVE_FOLDER_ID を設定しました');
  Logger.log(`  フォルダID: ${ARCHIVE_FOLDER_ID}`);

  // 確認
  const saved = props.getProperty('ARCHIVE_FOLDER_ID');
  Logger.log(`  確認: ${saved === ARCHIVE_FOLDER_ID ? 'OK' : 'NG'}`);
}

/**
 * アーカイブテスト用データを作成
 * GASエディタから実行: createArchiveTestData()
 */
function createArchiveTestData() {
  Logger.log('=== アーカイブテストデータ作成開始 ===');

  const fiscalYear = TEST_FISCAL_YEAR;
  const startDate = `${fiscalYear}-03-01`;
  const lastDay = new Date(fiscalYear + 1, 2, 0).getDate();
  const endDate = `${fiscalYear + 1}-02-${String(lastDay).padStart(2, '0')}`;

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

  // テスト用スタッフを取得
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

  // テスト用下請を取得
  let testSubcontractor;
  try {
    const subList = getAllRecords('M_Subcontractors').filter(s => !s.is_deleted);
    if (subList.length > 0) {
      testSubcontractor = subList[0];
      Logger.log(`テスト用下請: ${testSubcontractor.subcontractor_name} (${testSubcontractor.subcontractor_id})`);
    }
  } catch (e) {
    Logger.log(`下請取得エラー: ${e.message}`);
  }

  // 1. テスト用案件を作成（3月〜2月、各月1件ずつ、計12件）
  Logger.log('\n--- テスト用案件作成 ---');
  const testJobs = [];

  for (let m = 3; m <= 12; m++) {
    const workDate = `${fiscalYear}-${String(m).padStart(2, '0')}-15`;
    const job = createTestJob(testCustomer.customer_id, workDate, m);
    testJobs.push(job);
  }
  for (let m = 1; m <= 2; m++) {
    const workDate = `${fiscalYear + 1}-${String(m).padStart(2, '0')}-15`;
    const job = createTestJob(testCustomer.customer_id, workDate, m);
    testJobs.push(job);
  }

  Logger.log(`✓ ${testJobs.length}件の案件を作成`);

  // 2. テスト用請求書を作成（各月1件ずつ + 明細付き）
  Logger.log('\n--- テスト用請求書作成 ---');
  const testInvoices = [];

  for (let m = 3; m <= 12; m++) {
    const invoice = createTestInvoice(testCustomer.customer_id, fiscalYear, m);
    testInvoices.push(invoice);
    // 対応する案件の明細を作成
    const matchJob = testJobs.find(j => j.work_date === `${fiscalYear}-${String(m).padStart(2, '0')}-15`);
    if (matchJob) {
      createTestInvoiceLine(invoice.invoice_id, matchJob.job_id, `${fiscalYear}-${String(m).padStart(2, '0')}-15`, m);
    }
  }
  for (let m = 1; m <= 2; m++) {
    const invoice = createTestInvoice(testCustomer.customer_id, fiscalYear + 1, m);
    testInvoices.push(invoice);
    const matchJob = testJobs.find(j => j.work_date === `${fiscalYear + 1}-${String(m).padStart(2, '0')}-15`);
    if (matchJob) {
      createTestInvoiceLine(invoice.invoice_id, matchJob.job_id, `${fiscalYear + 1}-${String(m).padStart(2, '0')}-15`, m);
    }
  }

  Logger.log(`✓ ${testInvoices.length}件の請求書を作成（明細付き）`);

  // 3. テスト用支払いを作成（各月1件ずつ）
  Logger.log('\n--- テスト用支払い作成 ---');
  const testPayouts = [];

  if (testStaff || testSubcontractor) {
    for (let m = 3; m <= 12; m++) {
      const periodStart = `${fiscalYear}-${String(m).padStart(2, '0')}-01`;
      const lastDayOfMonth = new Date(fiscalYear, m, 0).getDate();
      const periodEnd = `${fiscalYear}-${String(m).padStart(2, '0')}-${String(lastDayOfMonth).padStart(2, '0')}`;
      const payout = createTestPayout(testStaff, testSubcontractor, periodStart, periodEnd, m);
      testPayouts.push(payout);
    }
    for (let m = 1; m <= 2; m++) {
      const periodStart = `${fiscalYear + 1}-${String(m).padStart(2, '0')}-01`;
      const lastDayOfMonth = new Date(fiscalYear + 1, m, 0).getDate();
      const periodEnd = `${fiscalYear + 1}-${String(m).padStart(2, '0')}-${String(lastDayOfMonth).padStart(2, '0')}`;
      const payout = createTestPayout(testStaff, testSubcontractor, periodStart, periodEnd, m);
      testPayouts.push(payout);
    }
    Logger.log(`✓ ${testPayouts.length}件の支払いを作成`);
  } else {
    Logger.log('スキップ: スタッフ・下請データがありません');
  }

  // 4. 結果サマリー
  Logger.log('\n=== テストデータ作成完了 ===');
  Logger.log(`対象年度: ${fiscalYear}年度 (${startDate} - ${endDate})`);
  Logger.log(`案件: ${testJobs.length}件`);
  Logger.log(`請求書: ${testInvoices.length}件（明細付き）`);
  Logger.log(`支払い: ${testPayouts.length}件`);
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
    status: 'assigned',
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
    adjustment_total: 0,
    status: 'paid',
    notes: `P2-5アーカイブテスト用データ`
  });

  Logger.log(`  作成: ${invoice.invoice_id} - ${year}/${month}`);
  return invoice;
}

/**
 * テスト用請求明細を1件作成
 */
function createTestInvoiceLine(invoiceId, jobId, workDate, month) {
  const line = InvoiceLineRepository.insert({
    invoice_id: invoiceId,
    job_id: jobId,
    work_date: workDate,
    item_name: `[テスト] ${month}月分作業`,
    quantity: 1,
    unit_price: 100000,
    amount: 100000,
    notes: 'P2-5アーカイブテスト用データ'
  });

  Logger.log(`  明細作成: ${line.line_id} - invoice:${invoiceId}`);
  return line;
}

/**
 * テスト用支払いを1件作成
 */
function createTestPayout(staff, subcontractor, periodStart, periodEnd, month) {
  const data = {
    period_start: periodStart,
    period_end: periodEnd,
    total_amount: 80000,
    status: 'confirmed',
    notes: `P2-5アーカイブテスト用データ (${month}月)`
  };

  if (staff) {
    data.staff_id = staff.staff_id;
    data.payee_type = 'staff';
  } else if (subcontractor) {
    data.subcontractor_id = subcontractor.subcontractor_id;
    data.payee_type = 'subcontractor';
  }

  const payout = PayoutRepository.insert(data);
  Logger.log(`  作成: ${payout.payout_id} - ${periodStart}`);
  return payout;
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
    work_date_from: `${fiscalYear}-03-01`,
    work_date_to: `${fiscalYear + 1}-02-28`
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
    work_date_from: `${fiscalYear}-03-01`,
    work_date_to: `${fiscalYear + 1}-02-28`
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
  let passed = 0;
  let failed = 0;

  // 1. アーカイブDB存在確認
  Logger.log('\n--- アーカイブDB存在確認 ---');
  const archiveDbId = ArchiveService.getArchiveDbId(fiscalYear);
  if (!archiveDbId) {
    Logger.log('✗ アーカイブDBが存在しません。先に testArchiveExecution() を実行してください。');
    return;
  }
  Logger.log(`✓ アーカイブDB ID: ${archiveDbId}`);
  passed++;

  // 2. findById でアーカイブデータ取得（フォールバック）
  Logger.log('\n--- findById フォールバックテスト ---');

  // アーカイブDBから直接IDを取得
  const archiveDb = SpreadsheetApp.openById(archiveDbId);
  const jobSheet = archiveDb.getSheetByName('Jobs');
  if (jobSheet && jobSheet.getLastRow() > 1) {
    const headers = jobSheet.getRange(1, 1, 1, jobSheet.getLastColumn()).getValues()[0];
    const jobIdCol = headers.indexOf('job_id');
    const firstJobId = jobSheet.getRange(2, jobIdCol + 1).getValue();

    Logger.log(`  アーカイブ案件ID: ${firstJobId}`);
    const job = JobRepository.findById(firstJobId);
    if (job && job._archived === true) {
      Logger.log(`  ✓ findById フォールバック成功: _archived=${job._archived}, _archiveFiscalYear=${job._archiveFiscalYear}`);
      passed++;
    } else {
      Logger.log(`  ✗ findById フォールバック失敗: ${JSON.stringify(job)}`);
      failed++;
    }
  } else {
    Logger.log('  スキップ: アーカイブ案件シートにデータなし');
  }

  // 請求書のfindById
  const invSheet = archiveDb.getSheetByName('Invoices');
  if (invSheet && invSheet.getLastRow() > 1) {
    const headers = invSheet.getRange(1, 1, 1, invSheet.getLastColumn()).getValues()[0];
    const invIdCol = headers.indexOf('invoice_id');
    const firstInvId = invSheet.getRange(2, invIdCol + 1).getValue();

    Logger.log(`  アーカイブ請求書ID: ${firstInvId}`);
    const inv = InvoiceRepository.findById(firstInvId);
    if (inv && inv._archived === true) {
      Logger.log(`  ✓ 請求書findById フォールバック成功: _archived=${inv._archived}`);
      passed++;
    } else {
      Logger.log(`  ✗ 請求書findById フォールバック失敗`);
      failed++;
    }

    // 3. 請求明細のフォールバック
    Logger.log('\n--- 請求明細フォールバックテスト ---');
    const lines = InvoiceLineRepository.findByInvoiceId(firstInvId);
    if (lines && lines.length > 0 && lines[0]._archived === true) {
      Logger.log(`  ✓ 明細フォールバック成功: ${lines.length}件, _archived=${lines[0]._archived}`);
      passed++;
    } else {
      Logger.log(`  ✗ 明細フォールバック失敗: ${lines ? lines.length : 0}件`);
      failed++;
    }
  }

  // 支払いのfindById
  const paySheet = archiveDb.getSheetByName('Payouts');
  if (paySheet && paySheet.getLastRow() > 1) {
    const headers = paySheet.getRange(1, 1, 1, paySheet.getLastColumn()).getValues()[0];
    const payIdCol = headers.indexOf('payout_id');
    const firstPayId = paySheet.getRange(2, payIdCol + 1).getValue();

    Logger.log(`  アーカイブ支払いID: ${firstPayId}`);
    const pay = PayoutRepository.findById(firstPayId);
    if (pay && pay._archived === true) {
      Logger.log(`  ✓ 支払いfindById フォールバック成功: _archived=${pay._archived}`);
      passed++;
    } else {
      Logger.log(`  ✗ 支払いfindById フォールバック失敗`);
      failed++;
    }
  }

  Logger.log(`\n=== 過去データ参照テスト完了: ${passed} passed, ${failed} failed ===`);
  Logger.log('\n次のステップ: testInvoiceYmRangeArchiveSearch() を実行して年月範囲検索をテスト');
}

/**
 * 年月範囲検索で includeArchive が効くことを確認
 * GASエディタから実行: testInvoiceYmRangeArchiveSearch()
 */
function testInvoiceYmRangeArchiveSearch() {
  Logger.log('=== 年月範囲×アーカイブ検索テスト開始 ===');

  const fiscalYear = TEST_FISCAL_YEAR;
  const archiveDbId = ArchiveService.getArchiveDbId(fiscalYear);
  if (!archiveDbId) {
    Logger.log('✗ アーカイブDBが存在しません。先に testArchiveExecution() を実行してください。');
    return;
  }

  const archiveDb = SpreadsheetApp.openById(archiveDbId);
  const invSheet = archiveDb.getSheetByName('Invoices');
  if (!invSheet || invSheet.getLastRow() <= 1) {
    Logger.log('✗ アーカイブDBの Invoices にテストデータがありません。');
    return;
  }

  const headers = invSheet.getRange(1, 1, 1, invSheet.getLastColumn()).getValues()[0];
  const invIdCol = headers.indexOf('invoice_id');
  const yearCol = headers.indexOf('billing_year');
  const monthCol = headers.indexOf('billing_month');
  if (invIdCol === -1 || yearCol === -1 || monthCol === -1) {
    Logger.log('✗ Invoices シートのヘッダーが不正です。');
    return;
  }

  const firstRow = invSheet.getRange(2, 1, 1, invSheet.getLastColumn()).getValues()[0];
  const archivedInvoiceId = String(firstRow[invIdCol] || '');
  const billingYear = Number(firstRow[yearCol]);
  const billingMonth = Number(firstRow[monthCol]);
  const targetYm = `${billingYear}-${String(billingMonth).padStart(2, '0')}`;

  Logger.log(`対象YM: ${targetYm}, 対象請求ID: ${archivedInvoiceId}`);

  const withoutArchive = InvoiceRepository.search({
    billing_ym_from: targetYm,
    billing_ym_to: targetYm
  });
  const hitWithoutArchive = withoutArchive.some(inv => String(inv.invoice_id) === archivedInvoiceId);

  const withArchive = InvoiceRepository.search({
    billing_ym_from: targetYm,
    billing_ym_to: targetYm,
    includeArchive: true
  });
  const archivedRecord = withArchive.find(inv => String(inv.invoice_id) === archivedInvoiceId);

  if (hitWithoutArchive) {
    Logger.log('✗ includeArchive=false でもアーカイブ請求IDがヒットしました');
  } else {
    Logger.log('✓ includeArchive=false ではアーカイブ請求IDはヒットしない');
  }

  if (archivedRecord && archivedRecord._archived === true) {
    Logger.log('✓ includeArchive=true でアーカイブ請求IDがヒット（_archived=true）');
  } else {
    Logger.log('✗ includeArchive=true でもアーカイブ請求IDを取得できませんでした');
  }

  Logger.log('=== 年月範囲×アーカイブ検索テスト完了 ===');
  Logger.log('\n次のステップ: testArchiveEditing() を実行してアーカイブ編集をテスト');
}

/**
 * ★ アーカイブデータ編集テスト
 * GASエディタから実行: testArchiveEditing()
 */
function testArchiveEditing() {
  Logger.log('=== アーカイブデータ編集テスト開始 ===');

  const fiscalYear = TEST_FISCAL_YEAR;
  let passed = 0;
  let failed = 0;

  const archiveDbId = ArchiveService.getArchiveDbId(fiscalYear);
  if (!archiveDbId) {
    Logger.log('✗ アーカイブDBが存在しません。先に testArchiveExecution() を実行してください。');
    return;
  }

  const archiveDb = SpreadsheetApp.openById(archiveDbId);

  // =============================================
  // テスト1: 案件のアーカイブ編集
  // =============================================
  Logger.log('\n--- テスト1: 案件のアーカイブ編集 ---');
  const jobSheet = archiveDb.getSheetByName('Jobs');
  if (jobSheet && jobSheet.getLastRow() > 1) {
    const headers = jobSheet.getRange(1, 1, 1, jobSheet.getLastColumn()).getValues()[0];
    const jobIdCol = headers.indexOf('job_id');
    const firstJobId = jobSheet.getRange(2, jobIdCol + 1).getValue();

    const job = JobRepository.findById(firstJobId);
    if (job && job._archived) {
      // 1a. site_name 変更
      const originalSiteName = job.site_name;
      const newSiteName = `[編集テスト] ${new Date().toISOString()}`;
      job.site_name = newSiteName;
      const result = JobRepository.update(job, job.updated_at);

      if (result && !result.error) {
        // 再取得して確認
        const updated = JobRepository.findById(firstJobId);
        if (updated.site_name === newSiteName) {
          Logger.log(`  ✓ 案件ヘッダー編集成功: site_name="${newSiteName}"`);
          passed++;

          // 元に戻す
          updated.site_name = originalSiteName;
          JobRepository.update(updated, updated.updated_at);
        } else {
          Logger.log(`  ✗ 案件ヘッダー編集: 更新が反映されていない`);
          failed++;
        }
      } else {
        Logger.log(`  ✗ 案件ヘッダー編集失敗: ${JSON.stringify(result)}`);
        failed++;
      }

      // 1b. notes 変更（全案件に存在するフィールド）
      const job2 = JobRepository.findById(firstJobId);
      const originalNotes = job2.notes;
      job2.notes = '[編集テスト] アーカイブ案件備考変更';
      const result2 = JobRepository.update(job2, job2.updated_at);
      if (result2 && !result2.error) {
        const updated2 = JobRepository.findById(firstJobId);
        if (updated2.notes === '[編集テスト] アーカイブ案件備考変更') {
          Logger.log(`  ✓ notes 編集成功`);
          passed++;
          // 元に戻す
          updated2.notes = originalNotes;
          JobRepository.update(updated2, updated2.updated_at);
        } else {
          Logger.log(`  ✗ notes 編集: 反映されていない (値="${updated2.notes}")`);
          failed++;
        }
      } else {
        Logger.log(`  ✗ notes 編集失敗: ${JSON.stringify(result2)}`);
        failed++;
      }
    } else {
      Logger.log('  スキップ: アーカイブ案件を取得できませんでした');
    }
  }

  // =============================================
  // テスト2: 請求書ヘッダーのアーカイブ編集
  // =============================================
  Logger.log('\n--- テスト2: 請求書ヘッダーのアーカイブ編集 ---');
  const invSheet = archiveDb.getSheetByName('Invoices');
  if (invSheet && invSheet.getLastRow() > 1) {
    const headers = invSheet.getRange(1, 1, 1, invSheet.getLastColumn()).getValues()[0];
    const invIdCol = headers.indexOf('invoice_id');
    const firstInvId = invSheet.getRange(2, invIdCol + 1).getValue();

    const inv = InvoiceRepository.findById(firstInvId);
    if (inv && inv._archived) {
      // 2a. adjustment_total 変更（ホワイトリスト追加分）
      const originalAdj = inv.adjustment_total || 0;
      inv.adjustment_total = 5000;
      const result = InvoiceRepository.update(inv, inv.updated_at);

      if (result && !result.error) {
        const updated = InvoiceRepository.findById(firstInvId);
        if (Number(updated.adjustment_total) === 5000) {
          Logger.log(`  ✓ adjustment_total 編集成功: 0→5000`);
          passed++;
          // 元に戻す
          updated.adjustment_total = originalAdj;
          InvoiceRepository.update(updated, updated.updated_at);
        } else {
          Logger.log(`  ✗ adjustment_total 編集: 反映されていない (値=${updated.adjustment_total})`);
          failed++;
        }
      } else {
        Logger.log(`  ✗ 請求書ヘッダー編集失敗: ${JSON.stringify(result)}`);
        failed++;
      }

      // 2b. notes 変更
      const inv2 = InvoiceRepository.findById(firstInvId);
      const originalNotes = inv2.notes;
      inv2.notes = '[編集テスト] アーカイブ請求書備考変更';
      const result2 = InvoiceRepository.update(inv2, inv2.updated_at);

      if (result2 && !result2.error) {
        const updated2 = InvoiceRepository.findById(firstInvId);
        if (updated2.notes === '[編集テスト] アーカイブ請求書備考変更') {
          Logger.log(`  ✓ notes 編集成功`);
          passed++;
          updated2.notes = originalNotes;
          InvoiceRepository.update(updated2, updated2.updated_at);
        } else {
          Logger.log(`  ✗ notes 編集: 反映されていない`);
          failed++;
        }
      } else {
        Logger.log(`  ✗ notes 編集失敗`);
        failed++;
      }
    }
  }

  // =============================================
  // テスト3: 請求明細の編集ブロック
  // =============================================
  Logger.log('\n--- テスト3: 請求明細の編集ブロック ---');
  if (invSheet && invSheet.getLastRow() > 1) {
    const headers = invSheet.getRange(1, 1, 1, invSheet.getLastColumn()).getValues()[0];
    const invIdCol = headers.indexOf('invoice_id');
    const firstInvId = invSheet.getRange(2, invIdCol + 1).getValue();

    const inv = InvoiceRepository.findById(firstInvId);
    if (inv && inv._archived) {
      // InvoiceService.save() で明細付きのアーカイブ請求書を保存→ブロックされるはず
      const saveResult = InvoiceService.save(
        { invoice_id: firstInvId, _archived: true, _archiveFiscalYear: fiscalYear },
        [{ item_name: '変更テスト', quantity: 1, unit_price: 999, amount: 999 }],
        inv.updated_at
      );

      if (saveResult && saveResult.success === false && saveResult.error && saveResult.error.includes('明細編集')) {
        Logger.log(`  ✓ 明細編集ブロック成功: "${saveResult.error}"`);
        passed++;
      } else {
        Logger.log(`  ✗ 明細編集がブロックされなかった: ${JSON.stringify(saveResult)}`);
        failed++;
      }
    }
  }

  // =============================================
  // テスト4: 支払いのアーカイブ編集
  // =============================================
  Logger.log('\n--- テスト4: 支払いのアーカイブ編集 ---');
  const paySheet = archiveDb.getSheetByName('Payouts');
  if (paySheet && paySheet.getLastRow() > 1) {
    const headers = paySheet.getRange(1, 1, 1, paySheet.getLastColumn()).getValues()[0];
    const payIdCol = headers.indexOf('payout_id');
    const firstPayId = paySheet.getRange(2, payIdCol + 1).getValue();

    const pay = PayoutRepository.findById(firstPayId);
    if (pay && pay._archived) {
      const originalNotes = pay.notes;
      pay.notes = '[編集テスト] アーカイブ支払い備考変更';
      const result = PayoutRepository.update(pay, pay.updated_at);

      if (result && !result.error) {
        const updated = PayoutRepository.findById(firstPayId);
        if (updated.notes === '[編集テスト] アーカイブ支払い備考変更') {
          Logger.log(`  ✓ 支払い編集成功: notes="${updated.notes}"`);
          passed++;
          updated.notes = originalNotes;
          PayoutRepository.update(updated, updated.updated_at);
        } else {
          Logger.log(`  ✗ 支払い編集: 反映されていない`);
          failed++;
        }
      } else {
        Logger.log(`  ✗ 支払い編集失敗: ${JSON.stringify(result)}`);
        failed++;
      }
    }
  }

  // =============================================
  // テスト5: ステータス更新のフラグ補完テスト
  // =============================================
  Logger.log('\n--- テスト5: ステータス更新のフラグ補完 ---');
  if (jobSheet && jobSheet.getLastRow() > 1) {
    const headers = jobSheet.getRange(1, 1, 1, jobSheet.getLastColumn()).getValues()[0];
    const jobIdCol = headers.indexOf('job_id');
    const firstJobId = jobSheet.getRange(2, jobIdCol + 1).getValue();

    const job = JobRepository.findById(firstJobId);
    if (job && job._archived) {
      const originalStatus = job.status;
      const newStatus = originalStatus === 'hold' ? 'assigned' : 'hold';
      // フラグなしでステータス更新→JobService.updateStatusがフラグを補完するはず
      const result = JobService.updateStatus(firstJobId, newStatus, job.updated_at);
      if (result && result.success !== false) {
        const updated = JobRepository.findById(firstJobId);
        if (updated.status === newStatus) {
          Logger.log(`  ✓ ステータス更新成功（フラグ補完経由）: ${originalStatus}→${newStatus}`);
          passed++;
          // 元に戻す
          JobService.updateStatus(firstJobId, originalStatus, updated.updated_at);
        } else {
          Logger.log(`  ✗ ステータス更新: 反映されていない`);
          failed++;
        }
      } else {
        Logger.log(`  ✗ ステータス更新失敗: ${JSON.stringify(result)}`);
        failed++;
      }
    }
  }

  // =============================================
  // 結果サマリー
  // =============================================
  Logger.log('\n========================================');
  Logger.log(`  アーカイブ編集テスト結果: ${passed} passed, ${failed} failed`);
  Logger.log('========================================');

  if (failed > 0) {
    Logger.log('\n⚠️ 失敗したテストがあります。ログを確認してください。');
  } else {
    Logger.log('\n✓ 全テスト合格！');
  }
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
    work_date_from: `${fiscalYear}-03-01`,
    work_date_to: `${fiscalYear + 1}-02-28`
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
    work_date_from: `${fiscalYear}-03-01`,
    work_date_to: `${fiscalYear + 1}-02-28`
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

  Logger.log('1/7 進捗管理テスト');
  testArchiveProgress();

  Logger.log('\n\n2/7 未処理項目チェックテスト');
  testCheckPendingItems();

  Logger.log('\n\n3/7 テストデータ作成');
  createArchiveTestData();

  Logger.log('\n\n4/7 アーカイブ実行テスト');
  testArchiveExecution();

  Logger.log('\n\n5/7 過去データ参照テスト');
  testArchiveDataRetrieval();

  Logger.log('\n\n6/7 年月範囲×アーカイブ検索テスト');
  testInvoiceYmRangeArchiveSearch();

  Logger.log('\n\n7/7 アーカイブ編集テスト');
  testArchiveEditing();

  Logger.log('\n\n========================================');
  Logger.log('  全テスト完了');
  Logger.log('========================================');
  Logger.log('\nクリーンアップするには cleanupArchiveTestData() を実行してください');
}

// ============================================================
// 複数年度テスト
// ============================================================

/**
 * 複数年度のテストデータを作成
 * GASエディタから実行: createMultiYearTestData()
 */
function createMultiYearTestData() {
  Logger.log('=== 複数年度テストデータ作成開始 ===');
  Logger.log(`対象年度: ${TEST_FISCAL_YEARS.join(', ')}`);

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

  let testStaff;
  try {
    const staffList = getAllRecords('M_Staff').filter(s => !s.is_deleted);
    if (staffList.length > 0) {
      testStaff = staffList[0];
    }
  } catch (e) { /* skip */ }

  for (const fy of TEST_FISCAL_YEARS) {
    Logger.log(`\n========== FY${fy} (${fy}-03-01 〜 ${fy + 1}-02-末) ==========`);

    // 各年度3件ずつ（3月、9月、2月 = 年度の頭・真ん中・末尾）
    const testMonths = [
      { y: fy, m: 3 },   // 年度初月
      { y: fy, m: 9 },   // 年度中盤
      { y: fy + 1, m: 2 } // 年度最終月
    ];

    const jobs = [];
    for (const tm of testMonths) {
      const workDate = `${tm.y}-${String(tm.m).padStart(2, '0')}-15`;
      const job = JobRepository.insert({
        customer_id: testCustomer.customer_id,
        site_name: `[複数年度テスト] FY${fy} ${tm.m}月`,
        site_address: 'テスト住所',
        work_date: workDate,
        time_slot: 'am',
        required_count: 2,
        pay_unit: 'day',
        status: 'assigned',
        notes: `P2-5複数年度テスト FY${fy} (${workDate})`
      });
      Logger.log(`  案件: ${job.job_id} - ${workDate}`);
      jobs.push(job);
    }

    for (let i = 0; i < testMonths.length; i++) {
      const tm = testMonths[i];
      const invoice = InvoiceRepository.insert({
        customer_id: testCustomer.customer_id,
        billing_year: tm.y,
        billing_month: tm.m,
        issue_date: `${tm.y}-${String(tm.m).padStart(2, '0')}-25`,
        subtotal: (fy - 2020) * 100000 + tm.m * 10000,
        tax_amount: Math.round(((fy - 2020) * 100000 + tm.m * 10000) * 0.1),
        total_amount: Math.round(((fy - 2020) * 100000 + tm.m * 10000) * 1.1),
        adjustment_total: 0,
        status: 'paid',
        notes: `P2-5複数年度テスト FY${fy}`
      });
      Logger.log(`  請求書: ${invoice.invoice_id} - ${tm.y}/${tm.m}`);

      // 明細
      InvoiceLineRepository.insert({
        invoice_id: invoice.invoice_id,
        job_id: jobs[i].job_id,
        work_date: `${tm.y}-${String(tm.m).padStart(2, '0')}-15`,
        item_name: `[複数年度テスト] FY${fy} ${tm.m}月分`,
        quantity: 1,
        unit_price: (fy - 2020) * 100000 + tm.m * 10000,
        amount: (fy - 2020) * 100000 + tm.m * 10000,
        notes: `P2-5複数年度テスト FY${fy}`
      });
    }

    // 支払い
    if (testStaff) {
      const periodStart = `${fy}-03-01`;
      const periodEnd = `${fy}-03-31`;
      const payout = PayoutRepository.insert({
        staff_id: testStaff.staff_id,
        payee_type: 'staff',
        period_start: periodStart,
        period_end: periodEnd,
        total_amount: (fy - 2020) * 80000,
        status: 'confirmed',
        notes: `P2-5複数年度テスト FY${fy}`
      });
      Logger.log(`  支払い: ${payout.payout_id} - ${periodStart}`);
    }

    Logger.log(`✓ FY${fy} テストデータ作成完了`);
  }

  Logger.log('\n=== 複数年度テストデータ作成完了 ===');
  Logger.log('次のステップ: archiveMultiYears() を実行');
}

/**
 * 複数年度を順次アーカイブ
 * GASエディタから実行: archiveMultiYears()
 */
function archiveMultiYears() {
  Logger.log('=== 複数年度アーカイブ実行 ===');

  for (const fy of TEST_FISCAL_YEARS) {
    Logger.log(`\n--- FY${fy} アーカイブ ---`);
    const result = ArchiveService.executeYearlyArchive(fy);

    if (result.success) {
      const dbId = ArchiveService.getArchiveDbId(fy);
      Logger.log(`✓ FY${fy} アーカイブ成功 → DB: ${dbId}`);
    } else if (result.error === 'TIMEOUT_WILL_CONTINUE') {
      Logger.log(`⏳ FY${fy} タイムアウト。再実行してください。`);
      return;
    } else {
      Logger.log(`✗ FY${fy} 失敗: ${result.error}`);
    }
  }

  Logger.log('\n=== 全年度アーカイブ完了 ===');
  Logger.log('次のステップ: testMultiYearRetrieval() を実行');
}

/**
 * 複数年度の参照・分離テスト
 * GASエディタから実行: testMultiYearRetrieval()
 */
function testMultiYearRetrieval() {
  Logger.log('=== 複数年度 参照・分離テスト ===');

  let passed = 0;
  let failed = 0;

  // 1. 各年度のアーカイブDBが別々に作成されているか
  Logger.log('\n--- テスト1: 年度別DB分離 ---');
  const dbIds = {};
  for (const fy of TEST_FISCAL_YEARS) {
    const dbId = ArchiveService.getArchiveDbId(fy);
    if (dbId) {
      dbIds[fy] = dbId;
      Logger.log(`  FY${fy}: ${dbId}`);
    } else {
      Logger.log(`  ✗ FY${fy}: アーカイブDB未作成`);
      failed++;
    }
  }

  // DBが全て異なるIDか
  const uniqueIds = new Set(Object.values(dbIds));
  if (uniqueIds.size === TEST_FISCAL_YEARS.length) {
    Logger.log(`  ✓ ${TEST_FISCAL_YEARS.length}年度分の別々のDBが存在`);
    passed++;
  } else {
    Logger.log(`  ✗ DBが重複している（${uniqueIds.size}個 / ${TEST_FISCAL_YEARS.length}年度）`);
    failed++;
  }

  // 2. 各アーカイブDBのデータ件数
  Logger.log('\n--- テスト2: 各DBのデータ件数 ---');
  for (const fy of TEST_FISCAL_YEARS) {
    if (!dbIds[fy]) continue;

    const archiveDb = SpreadsheetApp.openById(dbIds[fy]);
    Logger.log(`  FY${fy} (${archiveDb.getName()}):`);

    const tables = ['Jobs', 'Invoices', 'InvoiceLines', 'Payouts'];
    for (const table of tables) {
      const sheet = archiveDb.getSheetByName(table);
      const count = sheet ? Math.max(0, sheet.getLastRow() - 1) : 0;
      Logger.log(`    ${table}: ${count}件`);
    }
  }

  // 3. findById が正しい年度のDBから取得するか
  Logger.log('\n--- テスト3: findById の年度別フォールバック ---');
  for (const fy of TEST_FISCAL_YEARS) {
    if (!dbIds[fy]) continue;

    const archiveDb = SpreadsheetApp.openById(dbIds[fy]);

    // 案件
    const jobSheet = archiveDb.getSheetByName('Jobs');
    if (jobSheet && jobSheet.getLastRow() > 1) {
      const headers = jobSheet.getRange(1, 1, 1, jobSheet.getLastColumn()).getValues()[0];
      const jobIdCol = headers.indexOf('job_id');
      const firstJobId = jobSheet.getRange(2, jobIdCol + 1).getValue();

      const job = JobRepository.findById(firstJobId);
      if (job && job._archived && job._archiveFiscalYear === fy) {
        Logger.log(`  ✓ FY${fy} 案件: _archiveFiscalYear=${job._archiveFiscalYear} (正しい)`);
        passed++;
      } else {
        Logger.log(`  ✗ FY${fy} 案件: 期待=${fy}, 実際=${job ? job._archiveFiscalYear : 'null'}`);
        failed++;
      }
    }

    // 請求書
    const invSheet = archiveDb.getSheetByName('Invoices');
    if (invSheet && invSheet.getLastRow() > 1) {
      const headers = invSheet.getRange(1, 1, 1, invSheet.getLastColumn()).getValues()[0];
      const invIdCol = headers.indexOf('invoice_id');
      const firstInvId = invSheet.getRange(2, invIdCol + 1).getValue();

      const inv = InvoiceRepository.findById(firstInvId);
      if (inv && inv._archived && inv._archiveFiscalYear === fy) {
        Logger.log(`  ✓ FY${fy} 請求書: _archiveFiscalYear=${inv._archiveFiscalYear} (正しい)`);
        passed++;
      } else {
        Logger.log(`  ✗ FY${fy} 請求書: 期待=${fy}, 実際=${inv ? inv._archiveFiscalYear : 'null'}`);
        failed++;
      }

      // 明細も正しい年度か
      const lines = InvoiceLineRepository.findByInvoiceId(firstInvId);
      if (lines && lines.length > 0 && lines[0]._archiveFiscalYear === fy) {
        Logger.log(`  ✓ FY${fy} 明細: _archiveFiscalYear=${lines[0]._archiveFiscalYear} (正しい)`);
        passed++;
      } else {
        Logger.log(`  ✗ FY${fy} 明細: 期待=${fy}, 実際=${lines && lines.length > 0 ? lines[0]._archiveFiscalYear : 'なし'}`);
        failed++;
      }
    }
  }

  // 4. 年度を跨いだ編集が正しいDBに書き込まれるか
  Logger.log('\n--- テスト4: 年度別編集の分離 ---');
  for (const fy of TEST_FISCAL_YEARS) {
    if (!dbIds[fy]) continue;

    const archiveDb = SpreadsheetApp.openById(dbIds[fy]);
    const jobSheet = archiveDb.getSheetByName('Jobs');
    if (!jobSheet || jobSheet.getLastRow() <= 1) continue;

    const headers = jobSheet.getRange(1, 1, 1, jobSheet.getLastColumn()).getValues()[0];
    const jobIdCol = headers.indexOf('job_id');
    const siteNameCol = headers.indexOf('site_name');
    const firstJobId = jobSheet.getRange(2, jobIdCol + 1).getValue();

    const job = JobRepository.findById(firstJobId);
    if (!job || !job._archived) continue;

    // 編集
    const marker = `[年度分離テスト-FY${fy}]`;
    const originalSiteName = job.site_name;
    job.site_name = marker;
    JobRepository.update(job, job.updated_at);

    // 正しいアーカイブDBに書き込まれたか直接確認
    SpreadsheetApp.flush();
    const updatedValue = archiveDb.getSheetByName('Jobs').getRange(2, siteNameCol + 1).getValue();
    if (updatedValue === marker) {
      Logger.log(`  ✓ FY${fy}: 正しいDBに書き込み確認`);
      passed++;
    } else {
      Logger.log(`  ✗ FY${fy}: DB上の値="${updatedValue}", 期待="${marker}"`);
      failed++;
    }

    // 他の年度のDBが変更されていないか
    for (const otherFy of TEST_FISCAL_YEARS) {
      if (otherFy === fy || !dbIds[otherFy]) continue;
      const otherDb = SpreadsheetApp.openById(dbIds[otherFy]);
      const otherJobSheet = otherDb.getSheetByName('Jobs');
      if (!otherJobSheet || otherJobSheet.getLastRow() <= 1) continue;

      const otherHeaders = otherJobSheet.getRange(1, 1, 1, otherJobSheet.getLastColumn()).getValues()[0];
      const otherSiteNameCol = otherHeaders.indexOf('site_name');
      const allValues = otherJobSheet.getRange(2, otherSiteNameCol + 1, otherJobSheet.getLastRow() - 1, 1).getValues();
      const contaminated = allValues.some(row => row[0] === marker);
      if (!contaminated) {
        Logger.log(`  ✓ FY${otherFy}: 他年度のDBは汚染されていない`);
        passed++;
      } else {
        Logger.log(`  ✗ FY${otherFy}: 他年度のDBにFY${fy}の編集が混入!`);
        failed++;
      }
    }

    // 元に戻す
    const restored = JobRepository.findById(firstJobId);
    restored.site_name = originalSiteName;
    JobRepository.update(restored, restored.updated_at);
  }

  // 結果
  Logger.log('\n========================================');
  Logger.log(`  複数年度テスト結果: ${passed} passed, ${failed} failed`);
  Logger.log('========================================');
  if (failed === 0) {
    Logger.log('\n✓ 全テスト合格！年度別DBは正しく分離されています。');
  }
}

/**
 * 複数年度テストデータ＋アーカイブDBをクリーンアップ
 * GASエディタから実行: cleanupMultiYearTestData()
 */
function cleanupMultiYearTestData() {
  Logger.log('=== 複数年度テストデータ クリーンアップ ===');

  for (const fy of TEST_FISCAL_YEARS) {
    Logger.log(`\n--- FY${fy} ---`);

    // 現行DBのテストデータ削除
    const jobs = JobRepository.search({
      work_date_from: `${fy}-03-01`,
      work_date_to: `${fy + 1}-02-28`
    });
    const testJobs = jobs.filter(j => j.notes && j.notes.includes('P2-5複数年度テスト'));
    Logger.log(`  現行DB案件削除: ${testJobs.length}件`);
    for (const job of testJobs) {
      JobRepository.softDelete(job.job_id, job.updated_at);
    }

    // アーカイブDB削除
    const archiveDbId = ArchiveService.getArchiveDbId(fy);
    if (archiveDbId) {
      try {
        DriveApp.getFileById(archiveDbId).setTrashed(true);
        Logger.log(`  ✓ アーカイブDB削除: ${archiveDbId}`);
      } catch (e) {
        Logger.log(`  ⚠ アーカイブDB削除失敗: ${e.message}`);
      }
      // ScriptPropertiesからも削除
      PropertiesService.getScriptProperties().deleteProperty(`ARCHIVE_DB_${fy}`);
      Logger.log(`  ✓ ARCHIVE_DB_${fy} プロパティ削除`);
    }

    // 進捗クリア
    ArchiveService.clearProgress(fy);
  }

  Logger.log('\n=== クリーンアップ完了 ===');
}

/**
 * 複数年度テスト一括実行
 * GASエディタから実行: runMultiYearTests()
 *
 * 注意: アーカイブ実行に時間がかかるため、タイムアウトする場合は
 * 各関数を個別に実行してください。
 */
function runMultiYearTests() {
  Logger.log('========================================');
  Logger.log('  複数年度アーカイブテスト');
  Logger.log(`  対象: ${TEST_FISCAL_YEARS.map(fy => 'FY' + fy).join(', ')}`);
  Logger.log('========================================\n');

  Logger.log('1/3 テストデータ作成');
  createMultiYearTestData();

  Logger.log('\n\n2/3 アーカイブ実行');
  archiveMultiYears();

  Logger.log('\n\n3/3 参照・分離テスト');
  testMultiYearRetrieval();

  Logger.log('\n\n========================================');
  Logger.log('  複数年度テスト完了');
  Logger.log('========================================');
  Logger.log('\nクリーンアップ: cleanupMultiYearTestData()');
}
