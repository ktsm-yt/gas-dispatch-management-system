// File: errors.ts
// エラーハンドリング共通処理（KTSM-63）

const ErrorCodes = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT_ERROR: 'CONFLICT_ERROR',
  BUSY_ERROR: 'BUSY_ERROR',
  SYSTEM_ERROR: 'SYSTEM_ERROR',
  BUSINESS_ERROR: 'BUSINESS_ERROR',
  HAS_DEPENDENCIES: 'HAS_DEPENDENCIES'
} as const;

class AppError extends Error {
  code: string;
  details: unknown;

  constructor(code: string, message: string, details: unknown = null) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
  }

  toResponse(): { code: string; message: string; details: unknown } {
    return {
      code: this.code,
      message: this.message,
      details: this.details
    };
  }
}

class ValidationError extends AppError {
  constructor(message: string, details: unknown = null) {
    super(ErrorCodes.VALIDATION_ERROR, message, details);
    this.name = 'ValidationError';
  }
}

class PermissionDeniedError extends AppError {
  constructor(message: string = '権限がありません') {
    super(ErrorCodes.PERMISSION_DENIED, message);
    this.name = 'PermissionDeniedError';
  }
}

class NotFoundError extends AppError {
  constructor(resourceName: string, id: string) {
    super(
      ErrorCodes.NOT_FOUND,
      `${resourceName}が見つかりません: ${id}`,
      { resource: resourceName, id }
    );
    this.name = 'NotFoundError';
  }
}

class ConflictError extends AppError {
  constructor(message: string = 'データが他のユーザーによって更新されています', details: unknown = null) {
    super(ErrorCodes.CONFLICT_ERROR, message, details);
    this.name = 'ConflictError';
  }
}

class BusyError extends AppError {
  constructor(message: string = '現在混み合っています。しばらくしてから再度お試しください') {
    super(ErrorCodes.BUSY_ERROR, message);
    this.name = 'BusyError';
  }
}

class SystemError extends AppError {
  declare cause: Error | null;

  constructor(message: string = 'システムエラーが発生しました', cause: Error | null = null) {
    super(ErrorCodes.SYSTEM_ERROR, message, cause ? { cause: cause.message } : null);
    this.name = 'SystemError';
    this.cause = cause;
  }
}

/**
 * エラーログを統一フォーマットで出力（requestId・スタックトレース付き）
 *
 * @param context - エラー発生箇所（関数名やコンテキスト）
 * @param error - キャッチしたエラー（unknown型対応）
 * @param requestId - APIリクエストID（省略可）
 */
function logErr(context: string, error: unknown, requestId?: string): void {
  const prefix = requestId ? `[${requestId}] ` : '';
  const msg = error instanceof Error ? error.message : String(error);
  Logger.log(`${prefix}Error in ${context}: ${msg}`);
  if (error instanceof Error && error.stack) {
    Logger.log(`${prefix}Stack: ${error.stack}`);
  }
}

/**
 * API関数をラップし、成功/エラーレスポンスを自動構築する
 *
 * @example
 * const getJobApi = apiHandler_(function getJob(params) {
 *   return JobService.getJob(params.id);
 * });
 *
 * @see utils.gs buildSuccessResponse / buildErrorResponse
 */
function apiHandler_(fn: (...args: unknown[]) => unknown): (...args: unknown[]) => unknown {
  return function(this: unknown, ...args: unknown[]): unknown {
    const requestId = generateRequestId();
    try {
      const result = fn.apply(this, args);
      return buildSuccessResponse(result, requestId);
    } catch (e: unknown) {
      logErr(fn.name || 'anonymous', e, requestId);
      if (e instanceof AppError) {
        return buildErrorResponse(e.code, e.message, e.details, requestId);
      }
      const msg = e instanceof Error ? e.message : String(e);
      return buildErrorResponse(ErrorCodes.SYSTEM_ERROR, msg, {}, requestId);
    }
  };
}

// 後方互換性のためのエイリアス
const ERROR_CODES = ErrorCodes;

function requireParam(value: unknown, name: string): void {
  if (value === undefined || value === null || value === '') {
    throw new ValidationError(`${name} is required`, { field: name });
  }
}

function requireObject(obj: unknown, name: string): void {
  if (!obj || typeof obj !== 'object') {
    throw new ValidationError(`${name} object is required`, { field: name });
  }
}
