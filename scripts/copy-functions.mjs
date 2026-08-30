#!/usr/bin/env node
// Copies the Cloudflare Pages Functions in `functions/` into `dist/functions/`
// so they ship with the production build. The `astro build` command only
// bundles Astro server endpoints under `src/pages/api/*`; it does NOT touch
// the top-level `functions/` directory, which is the Cloudflare Pages
// Functions convention. Without this step, endpoints like `/api/limit` and
// `/api/reading` exist in the source tree but never get deployed, so the
// live site returns 404 for them and the reading tool can't start.
//
// `scripts/dev.mjs` does the same copy for local dev; this script runs the
// same step as a prebuild hook so production builds match local builds.

import { cp, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'functions');
const DEST = path.join(ROOT, 'dist', 'functions');

async function main() {
  if (!existsSync(SRC)) {
    console.log('[copy-functions] no functions/ directory, skipping');
    return;
  }
  await rm(DEST, { recursive: true, force: true });
  await mkdir(DEST, { recursive: true });
  await cp(SRC, DEST, { recursive: true });
  // Count what we copied for visibility in the build log.
  const { readdir } = await import('node:fs/promises');
  const apiDir = path.join(DEST, 'api');
  if (existsSync(apiDir)) {
    const files = await readdir(apiDir);
    console.log(`[copy-functions] copied ${files.length} function(s) to dist/functions/api/: ${files.join(', ')}`);
  } else {
    console.log('[copy-functions] copied functions/ to dist/functions/ (no api/ subdir)');
  }
}

main().catch((err) => {
  console.error('[copy-functions] failed:', err?.message || err);
  process.exit(1);
});