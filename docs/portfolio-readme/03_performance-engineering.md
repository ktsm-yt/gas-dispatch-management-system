# パフォーマンスエンジニアリング

GAS（Google Apps Script）は実行時間6分・シートI/O100ms〜数秒という厳しい制約の上で動く。この制約を前提にした設計と最適化の記録。

---

## 1. GAS制約の全体像

| 制約 | 上限 | 設計への影響 |
|------|------|------------|
| 実行時間 | 6分/実行 | バッチ分割 + PropertiesService進捗保存 |
| シートI/O | 100ms〜数秒/回 | getValues/setValues一括処理必須 |
| 並列実行 | 同一ユーザー同時実行不可 | UIの楽観的更新で体感速度をカバー |
| URLFetch | 20,000回/日 | 必要最低限の外部API呼び出し |
| CacheService | 100KB/エントリ、TTL最大6時間 | 軽量フィールドのみキャッシュ |
| HtmlService | iframe制約、WebSocket不可 | ポーリングで擬似リアルタイム更新 |

---

## 2. 7つのパフォーマンスパターン

### Pattern 1: バルクI/O（getValues/setValues）

```javascript
// ❌ アンチパターン: 1セルずつ読み書き（N回のI/O）
for (let i = 2; i <= lastRow; i++) {
  const name = sheet.getRange(i, 1).getValue();  // N回のI/O
  const rate = sheet.getRange(i, 3).getValue();
}

// ✅ 実装パターン: 一括読み込み（1回のI/O）
function getAllRows(sheet, options = {}) {
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow <= 1 || lastCol === 0) return [];
  const headers = getHeaders(sheet);
  const data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();  // 1回の一括読込
  let rows = data.map((row, index) => {
    const obj = { _rowIndex: index + 2 };
    headers.forEach((header, colIndex) => { obj[header] = row[colIndex]; });
    return obj;
  });
  if (!options.includeDeleted) {
    rows = rows.filter(row => !row.is_deleted);
  }
  return rows;
}
```

全リポジトリ層でこのパターンを統一することで、シートI/Oを実質的に排除した。

---

### Pattern 2: SWRパターン（CacheService TTL設計）

```javascript
// 2層キャッシュ: L1(メモリ) + L2(CacheService)
const MasterCache = {
  CACHE_TTL: 21600,  // 6時間
  _staffCache: null,

  getStaff: function() {
    if (this._staffCache !== null) return this._staffCache;      // L1 hit
    const cached = CacheService.getScriptCache().get(this.CACHE_KEY_STAFF);
    if (cached) { this._staffCache = JSON.parse(cached); return this._staffCache; }  // L2 hit
    // Miss: シートから読み込み → 軽量フィールドのみL2に保存
    this._staffCache = getAllRecords('M_Staff').filter(s => !s.is_deleted);
    CacheService.getScriptCache().put(this.CACHE_KEY_STAFF, JSON.stringify(lightStaff), this.CACHE_TTL);
    return this._staffCache;
  },
  warmup: function() { /* 06:00 日次トリガーでプリロード */ }
};
```

スタッフ・顧客・現場などのマスターデータは変更頻度が低い。毎朝06:00のトリガーでwarmupし、L1/L2の2層でヒット率を最大化した。

> **実測での発見**: 顧客841件をフル保存すると `CacheService.put` が `Argument too large` エラー（100KB制限）。軽量フィールドのみに絞る `lightStaff` / `lightCustomers` パターンが必須だと実測で裏付けられた。

---

### Pattern 3: 差分レンダリング（保存後の部分更新）

```javascript
// 保存後: 変更があったカラムのみ再描画（6カラム中1〜2カラム）
function updateJobInDashboard(savedJob, savedSlots, isNew) {
  if (!dashboardData) return;

  // 再描画が必要なカラムを追跡
  const slotsToRender = new Set();

  if (isNew) {
    dashboardData.jobs.push(updatedJob);
    slotsToRender.add(updatedJob.time_slot);
  } else {
    const index = dashboardData.jobs.findIndex(j => j.job_id === savedJob.job_id);
    const oldJob = dashboardData.jobs[index];
    slotsToRender.add(oldJob.time_slot);      // 移動元カラム
    slotsToRender.add(updatedJob.time_slot);   // 移動先カラム
    dashboardData.jobs[index] = updatedJob;
  }

  recalculateStats();

  // 影響カラムだけ innerHTML を再構築（他の4〜5カラムは untouched）
  slotsToRender.forEach(slot => {
    const jobs = filterByStatus(dashboardData.jobs.filter(j => j.time_slot === slot));
    renderCards(slot, jobs);
  });
}
```

**Before**: 保存のたびにダッシュボード全体を再取得・再描画 → 数秒のちらつき
**After**: `slotsToRender` で影響カラム（1〜2列）のみ再描画 → 瞬時に反映

---

### Pattern 4: 楽観的UI更新

GASのRPC往復は500ms〜2秒かかる。操作種別に応じて2段階の楽観的UIを使い分ける。

#### 4a. 削除: データ先行更新 + 失敗時ロールバック

```javascript
// 削除確認直後にUIから即座に除去（サーバー応答前）
function onJobModalDelete(jobId, job, isConfirmed) {
  if (!isConfirmed && dashboardData) {
    // 楽観的更新: データを即座にフィルタ
    dashboardData.jobs = dashboardData.jobs.filter(j => j.job_id !== jobId);
    recalculateStats();
    renderDashboard();
    saveToCachedDate(dashboardData.date, dashboardData);
  }
  if (isConfirmed) {
    broadcastDashboardUpdate();  // 他タブ通知はサーバー確認後
  }
}

// 失敗時: フルリロードでロールバック
function onJobModalDeleteFailed(jobId) {
  loadDashboard();
}
```

#### 4b. 保存: 楽観的UXフィードバック（データ更新はサーバー確認後）

```javascript
// 即座にボタン無効化 + テキスト変更（体感レスポンスの改善）
jobModalState.isSaving = true;
saveBtn.disabled = true;
clickedBtn.textContent = '保存中...';

google.script.run
  .withSuccessHandler((response) => {
    saveBtn.disabled = false;
    clickedBtn.textContent = '保存';
    if (response.ok) {
      showToast('保存しました', 'success');
      updateJobInDashboard(response.data.job, response.data.slots, isNew);
    }
  })
  .saveJob(job, updatedAt, slotsData);
```

削除は取り消し不可な操作のため先行反映で即座にフィードバック。保存はデータ整合性を優先し、サーバー確認後に反映。

---

### Pattern 5: 6分制限バッチ処理（PropertiesService進捗保存）

```typescript
// InvoiceBulkExportService — タイムアウト対策
while (progress.processedCount < progress.totalCount) {
  const elapsed = Date.now() - startTime;
  if (elapsed > this.TIMEOUT_MS) {  // 5分でセーフティストップ
    this.saveProgress(exportKey, progress);  // PropertiesServiceに進捗保存
    return {
      success: false,
      error: 'TIMEOUT_WILL_CONTINUE',
      progress: this._getSummary(progress),
      partialResults: results
    };
  }

  const exportResult = this._exportOneWithPreload(invoiceId, ...);
  progress.processedCount++;

  // 10件ごとにクラッシュガード保存
  if (progress.processedCount % 10 === 0) {
    this.saveProgress(exportKey, progress);
  }
}
```

**計測値**: 53社 → 13件生成（40件スキップ）→ 約8分（10件/バッチ ≒ 80秒）
タイムアウト発生時は進捗をPropertiesServiceに退避し、次回呼び出しで途中から再開する。

---

### Pattern 6: Read-Once最適化（インメモリフィルタリング）

```javascript
// ❌ N+1パターン: 顧客ごとにシート読み込み
customers.forEach(c => {
  const jobs = getJobsByCustomer(c.id);  // 毎回シート読み込み
});

// ✅ Read-Once: 1回読み込み → メモリでフィルタ
const allJobs = getAllRows(jobSheet);
const allAssignments = getAllRows(assignmentSheet);
customers.forEach(c => {
  const jobs = allJobs.filter(j => j.customer_id === c.customer_id);
  const assignments = allAssignments.filter(a => jobs.some(j => j.job_id === a.job_id));
});
```

**Before**: 53社 × 2シート = 106回のI/O
**After**: 2回のI/O（シートアクセスをループ外に引き出す）

---

### Pattern 7: 更新検知ポーリング（getDashboardMeta）

```javascript
// 30秒ごとに軽量メタデータのみチェック
function startPolling() {
  setInterval(checkForUpdates, 30000);
}

function checkForUpdates() {
  google.script.run
    .withSuccessHandler((response) => {
      if (response.ok) {
        const latest = response.data.maxUpdatedAt;
        if (latest !== lastMaxUpdatedAt) {
          // モーダルが開いていなければバックグラウンド更新
          if (!isModalOpen()) refreshDashboardInBackground(dateStr);
        }
        lastMaxUpdatedAt = latest;
      }
    })
    .getDashboardMeta(dateStr);  // maxUpdatedAtのみ返却（軽量）
}
```

全データをポーリングするのではなく「変更トークン（maxUpdatedAt）」のみチェック。変更があった場合のみフルデータ取得に切り替える設計。WebSocketが使えないGASの制約下でのリアルタイム感の実現。

---

## 3. 計測値テーブル

### API応答時間（実測: 顧客841件 / スタッフ146件 / 案件648件 / 配置1,276件）

| API | 応答時間 | 備考 |
|-----|---------|------|
| getDashboard | **56ms** | SWRキャッシュ + warmupトリガーの効果 |
| searchJobs | 127ms | 648件からのフィルタリング |
| getAllCustomers | 17ms（841件） | L1キャッシュヒット |
| getAllStaff | 4ms（146件） | L1キャッシュヒット |
| saveJob | 1,992ms | 楽観ロック + 監査ログ含む |
| saveAssignment | 1,158ms | 配置保存（唯一の閾値超過） |
| generateInvoice（単件帳票出力） | 1,700ms/件 | Driveテンプレートコピー + セル書込 + PDF変換 |
| **bulkGenerate 10件（集計・レコード生成）** | **21,518ms（2,152ms/件）** | 652案件月の請求データ一括集計（overwrite再生成） |
| bulkInsert 100件 | 3,566ms | 挿入632ms + 読込1,307ms + 削除1,627ms |

### Before / After 比較

| 処理 | Before | After | 改善手法 |
|------|--------|-------|----------|
| 請求データ集計（bulkGenerate） | 推定20〜30分（※1） | **2.2秒/件**（※2・実測） | Read-Once + バッチ分割 |
| 帳票一括出力（PDF/Excel） | 1時間超でも未完了（※3） | 10数件/5分（※4） | テンプレートコピー + バッチ + 進捗保存 |
| ダッシュボード表示 | 5〜8秒 | **56ms**（実測） | SWRキャッシュ + warmupトリガー |
| 配置保存後の画面反映 | 3〜5秒（全体再描画） | 即時（影響カラムのみ再描画） | 差分レンダリング（slotsToRender） |
| マスターデータ読込（841件） | 毎回1〜3秒 | **17ms**（実測） | 2層キャッシュ |
| 更新チェック | 全データ再取得（3〜5秒） | メタデータのみ（〜200ms） | getDashboardMeta ポーリング |

> ※1: N+1 I/O（顧客ごとにシート読込）時代の推定値
> ※2: 2026年3月実測。10件で21.5秒（2,152ms/件）。53社全件なら理論値≒約2分。PR #210（fileId一括更新400→1-2回、フォルダキャッシュ、遅延削除）による改善効果
> ※3: 初期実装時の体感値。逐次処理で1時間放置しても完了しなかった
> ※4: 体感値。Drive APIのテンプレートコピー+PDF変換が律速（1件あたり数十秒）のため、コード最適化だけでは限界がある
>
> 実測環境: Google Apps Script V8ランタイム / 2026年3月 / データ規模: 顧客841・スタッフ146・案件648・配置1,276

---

## 4. 「概念で伝える」エピソード

最初は「バッチ処理して」「差分リロードにして」「キャッシュ使って」と自分の知っている単語で指示を出していたが、パフォーマンスが思うように改善しなかった。

ある時AIに「この一連の実装を一発で伝えるにはなんて言えばいい？」と聞いたら、返ってきたのは「SWR（Stale-While-Revalidate）」「Read-Once最適化」といった上位概念だった。

その概念名を使って指示を出した途端、劇的にパフォーマンスが改善した。さらにパフォーマンステストを作って各処理の実行時間を計測し、結果をAIに渡すことで自律的に最適化が進んだ。

> 概念を伝えれば、AIはより良い手段を自ら考え整えてくれる。AIはハンドリングする人間の質が重要で、中途半端な言葉ではAIのポテンシャルを狭めてしまう。

このエピソードをきっかけに、当初仕様にはなかった23項目のUXデザインを追加実装するに至った。

---

← [02_architecture-decisions.md](./02_architecture-decisions.md) | [04_domain-logic.md](./04_domain-logic.md) →
