/**
 * 大量テストデータ生成スクリプト
 *
 * パフォーマンステスト・ユニットテスト用
 * GASエディタから createBulkTestData() を実行してください
 *
 * 生成規模:
 * - 顧客: 50件
 * - スタッフ: 70名
 * - 案件: 500件（10日分 × 50件/日）
 * - 配置: 約1000件
 */

// ============================================================
// 設定
// ============================================================

const BULK_TEST_CONFIG = {
  // 生成数
  CUSTOMER_COUNT: 50,
  STAFF_COUNT: 70,
  DAYS_TO_GENERATE: 10,      // 何日分の案件を作るか
  JOBS_PER_DAY: 50,          // 1日あたりの案件数

  // プレフィックス（削除時の識別用）
  PREFIX: 'bulk_',

  // マスターデータ
  COMPANY_SUFFIXES: ['建設', '工務店', 'ハウス', '住宅', '工業', 'ホーム', '建築', '設計'],
  FIRST_NAMES: ['太郎', '一郎', '健太', '大輔', '翔太', '拓也', '雄一', '誠', '隆', '浩二',
                '美咲', '花子', '陽子', '由美', '恵子', '直美', '智子', '明美', '裕子', '和子'],
  LAST_NAMES: ['佐藤', '鈴木', '高橋', '田中', '伊藤', '渡辺', '山本', '中村', '小林', '加藤',
               '吉田', '山田', '佐々木', '山口', '松本', '井上', '木村', '林', '斎藤', '清水'],
  AREAS: ['千代田区', '中央区', '港区', '新宿区', '文京区', '台東区', '墨田区', '江東区',
          '品川区', '目黒区', '大田区', '世田谷区', '渋谷区', '中野区', '杉並区', '豊島区',
          '北区', '荒川区', '板橋区', '練馬区', '足立区', '葛飾区', '江戸川区'],
  SITE_TYPES: ['マンション', 'ビル', '住宅', 'アパート', '倉庫', '工場', '店舗', '病院', '学校', 'オフィス'],
  SITE_ACTIONS: ['新築工事', '改修工事', '解体工事', '増築工事', '内装工事', '外装工事', '設備工事']
};

// ============================================================
// メイン関数
// ============================================================

/**
 * 大量テストデータを作成
 */
function createBulkTestData() {
  const startTime = Date.now();
  console.log('=== 大量テストデータ作成開始 ===');
  console.log(`設定: 顧客${BULK_TEST_CONFIG.CUSTOMER_COUNT}件, スタッフ${BULK_TEST_CONFIG.STAFF_COUNT}名, 案件${BULK_TEST_CONFIG.DAYS_TO_GENERATE * BULK_TEST_CONFIG.JOBS_PER_DAY}件`);

  const results = {
    customers: 0,
    staff: 0,
    jobs: 0,
    assignments: 0
  };

  // 1. 顧客マスター
  console.log('\n--- 顧客マスター作成 ---');
  results.customers = createBulkCustomers();

  // 2. スタッフマスター
  console.log('\n--- スタッフマスター作成 ---');
  results.staff = createBulkStaff();

  // 3. 案件データ
  console.log('\n--- 案件データ作成 ---');
  results.jobs = createBulkJobs();

  // 4. 配置データ
  console.log('\n--- 配置データ作成 ---');
  results.assignments = createBulkAssignments();

  // 5. 案件ステータス修正（配置数に応じて）
  console.log('\n--- 案件ステータス修正 ---');
  results.statusFixed = fixBulkJobStatuses();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log('\n=== 大量テストデータ作成完了 ===');
  console.log(`作成数: 顧客${results.customers}, スタッフ${results.staff}, 案件${results.jobs}, 配置${results.assignments}, ステータス修正${results.statusFixed}`);
  console.log(`所要時間: ${elapsed}秒`);

  return results;
}

/**
 * 大量テストデータを削除
 */
function deleteBulkTestData() {
  const startTime = Date.now();
  console.log('=== 大量テストデータ削除開始 ===');

  const prefix = BULK_TEST_CONFIG.PREFIX;
  let deleted = { customers: 0, staff: 0, jobs: 0, assignments: 0 };

  // 顧客フォルダを削除（テスト顧客のみ）
  console.log('顧客フォルダ削除中...');
  const folderResult = deleteBulkCustomerFolders_();
  deleted.customerFolders = folderResult.deletedFolders;
  deleted.customerFolderFiles = folderResult.deletedFiles;

  // 配置を削除
  console.log('配置データ削除中...');
  deleted.assignments = hardDeleteByColumnPrefix_({
    tableName: 'T_JobAssignments',
    matchColumn: 'staff_id',
    matchPrefix: 'stf_' + prefix
  });
  console.log(`配置削除: ${deleted.assignments}件`);

  // 案件を削除
  console.log('案件データ削除中...');
  deleted.jobs = hardDeleteByColumnPrefix_({
    tableName: 'T_Jobs',
    matchColumn: 'customer_id',
    matchPrefix: 'cus_' + prefix
  });
  console.log(`案件削除: ${deleted.jobs}件`);

  // 請求データを削除（請求書・明細）
  console.log('請求データ削除中...');
  const invoiceDeleted = hardDeleteInvoiceDataByCustomerPrefix_('cus_' + prefix);
  deleted.invoices = invoiceDeleted.invoices;
  deleted.invoiceLines = invoiceDeleted.lines;
  console.log(`請求書削除: ${deleted.invoices}件, 請求明細削除: ${deleted.invoiceLines}件`);

  // スタッフを論理削除
  console.log('スタッフマスター削除中...');
  deleted.staff = hardDeleteByColumnPrefix_({
    tableName: 'M_Staff',
    matchColumn: 'staff_id',
    matchPrefix: 'stf_' + prefix
  });
  console.log(`スタッフ削除: ${deleted.staff}件`);

  // 顧客を論理削除
  console.log('顧客マスター削除中...');
  deleted.customers = hardDeleteByColumnPrefix_({
    tableName: 'M_Customers',
    matchColumn: 'customer_id',
    matchPrefix: 'cus_' + prefix
  });
  console.log(`顧客削除: ${deleted.customers}件`);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log('\n=== 大量テストデータ削除完了 ===');
  console.log(`削除数: 顧客${deleted.customers}, スタッフ${deleted.staff}, 案件${deleted.jobs}, 配置${deleted.assignments}, 請求書${deleted.invoices || 0}, 請求明細${deleted.invoiceLines || 0}, フォルダ${deleted.customerFolders || 0}, フォルダ内ファイル${deleted.customerFolderFiles || 0}`);
  console.log(`所要時間: ${elapsed}秒`);

  return deleted;
}

// ============================================================
// Driveフォルダ削除（テスト顧客のみ）
// ============================================================

function deleteBulkCustomerFolders_() {
  const result = { deletedFolders: 0, deletedFiles: 0, skipped: 0, errors: [] };
  const prefix = BULK_TEST_CONFIG.PREFIX;

  const props = PropertiesService.getScriptProperties();
  const parentId = props.getProperty('CUSTOMER_FOLDERS_PARENT_ID');
  if (!parentId) {
    console.log('顧客フォルダ親IDが未設定のため、フォルダ削除をスキップします。');
    return result;
  }

  const customers = getAllRecords('M_Customers', { includeDeleted: true }).filter(c =>
    c.customer_id && c.customer_id.startsWith('cus_' + prefix) && c.folder_id
  );

  for (const customer of customers) {
    try {
      if (!isChildFolder_(customer.folder_id, parentId)) {
        result.skipped++;
        continue;
      }
      deleteFolderRecursively_(customer.folder_id, result);
    } catch (e) {
      result.errors.push({
        customerId: customer.customer_id,
        folderId: customer.folder_id,
        error: e.message
      });
      console.log(`フォルダ削除エラー: ${customer.customer_id} (${customer.folder_id}) - ${e.message}`);
    }
  }

  console.log(`顧客フォルダ削除完了: ${result.deletedFolders}フォルダ, ${result.deletedFiles}ファイル, skipped ${result.skipped}, errors ${result.errors.length}`);
  return result;
}

function isChildFolder_(folderId, parentId) {
  const folder = DriveApp.getFolderById(folderId);
  const parents = folder.getParents();
  while (parents.hasNext()) {
    if (parents.next().getId() === parentId) {
      return true;
    }
  }
  return false;
}

function deleteFolderRecursively_(folderId, stats) {
  let pageToken;
  do {
    const resp = Drive.Files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'files(id,mimeType),nextPageToken',
      pageSize: 1000,
      pageToken: pageToken
    });
    const items = resp.files || [];

    for (const item of items) {
      if (item.mimeType === 'application/vnd.google-apps.folder') {
        deleteFolderRecursively_(item.id, stats);
      } else {
        Drive.Files.delete(item.id);
        stats.deletedFiles++;
      }
    }

    pageToken = resp.nextPageToken;
  } while (pageToken);

  Drive.Files.delete(folderId);
  stats.deletedFolders++;
}

// ============================================================
// 顧客生成（バッチ最適化版）
// ============================================================

function createBulkCustomers() {
  const count = BULK_TEST_CONFIG.CUSTOMER_COUNT;
  const prefix = BULK_TEST_CONFIG.PREFIX;
  const now = getCurrentTimestamp();

  const departments = ['工事部', '建設部', '営業部', '総務部', '経理部', ''];
  const honorifics = ['様', '御中'];

  // 既存ID/顧客名を一括取得
  const existingCustomers = getAllRecords('M_Customers', { includeDeleted: true });
  const existingIds = new Set(existingCustomers.map(c => c.customer_id));
  const existingNames = new Set(existingCustomers.map(c => c.company_name).filter(Boolean));

  // 新規レコードを収集
  const toInsert = [];

  for (let i = 1; i <= count; i++) {
    const customerId = `cus_${prefix}${String(i).padStart(3, '0')}`;

    if (existingIds.has(customerId)) {
      continue;
    }

    const lastName = randomPick(BULK_TEST_CONFIG.LAST_NAMES);
    const baseCompanyName = lastName + randomPick(BULK_TEST_CONFIG.COMPANY_SUFFIXES);
    const companyName = ensureUniqueCompanyName_(baseCompanyName, existingNames);
    existingNames.add(companyName);
    const contactName = randomPick(BULK_TEST_CONFIG.LAST_NAMES) + randomPick(BULK_TEST_CONFIG.FIRST_NAMES);
    const area = randomPick(BULK_TEST_CONFIG.AREAS);
    const invoiceFormat = ['format1', 'format2', 'format3', 'atamagami'][i % 4];

    toInsert.push({
      customer_id: customerId,
      company_name: companyName,
      branch_name: i % 5 === 0 ? randomPick(['本社', '東京支店', '横浜支店', '埼玉支店', '千葉営業所']) : '',
      department_name: randomPick(departments),
      contact_name: contactName,
      honorific: randomPick(honorifics),
      postal_code: `${100 + (i % 100)}-${String(i).padStart(4, '0')}`,
      address: `東京都${area}${Math.floor(Math.random() * 9) + 1}-${Math.floor(Math.random() * 99) + 1}-${Math.floor(Math.random() * 99) + 1}`,
      phone: `03-${String(1000 + i).padStart(4, '0')}-${String(1000 + (i * 7) % 10000).padStart(4, '0')}`,
      fax: i % 3 === 0 ? `03-${String(1000 + i).padStart(4, '0')}-${String(2000 + (i * 7) % 10000).padStart(4, '0')}` : '',
      email: i % 2 === 0 ? `contact${i}@${lastName.toLowerCase()}.example.com` : '',
      unit_price_tobi: 23000 + (i % 10) * 500,
      unit_price_age: 18000 + (i % 10) * 500,
      unit_price_tobiage: 26000 + (i % 10) * 500,
      unit_price_half: 11000 + (i % 10) * 200,
      closing_day: [25, 31, 15, 20][i % 4],
      payment_month_offset: [1, 2][i % 2],
      payment_day: [5, 10, 15, 25, 31][i % 5],
      invoice_format: invoiceFormat,
      tax_rate: 10,
      expense_rate: invoiceFormat === 'atamagami' ? [5, 8, 10][i % 3] : 0,
      shipper_name: i % 4 === 0 ? `${companyName} 荷主部門` : '',
      customer_code: `C${String(i).padStart(5, '0')}`,
      notes: i % 10 === 0 ? `テスト顧客${i}の備考` : '',
      is_active: true,
      created_at: now,
      created_by: 'bulk_test',
      updated_at: now,
      updated_by: 'bulk_test',
      is_deleted: false
    });
  }

  // 一括挿入
  if (toInsert.length > 0) {
    insertRecords('M_Customers', toInsert);
    console.log(`顧客作成完了: ${toInsert.length}件（バッチ挿入）`);
  } else {
    console.log('顧客作成: 新規データなし');
  }

  return toInsert.length;
}

function ensureUniqueCompanyName_(baseName, existingNames) {
  let name = baseName;
  let counter = 1;
  while (existingNames.has(name)) {
    name = `${baseName}-${String(counter).padStart(2, '0')}`;
    counter++;
  }
  return name;
}

// ============================================================
// スタッフ生成（バッチ最適化版）
// ============================================================

function createBulkStaff() {
  const count = BULK_TEST_CONFIG.STAFF_COUNT;
  const prefix = BULK_TEST_CONFIG.PREFIX;
  const now = getCurrentTimestamp();

  const skills = ['鳶', '揚げ', '鳶,揚げ', '鳶,揚げ,鳶揚げ'];
  const bloodTypes = ['A', 'B', 'O', 'AB'];
  const jobTitles = ['とび工', '荷揚工', 'とび工・荷揚工'];
  const healthInsuranceTypes = ['健保組合', '協会けんぽ', '建設国保', '国保'];
  const pensionTypes = ['厚生年金', '国民年金'];

  // NG顧客用のテスト顧客ID（一部のスタッフにNG設定）
  const ngCustomerCandidates = [
    `cus_${prefix}001`,
    `cus_${prefix}002`,
    `cus_${prefix}003`
  ];

  // 既存IDを一括取得
  const existingStaff = getAllRecords('M_Staff', { includeDeleted: true });
  const existingIds = new Set(existingStaff.map(s => s.staff_id));

  // 新規レコードを収集
  const toInsert = [];

  for (let i = 1; i <= count; i++) {
    const staffId = `stf_${prefix}${String(i).padStart(3, '0')}`;

    if (existingIds.has(staffId)) {
      continue;
    }

    const lastName = randomPick(BULK_TEST_CONFIG.LAST_NAMES);
    const firstName = randomPick(BULK_TEST_CONFIG.FIRST_NAMES);
    const name = lastName + firstName;
    const area = randomPick(BULK_TEST_CONFIG.AREAS);
    const isSubcontract = i % 5 === 0;
    const employmentType = isSubcontract ? 'sole_proprietor' : (i % 3 === 0 ? 'sole_proprietor' : 'employee');

    // 10%のスタッフにNG顧客を設定
    const ngCustomers = i % 10 === 0 ? ngCustomerCandidates.slice(0, (i % 3) + 1).join(',') : '';

    toInsert.push({
      staff_id: staffId,
      name: name,
      name_kana: toKatakana(lastName) + toKatakana(firstName),
      phone: `090-${String(1000 + i).padStart(4, '0')}-${String(1000 + (i * 3) % 10000).padStart(4, '0')}`,
      line_id: i % 2 === 0 ? `line_${lastName.toLowerCase()}${i}` : '',
      postal_code: `${100 + (i % 100)}-${String(i + 1000).padStart(4, '0')}`,
      address: `東京都${area}${Math.floor(Math.random() * 9) + 1}-${Math.floor(Math.random() * 99) + 1}`,
      has_motorbike: i % 3 === 0,
      skills: skills[i % skills.length],
      ng_customers: ngCustomers,
      daily_rate_tobi: 14000 + (i % 10) * 500,
      daily_rate_age: 12000 + (i % 10) * 500,
      daily_rate_tobiage: 15000 + (i % 10) * 500,
      daily_rate_half: 7000 + (i % 10) * 200,
      staff_type: isSubcontract ? 'subcontract' : 'regular',
      employment_type: employmentType,
      withholding_tax_applicable: employmentType === 'employee',
      notes: i % 15 === 0 ? `テストスタッフ${i}の備考` : '',
      // 安全書類用項目（20%のスタッフに設定）
      birth_date: i % 5 === 0 ? generateBirthDate(i) : '',
      gender: i % 5 === 0 ? (i % 2 === 0 ? 'male' : 'female') : '',
      blood_type: i % 5 === 0 ? randomPick(bloodTypes) : '',
      emergency_contact_name: i % 5 === 0 ? `緊急連絡先${i}` : '',
      emergency_contact_address: i % 5 === 0 ? `東京都新宿区西新宿${i}-${i + 1}` : '',
      emergency_contact_phone: i % 5 === 0 ? `03-0000-${String(i).padStart(4, '0')}` : '',
      job_title: i % 5 === 0 ? randomPick(jobTitles) : '',
      health_insurance_type: i % 5 === 0 ? randomPick(healthInsuranceTypes) : '',
      pension_type: i % 5 === 0 ? randomPick(pensionTypes) : '',
      pension_number: i % 5 === 0 ? `${String(1000 + i).padStart(4, '0')}-${String(100000 + i * 7).padStart(6, '0')}` : '',
      is_active: true,
      created_at: now,
      created_by: 'bulk_test',
      updated_at: now,
      updated_by: 'bulk_test',
      is_deleted: false
    });
  }

  // 一括挿入
  if (toInsert.length > 0) {
    insertRecords('M_Staff', toInsert);
    console.log(`スタッフ作成完了: ${toInsert.length}件（バッチ挿入）`);
  } else {
    console.log('スタッフ作成: 新規データなし');
  }

  return toInsert.length;
}

/**
 * 簡易カタカナ変換（テスト用）
 */
function toKatakana(name) {
  const kanaMap = {
    '佐藤': 'サトウ', '鈴木': 'スズキ', '高橋': 'タカハシ', '田中': 'タナカ', '伊藤': 'イトウ',
    '渡辺': 'ワタナベ', '山本': 'ヤマモト', '中村': 'ナカムラ', '小林': 'コバヤシ', '加藤': 'カトウ',
    '吉田': 'ヨシダ', '山田': 'ヤマダ', '佐々木': 'ササキ', '山口': 'ヤマグチ', '松本': 'マツモト',
    '井上': 'イノウエ', '木村': 'キムラ', '林': 'ハヤシ', '斎藤': 'サイトウ', '清水': 'シミズ',
    '太郎': 'タロウ', '一郎': 'イチロウ', '健太': 'ケンタ', '大輔': 'ダイスケ', '翔太': 'ショウタ',
    '拓也': 'タクヤ', '雄一': 'ユウイチ', '誠': 'マコト', '隆': 'タカシ', '浩二': 'コウジ',
    '美咲': 'ミサキ', '花子': 'ハナコ', '陽子': 'ヨウコ', '由美': 'ユミ', '恵子': 'ケイコ',
    '直美': 'ナオミ', '智子': 'トモコ', '明美': 'アケミ', '裕子': 'ユウコ', '和子': 'カズコ'
  };
  return kanaMap[name] || name;
}

/**
 * 生年月日生成（テスト用）
 */
function generateBirthDate(seed) {
  const year = 1970 + (seed % 30);
  const month = (seed % 12) + 1;
  const day = (seed % 28) + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// ============================================================
// 案件生成（バッチ最適化版）
// ============================================================

function createBulkJobs() {
  const daysCount = BULK_TEST_CONFIG.DAYS_TO_GENERATE;
  const jobsPerDay = BULK_TEST_CONFIG.JOBS_PER_DAY;
  const prefix = BULK_TEST_CONFIG.PREFIX;
  const now = getCurrentTimestamp();

  // 顧客リストを取得（invoice_format情報も使用）
  const customers = getAllRecords('M_Customers').filter(c =>
    c.customer_id && c.customer_id.startsWith('cus_' + prefix) && !c.is_deleted
  );

  if (customers.length === 0) {
    console.log('警告: テスト顧客が見つかりません。先に createBulkCustomers() を実行してください。');
    return 0;
  }

  const timeSlots = Object.values(TIME_SLOTS);
  const jobTypes = Object.values(JOB_TYPES);
  const startTimes = ['07:00', '07:30', '08:00', '08:30', '09:00', '13:00', '14:00'];
  const supervisors = ['山田監督', '佐藤監督', '田中現場長', '鈴木主任', '高橋監督', ''];
  const branchOffices = ['特需1', '特需2', '世田谷', '立川', '本社', '横浜', ''];
  const constructionDivs = ['第1工事課', '第2工事課', '第3工事課', '特需工事課', ''];

  // 作業カテゴリと詳細
  const workCategories = ['荷揚げ', '上棟', '作業'];
  const workDetailsByCategory = {
    '荷揚げ': ['sekkou', 'tategu', 'kitchen', 'unit_bath', 'flooring', 'habaki', 'cross', 'prefab', 'scaffold', 'material', 'sk', 'toilet', 'furniture', 'appliance'],
    '上棟': ['tobi', 'tobi_hojo', 'niage', 'tobiage'],
    '作業': ['hansyutsu', 'temoto', 'kaitai', 'seisou', 'other']
  };

  const today = new Date();
  const toInsert = [];

  for (let dayOffset = 0; dayOffset < daysCount; dayOffset++) {
    const targetDate = new Date(today);
    targetDate.setDate(targetDate.getDate() + dayOffset);
    const dateStr = formatDateForDb(targetDate);

    for (let j = 0; j < jobsPerDay; j++) {
      const customer = customers[(dayOffset * jobsPerDay + j) % customers.length];
      const area = randomPick(BULK_TEST_CONFIG.AREAS);
      const siteType = randomPick(BULK_TEST_CONFIG.SITE_TYPES);
      const siteAction = randomPick(BULK_TEST_CONFIG.SITE_ACTIONS);
      const invoiceFormat = customer.invoice_format || 'format1';
      const jobIndex = dayOffset * jobsPerDay + j;

      const timeSlot = timeSlots[j % timeSlots.length];
      // 時間未定以外は開始時間を設定
      const startTime = timeSlot === 'mitei' ? '' : startTimes[j % startTimes.length];
      // 上棟のみ鳶/揚げ/鳶揚げ単価をランダムに設定、それ以外は基本単価
      const payUnit = timeSlot === 'jotou' ? randomPick(jobTypes) : 'basic';

      // 作業カテゴリと詳細を設定（上棟は上棟カテゴリ、それ以外はランダム）
      const workCategory = timeSlot === 'jotou' ? '上棟' : randomPick(workCategories);
      const workDetail = randomPick(workDetailsByCategory[workCategory]);

      toInsert.push({
        job_id: generateId('job'),
        customer_id: customer.customer_id,
        site_name: `${randomPick(BULK_TEST_CONFIG.LAST_NAMES)}${siteType}${siteAction}`,
        site_address: `東京都${area}${Math.floor(Math.random() * 9) + 1}-${Math.floor(Math.random() * 99) + 1}`,
        work_date: dateStr,
        time_slot: timeSlot,
        start_time: startTime,
        required_count: (j % 5) + 1,
        pay_unit: payUnit,
        work_category: workCategory,
        work_detail: workDetail,
        supervisor_name: randomPick(supervisors),
        // format2用項目
        order_number: invoiceFormat === 'format2' ? `${String(30000 + jobIndex).padStart(6, '0')}` : '',
        branch_office: invoiceFormat === 'format2' ? randomPick(branchOffices) : '',
        // format3用項目
        property_code: invoiceFormat === 'format3' ? `P${String(jobIndex).padStart(6, '0')}` : '',
        construction_div: invoiceFormat === 'format3' ? randomPick(constructionDivs) : '',
        status: 'pending',
        notes: j % 20 === 0 ? `テスト案件${jobIndex}の備考` : '',
        created_at: now,
        created_by: 'bulk_test',
        updated_at: now,
        updated_by: 'bulk_test',
        is_deleted: false
      });
    }

    console.log(`案件データ準備: ${dateStr} - ${jobsPerDay}件`);
  }

  // 一括挿入
  if (toInsert.length > 0) {
    insertRecords('T_Jobs', toInsert);
    console.log(`案件作成完了: ${toInsert.length}件（バッチ挿入）`);
  }

  return toInsert.length;
}

// ============================================================
// 配置生成（バッチ最適化版）
// ============================================================

function createBulkAssignments() {
  const prefix = BULK_TEST_CONFIG.PREFIX;

  // テスト顧客の案件を取得
  const allJobs = getAllRecords('T_Jobs').filter(j =>
    j.customer_id && j.customer_id.startsWith('cus_' + prefix) &&
    !j.is_deleted && j.status === 'pending'
  );

  // テストスタッフを取得
  const staffList = getAllRecords('M_Staff').filter(s =>
    s.staff_id && s.staff_id.startsWith('stf_' + prefix) && !s.is_deleted
  );

  // 顧客情報を取得（単価参照用）
  const customers = getAllRecords('M_Customers').filter(c =>
    c.customer_id && c.customer_id.startsWith('cus_' + prefix) && !c.is_deleted
  );
  const customerMap = {};
  customers.forEach(c => { customerMap[c.customer_id] = c; });

  if (allJobs.length === 0 || staffList.length === 0) {
    console.log('警告: テスト案件またはテストスタッフが見つかりません。');
    return 0;
  }

  console.log(`対象案件: ${allJobs.length}件, 対象スタッフ: ${staffList.length}名`);

  const transportAreas = ['23ku_inner', '23ku_outer', 'saitama', 'chiba', 'kanagawa'];
  const transportFees = { '23ku_inner': 500, '23ku_outer': 1000, 'saitama': 1500, 'chiba': 1500, 'kanagawa': 1500 };
  const siteRoles = ['genba_dairi', 'sagyo_shunin', 'shokcho', 'anzen_sekinin', null, null, null, null];

  // 案件の50%に配置を作成
  const jobsToAssign = allJobs.filter((_, i) => i % 2 === 0);
  const toInsert = [];
  let assignmentCounter = 0;

  for (const job of jobsToAssign) {
    const assignCount = Math.min(job.required_count || 1, 3);
    const customer = customerMap[job.customer_id] || {};
    const payUnit = job.pay_unit || 'basic';  // デフォルトは基本単価

    for (let i = 0; i < assignCount; i++) {
      const staff = staffList[(assignmentCounter + i) % staffList.length];
      const isSubcontract = staff.staff_type === 'subcontract';
      const transportArea = randomPick(transportAreas);

      // 給与単価決定（スタッフマスターから、pay_unitに基づく）
      let wageRate = staff.daily_rate_tobi || 15000;
      if (payUnit === 'age') wageRate = staff.daily_rate_age || 12000;
      if (payUnit === 'tobiage') wageRate = staff.daily_rate_tobiage || 16000;
      if (payUnit === 'basic') wageRate = staff.daily_rate_basic || 13000;

      // 請求単価決定（顧客マスターから、pay_unitに基づく）
      let invoiceRate = customer.unit_price_tobi || 25000;
      if (payUnit === 'age') invoiceRate = customer.unit_price_age || 20000;
      if (payUnit === 'tobiage') invoiceRate = customer.unit_price_tobiage || 28000;

      // 配置のpay_unit / invoice_unit 決定（FULLDAY/HALFDAY）
      const timeSlot = job.time_slot || 'shuujitsu';
      let asgPayUnit = 'FULLDAY';
      let asgInvoiceUnit = 'FULLDAY';
      if (timeSlot === 'am' || timeSlot === 'pm') {
        asgPayUnit = 'HALFDAY';
        asgInvoiceUnit = 'HALFDAY';
        wageRate = staff.daily_rate_half || 7000;
        invoiceRate = customer.unit_price_half || 12000;
      }

      toInsert.push({
        job_id: job.job_id,
        staff_id: staff.staff_id,
        worker_type: isSubcontract ? 'SUBCONTRACT' : 'STAFF',
        subcontractor_id: isSubcontract ? staff.subcontractor_id : '',
        display_time_slot: timeSlot,
        pay_unit: asgPayUnit,
        invoice_unit: asgInvoiceUnit,
        wage_rate: wageRate,
        invoice_rate: invoiceRate,
        transport_area: transportArea,
        transport_amount: transportFees[transportArea] || 500,
        transport_is_manual: assignmentCounter % 10 === 0,
        site_role: i === 0 ? randomPick(siteRoles) : null,
        status: 'ASSIGNED'
      });

      assignmentCounter++;
    }
  }

  // 一括挿入
  if (toInsert.length > 0) {
    console.log(`配置データ準備完了: ${toInsert.length}件`);
    AssignmentRepository.bulkInsert(toInsert);
    console.log(`配置作成完了: ${toInsert.length}件（バッチ挿入）`);
  }

  return toInsert.length;
}

// ============================================================
// ステータス修正（バッチ最適化版）
// ============================================================

/**
 * 案件ステータスを配置数に応じて一括修正
 */
function fixBulkJobStatuses() {
  console.log('案件ステータス一括修正中...');

  const prefix = BULK_TEST_CONFIG.PREFIX;

  // テスト顧客の案件を取得
  const allJobs = getAllRecords('T_Jobs').filter(j =>
    j.customer_id && j.customer_id.startsWith('cus_' + prefix) &&
    !j.is_deleted && !['completed', 'cancelled', 'hold'].includes(j.status)
  );

  // 配置を取得して案件ごとにカウント
  const allAssignments = getAllRecords('T_JobAssignments').filter(a =>
    !a.is_deleted && a.status !== 'CANCELLED'
  );

  // 案件ごとの一意なスタッフ数をカウント
  const assignmentCounts = {};
  for (const a of allAssignments) {
    if (!assignmentCounts[a.job_id]) {
      assignmentCounts[a.job_id] = new Set();
    }
    assignmentCounts[a.job_id].add(a.staff_id);
  }

  // シートを直接更新
  const sheet = getSheet('T_Jobs');
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const jobIdCol = headers.indexOf('job_id');
  const statusCol = headers.indexOf('status');
  const requiredCountCol = headers.indexOf('required_count');
  const updatedAtCol = headers.indexOf('updated_at');

  let updatedCount = 0;
  const now = getCurrentTimestamp();

  for (let i = 1; i < data.length; i++) {
    const jobId = data[i][jobIdCol];
    const currentStatus = data[i][statusCol];
    const requiredCount = Number(data[i][requiredCountCol]) || 0;

    // テスト案件のみ対象
    const job = allJobs.find(j => j.job_id === jobId);
    if (!job) continue;

    const assignedCount = assignmentCounts[jobId] ? assignmentCounts[jobId].size : 0;

    let expectedStatus;
    if (assignedCount === 0) {
      expectedStatus = 'pending';
    } else if (assignedCount >= requiredCount) {
      expectedStatus = 'assigned';
    } else {
      expectedStatus = 'pending';
    }

    if (currentStatus !== expectedStatus) {
      data[i][statusCol] = expectedStatus;
      data[i][updatedAtCol] = now;
      updatedCount++;
    }
  }

  if (updatedCount > 0) {
    sheet.getDataRange().setValues(data);
    console.log(`ステータス修正完了: ${updatedCount}件`);
  } else {
    console.log('ステータス修正: 変更なし');
  }

  return updatedCount;
}

// ============================================================
// ユーティリティ
// ============================================================

function randomPick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function formatDateForDb(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function softDeleteRecord(tableName, idColumn, idValue) {
  const sheet = getSheet(tableName);
  const row = findRowById(sheet, idColumn, idValue);
  if (row) {
    const headers = getHeaders(sheet);
    const isDeletedCol = headers.indexOf('is_deleted');
    const updatedAtCol = headers.indexOf('updated_at');
    if (isDeletedCol >= 0) {
      sheet.getRange(row, isDeletedCol + 1).setValue(true);
    }
    if (updatedAtCol >= 0) {
      sheet.getRange(row, updatedAtCol + 1).setValue(getCurrentTimestamp());
    }
  }
}

function hardDeleteByColumnPrefix_(options) {
  const sheet = getSheet(options.tableName);
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return 0;
  }

  const lastCol = sheet.getLastColumn();
  const data = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  const headers = data[0];
  const columnMap = getColumnMap(headers);
  const matchColIndex = columnMap[options.matchColumn];

  if (matchColIndex === undefined) {
    throw new Error(`カラムが見つかりません: ${options.matchColumn}`);
  }

  const kept = [headers];
  let deleted = 0;

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const matchValue = row[matchColIndex];
    if (!matchValue || !String(matchValue).startsWith(options.matchPrefix)) {
      kept.push(row);
      continue;
    }

    deleted++;
  }

  if (deleted > 0) {
    sheet.getRange(1, 1, kept.length, lastCol).setValues(kept);

    if (kept.length < lastRow) {
      sheet.getRange(kept.length + 1, 1, lastRow - kept.length, lastCol).clearContent();
    }
  }

  return deleted;
}

function hardDeleteInvoiceDataByCustomerPrefix_(customerPrefix) {
  const invoiceSheet = getSheet('T_Invoices');
  const invoiceLastRow = invoiceSheet.getLastRow();
  if (invoiceLastRow <= 1) {
    return { invoices: 0, lines: 0 };
  }

  const invoiceLastCol = invoiceSheet.getLastColumn();
  const invoiceData = invoiceSheet.getRange(1, 1, invoiceLastRow, invoiceLastCol).getValues();
  const invoiceHeaders = invoiceData[0];
  const invoiceColumnMap = getColumnMap(invoiceHeaders);
  const customerIdIndex = invoiceColumnMap.customer_id;
  const invoiceIdIndex = invoiceColumnMap.invoice_id;

  if (customerIdIndex === undefined || invoiceIdIndex === undefined) {
    throw new Error('T_Invoicesのカラムが見つかりません');
  }

  const keptInvoices = [invoiceHeaders];
  const invoiceIdsToDelete = new Set();
  let deletedInvoices = 0;

  for (let i = 1; i < invoiceData.length; i++) {
    const row = invoiceData[i];
    const customerId = row[customerIdIndex];
    if (customerId && String(customerId).startsWith(customerPrefix)) {
      deletedInvoices++;
      invoiceIdsToDelete.add(row[invoiceIdIndex]);
      continue;
    }
    keptInvoices.push(row);
  }

  if (deletedInvoices > 0) {
    invoiceSheet.getRange(1, 1, keptInvoices.length, invoiceLastCol).setValues(keptInvoices);
    if (keptInvoices.length < invoiceLastRow) {
      invoiceSheet.getRange(keptInvoices.length + 1, 1, invoiceLastRow - keptInvoices.length, invoiceLastCol).clearContent();
    }
  }

  // 明細削除
  const lineSheet = getSheet('T_InvoiceLines');
  const lineLastRow = lineSheet.getLastRow();
  if (lineLastRow <= 1 || invoiceIdsToDelete.size === 0) {
    return { invoices: deletedInvoices, lines: 0 };
  }

  const lineLastCol = lineSheet.getLastColumn();
  const lineData = lineSheet.getRange(1, 1, lineLastRow, lineLastCol).getValues();
  const lineHeaders = lineData[0];
  const lineColumnMap = getColumnMap(lineHeaders);
  const lineInvoiceIdIndex = lineColumnMap.invoice_id;

  if (lineInvoiceIdIndex === undefined) {
    throw new Error('T_InvoiceLinesのカラムが見つかりません');
  }

  const keptLines = [lineHeaders];
  let deletedLines = 0;

  for (let i = 1; i < lineData.length; i++) {
    const row = lineData[i];
    const invoiceId = row[lineInvoiceIdIndex];
    if (invoiceId && invoiceIdsToDelete.has(invoiceId)) {
      deletedLines++;
      continue;
    }
    keptLines.push(row);
  }

  if (deletedLines > 0) {
    lineSheet.getRange(1, 1, keptLines.length, lineLastCol).setValues(keptLines);
    if (keptLines.length < lineLastRow) {
      lineSheet.getRange(keptLines.length + 1, 1, lineLastRow - keptLines.length, lineLastCol).clearContent();
    }
  }

  return { invoices: deletedInvoices, lines: deletedLines };
}

// ============================================================
// パフォーマンス計測
// ============================================================

/**
 * 主要処理のパフォーマンスを計測
 */
function measurePerformance() {
  console.log('=== パフォーマンス計測開始 ===\n');

  const results = [];

  // 1. getDashboard
  results.push(measureOperation('getDashboard (今日)', () => {
    const today = formatDateForDb(new Date());
    return JobService.getDashboard(today);
  }));

  // 2. searchJobs
  results.push(measureOperation('searchJobs (全件)', () => {
    return JobService.search({});
  }));

  // 3. searchJobs (期間指定)
  results.push(measureOperation('searchJobs (10日間)', () => {
    const today = new Date();
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + 10);
    return JobService.search({
      date_from: formatDateForDb(today),
      date_to: formatDateForDb(endDate)
    });
  }));

  // 4. getAllRecords - 顧客
  results.push(measureOperation('getAllRecords (M_Customers)', () => {
    return getAllRecords('M_Customers');
  }));

  // 5. getAllRecords - スタッフ
  results.push(measureOperation('getAllRecords (M_Staff)', () => {
    return getAllRecords('M_Staff');
  }));

  // 6. getAllRecords - 案件
  results.push(measureOperation('getAllRecords (T_Jobs)', () => {
    return getAllRecords('T_Jobs');
  }));

  // レポート出力
  console.log('\n=== パフォーマンス計測結果 ===');
  console.log('| 処理 | 時間(ms) | 件数 |');
  console.log('|------|----------|------|');
  for (const r of results) {
    console.log(`| ${r.name} | ${r.elapsed} | ${r.count} |`);
  }

  return results;
}

function measureOperation(name, fn) {
  const start = Date.now();
  let result;
  let count = 0;

  try {
    result = fn();
    if (Array.isArray(result)) {
      count = result.length;
    } else if (result && result.jobs) {
      count = result.jobs.length;
    } else if (result && typeof result === 'object') {
      count = 1;
    }
  } catch (e) {
    console.log(`エラー: ${name} - ${e.message}`);
    count = -1;
  }

  const elapsed = Date.now() - start;
  console.log(`${name}: ${elapsed}ms (${count}件)`);

  return { name, elapsed, count };
}
