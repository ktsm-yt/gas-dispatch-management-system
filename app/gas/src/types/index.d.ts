export {};

declare global {
  // 共通型定義（段階的に追加）
  interface AssignmentSlot {
    id: string;
    job_id: string;
    staff_id: string;
    slot_type: 'am' | 'pm' | 'yakin' | 'jotou' | 'shuujitsu';
    // ... 他のプロパティ
  }

  interface AssignmentChanges {
    upserts: AssignmentSlot[];
    deletes: string[];
  }

  interface ApiResponse<T = unknown> {
    ok: boolean;
    data?: T;
    error?: {
      code: string;
      message: string;
    };
  }

  // === ステータス系（status_rules.ts） ===
  type JobStatus = 'pending' | 'assigned' | 'hold' | 'cancelled' | 'problem';
  type AssignmentStatus = 'ASSIGNED' | 'CONFIRMED' | 'CANCELLED';
  type InvoiceStatus = 'unsent' | 'sent' | 'paid' | 'unpaid';
  type InvoiceLegacyStatus = 'draft' | 'issued';
  type PayoutStatus = 'draft' | 'confirmed' | 'paid';
  type TimeSlot = 'am' | 'pm' | 'yakin' | 'jotou' | 'shuujitsu' | 'mitei';
  type JobType = 'tobi' | 'age' | 'tobiage';

  interface AssignmentSummary {
    statusText: string;
    isComplete: boolean;
    shortage: number;
  }

  interface BulkInvoiceCheckResult {
    canIssue: Record<string, unknown>[];
    cannotIssue: { invoice: Record<string, unknown>; reason: string }[];
  }

  // === エラー系（errors.js → errors.ts で詳細化予定） ===
  type ErrorCode = 'VALIDATION_ERROR' | 'PERMISSION_DENIED' | 'NOT_FOUND'
    | 'CONFLICT_ERROR' | 'BUSY_ERROR' | 'SYSTEM_ERROR';

  class AppError extends Error {
    code: string;
    details: unknown;
    constructor(code: string, message: string, details?: unknown);
    toResponse(): { code: string; message: string; details: unknown };
  }

  class ValidationError extends AppError {
    constructor(message: string, details?: unknown);
  }

  class PermissionDeniedError extends AppError {
    constructor(message?: string);
  }

  class NotFoundError extends AppError {
    constructor(message: string, details?: unknown);
  }

  class ConflictError extends AppError {
    constructor(message: string, details?: unknown);
  }

  class BusyError extends AppError {
    constructor(message?: string);
  }
}
