// scripts/build-builder.js
// Minimal, dependency-free bundler for the Builder UI.
// Concatenates files from src/client/builder into public/js/builder.js.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const SRC = path.resolve(ROOT, 'src', 'client', 'builder');
const OUT = path.resolve(ROOT, 'public', 'js', 'builder.js');
const LEGACY = path.resolve(ROOT, 'public', 'js', 'builder.js');

function banner() {
  return `/*
  !!! GENERATED FILE !!!
  This file is built by scripts/build-builder.js
  Source modules: src/client/builder/*.js
*/\n\n`;
}

function gatherSources() {
  if (!fs.existsSync(SRC)) return [];
  const files = fs.readdirSync(SRC)
    .filter(f => f.endsWith('.js'))
    // basic ordering: utils -> templates -> state -> dnd -> api -> main -> boot
    .sort((a, b) => a.localeCompare(b));
  return files.map(f => ({ name: f, path: path.join(SRC, f) }));
}

function build() {
  const parts = [banner()];
  const sources = gatherSources();
  if (sources.length === 0) {
    console.error('[build-builder] No modules found in src/client/builder. Aborting.');
    process.exit(1);
  }

  for (const src of sources) {
    const code = fs.readFileSync(src.path, 'utf8');
    parts.push(`// ---- ${src.name} ----\n`);
    parts.push(code);
    parts.push('\n');
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, parts.join(''));
  console.log(`[build-builder] Built ${sources.length} module(s) into ${path.relative(ROOT, OUT)}`);
}

build();
