# 環境変数セットアップガイド

このプロジェクトでは、顧客固有情報を `.env` ファイルで管理し、ドキュメント内の `{{PLACEHOLDER}}` を自動置換できます。

---

## クイックスタート（5分）

```bash
# 1. .env を作成
npm run env:init

# 2. 請求書テンプレートから会社情報を自動抽出
npm run env:fill:templates

# 3. 仕様書docxから案件数などを自動抽出
npm run env:fill

# 4. 未設定の項目を確認
npm run env:check

# 5. ドキュメントをレンダリングして確認
npm run render:docs
open _rendered/docs/README.md
```

---

## 各コマンド詳細

### `npm run env:init`

`.env.example` をコピーして `.env` を作成します。

```bash
npm run env:init
# => Created `.env` from `.env.example`.
```

| 状況 | 動作 |
|------|------|
| `.env` がない | `.env.example` からコピー |
| `.env` がある | 何もしない（上書きしない） |
| 強制上書きしたい | `npm run env:init -- --force` |

**ポイント**: `--force` で上書きする場合、既存の `.env` は `.env.bak.YYYYMMDD-HHMMSS` にバックアップされます。

---

### `npm run env:fill:templates`

`docs/references/billing_templates/` にある請求書テンプレート（xlsx）から、会社情報・口座情報・様式名などを自動抽出して `.env` に反映します。

```bash
npm run env:fill:templates
# => Updated .env using billing templates (head-sheet: 【頭紙】 サンプル産業.xlsx)
# => Updated keys (12): ACCOUNT_HOLDER, ACCOUNT_NUMBER, ADDRESS, ...
```

**抽出される項目**:
- 会社名、住所、電話番号、FAX
- インボイス登録番号（T + 13桁）
- 銀行名、支店名、口座番号、口座名義
- 様式名（FORMAT1_TYPE, FORMAT2_TYPE, FORMAT3_TYPE, ATAMAGAMI_TYPE）

**前提条件**: `docs/references/billing_templates/` に `【頭紙】*.xlsx` が存在すること

**オプション**:
```bash
# 別の頭紙ファイルを指定
npm run env:fill:templates -- --head-sheet path/to/file.xlsx

# 変更内容を確認するだけ（書き込まない）
npm run env:fill:templates -- --dry-run
```

---

### `npm run env:fill`

仕様書（docx）から案件数・フェーズ費用などを自動抽出して `.env` に反映します。

```bash
npm run env:fill
# => Updated .env using サンプルカンパニー_システム仕様書_v1.3_20251216.docx
# => Updated keys (7): DAILY_JOB_COUNT_RANGE, ANNUAL_JOB_COUNT, ...
```

**抽出される項目**:
- 1日あたり案件数、年間案件数、月間案件数
- 顧客数、スタッフ数、同時接続数
- フェーズ1/2の費用

**前提条件**: `docs/00_overview/` に仕様書 `.docx` が存在すること

**オプション**:
```bash
# 別のdocxファイルを指定
npm run env:fill -- --docx path/to/file.docx

# 変更内容を確認するだけ（書き込まない）
npm run env:fill -- --dry-run
```

---

### `npm run env:check`

`.env` と `.env.example` を比較し、まだサンプル値のままのキーを一覧表示します。

```bash
npm run env:check
# => same_as_example: 3
# => GOOGLE_WORKSPACE_DOMAIN
# => OWNER_EMAIL
# => MANAGER_EMAIL
# => missing_in_env: 0
# => extra_in_env: 0
```

| 出力 | 意味 |
|------|------|
| `same_as_example` | `.env.example` と同じ値のまま（要設定） |
| `missing_in_env` | `.env.example` にあるが `.env` にない |
| `extra_in_env` | `.env` にあるが `.env.example` にない |

**終了コード**: `missing_in_env > 0` の場合は終了コード1（CI向け）

---

### `npm run render:docs`

`docs/` 配下の Markdown ファイル内の `{{PLACEHOLDER}}` を `.env` の値で置換し、`_rendered/` に出力します。

```bash
npm run render:docs
# => Rendered 15 files to _rendered (placeholders: 42).
```

**処理フロー**:
```
docs/README.md                    _rendered/docs/README.md
"{{COMPANY_NAME}}様向け"    →    "株式会社サンプル様向け"
```

**除外されるディレクトリ**:
- `docs/02_meetings/`（顧客との議事録）
- `docs/references/`（請求書テンプレート等）
- `docs/*/attachments/`, `docs/*/images/` 等（バイナリ）

**オプション**:
```bash
# .env.example だけで確認（サンプル値で出力）
npm run render:docs -- --env .env.example

# 未定義プレースホルダーがあってもエラーにしない
npm run render:docs -- --no-strict

# 出力先を変更
npm run render:docs -- --out ./my-output
```

---

## ファイル構成

```
.
├── .env                 # 実際の顧客情報（git管理外）
├── .env.example         # サンプル値（git管理）
├── .env.bak.*           # 自動バックアップ（git管理外）
├── _rendered/           # レンダリング結果（git管理外）
└── tools/
    ├── init-env.js
    ├── env-check.js
    ├── fill-env-from-docx.py
    ├── fill-env-from-billing-templates.js
    └── render-docs.js
```

---

## トラブルシューティング

### `.env not found` エラー

```bash
npm run env:init  # まず .env を作成
```

### `billing_templates dir not found` エラー

請求書テンプレートがないか、別の場所にあります。

```bash
# テンプレートディレクトリを指定
npm run env:fill:templates -- --templates-dir path/to/templates
```

### `Missing env keys` 警告

`.env` に定義されていないプレースホルダーがあります。

```bash
# どのキーが足りないか確認
npm run env:check

# 必要なキーを .env に追加
echo 'NEW_KEY="value"' >> .env
```

### レンダリング結果を確認したい

```bash
npm run render:docs
open _rendered/README.md          # ルートREADME
open _rendered/docs/README.md     # docs配下
```

---

## 新規プロジェクトへの適用

1. `.env.example` に必要なキーを追加
2. ドキュメント内で `{{KEY_NAME}}` 形式で参照
3. `npm run render:docs` で正しく置換されるか確認
