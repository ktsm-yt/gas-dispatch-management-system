/**
 * JobRepository._normalizeTime テスト
 *
 * GASがスプレッドシートの時刻セルを Date オブジェクトとして返す際の
 * タイムゾーン補正（JST +9h）を検証する。
 *
 * 実行: npx vitest run tests/job_repository_normalize_time.test.ts
 *
 * --- GAS時刻セルの仕組み ---
 * GASはスプレッドシートの時刻セル（例: "8:00"）を
 * Excel Epoch(1899-12-30)基準のJST DateとしてJSに渡す。
 * 例: "8:00" → new Date('1899-12-29T23:00:00Z')  (= 1899-12-30 08:00 JST)
 *
 * getTime()はUTCミリ秒を返すため、UTC基準のEPOCHとの差に
 * JSTオフセット(+9h)を足すことで正しい時刻が復元できる。
 */

import { describe, it, expect } from 'vitest';

// JobRepository.ts#L265 と同一ロジック（GASのexport制約によりここに複製）
// 本体変更時は必ずこちらも更新すること
function _normalizeTime(timeValue: unknown): string {
  if (!timeValue && timeValue !== 0) return '';

  if (timeValue instanceof Date) {
    if (isNaN(timeValue.getTime())) return '';
    // GASのDateはJST(UTC+9)基準だがgetTime()はUTCミリ秒を返すため補正が必要
    // このプロジェクトはJST固定運用（ad-stage.jp / ktsm.dev@gmail.com）
    const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30); // 1899-12-30 UTC
    const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
    const totalMinutes = Math.round((timeValue.getTime() - EXCEL_EPOCH_MS + JST_OFFSET_MS) / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return String(hours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0');
  }

  if (typeof timeValue === 'number') {
    const totalMinutes = Math.round(timeValue * 24 * 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return String(hours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0');
  }

  return String(timeValue);
}

/**
 * GASが時刻セル "HH:MM" を返すDateオブジェクトを生成する
 * 例: gasTimeDate(8, 0) → 1899-12-30 08:00 JSTのDateオブジェクト
 *                       = 1899-12-29T23:00:00Z
 */
function gasTimeDate(hours: number, minutes: number): Date {
  // GASはスプレッドシートのタイムゾーン(JST)で時刻をDateに変換するため、
  // JSTオフセットを引いてUTC基準のDateを作成する
  const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
  const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const timeMs = (hours * 60 + minutes) * 60 * 1000;
  return new Date(EXCEL_EPOCH_MS + timeMs - JST_OFFSET_MS);
}

describe('_normalizeTime — Date入力（GAS時刻セル）', () => {
  it('08:00 を正しく変換する（TZバグ回帰防止）', () => {
    // 修正前は "-1:00" と表示されていた
    expect(_normalizeTime(gasTimeDate(8, 0))).toBe('08:00');
  });

  it('09:00 を正しく変換する（TZバグ回帰防止）', () => {
    // 修正前は "00:00" と表示されていた
    expect(_normalizeTime(gasTimeDate(9, 0))).toBe('09:00');
  });

  it('13:00 を正しく変換する（TZバグ回帰防止）', () => {
    // 修正前は "04:00" と表示されていた
    expect(_normalizeTime(gasTimeDate(13, 0))).toBe('13:00');
  });

  it('00:30 (深夜夜勤) を正しく変換する', () => {
    expect(_normalizeTime(gasTimeDate(0, 30))).toBe('00:30');
  });

  it('24:30 (24時超え夜勤) を正しく変換する', () => {
    // GASから 1899-12-31 00:30 JST として届くケース
    expect(_normalizeTime(gasTimeDate(24, 30))).toBe('24:30');
  });

  it('25:00 (25時超え夜勤) を正しく変換する', () => {
    expect(_normalizeTime(gasTimeDate(25, 0))).toBe('25:00');
  });

  it('無効なDateは空文字を返す', () => {
    expect(_normalizeTime(new Date('invalid'))).toBe('');
  });
});

describe('_normalizeTime — 文字列入力（CSVから読み込み済みのケース）', () => {
  it('既に文字列の "8:00" はそのまま返す', () => {
    expect(_normalizeTime('8:00')).toBe('8:00');
  });

  it('既に文字列の "08:30" はそのまま返す', () => {
    expect(_normalizeTime('08:30')).toBe('08:30');
  });
});

describe('_normalizeTime — 数値入力（スプレッドシートシリアル値）', () => {
  it('0.5 = 12:00', () => {
    expect(_normalizeTime(0.5)).toBe('12:00');
  });

  it('0.375 = 09:00', () => {
    expect(_normalizeTime(0.375)).toBe('09:00');
  });
});

describe('_normalizeTime — 空値・null', () => {
  it('null は空文字を返す', () => {
    expect(_normalizeTime(null)).toBe('');
  });

  it('undefined は空文字を返す', () => {
    expect(_normalizeTime(undefined)).toBe('');
  });

  it('空文字は空文字を返す', () => {
    expect(_normalizeTime('')).toBe('');
  });

  it('0 は "00:00" を返す（日付境界値）', () => {
    expect(_normalizeTime(0)).toBe('00:00');
  });
});
