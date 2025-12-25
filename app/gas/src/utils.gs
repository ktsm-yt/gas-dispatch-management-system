/**
 * Utility Functions
 *
 * 共通ユーティリティ関数
 */

/**
 * プレフィックス付きUUIDを生成
 * @param {string} prefix - プレフィックス（job, asg, cus, stf等）
 * @returns {string} プレフィックス付きUUID（例: job_abc123...）
 */
function generateId(prefix) {
  const uuid = Utilities.getUuid();
  return prefix ? `${prefix}_${uuid}` : uuid;
}

/**
 * ISO8601形式の現在時刻を取得
 * @returns {string} ISO8601形式の日時文字列
 */
function getCurrentTimestamp() {
  return new Date().toISOString();
}

/**
 * サーバーの現在日付を取得（Asia/Tokyo）
 * @returns {string} YYYY-MM-DD形式の日付文字列
 */
function getServerDate() {
  return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
}

/**
 * リクエストIDを生成
 * @returns {string} リクエストID（req_xxx形式）
 */
function generateRequestId() {
  return generateId('req');
}

/**
 * 現在のユーザーメールを取得
 * @returns {string} メールアドレス
 */
function getCurrentUserEmail() {
  try {
    return Session.getActiveUser().getEmail() || 'system';
  } catch (e) {
    return 'system';
  }
}

/**
 * 必須項目のバリデーション
 * @param {Object} obj - 検証対象オブジェクト
 * @param {string[]} fields - 必須フィールド名の配列
 * @returns {Object} { valid: boolean, missing: string[] }
 */
function validateRequired(obj, fields) {
  const missing = [];

  for (const field of fields) {
    const value = obj[field];
    if (value === undefined || value === null || value === '') {
      missing.push(field);
    }
  }

  return {
    valid: missing.length === 0,
    missing: missing
  };
}

/**
 * 日付文字列のバリデーション（YYYY-MM-DD形式）
 * @param {string} dateStr - 日付文字列
 * @returns {boolean} 有効な日付形式かどうか
 */
function isValidDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') {
    return false;
  }

  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateStr)) {
    return false;
  }

  const date = new Date(dateStr);
  return !isNaN(date.getTime());
}

/**
 * オブジェクト内のDateを再帰的にISO文字列に変換
 * @param {*} obj - 変換対象
 * @returns {*} 変換後のオブジェクト
 */
function serializeForWeb(obj) {
  if (obj === null || obj === undefined) {
    return obj;
  }
  if (obj instanceof Date) {
    // 1899-1900年のDateはスプレッドシートの空セルなので空文字列に
    if (obj.getFullYear() < 1901) {
      return '';
    }
    return obj.toISOString();
  }
  if (Array.isArray(obj)) {
    return obj.map(item => serializeForWeb(item));
  }
  if (typeof obj === 'object') {
    const result = {};
    for (const key of Object.keys(obj)) {
      result[key] = serializeForWeb(obj[key]);
    }
    return result;
  }
  return obj;
}

/**
 * 成功レスポンスを構築
 * @param {Object} data - レスポンスデータ
 * @param {string} requestId - リクエストID
 * @returns {Object} 成功レスポンス
 */
function buildSuccessResponse(data, requestId) {
  const response = {
    ok: true,
    data: serializeForWeb(data),
    serverTime: getCurrentTimestamp(),
    requestId: requestId || generateRequestId()
  };
  // Web App経由でのシリアライズ問題を回避
  return JSON.parse(JSON.stringify(response));
}

/**
 * エラーレスポンスを構築
 * @param {string} code - エラーコード
 * @param {string} message - エラーメッセージ
 * @param {Object} details - 詳細情報（省略可）
 * @param {string} requestId - リクエストID
 * @returns {Object} エラーレスポンス
 */
function buildErrorResponse(code, message, details, requestId) {
  const response = {
    ok: false,
    error: {
      code: code,
      message: message,
      details: serializeForWeb(details) || {}
    },
    serverTime: getCurrentTimestamp(),
    requestId: requestId || generateRequestId()
  };
  // Web App経由でのシリアライズ問題を回避
  return JSON.parse(JSON.stringify(response));
}

// エラーコードは errors.js に統一
// @see errors.js ErrorCodes
// 後方互換性のため ERROR_CODES は errors.js で ErrorCodes のエイリアスとして定義

// buildSuccessResponse / buildErrorResponse のエイリアス（master_service.gs などで使用）
const successResponse = buildSuccessResponse;
const errorResponse = buildErrorResponse;

/**
 * オブジェクトの差分を取得（監査ログ用）
 * @param {Object} before - 変更前オブジェクト
 * @param {Object} after - 変更後オブジェクト
 * @returns {Object} { before: {差分フィールド}, after: {差分フィールド} }
 */
function getDiff(before, after) {
  const beforeDiff = {};
  const afterDiff = {};

  // afterの全キーをチェック
  for (const key of Object.keys(after)) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      beforeDiff[key] = before[key];
      afterDiff[key] = after[key];
    }
  }

  // beforeにあってafterにないキーをチェック
  for (const key of Object.keys(before)) {
    if (!(key in after)) {
      beforeDiff[key] = before[key];
      afterDiff[key] = undefined;
    }
  }

  return {
    before: beforeDiff,
    after: afterDiff
  };
}

/**
 * オブジェクトから指定フィールドのみ抽出
 * @param {Object} obj - 元オブジェクト
 * @param {string[]} fields - 抽出するフィールド名の配列
 * @returns {Object} 抽出したオブジェクト
 */
function pick(obj, fields) {
  const result = {};
  for (const field of fields) {
    if (field in obj) {
      result[field] = obj[field];
    }
  }
  return result;
}

/**
 * オブジェクトから指定フィールドを除外
 * @param {Object} obj - 元オブジェクト
 * @param {string[]} fields - 除外するフィールド名の配列
 * @returns {Object} 除外後のオブジェクト
 */
function omit(obj, fields) {
  const result = { ...obj };
  for (const field of fields) {
    delete result[field];
  }
  return result;
}

/**
 * 安全なJSON解析
 * @param {string} jsonStr - JSON文字列
 * @param {*} defaultValue - パース失敗時のデフォルト値
 * @returns {*} パース結果またはデフォルト値
 */
function safeJsonParse(jsonStr, defaultValue) {
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    return defaultValue;
  }
}
