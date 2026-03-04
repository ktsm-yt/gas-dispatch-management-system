#!/bin/bash
set -e

GAS_DIR="app/gas"
DIST_DIR="$GAS_DIR/dist"
APPSSCRIPT="$GAS_DIR/appsscript.json"

# ── OAuthスコープ検証 ──────────────────────────────
# リベース等でoauthScopesが消えると、デプロイ後に権限エラーが発生し
# GASプロジェクトの紐付け削除→再認証が必要になる。ここで事前に防止する。
REQUIRED_SCOPES=(
  "https://www.googleapis.com/auth/spreadsheets"
  "https://www.googleapis.com/auth/drive"
  "https://www.googleapis.com/auth/script.external_request"
  "https://www.googleapis.com/auth/script.send_mail"
  "https://www.googleapis.com/auth/userinfo.email"
  "https://www.googleapis.com/auth/script.scriptapp"
)

if [ ! -f "$APPSSCRIPT" ]; then
  echo "ERROR: $APPSSCRIPT not found" >&2
  exit 1
fi

MISSING_SCOPES=()
for scope in "${REQUIRED_SCOPES[@]}"; do
  if ! grep -Fq "$scope" "$APPSSCRIPT"; then
    MISSING_SCOPES+=("$scope")
  fi
done

if [ ${#MISSING_SCOPES[@]} -gt 0 ]; then
  echo "ERROR: appsscript.json is missing required oauthScopes!" >&2
  echo "This usually happens after a git rebase that reverted the oauthScopes block." >&2
  echo "" >&2
  echo "Missing scopes:" >&2
  for s in "${MISSING_SCOPES[@]}"; do
    echo "  - $s" >&2
  done
  echo "" >&2
  echo "Fix: restore the oauthScopes array in $APPSSCRIPT" >&2
  echo "Ref: commit 9a1f941 added these scopes" >&2
  exit 1
fi
# ───────────────────────────────────────────────────

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

# 1.5. Dead function check (warning only)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$SCRIPT_DIR/check-dead-functions.sh" ]; then
  bash "$SCRIPT_DIR/check-dead-functions.sh" "$GAS_DIR/src" || true
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
BUILD_VERSION=$(date +%Y%m%d%H%M%S)
find . -maxdepth 1 -name "*.html" | while IFS= read -r f; do
  sed -e "s|{{COMPANY_NAME_SHORT}}|${COMPANY_NAME_SHORT:-SampleCorp}|g" \
      -e "s|{{COMPANY_DOMAIN}}|${WORKSPACE_DOMAIN:-example.com}|g" \
      -e "s|{{BUILD_VERSION}}|${BUILD_VERSION}|g" \
      "$f" > "dist/$(basename "$f")"
done

# 5. appsscript.jsonをコピー
cp appsscript.json dist/

cd - > /dev/null
echo "Build complete: $DIST_DIR"
