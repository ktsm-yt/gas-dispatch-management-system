#!/bin/bash
# Show current clasp environment status before deploy.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"
CLASP_FILE="$ROOT_DIR/app/gas/.clasp.json"

read_env_value() {
  local key="$1"
  local line

  if [ ! -f "$ENV_FILE" ]; then
    echo ""
    return
  fi

  line="$(grep -E "^${key}=" "$ENV_FILE" | tail -n 1 || true)"
  line="${line#*=}"
  line="${line%$'\r'}"
  line="${line#\"}"
  line="${line%\"}"
  line="${line#\'}"
  line="${line%\'}"
  echo "$line"
}

read_script_id_from_json() {
  local json_file="$1"
  if [ ! -f "$json_file" ]; then
    echo ""
    return
  fi
  node -e '
const fs = require("fs");
const p = process.argv[1];
const j = JSON.parse(fs.readFileSync(p, "utf8"));
if (j.scriptId) process.stdout.write(String(j.scriptId));
' "$json_file" 2>/dev/null || true
}

resolve_prod_script_id() {
  local value
  value="$(read_env_value "PROD_SCRIPT_ID")"
  if [ -n "$value" ]; then
    PROD_SCRIPT_ID_SOURCE="$ENV_FILE (PROD_SCRIPT_ID)"
    echo "$value"
    return
  fi

  value="$(read_script_id_from_json "$ROOT_DIR/app/gas/.clasp.json.prod-backup")"
  if [ -n "$value" ]; then
    PROD_SCRIPT_ID_SOURCE="$ROOT_DIR/app/gas/.clasp.json.prod-backup"
    echo "$value"
    return
  fi

  value="$(read_script_id_from_json "$ROOT_DIR/.clasp.json.prod-backup")"
  if [ -n "$value" ]; then
    PROD_SCRIPT_ID_SOURCE="$ROOT_DIR/.clasp.json.prod-backup"
    echo "$value"
    return
  fi

  PROD_SCRIPT_ID_SOURCE="unresolved"
  echo ""
}

resolve_dev_script_id() {
  local value
  value="$(read_script_id_from_json "$ROOT_DIR/app/gas/.clasp.json.dev-backup")"
  if [ -n "$value" ]; then
    echo "$value"
    return
  fi

  value="$(read_script_id_from_json "$ROOT_DIR/.clasp.json.dev-backup")"
  if [ -n "$value" ]; then
    echo "$value"
    return
  fi

  echo ""
}

extract_email() {
  echo "$1" | tr '\r' '\n' | grep -Eio '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}' | head -n 1 || true
}

get_clasp_account_output() {
  local out
  local login_help
  local clasp_help

  login_help="$(npx clasp login --help 2>&1 || true)"
  clasp_help="$(npx clasp --help 2>&1 || true)"

  if echo "$login_help" | grep -Fq -- "--status"; then
    out="$(npx clasp login --status 2>&1 || true)"
    if [ -n "$out" ] && ! echo "$out" | grep -qi "unknown option '--status'"; then
      echo "$out"
      return
    fi
  fi

  if echo "$clasp_help" | grep -Eq '(^|[[:space:]])whoami([[:space:]]|$)'; then
    out="$(npx clasp whoami 2>&1 || true)"
    if [ -n "$out" ]; then
      echo "$out"
      return
    fi
  fi

  echo "Account check command unavailable in installed clasp (requires login --status or whoami)."
}

print_env_field() {
  local key="$1"
  local value="$2"
  if [ -n "$value" ]; then
    echo "$key: set ($value)"
  else
    echo "$key: missing"
  fi
}

echo "== clasp environment status =="

if [ -f "$CLASP_FILE" ]; then
  CLASP_SCRIPT_ID="$(read_script_id_from_json "$CLASP_FILE")"
  if [ -n "$CLASP_SCRIPT_ID" ]; then
    echo ".clasp scriptId: $CLASP_SCRIPT_ID"
  else
    echo ".clasp scriptId: unreadable ($CLASP_FILE)"
  fi
else
  echo ".clasp scriptId: missing file ($CLASP_FILE)"
fi

PROD_SCRIPT_ID="$(resolve_prod_script_id)"
PROD_DEPLOYMENT_ID="$(read_env_value "PROD_DEPLOYMENT_ID")"
PROD_CLA_ACCOUNT="$(read_env_value "PROD_CLA_ACCOUNT")"
DEV_SCRIPT_ID="$(resolve_dev_script_id)"

print_env_field "PROD_SCRIPT_ID" "$PROD_SCRIPT_ID"
print_env_field "PROD_DEPLOYMENT_ID" "$PROD_DEPLOYMENT_ID"
print_env_field "PROD_CLA_ACCOUNT" "$PROD_CLA_ACCOUNT"

if [ -n "${CLASP_SCRIPT_ID:-}" ] && [ -n "$PROD_SCRIPT_ID" ]; then
  if [ "$CLASP_SCRIPT_ID" = "$PROD_SCRIPT_ID" ]; then
    echo "Detected environment by scriptId: prod (source: $PROD_SCRIPT_ID_SOURCE)"
  elif [ -n "$DEV_SCRIPT_ID" ] && [ "$CLASP_SCRIPT_ID" = "$DEV_SCRIPT_ID" ]; then
    echo "Detected environment by scriptId: dev"
  else
    echo "Detected environment by scriptId: other"
  fi
else
  echo "Detected environment by scriptId: unknown (set PROD_SCRIPT_ID or prepare .clasp.json.prod-backup)"
fi

cd "$ROOT_DIR/app/gas"

CLASP_STATUS_OUTPUT="$(get_clasp_account_output)"
CLASP_ACCOUNT="$(extract_email "$CLASP_STATUS_OUTPUT")"

echo ""
echo "clasp login status:"
if [ -n "$CLASP_STATUS_OUTPUT" ]; then
  echo "$CLASP_STATUS_OUTPUT"
else
  echo "(no output from clasp login --status / clasp whoami)"
fi

if [ -n "$CLASP_ACCOUNT" ]; then
  echo "Detected clasp account: $CLASP_ACCOUNT"
else
  echo "Detected clasp account: unavailable"
fi

if [ -n "$PROD_DEPLOYMENT_ID" ]; then
  if DEPLOYMENTS_OUTPUT="$(npx clasp deployments 2>&1)"; then
    if echo "$DEPLOYMENTS_OUTPUT" | grep -Fq "$PROD_DEPLOYMENT_ID"; then
      echo "Deployment id check: found ($PROD_DEPLOYMENT_ID)"
    else
      echo "Deployment id check: NOT found ($PROD_DEPLOYMENT_ID)"
    fi
  else
    echo "Deployment id check: failed to run clasp deployments"
    echo "$DEPLOYMENTS_OUTPUT"
  fi
else
  echo "Deployment id check: skipped (PROD_DEPLOYMENT_ID missing)"
fi
