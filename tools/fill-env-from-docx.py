#!/usr/bin/env python3

from __future__ import annotations

import argparse
import datetime as _dt
import re
import shutil
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path


W_NS = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def _timestamp_for_filename(dt: _dt.datetime) -> str:
  return dt.strftime("%Y%m%d-%H%M%S")


def _escape_env_value(value: str) -> str:
  return value.replace("\\", "\\\\").replace("\"", "\\\"")


def _backup_file(file_path: Path) -> Path:
  backup_path = file_path.with_name(f"{file_path.name}.bak.{_timestamp_for_filename(_dt.datetime.now())}")
  shutil.copyfile(file_path, backup_path)
  return backup_path


def _read_docx_xml(docx_path: Path, inner_path: str) -> bytes:
  with zipfile.ZipFile(docx_path) as zf:
    return zf.read(inner_path)


def _cell_text(tc: ET.Element) -> str:
  text = "".join((t.text or "") for t in tc.iter(W_NS + "t"))
  text = re.sub(r"\s+", " ", text).strip()
  return text


def _extract_table_rows(document_xml: bytes) -> list[list[str]]:
  root = ET.fromstring(document_xml)
  rows: list[list[str]] = []

  for tbl in root.iter(W_NS + "tbl"):
    for tr in tbl.iter(W_NS + "tr"):
      cells = [_cell_text(tc) for tc in tr.iter(W_NS + "tc")]
      if any(cells):
        rows.append(cells)

  return rows


def _extract_value_from_rows(rows: list[list[str]], label: str) -> tuple[str | None, list[str] | None]:
  for cells in rows:
    if not cells:
      continue
    if cells[0] == label and len(cells) >= 2 and cells[1]:
      return cells[1], cells
  return None, None


def _extract_from_docx(docx_path: Path) -> dict[str, str]:
  xml = _read_docx_xml(docx_path, "word/document.xml")
  rows = _extract_table_rows(xml)

  updates: dict[str, str] = {}

  daily, _ = _extract_value_from_rows(rows, "1日あたり案件数")
  if daily:
    updates["DAILY_JOB_COUNT_RANGE"] = daily

  annual, annual_row = _extract_value_from_rows(rows, "年間案件数")
  if annual:
    updates["ANNUAL_JOB_COUNT"] = annual
  if annual_row and len(annual_row) >= 3:
    m = re.search(r"月\s*([0-9,]+件)", annual_row[2])
    if m:
      updates["MONTHLY_JOB_COUNT"] = f"約{m.group(1)}"

  customer_range, customer_row = _extract_value_from_rows(rows, "顧客数")
  if customer_range:
    updates["CUSTOMER_COMPANY_COUNT_RANGE"] = customer_range
  if customer_row and len(customer_row) >= 3:
    m = re.search(r"(約[0-9,]+件)", customer_row[2])
    if m:
      updates["CUSTOMER_MASTER_COUNT"] = m.group(1)

  staff_count, _ = _extract_value_from_rows(rows, "スタッフ数")
  if staff_count:
    updates["STAFF_MASTER_COUNT"] = staff_count

  concurrent, _ = _extract_value_from_rows(rows, "同時接続数")
  if concurrent:
    updates["CONCURRENT_USERS"] = concurrent

  phase1, _ = _extract_value_from_rows(rows, "フェーズ1：基幹機能")
  if phase1:
    updates["PHASE1_COST"] = phase1

  phase2, _ = _extract_value_from_rows(rows, "フェーズ2：請求機能")
  if phase2:
    updates["PHASE2_COST"] = phase2

  return updates


def _apply_updates_to_env(env_text: str, updates: dict[str, str]) -> tuple[str, list[str], list[str]]:
  updated_keys: list[str] = []
  missing_keys: list[str] = []

  lines = env_text.splitlines(keepends=True)
  key_line_re = re.compile(r"^(export\s+)?([A-Z0-9_]+)\s*=")

  for key, value in updates.items():
    replacement = f'{key}="{_escape_env_value(value)}"'
    replaced = False

    for idx, line in enumerate(lines):
      m = key_line_re.match(line)
      if not m:
        continue
      if m.group(2) != key:
        continue
      prefix = "export " if m.group(1) else ""
      newline = "\n" if line.endswith("\n") else ""
      lines[idx] = f"{prefix}{replacement}{newline}"
      replaced = True
      break

    if replaced:
      updated_keys.append(key)
    else:
      missing_keys.append(key)
      lines.append(f"{replacement}\n")

  return "".join(lines), updated_keys, missing_keys


def main() -> int:
  parser = argparse.ArgumentParser(description="Fill .env values by extracting numbers/labels from a docx spec (local-only).")
  parser.add_argument("--docx", type=Path, default=Path("docs/00_overview/アドバンステージ_システム仕様書_v1.3_20251216.docx"))
  parser.add_argument("--env", type=Path, default=Path(".env"))
  parser.add_argument("--dry-run", action="store_true", help="Do not write .env (only print summary).")
  args = parser.parse_args()

  docx_path: Path = args.docx
  env_path: Path = args.env

  if not docx_path.exists():
    print(f"ERROR: docx not found: {docx_path}", file=sys.stderr)
    return 1

  if not env_path.exists():
    print(f"ERROR: .env not found: {env_path} (run `npm run env:init` first)", file=sys.stderr)
    return 1

  updates = _extract_from_docx(docx_path)
  if not updates:
    print("No matching values found in docx.", file=sys.stderr)
    return 1

  env_text = env_path.read_text(encoding="utf-8")
  new_text, updated_keys, appended_keys = _apply_updates_to_env(env_text, updates)

  if args.dry_run:
    print(f"Would update {len(updated_keys)} keys from docx: {', '.join(sorted(updated_keys))}")
    if appended_keys:
      print(f"Would append {len(appended_keys)} missing keys: {', '.join(sorted(appended_keys))}")
    return 0

  backup_path = _backup_file(env_path)
  env_path.write_text(new_text, encoding="utf-8")

  print(f"Updated .env using {docx_path.name}")
  print(f"Backup: {backup_path.name}")
  print(f"Updated keys ({len(updated_keys)}): {', '.join(sorted(updated_keys))}")
  if appended_keys:
    print(f"Appended keys ({len(appended_keys)}): {', '.join(sorted(appended_keys))}")

  return 0


if __name__ == "__main__":
  raise SystemExit(main())

