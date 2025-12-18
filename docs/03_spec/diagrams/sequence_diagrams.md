# サンプル建設 システム シーケンス図

**作成日**: 2025年12月18日  
**対象**: 人員配置・勤怠・請求 管理システム

---

## 1. ダッシュボード表示フロー

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant B as Browser
    participant GAS as GAS_WebApp
    participant SS as Spreadsheet

    Note over U,SS: ダッシュボード初期表示
    U->>B: ダッシュボードにアクセス
    B->>GAS: doGet
    GAS->>GAS: ユーザー認証チェック
    GAS->>GAS: ドメイン検証
    GAS-->>B: HTMLテンプレート返却
    B->>B: 画面レンダリング
    
    B->>+GAS: getDashboard
    GAS->>SS: 案件シート読み込み
    SS-->>GAS: 案件データ
    GAS->>SS: 配置シート読み込み
    SS-->>GAS: 配置データ
    GAS-->>-B: レスポンス返却
    
    B->>B: 6列カンバン描画
```

---

## 2. 案件新規登録フロー

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant B as Browser
    participant GAS as GAS_WebApp
    participant SS as Spreadsheet
    participant Log as AuditLog

    Note over U,Log: 案件の新規登録
    U->>B: 新規案件クリック
    B->>B: 編集モーダル表示
    U->>B: 案件情報入力
    U->>B: 保存クリック
    
    B->>+GAS: saveJob
    Note right of GAS: expectedUpdatedAt=nullで新規作成
    GAS->>GAS: バリデーション
    GAS->>GAS: UUID生成
    GAS->>GAS: タイムスタンプ設定
    GAS->>SS: 案件シートに行追加
    SS-->>GAS: 追加完了
    GAS->>Log: 監査ログ記録CREATE
    GAS-->>-B: レスポンス返却
    
    B->>B: モーダル閉じる
    B->>B: カード追加表示
```

---

## 3. 案件更新フロー（競合なし）

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant B as Browser
    participant GAS as GAS_WebApp
    participant SS as Spreadsheet
    participant Log as AuditLog

    Note over U,Log: 案件の更新-競合なし
    U->>B: 案件カードをクリック
    B->>+GAS: getJob
    GAS->>SS: 案件詳細取得
    SS-->>GAS: 案件データ
    GAS-->>-B: job and assignments
    B->>B: 編集モーダル表示
    Note over B: updated_atを保持
    
    U->>B: 内容を編集
    U->>B: 保存クリック
    
    B->>+GAS: saveJob with expectedUpdatedAt
    GAS->>GAS: LockService.tryLock
    GAS->>SS: 現在のupdated_at取得
    SS-->>GAS: current updated_at
    GAS->>GAS: 一致確認OK
    GAS->>SS: 案件シート更新
    SS-->>GAS: 更新完了
    GAS->>Log: 監査ログ記録UPDATE
    GAS->>GAS: LockService.releaseLock
    GAS-->>-B: レスポンス返却
    
    B->>B: カード更新表示
```

---

## 4. 案件更新フロー（競合発生）

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant B as Browser
    participant GAS as GAS_WebApp
    participant SS as Spreadsheet

    Note over U,SS: 案件の更新-競合発生
    U->>B: 案件カードをクリック
    B->>GAS: getJob
    GAS-->>B: job with updated_at T1000
    
    Note over B: 別ユーザーが同時に編集中
    
    U->>B: 内容を編集
    U->>B: 保存クリック
    
    B->>+GAS: saveJob expected T1000
    GAS->>GAS: LockService.tryLock
    GAS->>SS: 現在のupdated_at取得
    SS-->>GAS: updated_at T1005
    GAS->>GAS: T1000とT1005が不一致
    Note right of GAS: 競合エラー発生
    GAS->>GAS: LockService.releaseLock
    GAS-->>-B: CONFLICT_ERROR
    
    B->>B: 競合エラーダイアログ表示
    B->>U: 再読み込みしてください
```

---

## 5. スタッフ配置フロー

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant B as Browser
    participant GAS as GAS_WebApp
    participant SS as Spreadsheet
    participant M as TransportFee

    Note over U,M: スタッフ配置
    U->>B: 案件カードをクリック
    B->>GAS: getJob
    GAS-->>B: job and assignments
    B->>B: 編集モーダル表示
    
    U->>B: スタッフ検索欄に入力
    B->>B: debounce 200ms
    B->>+GAS: searchStaff
    GAS->>SS: M_Staffから検索
    SS-->>GAS: 候補リスト
    GAS->>GAS: NGスタッフ除外
    GAS-->>-B: 候補一覧
    
    B->>B: 候補ドロップダウン表示
    U->>B: スタッフを選択
    
    U->>B: エリア選択
    B->>+GAS: getTransportFee
    GAS->>M: エリア別金額取得
    M-->>GAS: default_fee
    GAS-->>-B: area and fee
    B->>B: 交通費欄に自動セット
    
    U->>B: 保存クリック
    B->>+GAS: saveAssignments
    GAS->>GAS: 楽観ロックチェック
    GAS->>SS: 配置シートに追加
    SS-->>GAS: 完了
    GAS->>SS: 案件のupdated_at更新
    GAS-->>-B: レスポンス返却
    
    B->>B: カード更新
```

---

## 6. 請求書PDF出力フロー

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant B as Browser
    participant GAS as GAS_WebApp
    participant SS as Spreadsheet
    participant Tpl as Template
    participant Drive as GoogleDrive

    Note over U,Drive: PDF出力
    U->>B: 請求管理画面を開く
    U->>B: 顧客と月を選択
    U->>B: PDF出力クリック
    
    B->>+GAS: exportInvoice mode pdf
    GAS->>SS: T_InvoiceLines取得
    SS-->>GAS: 請求明細データ
    GAS->>SS: M_Customers取得
    SS-->>GAS: 顧客情報
    
    GAS->>Tpl: テンプレートコピー
    Tpl-->>GAS: コピー済みシート
    GAS->>GAS: 明細データを転記
    GAS->>GAS: 数式再計算flush
    GAS->>Drive: PDF変換と保存
    Drive-->>GAS: fileId and url
    
    GAS->>SS: pdf_file_id更新
    GAS-->>-B: レスポンス返却
    
    B->>U: ダウンロードリンク表示
```

---

## 7. 請求書Excel出力フロー

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant B as Browser
    participant GAS as GAS_WebApp
    participant SS as Spreadsheet
    participant Tpl as Template
    participant Drive as GoogleDrive

    Note over U,Drive: Excel出力
    U->>B: Excel出力クリック
    
    B->>+GAS: exportInvoice mode excel
    GAS->>SS: 請求データ取得
    GAS->>Tpl: テンプレートコピーと転記
    GAS->>Drive: xlsx変換と保存
    Drive-->>GAS: fileId and url
    GAS->>SS: excel_file_id更新
    GAS-->>-B: レスポンス返却
    
    B->>U: Excelダウンロード
```

---

## 8. 請求書 編集して出力フロー

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant B as Browser
    participant GAS as GAS_WebApp
    participant SS as Spreadsheet
    participant Drive as GoogleDrive

    Note over U,Drive: 編集して出力
    U->>B: 編集して出力クリック
    
    B->>+GAS: exportInvoice mode edit
    GAS->>SS: 請求データ取得
    GAS->>GAS: テンプレートコピーと転記
    GAS->>Drive: Spreadsheetとして保存
    Drive-->>GAS: sheetFileId and url
    GAS->>SS: sheet_file_id更新
    GAS-->>-B: レスポンス返却
    
    B->>B: 別タブでSpreadsheet開く
    U->>U: 内容を編集調整
    U->>U: ファイルからダウンロード
```

---

## 9. 更新検知フロー（開きっぱなし対策）

```mermaid
sequenceDiagram
    autonumber
    participant U as UserA
    participant BA as BrowserA
    participant BB as BrowserB
    participant GAS as GAS_WebApp
    participant SS as Spreadsheet

    Note over U,SS: ダッシュボード更新検知
    U->>BA: ダッシュボード表示中
    BA->>BA: maxUpdatedAt T1000を保持
    
    loop 30秒ごとにポーリング
        BA->>+GAS: getDashboardMeta
        GAS->>SS: max updated_at取得
        SS-->>GAS: maxUpdatedAt
        GAS-->>-BA: maxUpdatedAt T1000
        BA->>BA: 前回と比較して変更なし
    end
    
    Note over BB: 別ユーザーが案件を更新
    BB->>GAS: saveJob
    GAS->>SS: 案件更新 updated_at T1005
    
    BA->>+GAS: getDashboardMeta
    GAS->>SS: max updated_at取得
    SS-->>GAS: maxUpdatedAt T1005
    GAS-->>-BA: maxUpdatedAt T1005
    
    BA->>BA: T1000とT1005が異なる
    BA->>BA: トースト表示
    
    U->>BA: 更新ボタンクリック
    BA->>GAS: getDashboard
    GAS-->>BA: 最新データ
    BA->>BA: 画面再描画
```

---

## 10. LINEテンプレート生成フロー

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant B as Browser
    participant GAS as GAS_WebApp
    participant SS as Spreadsheet

    Note over U,SS: LINEテンプレート生成
    U->>B: ダッシュボードで日付を選択
    U->>B: LINEテンプレートクリック
    
    B->>+GAS: generateLineTemplate
    GAS->>SS: 当日の配置データ取得
    SS-->>GAS: assignments
    GAS->>SS: 案件詳細取得
    SS-->>GAS: jobs
    
    GAS->>GAS: スタッフごとにグループ化
    GAS->>GAS: テンプレート文面生成
    
    GAS-->>-B: text
    
    B->>B: テンプレート表示
    U->>B: コピークリック
    B->>B: クリップボードにコピー
    U->>U: LINEアプリに貼り付けて送信
```

---

## 11. 年度アーカイブフロー

```mermaid
sequenceDiagram
    autonumber
    participant Trigger as GAS_Trigger
    participant GAS as GAS_WebApp
    participant SS as CurrentDB
    participant Archive as ArchiveDB
    participant Mail as MailApp
    participant Admin as Admin

    Note over Trigger,Admin: 年度アーカイブ自動実行
    
    Trigger->>GAS: dailyArchiveCheck
    GAS->>GAS: 日付チェック
    
    alt 5月15日の場合
        GAS->>GAS: 未処理項目チェック
        GAS->>Mail: 事前通知メール送信
        Mail-->>Admin: アーカイブ予告通知
    end
    
    alt 6月1日の場合
        GAS->>GAS: LockService取得
        GAS->>SS: 前年度データ抽出
        
        loop 各テーブル
            GAS->>SS: 対象行を読み込み
            SS-->>GAS: 前年度データ
            GAS->>Archive: アーカイブDBに追記
            Archive-->>GAS: 追記完了
            GAS->>SS: 対象行を削除
        end
        
        GAS->>Mail: 完了通知メール送信
        Mail-->>Admin: アーカイブ完了通知
        GAS->>GAS: 監査ログ記録
        GAS->>GAS: LockService解放
    end
```

---

## 12. 全体システムフロー概要

```mermaid
flowchart TB
    subgraph Frontend
        Dashboard[ダッシュボード]
        JobModal[案件編集モーダル]
        InvoicePage[請求管理画面]
        PayrollPage[給与管理画面]
    end
    
    subgraph Backend
        Auth[認証認可]
        JobService[JobService]
        AssignmentService[AssignmentService]
        InvoiceService[InvoiceService]
        PayrollService[PayrollService]
        AuditLog[監査ログ]
    end
    
    subgraph Database
        M_Customers[(M_Customers)]
        M_Staff[(M_Staff)]
        T_Jobs[(T_Jobs)]
        T_Assign[(T_JobAssignments)]
        T_Invoices[(T_Invoices)]
        T_AuditLog[(T_AuditLog)]
    end
    
    subgraph External
        Drive[Google Drive]
        Template[請求書テンプレート]
    end
    
    Dashboard --> Auth
    JobModal --> Auth
    InvoicePage --> Auth
    
    Auth --> JobService
    Auth --> AssignmentService
    Auth --> InvoiceService
    Auth --> PayrollService
    
    JobService --> T_Jobs
    JobService --> AuditLog
    AssignmentService --> T_Assign
    AssignmentService --> M_Staff
    InvoiceService --> T_Invoices
    InvoiceService --> Template
    InvoiceService --> Drive
    
    AuditLog --> T_AuditLog
```

---

## 図の説明

| No | 図名 | 説明 |
|----|------|------|
| 1 | ダッシュボード表示 | 初期アクセスから6列カンバン描画まで |
| 2 | 案件新規登録 | 新規案件の登録フロー |
| 3 | 案件更新-成功 | 楽観ロックによる更新成功パターン |
| 4 | 案件更新-競合 | 同時編集による競合エラーパターン |
| 5 | スタッフ配置 | インクリメンタルサーチと交通費自動セット |
| 6 | PDF出力 | 請求書PDF生成フロー |
| 7 | Excel出力 | 請求書Excel生成フロー |
| 8 | 編集して出力 | Spreadsheet経由の編集出力フロー |
| 9 | 更新検知 | ポーリングによる開きっぱなし対策 |
| 10 | LINEテンプレート | スタッフ連絡用テンプレート生成 |
| 11 | 年度アーカイブ | 自動アーカイブ処理フロー |
| 12 | 全体フロー | システム全体の構成図 |
