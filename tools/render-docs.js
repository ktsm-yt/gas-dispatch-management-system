#!/usr/bin/env node

const fs = require('fs/promises');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const DEFAULT_ENV_PATH = path.join(REPO_ROOT, '.env');
const FALLBACK_ENV_PATH = path.join(REPO_ROOT, '.env.example');
const DEFAULT_OUT_DIR = path.join(REPO_ROOT, '_rendered');

const PLACEHOLDER_RE = /\{\{[A-Z0-9_]+\}\}/g;

function parseArgs(argv) {
  const args = {
    envPath: DEFAULT_ENV_PATH,
    outDir: DEFAULT_OUT_DIR,
    clean: true,
    strict: true,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];

    if (token === '--env') {
      args.envPath = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === '--out') {
      args.outDir = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === '--no-clean') {
      args.clean = false;
      continue;
    }
    if (token === '--no-strict') {
      args.strict = false;
      continue;
    }
    if (token === '-h' || token === '--help') {
      return { help: true, ...args };
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

function unquoteAndUnescape(rawValue) {
  if (rawValue.length >= 2 && rawValue.startsWith('"') && rawValue.endsWith('"')) {
    const inner = rawValue.slice(1, -1);
    return inner.replace(/\\(.)/g, (_, ch) => {
      if (ch === 'n') return '\n';
      if (ch === 'r') return '\r';
      if (ch === 't') return '\t';
      if (ch === '"') return '"';
      if (ch === '\\') return '\\';
      return ch;
    });
  }
  if (rawValue.length >= 2 && rawValue.startsWith("'") && rawValue.endsWith("'")) {
    return rawValue.slice(1, -1);
  }
  return rawValue;
}

function parseEnvFile(content) {
  const env = {};
  const lines = content.split(/\r?\n/);

  for (const originalLine of lines) {
    const line = originalLine.trim();
    if (!line || line.startsWith('#')) continue;

    const normalized = line.startsWith('export ') ? line.slice('export '.length) : line;
    const eqIndex = normalized.indexOf('=');
    if (eqIndex <= 0) continue;

    const key = normalized.slice(0, eqIndex).trim();
    let value = normalized.slice(eqIndex + 1).trim();
    if (!key) continue;

    value = unquoteAndUnescape(value);
    env[key] = value;
  }

  return env;
}

function placeholderKey(placeholder) {
  return placeholder.slice(2, -2);
}

function renderText(text, env, missingKeys) {
  return text.replace(PLACEHOLDER_RE, (match) => {
    const key = placeholderKey(match);
    if (Object.prototype.hasOwnProperty.call(env, key)) {
      return env[key];
    }
    missingKeys.add(key);
    return match;
  });
}

async function collectMarkdownFiles() {
  const rootReadme = path.join(REPO_ROOT, 'README.md');
  const docsRoot = path.join(REPO_ROOT, 'docs');

  const excludeDirPrefixes = [
    path.join(docsRoot, '02_meetings'),
    path.join(docsRoot, 'references'),
    path.join(docsRoot, '_rendered'),
  ];

  const excludeDirnames = new Set(['attachments', 'billing', 'files', 'images', 'recordings']);

  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (excludeDirnames.has(entry.name)) continue;
        if (excludeDirPrefixes.some((prefix) => fullPath.startsWith(prefix))) continue;
        files.push(...(await walk(fullPath)));
        continue;
      }

      if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push(fullPath);
      }
    }

    return files;
  }

  const files = [];
  if (await fileExists(rootReadme)) files.push(rootReadme);
  if (await fileExists(docsRoot)) files.push(...(await walk(docsRoot)));

  return files;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    process.stdout.write(
      [
        'Usage: node tools/render-docs.js [options]',
        '',
        'Options:',
        '  --env <path>       Path to .env (default: ./.env)',
        '  --out <dir>        Output dir (default: ./_rendered)',
        '  --no-clean         Do not remove output dir before rendering',
        '  --no-strict        Do not fail on missing placeholders',
        '  -h, --help         Show help',
        '',
      ].join('\n')
    );
    return;
  }

  const envPath = path.resolve(args.envPath);
  const outDir = path.resolve(args.outDir);

  const hasExample = await fileExists(FALLBACK_ENV_PATH);
  const hasEnv = await fileExists(envPath);

  if (!hasExample && !hasEnv) {
    throw new Error('No .env or .env.example found.');
  }

  const envFromExample = hasExample
    ? parseEnvFile(await fs.readFile(FALLBACK_ENV_PATH, 'utf8'))
    : {};
  const envFromUser = hasEnv
    ? parseEnvFile(await fs.readFile(envPath, 'utf8'))
    : {};

  if (!hasEnv) {
    process.stderr.write(`WARN: ${path.relative(REPO_ROOT, envPath)} not found. Using ${path.relative(REPO_ROOT, FALLBACK_ENV_PATH)} only.\n`);
  }

  const env = { ...envFromExample, ...envFromUser };

  if (args.clean) {
    await fs.rm(outDir, { recursive: true, force: true });
  }
  await fs.mkdir(outDir, { recursive: true });

  const inputFiles = await collectMarkdownFiles();
  const missingKeys = new Set();
  let renderedCount = 0;
  let placeholderOccurrences = 0;

  for (const filePath of inputFiles) {
    const relativePath = path.relative(REPO_ROOT, filePath);
    const targetPath = path.join(outDir, relativePath);

    const source = await fs.readFile(filePath, 'utf8');
    const matches = source.match(PLACEHOLDER_RE);
    if (matches) placeholderOccurrences += matches.length;

    const rendered = renderText(source, env, missingKeys);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, rendered, 'utf8');
    renderedCount += 1;
  }

  process.stdout.write(
    `Rendered ${renderedCount} files to ${path.relative(REPO_ROOT, outDir)} (placeholders: ${placeholderOccurrences}).\n`
  );

  if (missingKeys.size > 0) {
    const list = Array.from(missingKeys).sort();
    process.stderr.write(`Missing env keys (${list.length}): ${list.join(', ')}\n`);
    if (args.strict) {
      process.exitCode = 1;
    }
  }
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
