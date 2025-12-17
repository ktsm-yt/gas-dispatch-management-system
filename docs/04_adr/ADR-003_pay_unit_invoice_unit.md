# ADR-003: 配置の pay_unit / invoice_unit 分離

## ステータス

承認済み

## コンテキスト

配置（Assignment）において、以下のズレが発生しうる：

1. **表示用時間区分**（AM/PM等）: ダッシュボード表示用
2. **給与計算用区分**（pay_unit）: スタッフへの支払い計算
3. **請求計算用区分**（invoice_unit）: 顧客への請求計算

例: 「表示上はAM案件だが、給与は全日扱い、請求はAM扱い」というケースがある。

## 決定

**配置明細（T_JobAssignments）に `display_time_slot`, `pay_unit`, `invoice_unit` を別カラムで持たせる。**

## 理由

- **実業務への適合**: 給与/請求のルールが顧客・案件ごとに異なる
- **柔軟性**: 同一案件でもスタッフごとに異なる単価区分を設定可能
- **集計の正確性**: 給与計算と請求計算を独立して行える

## 詳細

### カラム定義

| カラム | 用途 | 例 |
| --- | --- | --- |
| `display_time_slot` | ダッシュボード表示列 | AM, PM, NIGHT等 |
| `pay_unit` | 給与計算区分 | FULLDAY, HALFDAY, HOURLY |
| `invoice_unit` | 請求計算区分 | AM, PM, FULLDAY等 |
| `wage_rate` | 給与単価（上書き用） | 18000 |
| `invoice_rate` | 請求単価（上書き用） | 22000 |

### デフォルト解決

単価が未設定の場合：
1. スタッフマスターの基本単価を参照
2. 顧客マスターの契約単価を参照
3. システムデフォルトを適用

> **注意**: スタッフ属性（例: `has_motorbike`）により単価を自動で切り替えるルールは持たせない。  
> 必要な場合は、配置明細の `wage_rate` / `invoice_rate` を運用判断で上書きする。

## 詳細仕様

- [05_database.md](../03_spec/05_database.md) - `T_JobAssignments`（display_time_slot / pay_unit / invoice_unit）
- [07_frontend.md](../03_spec/07_frontend.md) - 配置UI（表示/給与/請求の分離）

## 影響

- 配置登録時にデフォルト値を自動設定するロジックが必要
- 給与/請求レポートは各unitを参照して集計
- UIは通常`display_time_slot`のみ表示し、詳細編集で単価区分を変更可能に
