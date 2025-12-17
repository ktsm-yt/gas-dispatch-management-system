# 10. 実装リスクと対策

本ドキュメントでは、GAS + スプレッドシート構成における実装上のリスクと具体的な対策を整理する。

---

## 10.1 GAS実行時間制限（6分）

### リスク

- 1回の関数実行が6分を超えると強制終了
- 大量データの一括処理、複雑な集計で発生しやすい

### 対策

| シナリオ | 対策 |
|----------|------|
| 月次請求書一括生成 | 顧客ごとに分割処理、進捗をPropertiesServiceに保存して継続実行 |
| 年度末アーカイブ | バッチ処理を複数回に分割、トリガーで継続 |
| 大量検索 | 日付範囲を限定、ページネーション |

### 実装パターン: 分割処理

```javascript
function batchProcess() {
  const props = PropertiesService.getScriptProperties();
  const lastIndex = parseInt(props.getProperty('BATCH_LAST_INDEX') || '0');
  const items = getAllItems();

  const BATCH_SIZE = 50;
  const endIndex = Math.min(lastIndex + BATCH_SIZE, items.length);

  for (let i = lastIndex; i < endIndex; i++) {
    processItem(items[i]);
  }

  if (endIndex < items.length) {
    props.setProperty('BATCH_LAST_INDEX', endIndex.toString());
    // 次回トリガーで継続
  } else {
    props.deleteProperty('BATCH_LAST_INDEX');
    // 完了
  }
}
```

---

## 10.2 スプレッドシート行数制限

### リスク

- 1シートあたり1,000万セル（実用上は10万行程度が限界）
- 年間{{ANNUAL_JOB_COUNT}}の案件で数年運用すると限界に達する

### 対策

1. **年度別シート分割**: `{{PROJECT_NAME}}-db-2025`, `{{PROJECT_NAME}}-db-2026` のように年度でスプレッドシートを分ける
2. **アーカイブ処理**: 年度末に過去データを別ファイルに移動
3. **検索時の年度指定**: 必ず年度を指定して検索範囲を限定

### 年度切替の実装

```javascript
function getSpreadsheetIdForYear(year) {
  const mapping = {
    2025: 'SPREADSHEET_ID_2025',
    2026: 'SPREADSHEET_ID_2026'
  };
  const propKey = mapping[year];
  if (!propKey) throw new Error(`Year ${year} not configured`);
  return PropertiesService.getScriptProperties().getProperty(propKey);
}
```

---

## 10.3 同時実行競合（LockService）

### リスク

- 複数ユーザーが同時に同一レコードを更新
- スプレッドシートへの同時書き込みで競合

### 対策

1. **楽観ロック（expectedUpdatedAt）**: 必須。後勝ちを防止
2. **LockService**: 同一スクリプト内の同時実行を直列化

### LockServiceの使い方

```javascript
function saveWithLock(data) {
  const lock = LockService.getScriptLock();

  try {
    // 最大3秒待機、取得できなければ例外
    if (!lock.tryLock(3000)) {
      return {
        ok: false,
        error: { code: 'BUSY_ERROR', message: '混み合っています。しばらく待ってから再度お試しください。' }
      };
    }

    // 楽観ロックチェック
    const current = getRecord(data.id);
    if (current.updated_at !== data.expectedUpdatedAt) {
      return {
        ok: false,
        error: { code: 'CONFLICT_ERROR', message: '他のユーザーが更新しました。' }
      };
    }

    // 更新処理
    return updateRecord(data);

  } finally {
    lock.releaseLock();
  }
}
```

### 注意点

- `tryLock()` の待機時間は短く（3秒程度）。長すぎるとUX悪化
- LockServiceはスクリプト単位。複数Webアプリからの同時アクセスには対応
- ロック取得後も楽観ロックチェックは必須（ロック待機中に他者が更新した可能性）

---

## 10.4 外部キー整合性

### リスク

- 顧客削除時、紐づく案件が孤立
- スタッフ削除時、配置データが参照不能に
- マスター変更時、過去トランザクションへの影響

### 対策

| 操作 | 対策 |
|------|------|
| マスター削除 | **論理削除のみ**（`is_active=false`）。物理削除は禁止 |
| マスター参照 | トランザクションには**IDと名前スナップショット**の両方を保持（参照時の名前表示用） |
| 削除前チェック | 紐づくトランザクションがある場合は警告表示 |

### 実装例: 削除前チェック

```javascript
function deleteCustomer(customerId, expectedUpdatedAt) {
  // 紐づく案件をチェック
  const relatedJobs = searchJobs({ customer_id: customerId, is_deleted: false });

  if (relatedJobs.length > 0) {
    return {
      ok: false,
      error: {
        code: 'REFERENCE_EXISTS',
        message: `この顧客に紐づく案件が${relatedJobs.length}件あります。先に案件を削除またはキャンセルしてください。`
      }
    };
  }

  // 論理削除
  return updateRecord('M_Customers', customerId, { is_active: false }, expectedUpdatedAt);
}
```

### トランザクションへの名前スナップショット

```javascript
// T_Jobs テーブルに customer_name_snapshot を持たせる
// 表示用には snapshot を使い、集計・検索用には customer_id で JOIN
```

---

## 10.5 キャッシュ整合性

### リスク

- マスター更新後、古いキャッシュが残る
- 他ユーザーの更新がキャッシュに反映されない

### 対策

1. **マスター更新時にキャッシュ破棄**
2. **短いTTL**（60〜300秒）
3. **トランザクションデータはキャッシュしない**（ADR-002で決定済み）

### 実装例: キャッシュ破棄付き更新

```javascript
function updateCustomerWithCacheInvalidation(customerId, data, expectedUpdatedAt) {
  const result = updateRecord('M_Customers', customerId, data, expectedUpdatedAt);

  if (result.ok) {
    // キャッシュ破棄
    CacheService.getScriptCache().remove('customers_all');
    CacheService.getScriptCache().remove(`customer_${customerId}`);
  }

  return result;
}
```

---

## 10.6 帳票生成（PDF/Excel）リスク

### リスク

| リスク | 影響 |
|--------|------|
| テンプレートの結合セル破壊 | 行挿入時にレイアウト崩壊 |
| 数式参照範囲のズレ | 合計金額が不正 |
| 大量明細（100行超） | タイムアウト、メモリ不足 |
| 印影画像の取得失敗 | 請求書不完全 |

### 対策

#### テンプレート設計

- **明細行は結合セルを避ける**（ヘッダー行のみ結合可）
- **明細範囲を固定**（例: 10行目〜200行目）。範囲外は使わない
- **合計行の数式を範囲固定**（例: `=SUM(I10:I200)` で200行分確保）

#### 明細行数のチェック

```javascript
function generateInvoice(customerId, ym) {
  const lines = getInvoiceLines(customerId, ym);

  const MAX_LINES = 190; // テンプレートの最大行数 - マージン
  if (lines.length > MAX_LINES) {
    return {
      ok: false,
      error: {
        code: 'TOO_MANY_LINES',
        message: `明細が${lines.length}件あります。${MAX_LINES}件以下に分割してください。`
      }
    };
  }

  // 生成処理
}
```

#### 画像取得の堅牢化

```javascript
function getStampImage() {
  // 基本は M_Company.stamp_file_id を参照（未設定時は印影なしで続行できるようにする）
  // 互換のため、必要なら ScriptProperties の STAMP_FILE_ID をフォールバックに使う
  const company = getCompanyMaster(); // M_Company（1レコード想定）
  const fileId =
    company?.stamp_file_id ||
    PropertiesService.getScriptProperties().getProperty('STAMP_FILE_ID');

  if (!fileId) {
    Logger.log('WARN: Stamp image not configured, skipping');
    return null;
  }

  try {
    const file = DriveApp.getFileById(fileId);
    return file.getBlob();
  } catch (e) {
    Logger.log('WARN: Failed to get stamp image: ' + e.message);
    return null; // 印影なしで続行
  }
}
```

---

## 10.7 入力値バリデーション

### リスク

- 不正な入力値によるデータ破損
- XSS攻撃（HTMLインジェクション）

### 対策

#### サーバサイドバリデーション（必須）

```javascript
function validateJob(job) {
  const errors = [];

  // 必須項目
  if (!job.customer_id) errors.push('顧客IDは必須です');
  if (!job.site_name) errors.push('現場名は必須です');
  if (!job.work_date) errors.push('作業日は必須です');

  // 形式チェック
  if (job.work_date && !/^\d{4}-\d{2}-\d{2}$/.test(job.work_date)) {
    errors.push('作業日の形式が不正です（YYYY-MM-DD）');
  }

  // 数値チェック
  if (job.required_count !== undefined) {
    const count = parseInt(job.required_count);
    if (isNaN(count) || count < 1 || count > 100) {
      errors.push('必要人数は1〜100の整数を指定してください');
    }
  }

  // 列挙値チェック
  const validTimeSlots = ['jotou', 'shuujitsu', 'am', 'pm', 'yakin', 'mitei'];
  if (job.time_slot && !validTimeSlots.includes(job.time_slot)) {
    errors.push('時間区分が不正です');
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true };
}
```

#### XSS対策

GASのHtmlServiceはデフォルトでサニタイズされるが、`createHtmlOutput().append()`等で生HTMLを扱う場合は注意。

```javascript
// 悪い例: 生の入力値をHTMLに埋め込み
const html = `<div>${userInput}</div>`; // XSSリスク

// 良い例: エスケープ処理
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
const html = `<div>${escapeHtml(userInput)}</div>`;

// または、テンプレートの <?= ?> を使用（自動エスケープ）
// <?!= ?> は生出力なのでユーザー入力には使わない
```

---

## 10.8 初期データ移行リスク

### リスク

- 重複データの混入
- 文字コード・日付形式の不一致
- 必須項目の欠落

### 対策

#### 移行前チェックリスト

- [ ] 元データのバックアップ取得
- [ ] 文字コード確認（UTF-8推奨）
- [ ] 日付形式の統一（YYYY-MM-DD）
- [ ] 重複キーのチェック（顧客コード、スタッフ名等）
- [ ] 必須項目の欠落チェック
- [ ] 外部キー参照の整合性チェック

#### 移行スクリプト例

```javascript
function validateMigrationData(customers) {
  const errors = [];
  const seenCodes = new Set();

  customers.forEach((c, index) => {
    const row = index + 2; // Excelの行番号（ヘッダー除く）

    // 必須項目
    if (!c.company_name) {
      errors.push(`行${row}: 会社名が空です`);
    }

    // 重複チェック
    if (c.customer_code) {
      if (seenCodes.has(c.customer_code)) {
        errors.push(`行${row}: 顧客コード ${c.customer_code} が重複しています`);
      }
      seenCodes.add(c.customer_code);
    }

    // 数値形式
    if (c.unit_price_tobi && isNaN(parseFloat(c.unit_price_tobi))) {
      errors.push(`行${row}: 鳶単価が数値ではありません`);
    }
  });

  return errors;
}
```

---

## 10.9 Google Workspace障害時の対応

### リスク

- Google Workspace停止時、システム全体が使用不能
- スプレッドシートへのアクセス不能

### 対策

| 対策 | 内容 |
|------|------|
| 定期バックアップ | 日次でスプレッドシートをコピー（11_deployment.md参照） |
| CSV定期エクスポート | 週次で主要データをCSV出力、ローカル保管 |
| 紙運用フロー | 緊急時は紙ベースで運用継続し、復旧後に入力（要件定義書で紙併用を想定済み） |
| 障害検知 | `google.script.run` の `withFailureHandler` で通信エラーを検知、ユーザーに通知 |

### 障害時フロントエンド対応

```javascript
google.script.run
  .withSuccessHandler(onSuccess)
  .withFailureHandler(error => {
    if (error.message.includes('Service unavailable')) {
      showToast('Googleサービスに接続できません。しばらく待ってから再度お試しください。', 'error');
    } else {
      showToast('エラーが発生しました: ' + error.message, 'error');
    }
  })
  .getDashboard(date);
```

---

## 10.10 パフォーマンス監視

### 計測ポイント

| API | 目標 | 警告閾値 |
|-----|------|----------|
| getDashboard | 3秒以内 | 5秒 |
| saveJob | 1秒以内 | 3秒 |
| exportInvoice (PDF) | 10秒以内 | 30秒 |

### 実装例: パフォーマンスログ

```javascript
function withPerformanceLog(funcName, func) {
  return function(...args) {
    const start = Date.now();
    const result = func.apply(this, args);
    const elapsed = Date.now() - start;

    if (elapsed > 5000) {
      Logger.log(`WARN: ${funcName} took ${elapsed}ms`);
    }

    // 結果にサーバ処理時間を付与（デバッグ用）
    if (result && typeof result === 'object') {
      result._serverTime = elapsed;
    }

    return result;
  };
}

// 使用例
const getDashboard = withPerformanceLog('getDashboard', function(date) {
  // 実装
});
```

---

## 10.11 リスク一覧（サマリ）

| カテゴリ | リスク | 深刻度 | 対策状況 |
|----------|--------|--------|----------|
| GAS制約 | 6分タイムアウト | 高 | 分割処理パターン定義済み |
| GAS制約 | 行数制限 | 中 | 年度分割で対応 |
| 同時編集 | 競合 | 高 | 楽観ロック + LockService |
| データ整合性 | 外部キー孤立 | 中 | 論理削除 + 削除前チェック |
| データ整合性 | キャッシュ不整合 | 中 | 短TTL + 更新時破棄 |
| 帳票生成 | テンプレート破損 | 中 | 設計ガイドライン定義 |
| 帳票生成 | 大量明細 | 中 | 行数チェック |
| セキュリティ | XSS | 中 | サニタイズ処理 |
| 運用 | 移行データ不整合 | 中 | バリデーションスクリプト |
| 運用 | Workspace障害 | 低 | バックアップ + 紙運用フォールバック |

---

## 関連ドキュメント

- [06_backend.md](06_backend.md) - バックエンドAPI設計
- [09_security.md](09_security.md) - セキュリティ設計
- [14_troubleshooting.md](../05_ops/14_troubleshooting.md) - トラブルシューティング
- [ADR-001](../04_adr/ADR-001_saveJob_saveAssignments.md) - saveJob/saveAssignments統合API
- [ADR-002](../04_adr/ADR-002_no_cache_transaction_data.md) - 当日トランザクション非キャッシュ
