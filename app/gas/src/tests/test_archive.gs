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
 * 4. testArchiveEditing() - アーカイブデータ編集テスト ★NEW
 * 5. cleanupArchiveTestData() - テストデータクリーンアップ
 */

// テスト用の年度（実際の本番データに影響しないよう過去年度を使用）
// 年度は3月〜2月（例: FY2023 = 2023-03-01 〜 2024-02-29）
const TEST_FISCAL_YEAR = 2023;

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

  Logger.log('1/6 進捗管理テスト');
  testArchiveProgress();

  Logger.log('\n\n2/6 未処理項目チェックテスト');
  testCheckPendingItems();

  Logger.log('\n\n3/6 テストデータ作成');
  createArchiveTestData();

  Logger.log('\n\n4/6 アーカイブ実行テスト');
  testArchiveExecution();

  Logger.log('\n\n5/6 過去データ参照テスト');
  testArchiveDataRetrieval();

  Logger.log('\n\n6/6 アーカイブ編集テスト');
  testArchiveEditing();

  Logger.log('\n\n========================================');
  Logger.log('  全テスト完了');
  Logger.log('========================================');
  Logger.log('\nクリーンアップするには cleanupArchiveTestData() を実行してください');
}
