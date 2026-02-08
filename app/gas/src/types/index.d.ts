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
  type AssignmentStatus = 'assigned' | 'confirmed' | 'cancelled';
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

  // === エラー系（errors.ts） ===
  type ErrorCode = 'VALIDATION_ERROR' | 'PERMISSION_DENIED' | 'NOT_FOUND'
    | 'CONFLICT_ERROR' | 'BUSY_ERROR' | 'SYSTEM_ERROR';

  // エラークラスは errors.ts に実装として定義

  // === 外部定数宣言（db.gs 等） ===
  const TABLE_SHEET_MAP: Record<string, string>;

  // === DB関数宣言（db.gs, repository.gs, config.ts） ===
  function getSpreadsheetId(): string;
  function getDb(): GoogleAppsScript.Spreadsheet.Spreadsheet;
  function getSheet(tableName: string): GoogleAppsScript.Spreadsheet.Sheet;
  function findSheetFromDb(db: GoogleAppsScript.Spreadsheet.Spreadsheet, tableName: string): GoogleAppsScript.Spreadsheet.Sheet | null;
  function getSheetFromDb(db: GoogleAppsScript.Spreadsheet.Spreadsheet, tableName: string): GoogleAppsScript.Spreadsheet.Sheet;
  function getSheetDirect(sheetName: string): GoogleAppsScript.Spreadsheet.Sheet;

  // === 外部関数宣言（utils.gs, auth.gs, errors.ts 等） ===
  function generateRequestId(): string;
  function buildSuccessResponse(data: unknown, requestId: string): { ok: true; data: unknown; serverTime: string; requestId: string };
  function buildErrorResponse(code: string, message: string, details: unknown, requestId: string): { ok: false; error: { code: string; message: string; details?: unknown }; requestId: string };
  function checkPermission(requiredRole: string): { allowed: boolean; message: string };
  function requirePermission(requiredRole: string): { allowed: boolean; message: string };
  function logErr(context: string, error: unknown, requestId?: string): void;
  function getCurrentUserEmail(): string;

  // === UI関連（ui_jobs.ts） ===
  interface PageConfig {
    file: string;
    title: string;
  }
}
