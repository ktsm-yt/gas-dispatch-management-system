/**
 * Tier 3: ステータス遷移・バリデーションテスト
 *
 * 対象: checkBulkInvoiceIssue_, getAssignmentSummary_,
 *       validateAssignment_, validatePayoutStatusTransition_,
 *       validateJobStatusTransition_, validateAssignmentStatusTransition_,
 *       validateInvoiceStatusTransition_
 */

function runStatusAdvancedTests() {
  console.log('=== Status Advanced Tests ===');

  var tests = [
    testCheckBulkInvoiceIssue,
    testGetAssignmentSummary,
    testValidateAssignment,
    testValidateJobStatusTransition,
    testValidateAssignmentStatusTransition,
    testValidateInvoiceStatusTransition,
    testValidatePayoutStatusTransition
  ];

  var passed = 0;
  var failed = 0;
  var errors = [];

  for (var i = 0; i < tests.length; i++) {
    try {
      tests[i]();
      console.log('[PASS] ' + tests[i].name);
      passed++;
    } catch (e) {
      console.log('[FAIL] ' + tests[i].name + ': ' + e.message);
      failed++;
      errors.push({ test: tests[i].name, error: e.message });
    }
  }

  console.log('\nStatus Advanced: ' + passed + ' passed, ' + failed + ' failed');
  return { passed: passed, failed: failed, errors: errors };
}

// ============================================
// checkBulkInvoiceIssue_
// ============================================

function testCheckBulkInvoiceIssue() {
  var invoices = [
    { status: 'draft', total_amount: 50000 },
    { status: 'draft', total_amount: 0 },
    { status: 'sent', total_amount: 30000 },
    { status: 'draft', total_amount: -100 },
    { status: 'draft', total_amount: 10000 }
  ];

  var result = checkBulkInvoiceIssue_(invoices);

  // draft + amount > 0 のみ canIssue
  assertEqual(result.canIssue.length, 2, 'canIssue: 2件(50000, 10000)');
  assertEqual(result.cannotIssue.length, 3, 'cannotIssue: 3件');

  // cannotIssueの理由確認
  var reasons = result.cannotIssue.map(function(c) { return c.reason; });
  assertTrue(reasons.some(function(r) { return r.indexOf('金額') >= 0; }), '金額未設定の理由');
  assertTrue(reasons.some(function(r) { return r.indexOf('送付済') >= 0; }), 'ステータス不正の理由');

  // 全てOKのケース
  var allOk = checkBulkInvoiceIssue_([
    { status: 'draft', total_amount: 100 }
  ]);
  assertEqual(allOk.canIssue.length, 1, '全OK: 1件');
  assertEqual(allOk.cannotIssue.length, 0, '全OK: 0件不可');

  // 空配列
  var empty = checkBulkInvoiceIssue_([]);
  assertEqual(empty.canIssue.length, 0, '空配列: canIssue=0');
  assertEqual(empty.cannotIssue.length, 0, '空配列: cannotIssue=0');
}

// ============================================
// getAssignmentSummary_
// ============================================

function testGetAssignmentSummary() {
  // 充足
  var full = getAssignmentSummary_(3, 3);
  assertEqual(full.statusText, '3/3', '充足: statusText');
  assertTrue(full.isComplete, '充足: isComplete');
  assertEqual(full.shortage, 0, '充足: shortage=0');

  // 不足
  var short = getAssignmentSummary_(1, 3);
  assertEqual(short.statusText, '1/3', '不足: statusText');
  assertFalse(short.isComplete, '不足: isComplete=false');
  assertEqual(short.shortage, 2, '不足: shortage=2');

  // 超過
  var over = getAssignmentSummary_(5, 3);
  assertEqual(over.statusText, '5/3', '超過: statusText');
  assertTrue(over.isComplete, '超過: isComplete');
  assertEqual(over.shortage, 0, '超過: shortage=0(負にならない)');

  // ゼロ
  var zero = getAssignmentSummary_(0, 0);
  assertEqual(zero.statusText, '0/0', 'ゼロ: statusText');
  assertTrue(zero.isComplete, 'ゼロ: 0>=0');
  assertEqual(zero.shortage, 0, 'ゼロ: shortage=0');
}

// ============================================
// validateAssignment_
// ============================================

function testValidateAssignment() {
  // 新規作成: 必須フィールド全てあり → エラーなし
  var validNew = {
    job_id: 'job_12345678-1234-1234-1234-123456789012',
    staff_id: 'stf_12345678-1234-1234-1234-123456789012',
    worker_type: 'STAFF',
    display_time_slot: 'am',
    pay_unit: 'basic',
    invoice_unit: 'basic',
    status: 'ASSIGNED'
  };
  assertNoThrow(function() { validateAssignment_(validNew, true); }, '有効な新規配置');

  // 新規作成: 必須フィールド不足
  assertThrows(
    function() { validateAssignment_({}, true); },
    '必須フィールド不足',
    '必須項目が不足'
  );

  // 更新: 部分データOK
  assertNoThrow(
    function() { validateAssignment_({ pay_unit: 'half' }, false); },
    '部分更新OK'
  );

  // 無効な wage_rate
  assertThrows(
    function() { validateAssignment_({ wage_rate: -100 }, false); },
    '負の給与単価',
    '給与単価'
  );

  // 無効な worker_type
  assertThrows(
    function() { validateAssignment_({ worker_type: 'INVALID' }, false); },
    '無効なワーカー種別',
    'ワーカー種別'
  );

  // is_leader の型チェック
  assertNoThrow(
    function() { validateAssignment_({ is_leader: true }, false); },
    'is_leader=true OK'
  );
  assertThrows(
    function() { validateAssignment_({ is_leader: 'yes' }, false); },
    'is_leader文字列',
    'リーダーフラグ'
  );
}

// ============================================
// validateJobStatusTransition_
// ============================================

function testValidateJobStatusTransition() {
  // 有効な遷移
  var validTransitions = [
    ['pending', 'assigned'],
    ['pending', 'hold'],
    ['pending', 'cancelled'],
    ['assigned', 'hold'],
    ['assigned', 'cancelled'],
    ['assigned', 'pending'],
    ['assigned', 'problem'],
    ['hold', 'pending'],
    ['hold', 'assigned'],
    ['hold', 'cancelled'],
    ['cancelled', 'pending'],
    ['problem', 'assigned'],
    ['problem', 'cancelled']
  ];

  for (let i = 0; i < validTransitions.length; i++) {
    var t = validTransitions[i];
    assertNoThrow(
      function() { validateJobStatusTransition_(t[0], t[1]); },
      '有効: ' + t[0] + '→' + t[1]
    );
  }

  // 同一ステータスはOK
  assertNoThrow(
    function() { validateJobStatusTransition_('pending', 'pending'); },
    '同一ステータス: pending→pending'
  );

  // 無効な遷移
  var invalidTransitions = [
    ['pending', 'problem'],
    ['cancelled', 'assigned'],
    ['cancelled', 'hold']
  ];

  for (let j = 0; j < invalidTransitions.length; j++) {
    var inv = invalidTransitions[j];
    assertThrows(
      function() { validateJobStatusTransition_(inv[0], inv[1]); },
      '無効: ' + inv[0] + '→' + inv[1],
      '変更できません'
    );
  }
}

// ============================================
// validateAssignmentStatusTransition_
// ============================================

function testValidateAssignmentStatusTransition() {
  // 有効
  assertNoThrow(function() { validateAssignmentStatusTransition_('assigned', 'confirmed'); }, 'assigned→confirmed');
  assertNoThrow(function() { validateAssignmentStatusTransition_('assigned', 'cancelled'); }, 'assigned→cancelled');
  assertNoThrow(function() { validateAssignmentStatusTransition_('confirmed', 'assigned'); }, 'confirmed→assigned');
  assertNoThrow(function() { validateAssignmentStatusTransition_('confirmed', 'cancelled'); }, 'confirmed→cancelled');

  // cancelled からはどこにも遷移できない
  assertThrows(
    function() { validateAssignmentStatusTransition_('cancelled', 'assigned'); },
    'cancelled→assigned 不可',
    '変更できません'
  );
  assertThrows(
    function() { validateAssignmentStatusTransition_('cancelled', 'confirmed'); },
    'cancelled→confirmed 不可',
    '変更できません'
  );
}

// ============================================
// validateInvoiceStatusTransition_
// ============================================

function testValidateInvoiceStatusTransition() {
  // 有効な遷移マトリクス全網羅
  var valid = [
    ['unsent', 'sent'], ['unsent', 'hold'],
    ['sent', 'paid'], ['sent', 'unpaid'], ['sent', 'unsent'], ['sent', 'hold'],
    ['unpaid', 'paid'], ['unpaid', 'sent'], ['unpaid', 'hold'],
    ['paid', 'sent'], ['paid', 'hold'],
    ['hold', 'unsent'], ['hold', 'sent'], ['hold', 'unpaid'], ['hold', 'paid']
  ];

  for (let i = 0; i < valid.length; i++) {
    var v = valid[i];
    assertNoThrow(
      function() { validateInvoiceStatusTransition_(v[0], v[1]); },
      '有効: ' + v[0] + '→' + v[1]
    );
  }

  // 無効
  assertThrows(
    function() { validateInvoiceStatusTransition_('unsent', 'paid'); },
    'unsent→paid 不可',
    '変更できません'
  );
  assertThrows(
    function() { validateInvoiceStatusTransition_('unsent', 'unpaid'); },
    'unsent→unpaid 不可',
    '変更できません'
  );
}

// ============================================
// validatePayoutStatusTransition_
// ============================================

function testValidatePayoutStatusTransition() {
  // 有効
  assertNoThrow(function() { validatePayoutStatusTransition_('draft', 'confirmed'); }, 'draft→confirmed');
  assertNoThrow(function() { validatePayoutStatusTransition_('confirmed', 'paid'); }, 'confirmed→paid');
  assertNoThrow(function() { validatePayoutStatusTransition_('confirmed', 'draft'); }, 'confirmed→draft');
  assertNoThrow(function() { validatePayoutStatusTransition_('paid', 'confirmed'); }, 'paid→confirmed');

  // 無効
  assertThrows(
    function() { validatePayoutStatusTransition_('draft', 'paid'); },
    'draft→paid 不可',
    '変更できません'
  );
  assertThrows(
    function() { validatePayoutStatusTransition_('paid', 'draft'); },
    'paid→draft 不可',
    '変更できません'
  );
}
