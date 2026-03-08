# 5. データベース設計

> **Note**: 細かな項目（カラム名/enum/帳票項目など）は先方データ到着後に確定する。
> ただし運用上「保留（HOLD）」は必要になる想定のため、設計/画面/APIは保留を前提にする。

> **更新履歴**
> - 2026-01-30: 案件ステータスから未使用の `completed`（完了）を削除、`problem`（問題あり）を追加

## 5.0 スプレッドシート設計方針

- 年度別にスプレッドシート（または案件系シート）を分割し、1年あたり{{ANNUAL_JOB_COUNT}}規模を想定
- 全テーブルに以下の共通カラムを付与（競合検知・監査・移行が楽になる）

| カラム | 型 | 用途 |
|--------|-----|------|
| id | STRING(UUID) | 主キー（行番号依存を避ける） |
| created_at | DATETIME(ISO) | 作成日時 |
| created_by | STRING(email) | 作成者 |
| updated_at | DATETIME(ISO) | 更新日時（楽観ロックに使用） |
| updated_by | STRING(email) | 更新者 |
| is_deleted | BOOL | 論理削除（検索で除外） |

---

## 5.1 テーブル一覧

| No | テーブル名 | 用途 | シート名 |
|----|------------|------|----------|
| 1 | M_Customers | 顧客マスター | 顧客 |
| 2 | M_Staff | スタッフマスター | スタッフ |
| 3 | M_Subcontractors | 外注先マスター | 外注先 |
| 4 | M_TransportFee | 交通費マスター | 交通費 |
| 5 | M_Company | 自社情報マスター | 自社情報 |
| 6 | T_Jobs | 案件トランザクション | 案件 |
| 7 | T_JobAssignments | 配置トランザクション | 配置 |
| 8 | T_Invoices | 請求トランザクション | 請求 |
| 9 | T_InvoiceLines | 請求明細トランザクション | 請求明細 |
| 10 | T_Payouts | 支払トランザクション | 支払 |
| 11 | T_AuditLog | 操作ログ | ログ |
| 12 | T_Payments | 入金記録トランザクション | 入金記録 |

---

## 5.2 M_Customers（顧客マスター）

| カラム名 | 型 | 必須 | 説明 |
|----------|-----|------|------|
| customer_id | STRING | ○ | 顧客ID（主キー・UUID） |
| company_name | STRING | ○ | 会社名 |
| branch_name | STRING | - | 支店・営業所名 |
| department_name | STRING | - | 部署名（経理ご担当者様 等） |
| contact_name | STRING | - | 担当者名（羽田様 等） |
| honorific | STRING | - | 敬称（様/御中） |
| postal_code | STRING | - | 郵便番号（例: 350-0023） |
| address | STRING | - | 住所 |
| phone | STRING | - | 電話番号 |
| fax | STRING | - | FAX番号 |
| email | STRING | - | メールアドレス |
| unit_price_basic | NUMBER | - | 基本単価（税抜） |
| unit_price_tobi | NUMBER | - | 鳶単価（税抜） |
| unit_price_age | NUMBER | - | 揚げ単価（税抜） |
| unit_price_tobiage | NUMBER | - | 鳶揚げ単価（税抜） |
| unit_price_half | NUMBER | - | ハーフ単価（税抜） |
| unit_price_fullday | NUMBER | - | 終日単価（税抜） |
| unit_price_night | NUMBER | - | 夜間単価（税抜） |
| unit_price_holiday | NUMBER | - | 休日単価（税抜） |
| closing_day | NUMBER | - | 締め日（1-31、末日=31） |
| payment_day | NUMBER | - | 支払日（締め後何日） |
| payment_month_offset | NUMBER | - | 支払月（0=当月、1=翌月、2=翌々月） |
| invoice_format | STRING | - | 請求書書式（format1/format2/format3/atamagami） |
| tax_rate | NUMBER | - | 消費税率（デフォルト10%） |
| expense_rate | NUMBER | - | 諸経費率（%、頭紙用） |
| shipper_name | STRING | - | 荷主名（請求書表示用、未設定なら会社名） |
| customer_code | STRING | - | 顧客コード（先方管理番号） |
| invoice_registration_number | STRING | - | 適格請求書発行事業者登録番号（T+13桁） |
| folder_id | STRING | - | 関連ファイル格納フォルダID |
| notes | STRING | - | 備考 |
| created_at | DATETIME | ○ | 作成日時 |
| updated_at | DATETIME | ○ | 更新日時 |
| is_active | BOOLEAN | ○ | 有効フラグ |

**invoice_format 値**
- `format1`: 様式1（{{FORMAT1_TYPE}}型）
  - 列: 日付 | 案件名 | 品目 | 時間/備考 | 数量 | 単位 | 単価 | 金額
  - 品目例: 作業員（上棟荷揚げ）、作業員（ハーフ）
  - 参考テンプレ: `docs/references/billing_templates/【請求書】{{FORMAT1_TYPE}}_12月.xlsx`（シート名: `原本`）
- `format2`: 様式2（{{FORMAT2_TYPE}}型）
  - 列: 日付 | 案件名 | **発注No** | **営業所** | 品目 | 時間/備考 | 数量 | 単位 | 単価 | 金額
  - 参考テンプレ（先方提供の現状）: `docs/references/billing_templates/{{FORMAT2_TYPE}}_9月_{{STAFF_NAME}}訂正済.xlsx`（シート名: `売上 ` ※末尾スペースあり）
    - 現状テンプレでは `発注No/営業所` が **案件名セルに埋め込み**（例: `現場名（発注No:033930）特需2`）
  - **システムの出力方針（確定）**: 発注No/営業所は別カラム（`order_number` / `branch_office`）として保持し、帳票出力でも別列で出す（汎用性・検索性を優先）
    - 運用テンプレは「分離版（発注No/営業所を列として持つ様式2テンプレ）」を使用し、そこへ転記する
- `format3`: 様式3（{{FORMAT3_TYPE}}型）
  - 列: 担当工事課 | 担当監督名 | 物件コード | 現場名 | 施工日 | 内容 | 金額（税抜）| 金額（税込）
  - 参考テンプレ: `docs/references/billing_templates/{{FORMAT3_TYPE}}御中_2025年9月追加請求一覧0928時点（{{COMPANY_NAME_SHORT}}）-.xlsx`
    - シート名: `追加請求一覧（改1）`
    - 構造: 1行目タイトル、2行目ヘッダ、3行目以降が明細（結合セルなし）
    - 金額（税込）: `金額（税抜） × (1 + tax_rate)`（元Excelは `=Hn*1.1`）
- `atamagami`: 頭紙（{{ATAMAGAMI_TYPE}}型）
  - サマリー形式: 作業費/諸経費 → 小計 → 消費税 → 合計
  - 明細は別紙
  - 参考テンプレ: `docs/references/billing_templates/【頭紙】 {{ATAMAGAMI_TYPE}}.xlsx`（シート名: `原本`）

> **標準対応**: 上記の標準4種（format1/format2/format3/atamagami）までは内包。  
> **顧客指定の独自フォーマット**（上記以外）は別途対応（追加費用）として切り分ける。

**印影位置（テンプレート実装時の参考）**
- 様式1/2（請求書）: E2〜E7 あたり（自社情報欄の右側）
- 頭紙: 会社ロゴの隣
- 様式3（{{FORMAT3_TYPE}}）: 不要

**出力フロー**
```
WebUI 請求書一覧
├── [PDF出力] → 直接PDF生成・ダウンロード
├── [Excel出力] → 直接xlsx生成・ダウンロード（追加費用で合意済）
└── [編集して出力] → Spreadsheetを別タブで開く → 編集 → PDF/Excel出力
```

> **用語の区別（揉め防止）**
> - **請求書（帳票）**: 上記のPDF/xlsx/編集して出力（「帳票」そのもの）
> - **請求データ（明細/集計）**: 請求管理画面のExcel/CSVエクスポート（集計データ）

---

## 5.3 M_Staff（スタッフマスター）

| カラム名 | 型 | 必須 | 説明 |
|----------|-----|------|------|
| staff_id | STRING | ○ | スタッフID（主キー・UUID） |
| name | STRING | ○ | 氏名 |
| name_kana | STRING | - | 氏名カナ |
| phone | STRING | - | 電話番号 |
| line_id | STRING | - | LINE ID |
| postal_code | STRING | - | 郵便番号 |
| address | STRING | - | 住所 |
| has_motorbike | BOOLEAN | - | バイク保有フラグ（有/無）※単価とは自動連動しない |
| skills | STRING | - | スキル（鳶/揚げ/鳶揚げ）カンマ区切り |
| ng_customers | STRING | - | NG顧客ID一覧（カンマ区切り） |
| daily_rate_half | NUMBER | - | 日給（ハーフ/半日） |
| daily_rate_basic | NUMBER | - | 日給（基本） |
| daily_rate_fullday | NUMBER | - | 日給（終日） |
| daily_rate_night | NUMBER | - | 日給（夜間） |
| daily_rate_tobi | NUMBER | - | 日給（鳶）※鳶揚げは鳶×1.5で計算 |
| daily_rate_holiday | NUMBER | - | 日給（休日） |
| staff_type | STRING | ○ | 種別（regular/student/sole_proprietor/subcontract） |
| employment_type | STRING | - | 雇用形態（employee/sole_proprietor）※2025/12/19追加 |
| withholding_tax_applicable | BOOLEAN | - | 源泉徴収対象フラグ（true=源泉徴収する）。未設定時はstaff_typeに応じて自動補完（regular/student→true、sole_proprietor/subcontract→false）※2025/12/19追加 |
| subcontractor_id | STRING | - | 外注先ID（外注の場合） |
| notes | STRING | - | 備考 |
| created_at | DATETIME | ○ | 作成日時 |
| updated_at | DATETIME | ○ | 更新日時 |
| is_active | BOOLEAN | ○ | 有効フラグ |

> **バイク有無と単価の関係（注意）**  
> `has_motorbike` はスタッフ属性として保持するが、システムが単価を自動変更/自動選択するルールは持たせない。  
> 単価は `daily_rate_*` および配置の `wage_rate/invoice_rate`（必要に応じて上書き）で別途管理する。

### 安全書類用項目（全国統一様式 作業員名簿）

| カラム名 | 型 | 必須 | 説明 |
|----------|-----|------|------|
| ccus_id | STRING | - | 技能者ID（建設キャリアアップシステム） |
| birth_date | DATE | - | 生年月日 |
| gender | STRING | - | 性別（male/female） |
| blood_type | STRING | - | 血液型（緊急連絡用） |
| emergency_contact | STRING | - | 緊急連絡先 |
| job_title | STRING | - | 職種（とび工/荷揚工 等） |
| health_insurance_number | STRING | - | 健康保険（健保組合/協会けんぽ/建設国保/国保/適用除外） |
| pension_type | STRING | - | 年金保険（厚生年金/国民年金/受給者） |
| employment_insurance_no | STRING | - | 雇用保険番号（下4桁） |
| kensetsu_kyosai | STRING | - | 建退共（有/無） |
| chusho_kyosai | STRING | - | 中退共（有/無） |
| special_training | STRING | - | 特別教育（カンマ区切り） |
| skill_training | STRING | - | 技能講習（カンマ区切り） |
| licenses | STRING | - | 免許（カンマ区切り） |
| hire_date | DATE | - | 雇入日 |
| foreigner_type | STRING | - | 外国人区分（技能実習/特定技能1号/null） |

**特殊役割（案件配置時に指定）**
- 現場代理人、作業主任者、職長、安全衛生責任者 → T_JobAssignments で管理

> **運用上の注意（UI設計時に考慮）**
>
> 全国統一様式（作業員名簿）が必要な現場は一部に限られる。
> 日常業務では以下の基本項目のみで運用し、安全書類項目は必要時に入力する想定。
>
> **基本項目（常時使用）**
> - 氏名、カナ、電話、LINE ID、住所
> - バイク有無（単価とは自動連動しない）
> - スキル、NG顧客
> - 日給単価（鳶/揚げ/鳶揚げ/ハーフ）
> - 種別、外注先ID
>
> **安全書類項目（必要な現場のみ）**
> - CCUS ID、生年月日、性別、血液型、緊急連絡先
> - 保険情報（健康/年金/雇用）、退職金共済
> - 資格・免許・特別教育
>
> **UI方針**: 基本項目は常に表示、安全書類項目は折りたたみ or 別タブで任意入力。
> 統一様式が必要な案件では、未入力項目を入力促進する仕組みを検討。

### 雇用形態と源泉徴収（2025/12/19追加）

**employment_type 値**
- `employee`: アルバイト（学生含む）。源泉徴収対象
- `sole_proprietor`: 個人事業主（一人親方含む）。源泉徴収対象外

**源泉徴収の運用**
- `withholding_tax_applicable = true` のスタッフは給与支払時に源泉所得税を控除
- 税額計算は給与額に応じた税額表（国税庁）に基づく
- ロジックが複雑でなければシステムに組み込む予定（詳細は別途協議）
- 扶養控除は対象外（アルバイトに扶養家族なし、個人事業主は対象外）

---

## 5.4 M_Subcontractors（外注先マスター）

スタッフ不足時に依頼する協力会社。最低限の管理のみ。

| カラム名 | 型 | 必須 | 説明 |
|----------|-----|------|------|
| subcontractor_id | STRING | ○ | 外注先ID（主キー・UUID） |
| company_name | STRING | ○ | 会社名 |
| contact_name | STRING | - | 担当者名 |
| phone | STRING | - | 電話番号 |
| notes | STRING | - | 備考 |
| basic_rate | NUMBER | - | 基本単価（円） |
| half_day_rate | NUMBER | - | ハーフ単価（円） |
| full_day_rate | NUMBER | - | 終日単価（円） |
| night_rate | NUMBER | - | 夜勤単価（円） |
| tobi_rate | NUMBER | - | 鳶単価（円） |
| age_rate | NUMBER | - | 荷揚げ単価（円） |
| tobiage_rate | NUMBER | - | 鳶揚げ単価（円） |
| holiday_rate | NUMBER | - | 休日単価（円） |
| folder_id | STRING | - | 関連ファイル格納フォルダID（請求書PDF等） |
| created_at | DATETIME | ○ | 作成日時 |
| updated_at | DATETIME | ○ | 更新日時 |
| is_active | BOOLEAN | ○ | 有効フラグ |

> **運用想定**
> - 外注先は数社程度の想定。基幹機能ほどハードには使わない
> - 外注先から届いた請求書PDF等は `folder_id` のフォルダに格納し、並べて比較できればOK
> - 外注スタッフは M_Staff に `staff_type=subcontract` + `subcontractor_id` で登録
>
> **将来拡張（必要になったら）**
> - 締め日・支払日・振込先銀行情報などの項目追加
> - T_Payouts での支払い集計

---

## 5.5 T_Jobs（案件トランザクション）

| カラム名 | 型 | 必須 | 説明 |
|----------|-----|------|------|
| job_id | STRING | ○ | 案件ID（主キー・UUID） |
| customer_id | STRING | ○ | 顧客ID（外部キー） |
| site_name | STRING | ○ | 現場名 |
| site_address | STRING | - | 現場住所 |
| work_date | DATE | ○ | 作業日 |
| time_slot | STRING | ○ | 時間区分（後述） |
| start_time | TIME | - | 開始時間 |
| required_count | NUMBER | ○ | 必要人数 |
| job_type | STRING | ○ | 作業種別（鳶/揚げ/鳶揚げ） |
| supervisor_name | STRING | - | 担当監督名 |
| order_number | STRING | - | 発注ナンバー |
| branch_office | STRING | - | 営業所 |
| property_code | STRING | - | 物件コード（{{FORMAT3_TYPE}}用） |
| construction_div | STRING | - | 担当工事課（{{FORMAT3_TYPE}}用） |
| status | STRING | ○ | ステータス（後述） |
| notes | STRING | - | 備考 |
| created_at | DATETIME | ○ | 作成日時 |
| updated_at | DATETIME | ○ | 更新日時 |
| created_by | STRING | ○ | 作成者 |

**time_slot 値**
- `jotou`: 上棟
- `shuujitsu`: 終日
- `am`: AM
- `pm`: PM
- `yakin`: 夜勤
- `mitei`: 開始時間未定

**status 値**
- `pending`: 未配置
- `assigned`: 配置済
- `hold`: 保留
- `cancelled`: キャンセル
- `problem`: 問題あり

---

## 5.6 T_JobAssignments（配置トランザクション）

| カラム名 | 型 | 必須 | 説明 |
|----------|-----|------|------|
| assignment_id | STRING | ○ | 配置ID（主キー・UUID） |
| job_id | STRING | ○ | 案件ID（外部キー） |
| staff_id | STRING | ○ | スタッフID（外部キー） |
| worker_type | STRING | ○ | 種別（STAFF/SUBCONTRACT） |
| subcontractor_id | STRING | - | 外注先ID（外注の場合） |
| display_time_slot | STRING | ○ | ダッシュボード上の列（案件のtime_slotと同じが基本） |
| pay_unit | STRING | ○ | 給与の支給区分（FULLDAY/HALFDAY/HOURLY 等） |
| invoice_unit | STRING | ○ | 請求側の区分（顧客ルールにより異なる場合に使用） |
| wage_rate | NUMBER | - | 給与単価（未設定ならスタッフ/顧客設定から解決） |
| invoice_rate | NUMBER | - | 請求単価（未設定なら顧客設定から解決） |
| transport_area | STRING | - | 交通費エリア（23区内/外/県別など） |
| transport_amount | NUMBER | - | 交通費（手入力優先） |
| transport_is_manual | BOOLEAN | - | 交通費手入力フラグ（true=金額を手入力で上書き） |
| site_role | STRING | - | 現場役割（作業員名簿用、後述） |
| entry_date | DATE | - | 入場年月日（作業員名簿用） |
| safety_training_date | DATE | - | 受入教育実施日（作業員名簿用） |
| status | STRING | ○ | ステータス（ASSIGNED/CONFIRMED/CANCELLED 等） |
| created_at | DATETIME | ○ | 作成日時 |
| updated_at | DATETIME | ○ | 更新日時 |

**site_role 値（作業員名簿 ※欄用）**
- `genba_dairi`: 現場代理人（◎）
- `sagyo_shunin`: 作業主任者（○）
- `shokcho`: 職長（■）
- `anzen_sekinin`: 安全衛生責任者（△）
- `shunin_gijutsu`: 主任技術者（□）
- null: 一般作業員

> **配置明細に単価決定情報を持たせる**  
> 『時間区分（表示/配置）』『給与単価』『請求単価』のズレを吸収するため、配置に `pay_unit/invoice_unit` と単価を持たせる（実装は `saveAssignments` の差分保存を前提）。
>
> **交通費エリアについて**  
> スタッフが配属される「現場の住所」で23区内/外を判定する（顧客本社の住所ではない）
>
> **交通費（自動セット/上書き）**  
> `transport_area` 選択時に `M_TransportFee.default_fee` を `transport_amount` に自動セットし、`transport_is_manual=false`。  
> `transport_amount` を手入力で上書きした場合は `transport_is_manual=true` として保存する。

---

## 5.7 M_TransportFee（交通費マスター）

| カラム名 | 型 | 必須 | 説明 |
|----------|-----|------|------|
| area_code | STRING | ○ | エリアコード |
| area_name | STRING | ○ | エリア名（23区内/23区外/埼玉県 等） |
| default_fee | NUMBER | ○ | デフォルト交通費 |

---

## 5.8 T_Invoices（請求トランザクション）

| カラム名 | 型 | 必須 | 説明 |
|----------|-----|------|------|
| invoice_id | STRING | ○ | 請求ID（主キー・UUID） |
| invoice_number | STRING | ○ | 請求番号（例: 2511_375 = 2025年11月の375番） |
| customer_id | STRING | ○ | 顧客ID（外部キー） |
| billing_year | NUMBER | ○ | 請求対象年（2025） |
| billing_month | NUMBER | ○ | 請求対象月（1-12） |
| issue_date | DATE | ○ | 発行日 |
| due_date | DATE | - | 支払期限 |
| subtotal | NUMBER | ○ | 小計（税抜） |
| expense_amount | NUMBER | - | 諸経費（税抜、頭紙用） |
| tax_amount | NUMBER | ○ | 消費税額 |
| total_amount | NUMBER | ○ | 合計金額（税込） |
| invoice_format | STRING | ○ | 使用書式（format1/format2/format3/atamagami） |
| shipper_name | STRING | - | 荷主名（請求書表示用） |
| pdf_file_id | STRING | - | 生成済みPDFのDriveファイルID |
| excel_file_id | STRING | - | 生成済みExcelのDriveファイルID |
| sheet_file_id | STRING | - | 編集用SpreadsheetのDriveファイルID（編集して出力用） |
| status | STRING | ○ | ステータス（unsent/sent/unpaid/paid） |
| notes | STRING | - | 備考 |
| created_at | DATETIME | ○ | 作成日時 |
| updated_at | DATETIME | ○ | 更新日時 |
| created_by | STRING | ○ | 作成者 |

**invoice_number 採番ルール**
- 形式: `YYMM_SEQ`（例: 2511_375）
- YY: 年の下2桁、MM: 月2桁
- SEQ: 顧客ごとの連番（リセットしない）

**status 値**（2026-01-30 実装に合わせて更新）
- `unsent`: 未送付（編集可）
- `sent`: 送付済み
- `unpaid`: 未回収（期限超過時に自動遷移）
- `paid`: 入金済み

**ステータス遷移ルール**
```
unsent → sent（送付操作）
sent → paid（全額入金）
sent → unpaid（期限超過時に自動更新）
unpaid → paid（全額入金）
```

---

## 5.9 T_InvoiceLines（請求明細）

| カラム名 | 型 | 必須 | 説明 |
|----------|-----|------|------|
| line_id | STRING | ○ | 明細ID（主キー・UUID） |
| invoice_id | STRING | ○ | 請求ID（外部キー） |
| line_number | NUMBER | ○ | 行番号（表示順） |
| work_date | DATE | ○ | 作業日 |
| job_id | STRING | - | 案件ID（紐付け用、手入力行はnull） |
| assignment_id | STRING | - | 配置ID（紐付け用） |
| site_name | STRING | ○ | 現場名 |
| item_name | STRING | ○ | 品目（作業員（上棟荷揚げ）等） |
| time_note | STRING | - | 時間/備考（8:00〜 等） |
| quantity | NUMBER | ○ | 数量（人数） |
| unit | STRING | ○ | 単位（人/式） |
| unit_price | NUMBER | ○ | 単価（税抜） |
| amount | NUMBER | ○ | 金額（税抜）= quantity × unit_price |
| order_number | STRING | - | 発注ナンバー（様式2用: 033930等） |
| branch_office | STRING | - | 営業所（様式2用: 特需2/世田谷/立川等） |
| construction_div | STRING | - | 担当工事課（様式3用: {{FORMAT3_TYPE}}） |
| supervisor_name | STRING | - | 担当監督名（様式3用: {{FORMAT3_TYPE}}） |
| property_code | STRING | - | 物件コード（様式3用: {{FORMAT3_TYPE}}） |
| tax_amount | NUMBER | - | 消費税額（明細単位で計算する場合） |
| created_at | DATETIME | ○ | 作成日時 |
| updated_at | DATETIME | ○ | 更新日時 |

**item_name 値（例）**
- `作業員（上棟荷揚げ）`: 上棟荷揚げ作業
- `作業員（上棟鳶）`: 上棟鳶作業
- `作業員（ハーフ）`: 半日作業
- `作業員`: 一般作業（{{FORMAT2_TYPE}}等）
- `作業費`: 頭紙用サマリー行
- `諸経費`: 頭紙用諸経費行

---

## 5.10 T_Payouts（支払トランザクション）

| カラム名 | 型 | 必須 | 説明 |
|----------|-----|------|------|
| payout_id | STRING | ○ | 支払ID（主キー・UUID） |
| payout_type | STRING | ○ | 支払区分（staff/subcontractor） |
| staff_id | STRING | - | スタッフID（スタッフ払いの場合） |
| subcontractor_id | STRING | - | 外注先ID（外注払いの場合） |
| billing_year | NUMBER | ○ | 対象年 |
| billing_month | NUMBER | ○ | 対象月 |
| base_amount | NUMBER | ○ | 基本支払額（税抜） |
| transport_amount | NUMBER | - | 交通費合計 |
| adjustment_amount | NUMBER | - | 調整額（±） |
| tax_amount | NUMBER | - | 源泉/消費税額 |
| total_amount | NUMBER | ○ | 支払総額 |
| status | STRING | ○ | ステータス（draft/confirmed/paid） |
| paid_date | DATE | - | 支払日 |
| notes | STRING | - | 備考 |
| created_at | DATETIME | ○ | 作成日時 |
| updated_at | DATETIME | ○ | 更新日時 |

**status 値**
- `draft`: 下書き（計算中）
- `confirmed`: 確定（支払予定）
- `paid`: 支払済み

---

## 5.11 M_Company（自社情報マスター）

| カラム名 | 型 | 必須 | 説明 |
|----------|-----|------|------|
| company_id | STRING | ○ | 会社ID（主キー、通常1レコード） |
| company_name | STRING | ○ | 会社名（{{COMPANY_NAME}}） |
| postal_code | STRING | ○ | 郵便番号（120-0034） |
| address | STRING | ○ | 住所 |
| phone | STRING | ○ | 電話番号 |
| fax | STRING | - | FAX番号 |
| invoice_registration_number | STRING | ○ | 適格請求書発行事業者登録番号（{{INVOICE_REGISTRATION_NUMBER}}） |
| bank_name | STRING | ○ | 振込先銀行名 |
| bank_branch | STRING | ○ | 支店名（支店コード） |
| bank_account_type | STRING | ○ | 口座種別（普通/当座） |
| bank_account_number | STRING | ○ | 口座番号 |
| bank_account_name | STRING | ○ | 口座名義 |
| logo_file_id | STRING | - | ロゴ画像のDriveファイルID |
| stamp_file_id | STRING | - | 印影画像のDriveファイルID |
| updated_at | DATETIME | ○ | 更新日時 |

> **用途**: 請求書・頭紙に印字する自社情報。基本的に1レコードのみ。

---

## 5.12 T_AuditLog（監査ログ）

| カラム名 | 型 | 必須 | 説明 |
|----------|-----|------|------|
| log_id | STRING | ○ | ログID |
| timestamp | DATETIME | ○ | 日時 |
| user_email | STRING | ○ | 操作ユーザー |
| action | STRING | ○ | 操作（CREATE/UPDATE/DELETE） |
| table_name | STRING | ○ | 対象テーブル |
| record_id | STRING | ○ | 対象レコードID |
| before_data | STRING | - | 変更前データ（JSON） |
| after_data | STRING | - | 変更後データ（JSON） |

---

## 5.13 T_Payments（入金記録）

> **追加日**: 2026-01-30（P3: 未収管理機能）

請求書に対する入金を記録し、売掛金を管理するためのテーブル。

| カラム名 | 型 | 必須 | 説明 |
|----------|-----|------|------|
| payment_id | STRING | ○ | 入金ID（主キー・UUID） |
| invoice_id | STRING | ○ | 請求ID（外部キー → T_Invoices） |
| payment_date | DATE | ○ | 入金日 |
| amount | NUMBER | ○ | 入金額 |
| payment_method | STRING | ○ | 入金方法（bank_transfer/cash/other） |
| bank_ref | STRING | - | 銀行参照番号（振込明細の照合用） |
| notes | STRING | - | 備考 |
| is_deleted | BOOLEAN | ○ | 論理削除フラグ |
| created_at | DATETIME | ○ | 作成日時 |
| created_by | STRING | ○ | 作成者 |
| deleted_at | DATETIME | - | 削除日時 |
| deleted_by | STRING | - | 削除者 |

**payment_method 値**
- `bank_transfer`: 銀行振込
- `cash`: 現金
- `other`: その他（小切手、相殺など）

**運用想定**
- 請求書1件に対して複数の入金記録を登録可能（分割入金対応）
- 入金記録の合計が請求金額に達すると、請求書ステータスを自動で `paid` に更新
- 入金記録を削除（論理削除）すると、請求書ステータスを `unpaid` に戻す

**関連機能**
- 請求書一覧での入金状況表示（入金額/残高）
- 期限超過フィルタ（`due_date < 今日` かつ `status != 'paid'`）
- 監査ログ連携（入金記録の作成/削除を T_AuditLog に記録）
