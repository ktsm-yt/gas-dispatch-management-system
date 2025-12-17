# 14. トラブルシューティング

## 14.1 よくあるエラーと対処

| エラー | 原因 | 対処 |
|--------|------|------|
| GAS実行タイムアウト | 処理が6分超過 | 処理分割、キャッシュ活用 |
| スプレッドシート競合 | 同時編集 | リトライ処理、楽観ロック |
| 権限エラー | シート共有設定 | 編集権限の確認・付与 |
| データ不整合 | 参照整合性違反 | 外部キー検証処理追加 |
| 画面が真っ白 | JS実行エラー | DevToolsでコンソール確認 |

---

## 14.2 デバッグ方法

### サーバーサイド（GAS）

```javascript
// ログ出力
Logger.log('変数の値: ' + JSON.stringify(data));

// 実行ログで確認
// GASエディタ → 実行 → 実行ログ

// CLIでリアルタイム監視
// clasp logs --watch
```

### クライアントサイド（ブラウザ）

```javascript
// コンソール出力
console.log('data:', data);
console.table(array);

// DevTools
// F12 → Console タブ
// F12 → Network タブ（通信確認）
```

### API呼び出しデバッグ

```javascript
google.script.run
  .withSuccessHandler(response => {
    console.log('Response:', response);
  })
  .withFailureHandler(error => {
    console.error('Failure:', error);
  })
  .getDashboard('2025-12-15');
```

---

## 14.3 エラー別対処法

### タイムアウトエラー

```
Error: Exceeded maximum execution time
```

**対処:**
1. 処理を分割（バッチ処理）
2. キャッシュを活用
3. 不要なAPI呼び出しを削減

```javascript
// 改善例: キャッシュ活用
function getCustomersWithCache() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('customers');
  
  if (cached) {
    return JSON.parse(cached);
  }
  
  const data = getCustomersFromDB();
  cache.put('customers', JSON.stringify(data), 300); // 5分（短TTL推奨）
  return data;
}
```

### 権限エラー

```
Error: You do not have permission to access the requested document
```

**対処:**
1. スプレッドシートの共有設定を確認
2. GASプロジェクトのトリガー設定を確認
3. Webアプリの実行ユーザー設定を確認

### データ競合エラー

```
Error: CONFLICT_ERROR - 他のユーザーが更新しました
```

**対処:**
1. 画面を再読み込み
2. 最新データを取得してから再編集

---

## 14.4 パフォーマンス改善

### 遅い場合のチェックリスト

- [ ] 不要なシート全体読み込みをしていないか
- [ ] ループ内でAPI呼び出しをしていないか
- [ ] キャッシュを活用しているか
- [ ] 一括書き込みを使っているか

### 改善パターン

```javascript
// 悪い例: 1行ずつ書き込み
rows.forEach(row => {
  sheet.appendRow(row);  // 遅い
});

// 良い例: 一括書き込み
const range = sheet.getRange(
  sheet.getLastRow() + 1, 
  1, 
  rows.length, 
  rows[0].length
);
range.setValues(rows);  // 速い
```

---

## 14.5 本番障害時の対応

### 初動対応

1. 障害内容の確認（エラーメッセージ、影響範囲）
2. スクリーンショットを保存
3. 再現手順を記録

### エスカレーション

- 軽微（表示崩れ等）: 次回リリースで対応
- 中程度（一部機能停止）: 当日中に対応
- 重大（全機能停止）: 即時ロールバック検討

### 報告フォーマット

```
【障害報告】
発生日時: 2025-12-15 10:30
報告者: 〇〇
影響範囲: ダッシュボード表示
症状: 案件カードが表示されない
エラーメッセージ: TypeError: Cannot read property 'xxx' of undefined
再現手順:
  1. ダッシュボードを開く
  2. 日付を切り替える
  3. エラー発生
対応状況: 調査中
```

---

## 14.6 連絡先

| 役割 | 連絡先 | 備考 |
|------|--------|------|
| 開発担当 | ktsm.dev | 技術的な質問 |
| 緊急連絡先 | [要設定] | 本番障害時 |
