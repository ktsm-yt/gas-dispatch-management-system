/**
 * テストデータ作成スクリプト
 *
 * GASエディタから createTestData() を実行してください
 */

/**
 * テストデータを作成
 */
function createTestData() {
  console.log('=== テストデータ作成開始 ===');

  // 1. 顧客マスターにテストデータを追加
  createTestCustomers();

  // 2. スタッフマスターにテストデータを追加
  createTestStaff();

  // 3. 交通費マスターにテストデータを追加
  createTestTransportFees();

  // 4. 案件データを追加（本日と明日）
  createTestJobs();

  console.log('=== テストデータ作成完了 ===');
}

/**
 * 顧客テストデータを作成
 */
function createTestCustomers() {
  console.log('顧客マスター作成中...');

  const customers = [
    {
      customer_id: 'cus_test_001',
      company_name: 'テスト建設株式会社',
      branch_name: '東京支店',
      contact_name: '山田太郎',
      honorific: '様',
      postal_code: '100-0001',
      address: '東京都千代田区千代田1-1',
      phone: '03-1234-5678',
      unit_price_tobi: 25000,
      unit_price_age: 20000,
      unit_price_tobiage: 28000,
      unit_price_half: 12000,
      closing_day: 31,
      invoice_format: 'format1',
      tax_rate: 10,
      is_active: true
    },
    {
      customer_id: 'cus_test_002',
      company_name: '山本工務店',
      contact_name: '山本一郎',
      honorific: '様',
      postal_code: '150-0001',
      address: '東京都渋谷区神宮前1-1',
      phone: '03-9876-5432',
      unit_price_tobi: 26000,
      unit_price_age: 21000,
      unit_price_tobiage: 29000,
      unit_price_half: 13000,
      closing_day: 25,
      invoice_format: 'format2',
      tax_rate: 10,
      is_active: true
    },
    {
      customer_id: 'cus_test_003',
      company_name: '鈴木ハウス',
      contact_name: '鈴木花子',
      honorific: '様',
      postal_code: '160-0001',
      address: '東京都新宿区新宿1-1',
      phone: '03-1111-2222',
      unit_price_tobi: 24000,
      unit_price_age: 19000,
      unit_price_tobiage: 27000,
      unit_price_half: 11000,
      closing_day: 31,
      invoice_format: 'format1',
      tax_rate: 10,
      is_active: true
    }
  ];

  const sheet = getSheet('M_Customers');
  const headers = getHeaders(sheet);
  const now = getCurrentTimestamp();

  for (const cust of customers) {
    // 既存チェック
    const existing = findRowById(sheet, 'customer_id', cust.customer_id);
    if (existing) {
      console.log(`顧客 ${cust.company_name} は既に存在します`);
      continue;
    }

    const record = {
      ...cust,
      created_at: now,
      created_by: 'test',
      updated_at: now,
      updated_by: 'test',
      is_deleted: false
    };

    insertRecord('M_Customers', record);
    console.log(`顧客作成: ${cust.company_name}`);
  }
}

/**
 * スタッフテストデータを作成
 */
function createTestStaff() {
  console.log('スタッフマスター作成中...');

  const staffList = [
    {
      staff_id: 'stf_test_001',
      name: '佐藤健太',
      name_kana: 'サトウケンタ',
      phone: '090-1111-1111',
      skills: '鳶,揚げ',
      has_motorbike: true,
      daily_rate_half: 8000,
      daily_rate_basic: 11000,
      daily_rate_fullday: 14000,
      daily_rate_night: 13000,
      daily_rate_tobi: 17000,
      staff_type: 'regular',
      is_active: true
    },
    {
      staff_id: 'stf_test_002',
      name: '田中誠',
      name_kana: 'タナカマコト',
      phone: '090-2222-2222',
      skills: '揚げ',
      has_motorbike: false,
      daily_rate_half: 7500,
      daily_rate_basic: 10000,
      daily_rate_fullday: 13000,
      daily_rate_night: 13000,
      daily_rate_tobi: 0,
      staff_type: 'regular',
      is_active: true
    },
    {
      staff_id: 'stf_test_003',
      name: '高橋雄一',
      name_kana: 'タカハシユウイチ',
      phone: '090-3333-3333',
      skills: '鳶,鳶揚げ',
      has_motorbike: true,
      daily_rate_half: 8000,
      daily_rate_basic: 11000,
      daily_rate_fullday: 14000,
      daily_rate_night: 13000,
      daily_rate_tobi: 17000,
      staff_type: 'regular',
      is_active: true
    },
    {
      staff_id: 'stf_test_004',
      name: '伊藤美咲',
      name_kana: 'イトウミサキ',
      phone: '090-4444-4444',
      skills: '揚げ',
      has_motorbike: false,
      daily_rate_half: 7500,
      daily_rate_basic: 10000,
      daily_rate_fullday: 13000,
      daily_rate_night: 13000,
      daily_rate_tobi: 0,
      staff_type: 'regular',
      is_active: true
    },
    {
      staff_id: 'stf_test_005',
      name: '渡辺大輔',
      name_kana: 'ワタナベダイスケ',
      phone: '090-5555-5555',
      skills: '鳶,揚げ,鳶揚げ',
      has_motorbike: true,
      daily_rate_half: 8500,
      daily_rate_basic: 12000,
      daily_rate_fullday: 14000,
      daily_rate_night: 13000,
      daily_rate_tobi: 18000,
      staff_type: 'regular',
      is_active: true
    }
  ];

  const sheet = getSheet('M_Staff');
  const now = getCurrentTimestamp();

  for (const staff of staffList) {
    // 既存チェック
    const existing = findRowById(sheet, 'staff_id', staff.staff_id);
    if (existing) {
      console.log(`スタッフ ${staff.name} は既に存在します`);
      continue;
    }

    const record = {
      ...staff,
      created_at: now,
      created_by: 'test',
      updated_at: now,
      updated_by: 'test',
      is_deleted: false
    };

    insertRecord('M_Staff', record);
    console.log(`スタッフ作成: ${staff.name}`);
  }
}

/**
 * 交通費マスターテストデータを作成
 */
function createTestTransportFees() {
  console.log('交通費マスター作成中...');

  const areas = [
    { area_code: '23ku_inner', area_name: '23区内', default_fee: 500 },
    { area_code: '23ku_outer', area_name: '23区外', default_fee: 1000 },
    { area_code: 'saitama', area_name: '埼玉県', default_fee: 1500 },
    { area_code: 'chiba', area_name: '千葉県', default_fee: 1500 },
    { area_code: 'kanagawa', area_name: '神奈川県', default_fee: 1500 }
  ];

  const sheet = getSheet('M_TransportFee');

  for (const area of areas) {
    // 既存チェック
    const existing = findRowById(sheet, 'area_code', area.area_code);
    if (existing) {
      console.log(`交通費エリア ${area.area_name} は既に存在します`);
      continue;
    }

    insertRecord('M_TransportFee', area);
    console.log(`交通費エリア作成: ${area.area_name}`);
  }
}

/**
 * 案件テストデータを作成
 */
function createTestJobs() {
  console.log('案件データ作成中...');

  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const formatDate = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const todayStr = formatDate(today);
  const tomorrowStr = formatDate(tomorrow);

  const jobs = [
    // 今日の案件
    {
      customer_id: 'cus_test_001',
      site_name: 'ABCマンション新築工事',
      site_address: '東京都港区赤坂1-1-1',
      work_date: todayStr,
      time_slot: 'jotou',
      start_time: '08:00',
      required_count: 3,
      job_type: 'tobi',  // 上棟のみ作業種別あり
      status: 'pending'
    },
    {
      customer_id: 'cus_test_002',
      site_name: 'XYZビル改修工事',
      site_address: '東京都渋谷区道玄坂2-2-2',
      work_date: todayStr,
      time_slot: 'shuujitsu',
      start_time: '09:00',
      required_count: 2,
      // job_type なし（上棟以外）
      status: 'pending'
    },
    {
      customer_id: 'cus_test_003',
      site_name: '田中邸新築工事',
      site_address: '東京都世田谷区三軒茶屋3-3-3',
      work_date: todayStr,
      time_slot: 'am',
      start_time: '08:30',
      required_count: 2,
      // job_type なし（上棟以外）
      status: 'pending'
    },
    {
      customer_id: 'cus_test_001',
      site_name: '山田ビル解体工事',
      site_address: '東京都新宿区西新宿4-4-4',
      work_date: todayStr,
      time_slot: 'pm',
      start_time: '13:00',
      required_count: 4,
      // job_type なし（上棟以外）
      status: 'pending'
    },
    // 明日の案件
    {
      customer_id: 'cus_test_002',
      site_name: 'DEFタワー建設',
      site_address: '東京都品川区大崎5-5-5',
      work_date: tomorrowStr,
      time_slot: 'jotou',
      start_time: '07:30',
      required_count: 5,
      job_type: 'tobiage',  // 上棟のみ作業種別あり
      status: 'pending'
    },
    {
      customer_id: 'cus_test_003',
      site_name: 'GHIマンション',
      site_address: '東京都目黒区自由が丘6-6-6',
      work_date: tomorrowStr,
      time_slot: 'shuujitsu',
      start_time: '08:00',
      required_count: 3,
      // job_type なし（上棟以外）
      status: 'pending'
    }
  ];

  for (const job of jobs) {
    const created = JobRepository.insert(job);
    console.log(`案件作成: ${job.site_name} (${job.work_date} ${job.time_slot})`);
  }
}

/**
 * テストデータを削除
 */
function deleteTestData() {
  console.log('=== テストデータ削除開始 ===');

  // 案件を削除（テスト顧客の案件）
  const allJobs = getAllRecords('T_Jobs', { includeDeleted: true });
  const testJobs = allJobs.filter(j =>
    j.customer_id && j.customer_id.startsWith('cus_test_')
  );

  for (const job of testJobs) {
    // 配置も削除
    const assignments = AssignmentRepository.findByJobId(job.job_id);
    for (const a of assignments) {
      AssignmentRepository.softDelete(a.assignment_id);
    }
    JobRepository.softDelete(job.job_id, job.updated_at);
    console.log(`案件削除: ${job.site_name}`);
  }

  console.log('=== テストデータ削除完了 ===');
  console.log('注: 顧客・スタッフ・交通費マスターは残っています');
}

/**
 * 重複配置データをクリーンアップ
 * 同じ案件に同じスタッフが複数配置されている場合、最新の1件のみ残して他を削除
 */
function cleanupDuplicateAssignments() {
  console.log('=== 重複配置クリーンアップ開始 ===');

  const allAssignments = getAllRecords('T_JobAssignments', { includeDeleted: false });
  console.log(`全配置レコード数: ${allAssignments.length}`);

  // job_id + staff_id でグループ化
  const groupedByJobStaff = {};
  for (const a of allAssignments) {
    const key = `${a.job_id}__${a.staff_id}`;
    if (!groupedByJobStaff[key]) {
      groupedByJobStaff[key] = [];
    }
    groupedByJobStaff[key].push(a);
  }

  // 重複を検出して削除
  let deletedCount = 0;
  let keptCount = 0;

  for (const key of Object.keys(groupedByJobStaff)) {
    const assignments = groupedByJobStaff[key];
    if (assignments.length <= 1) {
      keptCount++;
      continue;
    }

    // updated_at で降順ソート（最新を残す）
    assignments.sort((a, b) => {
      const dateA = new Date(a.updated_at || a.created_at || 0);
      const dateB = new Date(b.updated_at || b.created_at || 0);
      return dateB - dateA;
    });

    const [keep, ...duplicates] = assignments;
    keptCount++;

    console.log(`重複発見: ${key}`);
    console.log(`  保持: ${keep.assignment_id} (updated_at: ${keep.updated_at})`);

    for (const dup of duplicates) {
      console.log(`  削除: ${dup.assignment_id} (updated_at: ${dup.updated_at})`);
      AssignmentRepository.softDelete(dup.assignment_id);
      deletedCount++;
    }
  }

  console.log('=== 重複配置クリーンアップ完了 ===');
  console.log(`保持: ${keptCount}件, 削除: ${deletedCount}件`);

  return { kept: keptCount, deleted: deletedCount };
}

/**
 * 配置データの整合性チェック
 * 重複や不整合を検出してレポート
 */
function checkAssignmentIntegrity() {
  console.log('=== 配置データ整合性チェック開始 ===');

  const allAssignments = getAllRecords('T_JobAssignments', { includeDeleted: false });
  const allJobs = getAllRecords('T_Jobs', { includeDeleted: false });
  const allStaff = getAllRecords('M_Staff', { includeDeleted: false });

  const jobIds = new Set(allJobs.map(j => j.job_id));
  const staffIds = new Set(allStaff.map(s => s.staff_id));

  const issues = [];

  // 1. 重複チェック
  const groupedByJobStaff = {};
  for (const a of allAssignments) {
    const key = `${a.job_id}__${a.staff_id}`;
    if (!groupedByJobStaff[key]) {
      groupedByJobStaff[key] = [];
    }
    groupedByJobStaff[key].push(a);
  }

  for (const [key, assignments] of Object.entries(groupedByJobStaff)) {
    if (assignments.length > 1) {
      issues.push({
        type: 'DUPLICATE',
        message: `重複配置: ${key} (${assignments.length}件)`,
        data: assignments.map(a => a.assignment_id)
      });
    }
  }

  // 2. 孤児配置チェック（存在しない案件への配置）
  for (const a of allAssignments) {
    if (!jobIds.has(a.job_id)) {
      issues.push({
        type: 'ORPHAN_JOB',
        message: `存在しない案件への配置: ${a.assignment_id} -> ${a.job_id}`,
        data: a
      });
    }
  }

  // 3. 存在しないスタッフへの配置
  for (const a of allAssignments) {
    if (!staffIds.has(a.staff_id)) {
      issues.push({
        type: 'ORPHAN_STAFF',
        message: `存在しないスタッフへの配置: ${a.assignment_id} -> ${a.staff_id}`,
        data: a
      });
    }
  }

  console.log('=== 配置データ整合性チェック完了 ===');
  console.log(`総配置数: ${allAssignments.length}`);
  console.log(`問題数: ${issues.length}`);

  if (issues.length > 0) {
    console.log('\n--- 問題詳細 ---');
    for (const issue of issues) {
      console.log(`[${issue.type}] ${issue.message}`);
    }
  }

  return issues;
}

/**
 * 案件ステータスを配置数に基づいて一括修正
 * pending/assigned のみ対象（completed, cancelled は変更しない）
 */
function fixJobStatuses() {
  console.log('=== 案件ステータス修正開始 ===');

  const allJobs = getAllRecords('T_Jobs', { includeDeleted: false });
  let updatedCount = 0;
  let skippedCount = 0;

  for (const job of allJobs) {
    // completed, cancelled, hold はスキップ
    if (['completed', 'cancelled', 'hold'].includes(job.status)) {
      skippedCount++;
      continue;
    }

    const assignedCount = AssignmentRepository.countByJobId(job.job_id);
    const requiredCount = Number(job.required_count) || 0;

    let expectedStatus;
    if (assignedCount === 0) {
      expectedStatus = 'pending';
    } else if (assignedCount >= requiredCount) {
      expectedStatus = 'assigned';
    } else {
      expectedStatus = 'pending';
    }

    if (job.status !== expectedStatus) {
      console.log(`${job.job_id}: ${job.status} -> ${expectedStatus} (${assignedCount}/${requiredCount})`);
      JobRepository.update({ job_id: job.job_id, status: expectedStatus }, job.updated_at);
      updatedCount++;
    }
  }

  console.log('=== 案件ステータス修正完了 ===');
  console.log(`更新: ${updatedCount}件, スキップ: ${skippedCount}件`);

  return { updated: updatedCount, skipped: skippedCount };
}

/**
 * テストデータを一括削除
 * @param {Object} options - オプション
 * @param {boolean} options.jobs - 案件を削除（デフォルト: true）
 * @param {boolean} options.assignments - 配置を削除（デフォルト: true）
 * @param {boolean} options.customers - 顧客を削除（デフォルト: false）
 * @param {boolean} options.staff - スタッフを削除（デフォルト: false）
 */
function clearTestData(options = {}) {
  const defaults = {
    jobs: true,
    assignments: true,
    customers: false,
    staff: false
  };
  const opts = { ...defaults, ...options };

  console.log('=== テストデータ一括削除開始 ===');
  console.log('オプション:', JSON.stringify(opts));

  const results = {};

  if (opts.assignments) {
    results.assignments = clearTable('T_JobAssignments');
  }

  if (opts.jobs) {
    results.jobs = clearTable('T_Jobs');
  }

  if (opts.customers) {
    results.customers = clearTable('M_Customers');
  }

  if (opts.staff) {
    results.staff = clearTable('M_Staff');
  }

  console.log('=== テストデータ一括削除完了 ===');
  console.log('結果:', JSON.stringify(results));

  return results;
}

/**
 * テーブルのデータ行を全削除（ヘッダーは保持）
 * @param {string} tableName - テーブル名
 * @returns {number} 削除した行数
 */
function clearTable(tableName) {
  const sheet = getSheet(tableName);
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();

  if (lastRow <= 1) {
    console.log(`${tableName}: データなし`);
    return 0;
  }

  const rowCount = lastRow - 1;
  // deleteRowsは固定行があるとエラーになるため、clearContentを使用
  sheet.getRange(2, 1, rowCount, lastCol).clearContent();
  console.log(`${tableName}: ${rowCount}行クリア`);

  return rowCount;
}

/**
 * 全テストデータを削除（案件・配置のみ、マスターは保持）
 */
function clearAllTestData() {
  return clearTestData({ jobs: true, assignments: true, customers: false, staff: false });
}

/**
 * マスターを含む全データを削除（注意: 復元不可）
 */
function clearEverything() {
  console.log('⚠️ 全データ削除を実行します');
  return clearTestData({ jobs: true, assignments: true, customers: true, staff: true });
}
