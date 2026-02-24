/**
 * 人工割（CR-029）テストデータ作成
 *
 * GASエディタから createNinkuTestData() を実行
 *
 * 作成されるデータ:
 *   - 案件1: 不足配置（required=3, actual=2）→ 係数1.5
 *   - 案件2: 過剰配置（required=3, actual=4）→ 係数0.7
 *   - 案件3: 適正配置（required=3, actual=3）→ 係数1.0
 *   - 案件4: 外注混在（required=3, 自社2+外注1）→ actual=2（外注除外）→ 係数1.5
 *
 * 前提: 既存のテストスタッフ（stf_test_001〜005）、テスト顧客、外注スタッフが存在すること
 *       なければ先に createTestData() + createSubcontractorTestData() を実行
 */

function createNinkuTestData() {
  Logger.log('=== 人工割テストデータ作成開始 ===');

  var today = new Date();
  var todayStr = Utilities.formatDate(today, 'Asia/Tokyo', 'yyyy-MM-dd');

  // テスト用スタッフID（既存のテストデータを想定）
  var STAFF_IDS = ['stf_test_001', 'stf_test_002', 'stf_test_003', 'stf_test_004'];
  // 外注スタッフID（createSubcontractorTestData()で作成済みのもの）
  var SUBCONTRACT_STAFF_ID = 'stf_sub_001';

  // 既存スタッフの存在確認
  var staffCheck = StaffRepository.findById(STAFF_IDS[0]);
  if (!staffCheck) {
    Logger.log('ERROR: テストスタッフが存在しません。先に createTestData() を実行してください');
    return;
  }

  var CUSTOMER_ID = 'cus_test_001';

  // ============================================
  // 案件1: 不足配置（required=3, actual=2）
  // ============================================
  var job1 = JobRepository.insert({
    customer_id: CUSTOMER_ID,
    site_name: '【人工割テスト】不足配置（3人必要/2人配置）',
    work_date: todayStr,
    time_slot: 'am',
    start_time: '08:00',
    required_count: 3,
    pay_unit: 'tobi',
    status: 'confirmed'
  });
  Logger.log('案件1(不足): ' + job1.job_id + ' required=3');

  // 2人だけ配置
  for (var i = 0; i < 2; i++) {
    AssignmentRepository.insert({
      job_id: job1.job_id,
      staff_id: STAFF_IDS[i],
      status: 'ASSIGNED',
      wage_rate: 15000,
      pay_unit: 'tobi'
    });
  }
  Logger.log('  配置: ' + STAFF_IDS[0] + ', ' + STAFF_IDS[1]);

  // ============================================
  // 案件2: 過剰配置（required=3, actual=4）
  // ============================================
  var job2 = JobRepository.insert({
    customer_id: CUSTOMER_ID,
    site_name: '【人工割テスト】過剰配置（3人必要/4人配置）',
    work_date: todayStr,
    time_slot: 'pm',
    start_time: '13:00',
    required_count: 3,
    pay_unit: 'tobi',
    status: 'confirmed'
  });
  Logger.log('案件2(過剰): ' + job2.job_id + ' required=3');

  // 4人配置
  for (var j = 0; j < 4; j++) {
    AssignmentRepository.insert({
      job_id: job2.job_id,
      staff_id: STAFF_IDS[j],
      status: 'ASSIGNED',
      wage_rate: 15000,
      pay_unit: 'tobi'
    });
  }
  Logger.log('  配置: 4人');

  // ============================================
  // 案件3: 適正配置（required=3, actual=3）
  // ============================================
  var job3 = JobRepository.insert({
    customer_id: CUSTOMER_ID,
    site_name: '【人工割テスト】適正配置（3人必要/3人配置）',
    work_date: todayStr,
    time_slot: 'yakin',
    start_time: '18:00',
    required_count: 3,
    pay_unit: 'tobi',
    status: 'confirmed'
  });
  Logger.log('案件3(適正): ' + job3.job_id + ' required=3');

  for (var k = 0; k < 3; k++) {
    AssignmentRepository.insert({
      job_id: job3.job_id,
      staff_id: STAFF_IDS[k],
      status: 'ASSIGNED',
      wage_rate: 15000,
      pay_unit: 'tobi'
    });
  }
  Logger.log('  配置: 3人');

  // ============================================
  // 案件4: 外注混在（required=3, 自社2+外注1）
  // ============================================
  var subStaffCheck = StaffRepository.findById(SUBCONTRACT_STAFF_ID);
  if (subStaffCheck) {
    var job4 = JobRepository.insert({
      customer_id: CUSTOMER_ID,
      site_name: '【人工割テスト】外注混在（3人必要/自社2+外注1）',
      work_date: todayStr,
      time_slot: 'mitei',
      start_time: '09:00',
      required_count: 3,
      pay_unit: 'tobi',
      status: 'confirmed'
    });
    Logger.log('案件4(外注混在): ' + job4.job_id + ' required=3');

    // 自社スタッフ2人
    for (var m = 0; m < 2; m++) {
      AssignmentRepository.insert({
        job_id: job4.job_id,
        staff_id: STAFF_IDS[m],
        status: 'ASSIGNED',
        wage_rate: 15000,
        pay_unit: 'tobi'
      });
    }
    // 外注スタッフ1人
    AssignmentRepository.insert({
      job_id: job4.job_id,
      staff_id: SUBCONTRACT_STAFF_ID,
      status: 'ASSIGNED',
      wage_rate: 12000,
      pay_unit: 'tobi'
    });
    Logger.log('  配置: 自社2 + 外注1');
  } else {
    Logger.log('SKIP 案件4: 外注スタッフ ' + SUBCONTRACT_STAFF_ID + ' が存在しません');
    Logger.log('  → createSubcontractorTestData() を先に実行してください');
  }

  Logger.log('=== 人工割テストデータ作成完了 ===');
  Logger.log('');
  Logger.log('期待される結果:');
  Logger.log('  案件1(不足): 係数 = floor(3/2*10)/10 = 1.5 → 調整額 +7500/人');
  Logger.log('  案件2(過剰): 係数 = floor(3/4*10)/10 = 0.7 → 調整額 -4500/人、請求数量=3（キャップ）');
  Logger.log('  案件3(適正): 係数 = 1.0 → 調整なし');
  Logger.log('  案件4(外注混在): 外注除外 → actual=2 → 係数1.5 → 自社のみ調整');
}

/**
 * 人工割テストデータを削除
 */
function deleteNinkuTestData() {
  Logger.log('=== 人工割テストデータ削除開始 ===');

  var jobs = JobRepository.search({});
  var deleted = 0;
  for (var i = 0; i < jobs.length; i++) {
    var job = jobs[i];
    if (String(job.site_name).indexOf('【人工割テスト】') === 0) {
      // 関連する配置を削除
      var assignments = AssignmentRepository.search({ job_id: job.job_id });
      for (var j = 0; j < assignments.length; j++) {
        AssignmentRepository.softDelete(assignments[j].assignment_id);
      }
      JobRepository.softDelete(job.job_id);
      Logger.log('削除: ' + job.site_name);
      deleted++;
    }
  }

  Logger.log('=== ' + deleted + '件の案件を削除しました ===');
}
