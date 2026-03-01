#!/bin/bash
# Dead function detector for GAS project
# Targets: internal functions with _ suffix (excludes entrypoints)
# Does NOT fail the build (exit 0)

set -euo pipefail

SRC_DIR="${1:-app/gas/src}"
# HTML files may call GAS functions via google.script.run
HTML_DIR="${2:-app/gas/src}"
YELLOW='\033[0;33m'
GRAY='\033[0;90m'
NC='\033[0m' # No Color

if ! command -v rg &> /dev/null; then
  echo "Warning: ripgrep (rg) not found, skipping dead function check"
  exit 0
fi

echo "=== Dead Function Check ==="

dead_count=0

# Directories/prefixes to exclude from dead-code analysis
# These contain intentionally standalone functions (migrations, test helpers, seeds)
EXCLUDE_PATTERNS="tests/|migrate_|create_bulk_|create_test_|create_ninku_|create_stats_|production_reset|production_seed"

# Extract function definitions: "file:funcName"
# Note: .gs files are not a standard rg type, so use glob patterns
definitions=$(rg -o 'function\s+(\w+_)\s*\(' --replace '$1' "$SRC_DIR" -g '*.ts' -g '*.js' -g '*.gs' 2>/dev/null | sort -u -t: -k2,2 || true)

if [ -z "$definitions" ]; then
  echo "No internal functions found."
  exit 0
fi

while IFS=: read -r file func; do
  [ -z "$func" ] && continue

  # Skip functions in excluded directories/files
  if echo "$file" | grep -qE "$EXCLUDE_PATTERNS"; then
    continue
  fi

  # Count occurrences in source files (not just file count)
  # A function defined once + called once in the same file = count >= 2
  src_occurrences=$( (rg -c "$func" "$SRC_DIR" -g '*.ts' -g '*.js' -g '*.gs' -g '!tests/*' 2>/dev/null || true) | awk -F: '{sum += $NF} END {print sum+0}')

  # Check HTML files for google.script.run references
  html_occurrences=$( (rg -c "$func" "$SRC_DIR" -g '*.html' 2>/dev/null || true) | awk -F: '{sum += $NF} END {print sum+0}')

  # Check test files separately
  test_occurrences=$( (rg -c "$func" "$SRC_DIR" -g 'tests/*' 2>/dev/null || true) | awk -F: '{sum += $NF} END {print sum+0}')

  total=$((src_occurrences + html_occurrences))

  # Definition = 1 occurrence. If total <= 1, only the definition exists → dead
  if [ "$total" -le 1 ] && [ "$test_occurrences" -eq 0 ]; then
    echo -e "${YELLOW}[DEAD?]${NC} ${func} ${GRAY}(${file}, src=${src_occurrences}, html=${html_occurrences}, tests=${test_occurrences})${NC}"
    dead_count=$((dead_count + 1))
  fi
done <<< "$definitions"

if [ "$dead_count" -gt 0 ]; then
  echo -e "\n${YELLOW}Warning: ${dead_count} potentially dead function(s) found${NC}"
else
  echo "No dead functions detected."
fi

exit 0
