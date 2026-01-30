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
      pay_unit: 'tobi',  // 上棟は鳶単価
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
      pay_unit: 'basic',  // 基本単価
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
      pay_unit: 'basic',  // 基本単価
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
      pay_unit: 'basic',  // 基本単価
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
      pay_unit: 'tobiage',  // 鳶揚げ単価
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
      pay_unit: 'basic',  // 基本単価
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
 * pending/assigned のみ対象（cancelled, hold, problem は変更しない）
 */
function fixJobStatuses() {
  console.log('=== 案件ステータス修正開始 ===');

  const allJobs = getAllRecords('T_Jobs', { includeDeleted: false });
  let updatedCount = 0;
  let skippedCount = 0;

  for (const job of allJobs) {
    // cancelled, hold, problem はスキップ
    if (['cancelled', 'hold', 'problem'].includes(job.status)) {
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

/**
 * 作業員名簿（統一様式第5号）用テストデータを作成
 * GASエディタから createWorkerRosterTestData() を実行
 */
function createWorkerRosterTestData() {
  console.log('=== 作業員名簿用テストデータ作成開始 ===');

  const staffList = [
    {
      name: '鈴木一郎',
      name_kana: 'スズキイチロウ',
      phone: '090-1001-1001',
      postal_code: '150-0001',
      address: '東京都渋谷区神宮前1-2-3',
      birth_date: '1985-03-15',
      hire_date: '2015-04-01',
      gender: '男',
      blood_type: 'A',
      emergency_contact_name: '鈴木花子',
      emergency_contact_address: '同上',
      emergency_contact_phone: '090-1001-1002',
      health_insurance_type: '協会けんぽ',
      pension_type: '厚生年金',
      pension_number: '1234-567890',
      employment_insurance_no: '1234-567890-1',
      kensetsu_kyosai: '有',
      chusho_kyosai: '無',
      ccus_id: 'CCUS001234567',
      skills: '鳶,揚げ',
      staff_type: 'regular',
      is_active: true
    },
    {
      name: '田中太郎',
      name_kana: 'タナカタロウ',
      phone: '090-1002-1001',
      postal_code: '160-0022',
      address: '東京都新宿区新宿2-4-5',
      birth_date: '1990-07-20',
      hire_date: '2018-09-01',
      gender: '男',
      blood_type: 'B',
      emergency_contact_name: '田中美子',
      emergency_contact_address: '東京都新宿区西新宿3-5-6',
      emergency_contact_phone: '090-1002-1002',
      health_insurance_type: '建設国保',
      pension_type: '厚生年金',
      pension_number: '2345-678901',
      employment_insurance_no: '2345-678901-2',
      kensetsu_kyosai: '有',
      chusho_kyosai: '有',
      ccus_id: 'CCUS002345678',
      skills: '揚げ',
      staff_type: 'regular',
      is_active: true
    },
    {
      name: '山田健二',
      name_kana: 'ヤマダケンジ',
      phone: '090-1003-1001',
      postal_code: '170-0013',
      address: '東京都豊島区東池袋4-5-6',
      birth_date: '1978-11-05',
      hire_date: '2010-04-01',
      gender: '男',
      blood_type: 'O',
      emergency_contact_name: '山田良子',
      emergency_contact_address: '同上',
      emergency_contact_phone: '090-1003-1002',
      health_insurance_type: '協会けんぽ',
      pension_type: '厚生年金',
      pension_number: '3456-789012',
      employment_insurance_no: '3456-789012-3',
      kensetsu_kyosai: '有',
      chusho_kyosai: '無',
      ccus_id: 'CCUS003456789',
      skills: '鳶,鳶揚げ',
      staff_type: 'regular',
      is_active: true
    },
    {
      name: '佐々木三郎',
      name_kana: 'ササキサブロウ',
      phone: '090-1004-1001',
      postal_code: '180-0004',
      address: '東京都武蔵野市吉祥寺本町1-2-3',
      birth_date: '1995-02-28',
      hire_date: '2020-04-01',
      gender: '男',
      blood_type: 'AB',
      emergency_contact_name: '佐々木春子',
      emergency_contact_address: '東京都武蔵野市御殿山2-3-4',
      emergency_contact_phone: '0422-12-3456',
      health_insurance_type: '国民健康保険',
      pension_type: '国民年金',
      pension_number: '',
      employment_insurance_no: '4567-890123-4',
      kensetsu_kyosai: '無',
      chusho_kyosai: '無',
      ccus_id: 'CCUS004567890',
      skills: '揚げ',
      staff_type: 'regular',
      is_active: true
    },
    {
      name: '高橋四郎',
      name_kana: 'タカハシシロウ',
      phone: '090-1005-1001',
      postal_code: '141-0021',
      address: '東京都品川区上大崎3-4-5',
      birth_date: '1988-06-10',
      hire_date: '2016-07-01',
      gender: '男',
      blood_type: 'A',
      emergency_contact_name: '高橋夏子',
      emergency_contact_address: '同上',
      emergency_contact_phone: '090-1005-1002',
      health_insurance_type: '協会けんぽ',
      pension_type: '厚生年金',
      pension_number: '5678-901234',
      employment_insurance_no: '5678-901234-5',
      kensetsu_kyosai: '有',
      chusho_kyosai: '有',
      ccus_id: 'CCUS005678901',
      skills: '鳶,揚げ,鳶揚げ',
      staff_type: 'regular',
      is_active: true
    },
    {
      name: '伊藤五郎',
      name_kana: 'イトウゴロウ',
      phone: '090-1006-1001',
      postal_code: '113-0033',
      address: '東京都文京区本郷5-6-7',
      birth_date: '1982-09-22',
      hire_date: '2012-10-01',
      gender: '男',
      blood_type: 'B',
      emergency_contact_name: '伊藤秋子',
      emergency_contact_address: '同上',
      emergency_contact_phone: '090-1006-1002',
      health_insurance_type: '建設国保',
      pension_type: '厚生年金',
      pension_number: '6789-012345',
      employment_insurance_no: '6789-012345-6',
      kensetsu_kyosai: '有',
      chusho_kyosai: '無',
      ccus_id: 'CCUS006789012',
      skills: '鳶',
      staff_type: 'regular',
      is_active: true
    },
    {
      name: '渡辺六郎',
      name_kana: 'ワタナベロクロウ',
      phone: '090-1007-1001',
      postal_code: '104-0061',
      address: '東京都中央区銀座6-7-8',
      birth_date: '1992-12-01',
      hire_date: '2019-01-15',
      gender: '男',
      blood_type: 'O',
      emergency_contact_name: '渡辺冬子',
      emergency_contact_address: '東京都中央区日本橋1-2-3',
      emergency_contact_phone: '03-1234-5678',
      health_insurance_type: '協会けんぽ',
      pension_type: '厚生年金',
      pension_number: '7890-123456',
      employment_insurance_no: '7890-123456-7',
      kensetsu_kyosai: '有',
      chusho_kyosai: '有',
      ccus_id: 'CCUS007890123',
      skills: '揚げ,鳶揚げ',
      staff_type: 'regular',
      is_active: true
    },
    {
      name: '中村七郎',
      name_kana: 'ナカムラシチロウ',
      phone: '090-1008-1001',
      postal_code: '162-0065',
      address: '東京都新宿区住吉町7-8-9',
      birth_date: '1975-04-18',
      hire_date: '2005-05-01',
      gender: '男',
      blood_type: 'A',
      emergency_contact_name: '中村文子',
      emergency_contact_address: '同上',
      emergency_contact_phone: '090-1008-1002',
      health_insurance_type: '建設国保',
      pension_type: '厚生年金',
      pension_number: '8901-234567',
      employment_insurance_no: '8901-234567-8',
      kensetsu_kyosai: '有',
      chusho_kyosai: '無',
      ccus_id: 'CCUS008901234',
      skills: '鳶,揚げ',
      staff_type: 'regular',
      is_active: true
    },
    {
      name: '小林八郎',
      name_kana: 'コバヤシハチロウ',
      phone: '090-1009-1001',
      postal_code: '106-0032',
      address: '東京都港区六本木8-9-10',
      birth_date: '1998-08-08',
      hire_date: '2022-04-01',
      gender: '男',
      blood_type: 'AB',
      emergency_contact_name: '小林梅子',
      emergency_contact_address: '神奈川県横浜市中区1-2-3',
      emergency_contact_phone: '045-123-4567',
      health_insurance_type: '協会けんぽ',
      pension_type: '厚生年金',
      pension_number: '9012-345678',
      employment_insurance_no: '9012-345678-9',
      kensetsu_kyosai: '無',
      chusho_kyosai: '無',
      ccus_id: 'CCUS009012345',
      skills: '揚げ',
      staff_type: 'regular',
      is_active: true
    },
    {
      name: '加藤九郎',
      name_kana: 'カトウクロウ',
      phone: '090-1010-1001',
      postal_code: '135-0064',
      address: '東京都江東区青海9-10-11',
      birth_date: '1980-01-25',
      hire_date: '2008-08-01',
      gender: '男',
      blood_type: 'B',
      emergency_contact_name: '加藤桜子',
      emergency_contact_address: '同上',
      emergency_contact_phone: '090-1010-1002',
      health_insurance_type: '建設国保',
      pension_type: '厚生年金',
      pension_number: '0123-456789',
      employment_insurance_no: '0123-456789-0',
      kensetsu_kyosai: '有',
      chusho_kyosai: '有',
      ccus_id: 'CCUS010123456',
      skills: '鳶,揚げ,鳶揚げ',
      staff_type: 'regular',
      is_active: true
    }
  ];

  // 既存データを確認（名前で重複チェック）
  const existing = listStaff({ includeDeleted: false });
  const existingNames = new Set();
  if (existing.ok && existing.data?.items) {
    existing.data.items.forEach(s => existingNames.add(s.name));
  }

  let created = 0;
  let skipped = 0;

  for (const staff of staffList) {
    if (existingNames.has(staff.name)) {
      console.log(`スキップ（既存）: ${staff.name}`);
      skipped++;
      continue;
    }

    const result = saveStaff(staff);
    if (result.ok) {
      console.log(`作成: ${staff.name}`);
      created++;
    } else {
      console.log(`エラー: ${staff.name} - ${result.error?.message}`);
    }
  }

  console.log(`=== 作業員名簿用テストデータ作成完了 ===`);
  console.log(`作成: ${created}件, スキップ: ${skipped}件`);
}

// ========== 外注費テストデータ (P2-8) ==========

/**
 * 外注費テストデータを一括作成
 * GASエディタから createSubcontractorTestData() を実行
 */
function createSubcontractorTestData() {
  console.log('=== 外注費テストデータ作成開始 ===');

  // 1. 外注先マスタを作成
  createTestSubcontractors();

  // 2. 外注スタッフを作成
  createTestSubcontractorStaff();

  // 3. 外注スタッフの配置を作成
  createSubcontractorTestAssignments();

  console.log('=== 外注費テストデータ作成完了 ===');
}

/**
 * 外注先マスタテストデータを作成
 */
function createTestSubcontractors() {
  console.log('外注先マスター作成中...');

  const subcontractors = [
    {
      subcontractor_id: 'sub_test_001',
      company_name: 'ファーストG',
      contact_name: '田中一郎',
      phone: '03-1111-1111',
      email: 'first-g@example.com',
      address: '東京都台東区上野1-1-1',
      notes: 'テスト外注先1',
      is_active: true
    },
    {
      subcontractor_id: 'sub_test_002',
      company_name: 'ジール',
      contact_name: '鈴木二郎',
      phone: '03-2222-2222',
      email: 'zeal@example.com',
      address: '東京都墨田区押上2-2-2',
      notes: 'テスト外注先2',
      is_active: true
    },
    {
      subcontractor_id: 'sub_test_003',
      company_name: '三沢工業',
      contact_name: '三沢三郎',
      phone: '03-3333-3333',
      email: 'misawa@example.com',
      address: '東京都江東区豊洲3-3-3',
      notes: 'テスト外注先3',
      is_active: true
    }
  ];

  const sheet = getSheet('M_Subcontractors');
  const now = getCurrentTimestamp();

  for (const sub of subcontractors) {
    // 既存チェック
    const existing = findRowById(sheet, 'subcontractor_id', sub.subcontractor_id);
    if (existing) {
      console.log(`外注先 ${sub.company_name} は既に存在します`);
      continue;
    }

    const record = {
      ...sub,
      created_at: now,
      created_by: 'test',
      updated_at: now,
      updated_by: 'test',
      is_deleted: false
    };

    insertRecord('M_Subcontractors', record);
    console.log(`外注先作成: ${sub.company_name}`);
  }
}

/**
 * 外注スタッフテストデータを作成
 */
function createTestSubcontractorStaff() {
  console.log('外注スタッフ作成中...');

  const staffList = [
    // ファーストG のスタッフ
    {
      staff_id: 'stf_sub_001',
      name: 'ファーストG外注',
      name_kana: 'ファーストジーガイチュウ',
      staff_type: 'subcontract',
      subcontractor_id: 'sub_test_001',
      phone: '090-1111-0001',
      wage_unit_price_basic: 15000,
      wage_unit_price_tobi: 18000,
      wage_unit_price_age: 16000,
      wage_unit_price_half: 8000,
      is_active: true
    },
    // ジール のスタッフ
    {
      staff_id: 'stf_sub_002',
      name: 'ジール外注A',
      name_kana: 'ジールガイチュウエー',
      staff_type: 'subcontract',
      subcontractor_id: 'sub_test_002',
      phone: '090-2222-0001',
      wage_unit_price_basic: 14000,
      wage_unit_price_tobi: 17000,
      wage_unit_price_age: 15000,
      wage_unit_price_half: 7500,
      is_active: true
    },
    {
      staff_id: 'stf_sub_003',
      name: 'ジール外注B',
      name_kana: 'ジールガイチュウビー',
      staff_type: 'subcontract',
      subcontractor_id: 'sub_test_002',
      phone: '090-2222-0002',
      wage_unit_price_basic: 14000,
      wage_unit_price_tobi: 17000,
      wage_unit_price_age: 15000,
      wage_unit_price_half: 7500,
      is_active: true
    },
    // 三沢工業 のスタッフ
    {
      staff_id: 'stf_sub_004',
      name: '三沢外注',
      name_kana: 'ミサワガイチュウ',
      staff_type: 'subcontract',
      subcontractor_id: 'sub_test_003',
      phone: '090-3333-0001',
      wage_unit_price_basic: 16000,
      wage_unit_price_tobi: 19000,
      wage_unit_price_age: 17000,
      wage_unit_price_half: 8500,
      is_active: true
    }
  ];

  const sheet = getSheet('M_Staff');
  const now = getCurrentTimestamp();

  for (const staff of staffList) {
    // 既存チェック
    const existing = findRowById(sheet, 'staff_id', staff.staff_id);
    if (existing) {
      console.log(`外注スタッフ ${staff.name} は既に存在します`);
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
    console.log(`外注スタッフ作成: ${staff.name} (${staff.subcontractor_id})`);
  }
}

/**
 * 外注スタッフの配置テストデータを作成
 */
function createSubcontractorTestAssignments() {
  console.log('外注スタッフ配置作成中...');

  // 今日の日付を取得
  const today = new Date();
  const todayStr = Utilities.formatDate(today, 'Asia/Tokyo', 'yyyy-MM-dd');

  // 今日以前の案件を取得（work_date_to でフィルタ）
  const jobs = JobRepository.search({ work_date_to: todayStr, sort_order: 'asc' });

  if (jobs.length === 0) {
    console.log('今日以前の案件がありません。先にcreateTestJobs()を実行してください。');
    return;
  }

  // 今日以前の案件から最新6件を使用（外注スタッフ4名分）
  const targetJobs = jobs.slice(-Math.min(6, jobs.length));
  console.log(`対象案件: ${targetJobs.length}件 (${targetJobs.map(j => j.work_date).join(', ')})`);

  const subStaffIds = ['stf_sub_001', 'stf_sub_002', 'stf_sub_003', 'stf_sub_004'];
  const wageRates = {
    'stf_sub_001': 18000,  // ファーストG
    'stf_sub_002': 17000,  // ジールA
    'stf_sub_003': 17000,  // ジールB
    'stf_sub_004': 19000   // 三沢
  };

  let created = 0;

  for (let i = 0; i < targetJobs.length; i++) {
    const job = targetJobs[i];
    console.log(`案件処理中: ${job.site_name} (${job.work_date})`);

    // 各案件に1〜2名の外注スタッフを配置（ローテーション）
    const startIdx = i % subStaffIds.length;
    const staffForJob = [subStaffIds[startIdx]];
    if (i % 2 === 0 && subStaffIds.length > 1) {
      staffForJob.push(subStaffIds[(startIdx + 1) % subStaffIds.length]);
    }

    for (const staffId of staffForJob) {
      // 既存配置チェック
      const existingAssignments = AssignmentRepository.findByJobId(job.job_id);
      const alreadyAssigned = existingAssignments.some(a => a.staff_id === staffId && !a.is_deleted);

      if (alreadyAssigned) {
        console.log(`スキップ（既存）: ${job.site_name} - ${staffId}`);
        continue;
      }

      // AssignmentRepositoryを直接使用して配置を作成
      const assignment = {
        job_id: job.job_id,
        staff_id: staffId,
        status: 'ASSIGNED',
        wage_rate: wageRates[staffId] || 15000,
        transport_area: '23ku_inner',
        transport_amount: 500,
        transport_is_manual: false
      };

      try {
        const result = AssignmentRepository.insert(assignment);
        if (result && result.assignment_id) {
          console.log(`配置作成: ${job.site_name} - ${staffId}`);
          created++;
        }
      } catch (e) {
        console.log(`配置エラー: ${job.site_name} - ${staffId}: ${e.message}`);
      }
    }
  }

  console.log(`外注スタッフ配置作成完了: ${created}件`);
}

/**
 * 外注費データのデバッグ
 * GASエディタから debugSubcontractorData() を実行
 */
function debugSubcontractorData() {
  console.log('=== 外注費データデバッグ ===');

  // 1. 外注先を確認
  const subs = SubcontractorRepository.search({ is_active: true });
  console.log(`外注先数: ${subs.length}`);
  subs.forEach(s => console.log(`  - ${s.subcontractor_id}: ${s.company_name}`));

  // 2. 外注スタッフを確認
  const staff = StaffRepository.search({ staff_type: 'subcontract' });
  console.log(`外注スタッフ数: ${staff.length}`);
  staff.forEach(s => console.log(`  - ${s.staff_id}: ${s.name} (subcontractor_id: ${s.subcontractor_id})`));

  // 3. 配置を確認（外注スタッフのみ）
  const staffIds = staff.map(s => s.staff_id);
  const allAssignments = AssignmentRepository.search({ status: 'ASSIGNED' });
  const subAssignments = allAssignments.filter(a => staffIds.includes(a.staff_id) && !a.is_deleted && !a.payout_id);
  console.log(`外注スタッフの未払い配置数: ${subAssignments.length}`);

  // 4. 案件の日付を確認
  if (subAssignments.length > 0) {
    const jobIds = [...new Set(subAssignments.map(a => a.job_id))];
    console.log(`関連Job IDs: ${jobIds.join(', ')}`);

    for (const jobId of jobIds) {
      const job = JobRepository.findById(jobId);
      if (job) {
        console.log(`  Job ${jobId}: ${job.site_name}, work_date=${job.work_date}`);
      } else {
        console.log(`  Job ${jobId}: NOT FOUND`);
      }
    }
  }

  // 5. PayoutService で計算してみる
  console.log('\n=== PayoutService計算テスト ===');
  const endDate = '2026-01-26';
  const result = PayoutService.getUnpaidSubcontractorList(endDate);
  console.log(`getUnpaidSubcontractorList結果: ${result.length}件`);
  result.forEach(r => console.log(`  - ${r.companyName}: ${r.unpaidCount}件, ¥${r.estimatedAmount}`));
}

/**
 * P2-8: 諸経費請求機能テスト用データを作成（改良版）
 * 複数日付・複数現場・複数配置のテストケースを作成
 * GASエディタから createTransportExpenseTestData() を実行
 */
function createTransportExpenseTestData() {
  console.log('=== 諸経費請求テストデータ作成開始 ===');

  const now = getCurrentTimestamp();
  const user = 'test';

  // 1. 顧客に諸経費請求フラグを設定
  console.log('\n--- 顧客に諸経費請求フラグを設定 ---');
  const customerSheet = getSheet('M_Customers');
  const customerHeaders = getHeaders(customerSheet);

  const hasFeeCol = customerHeaders.indexOf('has_transport_fee');
  if (hasFeeCol === -1) {
    console.log('ERROR: has_transport_fee カラムが見つかりません');
    console.log('先に migrateAddTransportExpenseColumns() を実行してください');
    return;
  }

  const testCustomerId = 'cus_test_001';
  const customerRow = findRowById(customerSheet, 'customer_id', testCustomerId);
  if (customerRow) {
    customerSheet.getRange(customerRow, hasFeeCol + 1).setValue(true);
    console.log(`顧客 ${testCustomerId} に has_transport_fee=true を設定しました`);
  } else {
    console.log(`顧客 ${testCustomerId} が見つかりません。createTestData() を先に実行してください`);
    return;
  }

  // 2. 既存の諸経費テスト案件・配置を削除
  console.log('\n--- 既存テストデータを削除 ---');
  cleanupTransportExpenseTestData();

  // 3. テスト案件を複数作成（異なる日付・現場）
  console.log('\n--- 諸経費テスト用案件を作成 ---');

  const formatDate = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  // 日付を計算（今月6日〜10日）
  const baseDate = new Date();
  baseDate.setDate(6);  // 今月6日

  const jobs = [
    // 案件1: 1月6日 横須賀（2人配置）
    {
      job_id: 'job_expense_001',
      site_name: '横須賀市野比',
      work_date: formatDate(baseDate),
      start_time: '08:30',
      required_count: 2,
      assignments: [
        { staff_id: 'stf_test_001', transport_station: 'YRP野比駅', transport_amount: 2000, transport_has_bus: false },
        { staff_id: 'stf_test_002', transport_station: 'YRP野比駅', transport_amount: 2000, transport_has_bus: false }
      ]
    },
    // 案件2: 1月7日 大田区（3人配置）
    {
      job_id: 'job_expense_002',
      site_name: '大田区池上',
      work_date: formatDate(new Date(baseDate.getTime() + 86400000)),  // +1日
      start_time: '08:00',
      required_count: 3,
      assignments: [
        { staff_id: 'stf_test_001', transport_area: '23ku_inner', transport_amount: 727, transport_station: '', transport_has_bus: false },
        { staff_id: 'stf_test_002', transport_area: '23ku_inner', transport_amount: 727, transport_station: '', transport_has_bus: false },
        { staff_id: 'stf_test_003', transport_area: '23ku_inner', transport_amount: 727, transport_station: '', transport_has_bus: false }
      ]
    },
    // 案件3: 1月8日 町田（1人配置）
    {
      job_id: 'job_expense_003',
      site_name: '町田市山崎町',
      work_date: formatDate(new Date(baseDate.getTime() + 86400000 * 2)),  // +2日
      start_time: '08:00',
      required_count: 1,
      assignments: [
        { staff_id: 'stf_test_001', transport_station: '町田駅', transport_amount: 1655, transport_has_bus: true }
      ]
    },
    // 案件4: 1月8日 杉並（1人配置）- 同日別現場
    {
      job_id: 'job_expense_004',
      site_name: '杉並区久我山',
      work_date: formatDate(new Date(baseDate.getTime() + 86400000 * 2)),  // +2日（同日）
      start_time: '13:00',
      required_count: 1,
      assignments: [
        { staff_id: 'stf_test_002', transport_area: '23ku_inner', transport_amount: 727, transport_station: '', transport_has_bus: false }
      ]
    }
  ];

  let assignmentSeq = 1;

  for (const jobData of jobs) {
    // 案件作成
    const job = {
      job_id: jobData.job_id,
      customer_id: testCustomerId,
      site_name: jobData.site_name,
      site_address: '東京都テスト住所',
      work_date: jobData.work_date,
      time_slot: 'am',
      start_time: jobData.start_time,
      required_count: jobData.required_count,
      pay_unit: 'halfday',
      status: 'pending',
      created_at: now,
      created_by: user,
      updated_at: now,
      updated_by: user,
      is_deleted: false
    };
    insertRecord('T_Jobs', job);
    console.log(`案件作成: ${jobData.work_date} ${jobData.site_name} (${jobData.assignments.length}人)`);

    // 配置作成
    for (const asgData of jobData.assignments) {
      const assignment = {
        assignment_id: `asg_expense_${String(assignmentSeq++).padStart(3, '0')}`,
        job_id: jobData.job_id,
        staff_id: asgData.staff_id,
        worker_type: 'STAFF',
        display_time_slot: 'am',
        pay_unit: 'halfday',
        invoice_unit: 'halfday',
        transport_area: asgData.transport_area || '',
        transport_amount: asgData.transport_amount,
        transport_is_manual: true,
        transport_station: asgData.transport_station || '',
        transport_has_bus: asgData.transport_has_bus || false,
        status: 'ASSIGNED',
        created_at: now,
        created_by: user,
        updated_at: now,
        updated_by: user,
        is_deleted: false
      };
      insertRecord('T_JobAssignments', assignment);

      const note = asgData.transport_station
        ? `${asgData.transport_station}${asgData.transport_has_bus ? '（バス）' : ''}`
        : (asgData.transport_area || '');
      console.log(`  配置: ${asgData.staff_id} - ¥${asgData.transport_amount} (${note})`);
    }
  }

  console.log('\n=== 諸経費請求テストデータ作成完了 ===');
  console.log('');
  console.log('作成したテストデータ:');
  console.log('  1月6日  横須賀市野比   2人 ¥2,000×2 (YRP野比駅)');
  console.log('  1月7日  大田区池上     3人 ¥727×3  (23区内)');
  console.log('  1月8日  町田市山崎町   1人 ¥1,655  (町田駅・バス)');
  console.log('  1月8日  杉並区久我山   1人 ¥727    (23区内)');
  console.log('');
  console.log('期待される請求書出力:');
  console.log('  日付    | 現場名        | 品目          | 備考        | 数量 | 単価   | 金額');
  console.log('  1月6日  | 横須賀市野比  | 作業員（ハーフ）| 08:30      | 1    | 12,000 | 12,000');
  console.log('          |               | 諸経費        | YRP野比駅   | 1    | 2,000  | 2,000');
  console.log('          |               | 作業員（ハーフ）| 08:30      | 1    | 12,000 | 12,000');
  console.log('          |               | 諸経費        | YRP野比駅   | 1    | 2,000  | 2,000');
  console.log('  1月7日  | 大田区池上    | 作業員（ハーフ）| 08:00      | 1    | 12,000 | 12,000');
  console.log('  ...（以下略）');
}

/**
 * P2-8: format2用の諸経費テストデータを作成
 * GASエディタから createTransportExpenseTestDataFormat2() を実行
 */
function createTransportExpenseTestDataFormat2() {
  createTransportExpenseTestDataWithFormat('format2', 'cus_test_002');
}

/**
 * P2-8: format1用の諸経費テストデータを作成（明示的に呼び出し可能）
 * GASエディタから createTransportExpenseTestDataFormat1() を実行
 */
function createTransportExpenseTestDataFormat1() {
  createTransportExpenseTestDataWithFormat('format1', 'cus_test_001');
}

/**
 * P2-8: 諸経費テストデータを指定フォーマット・顧客で作成
 * @param {string} invoiceFormat - 'format1' | 'format2'
 * @param {string} customerId - 顧客ID
 */
function createTransportExpenseTestDataWithFormat(invoiceFormat, customerId) {
  console.log(`=== 諸経費請求テストデータ作成開始 (${invoiceFormat}) ===`);

  const now = getCurrentTimestamp();
  const user = 'test';

  // 1. 顧客の設定を更新
  console.log('\n--- 顧客設定を更新 ---');
  const customerSheet = getSheet('M_Customers');
  const customerHeaders = getHeaders(customerSheet);

  const hasFeeCol = customerHeaders.indexOf('has_transport_fee');
  const formatCol = customerHeaders.indexOf('invoice_format');
  if (hasFeeCol === -1) {
    console.log('ERROR: has_transport_fee カラムが見つかりません');
    console.log('先に migrateAddTransportExpenseColumns() を実行してください');
    return;
  }

  const customerRow = findRowById(customerSheet, 'customer_id', customerId);
  if (customerRow) {
    customerSheet.getRange(customerRow, hasFeeCol + 1).setValue(true);
    if (formatCol !== -1) {
      customerSheet.getRange(customerRow, formatCol + 1).setValue(invoiceFormat);
    }
    console.log(`顧客 ${customerId} に has_transport_fee=true, invoice_format=${invoiceFormat} を設定しました`);
  } else {
    console.log(`顧客 ${customerId} が見つかりません。createTestData() を先に実行してください`);
    return;
  }

  // 2. 既存テストデータを削除
  console.log('\n--- 既存テストデータを削除 ---');
  cleanupTransportExpenseTestDataForCustomer(customerId);

  // 3. テスト案件を作成
  console.log('\n--- 諸経費テスト用案件を作成 ---');

  const formatDate = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const baseDate = new Date();
  baseDate.setDate(6);

  // format2用には発注Noと営業所も追加
  const jobPrefix = customerId === 'cus_test_002' ? 'job_expense_f2_' : 'job_expense_';
  const asgPrefix = customerId === 'cus_test_002' ? 'asg_expense_f2_' : 'asg_expense_';

  const jobs = [
    {
      job_id: jobPrefix + '001',
      site_name: '横須賀市野比',
      work_date: formatDate(baseDate),
      start_time: '08:30',
      order_number: 'ORD-2026-001',
      branch_office: '横浜営業所',
      required_count: 2,
      assignments: [
        { staff_id: 'stf_test_001', transport_station: 'YRP野比駅', transport_amount: 2000, transport_has_bus: false },
        { staff_id: 'stf_test_002', transport_station: 'YRP野比駅', transport_amount: 2000, transport_has_bus: false }
      ]
    },
    {
      job_id: jobPrefix + '002',
      site_name: '大田区池上',
      work_date: formatDate(new Date(baseDate.getTime() + 86400000)),
      start_time: '08:00',
      order_number: 'ORD-2026-002',
      branch_office: '東京営業所',
      required_count: 3,
      assignments: [
        { staff_id: 'stf_test_001', transport_area: '23ku_inner', transport_amount: 727, transport_station: '', transport_has_bus: false },
        { staff_id: 'stf_test_002', transport_area: '23ku_inner', transport_amount: 727, transport_station: '', transport_has_bus: false },
        { staff_id: 'stf_test_003', transport_area: '23ku_inner', transport_amount: 727, transport_station: '', transport_has_bus: false }
      ]
    },
    {
      job_id: jobPrefix + '003',
      site_name: '町田市山崎町',
      work_date: formatDate(new Date(baseDate.getTime() + 86400000 * 2)),
      start_time: '15:00',
      order_number: 'ORD-2026-003',
      branch_office: '町田営業所',
      required_count: 1,
      assignments: [
        { staff_id: 'stf_test_001', transport_station: '町田駅', transport_amount: 1655, transport_has_bus: true }
      ]
    },
    {
      job_id: jobPrefix + '004',
      site_name: '杉並区久我山',
      work_date: formatDate(new Date(baseDate.getTime() + 86400000 * 2)),
      start_time: '20:00',
      order_number: 'ORD-2026-004',
      branch_office: '東京営業所',
      required_count: 1,
      assignments: [
        { staff_id: 'stf_test_002', transport_area: '23ku_inner', transport_amount: 727, transport_station: '', transport_has_bus: false }
      ]
    }
  ];

  let assignmentSeq = 1;
  const jobSheet = getSheet('T_Jobs');
  const jobHeaders = getHeaders(jobSheet);
  const asgSheet = getSheet('T_JobAssignments');
  const asgHeaders = getHeaders(asgSheet);

  for (const jobData of jobs) {
    // 案件作成
    const job = {
      job_id: jobData.job_id,
      customer_id: customerId,
      site_name: jobData.site_name,
      site_address: '東京都テスト住所',
      work_date: jobData.work_date,
      start_time: jobData.start_time,
      order_number: jobData.order_number || '',
      branch_office: jobData.branch_office || '',
      job_type: 'tobi',
      status: 'confirmed',
      required_count: jobData.required_count,
      pay_unit: 'halfday',
      notes: `${invoiceFormat}テスト用案件`,
      created_at: now,
      created_by: user,
      updated_at: now,
      is_deleted: false
    };

    const jobRow = jobHeaders.map(h => job[h] !== undefined ? job[h] : '');
    jobSheet.appendRow(jobRow);
    console.log(`  案件作成: ${jobData.job_id} - ${jobData.site_name}`);

    // 配置作成
    for (const asgData of jobData.assignments) {
      const asg = {
        assignment_id: asgPrefix + String(assignmentSeq++).padStart(3, '0'),
        job_id: jobData.job_id,
        staff_id: asgData.staff_id,
        status: 'CONFIRMED',
        invoice_unit: 'halfday',
        invoice_rate: 12000,
        transport_area: asgData.transport_area || '',
        transport_amount: asgData.transport_amount || 0,
        transport_is_manual: true,
        transport_station: asgData.transport_station || '',
        transport_has_bus: asgData.transport_has_bus || false,
        created_at: now,
        created_by: user,
        updated_at: now,
        is_deleted: false
      };

      const asgRow = asgHeaders.map(h => asg[h] !== undefined ? asg[h] : '');
      asgSheet.appendRow(asgRow);
    }
  }

  console.log(`\n=== ${invoiceFormat}用テストデータ作成完了 ===`);
  console.log(`顧客ID: ${customerId}`);
  console.log(`案件数: ${jobs.length}`);
  console.log(`\n請求書管理画面で該当顧客を選択して請求書を生成してください`);
}

/**
 * 指定顧客の諸経費テストデータを削除
 */
function cleanupTransportExpenseTestDataForCustomer(customerId) {
  const jobSheet = getSheet('T_Jobs');
  const jobData = jobSheet.getDataRange().getValues();
  const jobIdCol = jobData[0].indexOf('job_id');
  const customerIdCol = jobData[0].indexOf('customer_id');

  // 削除対象のjob_idを収集
  const targetJobIds = [];
  for (let i = 1; i < jobData.length; i++) {
    const jobId = jobData[i][jobIdCol];
    const custId = jobData[i][customerIdCol];
    if (custId === customerId && jobId && (jobId.includes('expense') || jobId.includes('transport'))) {
      targetJobIds.push(jobId);
    }
  }

  // 配置削除
  const asgSheet = getSheet('T_JobAssignments');
  const asgData = asgSheet.getDataRange().getValues();
  const asgJobIdCol = asgData[0].indexOf('job_id');
  for (let i = asgData.length - 1; i >= 1; i--) {
    const jobId = asgData[i][asgJobIdCol];
    if (targetJobIds.includes(jobId)) {
      asgSheet.deleteRow(i + 1);
    }
  }

  // 案件削除
  for (let i = jobData.length - 1; i >= 1; i--) {
    const jobId = jobData[i][jobIdCol];
    if (targetJobIds.includes(jobId)) {
      jobSheet.deleteRow(i + 1);
    }
  }

  console.log(`顧客 ${customerId} の諸経費テストデータを削除しました（${targetJobIds.length}件）`);
}

/**
 * 諸経費テストデータを削除
 */
function cleanupTransportExpenseTestData() {
  // 配置削除
  const asgSheet = getSheet('T_JobAssignments');
  const asgData = asgSheet.getDataRange().getValues();
  const asgIdCol = asgData[0].indexOf('assignment_id');
  for (let i = asgData.length - 1; i >= 1; i--) {
    const asgId = asgData[i][asgIdCol];
    if (asgId && (asgId.startsWith('asg_expense_') || asgId.startsWith('asg_transport_'))) {
      asgSheet.deleteRow(i + 1);
    }
  }

  // 案件削除
  const jobSheet = getSheet('T_Jobs');
  const jobData = jobSheet.getDataRange().getValues();
  const jobIdCol = jobData[0].indexOf('job_id');
  for (let i = jobData.length - 1; i >= 1; i--) {
    const jobId = jobData[i][jobIdCol];
    if (jobId && (jobId.startsWith('job_expense_') || jobId.startsWith('job_transport_'))) {
      jobSheet.deleteRow(i + 1);
    }
  }

  console.log('既存の諸経費テストデータを削除しました');
}
