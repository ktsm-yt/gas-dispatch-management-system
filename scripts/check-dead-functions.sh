#!/bin/bash
# Dead function detector for GAS project
# Targets: internal functions with _ suffix (excludes entrypoints)
# Does NOT fail the build (exit 0)

set -euo pipefail

SRC_DIR="${1:-app/gas/src}"
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

if ! command -v rg &> /dev/null; then
  echo "Warning: ripgrep (rg) not found, skipping dead function check"
  exit 0
fi

echo "=== Dead Function Check ==="

# Find all function definitions with _ suffix (internal functions)
# Patterns: function funcName_( or funcName_: function( or funcName_ = function(
dead_count=0

# Extract function names ending with _
# Note: .gs files are not a standard rg type, so use glob patterns
definitions=$(rg -o 'function\s+(\w+_)\s*\(' --replace '$1' "$SRC_DIR" -g '*.ts' -g '*.js' -g '*.gs' 2>/dev/null | sort -u -t: -k2,2 || true)

if [ -z "$definitions" ]; then
  echo "No internal functions found."
  exit 0
fi

while IFS=: read -r file func; do
  [ -z "$func" ] && continue

  # Count call sites (excluding the definition itself and test files)
  call_count=$( (rg -l "$func" "$SRC_DIR" -g '*.ts' -g '*.js' -g '*.gs' -g '!tests/*' 2>/dev/null || true) | wc -l | tr -d ' ')
  test_count=$( (rg -l "$func" "$SRC_DIR" -g 'tests/*' 2>/dev/null || true) | wc -l | tr -d ' ')

  # If only found in 1 file (the definition) and no test references, it's potentially dead
  if [ "$call_count" -le 1 ] && [ "$test_count" -eq 0 ]; then
    echo -e "${YELLOW}[DEAD?]${NC} ${func} (defined in ${file}, calls=${call_count}, tests=${test_count})"
    dead_count=$((dead_count + 1))
  fi
done <<< "$definitions"

if [ "$dead_count" -gt 0 ]; then
  echo -e "\n${YELLOW}Warning: ${dead_count} potentially dead function(s) found${NC}"
else
  echo "No dead functions detected."
fi

exit 0
