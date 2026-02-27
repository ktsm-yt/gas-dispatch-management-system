#!/bin/bash
set -e

GAS_DIR="app/gas"
DIST_DIR="$GAS_DIR/dist"

# クリーン
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR/src"

# 1. TypeScriptをビルド（.tsファイルが存在する場合のみ）
TS_COUNT=$(find "$GAS_DIR/src" -name "*.ts" ! -name "*.d.ts" ! -path "*/tests/*" | wc -l | tr -d ' ')
if [ "$TS_COUNT" -gt 0 ]; then
  echo "Building $TS_COUNT TypeScript files..."
  npx tsc -p "$GAS_DIR/tsconfig.build.json"
else
  echo "No .ts files found, skipping TypeScript build"
fi

# 2. .gsファイルをコピー（ディレクトリ構造を維持）
cd "$GAS_DIR"
find src -name "*.gs" | while IFS= read -r f; do
  mkdir -p "dist/$(dirname "$f")"
  cp "$f" "dist/$f"
done

# 3. 残りの.jsファイル（未移行分）をコピー
find src -name "*.js" | while IFS= read -r f; do
  # 同名の.tsファイルが存在する場合はスキップ（ビルド済み）
  ts_file="${f%.js}.ts"
  if [ ! -f "$ts_file" ]; then
    mkdir -p "dist/$(dirname "$f")"
    cp "$f" "dist/$f"
  fi
done

# 4. HTMLファイルをコピー（.envプレースホルダー置換付き）
ENV_FILE="$(cd ../.. && pwd)/.env"
if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi
find . -maxdepth 1 -name "*.html" | while IFS= read -r f; do
  sed -e "s|{{COMPANY_NAME_SHORT}}|${COMPANY_NAME_SHORT:-SampleCorp}|g" \
      -e "s|{{COMPANY_DOMAIN}}|${WORKSPACE_DOMAIN:-example.com}|g" \
      "$f" > "dist/$(basename "$f")"
done

# 5. appsscript.jsonをコピー
cp appsscript.json dist/

cd - > /dev/null
echo "Build complete: $DIST_DIR"
