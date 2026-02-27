#!/bin/bash
# 本番デプロイスクリプト
# デプロイIDは .env から読み込み（gitに含めない）

set -e

# .env からデプロイIDを読み込み
ENV_FILE="$(dirname "$0")/../.env"
if [ -f "$ENV_FILE" ]; then
  DEPLOYMENT_ID=$(grep '^PROD_DEPLOYMENT_ID=' "$ENV_FILE" | cut -d'=' -f2 | tr -d '"' | tr -d "'")
fi

if [ -z "$DEPLOYMENT_ID" ]; then
  echo "❌ PROD_DEPLOYMENT_ID が .env に設定されていません"
  echo "   .env に以下を追加してください:"
  echo "   PROD_DEPLOYMENT_ID=AKfycbx..."
  exit 1
fi

cd "$(dirname "$0")/.."

# 1. ビルド＋プッシュ
echo "🔧 Building TypeScript..."
npm run build

echo "📤 Pushing code to GAS..."
cd app/gas
npx clasp push --force

# 2. 現在のデプロイメント情報を取得してバージョン番号を抽出
echo "🔍 Getting current version..."
DEPLOYMENTS=$(npx clasp deployments 2>/dev/null)

CURRENT_LINE=$(echo "$DEPLOYMENTS" | grep "$DEPLOYMENT_ID" || echo "")
echo "Current deployment: $CURRENT_LINE"

CURRENT_VERSION=$(echo "$CURRENT_LINE" | perl -ne 'print $1 if /v(\d+)/')

if [ -z "$CURRENT_VERSION" ]; then
  echo "⚠️  Could not extract version, starting from v1"
  CURRENT_VERSION=0
fi

NEW_VERSION=$((CURRENT_VERSION + 1))
NEW_DESC="v${NEW_VERSION}"

# オプションでサブ説明を追加
if [ -n "$1" ]; then
  NEW_DESC="${NEW_DESC} - $1"
fi

# 3. デプロイ
echo "🚀 Deploying as: $NEW_DESC"
npx clasp deploy --deploymentId "$DEPLOYMENT_ID" --description "$NEW_DESC"

echo ""
echo "✅ Deploy complete!"
echo "   Version: v${NEW_VERSION}"
