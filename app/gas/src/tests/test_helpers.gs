/**
 * テスト共有ヘルパー関数
 *
 * 全テストスイートで使用するアサーション関数を統一定義
 * GASはグローバルスコープ共有のため、このファイルで一元管理する
 */

/**
 * 等価アサーション（strict equality）
 * @param {*} actual - 実際の値
 * @param {*} expected - 期待値
 * @param {string} message - テスト説明
 */
function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

/**
 * 非等価アサーション
 */
function assertNotEqual(actual, expected, message) {
  if (actual === expected) {
    throw new Error(`${message}: expected not ${JSON.stringify(expected)}, but got same value`);
  }
}

/**
 * 真値アサーション
 */
function assertTrue(value, message) {
  if (value !== true) {
    throw new Error(`${message}: expected true, got ${JSON.stringify(value)}`);
  }
}

/**
 * 偽値アサーション
 */
function assertFalse(value, message) {
  if (value !== false) {
    throw new Error(`${message}: expected false, got ${JSON.stringify(value)}`);
  }
}

/**
 * 条件アサーション（truthyチェック）
 * @param {*} condition - truthy であること
 * @param {string} message - テスト説明
 */
function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

/**
 * 例外発生アサーション
 * @param {Function} fn - 例外を投げるべき関数
 * @param {string} message - テスト説明
 * @param {string|RegExp} [expectedMessage] - 期待するエラーメッセージ（部分一致またはRegExp）
 */
function assertThrows(fn, message, expectedMessage) {
  let threw = false;
  let caughtError;
  try {
    fn();
  } catch (e) {
    threw = true;
    caughtError = e;
  }
  if (!threw) {
    throw new Error(`${message}: expected to throw, but did not`);
  }
  if (expectedMessage) {
    const errorMsg = caughtError.message || String(caughtError);
    if (expectedMessage instanceof RegExp) {
      if (!expectedMessage.test(errorMsg)) {
        throw new Error(`${message}: expected error matching ${expectedMessage}, got "${errorMsg}"`);
      }
    } else if (!errorMsg.includes(expectedMessage)) {
      throw new Error(`${message}: expected error containing "${expectedMessage}", got "${errorMsg}"`);
    }
  }
}

/**
 * 例外非発生アサーション
 */
function assertNoThrow(fn, message) {
  try {
    fn();
  } catch (e) {
    throw new Error(`${message}: expected not to throw, but threw: ${e.message}`);
  }
}
