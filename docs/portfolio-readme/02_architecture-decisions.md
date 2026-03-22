# アーキテクチャ判断記録

## 1. 3層アーキテクチャ

```
Browser ←→ GAS Web App ←→ Spreadsheet DB
                |
                ↓
           Google Drive (PDF/Excel)
```

Controller / Service / Repository の3層分離:

| レイヤー | 責務 | 例 |
|----------|------|------|
| Controller | 認証・入力正規化・例外ハンドリング・レスポンス整形 | `saveJob()`, `deleteJob()` |
| Service | ビジネスロジック | `JobService.create()`, `InvoiceService.generate()` |
| Repository | シートI/O（バルク getValues/setValues） | `JobRepository.insert()`, `InvoiceRepository.findByMonth()` |

**Why**: GASは「1ファイルにべた書き」になりがち。79,000行規模ではレイヤー分離が不可欠。テスト容易性と責務の明確化。

---

## 2. ADR要約テーブル（6件）

| ADR | 決定 | 選ばなかった選択肢 | Why |
|-----|------|-------------------|-----|
| ADR-001: 統合Save API | saveJob + saveAssignments の diff-based 統一API | 個別CRUD (create/update/delete分離) | GASのRPC呼び出しコスト削減。1リクエストで複数変更を処理 |
| ADR-002: トランザクションデータ非キャッシュ | マスターのみキャッシュ、トランザクションは毎回取得 | 全データキャッシュ | ダッシュボードは終日開放。配置データの陳腐化は業務事故に直結 |
| ADR-003: 表示/計算の分離 | display_time_slot（表示）と pay_unit/invoice_unit（計算・常に同値）を分離 | 単一の time_slot で全計算 | 表示列と単価区分が1:1対応しない業務実態（例: AM列表示だが鳶単価で計算） |
| ADR-004: CI/CD判断 | 当初CI不採用 → 25,000行到達でTS+lint CI追加 | フルCI/CD + 自動デプロイ | GAS環境でのE2E不可。規模拡大に伴いTypeScript型チェックのみ導入 |
| ADR-005a: バッチ性能 | 10件バッチ + フロント連続呼び出し + 進捗保存 | 全件一括処理 | 6分制限回避。10件/バッチ（≒80秒）で分割し、タイムアウト時はPropertiesServiceに進捗退避→次回再開 |
| ADR-005b: 請求書編集ワークフロー | ステータスベースの編集制御（unsent→sent→paid/unpaid） | 自由編集 / 承認フロー | 運用実態に合わせた段階的ロック。「未送付」は自由編集、「送付済み」以降はロック |

---

## 3. データ設計方針

### UUID主キー

```javascript
// 全テーブル共通: UUID v4 で一意性保証
function generateId(prefix) {
  return prefix + '_' + Utilities.getUuid().replace(/-/g, '');
}
// → "job_a1b2c3d4e5f6...", "asg_x1y2z3..."
```

**Why**: Spreadsheetの行番号は挿入/削除で変わる。行番号に依存しない一意キーが必須。

### 共通カラム

全テーブルに `id`, `created_at`, `created_by`, `updated_at`, `updated_by`, `is_deleted` を持たせ、論理削除で監査証跡を確保。

### 年度分割（アーカイブ）

年度末（2月締め）に T_Jobs, T_JobAssignments, T_Invoices, T_InvoiceLines, T_Payouts を別スプレッドシートに自動移行。M_* マスターは永続保持。

---

## 4. 楽観ロック（expectedUpdatedAt）

```javascript
// repository.gs — 楽観ロックチェック
function checkOptimisticLock(record, expectedUpdatedAt) {
  if (!expectedUpdatedAt) return true;
  if (!record.updated_at) return true;
  const recordTime = new Date(record.updated_at).getTime();
  const expectedTime = new Date(expectedUpdatedAt).getTime();
  return recordTime === expectedTime;
}

// Controller層での使用例
function deleteJob(jobId, expectedUpdatedAt) {
  // ... 権限チェック、入力検証 ...

  if (!checkOptimisticLock(existing, expectedUpdatedAt)) {
    return buildErrorResponse(
      ERROR_CODES.CONFLICT_ERROR,
      '他のユーザーによって更新されています。画面を再読み込みしてください。',
      { currentUpdatedAt: existing.updated_at, expectedUpdatedAt }
    );
  }
  // ... 削除処理 ...
}
```

**Why**: Spreadsheetにはトランザクション分離がない。LockServiceの排他ロック + 楽観ロックの二重防御で競合を検出。

---

## 5. キャッシュ戦略の分離設計

```javascript
// 2層キャッシュ: メモリ(L1) + CacheService(L2)
const MasterCache = {
  CACHE_TTL: 21600,  // 6時間
  _staffCache: null,  // L1: リクエストスコープ内メモリ

  getStaff: function() {
    // L1: メモリキャッシュ（同一リクエスト内は即座に返却）
    if (this._staffCache !== null) return this._staffCache;

    // L2: CacheService（TTL付きスクリプトキャッシュ）
    const cache = CacheService.getScriptCache();
    const cached = cache.get(this.CACHE_KEY_STAFF);
    if (cached) {
      this._staffCache = JSON.parse(cached);
      return this._staffCache;
    }

    // Fallback: シートから読み込み → 両層にセット
    this._staffCache = getAllRecords('M_Staff').filter(s => !s.is_deleted);
    cache.put(this.CACHE_KEY_STAFF, JSON.stringify(lightweightFields), this.CACHE_TTL);
    return this._staffCache;
  },

  warmup: function() { /* 06:00 トリガーで全マスターをプリロード */ }
};
```

| データ種別 | キャッシュ | TTL | 理由 |
|-----------|----------|-----|------|
| マスター（顧客・スタッフ） | ○ 2層キャッシュ | 6時間 | 変更頻度低、参照頻度高 |
| トランザクション（案件・配置） | × 毎回取得 | — | 配置データの陳腐化は業務事故に直結 |
| 更新検知 | ○ メタデータのみ | 30秒ポーリング | maxUpdatedAtの軽量チェック |

---

## 6. BroadcastChannelによるタブ間同期

```javascript
// BroadcastSync — クロスタブ同期ユーティリティ
const BroadcastSync = {
  init(channelName, onMessage) {
    if (typeof BroadcastChannel === 'undefined') return null;
    const channel = new BroadcastChannel(channelName);
    channel.onmessage = onMessage;
    return channel;
  },
  broadcast(channel, type, data) {
    if (!channel) return;
    channel.postMessage({ type, data, timestamp: Date.now() });
  }
};

// ダッシュボードでの使用: 配置保存時に請求書タブに通知
var invoiceChannel = BroadcastSync.init('invoice_sync', function() {});
BroadcastSync.broadcast(invoiceChannel, 'ASSIGNMENT_CHANGED', {});
invoiceChannel.close();
```

**Why**: 番頭さんが配置変更 → 社長が別タブで請求書確認。変更があったことを即座に伝える必要がある。HtmlServiceではWebSocketが使えないため、BroadcastChannel APIで同一ブラウザ内のタブ間同期を実現。

---

← [01_system-overview.md](./01_system-overview.md) | [03_performance-engineering.md](./03_performance-engineering.md) →
