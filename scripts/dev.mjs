#!/usr/bin/env node
// Local dev: runs Astro (with /api/* proxied to wrangler) and Wrangler Pages together.
// 1. build once
// 2. copy functions/ into dist/ so wrangler pages dev picks them up
// 3. start wrangler pages dev on :8788
// 4. start astro dev on :4321 (vite proxies /api/* to wrangler)

import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import net from 'node:net';
import { cp, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const WRANGLER_PORT = 8788;
const ASTRO_PORT = 4321;

function run(cmd, args, label) {
  const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: true });
  p.stdout.on('data', (d) => process.stdout.write(`[${label}] ${d}`));
  p.stderr.on('data', (d) => process.stderr.write(`[${label}] ${d}`));
  p.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`[${label}] exited with ${code}`);
      shutdown();
    }
  });
  return p;
}

let wranglerProc, astroProc;

function shutdown() {
  try { wranglerProc?.kill(); } catch {}
  try { astroProc?.kill(); } catch {}
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

(async () => {
  console.log('[dev] building static site...');
  const build = run('npx', ['astro', 'build'], 'build');
  const code = await new Promise((r) => build.on('exit', r));
  if (code !== 0) process.exit(code);

  console.log('[dev] copying functions/ into dist/ for wrangler pages dev');
  if (existsSync('./dist/functions')) await rm('./dist/functions', { recursive: true, force: true });
  if (existsSync('./functions')) {
    await mkdir('./dist/functions', { recursive: true });
    await cp('./functions', './dist/functions', { recursive: true });
  }

  console.log(`[dev] starting wrangler on :${WRANGLER_PORT}`);
  wranglerProc = run(
    'npx',
    [
      'wrangler',
      'pages',
      'dev',
      './dist',
      '--port',
      String(WRANGLER_PORT),
      '--ip',
      '127.0.0.1',
    ],
    'wrangler',
  );

  await waitForPort(WRANGLER_PORT, 30000);
  console.log(`[dev] wrangler ready`);

  console.log(`[dev] starting astro dev on :${ASTRO_PORT}`);
  astroProc = run(
    'npx',
    ['astro', 'dev', '--port', String(ASTRO_PORT), '--host', '127.0.0.1'],
    'astro',
  );
})();

function waitForPort(port, timeoutMs) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      if (Date.now() - start > timeoutMs) return reject(new Error(`Port ${port} timeout`));
      const ok = await new Promise((r) => {
        const s = net.connect(port, '127.0.0.1');
        s.once('connect', () => { s.end(); r(true); });
        s.once('error', () => r(false));
      });
      if (ok) resolve(true);
      else { await sleep(400); tick(); }
    };
    tick();
  });
}
