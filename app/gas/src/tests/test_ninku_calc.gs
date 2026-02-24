/**
 * 人工割（CR-029）デバッグ用テスト関数
 *
 * GASエディタから testNinkuCalc() を実行して
 * Logger.log の出力を確認する。
 *
 * 前提: createNinkuTestData() でテストデータ作成済み
 */

/**
 * 指定スタッフの支払計算を実行し、人工割の内訳をログ出力
 */
function testNinkuCalc() {
  Logger.log('=== 人工割 直接テスト ===');

  // 人工割テスト案件を取得
  var jobs = JobRepository.search({});
  var ninkuJobs = [];
  var jobMap = new Map();
  for (var i = 0; i < jobs.length; i++) {
    jobMap.set(jobs[i].job_id, jobs[i]);
    if (String(jobs[i].site_name).indexOf('【人工割テスト】') === 0) {
      ninkuJobs.push(jobs[i]);
    }
  }
  Logger.log('人工割テスト案件: ' + ninkuJobs.length + '件');

  // 全ASSIGNED配置からjob別のactualカウント構築（UIパスと同じロジック）
  var allAsg = AssignmentRepository.search({ status: 'ASSIGNED' });
  Logger.log('全ASSIGNED配置数: ' + allAsg.length);

  // 外注除外チェック
  var allStaff = MasterCache.getStaff();
  Logger.log('MasterCache.getStaff() type: ' + typeof allStaff + ', isArray: ' + Array.isArray(allStaff));
  if (Array.isArray(allStaff)) {
    Logger.log('  length: ' + allStaff.length);
    // stf_sub_001 を探す
    var found = false;
    for (var s = 0; s < allStaff.length; s++) {
      if (allStaff[s].staff_id === 'stf_sub_001') {
        Logger.log('  stf_sub_001 found: staff_type=' + allStaff[s].staff_type + ' type=' + allStaff[s].type);
        found = true;
        break;
      }
    }
    if (!found) Logger.log('  stf_sub_001 NOT in MasterCache');
  } else {
    // オブジェクト形式かもしれない
    Logger.log('  keys sample: ' + Object.keys(allStaff).slice(0, 5));
    if (allStaff['stf_sub_001']) {
      Logger.log('  stf_sub_001: ' + JSON.stringify(allStaff['stf_sub_001']));
    } else {
      Logger.log('  stf_sub_001 NOT in MasterCache');
    }
  }

  // 人工割テスト案件のjob_idごとにactualカウント
  var assignmentCountByJob = new Map();
  for (var j = 0; j < allAsg.length; j++) {
    var a = allAsg[j];
    if (a.is_deleted) continue;
    var jid = a.job_id;
    assignmentCountByJob.set(jid, (assignmentCountByJob.get(jid) || 0) + 1);
  }

  // 各テスト案件の結果を確認
  for (var k = 0; k < ninkuJobs.length; k++) {
    var job = ninkuJobs[k];
    var required = Number(job.required_count) || 0;
    var actual = assignmentCountByJob.get(job.job_id) || 0;
    var coeff = calculateNinkuCoefficient_(required, actual);
    Logger.log(job.site_name);
    Logger.log('  job_id=' + job.job_id);
    Logger.log('  required_count=' + required + ', actual(from map)=' + actual);
    Logger.log('  coefficient=' + coeff);
    if (coeff !== 1.0) {
      Logger.log('  ★ 調整あり! wage=15000 → adjustment=' + calculateNinkuAdjustment_(15000, coeff));
    }
  }

  // UIパスで佐藤健太の人工割をシミュレート
  Logger.log('\n--- UIパス シミュレート (stf_test_001) ---');
  var staff = StaffRepository.findById('stf_test_001');
  Logger.log('staff: ' + (staff ? staff.name + ' type=' + staff.staff_type : 'NOT FOUND'));

  // stf_test_001 のASSIGNED配置でjobIdSetに含まれるもの
  var myAsg = [];
  for (var m = 0; m < allAsg.length; m++) {
    if (allAsg[m].staff_id === 'stf_test_001' && !allAsg[m].is_deleted && !allAsg[m].payout_id) {
      myAsg.push(allAsg[m]);
    }
  }
  Logger.log('stf_test_001 unpaid ASSIGNED: ' + myAsg.length);
  for (var n = 0; n < myAsg.length; n++) {
    var mJob = jobMap.get(myAsg[n].job_id);
    Logger.log('  [' + n + '] job=' + myAsg[n].job_id + ' site=' + (mJob ? mJob.site_name : 'N/A'));
  }

  // _calculateNinkuAdjustments を直接呼ぶ
  Logger.log('\n--- _calculateNinkuAdjustments 直接呼び出し ---');
  var ninku = PayoutService._calculateNinkuAdjustments(myAsg, staff, jobMap, assignmentCountByJob);
  Logger.log('result: totalAdjustment=' + ninku.totalAdjustment + ' avgCoefficient=' + ninku.avgCoefficient);

  Logger.log('\n=== 完了 ===');
}

/**
 * 人工割の係数計算を直接テスト（calc_utils の関数を直接呼ぶ）
 */
function testNinkuCoefficientDirect() {
  Logger.log('=== 係数計算の直接テスト ===');

  var testCases = [
    { required: 3, actual: 2, expected: 1.5 },
    { required: 3, actual: 4, expected: 0.7 },
    { required: 3, actual: 3, expected: 1.0 },
    { required: 0, actual: 3, expected: 1.0 },
    { required: 3, actual: 0, expected: 1.0 },
  ];

  for (var i = 0; i < testCases.length; i++) {
    var tc = testCases[i];
    var result = calculateNinkuCoefficient_(tc.required, tc.actual);
    var pass = result === tc.expected ? 'PASS' : 'FAIL';
    Logger.log(pass + ': required=' + tc.required + ' actual=' + tc.actual +
               ' → coefficient=' + result + ' (expected=' + tc.expected + ')');
  }
}

/**
 * 人工割テスト案件の配置数を直接確認
 */
function testNinkuAssignmentCounts() {
  Logger.log('=== 人工割テスト案件の配置数確認 ===');

  var jobs = JobRepository.search({});
  var ninkuJobs = [];
  for (var i = 0; i < jobs.length; i++) {
    if (String(jobs[i].site_name).indexOf('【人工割テスト】') === 0) {
      ninkuJobs.push(jobs[i]);
    }
  }

  Logger.log('人工割テスト案件数: ' + ninkuJobs.length);

  for (var j = 0; j < ninkuJobs.length; j++) {
    var job = ninkuJobs[j];
    var assignments = AssignmentRepository.search({ job_id: job.job_id });

    // 外注チェック
    var selfCount = 0;
    var subCount = 0;
    var staffCache = MasterCache.getStaff();

    for (var k = 0; k < assignments.length; k++) {
      var a = assignments[k];
      var staff = staffCache ? staffCache[a.staff_id] : null;
      var staffType = staff ? (staff.staff_type || staff.type) : 'unknown';
      var isSubcontract = (staffType === 'subcontract' || staffType === '5' || Number(staffType) === 5);

      if (isSubcontract) {
        subCount++;
      } else {
        selfCount++;
      }
      Logger.log('  assignment: id=' + a.assignment_id + ' staff=' + a.staff_id + ' type=' + staffType + ' sub=' + isSubcontract + ' status=' + a.status + ' is_deleted=' + a.is_deleted + ' payout_id=' + a.payout_id);
    }

    Logger.log(job.site_name);
    Logger.log('  job_id=' + job.job_id + ' required=' + job.required_count);
    Logger.log('  total=' + assignments.length + ' self=' + selfCount + ' sub=' + subCount);
    Logger.log('  expected coefficient=' + (selfCount > 0 ? Math.floor(job.required_count / selfCount * 10) / 10 : 'N/A'));
    Logger.log('');
  }
}

/**
 * stf_test_001 の全assignmentをダンプして、フィルタ条件を確認
 */
function testNinkuFilterDebug() {
  Logger.log('=== stf_test_001 の全assignment フィルタ条件確認 ===');

  var allAssignments = AssignmentRepository.findByStaffId('stf_test_001');
  Logger.log('total assignments: ' + allAssignments.length);

  for (var i = 0; i < allAssignments.length; i++) {
    var a = allAssignments[i];
    var job = JobRepository.findById(a.job_id);
    var siteName = job ? job.site_name : '(job not found)';
    var isNinku = String(siteName).indexOf('人工割') !== -1;

    Logger.log('[' + i + '] ' + (isNinku ? '★NINKU★ ' : '') +
      'assignment_id=' + a.assignment_id +
      ' job_id=' + a.job_id +
      ' status=' + a.status +
      ' is_deleted=' + a.is_deleted +
      ' payout_id=' + (a.payout_id || 'null') +
      ' site=' + siteName);
  }
}
