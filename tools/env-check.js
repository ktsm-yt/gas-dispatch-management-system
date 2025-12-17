#!/usr/bin/env node

const fs = require('fs/promises');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const ENV_PATH = path.join(REPO_ROOT, '.env');
const EXAMPLE_PATH = path.join(REPO_ROOT, '.env.example');

function parseEnv(content) {
  const map = new Map();
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const normalized = trimmed.startsWith('export ') ? trimmed.slice('export '.length) : trimmed;
    const eq = normalized.indexOf('=');
    if (eq <= 0) continue;
    const key = normalized.slice(0, eq).trim();
    const value = normalized.slice(eq + 1).trim();
    if (key) map.set(key, value);
  }
  return map;
}

async function main() {
  const [envText, exampleText] = await Promise.all([
    fs.readFile(ENV_PATH, 'utf8'),
    fs.readFile(EXAMPLE_PATH, 'utf8'),
  ]);

  const env = parseEnv(envText);
  const example = parseEnv(exampleText);

  const sameAsExample = [];
  const missingInEnv = [];
  const extraInEnv = [];

  for (const [key, exampleValue] of example.entries()) {
    if (!env.has(key)) {
      missingInEnv.push(key);
      continue;
    }
    if (env.get(key) === exampleValue) sameAsExample.push(key);
  }
  for (const key of env.keys()) {
    if (!example.has(key)) extraInEnv.push(key);
  }

  sameAsExample.sort();
  missingInEnv.sort();
  extraInEnv.sort();

  process.stdout.write(`same_as_example: ${sameAsExample.length}\n`);
  if (sameAsExample.length) process.stdout.write(`${sameAsExample.join('\n')}\n`);
  process.stdout.write(`missing_in_env: ${missingInEnv.length}\n`);
  if (missingInEnv.length) process.stdout.write(`${missingInEnv.join('\n')}\n`);
  process.stdout.write(`extra_in_env: ${extraInEnv.length}\n`);
  if (extraInEnv.length) process.stdout.write(`${extraInEnv.join('\n')}\n`);

  if (missingInEnv.length) process.exitCode = 1;
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});

