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
  type InvoiceStatus = 'unsent' | 'sent' | 'paid' | 'unpaid' | 'hold';
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
    | 'CONFLICT_ERROR' | 'BUSY_ERROR' | 'SYSTEM_ERROR' | 'BUSINESS_ERROR';

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

  // === Payoutドメイン型 ===
  type PayoutType = 'STAFF' | 'SUBCONTRACTOR';

  interface PayoutRecord {
    payout_id: string;
    payout_type: PayoutType;
    staff_id: string;
    subcontractor_id: string;
    period_start: string;
    period_end: string;
    assignment_count: number;
    base_amount: number;
    transport_amount: number;
    adjustment_amount: number;
    tax_amount: number;
    total_amount: number;
    status: PayoutStatus;
    paid_date: string;
    notes: string;
    created_at: string;
    created_by: string;
    updated_at: string;
    is_deleted: boolean;
  }

  interface PayoutSearchQuery {
    payout_type?: PayoutType;
    staff_id?: string;
    subcontractor_id?: string;
    status?: PayoutStatus;
    status_in?: PayoutStatus[];
    period_start_from?: string | null;
    period_end_to?: string;
    paid_date_from?: string;
    paid_date_to?: string;
    sort_order?: 'asc' | 'desc';
    limit?: number;
  }

  interface PayoutUpdateResult {
    success: boolean;
    payout?: PayoutRecord;
    error?: string;
    before?: Record<string, unknown>;
    currentUpdatedAt?: string;
  }

  interface UnpaidStaffItem {
    staffId: string;
    staffName: string;
    unpaidCount: number;
    baseAmount: number;
    transportAmount: number;
    estimatedAmount: number;
    taxAmount: number;
    periodStart: string;
    periodEnd: string;
    assignmentIds: string[];
  }

  // === DB関数宣言（db.gs） ===
  function getRecordById(tableName: string, idColumn: string, id: string): Record<string, unknown> | null;
  function getAllRecords(tableName: string, options?: { includeDeleted?: boolean }): Record<string, unknown>[];
  function insertRecord(tableName: string, record: Record<string, unknown>): Record<string, unknown>;
  function insertRecords(tableName: string, records: Record<string, unknown>[]): Record<string, unknown>[];
  function findRowById(sheet: GoogleAppsScript.Spreadsheet.Sheet, idColumn: string, id: string): number | null;
  function getHeaders(sheet: GoogleAppsScript.Spreadsheet.Sheet): string[];
  function rowToObject(headers: string[], row: unknown[]): Record<string, unknown>;
  function objectToRow(headers: string[], obj: Record<string, unknown>): unknown[];

  // === ユーティリティ関数宣言（utils.gs） ===
  function generateId(prefix: string): string;
  function getCurrentTimestamp(): string;

  // === 監査ログ関数宣言（audit_log.gs） ===
  function logCreate(tableName: string, recordId: string, data: unknown): void;
  function logUpdate(tableName: string, recordId: string, before: unknown, after: unknown): void;
  function logDelete(tableName: string, recordId: string, data: unknown): void;
  function logCreateBulk(tableName: string, records: { recordId: string; data: unknown }[]): void;
  function logUpdateBulk(tableName: string, records: { recordId: string; before: unknown; after: unknown }[]): void;

  // === 認証定数（auth.gs） ===
  const ROLES: { ADMIN: string; MANAGER: string; STAFF: string };

  // === MasterCache（utils.gs） ===
  const MasterCache: {
    getStaff(): Record<string, unknown>[];
    getStaffMap(): Record<string, Record<string, unknown>>;
    getSubcontractors(): Record<string, unknown>[];
  };

  // === 計算ユーティリティ（calc_utils.ts） ===
  function calculateMonthlyPayout_(
    assignments: Record<string, unknown>[],
    staff: Record<string, unknown> | null | undefined
  ): { baseAmount: number; transportAmount: number; totalAmount: number };

  // === 未移行リポジトリのambient宣言（TS移行時に削除して実装に置き換え） ===
  const JobRepository: {
    search(query: Record<string, unknown>): Record<string, unknown>[];
  };
  const AssignmentRepository: {
    findByStaffId(staffId: string): Record<string, unknown>[];
    search(query: Record<string, unknown>): Record<string, unknown>[];
    bulkUpdatePayoutId(updates: { assignment_id: string; payout_id: string | null }[]): { success: number };
  };
  const StaffRepository: {
    findById(staffId: string): Record<string, unknown> | null;
    findByIds(staffIds: string[]): Map<string, Record<string, unknown>>;
    search(query: Record<string, unknown>): Record<string, unknown>[];
  };
  const SubcontractorRepository: {
    findById(id: string): Record<string, unknown> | null;
    findByIds(ids: string[]): Map<string, Record<string, unknown>>;
    search(query: Record<string, unknown>): Record<string, unknown>[];
  };
}
