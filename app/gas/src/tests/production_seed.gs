/**
 * production_seed.gs
 * 本番相当シードデータ投入
 *
 * 各関数はGASエディタから個別実行可能（6分制限対策）
 * 実行順序: seedAllProductionData() で一括、または個別に:
 *   1. seedCompanyData()
 *   2. seedCustomerData()
 *   3. seedStaffData()
 *   4. seedTransportFeeData()
 *   5. seedSubcontractorData()
 *   6. seedJobsData()          ← 大量データ、分割実行推奨
 *   7. seedAssignmentsData()   ← 大量データ、分割実行推奨
 *   8. seedInvoicesAndPayoutsForArchive()
 */

// ============================================================
// ヘルパー
// ============================================================

/** UUID風ID生成 */
function _seedId(prefix) {
  return prefix + '_' + Utilities.getUuid().substring(0, 8);
}

/** ISO日時文字列 */
function _seedNow() {
  return new Date().toISOString();
}

/** ランダム選択 */
function _seedPick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** min〜maxのランダム整数 */
function _seedRandInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * シートヘッダーに不足カラムがあれば末尾に追加
 * objectToRow のサイレントドロップを防止
 */
function _ensureHeaders(tableName, requiredColumns) {
  const sheet = getSheet(tableName);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  let added = 0;
  for (const col of requiredColumns) {
    if (!headers.includes(col)) {
      const nextCol = sheet.getLastColumn() + 1;
      sheet.getRange(1, nextCol).setValue(col);
      headers.push(col);
      added++;
    }
  }
  if (added > 0) {
    Logger.log(`  ヘッダー補完: ${tableName} に ${added}カラム追加`);
  }
}

/** YYYY-MM-DD形式の日付文字列 */
function _seedDateStr(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** その月の営業日（土日除く簡易版）を返す */
function _seedWorkDays(year, month) {
  const days = [];
  const lastDay = new Date(year, month, 0).getDate();
  for (let d = 1; d <= lastDay; d++) {
    const dow = new Date(year, month - 1, d).getDay();
    if (dow !== 0 && dow !== 6) {
      days.push(d);
    }
  }
  return days;
}

/** スタッフの銀行口座データを生成（約80%のスタッフに設定） */
function _seedBankAccount(staffId, staffName) {
  var empty = { bank_name: '', bank_branch: '', bank_account_type: '', bank_account_number: '', bank_account_name: '' };
  // 20%は未登録
  if (Math.random() < 0.2) return empty;

  var banks = [
    { name: 'みずほ銀行', branches: ['新宿支店', '渋谷支店', '池袋支店', '東京営業部', '上野支店'] },
    { name: '三菱UFJ銀行', branches: ['新宿中央支店', '品川駅前支店', '東京営業部', '池袋東口支店', '大宮支店'] },
    { name: '三井住友銀行', branches: ['新宿西口支店', '渋谷駅前支店', '東京中央支店', '横浜支店', '千葉支店'] },
    { name: 'りそな銀行', branches: ['新宿支店', '池袋支店', '立川支店', '大宮支店', '浦和支店'] },
    { name: 'ゆうちょ銀行', branches: ['〇一八支店', '〇一九支店', '〇二八支店', '〇三八支店', '〇四八支店'] }
  ];
  var bank = _seedPick(banks);
  var kanaName = staffName.replace(/./g, function() { return ''; }); // placeholder
  // カタカナ口座名義（名前から簡易変換）
  return {
    bank_name: bank.name,
    bank_branch: _seedPick(bank.branches),
    bank_account_type: _seedPick(['普通', '普通', '普通', '当座']),
    bank_account_number: String(_seedRandInt(1000000, 9999999)),
    bank_account_name: staffName
  };
}

// ============================================================
// 2-1: 自社情報
// ============================================================

function seedCompanyData() {
  Logger.log('=== 自社情報シード ===');

  const now = _seedNow();
  const record = {
    company_id: 'comp_001',
    company_name: '株式会社サンプル建設',
    postal_code: '150-0001',
    address: '東京都渋谷区神宮前1-2-3 サンプルビル3F',
    phone: '03-0000-0000',
    fax: '03-0000-0001',
    invoice_registration_number: 'T0000000000000',
    bank_name: '三菱UFJ銀行',
    bank_branch: '渋谷支店',
    bank_account_type: '普通',
    bank_account_number: '0000000',
    bank_account_name: 'カ）サンプルケンセツ',
    logo_file_id: '',
    stamp_file_id: '',
    fiscal_month_end: '2',
    updated_at: now
  };

  insertRecord('M_Company', record);
  Logger.log(`✓ 自社情報: ${record.company_name}`);
  return record;
}

// ============================================================
// 2-2: 顧客データ（8社）
// ============================================================

function seedCustomerData() {
  Logger.log('=== 顧客データシード ===');

  // ヘッダーの不足カラムを自動追加
  _ensureHeaders('M_Customers', ['unit_price_basic', 'unit_price_fullday', 'unit_price_night', 'tax_rounding_mode']);

  const now = _seedNow();
  const customers = [
    {
      customer_id: 'cus_001', company_name: '丸山建設株式会社', branch_name: '', department_name: '工事部',
      contact_name: '丸山', honorific: '様', postal_code: '100-0001', address: '東京都千代田区丸の内1-1-1',
      phone: '03-1111-0001', fax: '03-1111-0002', email: 'maruyama@example.com',
      unit_price_tobi: 18000, unit_price_age: 16000, unit_price_tobiage: 20000,
      unit_price_half: 10000, unit_price_fullday: 18000, unit_price_night: 22000,
      closing_day: 99, payment_day: 31, payment_month_offset: 1,
      invoice_format: 'format1', include_cover_page: false, has_transport_fee: true,
      tax_rate: 10, tax_rounding_mode: 'floor', expense_rate: 0, shipper_name: '',
      customer_code: 'MR001', invoice_registration_number: '',
    },
    {
      customer_id: 'cus_002', company_name: '東京ビルド株式会社', branch_name: '城東支店', department_name: '',
      contact_name: '東', honorific: '様', postal_code: '135-0001', address: '東京都江東区毛利1-2-3',
      phone: '03-2222-0001', fax: '03-2222-0002', email: 'azuma@example.com',
      unit_price_tobi: 19000, unit_price_age: 17000, unit_price_tobiage: 21000,
      unit_price_half: 11000, unit_price_fullday: 19000, unit_price_night: 23000,
      closing_day: 20, payment_day: 10, payment_month_offset: 2,
      invoice_format: 'format1', include_cover_page: true, has_transport_fee: true,
      tax_rate: 10, tax_rounding_mode: 'round', expense_rate: 5, shipper_name: '',
      customer_code: 'TB002', invoice_registration_number: '',
    },
    {
      customer_id: 'cus_003', company_name: '港南工業株式会社', branch_name: '', department_name: '建築課',
      contact_name: '港南', honorific: '御中', postal_code: '108-0075', address: '東京都港区港南2-3-4',
      phone: '03-3333-0001', fax: '03-3333-0002', email: 'konan@example.com',
      unit_price_tobi: 17500, unit_price_age: 15500, unit_price_tobiage: 19500,
      unit_price_half: 9500, unit_price_fullday: 17500, unit_price_night: 21500,
      closing_day: 25, payment_day: 15, payment_month_offset: 2,
      invoice_format: 'format2', include_cover_page: false, has_transport_fee: true,
      tax_rate: 10, tax_rounding_mode: 'ceil', expense_rate: 10, shipper_name: '港南工業',
      customer_code: 'KN003', invoice_registration_number: '',
    },
    {
      customer_id: 'cus_004', company_name: '大和ハウジング株式会社', branch_name: '東京支社', department_name: '',
      contact_name: '大和', honorific: '様', postal_code: '163-0001', address: '東京都新宿区西新宿2-4-1',
      phone: '03-4444-0001', fax: '03-4444-0002', email: 'yamato@example.com',
      unit_price_tobi: 20000, unit_price_age: 18000, unit_price_tobiage: 22000,
      unit_price_half: 12000, unit_price_fullday: 20000, unit_price_night: 24000,
      closing_day: 99, payment_day: 31, payment_month_offset: 1,
      invoice_format: 'format2', include_cover_page: true, has_transport_fee: false,
      tax_rate: 10, tax_rounding_mode: 'floor', expense_rate: 5, shipper_name: '大和ハウジング',
      customer_code: 'YH004', invoice_registration_number: '',
    },
    {
      customer_id: 'cus_005', company_name: '三栄建設工業株式会社', branch_name: '', department_name: '管理部',
      contact_name: '三栄', honorific: '様', postal_code: '150-0001', address: '東京都渋谷区神宮前3-5-6',
      phone: '03-5555-0001', fax: '03-5555-0002', email: 'sanei@example.com',
      unit_price_tobi: 18500, unit_price_age: 16500, unit_price_tobiage: 20500,
      unit_price_half: 10500, unit_price_fullday: 18500, unit_price_night: 22500,
      closing_day: 99, payment_day: 31, payment_month_offset: 2,
      invoice_format: 'format3', include_cover_page: false, has_transport_fee: true,
      tax_rate: 10, tax_rounding_mode: 'round', expense_rate: 0, shipper_name: '',
      customer_code: 'SE005', invoice_registration_number: '',
    },
    {
      customer_id: 'cus_006', company_name: '北関東建設株式会社', branch_name: '埼玉営業所', department_name: '',
      contact_name: '北関', honorific: '様', postal_code: '330-0001', address: '埼玉県さいたま市大宮区桜木町1-7-8',
      phone: '048-666-0001', fax: '048-666-0002', email: 'kitakanto@example.com',
      unit_price_tobi: 17000, unit_price_age: 15000, unit_price_tobiage: 19000,
      unit_price_half: 9000, unit_price_fullday: 17000, unit_price_night: 21000,
      closing_day: 20, payment_day: 5, payment_month_offset: 2,
      invoice_format: 'format1', include_cover_page: false, has_transport_fee: true,
      tax_rate: 10, tax_rounding_mode: 'floor', expense_rate: 0, shipper_name: '',
      customer_code: 'KK006', invoice_registration_number: '',
    },
    {
      customer_id: 'cus_007', company_name: '湾岸開発株式会社', branch_name: '', department_name: '技術部',
      contact_name: '湾岸', honorific: '様', postal_code: '261-0001', address: '千葉県千葉市美浜区幸町1-9-10',
      phone: '043-777-0001', fax: '043-777-0002', email: 'wangan@example.com',
      unit_price_tobi: 19500, unit_price_age: 17500, unit_price_tobiage: 21500,
      unit_price_half: 11500, unit_price_fullday: 19500, unit_price_night: 23500,
      closing_day: 25, payment_day: 20, payment_month_offset: 1,
      invoice_format: 'format2', include_cover_page: false, has_transport_fee: true,
      tax_rate: 10, tax_rounding_mode: 'round', expense_rate: 10, shipper_name: '湾岸開発',
      customer_code: 'WG007', invoice_registration_number: '',
    },
    {
      customer_id: 'cus_008', company_name: '城南総建株式会社', branch_name: '', department_name: '',
      contact_name: '城南', honorific: '様', postal_code: '145-0001', address: '東京都大田区田園調布1-11-12',
      phone: '03-8888-0001', fax: '03-8888-0002', email: 'jonan@example.com',
      unit_price_tobi: 18000, unit_price_age: 16000, unit_price_tobiage: 20000,
      unit_price_half: 10000, unit_price_fullday: 18000, unit_price_night: 22000,
      closing_day: 99, payment_day: 25, payment_month_offset: 1,
      invoice_format: 'format3', include_cover_page: true, has_transport_fee: false,
      tax_rate: 10, tax_rounding_mode: 'ceil', expense_rate: 5, shipper_name: '',
      customer_code: 'JN008', invoice_registration_number: '',
    }
  ];

  for (const c of customers) {
    c.unit_price_basic = c.unit_price_tobi;
    c.folder_id = '';
    c.notes = '';
    c.created_at = now;
    c.created_by = 'system';
    c.updated_at = now;
    c.updated_by = 'system';
    c.is_active = true;
    c.is_deleted = false;
    c.deleted_at = '';
    c.deleted_by = '';
  }
  insertRecords('M_Customers', customers);

  Logger.log(`✓ 顧客: ${customers.length}社登録`);
  return customers;
}

// ============================================================
// 2-3: スタッフデータ（15名）
// ============================================================

function seedStaffData() {
  Logger.log('=== スタッフデータシード ===');

  // ヘッダーの不足カラムを自動追加
  _ensureHeaders('M_Staff', ['daily_rate_basic', 'daily_rate_fullday', 'daily_rate_night', 'payment_frequency', 'bank_name', 'bank_branch', 'bank_account_type', 'bank_account_number', 'bank_account_name']);

  const now = _seedNow();
  const staffList = [
    // regular × 5                                                                    basic   tobi    age     tobiage half    fullday night
    { staff_id: 'stf_001', name: '田中太郎', name_kana: 'タナカタロウ', staff_type: 'regular', skills: '鳶', daily_rate_basic: 14000, daily_rate_tobi: 14000, daily_rate_age: 0, daily_rate_tobiage: 0, daily_rate_half: 8000, daily_rate_fullday: 14000, daily_rate_night: 17500, has_motorbike: true },
    { staff_id: 'stf_002', name: '佐藤花子', name_kana: 'サトウハナコ', staff_type: 'regular', skills: 'ボード', daily_rate_basic: 12000, daily_rate_tobi: 0, daily_rate_age: 12000, daily_rate_tobiage: 0, daily_rate_half: 7000, daily_rate_fullday: 12000, daily_rate_night: 15000, has_motorbike: false },
    { staff_id: 'stf_003', name: '鈴木一郎', name_kana: 'スズキイチロウ', staff_type: 'regular', skills: '鳶,ボード', daily_rate_basic: 15000, daily_rate_tobi: 14000, daily_rate_age: 12000, daily_rate_tobiage: 15000, daily_rate_half: 8500, daily_rate_fullday: 15000, daily_rate_night: 18800, has_motorbike: true },
    { staff_id: 'stf_004', name: '高橋美咲', name_kana: 'タカハシミサキ', staff_type: 'regular', skills: '鳶', daily_rate_basic: 13500, daily_rate_tobi: 13500, daily_rate_age: 0, daily_rate_tobiage: 0, daily_rate_half: 7500, daily_rate_fullday: 13500, daily_rate_night: 16900, has_motorbike: false },
    { staff_id: 'stf_005', name: '渡辺健太', name_kana: 'ワタナベケンタ', staff_type: 'regular', skills: 'ボード,バイク', daily_rate_basic: 14500, daily_rate_tobi: 0, daily_rate_age: 12500, daily_rate_tobiage: 14500, daily_rate_half: 7500, daily_rate_fullday: 14500, daily_rate_night: 18100, has_motorbike: true },
    // student × 2
    { staff_id: 'stf_006', name: '伊藤翔太', name_kana: 'イトウショウタ', staff_type: 'student', skills: 'ボード', daily_rate_basic: 10000, daily_rate_tobi: 0, daily_rate_age: 10000, daily_rate_tobiage: 0, daily_rate_half: 6000, daily_rate_fullday: 10000, daily_rate_night: 12500, has_motorbike: false },
    { staff_id: 'stf_007', name: '山本彩乃', name_kana: 'ヤマモトアヤノ', staff_type: 'student', skills: 'ボード', daily_rate_basic: 10000, daily_rate_tobi: 0, daily_rate_age: 10000, daily_rate_tobiage: 0, daily_rate_half: 6000, daily_rate_fullday: 10000, daily_rate_night: 12500, has_motorbike: false },
    // sole_proprietor × 2
    { staff_id: 'stf_008', name: '中村大輔', name_kana: 'ナカムラダイスケ', staff_type: 'sole_proprietor', skills: '鳶,ボード', daily_rate_basic: 17000, daily_rate_tobi: 16000, daily_rate_age: 0, daily_rate_tobiage: 17000, daily_rate_half: 9000, daily_rate_fullday: 17000, daily_rate_night: 21300, has_motorbike: true },
    { staff_id: 'stf_009', name: '小林真一', name_kana: 'コバヤシシンイチ', staff_type: 'sole_proprietor', skills: '鳶,ボード', daily_rate_basic: 16500, daily_rate_tobi: 0, daily_rate_age: 0, daily_rate_tobiage: 16500, daily_rate_half: 9000, daily_rate_fullday: 16500, daily_rate_night: 20600, has_motorbike: false },
    // subcontract × 3（外注先に紐付け）
    { staff_id: 'stf_010', name: '加藤勇気', name_kana: 'カトウユウキ', staff_type: 'subcontract', skills: '鳶', daily_rate_basic: 15000, daily_rate_tobi: 15000, daily_rate_age: 0, daily_rate_tobiage: 0, daily_rate_half: 8000, daily_rate_fullday: 15000, daily_rate_night: 18800, has_motorbike: false, subcontractor_id: 'sub_001' },
    { staff_id: 'stf_011', name: '吉田雄大', name_kana: 'ヨシダユウダイ', staff_type: 'subcontract', skills: 'ボード', daily_rate_basic: 15500, daily_rate_tobi: 0, daily_rate_age: 13000, daily_rate_tobiage: 15500, daily_rate_half: 7500, daily_rate_fullday: 15500, daily_rate_night: 19400, has_motorbike: true, subcontractor_id: 'sub_001' },
    { staff_id: 'stf_012', name: '山田拓海', name_kana: 'ヤマダタクミ', staff_type: 'subcontract', skills: '鳶', daily_rate_basic: 14500, daily_rate_tobi: 14500, daily_rate_age: 0, daily_rate_tobiage: 0, daily_rate_half: 8000, daily_rate_fullday: 14500, daily_rate_night: 18100, has_motorbike: false, subcontractor_id: 'sub_002' },
    // regular 追加 × 3
    { staff_id: 'stf_013', name: '松本桃子', name_kana: 'マツモトモモコ', staff_type: 'regular', skills: 'ボード', daily_rate_basic: 12000, daily_rate_tobi: 0, daily_rate_age: 12000, daily_rate_tobiage: 0, daily_rate_half: 7000, daily_rate_fullday: 12000, daily_rate_night: 15000, has_motorbike: false },
    { staff_id: 'stf_014', name: '井上竜也', name_kana: 'イノウエタツヤ', staff_type: 'regular', skills: '鳶,ボード', daily_rate_basic: 13500, daily_rate_tobi: 13500, daily_rate_age: 11500, daily_rate_tobiage: 0, daily_rate_half: 7500, daily_rate_fullday: 13500, daily_rate_night: 16900, has_motorbike: true },
    { staff_id: 'stf_015', name: '木村和也', name_kana: 'キムラカズヤ', staff_type: 'regular', skills: '鳶,バイク', daily_rate_basic: 15000, daily_rate_tobi: 0, daily_rate_age: 0, daily_rate_tobiage: 15000, daily_rate_half: 8500, daily_rate_fullday: 15000, daily_rate_night: 18800, has_motorbike: true }
  ];

  // NG顧客設定（一部スタッフに）
  const ngSettings = {
    'stf_004': 'cus_003',       // 高橋 → 港南工業NG
    'stf_006': 'cus_001,cus_005', // 伊藤 → 丸山建設, 三栄建設NG
    'stf_012': 'cus_002'        // 山田 → 東京ビルドNG
  };

  for (const s of staffList) {
    s.nickname = '';
    s.phone = '090-' + String(_seedRandInt(1000, 9999)) + '-' + String(_seedRandInt(1000, 9999));
    s.line_id = '';
    s.postal_code = '';
    s.address = '';
    s.ng_customers = ngSettings[s.staff_id] || '';
    s.subcontractor_id = s.subcontractor_id || '';
    s.ccus_id = '';
    s.birth_date = _seedDateStr(_seedRandInt(1975, 2000), _seedRandInt(1, 12), _seedRandInt(1, 28));
    s.gender = _seedPick(['male', 'female']);
    s.blood_type = _seedPick(['A', 'B', 'O', 'AB']);
    s.emergency_contact_name = '';
    s.emergency_contact_address = '';
    s.emergency_contact_phone = '';
    s.job_title = '';
    s.health_insurance_type = '';
    s.pension_type = '';
    s.pension_number = '';
    s.employment_insurance_no = '';
    s.kensetsu_kyosai = '';
    s.chusho_kyosai = '';
    s.special_training = '';
    s.skill_training = '';
    s.licenses = '';
    s.hire_date = '';
    s.foreigner_type = '';
    s.payment_frequency = s.staff_type === 'subcontract' ? 'monthly' : '';
    // 銀行口座データ（一部スタッフのみ設定）
    var bankData = _seedBankAccount(s.staff_id, s.name);
    s.bank_name = bankData.bank_name;
    s.bank_branch = bankData.bank_branch;
    s.bank_account_type = bankData.bank_account_type;
    s.bank_account_number = bankData.bank_account_number;
    s.bank_account_name = bankData.bank_account_name;
    s.notes = '';
    s.created_at = now;
    s.created_by = 'system';
    s.updated_at = now;
    s.updated_by = 'system';
    s.is_active = true;
    s.is_deleted = false;
    s.deleted_at = '';
    s.deleted_by = '';
  }
  insertRecords('M_Staff', staffList);

  Logger.log(`✓ スタッフ: ${staffList.length}名登録`);
  return staffList;
}

// ============================================================
// 2-4: 交通費エリアデータ
// ============================================================

function seedTransportFeeData() {
  Logger.log('=== 交通費エリアデータシード ===');

  const areas = [
    { area_code: 'area_01', area_name: '23区内（近距離）', default_fee: 500 },
    { area_code: 'area_02', area_name: '23区内（遠距離）', default_fee: 800 },
    { area_code: 'area_03', area_name: '23区外（多摩地域）', default_fee: 1200 },
    { area_code: 'area_04', area_name: '神奈川県', default_fee: 1500 },
    { area_code: 'area_05', area_name: '千葉県', default_fee: 1500 },
    { area_code: 'area_06', area_name: '埼玉県', default_fee: 1300 },
    { area_code: 'area_07', area_name: 'その他', default_fee: 2000 }
  ];

  insertRecords('M_TransportFee', areas);

  Logger.log(`✓ 交通費エリア: ${areas.length}件登録`);
  return areas;
}

// ============================================================
// 2-5: 外注先データ（3社）
// ============================================================

function seedSubcontractorData() {
  Logger.log('=== 外注先データシード ===');

  const now = _seedNow();
  const subs = [
    {
      subcontractor_id: 'sub_001', company_name: '関東鳶工業', contact_name: '関東太郎',
      phone: '03-9001-0001', notes: '',
      basic_rate: 15000, half_day_rate: 8000, full_day_rate: 15000
    },
    {
      subcontractor_id: 'sub_002', company_name: '東部足場サービス', contact_name: '東部次郎',
      phone: '03-9002-0001', notes: '',
      basic_rate: 14500, half_day_rate: 7500, full_day_rate: 14500
    },
    {
      subcontractor_id: 'sub_003', company_name: '横浜揚重', contact_name: '横浜三郎',
      phone: '045-9003-0001', notes: '',
      basic_rate: 16000, half_day_rate: 9000, full_day_rate: 16000
    }
  ];

  for (const s of subs) {
    s.folder_id = '';
    s.created_at = now;
    s.created_by = 'system';
    s.updated_at = now;
    s.updated_by = 'system';
    s.is_active = true;
    s.is_deleted = false;
    s.deleted_at = '';
    s.deleted_by = '';
  }
  insertRecords('M_Subcontractors', subs);

  Logger.log(`✓ 外注先: ${subs.length}社登録`);
  return subs;
}

// ============================================================
// 2-6: 案件データ（2年度分・約385件）
// ============================================================

/**
 * 案件データを一括投入（月ごとにバッチ処理）
 * 6分制限に注意。タイムアウトする場合は seedJobsDataByMonth(year, month) を使用
 */
function seedJobsData() {
  Logger.log('=== 案件データシード ===');
  const startTime = new Date();

  // 月別の目標件数
  const monthlyTargets = _getMonthlyJobTargets();

  let totalJobs = 0;
  const allJobs = [];

  for (const target of monthlyTargets) {
    const jobs = _generateJobsForMonth(target.year, target.month, target.count, true);
    allJobs.push(...jobs);
    totalJobs += jobs.length;
  }

  // 全月分を1回のsetValuesでバルク投入
  insertRecords('T_Jobs', allJobs);
  Logger.log(`✓ 案件: ${totalJobs}件登録 (${((new Date() - startTime) / 1000).toFixed(1)}秒)`);
  return allJobs;
}

/** 特定月の案件のみ投入（タイムアウト対策） */
function seedJobsDataByMonth(year, month) {
  const targets = _getMonthlyJobTargets();
  const target = targets.find(t => t.year === year && t.month === month);
  if (!target) {
    Logger.log(`${year}/${month} は対象外です`);
    return [];
  }
  const jobs = _generateJobsForMonth(target.year, target.month, target.count);
  Logger.log(`✓ ${year}/${month}: ${jobs.length}件登録`);
  return jobs;
}

/** 月別目標件数テーブル */
function _getMonthlyJobTargets() {
  return [
    // FY2024 (2024/3〜2025/2)
    { year: 2024, month: 3, count: 10 },
    { year: 2024, month: 4, count: 12 },
    { year: 2024, month: 5, count: 14 },
    { year: 2024, month: 6, count: 16 },
    { year: 2024, month: 7, count: 18 },
    { year: 2024, month: 8, count: 18 },
    { year: 2024, month: 9, count: 16 },
    { year: 2024, month: 10, count: 14 },
    { year: 2024, month: 11, count: 12 },
    { year: 2024, month: 12, count: 10 },
    { year: 2025, month: 1, count: 12 },
    { year: 2025, month: 2, count: 14 },
    // FY2025 (2025/3〜2026/2)
    { year: 2025, month: 3, count: 16 },
    { year: 2025, month: 4, count: 18 },
    { year: 2025, month: 5, count: 20 },
    { year: 2025, month: 6, count: 22 },
    { year: 2025, month: 7, count: 25 },
    { year: 2025, month: 8, count: 24 },
    { year: 2025, month: 9, count: 22 },
    { year: 2025, month: 10, count: 20 },
    { year: 2025, month: 11, count: 18 },
    { year: 2025, month: 12, count: 15 },
    { year: 2026, month: 1, count: 18 },
    { year: 2026, month: 2, count: 20 }
  ];
}

/** 1ヶ月分の案件を生成してDBに投入 */
function _generateJobsForMonth(year, month, count, skipInsert) {
  const now = _seedNow();
  const customerIds = ['cus_001', 'cus_002', 'cus_003', 'cus_004', 'cus_005', 'cus_006', 'cus_007', 'cus_008'];
  const timeSlots = ['jotou', 'shuujitsu', 'am', 'pm', 'yakin', 'mitei'];
  const workCategories = ['鳶', 'ボード', '鳶,ボード'];
  const workDays = _seedWorkDays(year, month);

  // FY判定: 3月始まり → year の 3月〜翌年2月
  const isFY2024 = (year === 2024 && month >= 3) || (year === 2025 && month <= 2);

  const siteNames = [
    '新宿タワーマンション新築工事', '品川駅前再開発ビル', '渋谷オフィスビル改修',
    '池袋商業施設新築', '上野公園整備工事', '六本木ヒルズ改修',
    '銀座ビルリニューアル', '丸の内オフィス新築', '豊洲タワー建設',
    '横浜みなとみらい開発', '川崎駅前ビル工事', 'さいたま新都心開発',
    '千葉ニュータウン建設', '吉祥寺駅前再開発', '立川駅南口ビル',
    '浦安マンション新築', '大宮駅東口開発', '船橋商業施設',
    '柏の葉キャンパス工事', '町田駅前再開発', '八王子ビル新築',
    '藤沢マンション工事', '所沢駅前開発', '越谷レイクタウン増築',
    '松戸マンション新築', '市川ビル改修工事', '川口駅前再開発',
    '草加マンション新築', '三鷹駅前ビル', '国分寺タワー新築'
  ];

  const siteAddresses = [
    '東京都新宿区西新宿1-1', '東京都品川区港南2-2', '東京都渋谷区道玄坂1-3',
    '東京都豊島区南池袋1-4', '東京都台東区上野公園1-5', '東京都港区六本木6-6',
    '東京都中央区銀座4-7', '東京都千代田区丸の内1-8', '東京都江東区豊洲5-9',
    '神奈川県横浜市西区みなとみらい2-10', '神奈川県川崎市川崎区駅前本町1-11', '埼玉県さいたま市中央区新都心1-12',
    '千葉県千葉市稲毛区小仲台1-13', '東京都武蔵野市吉祥寺本町1-14', '東京都立川市曙町2-15',
    '千葉県浦安市入船1-16', '埼玉県さいたま市大宮区桜木町1-17', '千葉県船橋市本町1-18',
    '千葉県柏市若柴1-19', '東京都町田市原町田4-20', '東京都八王子市旭町1-21',
    '神奈川県藤沢市鵠沼花沢町1-22', '埼玉県所沢市日吉町1-23', '埼玉県越谷市レイクタウン1-24',
    '千葉県松戸市松戸1-25', '千葉県市川市市川1-26', '埼玉県川口市栄町3-27',
    '埼玉県草加市高砂1-28', '東京都三鷹市下連雀3-29', '東京都国分寺市南町2-30'
  ];

  const jobs = [];

  for (let i = 0; i < count; i++) {
    const customerId = customerIds[i % customerIds.length];
    const day = workDays[i % workDays.length];
    const timeSlot = timeSlots[i % timeSlots.length];
    const workCategory = workCategories[i % workCategories.length];
    const siteIdx = (month * 10 + i) % siteNames.length;

    // ステータス分布
    let status;
    if (isFY2024) {
      // FY2024: ほぼassigned、一部cancelled/hold
      const rand = Math.random();
      status = rand < 0.85 ? 'assigned' : rand < 0.92 ? 'cancelled' : 'hold';
    } else {
      // FY2025: 混在
      const rand = Math.random();
      if (rand < 0.5) status = 'assigned';
      else if (rand < 0.7) status = 'pending';
      else if (rand < 0.85) status = 'hold';
      else if (rand < 0.95) status = 'cancelled';
      else status = 'problem';
    }

    const jobId = `job_${year}${String(month).padStart(2, '0')}_${String(i + 1).padStart(3, '0')}`;
    const workDate = _seedDateStr(year, month, day);

    const job = {
      job_id: jobId,
      customer_id: customerId,
      site_name: siteNames[siteIdx],
      site_address: siteAddresses[siteIdx],
      work_date: workDate,
      time_slot: timeSlot,
      start_time: timeSlot === 'yakin' ? '20:00' : timeSlot === 'am' ? '08:00' : timeSlot === 'pm' ? '13:00' : '08:00',
      required_count: _seedRandInt(1, 4),
      pay_unit: 'basic',
      work_category: workCategory,
      work_detail: '',
      work_detail_other_text: '',
      supervisor_name: _seedPick(['山田監督', '田中監督', '佐藤監督', '鈴木監督']),
      order_number: `ORD-${year}${String(month).padStart(2, '0')}-${String(i + 1).padStart(3, '0')}`,
      branch_office: customerId === 'cus_002' ? '城東支店' : customerId === 'cus_004' ? '東京支社' : customerId === 'cus_006' ? '埼玉営業所' : '',
      property_code: '',
      construction_div: '',
      status: status,
      is_damaged: false,
      is_uncollected: false,
      is_claimed: false,
      notes: '',
      created_at: now,
      created_by: 'system',
      updated_at: now,
      updated_by: 'system',
      is_deleted: false,
      deleted_at: '',
      deleted_by: ''
    };

    jobs.push(job);
  }

  if (!skipInsert) {
    insertRecords('T_Jobs', jobs);
  }
  Logger.log(`  ${year}/${String(month).padStart(2, '0')}: ${count}件`);
  return jobs;
}

// ============================================================
// 2-7: 配置データ
// ============================================================

/**
 * 配置データを一括投入
 * 既存のT_Jobsからjob_idを取得して配置を生成
 */
function seedAssignmentsData() {
  Logger.log('=== 配置データシード ===');
  const startTime = new Date();

  const allJobs = getAllRecords('T_Jobs', { includeDeleted: false });
  const allStaff = getAllRecords('M_Staff', { includeDeleted: false });

  if (allJobs.length === 0) {
    Logger.log('✗ 案件データが0件。先に seedJobsData() を実行してください。');
    return [];
  }

  // スタッフをスキル別に分類
  const staffBySkill = { '鳶': [], 'ボード': [], 'バイク': [] };
  for (const s of allStaff) {
    const skills = (s.skills || '').split(',').map(sk => sk.trim());
    for (const skill of skills) {
      if (staffBySkill[skill]) {
        staffBySkill[skill].push(s);
      }
    }
  }

  const transportAreas = ['area_01', 'area_02', 'area_03', 'area_04', 'area_05', 'area_06'];
  const now = _seedNow();
  const allAssignmentRecords = [];

  for (const job of allJobs) {
    if (job.status === 'pending' || job.status === 'cancelled') continue;

    const requiredCount = Math.min(job.required_count || 1, 3);
    const eligibleStaff = staffBySkill[job.work_category] || allStaff;
    if (eligibleStaff.length === 0) continue;

    // NG顧客チェック付きでスタッフ選択
    const assigned = [];
    const shuffled = eligibleStaff.slice().sort(() => Math.random() - 0.5);

    for (const staff of shuffled) {
      if (assigned.length >= requiredCount) break;
      const ngList = (staff.ng_customers || '').split(',').map(c => c.trim());
      if (ngList.includes(job.customer_id)) continue;
      if (assigned.some(a => a.staff_id === staff.staff_id)) continue;
      assigned.push(staff);
    }

    // FY判定
    const jobDate = new Date(job.work_date);
    const jobYear = jobDate.getFullYear();
    const jobMonth = jobDate.getMonth() + 1;
    const isFY2024 = (jobYear === 2024 && jobMonth >= 3) || (jobYear === 2025 && jobMonth <= 2);

    for (let idx = 0; idx < assigned.length; idx++) {
      const staff = assigned[idx];
      const isSubcontract = staff.staff_type === 'subcontract';
      const assignmentId = `asgn_${job.job_id.replace('job_', '')}_${String(idx + 1).padStart(2, '0')}`;
      const payUnit = job.pay_unit || 'basic';
      const transportArea = _seedPick(transportAreas);
      // 交通費パターン: エリア自動 / 手動フリー入力 / バス利用
      const areaFeeMap = { area_01: 500, area_02: 800, area_03: 1200, area_04: 1500, area_05: 1500, area_06: 1300 };
      const baseFee = areaFeeMap[transportArea] || 1000;
      var transportAmount, transportIsManual, transportStation, transportHasBus;
      const transportRand = Math.random();
      if (transportRand < 0.5) {
        // エリアマスタから自動取得
        transportAmount = baseFee; transportIsManual = false; transportStation = ''; transportHasBus = false;
      } else if (transportRand < 0.85) {
        // 手動フリー入力（バス利用あり）
        transportAmount = _seedPick([680, 840, 1100, 1360, 1580]);
        transportIsManual = true;
        transportStation = _seedPick(['新宿駅', '渋谷駅', '東京駅', '池袋駅', '品川駅', '横浜駅', '大宮駅', '千葉駅', '立川駅']);
        transportHasBus = true;
      } else {
        // 手動フリー入力（電車のみ）
        transportAmount = _seedPick([350, 480, 650, 820, 1000, 1250]);
        transportIsManual = true;
        transportStation = _seedPick(['新宿駅', '渋谷駅', '東京駅', '池袋駅', '品川駅', '横浜駅', '大宮駅', '千葉駅']);
        transportHasBus = false;
      }

      // スタッフの日当からwage_rateを事前計算
      var wageRate = _calcWageRate(staff, payUnit);

      let assignStatus;
      if (isFY2024) {
        assignStatus = Math.random() < 0.9 ? 'CONFIRMED' : 'ASSIGNED';
      } else {
        const rand = Math.random();
        assignStatus = rand < 0.5 ? 'ASSIGNED' : rand < 0.85 ? 'CONFIRMED' : 'CANCELLED';
      }

      allAssignmentRecords.push({
        assignment_id: assignmentId,
        job_id: job.job_id,
        staff_id: staff.staff_id,
        worker_type: isSubcontract ? 'SUBCONTRACT' : 'STAFF',
        subcontractor_id: staff.subcontractor_id || '',
        slot_id: '',
        display_time_slot: job.time_slot,
        pay_unit: payUnit,
        invoice_unit: payUnit,
        wage_rate: wageRate,
        invoice_rate: '',
        transport_area: transportArea,
        transport_amount: transportAmount,
        transport_is_manual: transportIsManual,
        transport_station: transportStation,
        transport_has_bus: transportHasBus,
        site_role: '',
        assignment_role: '',
        is_leader: idx === 0 && assigned.length > 1,
        entry_date: '',
        safety_training_date: '',
        status: assignStatus,
        payout_id: '',
        notes: '',
        created_at: now,
        created_by: 'system',
        updated_at: now,
        updated_by: 'system',
        is_deleted: false,
        deleted_at: '',
        deleted_by: ''
      });
    }
  }

  // 一括書き込み
  insertRecords('T_JobAssignments', allAssignmentRecords);

  Logger.log(`✓ 配置: ${allAssignmentRecords.length}件登録 (${((new Date() - startTime) / 1000).toFixed(1)}秒)`);
  return allAssignmentRecords.length;
}

// ============================================================
// 2-7b: FY2024用請求書・支払データ（アーカイブ検証用）
// ============================================================

/**
 * FY2024分の請求書・支払を投入（アーカイブ対象にするため）
 */
function seedInvoicesAndPayoutsForArchive() {
  Logger.log('=== FY2024 請求書・支払データシード ===');
  const startTime = new Date();
  const now = _seedNow();

  const customers = getAllRecords('M_Customers', { includeDeleted: false });
  const staff = getAllRecords('M_Staff', { includeDeleted: false });
  const allJobs = getAllRecords('T_Jobs', { includeDeleted: false });
  const allAssignments = getAllRecords('T_JobAssignments', { includeDeleted: false });

  // FY2024の月リスト
  const fy2024Months = [];
  for (let m = 3; m <= 12; m++) fy2024Months.push({ year: 2024, month: m });
  fy2024Months.push({ year: 2025, month: 1 });
  fy2024Months.push({ year: 2025, month: 2 });

  // bulk用配列
  const allLines = [];
  const allInvoices = [];
  const allAdjustments = [];
  const allPayouts = [];

  // job_id → job のMap（O(1)ルックアップ用）
  const jobMap = {};
  for (const j of allJobs) { jobMap[j.job_id] = j; }

  // 配置を月別にプレ分類
  const assignmentsByJobId = {};
  for (const a of allAssignments) {
    if (a.status === 'CANCELLED' || a.is_deleted) continue;
    if (!assignmentsByJobId[a.job_id]) assignmentsByJobId[a.job_id] = [];
    assignmentsByJobId[a.job_id].push(a);
  }

  const regularStaff = staff.filter(s => s.staff_type !== 'subcontract');
  const subcontractStaff = staff.filter(s => s.staff_type === 'subcontract');
  const subsByCompany = {};
  for (const s of subcontractStaff) {
    if (!subsByCompany[s.subcontractor_id]) subsByCompany[s.subcontractor_id] = [];
    subsByCompany[s.subcontractor_id].push(s);
  }

  for (const period of fy2024Months) {
    const monthJobs = allJobs.filter(j => {
      const d = new Date(j.work_date);
      return d.getFullYear() === period.year && (d.getMonth() + 1) === period.month;
    });

    const jobsByCustomer = {};
    for (const j of monthJobs) {
      if (!jobsByCustomer[j.customer_id]) jobsByCustomer[j.customer_id] = [];
      jobsByCustomer[j.customer_id].push(j);
    }

    // 顧客ごとに請求書生成
    for (const customer of customers) {
      const custJobs = jobsByCustomer[customer.customer_id];
      if (!custJobs || custJobs.length === 0) continue;

      const invoiceId = `inv_${period.year}${String(period.month).padStart(2, '0')}_${customer.customer_id}`;
      const invoiceNumber = `INV-${period.year}${String(period.month).padStart(2, '0')}-${customer.customer_code}`;

      let subtotal = 0;
      let lineNum = 0;

      for (const job of custJobs) {
        const jobAssigns = assignmentsByJobId[job.job_id] || [];
        for (const asgn of jobAssigns) {
          lineNum++;
          const unitPrice = asgn.pay_unit === 'half'
            ? (customer['unit_price_half'] || 10000)
            : (customer['unit_price_' + (job.work_category === '鳶' ? 'tobi' : job.work_category === '揚げ' ? 'age' : 'tobiage')] || 18000);
          const amount = unitPrice * (asgn.invoice_rate || 1);

          allLines.push({
            line_id: `${invoiceId}_line_${String(lineNum).padStart(3, '0')}`,
            invoice_id: invoiceId, line_number: lineNum,
            work_date: job.work_date, job_id: job.job_id, assignment_id: asgn.assignment_id,
            site_name: job.site_name, item_name: job.work_category, time_note: job.time_slot,
            quantity: 1, unit: asgn.invoice_unit || 'daily', unit_price: unitPrice, amount: amount,
            order_number: job.order_number || '', branch_office: job.branch_office || '',
            construction_div: job.construction_div || '', supervisor_name: job.supervisor_name || '',
            property_code: job.property_code || '', tax_amount: 0,
            created_at: now, created_by: 'system', updated_at: now, updated_by: 'system',
            is_deleted: false, deleted_at: '', deleted_by: ''
          });
          subtotal += amount;
        }
      }

      if (lineNum === 0) continue;

      const expenseRate = customer.expense_rate || 0;
      const expenseAmount = Math.floor(subtotal * expenseRate / 100);
      const taxableAmount = subtotal + expenseAmount;
      const taxAmount = _calcTax(taxableAmount, customer.tax_rate || 10, customer.tax_rounding_mode || 'floor');
      const rand = Math.random();
      const invStatus = rand < 0.4 ? 'paid' : rand < 0.85 ? 'sent' : 'unsent';

      allInvoices.push({
        invoice_id: invoiceId, invoice_number: invoiceNumber,
        customer_id: customer.customer_id, billing_year: period.year, billing_month: period.month,
        issue_date: _seedDateStr(period.year, period.month, 28), due_date: '',
        subtotal: subtotal, expense_amount: expenseAmount, tax_amount: taxAmount,
        total_amount: taxableAmount + taxAmount, adjustment_total: 0,
        invoice_format: customer.invoice_format, shipper_name: customer.shipper_name || '',
        pdf_file_id: '', excel_file_id: '', sheet_file_id: '',
        status: invStatus, has_assignment_changes: false, notes: '',
        created_at: now, created_by: 'system', updated_at: now, updated_by: 'system',
        is_deleted: false, deleted_at: '', deleted_by: ''
      });

      if (Math.random() < 0.3) {
        allAdjustments.push({
          adjustment_id: `adj_${invoiceId}_01`, invoice_id: invoiceId,
          item_name: _seedPick(['材料費追加', '追加人工', '残材処分費']),
          amount: _seedPick([5000, 10000, 15000, 20000]), sort_order: 1, notes: '',
          created_at: now, created_by: 'system', updated_at: now, updated_by: 'system',
          is_deleted: false, deleted_at: '', deleted_by: ''
        });
        if (Math.random() < 0.5) {
          allAdjustments.push({
            adjustment_id: `adj_${invoiceId}_02`, invoice_id: invoiceId,
            item_name: _seedPick(['早期支払値引', '安全協力会費控除', 'リピート割引']),
            amount: _seedPick([-3000, -5000, -8000, -10000]), sort_order: 2, notes: '',
            created_at: now, created_by: 'system', updated_at: now, updated_by: 'system',
            is_deleted: false, deleted_at: '', deleted_by: ''
          });
        }
      }
    }

    // スタッフ支払
    for (const s of regularStaff) {
      const staffAssignments = allAssignments.filter(a =>
        a.staff_id === s.staff_id && a.status !== 'CANCELLED' && !a.is_deleted
      ).filter(a => {
        const job = jobMap[a.job_id];
        if (!job) return false;
        const d = new Date(job.work_date);
        return d.getFullYear() === period.year && (d.getMonth() + 1) === period.month;
      });

      if (staffAssignments.length === 0) continue;

      const baseAmount = staffAssignments.reduce((sum, a) => {
        // wage_rateが設定済みならそれが日当額（絶対値）、なければマスタから取得
        const rate = a.wage_rate
          ? Number(a.wage_rate)
          : (a.pay_unit === 'half' ? (s.daily_rate_half || 7000) : (s.daily_rate_tobi || s.daily_rate_age || s.daily_rate_tobiage || 13000));
        return sum + rate;
      }, 0);
      const transportAmount = staffAssignments.reduce((sum, a) => sum + (Number(a.transport_amount) || 0), 0);

      allPayouts.push({
        payout_id: `pay_${period.year}${String(period.month).padStart(2, '0')}_${s.staff_id}`,
        payout_type: 'staff', staff_id: s.staff_id, subcontractor_id: '',
        period_start: _seedDateStr(period.year, period.month, 1),
        period_end: _seedDateStr(period.year, period.month, new Date(period.year, period.month, 0).getDate()),
        assignment_count: staffAssignments.length, base_amount: baseAmount,
        transport_amount: transportAmount, adjustment_amount: 0, tax_amount: 0,
        total_amount: baseAmount + transportAmount,
        status: Math.random() < 0.7 ? 'paid' : 'confirmed',
        paid_date: Math.random() < 0.7 ? _seedDateStr(period.year, period.month, 25) : '',
        notes: '', created_at: now, created_by: 'system', updated_at: now, updated_by: 'system',
        is_deleted: false, deleted_at: '', deleted_by: ''
      });
    }

    // 外注先支払
    for (const [subId, subStaff] of Object.entries(subsByCompany)) {
      const subStaffIds = subStaff.map(s => s.staff_id);
      const subAssignments = allAssignments.filter(a =>
        subStaffIds.includes(a.staff_id) && a.status !== 'CANCELLED' && !a.is_deleted
      ).filter(a => {
        const job = jobMap[a.job_id];
        if (!job) return false;
        const d = new Date(job.work_date);
        return d.getFullYear() === period.year && (d.getMonth() + 1) === period.month;
      });

      if (subAssignments.length === 0) continue;

      const baseAmount = subAssignments.length * 15000;
      allPayouts.push({
        payout_id: `pay_${period.year}${String(period.month).padStart(2, '0')}_${subId}`,
        payout_type: 'subcontractor', staff_id: '', subcontractor_id: subId,
        period_start: _seedDateStr(period.year, period.month, 1),
        period_end: _seedDateStr(period.year, period.month, new Date(period.year, period.month, 0).getDate()),
        assignment_count: subAssignments.length, base_amount: baseAmount,
        transport_amount: 0, adjustment_amount: 0,
        tax_amount: Math.floor(baseAmount * 0.1),
        total_amount: baseAmount + Math.floor(baseAmount * 0.1),
        status: 'paid', paid_date: _seedDateStr(period.year, period.month, 28),
        notes: '', created_at: now, created_by: 'system', updated_at: now, updated_by: 'system',
        is_deleted: false, deleted_at: '', deleted_by: ''
      });
    }

    Logger.log(`  ${period.year}/${String(period.month).padStart(2, '0')}: 生成完了`);
  }

  // 一括書き込み
  Logger.log(`\n書き込み中: 請求${allInvoices.length}件, 明細${allLines.length}行, 調整${allAdjustments.length}件, 支払${allPayouts.length}件`);
  if (allInvoices.length > 0) insertRecords('T_Invoices', allInvoices);
  if (allLines.length > 0) insertRecords('T_InvoiceLines', allLines);
  if (allAdjustments.length > 0) insertRecords('T_InvoiceAdjustments', allAdjustments);
  if (allPayouts.length > 0) insertRecords('T_Payouts', allPayouts);

  Logger.log(`\n✓ 請求書: ${allInvoices.length}件, 明細: ${allLines.length}行, 調整: ${allAdjustments.length}件, 支払: ${allPayouts.length}件`);
}

/** 税額計算ヘルパー */
function _calcTax(amount, rate, roundingMode) {
  const raw = amount * rate / 100;
  switch (roundingMode) {
    case 'ceil': return Math.ceil(raw);
    case 'round': return Math.round(raw);
    case 'floor':
    default: return Math.floor(raw);
  }
}

/**
 * スタッフの日当をpay_unitに応じて取得（calc_utils.ts のgetDailyRateByJobType_と同等）
 */
function _calcWageRate(staff, payUnit) {
  switch (payUnit) {
    case 'half':
    case 'halfday':
      return staff.daily_rate_half || 0;
    case 'tobi':
      return staff.daily_rate_tobi || 0;
    case 'age':
      return staff.daily_rate_age || 0;
    case 'tobiage':
      return Math.floor((staff.daily_rate_tobi || 0) * 1.5);
    case 'fullday':
      return staff.daily_rate_tobi || staff.daily_rate_basic || 0;
    case 'night':
      return staff.daily_rate_tobi || staff.daily_rate_basic || 0;
    case 'basic':
    default:
      return staff.daily_rate_basic || staff.daily_rate_tobi || 0;
  }
}

// ============================================================
// 2-8: オーケストレーター
// ============================================================

/**
 * 全シードデータを順番に投入
 * ⚠️ 6分制限に注意。タイムアウトする場合は個別関数を実行
 */
function seedAllProductionData() {
  Logger.log('=== 本番シードデータ一括投入開始 ===');
  const startTime = new Date();

  // 1. マスターデータ
  seedCompanyData();
  seedCustomerData();
  seedStaffData();
  seedTransportFeeData();
  seedSubcontractorData();

  Logger.log(`\nマスターデータ投入完了 (${((new Date() - startTime) / 1000).toFixed(1)}秒)`);

  // 2. トランザクションデータ
  seedJobsData();
  seedAssignmentsData();

  Logger.log(`\nトランザクション投入完了 (${((new Date() - startTime) / 1000).toFixed(1)}秒)`);

  // 3. FY2024請求・支払（アーカイブ用）
  seedInvoicesAndPayoutsForArchive();

  // 4. MasterCacheクリア（CacheService含む）
  MasterCache.invalidate();
  Logger.log('✓ MasterCache: 全キャッシュクリア');

  const elapsed = ((new Date() - startTime) / 1000).toFixed(1);
  Logger.log(`\n=== 全データ投入完了 (${elapsed}秒) ===`);
  Logger.log('verifyMasterData() で整合性を確認してください。');
}

// ============================================================
// 2-9: 検証
// ============================================================

/**
 * 投入データの件数・整合性を検証
 */
function verifyMasterData() {
  Logger.log('=== データ検証 ===');

  // 件数確認
  const tables = [
    'M_Company', 'M_Customers', 'M_Staff', 'M_Subcontractors', 'M_TransportFee',
    'T_Jobs', 'T_JobSlots', 'T_JobAssignments',
    'T_Invoices', 'T_InvoiceLines', 'T_InvoiceAdjustments',
    'T_Payouts', 'T_Payments', 'T_MonthlyStats', 'T_AuditLog'
  ];

  Logger.log('\n--- テーブル件数 ---');
  for (const t of tables) {
    try {
      const sheet = getSheet(t);
      const dataRows = Math.max(0, sheet.getLastRow() - 1);
      Logger.log(`  ${t}: ${dataRows}件`);
    } catch (e) {
      Logger.log(`  ${t}: エラー - ${e.message}`);
    }
  }

  // 参照整合性チェック
  Logger.log('\n--- 参照整合性チェック ---');
  const allJobs = getAllRecords('T_Jobs', { includeDeleted: true });
  const allAssignments = getAllRecords('T_JobAssignments', { includeDeleted: true });
  const allStaff = getAllRecords('M_Staff', { includeDeleted: true });
  const allCustomers = getAllRecords('M_Customers', { includeDeleted: true });

  const customerIds = new Set(allCustomers.map(c => c.customer_id));
  const staffIds = new Set(allStaff.map(s => s.staff_id));
  const jobIds = new Set(allJobs.map(j => j.job_id));

  // 案件→顧客
  const orphanJobs = allJobs.filter(j => !customerIds.has(j.customer_id));
  Logger.log(`  案件→顧客: 孤児${orphanJobs.length}件`);

  // 配置→案件
  const orphanAssignJobs = allAssignments.filter(a => !jobIds.has(a.job_id));
  Logger.log(`  配置→案件: 孤児${orphanAssignJobs.length}件`);

  // 配置→スタッフ
  const orphanAssignStaff = allAssignments.filter(a => !staffIds.has(a.staff_id));
  Logger.log(`  配置→スタッフ: 孤児${orphanAssignStaff.length}件`);

  // 月別・顧客別分布
  Logger.log('\n--- 月別案件分布 ---');
  const monthlyCount = {};
  for (const j of allJobs) {
    const d = j.work_date instanceof Date ? j.work_date : new Date(j.work_date);
    const key = d && !isNaN(d.getTime()) ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` : 'unknown';
    monthlyCount[key] = (monthlyCount[key] || 0) + 1;
  }
  const sortedMonths = Object.keys(monthlyCount).sort();
  for (const m of sortedMonths) {
    const bar = '█'.repeat(Math.min(monthlyCount[m], 30));
    Logger.log(`  ${m}: ${bar} ${monthlyCount[m]}件`);
  }

  // 顧客別分布
  Logger.log('\n--- 顧客別案件分布 ---');
  const custCount = {};
  for (const j of allJobs) {
    custCount[j.customer_id] = (custCount[j.customer_id] || 0) + 1;
  }
  for (const c of allCustomers) {
    Logger.log(`  ${c.company_name}: ${custCount[c.customer_id] || 0}件`);
  }

  // サンプルデータ出力（デバッグ用）
  Logger.log('\n--- サンプルデータ確認 ---');
  if (allCustomers.length > 0) {
    const c = allCustomers[0];
    Logger.log(`  顧客[0]: id=${c.customer_id}, name=${c.company_name}, is_deleted=${c.is_deleted} (type: ${typeof c.is_deleted}), is_active=${c.is_active} (type: ${typeof c.is_active})`);
  }
  if (allStaff.length > 0) {
    const s = allStaff[0];
    Logger.log(`  スタッフ[0]: id=${s.staff_id}, name=${s.name}, staff_type=${s.staff_type} (type: ${typeof s.staff_type}), is_deleted=${s.is_deleted} (type: ${typeof s.is_deleted}), is_active=${s.is_active} (type: ${typeof s.is_active})`);
  }
  if (allAssignments.length > 0) {
    const a = allAssignments[0];
    Logger.log(`  配置[0]: id=${a.assignment_id}, job_id=${a.job_id}, staff_id=${a.staff_id}, status=${a.status}, is_deleted=${a.is_deleted} (type: ${typeof a.is_deleted})`);
  }
  if (allJobs.length > 0) {
    const j = allJobs[0];
    Logger.log(`  案件[0]: id=${j.job_id}, customer_id=${j.customer_id}, work_date=${j.work_date} (type: ${typeof j.work_date}), is_deleted=${j.is_deleted} (type: ${typeof j.is_deleted})`);
  }

  // MasterCache経由の確認
  Logger.log('\n--- MasterCache確認 ---');
  const cachedStaff = MasterCache.getStaff();
  Logger.log(`  MasterCache.getStaff(): ${cachedStaff.length}件`);
  if (cachedStaff.length > 0) {
    const s = cachedStaff[0];
    Logger.log(`  cached[0]: id=${s.staff_id}, name=${s.name}, staff_type=${s.staff_type}, is_active=${s.is_active}`);
  }
  const cachedCustomers = MasterCache.getCustomers();
  Logger.log(`  MasterCache.getCustomers(): ${cachedCustomers.length}件`);
  if (cachedCustomers.length > 0) {
    const c = cachedCustomers[0];
    Logger.log(`  cached[0]: id=${c.customer_id}, name=${c.company_name}`);
  }

  // シートヘッダー確認
  Logger.log('\n--- シートヘッダー確認 ---');
  const checkTables = ['M_Staff', 'M_Customers', 'T_Jobs', 'T_JobAssignments'];
  for (const t of checkTables) {
    try {
      const sheet = getSheet(t);
      const headers = getHeaders(sheet);
      Logger.log(`  ${t} (${headers.length}列): ${headers.join(', ')}`);
    } catch (e) {
      Logger.log(`  ${t}: エラー - ${e.message}`);
    }
  }

  Logger.log('\n✅ 検証完了');
}
