/**
 * テストランナー
 *
 * 全テストスイートを実行するメインエントリーポイント
 * GASエディタから runAllTests() を実行してください
 */

/**
 * 全テストを実行
 */
function runAllTests() {
  const startTime = Date.now();
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║           Phase 1 テストスイート実行               ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  const results = {
    suites: [],
    totalPassed: 0,
    totalFailed: 0,
    totalErrors: []
  };

  // テストスイート定義（全スイート登録）
  const testSuites = [
    { name: 'ユーティリティ関数テスト', fn: runAllUtilTests },
    { name: 'マスターCRUDテスト', fn: runAllMasterTests },
    { name: '案件管理テスト', fn: runAllJobTests },
    { name: '配置管理テスト', fn: runAssignmentTests },
    { name: '枠（Slot）テスト', fn: runAllSlotTests },
    { name: '請求管理テスト', fn: runInvoiceTests },
    { name: '支払管理テスト', fn: runPayoutTests },
    { name: '入金管理テスト', fn: runPaymentTests },
    { name: '金額計算テスト(Advanced)', fn: runCalcAdvancedTests },
    { name: '日付計算テスト(Advanced)', fn: runDateAdvancedTests },
    { name: 'ステータステスト(Advanced)', fn: runStatusAdvancedTests }
    // パフォーマンステストは時間がかかるため runTestSuite('performance') で個別実行
  ];

  for (const suite of testSuites) {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`📋 ${suite.name}`);
    console.log('='.repeat(50));

    try {
      const suiteResult = suite.fn();
      results.suites.push({
        name: suite.name,
        passed: suiteResult.passed,
        failed: suiteResult.failed
      });
      results.totalPassed += suiteResult.passed;
      results.totalFailed += suiteResult.failed;

      if (suiteResult.errors && suiteResult.errors.length > 0) {
        results.totalErrors.push(...suiteResult.errors.map(e => ({
          suite: suite.name,
          ...e
        })));
      }
    } catch (e) {
      console.log(`❌ スイート実行エラー: ${e.message}`);
      results.suites.push({
        name: suite.name,
        passed: 0,
        failed: 1,
        error: e.message
      });
      results.totalFailed++;
      results.totalErrors.push({ suite: suite.name, error: e.message });
    }
  }

  // 結果サマリー
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  const allPassed = results.totalFailed === 0;

  console.log('\n');
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║                  テスト結果サマリー                ║');
  console.log('╠════════════════════════════════════════════════════╣');

  for (const suite of results.suites) {
    const status = suite.failed === 0 ? '✅' : '❌';
    const line = `${status} ${suite.name}: ${suite.passed} passed, ${suite.failed} failed`;
    console.log(`║ ${line.padEnd(50)} ║`);
  }

  console.log('╠════════════════════════════════════════════════════╣');
  const totalLine = `Total: ${results.totalPassed} passed, ${results.totalFailed} failed`;
  const timeLine = `Time: ${elapsed}s`;
  console.log(`║ ${totalLine.padEnd(50)} ║`);
  console.log(`║ ${timeLine.padEnd(50)} ║`);
  console.log('╚════════════════════════════════════════════════════╝');

  if (allPassed) {
    console.log('\n🎉 全テスト成功!');
  } else {
    console.log('\n⚠️ 一部テスト失敗');
    if (results.totalErrors.length > 0) {
      console.log('\n失敗したテスト:');
      for (const err of results.totalErrors) {
        console.log(`  - [${err.suite}] ${err.test || 'unknown'}: ${err.error || err.message}`);
      }
    }
  }

  return results;
}

/**
 * クイックテスト（主要機能のみ）
 */
function runQuickTests() {
  console.log('=== クイックテスト ===\n');

  const results = { passed: 0, failed: 0 };

  const quickTests = [
    // ユーティリティ
    { name: 'generateId', fn: () => {
      const id = generateId('test');
      if (!id.startsWith('test_')) throw new Error('Invalid prefix');
    }},
    { name: 'getCurrentTimestamp', fn: () => {
      const ts = getCurrentTimestamp();
      if (!ts.match(/^\d{4}-\d{2}-\d{2}T/)) throw new Error('Invalid format');
    }},
    { name: 'isValidDate', fn: () => {
      if (!isValidDate('2025-12-24')) throw new Error('Should be valid');
      if (isValidDate('invalid')) throw new Error('Should be invalid');
    }},
    // 日付計算
    { name: 'addDays_', fn: () => {
      const result = formatDate_(addDays_(parseDate_('2025-12-24'), 7));
      if (result !== '2025-12-31') throw new Error(`Expected 2025-12-31, got ${result}`);
    }},
    // 金額計算（税率は0.10形式で渡す）
    { name: 'calculateTaxIncluded_', fn: () => {
      const result = calculateTaxIncluded_(10000, 0.10);
      if (result !== 11000) throw new Error(`Expected 11000, got ${result}`);
    }},
    // ステータス（引数順序: transitions, fromStatus, toStatus）
    { name: 'isValidTransition_', fn: () => {
      if (!isValidTransition_(JOB_STATUS_TRANSITIONS, 'pending', 'assigned')) {
        throw new Error('Should be valid transition');
      }
    }}
  ];

  for (const test of quickTests) {
    try {
      test.fn();
      console.log(`✅ ${test.name}`);
      results.passed++;
    } catch (e) {
      console.log(`❌ ${test.name}: ${e.message}`);
      results.failed++;
    }
  }

  console.log(`\n結果: ${results.passed} passed, ${results.failed} failed`);
  return results;
}

/**
 * 特定のテストスイートのみ実行
 * @param {string} suiteName - スイート名（'utils', 'masters', 'jobs', 'assignments'）
 */
function runTestSuite(suiteName) {
  const suiteMap = {
    'utils': runAllUtilTests,
    'masters': runAllMasterTests,
    'jobs': runAllJobTests,
    'assignments': runAssignmentTests,
    'slots': runAllSlotTests,
    'invoices': runInvoiceTests,
    'payouts': runPayoutTests,
    'payments': runPaymentTests,
    'calc-advanced': runCalcAdvancedTests,
    'date-advanced': runDateAdvancedTests,
    'status-advanced': runStatusAdvancedTests,
    'performance': runPerformanceTests
  };

  const fn = suiteMap[suiteName.toLowerCase()];
  if (!fn) {
    console.log(`Unknown suite: ${suiteName}`);
    console.log(`Available: ${Object.keys(suiteMap).join(', ')}`);
    return null;
  }

  console.log(`=== Running ${suiteName} tests ===\n`);
  return fn();
}
