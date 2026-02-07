// File: errors.ts
// エラーハンドリング共通処理（KTSM-63）

const ErrorCodes = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT_ERROR: 'CONFLICT_ERROR',
  BUSY_ERROR: 'BUSY_ERROR',
  SYSTEM_ERROR: 'SYSTEM_ERROR'
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

function generateRequestId_(): string {
  return 'req_' + Utilities.getUuid().replace(/-/g, '').substring(0, 12);
}

function getServerTime_(): string {
  return new Date().toISOString();
}

function successResponse_(data: unknown, requestId: string): { ok: true; data: unknown; serverTime: string; requestId: string } {
  return {
    ok: true,
    data: data,
    serverTime: getServerTime_(),
    requestId: requestId
  };
}

function errorResponse_(error: AppError | Error, requestId: string): { ok: false; error: { code: string; message: string; details?: unknown }; requestId: string } {
  if (error instanceof AppError) {
    return {
      ok: false,
      error: error.toResponse(),
      requestId: requestId
    };
  }
  return {
    ok: false,
    error: {
      code: ErrorCodes.SYSTEM_ERROR,
      message: error.message || 'システムエラーが発生しました'
    },
    requestId: requestId
  };
}

function apiHandler_(fn: (...args: unknown[]) => unknown): (...args: unknown[]) => unknown {
  return function(this: unknown, ...args: unknown[]): unknown {
    const requestId = generateRequestId();
    try {
      const result = fn.apply(this, args);
      return buildSuccessResponse(result, requestId);
    } catch (e: unknown) {
      const error = e as Error;
      Logger.log(`[${requestId}] Error in ${fn.name}: ${error.message}`);
      if (error.stack) {
        Logger.log(`[${requestId}] Stack: ${error.stack}`);
      }
      if (e instanceof AppError) {
        return buildErrorResponse(e.code, e.message, e.details, requestId);
      }
      return buildErrorResponse(ErrorCodes.SYSTEM_ERROR, error.message, {}, requestId);
    }
  };
}

function apiHandlerWithLock_(fn: (...args: unknown[]) => unknown, lockTimeoutMs: number = 3000): (...args: unknown[]) => unknown {
  return function(this: unknown, ...args: unknown[]): unknown {
    const requestId = generateRequestId();
    const lock = LockService.getScriptLock();

    try {
      const acquired = lock.tryLock(lockTimeoutMs);
      if (!acquired) {
        throw new BusyError();
      }

      const result = fn.apply(this, args);
      return buildSuccessResponse(result, requestId);
    } catch (e: unknown) {
      const error = e as Error;
      Logger.log(`[${requestId}] Error in ${fn.name}: ${error.message}`);
      if (e instanceof AppError) {
        return buildErrorResponse(e.code, e.message, e.details, requestId);
      }
      return buildErrorResponse(ErrorCodes.SYSTEM_ERROR, error.message, {}, requestId);
    } finally {
      try {
        lock.releaseLock();
      } catch (_e) {
        // ロック解放エラーは無視
      }
    }
  };
}

// 後方互換性のためのエイリアス
const ERROR_CODES = ErrorCodes;

function requirePermission(requiredRole: string): void {
  const authResult = checkPermission(requiredRole);
  if (!authResult.allowed) {
    throw new PermissionDeniedError(authResult.message);
  }
}

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
