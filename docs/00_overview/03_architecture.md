# 3. システムアーキテクチャ

## 3.1 全体構成図

```
+------------+      +----------------+      +------------------+
|            |      |                |      |                  |
|  Browser   | <--> |  GAS Web App   | <--> |  Spreadsheet DB  |
|  (Chrome)  |      |                |      |                  |
+------------+      +----------------+      +------------------+
                           |
                           v
                    +-------------+
                    |             |
                    |Google Drive |
                    | (PDF/Files) |
                    +-------------+
```

## 3.2 処理フロー

```
1. User Access
   Browser ---> GAS doGet() ---> HTML Template

2. Data Request
   Frontend JS ---> google.script.run.XXX() ---> GAS Function
                                                      |
                                                      v
                                               SpreadsheetApp
                                                      |
                                                      v
                                         Response { ok, data, requestId }
                                                      |
   Frontend JS <--- withSuccessHandler() <------------+

3. Data Update
   Frontend JS ---> google.script.run.saveXXX(payload, expectedUpdatedAt)
                                        |
                                        v
                                   GAS Function
                                        |
                                        +---> Spreadsheet (Write)
                                        |
                                        +---> AuditLog (Write)
                                        |
                                        v
                                   Response { ok, data, requestId }
```

## 3.3 キャッシュ戦略

| キャッシュ種別 | 用途 | 有効期限 |
|----------------|------|----------|
| CacheService.getScriptCache() | マスターデータ（顧客・スタッフ一覧など） | 60〜300秒（短TTL） |
| CacheService.getUserCache() | ユーザー設定・最近の操作 | 短時間（必要最小限） |
| PropertiesService | システム設定・API設定 | 永続 |

> **重要**: 当日の案件/配置などトランザクション系データは原則キャッシュしない（“画面が変わらない”クレーム回避のため）。
> ダッシュボードを開きっぱなしにする運用を想定し、更新検知用に `getDashboardMeta(date)` を用意して再読込を促す。

## 3.4 パフォーマンス制約

GAS実行時間6分・シート実用10万行程度を前提に、以下を遵守する。

| 制約 | 対策 |
|------|------|
| GAS実行時間6分 | 1操作=1〜2回のシートI/Oを目標 |
| シート10万行上限 | 年度分割（ファイル/シート）を徹底 |
| 検索パフォーマンス | 範囲指定/日付絞りを基本 |
| 重い処理 | ボタン操作で明示的に実行＋進捗表示 |

## 3.5 データフロー（案件登録の例）

```
[案件登録画面]
      |
      | 1. 入力データ送信
      v
[GAS: saveJob(job, expectedUpdatedAt=null)]
      |
      | 2. バリデーション
      | 3. UUID生成
      | 4. created_at/updated_at設定
      v
[T_Jobs シート]
      |
      | 5. 行追加
      v
[T_AuditLog シート]
      |
      | 6. 操作ログ記録
      v
[Response]
      |
      | 7. {ok: true, data: {job: newJob}, requestId: "..."}
      v
[画面更新]
```
