#!/bin/bash
# 本番デプロイスクリプト
# Phase2 デモ版v○ の形式でバージョンを自動インクリメント

set -e

DEPLOYMENT_ID="AKfycbxB1N5JCiaetebl4I4ynRI5xOI6d6OmyI9-x2OA2pTXbeusOrG8lH5QgMPlqT6dS1PI7Q"

cd "$(dirname "$0")/.."

# 1. ビルド＋プッシュ
echo "🔧 Building TypeScript..."
npm run build

echo "📤 Pushing code to GAS..."
cd app/gas
npx clasp push

# 2. 現在のデプロイメント情報を取得してバージョン番号を抽出
echo "🔍 Getting current version..."
DEPLOYMENTS=$(npx clasp deployments 2>/dev/null)

# デプロイメントIDを含む行を取得し、v○の数字を抽出
# 例: "- AKfycbxB1... @69 - Phase2 デモ版v5 - UI改善"
CURRENT_LINE=$(echo "$DEPLOYMENTS" | grep "$DEPLOYMENT_ID" || echo "")
echo "Current deployment: $CURRENT_LINE"

# v の後の数字を抽出（Perl互換正規表現を使用）
CURRENT_VERSION=$(echo "$CURRENT_LINE" | perl -ne 'print $1 if /v(\d+)/')

if [ -z "$CURRENT_VERSION" ]; then
  echo "⚠️  Could not extract version, starting from v1"
  CURRENT_VERSION=0
fi

NEW_VERSION=$((CURRENT_VERSION + 1))
NEW_DESC="Phase2 デモ版v${NEW_VERSION}"

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
echo "   URL: https://script.google.com/macros/s/${DEPLOYMENT_ID}/exec"
