# {{PROJECT_NAME}}-system

## Links

- `docs/00_overview/`（構成図・用語・目的）
- `docs/01_requirements/`（要件定義・スコープ）
- `docs/02_meetings/`（会議要約：md推奨、差分管理）
- `docs/03_spec/`（仕様書の要点をmd化 or 参照リンク）
- `docs/04_adr/`（Architecture Decision Records）
- `docs/05_ops/`（運用・保守・手順書）
- `app/gas/`（GASコード：clasp）
- `app/web/`（HTML/CSS/JS）

※ `docs/*/{attachments,billing,files,images,recordings}/` は添付・素材置き場（`.gitignore` で無視）

## Local rendered docs

公開用ドキュメントは `{{...}}` 形式のプレースホルダを含みます。ローカルで実値を埋めた版を生成するには:

1. `npm run env:init`（`.env` が無ければ `.env.example` から作成。既にある場合は上書きしません）
2. （任意）手元の資料から自動で埋める: `npm run env:fill`（docx） / `npm run env:fill:templates`（請求書テンプレ）
3. `.env` に不足分の実値を設定（確認: `npm run env:check`）
4. `npm run render:docs`
5. `_rendered/README.md` または `_rendered/docs/README.md` を参照

※ `_rendered/` は `.gitignore` されています。

## Structure

```text
.
├── README.md
├── docs/
│   ├── 00_overview/
│   ├── 01_requirements/
│   ├── 02_meetings/
│   ├── 03_spec/
│   ├── 04_adr/
│   └── 05_ops/
├── app/
│   ├── gas/
│   └── web/
├── tools/
└── tests/
```
