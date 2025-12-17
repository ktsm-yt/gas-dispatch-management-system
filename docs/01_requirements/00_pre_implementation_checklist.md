# 実装前チェックリスト

実装開始前に確認・準備が必要な項目一覧。

---

## 1. 先方から入手が必要なもの

### 1.1 初期データ（移行用）

| 項目 | 状態 | 備考 |
|------|------|------|
| [ ] 顧客マスタ（{{CUSTOMER_MASTER_COUNT}}） | 未入手 | Excel/CSV。会社名、住所、単価、締め日等 |
| [ ] スタッフマスタ（{{STAFF_MASTER_COUNT}}） | 未入手 | 氏名、連絡先、スキル、日給単価、**バイク有無**等（※単価は自動連動しない） |
| [ ] 外注先マスタ | 未入手 | 協力会社一覧 |

**確認ポイント**:
- フォーマットの確認（列名、日付形式、文字コード）
- 重複データの有無
- 必須項目の欠落チェック
- 元データ列 ↔ DBカラムのマッピング表を作成（移行時の手戻り防止）
- 表記ゆれの正規化方針（会社名/住所/氏名/カナ/記号）を決める

**移行スコープ（明文化推奨）**:
- 会議では「顧客{{CUSTOMER_MASTER_COUNT}}・スタッフ{{STAFF_MASTER_COUNT}}の初期登録」は**別料金（見積追加）**で進める認識
- それ以外（交通費マスター、顧客別単価表、請求書書式、単価選択肢など）の投入範囲は、後から揉めやすいので**対象一覧を箇条書きで確定**してから着手する

### 1.2 自社情報

請求書テンプレートから抽出済み（`docs/references/billing_templates/【頭紙】 {{CUSTOMER_NAME}}.xlsx`）

| 項目 | 値 | 状態 |
|------|-----|------|
| 会社名 | {{COMPANY_NAME}} | ✅ 確認済み |
| 郵便番号 | {{POSTAL_CODE}} | ✅ 確認済み |
| 住所 | {{ADDRESS}} | ✅ 確認済み |
| TEL | {{TEL}} | ✅ 確認済み |
| FAX | {{FAX}} | ✅ 確認済み |
| 登録番号 | {{INVOICE_REGISTRATION_NUMBER}} | ✅ 確認済み |
| 振込銀行 | {{BANK_NAME}} | ✅ 確認済み |
| 支店 | {{BRANCH_NAME}} | ✅ 確認済み |
| 口座番号 | {{ACCOUNT_NUMBER}} | ✅ 確認済み |
| 口座名義 | {{ACCOUNT_HOLDER}} | ✅ 確認済み |

| 項目 | 状態 | 備考 |
|------|------|------|
| [x] 会社ロゴ（PNG） | 入手済み | `docs/references/icon.png` |
| [ ] 印影画像（PNG） | 未入手 | 請求書に印字（簡易印影）→ 先方に依頼 |

> UIは `docs/references/icon.png` の配色を基準に設計する（ブランドカラーは `docs/03_spec/08_ui_components.md` に記載）。

### 1.3 請求書テンプレート

| 項目 | 状態 | 備考 |
|------|------|------|
| [x] 様式1（{{FORMAT1_TYPE}}型） | 入手済み | `【請求書】{{FORMAT1_TYPE}}_12月.xlsx` |
| [x] 様式2（{{FORMAT2_TYPE}}型・参考） | 入手済み | `{{FORMAT2_TYPE}}_9月_{{STAFF_NAME}}訂正済.xlsx`（参考xlsxは案件名に発注No/営業所を埋め込み） |
| [ ] 様式2（{{FORMAT2_TYPE}}型・分離版） | 未作成 | **運用は分離版テンプレを使用（確定）**：発注No/営業所を別列で出力 |
| [x] 様式3（{{FORMAT3_TYPE}}型） | 入手済み | `{{FORMAT3_TYPE}}御中_2025年9月追加請求一覧0928時点（{{COMPANY_NAME_SHORT}}）-.xlsx` |
| [x] 頭紙（{{ATAMAGAMI_TYPE}}型） | 入手済み | `【頭紙】 {{ATAMAGAMI_TYPE}}.xlsx` |
| [x] 作業員名簿（全国統一様式5） | 入手済み | `zenken5.xlsx` |

### 1.4 運用情報

| 項目 | 値 | 状態 |
|------|-----|------|
| Google Workspaceドメイン | `{{WORKSPACE_DOMAIN}}` | ✅ 確認済み |
| 社長（{{CEO_NAME}}様） | {{CEO_EMAIL}} | ✅ 確認済み |
| 番頭（{{MANAGER_NAME}}様） | {{MANAGER_EMAIL}} | ✅ 確認済み |
| 管理者メール（通知先） | 上記2名 | ✅ 確認済み |

---

## 2. 仕様の未確定事項

`docs/01_requirements/要件定義書_v1.1.md` と `docs/01_requirements/change_requests.md` を参照し、**実装前に確定が必要**な項目はCRログで「採用」にしてから着手する。

### 2.0 仕様ベースライン（凍結）と変更管理

- [ ] ベースライン仕様を確認: `docs/00_overview/{{COMPANY_NAME_SHORT}}_システム仕様書_v1.3_20251216.docx`
- [ ] 以後の変更はCRログで管理（採用＝確定、one-in-one-out）

| 項目 | 状態 | 対応方針 |
|------|------|----------|
| [ ] pay_unitの種類と単価テーブル | 未確定 | FULLDAY/HALFDAY/夜勤等の一覧を確定 |
| [ ] 交通費のエリア選択肢 | 未確定 | 23区内/23区外/埼玉/千葉/神奈川 等 |
| [ ] 交通費のデフォルト金額 | 未確定 | エリアごとの金額マスタ |
| [ ] 保留案件の運用ルール | 未確定 | 保留→確定の条件、締め処理との関係 |
| [ ] 外注先管理の運用 | 未確定 | PDFを並べて比較？手入力で登録？（要ヒアリング） |
| [ ] 消費税・端数処理（丸め） | 未確定 | **請求書/頭紙/給与/外注費**それぞれの端数処理を統一（頭紙テンプレは`ROUNDUP`の痕跡あり） |
| [x] 請求書（帳票）と請求データ（集計）の区別 | 確定（12/16合意） | 帳票=PDF/Excel/編集して出力、データ=Excel/CSVエクスポート（docs/03_spec参照） |
| [ ] 権限・編集範囲（社長/番頭/管理者） | 未確定 | マスター編集、帳票出力、監査ログ閲覧の範囲を決める |
| [ ] Drive/フォルダ運用（命名・共有・保存先） | 未確定 | 顧客フォルダ、帳票出力先、テンプレ置き場、バックアップ先を確定 |
| [ ] 年度アーカイブ運用開始タイミング | 未確定 | いつから年度分割するか、トリガーの実行権限/対象年度を決める |

### 確認方法

次回の打ち合わせで以下を確認：

```
1. スタッフの給与区分は何種類ありますか？
   - 終日、半日（AM/PM）、夜勤、時給...？
   - それぞれの金額は固定？スタッフごとに違う？

2. 交通費のエリアはどう分けていますか？
   - 現在の運用で使っている区分を教えてください
   - 各エリアの金額の目安は？

3. 「保留」案件はどういう時に発生しますか？
   - 確定するタイミングは？
   - 請求・給与計算には含める？含めない？

4. 外注先（協力会社）の管理はどうしていますか？
   - 何社くらいありますか？
   - 外注先からの請求書はどう処理していますか？
     - PDFを見て手入力？
     - 突き合わせて確認するだけ？
   - システムで管理したいことはありますか？
```

---

## 3. 環境構築

### 3.1 Google Workspace側

| 項目 | 状態 | 備考 |
|------|------|------|
| [ ] 開発用Googleアカウント準備 | 未実施 | 本番とは別のアカウント推奨 |
| [ ] 開発用スプレッドシート作成 | 未実施 | `{{PROJECT_NAME}}-db-dev` |
| [ ] 本番用スプレッドシート作成 | 未実施 | `{{PROJECT_NAME}}-db` |
| [ ] GASプロジェクト作成 | 未実施 | clasp経由で作成 |
| [ ] Driveフォルダ構成作成 | 未実施 | 出力/請求書、出力/給与明細 等 |
| [ ] テンプレ（様式1/2/3/頭紙）をGoogleスプレッドシート化 | 未実施 | テンプレIDを確定（様式2は分離版を使用） |
| [ ] DB/Driveの共有設定（権限） | 未実施 | 誰がDB編集/帳票閲覧できるか（ドメイン内、役割ごと） |

### 3.2 ローカル開発環境

| 項目 | 状態 | 備考 |
|------|------|------|
| [ ] Node.js インストール | 未確認 | v18以上 |
| [ ] clasp インストール | 未実施 | `npm install -g @google/clasp` |
| [ ] clasp ログイン | 未実施 | `clasp login` |
| [ ] リポジトリにGASプロジェクト連携 | 未実施 | `.clasp.json` 設定 |

---

## 4. 設定値の確定

### 4.1 Config.gs に設定する値

```javascript
const CONFIG = {
  PROD: {
    DB_SPREADSHEET_ID: '???',        // 本番DBのID
    PDF_FOLDER_ID: '???',            // PDF出力先フォルダID
    ARCHIVE_FOLDER_ID: '???',        // アーカイブ保存先フォルダID
    ADMIN_EMAILS: ['{{CEO_EMAIL}}', '{{MANAGER_EMAIL}}'],
    ALLOWED_DOMAIN: '{{WORKSPACE_DOMAIN}}',
    DEBUG: false
  },
  DEV: {
    DB_SPREADSHEET_ID: '???',        // 開発DBのID
    PDF_FOLDER_ID: '???',
    ARCHIVE_FOLDER_ID: '???',
    ADMIN_EMAILS: ['developer@example.com'],
    ALLOWED_DOMAIN: null,            // 開発時はドメイン制限なし
    DEBUG: true
  }
};
```

### 4.2 ScriptProperties に設定する値

| キー | 値 | 備考 |
|------|-----|------|
| ENV | DEV or PROD | 環境切り替え |
| TEMPLATE_FORMAT1_ID | ??? | 様式1テンプレート（Googleスプレッドシート化したもの）のID |
| TEMPLATE_FORMAT2_ID | ??? | 様式2テンプレート（**分離版**：発注No/営業所を別列で持つ）のID |
| TEMPLATE_FORMAT3_ID | ??? | 様式3テンプレート（Googleスプレッドシート化したもの）のID |
| TEMPLATE_ATAMAGAMI_ID | ??? | 頭紙テンプレート（Googleスプレッドシート化したもの）のID |

> ロゴ/印影は `M_Company.logo_file_id` / `M_Company.stamp_file_id` に保持する（未設定時はロゴ/印影なしで出力できる設計にする）。

---

## 5. 実装順序の確認

### Phase 1: 基幹機能（推奨順序）

```
1. 環境構築・DB作成
   ↓
2. マスター機能（CRUD基盤）
   - M_Customers（顧客）
   - M_Staff（スタッフ）
   - M_TransportFee（交通費）
   ↓
3. 案件管理
   - T_Jobs（案件CRUD）
   - ダッシュボード表示（6列）
   ↓
4. 配置管理
   - T_JobAssignments（配置CRUD）
   - スタッフ検索・割当UI
   ↓
5. LINEテンプレート生成
   ↓
6. 初期データ移行
   - 顧客{{CUSTOMER_MASTER_COUNT}}
   - スタッフ{{STAFF_MASTER_COUNT}}
```

### Phase 2: 請求機能

```
1. 請求管理
   - T_Invoices / T_InvoiceLines
   - 顧客別・月別集計
   ↓
2. 請求書出力
   - PDF出力（様式1/2/3/頭紙）
   - Excel出力
   - 編集して出力
   ↓
3. 給与管理
   - T_Payouts
   - スタッフ別集計
   ↓
4. 外注費管理
   ↓
5. 売上集計
```

---

## 6. リスク確認

実装開始前に `docs/03_spec/10_implementation_risks.md` を確認し、以下を把握：

- [ ] GAS 6分制限の回避パターン
- [ ] 楽観ロック + LockService の実装方法
- [ ] キャッシュ戦略（マスターのみ短TTL）
- [ ] 帳票テンプレートの設計ガイドライン

---

## 7. 次のアクション

### 開発者側

1. [ ] ローカル環境構築
2. [ ] 開発用スプレッドシート作成・シート構造定義
3. [ ] GASプロジェクト作成・clasp連携
4. [ ] Config.gs 雛形作成

### 先方への依頼

1. [ ] 初期データ（顧客・スタッフ）の提供依頼
2. [ ] 自社情報（登録番号、振込先等）の確認
3. [ ] 印影画像の提供依頼
4. [ ] 未確定事項の確認（pay_unit、交通費エリア、保留運用）
5. [ ] 利用者のGoogleアカウント確認

---

## 関連ドキュメント

- [01_requirements/change_requests.md](../01_requirements/change_requests.md) - 変更要求管理
- [05_ops/10_development.md](../05_ops/10_development.md) - 開発環境セットアップ
- [03_spec/10_implementation_risks.md](../03_spec/10_implementation_risks.md) - 実装リスク
- [03_spec/08_ui_components.md](../03_spec/08_ui_components.md) - UIコンポーネント・カラースキーム
- [references/billing_templates/README.md](../references/billing_templates/README.md) - 帳票テンプレまとめ
