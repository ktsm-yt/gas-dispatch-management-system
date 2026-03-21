// GAS API stubs for Vitest runtime
// GASグローバル関数をスタブ化し、純粋関数テストを可能にする

import { vi } from 'vitest';

// === Existing stubs ===

globalThis.Logger = { log: console.log };

globalThis.MasterCache = {
  getCustomPriceMap: () => ({}),   // Record<string, number> — plain object（実装が map[key] ブラケットアクセスのため）
  getCompany: () => null,
};

globalThis.PropertiesService = {
  getScriptProperties: () => ({
    getProperty: () => null,
  }),
};

// === Error codes (from errors.ts) ===
(globalThis as any).ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT_ERROR: 'CONFLICT_ERROR',
  BUSY_ERROR: 'BUSY_ERROR',
  SYSTEM_ERROR: 'SYSTEM_ERROR',
  BUSINESS_ERROR: 'BUSINESS_ERROR',
  HAS_DEPENDENCIES: 'HAS_DEPENDENCIES'
};

// === Auth ===
(globalThis as any).ROLES = { ADMIN: 'admin', MANAGER: 'manager', STAFF: 'staff' };
(globalThis as any).checkPermission = vi.fn(() => ({ allowed: true, message: 'OK' }));

// === Request ID ===
(globalThis as any).generateRequestId = vi.fn(() => 'test-req-id');

// === Response builders (matching utils.gs implementation) ===
// NOTE: Real impl does JSON.parse(JSON.stringify(response)) and serializeForWeb
// For tests, we simplify but keep the same structure
(globalThis as any).buildSuccessResponse = vi.fn((data: unknown, requestId?: string) => ({
  ok: true,
  data: data,
  serverTime: '2026-03-21T00:00:00.000Z',
  requestId: requestId || 'test-req-id'
}));

(globalThis as any).buildErrorResponse = vi.fn((code: string, message: string, details?: unknown, requestId?: string) => ({
  ok: false,
  error: {
    code: code,
    message: code === 'SYSTEM_ERROR' ? 'システムエラーが発生しました' : message,
    details: details || {}
  },
  serverTime: '2026-03-21T00:00:00.000Z',
  requestId: requestId || 'test-req-id'
}));

// === Logging ===
(globalThis as any).logErr = vi.fn();

// === withScriptLock (matching repository.gs implementation) ===
// Default: pass-through (calls fn). Override per-test for lock failure.
(globalThis as any).withScriptLock = vi.fn((fn: () => unknown, _options?: unknown) => fn());

// === Services (stubbed, spied on in individual tests) ===
(globalThis as any).StatsService = {
  updateMonthlyStats: vi.fn(() => ({ success: true, stats: {}, created: false })),
  _aggregateByCustomerYearly: vi.fn(() => ({ fiscalYears: [], customers: [] })),
};

(globalThis as any).PayoutService = {
  saveDraft: vi.fn(() => ({ success: true })),
  confirmPayout: vi.fn(() => ({ success: true })),
  markAsPaid: vi.fn(() => ({ success: true })),
  bulkConfirmPayouts: vi.fn(() => ({ success: true })),
  bulkMarkAsPaid: vi.fn(() => ({ success: true })),
  bulkPayConfirmed: vi.fn(() => ({ success: true })),
};

(globalThis as any).InvoiceService = {
  generate: vi.fn(() => ({ success: true, invoice: {}, lines: [] })),
  bulkGenerate: vi.fn(() => ({ success: [], skippedNoData: [], skippedExisting: [], failed: [] })),
  save: vi.fn(() => ({ success: true })),
  regenerate: vi.fn(() => ({ success: true, invoice: { billing_year: 2026, billing_month: 3 } })),
};

// === Repositories (only what controllers access directly) ===
(globalThis as any).InvoiceRepository = {
  findById: vi.fn(() => ({ invoice_id: 'inv_1', updated_at: '2026-03-21T00:00:00.000Z' })),
};

(globalThis as any).StatsRepository = {
  findByPeriod: vi.fn(() => null),
};

(globalThis as any).StaffRepository = {
  search: vi.fn(() => []),
};

// === CacheService ===
const mockCache = {
  get: vi.fn(() => null),
  put: vi.fn(),
  remove: vi.fn(),
};
(globalThis as any).CacheService = {
  getScriptCache: vi.fn(() => mockCache),
};

// === LockService (not used directly if withScriptLock is stubbed, but needed for type resolution) ===
(globalThis as any).LockService = {
  getScriptLock: vi.fn(() => ({ waitLock: vi.fn(), tryLock: vi.fn(() => true), releaseLock: vi.fn() })),
};

// === Utilities ===
(globalThis as any).Utilities = {
  formatDate: vi.fn(() => '20260321'),
  getUuid: vi.fn(() => 'test-uuid'),
};

