#!/usr/bin/env node

const fs = require('fs/promises');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const ENV_PATH = path.join(REPO_ROOT, '.env');
const EXAMPLE_PATH = path.join(REPO_ROOT, '.env.example');

function hasFlag(argv, flag) {
  return argv.includes(flag);
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

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const force = hasFlag(process.argv.slice(2), '--force');

  if (!(await fileExists(EXAMPLE_PATH))) {
    throw new Error('.env.example not found.');
  }

  if (await fileExists(ENV_PATH)) {
    if (!force) {
      process.stderr.write('`.env` already exists. Not overwriting.\n');
      process.stderr.write('If you really want to overwrite, run: `npm run env:init -- --force`\n');
      process.exitCode = 1;
      return;
    }

    const backupName = `.env.bak.${timestampForFilename(new Date())}`;
    const backupPath = path.join(REPO_ROOT, backupName);
    await fs.copyFile(ENV_PATH, backupPath);
    process.stdout.write(`Backed up existing .env to ${backupName}\n`);
  }

  await fs.copyFile(EXAMPLE_PATH, ENV_PATH);
  process.stdout.write('Created `.env` from `.env.example`.\n');
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});

