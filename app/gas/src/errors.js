// File: errors.gs
// エラーハンドリング共通処理（KTSM-63）

/**
 * エラーコード定数
 * @see docs/03_spec/06_backend.md エラーコード
 */
const ErrorCodes = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',   // 入力エラー
  PERMISSION_DENIED: 'PERMISSION_DENIED', // 認可エラー
  NOT_FOUND: 'NOT_FOUND',                 // 参照先なし
  CONFLICT_ERROR: 'CONFLICT_ERROR',       // 競合（楽観ロック）
  BUSY_ERROR: 'BUSY_ERROR',               // 混雑（Lock取得失敗）
  SYSTEM_ERROR: 'SYSTEM_ERROR'            // 想定外エラー
};

/**
 * アプリケーションエラー基底クラス
 */
class AppError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
  }

  toResponse() {
    return {
      code: this.code,
      message: this.message,
      details: this.details
    };
  }
}

/**
 * バリデーションエラー
 * @param {string} message - エラーメッセージ
 * @param {Object} details - 詳細（フィールド名、期待値等）
 */
class ValidationError extends AppError {
  constructor(message, details = null) {
    super(ErrorCodes.VALIDATION_ERROR, message, details);
    this.name = 'ValidationError';
  }
}

/**
 * 認可エラー
 * @param {string} message - エラーメッセージ
 */
class PermissionDeniedError extends AppError {
  constructor(message = '権限がありません') {
    super(ErrorCodes.PERMISSION_DENIED, message);
    this.name = 'PermissionDeniedError';
  }
}

/**
 * NotFoundエラー
 * @param {string} resourceName - リソース名（例: '案件', '顧客'）
 * @param {string} id - リソースID
 */
class NotFoundError extends AppError {
  constructor(resourceName, id) {
    super(
      ErrorCodes.NOT_FOUND,
      `${resourceName}が見つかりません: ${id}`,
      { resource: resourceName, id }
    );
    this.name = 'NotFoundError';
  }
}

/**
 * 競合エラー（楽観ロック）
 * @param {string} message - エラーメッセージ
 * @param {Object} details - 詳細（expectedUpdatedAt, actualUpdatedAt等）
 */
class ConflictError extends AppError {
  constructor(message = 'データが他のユーザーによって更新されています', details = null) {
    super(ErrorCodes.CONFLICT_ERROR, message, details);
    this.name = 'ConflictError';
  }
}

/**
 * 混雑エラー（Lock取得失敗）
 * @param {string} message - エラーメッセージ
 */
class BusyError extends AppError {
  constructor(message = '現在混み合っています。しばらくしてから再度お試しください') {
    super(ErrorCodes.BUSY_ERROR, message);
    this.name = 'BusyError';
  }
}

/**
 * システムエラー
 * @param {string} message - エラーメッセージ
 * @param {Error} cause - 原因となったエラー
 */
class SystemError extends AppError {
  constructor(message = 'システムエラーが発生しました', cause = null) {
    super(ErrorCodes.SYSTEM_ERROR, message, cause ? { cause: cause.message } : null);
    this.name = 'SystemError';
    this.cause = cause;
  }
}

/**
 * requestIdを生成する
 * @returns {string} リクエストID（req_xxxxxxxx形式）
 */
function generateRequestId_() {
  return 'req_' + Utilities.getUuid().replace(/-/g, '').substring(0, 12);
}

/**
 * サーバ時刻をISO8601形式で取得
 * @returns {string} ISO8601形式の日時文字列
 */
function getServerTime_() {
  return new Date().toISOString();
}

/**
 * 成功レスポンスを生成
 * @param {*} data - レスポンスデータ
 * @param {string} requestId - リクエストID
 * @returns {Object} 成功レスポンス
 */
function successResponse_(data, requestId) {
  return {
    ok: true,
    data: data,
    serverTime: getServerTime_(),
    requestId: requestId
  };
}

/**
 * エラーレスポンスを生成
 * @param {AppError|Error} error - エラーオブジェクト
 * @param {string} requestId - リクエストID
 * @returns {Object} エラーレスポンス
 */
function errorResponse_(error, requestId) {
  if (error instanceof AppError) {
    return {
      ok: false,
      error: error.toResponse(),
      requestId: requestId
    };
  }
  // 想定外のエラーはSystemErrorとして返す
  return {
    ok: false,
    error: {
      code: ErrorCodes.SYSTEM_ERROR,
      message: error.message || 'システムエラーが発生しました'
    },
    requestId: requestId
  };
}

/**
 * APIハンドラーラッパー
 * Controller層で使用し、エラーハンドリングとレスポンス整形を統一
 * @param {Function} fn - 実行する関数
 * @returns {Function} ラップされた関数
 */
function apiHandler_(fn) {
  return function(...args) {
    const requestId = generateRequestId_();
    try {
      const result = fn.apply(this, args);
      return successResponse_(result, requestId);
    } catch (e) {
      Logger.log(`[${requestId}] Error in ${fn.name}: ${e.message}`);
      if (e.stack) {
        Logger.log(`[${requestId}] Stack: ${e.stack}`);
      }
      return errorResponse_(e, requestId);
    }
  };
}

/**
 * LockServiceによる排他制御付きAPIハンドラー
 * @param {Function} fn - 実行する関数
 * @param {number} lockTimeoutMs - ロックタイムアウト（ミリ秒）
 * @returns {Function} ラップされた関数
 */
function apiHandlerWithLock_(fn, lockTimeoutMs = 3000) {
  return function(...args) {
    const requestId = generateRequestId_();
    const lock = LockService.getScriptLock();

    try {
      const acquired = lock.tryLock(lockTimeoutMs);
      if (!acquired) {
        throw new BusyError();
      }

      const result = fn.apply(this, args);
      return successResponse_(result, requestId);
    } catch (e) {
      Logger.log(`[${requestId}] Error in ${fn.name}: ${e.message}`);
      return errorResponse_(e, requestId);
    } finally {
      try {
        lock.releaseLock();
      } catch (e) {
        // ロック解放エラーは無視
      }
    }
  };
}

// 後方互換性のためのエイリアス
// 既存コードで ERROR_CODES を使用している箇所のため
const ERROR_CODES = ErrorCodes;
