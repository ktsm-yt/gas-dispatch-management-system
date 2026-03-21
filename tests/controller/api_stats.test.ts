/**
 * api_stats controller テスト
 *
 * 検証対象:
 * - recalculateMonthlyStats_impl: 認可・入力検証・サービス呼び出し・キャッシュ無効化
 * - getYearlyCustomerStats_impl: 認可・キャッシュヒット/ミス・キャッシュ書き込み
 *
 * 実行: npx vitest run tests/controller/api_stats.test.ts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  recalculateMonthlyStats_impl,
  getYearlyCustomerStats_impl,
} from '../../app/gas/src/controllers/api_stats_testable';

// ============================================
// recalculateMonthlyStats_impl
// ============================================

describe('recalculateMonthlyStats_impl', () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    (globalThis as any).checkPermission = vi.fn(() => ({ allowed: true, message: 'OK' }));
    (globalThis as any).generateRequestId = vi.fn(() => 'req-stats-001');
    (globalThis as any).buildSuccessResponse = vi.fn((data: unknown, requestId?: string) => ({
      ok: true,
      data,
      serverTime: '2026-03-21T00:00:00.000Z',
      requestId: requestId ?? 'req-stats-001',
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
        requestId: requestId ?? 'req-stats-001',
      })
    );

    (globalThis as any).StatsService = {
      updateMonthlyStats: vi.fn(() => ({
        success: true,
        stats: { year: 2026, month: 3, total: 500000 },
        created: false,
      })),
      _aggregateByCustomerYearly: vi.fn(() => ({ fiscalYears: [], customers: [] })),
    };

    const mockScriptCache = {
      get: vi.fn(() => null),
      put: vi.fn(),
      remove: vi.fn(),
    };
    (globalThis as any).CacheService = {
      getScriptCache: vi.fn(() => mockScriptCache),
    };
  });

  it('正常: year=2026, month=3 → ok: true, data に stats と created が含まれる', () => {
    const result = recalculateMonthlyStats_impl(2026, 3) as any;

    expect(result.ok).toBe(true);
    expect(result.data.stats).toEqual({ year: 2026, month: 3, total: 500000 });
    expect(result.data.created).toBe(false);
  });

  it('正常: 成功後に CacheService.remove("yearly_customer_stats_v2") が呼ばれる', () => {
    recalculateMonthlyStats_impl(2026, 3);

    const mockCache = (globalThis as any).CacheService.getScriptCache();
    expect(mockCache.remove).toHaveBeenCalledWith('yearly_customer_stats_v2');
  });

  it('エラー: year が未指定 → VALIDATION_ERROR, メッセージに "year and month are required"', () => {
    const result = recalculateMonthlyStats_impl(undefined, 3) as any;

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('VALIDATION_ERROR');
    expect(result.error.message).toContain('year and month are required');
  });

  it('エラー: month が未指定 → VALIDATION_ERROR', () => {
    const result = recalculateMonthlyStats_impl(2026, undefined) as any;

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('VALIDATION_ERROR');
    expect(result.error.message).toContain('year and month are required');
  });

  it('エラー: 権限不足（manager未満）→ PERMISSION_DENIED', () => {
    (globalThis as any).checkPermission = vi.fn(() => ({
      allowed: false,
      message: '権限がありません',
    }));

    const result = recalculateMonthlyStats_impl(2026, 3) as any;

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('PERMISSION_DENIED');
    expect(result.error.message).toBe('権限がありません');
  });

  it('エラー: ALREADY_FINALIZED → VALIDATION_ERROR, message=確定済みの月は再計算できません, details.stats あり', () => {
    const finalizedStats = { year: 2026, month: 2, finalized: true };
    (globalThis as any).StatsService.updateMonthlyStats = vi.fn(() => ({
      success: false,
      error: 'ALREADY_FINALIZED',
      stats: finalizedStats,
    }));

    const result = recalculateMonthlyStats_impl(2026, 2) as any;

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('VALIDATION_ERROR');
    expect(result.error.message).toBe('確定済みの月は再計算できません');
    expect(result.error.details.stats).toEqual(finalizedStats);
  });

  it('エラー: Service がその他エラーを返す → SYSTEM_ERROR', () => {
    (globalThis as any).StatsService.updateMonthlyStats = vi.fn(() => ({
      success: false,
      error: 'DB_WRITE_FAILED',
    }));

    const result = recalculateMonthlyStats_impl(2026, 3) as any;

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('SYSTEM_ERROR');
  });

  it('エラー: Service が例外をスローする → SYSTEM_ERROR', () => {
    (globalThis as any).StatsService.updateMonthlyStats = vi.fn(() => {
      throw new Error('DB connection failed');
    });

    const result = recalculateMonthlyStats_impl(2026, 3) as any;

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('SYSTEM_ERROR');
  });

  it('正常: CacheService.remove がスローしてもレスポンスは ok: true（エラーをサイレント捕捉）', () => {
    const mockCache = {
      get: vi.fn(() => null),
      put: vi.fn(),
      remove: vi.fn(() => {
        throw new Error('cache remove failed');
      }),
    };
    (globalThis as any).CacheService = {
      getScriptCache: vi.fn(() => mockCache),
    };

    const result = recalculateMonthlyStats_impl(2026, 3) as any;

    expect(result.ok).toBe(true);
    expect(result.data.stats).toEqual({ year: 2026, month: 3, total: 500000 });
  });
});

// ============================================
// getYearlyCustomerStats_impl
// ============================================

describe('getYearlyCustomerStats_impl', () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    (globalThis as any).checkPermission = vi.fn(() => ({ allowed: true, message: 'OK' }));
    (globalThis as any).generateRequestId = vi.fn(() => 'req-yearly-001');
    (globalThis as any).buildSuccessResponse = vi.fn((data: unknown, requestId?: string) => ({
      ok: true,
      data,
      serverTime: '2026-03-21T00:00:00.000Z',
      requestId: requestId ?? 'req-yearly-001',
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
        requestId: requestId ?? 'req-yearly-001',
      })
    );

    (globalThis as any).StatsService = {
      updateMonthlyStats: vi.fn(() => ({ success: true, stats: {}, created: false })),
      _aggregateByCustomerYearly: vi.fn(() => ({
        fiscalYears: [2024, 2025, 2026],
        customers: [{ name: 'TestCo', totals: [100000, 200000, 300000] }],
      })),
    };

    const mockScriptCache = {
      get: vi.fn(() => null),
      put: vi.fn(),
      remove: vi.fn(),
    };
    (globalThis as any).CacheService = {
      getScriptCache: vi.fn(() => mockScriptCache),
    };
  });

  it('キャッシュヒット: Service呼び出しなし、キャッシュデータをそのまま返す', () => {
    const cachedData = { fiscalYears: [2025, 2026], customers: [{ name: 'A' }] };
    const mockCache = {
      get: vi.fn(() => JSON.stringify(cachedData)),
      put: vi.fn(),
      remove: vi.fn(),
    };
    (globalThis as any).CacheService.getScriptCache.mockReturnValue(mockCache);

    const result = getYearlyCustomerStats_impl() as any;

    expect(result.ok).toBe(true);
    expect((globalThis as any).StatsService._aggregateByCustomerYearly).not.toHaveBeenCalled();
    // パースされたキャッシュデータが buildSuccessResponse に渡されることを確認
    expect((globalThis as any).buildSuccessResponse).toHaveBeenCalledWith(
      cachedData,
      expect.any(String)
    );
  });

  it('キャッシュミス: _aggregateByCustomerYearly が呼ばれ、結果が CacheService.put で保存される', () => {
    // CacheService.get は null を返す（beforeEach でデフォルト設定済み）
    const result = getYearlyCustomerStats_impl() as any;

    expect(result.ok).toBe(true);
    expect((globalThis as any).StatsService._aggregateByCustomerYearly).toHaveBeenCalledWith(5);

    const mockCache = (globalThis as any).CacheService.getScriptCache();
    expect(mockCache.put).toHaveBeenCalledWith(
      'yearly_customer_stats_v2',
      expect.any(String),
      21600
    );
    // putに渡された文字列がJSONパース可能で正しいデータを含むことを確認
    const putCallArg = mockCache.put.mock.calls[0][1];
    const parsed = JSON.parse(putCallArg);
    expect(parsed.fiscalYears).toEqual([2024, 2025, 2026]);
    expect(parsed.customers[0].name).toBe('TestCo');
  });

  it('キャッシュ保存失敗: CacheService.put がスローしてもレスポンスは ok: true', () => {
    const mockCache = {
      get: vi.fn(() => null),
      put: vi.fn(() => {
        throw new Error('cache size exceeded');
      }),
      remove: vi.fn(),
    };
    (globalThis as any).CacheService = {
      getScriptCache: vi.fn(() => mockCache),
    };

    const result = getYearlyCustomerStats_impl() as any;

    expect(result.ok).toBe(true);
    expect(result.data.fiscalYears).toEqual([2024, 2025, 2026]);
  });

  it('エラー: 権限不足 → PERMISSION_DENIED', () => {
    (globalThis as any).checkPermission = vi.fn(() => ({
      allowed: false,
      message: 'スタッフ権限が必要です',
    }));

    const result = getYearlyCustomerStats_impl() as any;

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('PERMISSION_DENIED');
    expect(result.error.message).toBe('スタッフ権限が必要です');
  });

  it('エラー: Service が例外をスローする → SYSTEM_ERROR', () => {
    (globalThis as any).StatsService._aggregateByCustomerYearly = vi.fn(() => {
      throw new Error('aggregation failed');
    });

    const result = getYearlyCustomerStats_impl() as any;

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('SYSTEM_ERROR');
  });
});
