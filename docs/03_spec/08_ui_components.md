# 8. UIコンポーネント設計

> **更新履歴**
> - 2026-01-30: ステータスカラー表から `completed` を削除、`hold`/`problem` を追加

## 8.1 共通コンポーネント一覧

| コンポーネント | 用途 | ファイル |
|----------------|------|----------|
| Modal | 編集・確認ダイアログ | components.js.html |
| Toast | 通知メッセージ | components.js.html |
| DataTable | 一覧テーブル（ソート・フィルタ付き） | components.js.html |
| SearchInput | インクリメンタルサーチ入力 | components.js.html |
| DatePicker | 日付選択 | components.js.html |
| TagBadge | タグ表示（鳶/揚げ/鳶揚げ） | components.js.html |
| LoadingSpinner | ローディング表示 | components.js.html |
| Sidebar | ナビゲーションメニュー | components.js.html |
| JobCard | 案件カード（ダッシュボード用） | components.js.html |

---

## 8.2 カラースキーム【12/16更新】

- 白と青を基調（ライトモードを標準）
- ヘッダー左上に会社ロゴ（PNG）を表示
- ロゴ画像は `M_Company.logo_file_id`（DriveファイルID）から取得し、未設定時はテキストロゴ/プレースホルダを表示
- ブランドカラーは `docs/references/icon.png` の配色を基準にする

### メインカラー

| 用途 | カラーコード | 説明 |
|------|--------------|------|
| Primary | `#172D90` | ブランドネイビー（ロゴから抽出） |
| Secondary | `#139BC4` | ブランドシアン（ロゴから抽出） |
| Accent | `#135DA7` | ブルー（リンク/強調） |
| Success | `#28A745` | 成功・完了状態 |
| Warning | `#FFC107` | 警告・注意 |
| Danger | `#DC3545` | エラー・削除 |

**ブランド補助色（参考）**
- `#5A63AD`（インディゴ）
- `#62A3CC`（ライトシアン）
- `#9EA5CF`（ライトパープル）

**グラデーション例（見出し/ボタンの強調用）**
`linear-gradient(90deg, #139BC4 0%, #172D90 100%)`

### ライトモード（標準）

| 用途 | カラーコード | 説明 |
|------|--------------|------|
| Background | `#FFFFFF` | 背景色 |
| Card BG | `#F7FAFC` | カード背景 |
| Border | `#E5E7EB` | ボーダー |
| Text | `#1F2937` | メインテキスト |
| Text Muted | `#6B7280` | 補足テキスト |

### ダークモード（将来オプション）

| 用途 | カラーコード | 説明 |
|------|--------------|------|
| Background | `#0D1B2A` | 背景色 |
| Card BG | `#1B2838` | カード背景 |
| Border | `#2D3E50` | ボーダー |
| Text | `#E0E0E0` | メインテキスト |
| Text Muted | `#8A9AAA` | 補足テキスト |

---

## 8.3 タグカラー定義

| タグ | 背景色 | 文字色 | 用途 |
|------|--------|--------|------|
| 鳶 | `#E57373` | `#FFFFFF` | 鳶作業 |
| 揚げ | `#64B5F6` | `#FFFFFF` | 揚げ作業 |
| 鳶揚げ | `#81C784` | `#FFFFFF` | 鳶揚げ作業 |
| 翌確 | `#FFB74D` | `#000000` | 翌日確認必要 |

---

## 8.4 ステータスカラー

| ステータス | 背景色 | 用途 |
|------------|--------|------|
| pending | `#6C757D` | 未配置 |
| assigned | `#139BC4` | 配置済（ブランドシアン） |
| hold | `#FFC107` | 保留 |
| cancelled | `#E5E7EB` | キャンセル |
| problem | `#DC3545` | 問題あり |

---

## 8.5 CSS変数定義

```css
:root {
  /* Primary Colors */
  --color-primary: #172D90;
  --color-secondary: #139BC4;
  --color-accent: #135DA7;
  --color-brand-indigo: #5A63AD;
  --color-success: #28A745;
  --color-warning: #FFC107;
  --color-danger: #DC3545;
  
  /* Background */
  --bg-main: #FFFFFF;
  --bg-card: #F7FAFC;
  --bg-hover: #EEF2F7;
  
  /* Text */
  --text-primary: #1F2937;
  --text-muted: #6B7280;
  
  /* Border */
  --border-color: #E5E7EB;
  
  /* Tags */
  --tag-tobi: #E57373;
  --tag-age: #64B5F6;
  --tag-tobiage: #81C784;
  --tag-yokukaku: #FFB74D;
  
  /* Spacing */
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --spacing-lg: 24px;
  --spacing-xl: 32px;
  
  /* Border Radius */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  
  /* Shadow */
  --shadow-card: 0 2px 8px rgba(0, 0, 0, 0.08);
  --shadow-modal: 0 4px 16px rgba(0, 0, 0, 0.12);
}
```

---

## 8.6 レスポンシブ対応

PC専用のため、最小幅1280pxを想定。

```css
/* 基準幅 */
.container {
  min-width: 1280px;
  max-width: 1920px;
}

/* ダッシュボード6列 */
.dashboard-columns {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: var(--spacing-md);
}

/* サイドバー幅 */
.sidebar {
  width: 240px;
  flex-shrink: 0;
}

/* メインコンテンツ */
.main-content {
  flex: 1;
  min-width: 0;
}
```
