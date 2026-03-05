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
    | 'CONFLICT_ERROR' | 'BUSY_ERROR' | 'SYSTEM_ERROR' | 'BUSINESS_ERROR'
    | 'INVALID_INPUT';

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
  function buildSuccessResponse(data: unknown, requestId?: string): { ok: true; data: unknown; serverTime: string; requestId: string };
  function buildErrorResponse(code: string, message: string, details?: unknown, requestId?: string): { ok: false; error: { code: string; message: string; details?: unknown }; requestId: string };
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
    ninku_coefficient: number;
    ninku_adjustment_amount: number;
    tax_amount: number;
    total_amount: number;
    status: PayoutStatus;
    paid_date: string;
    notes: string;
    created_at: string;
    created_by: string;
    updated_at: string;
    is_deleted: boolean;
    // アーカイブメタフィールド（_getArchiveRecordsで付与）
    _archived?: boolean;
    _archiveFiscalYear?: number;
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

  // === Jobドメイン型 ===
  interface JobRecord {
    job_id: string;
    customer_id: string;
    site_name: string;
    site_address: string;
    work_date: string;
    time_slot: TimeSlot;
    start_time: string;
    required_count: number;
    pay_unit: string;
    work_category: string;
    work_detail: string;
    work_detail_other_text: string;
    supervisor_name: string;
    order_number: string;
    branch_office: string;
    property_code: string;
    construction_div: string;
    status: JobStatus;
    is_damaged: boolean;
    is_uncollected: boolean;
    is_claimed: boolean;
    notes: string;
    created_at: string;
    created_by: string;
    updated_at: string;
    updated_by: string;
    is_deleted: boolean;
    deleted_at: string;
    deleted_by: string;
    _archived?: boolean;
    _archiveFiscalYear?: number;
  }

  interface JobSearchQuery {
    customer_id?: string;
    work_date_from?: string;
    work_date_to?: string;
    date_from?: string;
    date_to?: string;
    status?: JobStatus | string;
    time_slot?: TimeSlot | string;
    site_name?: string;
    limit?: number;
    sort_order?: 'asc' | 'desc';
    includeArchive?: boolean;
    job_ids?: string[];
  }

  interface JobUpdateResult {
    success: boolean;
    job?: JobRecord;
    error?: string;
    before?: Record<string, unknown>;
    currentUpdatedAt?: string;
    message?: string;
  }

  interface UnpaidStaffItem {
    staffId: string;
    staffName: string;
    staffNameKana: string;
    unpaidCount: number;
    baseAmount: number;
    transportAmount: number;
    ninkuCoefficient: number;
    ninkuAdjustmentAmount: number;
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
  function invalidateExecutionCache(tableName?: string): void;

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

  // === Invoiceドメイン型 ===
  type InvoiceFormat = 'format1' | 'format2';

  interface InvoiceRecord {
    invoice_id: string;
    invoice_number: string;
    customer_id: string;
    billing_year: number;
    billing_month: number;
    issue_date: string;
    due_date: string;
    subtotal: number;
    expense_amount: number;
    tax_amount: number;
    total_amount: number;
    adjustment_total: number;
    invoice_format: string;
    shipper_name: string;
    pdf_file_id: string;
    excel_file_id: string;
    sheet_file_id: string;
    status: InvoiceStatus | InvoiceLegacyStatus;
    has_assignment_changes: boolean | string;
    notes: string;
    created_at: string;
    created_by: string;
    updated_at: string;
    updated_by: string;
    is_deleted: boolean;
    deleted_at: string;
    deleted_by: string;
    // アーカイブメタフィールド（_getArchiveRecordsで付与）
    _archived?: boolean;
    _archiveFiscalYear?: number;
  }

  interface InvoiceLineRecord {
    line_id: string;
    invoice_id: string;
    line_number: number;
    work_date: string;
    job_id: string;
    assignment_id: string;
    site_name: string;
    item_name: string;
    time_note: string;
    quantity: number;
    unit: string;
    unit_price: number;
    amount: number;
    order_number: string;
    branch_office: string;
    construction_div: string;
    supervisor_name: string;
    property_code: string;
    tax_amount: number;
    created_at: string;
    created_by: string;
    updated_at: string;
    updated_by: string;
    is_deleted: boolean;
    deleted_at: string;
    deleted_by: string;
    _archived?: boolean;
    _archiveFiscalYear?: number;
  }

  interface InvoiceAdjustmentRecord {
    adjustment_id: string;
    invoice_id: string;
    item_name: string;
    amount: number;
    sort_order: number;
    notes: string;
    created_at: string;
    created_by: string;
    updated_at: string;
    updated_by: string;
    is_deleted: boolean;
    deleted_at: string;
    deleted_by: string;
  }

  interface PaymentRecord {
    payment_id: string;
    invoice_id: string;
    payment_date: string;
    amount: number;
    payment_method: string;
    bank_ref: string;
    notes: string;
    is_deleted: boolean;
    created_at: string;
    created_by: string;
    deleted_at: string;
    deleted_by: string;
  }

  interface InvoiceSearchQuery {
    customer_id?: string;
    billing_year?: number;
    billing_month?: number;
    billing_ym_from?: string;
    billing_ym_to?: string;
    status?: string;
    invoice_format?: string;
    sort_order?: 'asc' | 'desc';
    limit?: number;
    includeArchive?: boolean;
  }

  // === calc_utils.ts ドメイン型 ===
  interface CalcStaff {
    daily_rate_tobi?: number;
    daily_rate_age?: number;
    daily_rate_tobiage?: number;
    daily_rate_half?: number;
    daily_rate_basic?: number;
    daily_rate_fullday?: number;
    daily_rate_night?: number;
    [key: string]: unknown;
  }

  interface CalcCustomer {
    unit_price_tobi?: number;
    unit_price_age?: number;
    unit_price_tobiage?: number;
    unit_price_half?: number;
    unit_price_basic?: number;
    unit_price_fullday?: number;
    unit_price_night?: number;
    [key: string]: unknown;
  }

  interface CalcAssignment {
    /** 支払単価（実額・円）。倍率ではない。null/空 → スタッフマスタから自動取得 */
    wage_rate?: number | null | string;
    invoice_rate?: number | null | string;
    pay_unit?: string;
    invoice_unit?: string;
    transport_amount?: number;
    transport_area?: string;
    transport_is_manual?: boolean;
    [key: string]: unknown;
  }

  // === MasterCache（utils.gs） ===
  const MasterCache: {
    getStaff(): Record<string, unknown>[];
    getStaffMap(): Record<string, Record<string, unknown>>;
    getSubcontractors(): Record<string, unknown>[];
    getCustomers(): Record<string, unknown>[];
    getCustomerMap(): Record<string, Record<string, unknown>>;
    getTransportFees(): Record<string, unknown>[];
    getCompany(): Record<string, unknown> | null;
    invalidateCustomers(): void;
    invalidateStaff(): void;
    invalidateSubcontractors(): void;
    invalidateTransportFees(): void;
    invalidateCompany(): void;
  };

  // === 計算ユーティリティ（calc_utils.ts） ===
  // DEFAULT_TAX_RATE は calc_utils.ts で定義済み（ambient不要）
  function calculateMonthlyPayout_(
    assignments: Record<string, unknown>[],
    staff: Record<string, unknown> | null | undefined
  ): { baseAmount: number; transportAmount: number; totalAmount: number };
  function normalizeTaxRate_(taxRate: unknown): number;
  function normalizeRoundingMode_(mode: unknown): string;
  function calculateTaxAmount_(amount: number, taxRate: number, roundingMode?: string): number;
  function calculateTaxIncluded_(amount: unknown, taxRate: number, roundingMode?: string): number;
  function calculateExpense_(workAmount: number, expenseRate: number): number;
  function getUnitPriceByJobType_(customer: Record<string, unknown>, jobType: string): number;
  function calculateInvoiceForAtagami_(invoice: Record<string, unknown>, lines: Record<string, unknown>[], customer: Record<string, unknown>): Record<string, unknown>;
  function formatCurrency_(amount: number | null | undefined): string;

  // === 日付ユーティリティ（date_utils.ts） ===
  function calculateClosingPeriod_(year: number, month: number, closingDay: number): { startDate: string | null; endDate: string | null };

  // === ステータスルール（status_rules.ts） ===
  function isInvoiceEditable_(status: string): boolean;

  // === ダッシュボード横断検索 (CR-082) ===
  interface DashboardSearchParams {
    keyword: string;
    search_type?: 'all' | 'site' | 'staff';
    include_archive?: boolean;
    limit?: number;
  }

  interface DashboardSearchResult {
    job_id: string;
    work_date: string;
    time_slot: string;
    site_name: string;
    customer_name: string;
    staff_names: string[];
    assigned_count: number;
    status: string;
    _archived?: boolean;
    _archiveFiscalYear?: number;
  }

  // === 未移行リポジトリのambient宣言（TS移行時に削除して実装に置き換え） ===
  const AssignmentRepository: {
    findByStaffId(staffId: string): Record<string, unknown>[];
    findByJobId(jobId: string): Record<string, unknown>[];
    search(query: Record<string, unknown>): Record<string, unknown>[];
    bulkUpdatePayoutId(updates: { assignment_id: string; payout_id: string | null }[]): { success: number };
  };
  const CustomerRepository: {
    findById(id: string): Record<string, unknown> | null;
    search(query: Record<string, unknown>): Record<string, unknown>[];
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

  // === PayoutService 戻り値型 ===
  interface PayoutCalculationResult extends Record<string, unknown> {
    assignments: Record<string, unknown>[];
    baseAmount: number;
    transportAmount: number;
    totalAmount: number;
    taxAmount: number;
    assignmentCount: number;
  }

  // === 未移行サービスのambient宣言 ===
  const StatsService: {
    updateMonthlyStats(year: number, month: number): { success: boolean; error?: string; stats?: Record<string, unknown> };
  };
  const ArchiveService: {
    getArchiveDbId(fiscalYear: number): string | null;
    getCurrentFiscalYear(): number;
  };
  const CustomerFolderService: {
    getInvoiceFolder(customer: Record<string, unknown>): GoogleAppsScript.Drive.Folder | null;
    createCustomerFolder(customer: Record<string, unknown>): { folderId: string; folderUrl: string; invoiceFolderId: string; created: boolean };
    _updateCustomerFolderId(customerId: string, folderId: string): string;
  };

  // === 顧客系関数（master_service.gs） ===
  function listCustomers(options?: { activeOnly?: boolean }): { ok: boolean; data?: { items: Record<string, unknown>[] }; customers?: Record<string, unknown>[] };
  function listTransportFees(): { ok: boolean; data?: { items: Record<string, unknown>[] } } | Record<string, unknown>[];
  function getCompany(): Record<string, unknown> | null;

}
