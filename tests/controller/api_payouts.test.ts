import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  saveDraftPayout,
  confirmPayout,
  markAsPaid,
  bulkConfirmPayouts,
  bulkMarkAsPaid,
  bulkPayConfirmed,
} from '../../app/gas/src/controllers/api_payouts';

// ─────────────────────────────────────────────
// Shared beforeEach helper – resets all mocks and restores defaults
// ─────────────────────────────────────────────
function resetMocks() {
  vi.restoreAllMocks();

  (globalThis as any).checkPermission.mockReturnValue({ allowed: true, message: 'OK' });
  (globalThis as any).generateRequestId.mockReturnValue('test-req-id');
  (globalThis as any).withScriptLock.mockImplementation((fn: (ctx: { release: () => void }) => unknown) => fn({ release: vi.fn() }));

  (globalThis as any).buildSuccessResponse.mockImplementation((data: unknown, reqId?: string) => ({
    ok: true,
    data,
    serverTime: '2026-03-21T00:00:00.000Z',
    requestId: reqId || 'test-req-id',
  }));

  (globalThis as any).buildErrorResponse.mockImplementation(
    (code: string, msg: string, details?: unknown, reqId?: string) => ({
      ok: false,
      error: {
        code,
        message: code === 'SYSTEM_ERROR' ? 'システムエラーが発生しました' : msg,
        details: details || {},
      },
      serverTime: '2026-03-21T00:00:00.000Z',
      requestId: reqId || 'test-req-id',
    })
  );

  // Service defaults
  (globalThis as any).PayoutService.saveDraft.mockReturnValue({ success: true, payout: { payout_id: 'p_1' } });
  (globalThis as any).PayoutService.confirmPayout.mockReturnValue({ success: true, payout: { payout_id: 'p_2' } });
  (globalThis as any).PayoutService.markAsPaid.mockReturnValue({ success: true, payout: { payout_id: 'p_3' } });
  (globalThis as any).PayoutService.bulkConfirmPayouts.mockReturnValue({ success: true, results: [] });
  (globalThis as any).PayoutService.bulkMarkAsPaid.mockReturnValue({ success: true, results: [] });
  (globalThis as any).PayoutService.bulkPayConfirmed.mockReturnValue({ success: true, results: [] });

  // StatsService default
  (globalThis as any).StatsService.updateMonthlyStats.mockReturnValue({ success: true });

}

// ─────────────────────────────────────────────
// saveDraftPayout
// ─────────────────────────────────────────────
describe('saveDraftPayout', () => {
  beforeEach(resetMocks);

  it('正常: valid args → ok: true, data contains payout', () => {
    const result = saveDraftPayout('stf_1', '2026-03-31') as any;
    expect(result.ok).toBe(true);
    expect(result.data.payout.payout_id).toBe('p_1');
  });

  it('エラー: staffId empty → VALIDATION_ERROR', () => {
    const result = saveDraftPayout('', '2026-03-31') as any;
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('エラー: endDate missing → VALIDATION_ERROR', () => {
    const result = saveDraftPayout('stf_1', '') as any;
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('エラー: endDate invalid format → VALIDATION_ERROR', () => {
    const result = saveDraftPayout('stf_1', 'invalid') as any;
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('エラー: permission denied → PERMISSION_DENIED', () => {
    (globalThis as any).checkPermission.mockReturnValueOnce({ allowed: false, message: '権限がありません' });
    const result = saveDraftPayout('stf_1', '2026-03-31') as any;
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('PERMISSION_DENIED');
  });

  it('エラー: Service returns CONFLICT_ERROR → error.code === CONFLICT_ERROR', () => {
    (globalThis as any).PayoutService.saveDraft.mockReturnValueOnce({ success: false, error: 'CONFLICT_ERROR' });
    const result = saveDraftPayout('stf_1', '2026-03-31') as any;
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('CONFLICT_ERROR');
  });

  it('エラー: Service returns other error → VALIDATION_ERROR', () => {
    (globalThis as any).PayoutService.saveDraft.mockReturnValueOnce({ success: false, error: 'SOME_OTHER_ERROR' });
    const result = saveDraftPayout('stf_1', '2026-03-31') as any;
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('ロック失敗: withScriptLock returns BUSY_ERROR response directly', () => {
    const busyResponse = {
      ok: false,
      error: { code: 'BUSY_ERROR', message: 'ロック取得に失敗', details: {} },
      requestId: 'test-req-id',
    };
    (globalThis as any).withScriptLock.mockReturnValueOnce(busyResponse);

    const result = saveDraftPayout('stf_1', '2026-03-31') as any;
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('BUSY_ERROR');
  });
});

// ─────────────────────────────────────────────
// confirmPayout
// ─────────────────────────────────────────────
describe('confirmPayout', () => {
  beforeEach(resetMocks);

  it('正常: ok: true', () => {
    const result = confirmPayout('stf_1', '2026-03-31') as any;
    expect(result.ok).toBe(true);
  });

  it('正常: StatsService.updateMonthlyStats is called after success', () => {
    confirmPayout('stf_1', '2026-03-31');
    expect((globalThis as any).StatsService.updateMonthlyStats).toHaveBeenCalledWith(2026, 3);
  });

  it('正常: StatsService.updateMonthlyStats throws → main response still ok: true', () => {
    (globalThis as any).StatsService.updateMonthlyStats.mockImplementationOnce(() => {
      throw new Error('stats failure');
    });
    const result = confirmPayout('stf_1', '2026-03-31') as any;
    expect(result.ok).toBe(true);
  });

  it('エラー: staffId empty → VALIDATION_ERROR', () => {
    const result = confirmPayout('', '2026-03-31') as any;
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('エラー: endDate invalid → VALIDATION_ERROR', () => {
    const result = confirmPayout('stf_1', '20260331') as any;
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('エラー: service failure → VALIDATION_ERROR', () => {
    (globalThis as any).PayoutService.confirmPayout.mockReturnValueOnce({ success: false, error: 'NOT_FOUND' });
    const result = confirmPayout('stf_1', '2026-03-31') as any;
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('ロック失敗: BUSY_ERROR', () => {
    const busyResponse = {
      ok: false,
      error: { code: 'BUSY_ERROR', message: 'ロック取得に失敗', details: {} },
      requestId: 'test-req-id',
    };
    (globalThis as any).withScriptLock.mockReturnValueOnce(busyResponse);

    const result = confirmPayout('stf_1', '2026-03-31') as any;
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('BUSY_ERROR');
  });
});

// ─────────────────────────────────────────────
// markAsPaid
// ─────────────────────────────────────────────
describe('markAsPaid', () => {
  beforeEach(resetMocks);

  it('正常: ok: true', () => {
    const result = markAsPaid('stf_1', '2026-03-31') as any;
    expect(result.ok).toBe(true);
  });

  it('エラー: staffId missing → VALIDATION_ERROR', () => {
    const result = markAsPaid('', '2026-03-31') as any;
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('エラー: paid_date invalid format → VALIDATION_ERROR', () => {
    const result = markAsPaid('stf_1', '2026-03-31', { paid_date: '20260401' }) as any;
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('正常: StatsService throws → still ok: true', () => {
    (globalThis as any).StatsService.updateMonthlyStats.mockImplementationOnce(() => {
      throw new Error('stats error');
    });
    const result = markAsPaid('stf_1', '2026-03-31') as any;
    expect(result.ok).toBe(true);
  });
});

// ─────────────────────────────────────────────
// bulkConfirmPayouts
// ─────────────────────────────────────────────
describe('bulkConfirmPayouts', () => {
  beforeEach(resetMocks);

  it('正常: valid staffIds → ok: true', () => {
    const result = bulkConfirmPayouts(['stf_1', 'stf_2'], '2026-03-31') as any;
    expect(result.ok).toBe(true);
  });

  it('エラー: empty staffIds → VALIDATION_ERROR', () => {
    const result = bulkConfirmPayouts([], '2026-03-31') as any;
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('エラー: staffIds not array → VALIDATION_ERROR', () => {
    // Pass null cast to defeat TypeScript check – tests runtime guard
    const result = bulkConfirmPayouts(null as any, '2026-03-31') as any;
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('エラー: endDate invalid → VALIDATION_ERROR', () => {
    const result = bulkConfirmPayouts(['stf_1'], 'bad-date') as any;
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('ロック失敗: BUSY_ERROR', () => {
    const busyResponse = {
      ok: false,
      error: { code: 'BUSY_ERROR', message: 'ロック取得に失敗', details: {} },
      requestId: 'test-req-id',
    };
    (globalThis as any).withScriptLock.mockReturnValueOnce(busyResponse);

    const result = bulkConfirmPayouts(['stf_1'], '2026-03-31') as any;
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('BUSY_ERROR');
  });
});

// ─────────────────────────────────────────────
// bulkMarkAsPaid
// ─────────────────────────────────────────────
describe('bulkMarkAsPaid', () => {
  beforeEach(resetMocks);

  it('正常: ok: true', () => {
    const result = bulkMarkAsPaid(['stf_1', 'stf_2'], '2026-03-31') as any;
    expect(result.ok).toBe(true);
  });

  it('エラー: empty staffIds → VALIDATION_ERROR', () => {
    const result = bulkMarkAsPaid([], '2026-03-31') as any;
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('エラー: paid_date invalid → VALIDATION_ERROR', () => {
    const result = bulkMarkAsPaid(['stf_1'], '2026-03-31', { paid_date: '2026/04/01' }) as any;
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('VALIDATION_ERROR');
  });
});

// ─────────────────────────────────────────────
// bulkPayConfirmed
// ─────────────────────────────────────────────
describe('bulkPayConfirmed', () => {
  beforeEach(resetMocks);

  it('正常: payoutIds + expectedUpdatedAtMap → ok: true', () => {
    const result = bulkPayConfirmed(
      ['p_10', 'p_11'],
      { expectedUpdatedAtMap: { p_10: '2026-03-01T00:00:00.000Z', p_11: '2026-03-01T00:00:00.000Z' } }
    ) as any;
    expect(result.ok).toBe(true);
  });

  it('エラー: payoutIds empty → VALIDATION_ERROR', () => {
    const result = bulkPayConfirmed(
      [],
      { expectedUpdatedAtMap: {} }
    ) as any;
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('エラー: expectedUpdatedAtMap missing → VALIDATION_ERROR', () => {
    const result = bulkPayConfirmed(['p_10'], {}) as any;
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('エラー: expectedUpdatedAtMap missing some IDs → VALIDATION_ERROR with details.missingPayoutIds', () => {
    const result = bulkPayConfirmed(
      ['p_10', 'p_11', 'p_12'],
      { expectedUpdatedAtMap: { p_10: '2026-03-01T00:00:00.000Z' } }
    ) as any;
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(result.error.details.missingPayoutIds)).toBe(true);
    expect(result.error.details.missingPayoutIds).toContain('p_11');
    expect(result.error.details.missingPayoutIds).toContain('p_12');
    expect(result.error.details.missingPayoutIds).not.toContain('p_10');
  });

  it('エラー: paid_date invalid → VALIDATION_ERROR', () => {
    const result = bulkPayConfirmed(
      ['p_10'],
      {
        expectedUpdatedAtMap: { p_10: '2026-03-01T00:00:00.000Z' },
        paid_date: '20260401',
      }
    ) as any;
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('Service例外: SYSTEM_ERROR', () => {
    (globalThis as any).PayoutService.bulkPayConfirmed.mockImplementationOnce(() => {
      throw new Error('DB connection failed');
    });

    const result = bulkPayConfirmed(
      ['p_1'],
      { expectedUpdatedAtMap: { p_1: '2026-03-21T00:00:00.000Z' } }
    ) as any;

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('SYSTEM_ERROR');
  });
});
