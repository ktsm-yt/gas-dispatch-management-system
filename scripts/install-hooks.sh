#!/bin/bash
# Git hooks インストールスクリプト

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOOKS_SRC="$SCRIPT_DIR/hooks"
HOOKS_DEST="$(git rev-parse --git-dir)/hooks"

echo "📦 Git hooks をインストール中..."

# pre-push hook
if [[ -f "$HOOKS_SRC/pre-push" ]]; then
    cp "$HOOKS_SRC/pre-push" "$HOOKS_DEST/pre-push"
    chmod +x "$HOOKS_DEST/pre-push"
    echo "  ✅ pre-push hook をインストールしました"
fi

echo ""
echo "🎉 完了！ git push 時に自動チェックが実行されます"
