# 6. バックエンド設計（GAS）

フロントエンド（Web）からは `google.script.run` 経由で呼び出す。HTTPのRESTではなく「GAS関数呼び出しAPI」として、**契約（入出力・競合・エラー）**をここに固定する。

---

## 6.1 アーキテクチャ（レイヤ分割）

| レイヤ | 役割 | 例 |
|--------|------|-----|
| Controller | 認可・入力整形・例外ハンドリング・レスポンス整形 | `saveJob()` |
| Service | 業務ロジック | `JobService.create()` |
| Repository | Sheet I/O（`getValues/setValues`一括処理） | `JobRepository.insert()` |

- フロントから直接呼ばれる関数（`google.script.run`対象）は**Controller層に限定**し、薄く保つ
- Controllerで`requestId`を採番し、例外も含めて必ず返す（UIの問い合わせ対応が楽になる）

---

## 6.2 基本方針

- **保存は `saveJob` / `saveAssignments` を基本形**にする（CRUDで関数を増やさない）
- 競合検知は **`expectedUpdatedAt`（楽観ロック）を必須**にし、後勝ちを避ける
- 監査ログは **全更新操作を `T_AuditLog` に記録**し、問い合わせ時に追跡できるようにする

---

## 6.3 データ形式（共通）

### 日付・時刻

- 日付: `YYYY-MM-DD`（例: `2025-12-15`）
- 日時: ISO8601（例: `2025-12-15T10:00:00+09:00`）
- タイムゾーン: `Asia/Tokyo` を前提（`appsscript.json`）

### 共通レスポンス

```js
// 成功
{ ok: true, data: { ... }, serverTime: "2025-12-15T10:00:00+09:00", requestId: "req_..." }

// 失敗
{ ok: false, error: { code: "CONFLICT_ERROR", message: "...", details: { ... } }, requestId: "req_..." }
```

### エラーコード

| code | 意味 |
|------|------|
| `VALIDATION_ERROR` | 入力エラー（必須項目不足、形式不正） |
| `PERMISSION_DENIED` | 認可エラー |
| `NOT_FOUND` | 参照先なし |
| `CONFLICT_ERROR` | 競合（`expectedUpdatedAt` 不一致） |
| `BUSY_ERROR` | 混雑（Lock取得失敗、リトライ推奨） |
| `SYSTEM_ERROR` | 想定外エラー |

---

## 6.4 エンドポイント一覧

| 関数 | 用途 | 入出力（要約） |
|------|------|----------------|
| `getDashboard(date)` | 日別ダッシュボード取得 | IN:`YYYY-MM-DD` / OUT:`jobs[]`,`assignments[]` |
| `getDashboardMeta(date)` | 更新検知用メタ | IN:`YYYY-MM-DD` / OUT:`maxUpdatedAt` |
| `searchJobs(query)` | 案件検索 | IN: 顧客/日付/状態等 / OUT: 一覧 |
| `getJob(jobId)` | 案件単体取得 | IN:`jobId` / OUT:`job`,`assignments[]` |
| `saveJob(job, expectedUpdatedAt)` | 案件保存（競合検知） | IN:`job` + `expectedUpdatedAt` / OUT:`job` |
| `saveAssignments(jobId, changes, expectedUpdatedAt)` | 配置更新（差分） | IN:差分 + `expectedUpdatedAt` / OUT:`assignments[]` |
| `exportRoster(jobId)` | 名簿出力 | OUT: `fileId`,`url` |
| `exportInvoice(customerId, ym, mode, options)` | 請求書（帳票）出力 | IN:`YYYY-MM`, mode:`pdf|excel|edit` / OUT:`fileId`,`url` |
| `exportBillingData(ym, format)` | 請求データ（明細/集計）エクスポート | IN:`YYYY-MM`, format:`xlsx|csv` / OUT:`fileId`,`url` |
| `generateLineTemplate(date)` | LINE文生成 | OUT: `text` |

---

## 6.5 saveJob（案件保存）

案件の「作成/更新」を1つの関数に統合しつつ、**競合検知**と**部分更新（patch）**で事故を防ぐ。

### 入力

- `job`: 更新したいフィールドのみを含めてよい（patch）。未指定フィールドは上書きしない
- `expectedUpdatedAt`: 新規は`null`、更新は画面表示時点の`job.updated_at`

### 振る舞い

- **新規**: `job_id`が無い場合はサーバで採番。必須項目不足は`VALIDATION_ERROR`
- **更新**: `expectedUpdatedAt`不一致なら`CONFLICT_ERROR`。ホワイトリスト方式で更新
- **成功時**: `updated_at`をサーバ時刻で更新、`T_AuditLog`にbefore/afterを記録

---

## 6.6 saveAssignments（配置保存）

配置更新は「追加/更新/削除」が頻発するため、**差分まとめて1回**で保存する。

### 入力

```js
{
  upserts: [{ assignment_id, staff_id, worker_type, pay_unit, invoice_unit, ... }],
  deletes: ["asg_..."]
}
```

### 振る舞い

- 競合検知は**案件の`updated_at`**をキーに行う（配置変更時に案件も更新）
- `upserts`は`assignment_id`有無で更新/新規を判定
- `deletes`は論理削除を推奨
- 保存後に配置数と必要人数から表示状態を再計算
- 交通費は `transport_area` と `transport_amount` を分離し、以下の整合性を担保する
  - `transport_is_manual !== true` の場合、`transport_area` から `M_TransportFee.default_fee` を参照して `transport_amount` を自動セット
  - `transport_is_manual === true` の場合、`transport_amount` の手入力値を優先（サーバ側で上書きしない）
  - `transport_area` が未設定なら `transport_amount` も未設定（0埋めしない）
- スタッフ属性（例: `M_Staff.has_motorbike`）は **単価の自動計算/自動選択には使わない**（必要なら運用判断で `wage_rate/invoice_rate` を上書き）

---

## 6.7 同時編集（楽観ロック）

方式：保存時に`expectedUpdatedAt`を送信し、シート上の`updated_at`と不一致なら競合として拒否。

### ロックキー

- `saveJob` / `saveAssignments` とも **`T_Jobs.updated_at`** を編集単位のロックキーとして扱う
- 配置を変えたら案件の`updated_at`も更新して、別ユーザーの同時編集を検知

### LockService（短時間ロック）

- `LockService.getScriptLock()` で同一スクリプト内の同時保存を直列化
- `tryLock(3000)` など短時間で諦め、UIに「混み合っています」を出す
- ロックは競合検知の代替ではない。ロック取得後も`expectedUpdatedAt`チェックは必須

---

## 6.8 監査ログ（T_AuditLog）

全更新操作をログに残す：`timestamp`, `request_id`, `user_email`, `action`, `table`, `record_id`, `before_json`, `after_json`

### 目的

- 誤更新/問い合わせ時に「誰が/いつ/何を」変更したか追える
- 競合や障害時に、フロント表示の`requestId`からサーバログを辿れる

### 保存単位

- **「API呼び出し=ログ1行」** を基本とする
- `saveAssignments`は`note`に変更件数と主なIDを記録
- before/afterは**diff（更新フィールドのみ）** を保存し、容量を抑える

---

## 6.9 パフォーマンス注意

- ダッシュボード取得は「対象日だけ」を読み、必要フィールドに絞る
- ループ内のセルアクセスは禁止。`getValues()/setValues()`の一括I/Oを基本
- キャッシュは「マスター」だけ短TTL（60〜300秒）＋更新時に破棄
- トランザクション（当日の案件/配置）は原則キャッシュしない

---

## 6.10 更新検知（開きっぱなし対策）

`getDashboardMeta(date)`で当日データの`max(updated_at)`を返し、フロントが一定間隔でチェック。差分があれば「更新があります」トースト＋再読込誘導。

---

## 6.11 請求書（帳票）出力：PDF/Excel/編集して出力【12/16合意】

仕様上の混線を止めるため、バックエンドの関数契約として **「請求書（帳票）」** と **「請求データ（明細/集計）」** を明確に分離する。

### 出力モード

- `mode="pdf"`: PDFを生成してDriveに保存し、ダウンロードURLを返す（必須）
- `mode="excel"`: xlsxを生成してDriveに保存し、ダウンロードURLを返す（追加費用で合意済）
- `mode="edit"`: 編集用Spreadsheet（Google Sheets）を生成してDriveに保存し、編集URLを返す（別タブで開く）

### 関数契約（案）

```js
exportInvoice(customerId, ym, mode, options)
// customerId: "cus_..."
// ym: "2025-12"
// mode: "pdf" | "excel" | "edit"
// options: { sourceSheetFileId?: string } // 編集済みシートを出力元にする場合
```

### 返却値（案）

- `mode="pdf"|"excel"`: `{ fileId, url, invoiceId }`
- `mode="edit"`: `{ sheetFileId, url, invoiceId }`

### 永続化（テーブルとの対応）

- `T_Invoices.pdf_file_id` / `T_Invoices.excel_file_id` / `T_Invoices.sheet_file_id` を更新する
- 保存先フォルダは原則 `M_Customers.folder_id` 配下（未設定なら既定フォルダ）

### テンプレートベース実装（推奨）

- 様式1/2/頭紙は結合セルが多く、レイアウトをコードで組み立てるとコストが上がりやすい
- 推奨フロー
  1. テンプレxlsxをDrive上でGoogleスプレッドシート化し、テンプレIDを `ScriptProperties` 等で管理
  2. `makeCopy()`でテンプレを複製 → `SpreadsheetApp` で固定セル/明細行を転記
  3. `SpreadsheetApp.flush()` で数式反映を待つ
  4. PDF/xlsxへエクスポートしてDriveに保存
- テンプレ詳細・転記セルの目安は `docs/references/billing_templates/README.md` を参照

### 様式1（{{FORMAT1_TYPE}}）の実装メモ

- 参考テンプレ: `docs/references/billing_templates/【請求書】{{FORMAT1_TYPE}}_12月.xlsx`（シート名: `原本`）
  - 明細ヘッダが途中で繰り返される（例：`A76`）ため、その行は上書きしない
  - 合計は `I212 = SUM(I10:I210)`（明細はこの範囲に収める）

### 様式2（{{FORMAT2_TYPE}}）の実装メモ

- 参考テンプレ: `docs/references/billing_templates/{{FORMAT2_TYPE}}_9月_{{STAFF_NAME}}訂正済.xlsx`（シート名: `売上 ` ※末尾スペースあり）
  - 明細ヘッダが複数回繰り返される（例：`A101`, `A201`, `A300`）ため、その行は上書きしない
  - 合計は `I382 = SUM(I10:I380)`
  - 参考テンプレは発注No/営業所が **案件名セルへの埋め込み**（例：`現場名（発注No:033930）特需2`）
  - **運用方針（確定）**: 発注No/営業所は別列で出力し、汎用性（検索/集計/他顧客転用）を上げる
    - 運用テンプレは「分離版（発注No/営業所を列として持つ様式2テンプレ）」を別途作成して使用する

### 様式3（{{FORMAT3_TYPE}}）の実装メモ

- 参考テンプレ: `docs/references/billing_templates/{{FORMAT3_TYPE}}御中_2025年9月追加請求一覧0928時点（{{COMPANY_NAME_SHORT}}）-.xlsx`
  - 1枚シートの一覧表で、結合セルなし（行追加のみで成立）→ **他様式より実装難易度は低い**
  - シート名: `追加請求一覧（改1）`（1行目タイトル、2行目ヘッダ、3行目以降が明細）
  - 税込列は `税抜 × (1 + 税率)`（元Excelは `=Hn*1.1`）なので、サーバ側で計算 or 数式設定のどちらでも対応可能

### 頭紙（{{ATAMAGAMI_TYPE}}）の実装メモ

- 参考テンプレ: `docs/references/billing_templates/【頭紙】 {{ATAMAGAMI_TYPE}}.xlsx`（シート名: `原本`）
  - 合計は `AJ43`（`J14` は `AJ43` を参照する配置）
  - 「明細は別紙」運用のため、頭紙 + 明細（別紙）をセットで出す前提（同一スプレッドシートの別シートに明細を配置してPDF一括出力、が実装しやすい）

---

## 6.12 請求データ（明細/集計）エクスポート

「請求管理（Excel/CSVエクスポート）」は、**帳票レイアウト（請求書）ではなく集計データ**の出力を指す。

- 用途: 売上/請求の集計、社内確認、他システム取り込み
- 形式: `xlsx` または `csv`
- 主なソース: `T_Invoices`, `T_InvoiceLines`（必要に応じて顧客名等をJOIN）
