import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  generateInvoice,
  bulkGenerateInvoices,
  saveInvoice,
  regenerateInvoice,
} from '../../app/gas/src/controllers/api_invoices';

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

function resetMocks() {
  vi.restoreAllMocks();

  (globalThis as any).checkPermission = vi.fn(() => ({ allowed: true, message: 'OK' }));
  (globalThis as any).generateRequestId = vi.fn(() => 'test-req-id');

  (globalThis as any).buildSuccessResponse = vi.fn((data: unknown, requestId?: string) => ({
    ok: true,
    data,
    serverTime: '2026-03-21T00:00:00.000Z',
    requestId: requestId ?? 'test-req-id',
  }));

  (globalThis as any).buildErrorResponse = vi.fn(
    (code: string, message: string, details?: unknown, requestId?: string) => ({
      ok: false,
      error: {
        code,
        message: code === 'SYSTEM_ERROR' ? 'システムエラーが発生しました' : message,
        details: details ?? {},
      },
      serverTime: '2026-03-21T00:00:00.000Z',
      requestId: requestId ?? 'test-req-id',
    })
  );

  // Default: pass-through lock
  (globalThis as any).withScriptLock = vi.fn((fn: (ctx: { release: () => void }) => unknown, _opts?: unknown) => fn({ release: vi.fn() }));

  (globalThis as any).InvoiceService = {
    generate: vi.fn(() => ({ success: true, invoice: {}, lines: [] })),
    bulkGenerate: vi.fn(() => ({
      success: [],
      skippedNoData: [],
      skippedExisting: [],
      failed: [],
    })),
    save: vi.fn(() => ({ success: true })),
    regenerate: vi.fn(() => ({
      success: true,
      invoice: { billing_year: 2026, billing_month: 3 },
    })),
  };

  (globalThis as any).StatsService = {
    updateMonthlyStats: vi.fn(() => ({ success: true, stats: {}, created: false })),
  };

  (globalThis as any).InvoiceRepository = {
    findById: vi.fn(() => ({
      invoice_id: 'inv_1',
      updated_at: '2026-03-21T00:00:00.000Z',
    })),
  };
}

// ----------------------------------------------------------------
// generateInvoice
// ----------------------------------------------------------------

describe('generateInvoice', () => {
  beforeEach(resetMocks);

  it('正常: 有効な引数 → ok: true', () => {
    const result = generateInvoice('cust_1', '2026-03') as any;
    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ success: true, invoice: {}, lines: [] });
    expect((globalThis as any).InvoiceService.generate).toHaveBeenCalledWith('cust_1', 2026, 3, {});
  });

  it('エラー: customerId が空文字 → VALIDATION_ERROR', () => {
    const result = generateInvoice('', '2026-03') as any;
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('VALIDATION_ERROR');
    expect(result.error.message).toMatch(/customerId/i);
  });

  it('エラー: ym が無効なフォーマット → VALIDATION_ERROR', () => {
    const result = generateInvoice('cust_1', '202603') as any;
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('VALIDATION_ERROR');
    expect(result.error.message).toMatch(/YYYY-MM/);
  });

  it('エラー: 権限なし → PERMISSION_DENIED', () => {
    (globalThis as any).checkPermission = vi.fn(() => ({
      allowed: false,
      message: '権限がありません',
    }));
    const result = generateInvoice('cust_1', '2026-03') as any;
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('PERMISSION_DENIED');
    expect(result.error.message).toBe('権限がありません');
  });

  it('エラー: INVOICE_ALREADY_EXISTS → CONFLICT_ERROR, 日本語メッセージ', () => {
    (globalThis as any).InvoiceService.generate = vi.fn(() => ({
      success: false,
      error: 'INVOICE_ALREADY_EXISTS',
      existingInvoice: { invoice_id: 'inv_existing' },
    }));
    const result = generateInvoice('cust_1', '2026-03') as any;
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('CONFLICT_ERROR');
    expect(result.error.message).toBe('既に請求書が存在します');
    expect(result.error.details.existingInvoice).toEqual({ invoice_id: 'inv_existing' });
  });

  it('エラー: NO_ASSIGNMENTS_FOUND → VALIDATION_ERROR, 日本語メッセージ', () => {
    (globalThis as any).InvoiceService.generate = vi.fn(() => ({
      success: false,
      error: 'NO_ASSIGNMENTS_FOUND',
    }));
    const result = generateInvoice('cust_1', '2026-03') as any;
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('VALIDATION_ERROR');
    expect(result.error.message).toBe('該当期間の配置データがありません');
  });

  it('正常: StatsService.updateMonthlyStats が例外を投げても ok: true', () => {
    (globalThis as any).StatsService.updateMonthlyStats = vi.fn(() => {
      throw new Error('stats failure');
    });
    const result = generateInvoice('cust_1', '2026-03') as any;
    expect(result.ok).toBe(true);
  });

  it('ロック失敗: withScriptLock が BUSY_ERROR を返す → ok: false, BUSY_ERROR', () => {
    (globalThis as any).withScriptLock = vi.fn(
      (_fn: () => unknown, _opts?: unknown) =>
        (globalThis as any).buildErrorResponse('BUSY_ERROR', 'ロック取得失敗', {}, 'test-req-id')
    );
    const result = generateInvoice('cust_1', '2026-03') as any;
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('BUSY_ERROR');
  });
});

// ----------------------------------------------------------------
// bulkGenerateInvoices
// ----------------------------------------------------------------

describe('bulkGenerateInvoices', () => {
  beforeEach(resetMocks);

  it('正常: 有効な ym → ok: true', () => {
    const result = bulkGenerateInvoices('2026-03') as any;
    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ success: [], skippedNoData: [], skippedExisting: [], failed: [] });
    expect((globalThis as any).InvoiceService.bulkGenerate).toHaveBeenCalledWith(2026, 3, {});
  });

  it('エラー: ym が未指定 → VALIDATION_ERROR', () => {
    const result = bulkGenerateInvoices('' as any) as any;
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('VALIDATION_ERROR');
    expect(result.error.message).toMatch(/YYYY-MM/);
  });

  it('エラー: 権限なし → PERMISSION_DENIED', () => {
    (globalThis as any).checkPermission = vi.fn(() => ({
      allowed: false,
      message: '権限がありません',
    }));
    const result = bulkGenerateInvoices('2026-03') as any;
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('PERMISSION_DENIED');
    expect(result.error.message).toBe('権限がありません');
  });

  it('ALREADY_RUNNING: 同時実行でBUSY_ERRORとALREADY_RUNNINGを返す', () => {
    // Simulate withScriptLock calling buildErrorResponse with the busyDetails the controller passes
    (globalThis as any).withScriptLock = vi.fn(
      (_fn: () => unknown, opts: any) =>
        (globalThis as any).buildErrorResponse(
          'BUSY_ERROR',
          opts.busyMessage,
          opts.busyDetails,
          opts.requestId
        )
    );

    const result = bulkGenerateInvoices('2026-03') as any;
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('BUSY_ERROR');
    expect(result.error.details.error).toBe('ALREADY_RUNNING');
    expect(result.error.message).toContain('一括集計が別の端末で実行中');
  });

  it('正常: StatsService が例外を投げても ok: true', () => {
    (globalThis as any).StatsService.updateMonthlyStats = vi.fn(() => {
      throw new Error('stats failure');
    });
    const result = bulkGenerateInvoices('2026-03') as any;
    expect(result.ok).toBe(true);
  });
});

// ----------------------------------------------------------------
// saveInvoice
// ----------------------------------------------------------------

describe('saveInvoice', () => {
  beforeEach(resetMocks);

  it('正常: 有効な invoice + lines → ok: true', () => {
    const invoice = { invoice_id: 'inv_1', _archived: false };
    const lines: unknown[] = [];
    const expectedUpdatedAt = '2026-03-21T00:00:00.000Z';
    const result = saveInvoice(invoice, lines, expectedUpdatedAt) as any;
    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ success: true });
    expect((globalThis as any).InvoiceService.save).toHaveBeenCalledWith(invoice, lines, expectedUpdatedAt);
  });

  it('エラー: invoice が null → VALIDATION_ERROR', () => {
    const result = saveInvoice(null as any, [], '2026-03-21T00:00:00.000Z') as any;
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('VALIDATION_ERROR');
    expect(result.error.message).toMatch(/invoice_id/i);
  });

  it('エラー: invoice.invoice_id が未指定 → VALIDATION_ERROR', () => {
    const result = saveInvoice({} as any, [], '2026-03-21T00:00:00.000Z') as any;
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('VALIDATION_ERROR');
    expect(result.error.message).toMatch(/invoice_id/i);
  });

  it('エラー: InvoiceService.save が CONFLICT_ERROR → error.code === CONFLICT_ERROR', () => {
    (globalThis as any).InvoiceService.save = vi.fn(() => ({
      success: false,
      error: 'CONFLICT_ERROR',
    }));
    const result = saveInvoice(
      { invoice_id: 'inv_1' },
      [],
      '2026-03-20T00:00:00.000Z'
    ) as any;
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('CONFLICT_ERROR');
  });
});

// ----------------------------------------------------------------
// regenerateInvoice
// ----------------------------------------------------------------

describe('regenerateInvoice', () => {
  beforeEach(resetMocks);

  it('正常: 有効な invoiceId → ok: true', () => {
    const result = regenerateInvoice('inv_1') as any;
    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ success: true, invoice: { billing_year: 2026, billing_month: 3 } });
    expect((globalThis as any).InvoiceService.regenerate).toHaveBeenCalledWith('inv_1');
  });

  it('エラー: invoiceId が空文字 → VALIDATION_ERROR', () => {
    const result = regenerateInvoice('') as any;
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('VALIDATION_ERROR');
    expect(result.error.message).toMatch(/invoiceId/i);
  });

  it('楽観ロック失敗: expectedUpdatedAt 不一致 → CONFLICT_ERROR', () => {
    (globalThis as any).InvoiceRepository.findById = vi.fn(() => ({
      invoice_id: 'inv_1',
      updated_at: '2026-03-20T00:00:00.000Z', // different from expected
    }));

    const result = regenerateInvoice('inv_1', '2026-03-19T00:00:00.000Z') as any;
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('CONFLICT_ERROR');
  });

  it('ロック失敗: withScriptLock が BUSY_ERROR を返す → ok: false, BUSY_ERROR', () => {
    (globalThis as any).withScriptLock = vi.fn(
      (_fn: () => unknown, _opts?: unknown) =>
        (globalThis as any).buildErrorResponse('BUSY_ERROR', 'ロック取得失敗', {}, 'test-req-id')
    );
    const result = regenerateInvoice('inv_1') as any;
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('BUSY_ERROR');
  });
});
