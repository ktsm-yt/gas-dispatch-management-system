#!/usr/bin/env node

const fs = require('fs/promises');
const path = require('path');

const XLSX = require('xlsx');

const REPO_ROOT = path.resolve(__dirname, '..');
const DEFAULT_ENV_PATH = path.join(REPO_ROOT, '.env');
const DEFAULT_TEMPLATES_DIR = path.join(REPO_ROOT, 'docs', 'references', 'billing_templates');

function parseArgs(argv) {
  const args = {
    envPath: DEFAULT_ENV_PATH,
    templatesDir: DEFAULT_TEMPLATES_DIR,
    headSheetPath: null,
    dryRun: false,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--env') {
      args.envPath = path.resolve(argv[i + 1]);
      i += 1;
      continue;
    }
    if (token === '--templates-dir') {
      args.templatesDir = path.resolve(argv[i + 1]);
      i += 1;
      continue;
    }
    if (token === '--head-sheet') {
      args.headSheetPath = path.resolve(argv[i + 1]);
      i += 1;
      continue;
    }
    if (token === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (token === '-h' || token === '--help') {
      args.help = true;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }

  return args;
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function timestampForFilename(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('');
}

function escapeEnvValue(value) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function parseEnvFile(content) {
  const lines = content.split(/\r?\n/);
  const entries = new Map();

  for (const originalLine of lines) {
    const line = originalLine.trim();
    if (!line || line.startsWith('#')) continue;

    const normalized = line.startsWith('export ') ? line.slice('export '.length) : line;
    const eqIndex = normalized.indexOf('=');
    if (eqIndex <= 0) continue;

    const key = normalized.slice(0, eqIndex).trim();
    if (!key) continue;
    entries.set(key, true);
  }

  return entries;
}

function applyEnvUpdates(envText, updates) {
  const keyLineRe = /^(export\s+)?([A-Z0-9_]+)\s*=/;
  const lines = envText.split(/\r?\n/);
  const updated = [];
  const appended = [];

  for (const [key, value] of Object.entries(updates)) {
    const rendered = `${key}="${escapeEnvValue(value)}"`;
    let replaced = false;

    for (let i = 0; i < lines.length; i += 1) {
      const m = lines[i].match(keyLineRe);
      if (!m) continue;
      if (m[2] !== key) continue;
      const prefix = m[1] ? 'export ' : '';
      lines[i] = `${prefix}${rendered}`;
      replaced = true;
      break;
    }

    if (replaced) {
      updated.push(key);
    } else {
      appended.push(key);
      lines.push(rendered);
    }
  }

  return { text: `${lines.join('\n')}\n`, updated, appended };
}

function companyShortName(name) {
  return name
    .replace(/^株式会社/, '')
    .replace(/株式会社$/, '')
    .replace(/^有限会社/, '')
    .replace(/有限会社$/, '')
    .replace(/^合同会社/, '')
    .replace(/合同会社$/, '')
    .trim();
}

function loadSheet(xlsxPath) {
  const wb = XLSX.readFile(xlsxPath, { cellText: false, cellDates: false });
  const ws = wb.Sheets['原本'] || wb.Sheets[wb.SheetNames[0]];
  return { wb, ws };
}

function cellValue(ws, address) {
  const cell = ws[address];
  if (!cell) return '';
  return typeof cell.v === 'string' ? cell.v.trim() : String(cell.v ?? '').trim();
}

function findCells(ws, predicate) {
  const hits = [];
  for (const addr of Object.keys(ws)) {
    if (addr.startsWith('!')) continue;
    const v = ws[addr].v;
    if (typeof v !== 'string') continue;
    const value = v.trim();
    if (!value) continue;
    if (predicate(value, addr)) hits.push(addr);
  }
  return hits;
}

function extractIssuerInfoFromHeadSheet(ws) {
  const updates = {};

  const companyCells = findCells(ws, (value) => value.includes('株式会社') || value.includes('有限会社') || value.includes('合同会社'));
  const issuerCompanyCell = companyCells
    .filter((addr) => addr !== 'F6')
    .sort((a, b) => {
      const da = XLSX.utils.decode_cell(a);
      const db = XLSX.utils.decode_cell(b);
      return db.c - da.c || db.r - da.r;
    })[0];

  if (issuerCompanyCell) {
    const companyName = cellValue(ws, issuerCompanyCell);
    if (companyName) {
      updates.COMPANY_NAME = companyName;
      updates.COMPANY_NAME_SHORT = companyShortName(companyName);
    }
  }

  const postalCells = findCells(ws, (value) => value.includes('〒') && /〒?\d{3}-\d{4}/.test(value));
  const issuerPostalCell = postalCells
    .filter((addr) => addr !== 'G2')
    .sort((a, b) => {
      const da = XLSX.utils.decode_cell(a);
      const db = XLSX.utils.decode_cell(b);
      return db.c - da.c || db.r - da.r;
    })[0];
  if (issuerPostalCell) {
    updates.POSTAL_CODE = cellValue(ws, issuerPostalCell);
  }

  const addressLikeCells = findCells(ws, (value) => /[都道府県].*(市|区|町|村)/.test(value));
  const issuerAddressCell = addressLikeCells
    .filter((addr) => addr !== 'F3')
    .sort((a, b) => {
      const da = XLSX.utils.decode_cell(a);
      const db = XLSX.utils.decode_cell(b);
      return db.c - da.c || db.r - da.r;
    })[0];
  if (issuerAddressCell) {
    updates.ADDRESS = cellValue(ws, issuerAddressCell);
  }

  const telCell = findCells(ws, (value) => value.includes('TEL') && /0\d{1,4}-\d{1,4}-\d{3,4}/.test(value))[0];
  if (telCell) {
    const raw = cellValue(ws, telCell);
    const m = raw.match(/0\d{1,4}-\d{1,4}-\d{3,4}/);
    if (m) updates.TEL = m[0];
  }

  const faxCell = findCells(ws, (value) => value.includes('FAX') && /0\d{1,4}-\d{1,4}-\d{3,4}/.test(value))[0];
  if (faxCell) {
    const raw = cellValue(ws, faxCell);
    const m = raw.match(/0\d{1,4}-\d{1,4}-\d{3,4}/);
    if (m) updates.FAX = m[0];
  }

  const invoiceCell = findCells(ws, (value) => /T\d{13}/.test(value))[0];
  if (invoiceCell) {
    const raw = cellValue(ws, invoiceCell);
    const m = raw.match(/T\d{13}/);
    if (m) updates.INVOICE_REGISTRATION_NUMBER = m[0];
  }

  // Bank info block (common layout in templates)
  const bankLabelCell = findCells(ws, (value) => value === '振込銀行' || value.includes('振込銀行'))[0];
  if (bankLabelCell) {
    const { r } = XLSX.utils.decode_cell(bankLabelCell);
    const rowCells = findCells(ws, (_v, addr) => XLSX.utils.decode_cell(addr).r === r);
    const bankCandidates = rowCells
      .map((addr) => ({ addr, value: cellValue(ws, addr) }))
      .filter((x) => x.addr !== bankLabelCell && x.value.includes('銀行'));
    bankCandidates.sort((a, b) => XLSX.utils.decode_cell(b.addr).c - XLSX.utils.decode_cell(a.addr).c);
    if (bankCandidates[0]?.value) updates.BANK_NAME = bankCandidates[0].value;
  }

  const branchLabelCell = findCells(ws, (value) => value === '支店' || value.includes('支店'))[0];
  if (branchLabelCell) {
    const { r } = XLSX.utils.decode_cell(branchLabelCell);
    const rowCells = findCells(ws, (_v, addr) => XLSX.utils.decode_cell(addr).r === r);
    const branchCandidates = rowCells
      .map((addr) => ({ addr, value: cellValue(ws, addr) }))
      .filter((x) => x.addr !== branchLabelCell && x.value.includes('支店'));
    branchCandidates.sort((a, b) => XLSX.utils.decode_cell(b.addr).c - XLSX.utils.decode_cell(a.addr).c);
    if (branchCandidates[0]?.value) updates.BRANCH_NAME = branchCandidates[0].value;
  }

  const accountNumberLabelCell = findCells(ws, (value) => value.includes('口座番号'))[0];
  if (accountNumberLabelCell) {
    const labelValue = cellValue(ws, accountNumberLabelCell);
    const { r } = XLSX.utils.decode_cell(accountNumberLabelCell);
    const rowCells = findCells(ws, (_v, addr) => XLSX.utils.decode_cell(addr).r === r);
    const numberCandidates = rowCells
      .map((addr) => ({ addr, value: cellValue(ws, addr) }))
      .filter((x) => x.addr !== accountNumberLabelCell && /^[0-9]{5,10}$/.test(x.value));
    numberCandidates.sort((a, b) => XLSX.utils.decode_cell(b.addr).c - XLSX.utils.decode_cell(a.addr).c);
    const typeMatch = labelValue.match(/（[^）]+）/);
    const typePrefix = typeMatch ? typeMatch[0] : '';
    if (numberCandidates[0]?.value) updates.ACCOUNT_NUMBER = `${typePrefix}${numberCandidates[0].value}`;
  }

  const accountHolderLabelCell = findCells(ws, (value) => value.includes('口座名義'))[0];
  if (accountHolderLabelCell) {
    const { r } = XLSX.utils.decode_cell(accountHolderLabelCell);
    const rowCells = findCells(ws, (_v, addr) => XLSX.utils.decode_cell(addr).r === r);
    const holderCandidates = rowCells
      .map((addr) => ({ addr, value: cellValue(ws, addr) }))
      .filter((x) => x.addr !== accountHolderLabelCell && x.value.length >= 2);
    holderCandidates.sort((a, b) => XLSX.utils.decode_cell(b.addr).c - XLSX.utils.decode_cell(a.addr).c);
    if (holderCandidates[0]?.value) updates.ACCOUNT_HOLDER = holderCandidates[0].value;
  }

  return updates;
}

function extractFormatTypesFromDir(files) {
  const updates = {};

  const format1File = files.find((f) => f.startsWith('【請求書】') && f.endsWith('.xlsx'));
  if (format1File) {
    const base = format1File.replace(/^【請求書】/, '');
    updates.FORMAT1_TYPE = base.split('_')[0].trim();
  }

  const atamagamiFile = files.find((f) => f.startsWith('【頭紙】') && f.endsWith('.xlsx'));
  if (atamagamiFile) {
    const base = atamagamiFile.replace(/^【頭紙】\s*/, '').replace(/\.xlsx$/i, '').trim();
    updates.ATAMAGAMI_TYPE = base;
    updates.CUSTOMER_NAME = base;
  }

  const format3File = files.find((f) => f.includes('御中') && f.endsWith('.xlsx'));
  if (format3File) {
    updates.FORMAT3_TYPE = format3File.split('御中')[0].trim();
  }

  const format2File = files.find((f) => {
    if (!f.endsWith('.xlsx')) return false;
    if (f.startsWith('【')) return false;
    if (f.includes('御中')) return false;
    if (f.toLowerCase().includes('zenken')) return false;
    return true;
  });
  if (format2File) {
    const segments = format2File.replace(/\.xlsx$/i, '').split('_');
    updates.FORMAT2_TYPE = (segments[0] || '').trim();
    if (segments[2]) {
      updates.STAFF_NAME = segments[2].replace(/訂正済.*/g, '').trim();
    }
  }

  return updates;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    process.stdout.write(
      [
        'Usage: node tools/fill-env-from-billing-templates.js [options]',
        '',
        'Options:',
        '  --env <path>            Target .env (default: ./.env)',
        '  --templates-dir <dir>   Billing templates dir (default: docs/references/billing_templates)',
        '  --head-sheet <path>     Head-sheet xlsx path (default: first file starting with \"【頭紙】\")',
        '  --dry-run               Do not write .env (only print summary)',
        '',
      ].join('\n')
    );
    return;
  }

  if (!(await fileExists(args.envPath))) {
    throw new Error('.env not found (run `npm run env:init` first).');
  }
  if (!(await fileExists(args.templatesDir))) {
    throw new Error('billing_templates dir not found.');
  }

  const files = (await fs.readdir(args.templatesDir)).filter((f) => f.endsWith('.xlsx') || f.endsWith('.md'));
  const xlsxFiles = files.filter((f) => f.endsWith('.xlsx'));

  const headSheetPath = args.headSheetPath
    || (xlsxFiles.map((f) => path.join(args.templatesDir, f)).find((p) => path.basename(p).startsWith('【頭紙】')) ?? null);

  if (!headSheetPath || !(await fileExists(headSheetPath))) {
    throw new Error('Head-sheet xlsx not found. Pass `--head-sheet`.');
  }

  const { ws } = loadSheet(headSheetPath);

  const updates = {
    ...extractIssuerInfoFromHeadSheet(ws),
    ...extractFormatTypesFromDir(xlsxFiles),
  };

  if (Object.keys(updates).length === 0) {
    throw new Error('No values extracted from templates.');
  }

  const envText = await fs.readFile(args.envPath, 'utf8');
  const { text, updated, appended } = applyEnvUpdates(envText, updates);

  if (args.dryRun) {
    process.stdout.write(`Would update ${updated.length} keys from templates: ${updated.sort().join(', ')}\n`);
    if (appended.length) process.stdout.write(`Would append ${appended.length} keys: ${appended.sort().join(', ')}\n`);
    return;
  }

  const backupName = `.env.bak.${timestampForFilename(new Date())}`;
  await fs.copyFile(args.envPath, path.join(path.dirname(args.envPath), backupName));
  await fs.writeFile(args.envPath, text, 'utf8');

  process.stdout.write(`Updated .env using billing templates (head-sheet: ${path.basename(headSheetPath)})\n`);
  process.stdout.write(`Backup: ${backupName}\n`);
  process.stdout.write(`Updated keys (${updated.length}): ${updated.sort().join(', ')}\n`);
  if (appended.length) process.stdout.write(`Appended keys (${appended.length}): ${appended.sort().join(', ')}\n`);
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});

