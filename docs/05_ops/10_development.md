# 10. 開発環境セットアップ

## 10.1 必要ツール

| ツール | バージョン | 用途 |
|--------|------------|------|
| Node.js | 18以上 | clasp実行環境 |
| clasp | 最新 | GAS CLIツール |
| VSCode | 最新 | エディタ |
| Chrome | 最新 | テスト・デバッグ |

### インストール

```bash
# Node.js (公式サイトからインストール)

# clasp
npm install -g @google/clasp

# VSCode拡張機能
# - Google Apps Script (推奨)
# - ESLint
```

---

## 10.2 プロジェクトセットアップ

### 1. claspログイン

```bash
clasp login
# ブラウザでGoogle認証
```

### 2. プロジェクトクローン

```bash
# 本番プロジェクトをクローン
clasp clone [SCRIPT_ID]

# または新規作成
clasp create --title "{{PROJECT_NAME}}-system" --type webapp
```

### 3. 開発用スプレッドシート作成

1. Google Driveで本番DBを複製
2. `{{PROJECT_NAME}}-db-dev` として保存
3. テストデータを投入

### 4. 設定ファイル

`.clasp.json`:
```json
{
  "scriptId": "[DEV_SCRIPT_ID]",
  "rootDir": "./src"
}
```

`appsscript.json`:
```json
{
  "timeZone": "Asia/Tokyo",
  "dependencies": {},
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "webapp": {
    "executeAs": "USER_ACCESSING",
    "access": "DOMAIN"
  }
}
```

---

## 10.3 開発ワークフロー

### 基本コマンド

```bash
# ローカル編集 → GASにプッシュ
clasp push

# GASから最新を取得
clasp pull

# ブラウザでエディタを開く
clasp open

# ログ確認
clasp logs

# リアルタイムログ監視
clasp logs --watch
```

### デプロイ

```bash
# テストデプロイ
clasp deploy --description "テスト v1.0"

# デプロイ一覧
clasp deployments

# 特定バージョンを削除
clasp undeploy [DEPLOYMENT_ID]
```

---

## 10.4 環境変数・設定

### ローカル環境変数 (.env)

プロジェクトルートの `.env` ファイルで顧客固有情報を管理します。

```bash
# 初回セットアップ
cp .env.example .env
# .env を編集して実際の値を設定
```

| カテゴリ | キー | 説明 |
|----------|------|------|
| **自社情報** | `COMPANY_NAME` | 会社正式名称 |
| | `COMPANY_NAME_SHORT` | 会社略称 |
| | `POSTAL_CODE` | 郵便番号 |
| | `ADDRESS` | 住所 |
| | `TEL` / `FAX` | 電話・FAX番号 |
| | `INVOICE_REGISTRATION_NUMBER` | インボイス登録番号 |
| **銀行口座** | `BANK_NAME` | 銀行名 |
| | `BRANCH_NAME` | 支店名（支店コード） |
| | `ACCOUNT_NUMBER` | 口座番号 |
| | `ACCOUNT_HOLDER` | 口座名義 |
| **運用情報** | `WORKSPACE_DOMAIN` | Google Workspaceドメイン |
| | `CEO_EMAIL` / `MANAGER_EMAIL` | 管理者メールアドレス |
| **テンプレート** | `FORMAT1_TYPE` 〜 `FORMAT3_TYPE` | 請求書様式の識別名 |
| | `ATAMAGAMI_TYPE` | 頭紙様式の識別名 |

> **セキュリティ**: `.env` は `.gitignore` に含まれており、リポジトリにコミットされません。

### Config.gs

```javascript
const CONFIG = {
  DEV: {
    DB_SPREADSHEET_ID: 'xxxxx-dev',
    PDF_FOLDER_ID: 'yyyyy-dev',
    DEBUG: true
  },
  PROD: {
    DB_SPREADSHEET_ID: 'xxxxx-prod',
    PDF_FOLDER_ID: 'yyyyy-prod',
    DEBUG: false
  }
};

function getConfig() {
  const env = PropertiesService
    .getScriptProperties()
    .getProperty('ENV') || 'DEV';
  return CONFIG[env];
}
```

### 環境切り替え

```javascript
// GASエディタのスクリプトプロパティで設定
// または以下を実行
function setEnvToProd() {
  PropertiesService
    .getScriptProperties()
    .setProperty('ENV', 'PROD');
}

function setEnvToDev() {
  PropertiesService
    .getScriptProperties()
    .setProperty('ENV', 'DEV');
}
```

---

## 10.5 ディレクトリ構成（ローカル）

```
{{PROJECT_NAME}}-system/
│
├── src/                    # GASソースコード
│   ├── Code.gs
│   ├── Config.gs
│   ├── ...
│   └── appsscript.json
│
├── docs/                   # ドキュメント（このファイル群）
│   ├── 00_README.md
│   └── ...
│
├── .clasp.json             # clasp設定
├── .gitignore
└── README.md
```

### .gitignore

```
.clasp.json
node_modules/
*.log
.DS_Store
```
