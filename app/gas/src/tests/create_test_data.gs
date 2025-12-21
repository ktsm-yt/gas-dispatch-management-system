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
      daily_rate_tobi: 15000,
      daily_rate_age: 13000,
      daily_rate_tobiage: 16000,
      daily_rate_half: 8000,
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
      daily_rate_tobi: 14000,
      daily_rate_age: 12000,
      daily_rate_tobiage: 15000,
      daily_rate_half: 7000,
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
      daily_rate_tobi: 16000,
      daily_rate_age: 14000,
      daily_rate_tobiage: 17000,
      daily_rate_half: 8500,
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
      daily_rate_tobi: 13000,
      daily_rate_age: 11000,
      daily_rate_tobiage: 14000,
      daily_rate_half: 6500,
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
      daily_rate_tobi: 17000,
      daily_rate_age: 15000,
      daily_rate_tobiage: 18000,
      daily_rate_half: 9000,
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
      job_type: '鳶',
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
      job_type: '揚げ',
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
      job_type: '揚げ',
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
      job_type: '鳶揚げ',
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
      job_type: '鳶',
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
      job_type: '揚げ',
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
