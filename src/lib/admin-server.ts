// Server-only helpers for /api/admin/* endpoints.
// Mirrors scripts/lib/openrouter.mjs but is importable from Astro API routes
// without the script CLI deps. Uses Node 20+ built-in fetch.

import fs from 'node:fs';
import path from 'node:path';
import type { GeneratedPost } from './admin-shared';
import {
  DEFAULT_MODEL,
  validatePost,
  weaveImages,
  extractJson,
  buildEvergreenSystemPrompt,
  buildEvergreenUserPrompt,
  buildTopicSuggesterSystemPrompt,
  buildTopicSuggesterUserPrompt,
  type Category,
  type ValidationReport,
} from './admin-shared';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Astro doesn't read .dev.vars (that's a Wrangler convention). The reading API
// is wired up by `npm run dev:full` (which starts both wrangler and astro),
// but a plain `astro dev` won't see it. So we fall back to reading it from
// disk on first call, exactly once.
let _devVarsCache: Record<string, string> | null = null;

function loadDotEnvFile(filePath: string): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    if (!fs.existsSync(filePath)) return out;
    const text = fs.readFileSync(filePath, 'utf8');
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/i.exec(line);
      if (!m) continue;
      let v = m[2].trim();
      // Strip matching single or double quotes.
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      out[m[1]] = v;
    }
  } catch {
    // ignore
  }
  return out;
}

function getDevVars(): Record<string, string> {
  if (_devVarsCache) return _devVarsCache;
  const cwd = process.cwd();
  // Order matters: .env first, then .dev.vars wins. (Vite/Astro already
  // exposes .env via import.meta.env, so we only really need .dev.vars here.)
  const env = loadDotEnvFile(path.join(cwd, '.env'));
  const devVars = loadDotEnvFile(path.join(cwd, '.dev.vars'));
  _devVarsCache = { ...env, ...devVars };
  return _devVarsCache;
}

function getKey(): string {
  // Priority:
  //   1. process.env (set by `KEY=... npm run dev`)
  //   2. .dev.vars on disk (Wrangler convention used by this project)
  //   3. .env on disk (Astro convention)
  //   4. import.meta.env (Vite-injected)
  // In production (Cloudflare Pages) the key is a secret bound to the
  // function — that arrives as process.env.OPENROUTER_DEFAULT_KEY automatically.
  const fromMeta = (import.meta as any).env || {};
  const devVars = getDevVars();
  const key =
    process.env.OPENROUTER_DEFAULT_KEY ||
    process.env.OPENROUTER_API_KEY ||
    devVars.OPENROUTER_DEFAULT_KEY ||
    devVars.OPENROUTER_API_KEY ||
    fromMeta.OPENROUTER_DEFAULT_KEY ||
    fromMeta.OPENROUTER_API_KEY ||
    '';
  if (!key) {
    throw new Error(
      'Missing OpenRouter API key. Either: (a) put OPENROUTER_DEFAULT_KEY=sk-or-v1-... in your .dev.vars, (b) create a .env file with the same key, or (c) run `OPENROUTER_DEFAULT_KEY=sk-or-v1-... npm run dev`.',
    );
  }
  return key;
}

function getSiteUrl(): string {
  const fromMeta = (import.meta as any).env || {};
  return (
    process.env.SITE_URL ||
    getDevVars().SITE_URL ||
    fromMeta.SITE_URL ||
    'https://dailytarot.example.com'
  );
}

// Exported so the /api/admin/ping preflight endpoint can reuse them
// without duplicating the .dev.vars fallback logic.
export const getOpenRouterKey = getKey;
export const getOpenRouterSiteUrl = getSiteUrl;

// ---------------------------------------------------------------------------
// Git helper for the one-button "Publish" action.
// ---------------------------------------------------------------------------
// Imports `child_process` lazily so this module is still safe to import from
// routes that don't need it (e.g. /api/admin/ping).

export type GitStatus = {
  ok: boolean;
  clean: boolean;
  branch: string | null;
  ahead: number;        // commits ahead of origin/<branch>
  behind: number;       // commits behind origin/<branch>
  uncommitted: string[];// modified/untracked paths (relative)
  message?: string;
};

export type GitPublishResult = {
  ok: boolean;
  committedFiles: string[];
  commitSha: string | null;
  pushed: boolean;
  remoteUrl: string | null;
  durationMs: number;
  error?: string;
};

async function importChildProcess() {
  // Dynamic import avoids pulling child_process into the client bundle when
  // this module is imported from a route that doesn't need it.
  const cp = await import('node:child_process');
  return cp;
}

function runGit(args: string[], opts: { cwd?: string } = {}): Promise<{ code: number; stdout: string; stderr: string }> {
  return importChildProcess().then((cp) =>
    new Promise((resolve) => {
      const cwd = opts.cwd || process.cwd();
      const proc = cp.spawn('git', args, { cwd, shell: false });
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
      proc.on('close', (code) => resolve({ code: code ?? 0, stdout, stderr }));
      proc.on('error', (err) => resolve({ code: -1, stdout, stderr: stderr + '\n' + (err?.message || String(err)) }));
    })
  );
}

export async function gitStatus(): Promise<GitStatus> {
  const cwd = process.cwd();
  const branchRes = await runGit(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd });
  if (branchRes.code !== 0) {
    return { ok: false, clean: false, branch: null, ahead: 0, behind: 0, uncommitted: [], message: 'Not a git repository' };
  }
  const branch = branchRes.stdout.trim();
  const statusRes = await runGit(['status', '--porcelain'], { cwd });
  const uncommitted = statusRes.stdout.split(/\r?\n/).filter(Boolean);
  // ahead/behind vs origin/<branch> — may fail if there's no origin/<branch> yet
  let ahead = 0;
  let behind = 0;
  const revRes = await runGit(['rev-list', '--left-right', '--count', `origin/${branch}...HEAD`], { cwd }).catch(() => null);
  if (revRes && revRes.code === 0) {
    const [b, a] = revRes.stdout.trim().split(/\s+/).map(Number);
    behind = b || 0;
    ahead = a || 0;
  }
  return {
    ok: true,
    clean: uncommitted.length === 0 && ahead === 0,
    branch,
    ahead,
    behind,
    uncommitted,
  };
}

export async function gitCommitAndPush(opts: {
  files: string[];
  message: string;
  push?: boolean;
}): Promise<GitPublishResult> {
  const cwd = process.cwd();
  const t0 = Date.now();
  const push = opts.push !== false;

  // 1. Verify we're in a repo
  const rev = await runGit(['rev-parse', '--is-inside-work-tree'], { cwd });
  if (rev.code !== 0) {
    return { ok: false, committedFiles: [], commitSha: null, pushed: false, remoteUrl: null, durationMs: Date.now() - t0, error: 'Not a git repository' };
  }

  // 2. Determine current branch
  const branchRes = await runGit(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd });
  if (branchRes.code !== 0) {
    return { ok: false, committedFiles: [], commitSha: null, pushed: false, remoteUrl: null, durationMs: Date.now() - t0, error: 'Could not determine current branch' };
  }
  const branch = branchRes.stdout.trim();

  // 3. Stage the requested files (normalize separators, strip leading ./)
  const relFiles = opts.files
    .map((f) => f.replace(/\\/g, '/').replace(/^\.\//, ''))
    .filter(Boolean);
  if (relFiles.length === 0) {
    return { ok: false, committedFiles: [], commitSha: null, pushed: false, remoteUrl: null, durationMs: Date.now() - t0, error: 'No files to commit' };
  }
  const addRes = await runGit(['add', '--', ...relFiles], { cwd });
  if (addRes.code !== 0) {
    return { ok: false, committedFiles: [], commitSha: null, pushed: false, remoteUrl: null, durationMs: Date.now() - t0, error: `git add failed: ${addRes.stderr.trim()}` };
  }

  // 4. Verify something actually got staged (the files may not exist, etc.)
  const staged = await runGit(['diff', '--cached', '--name-only'], { cwd });
  if (staged.code !== 0 || !staged.stdout.trim()) {
    return { ok: false, committedFiles: [], commitSha: null, pushed: false, remoteUrl: null, durationMs: Date.now() - t0, error: 'Nothing staged to commit' };
  }
  const committedFiles = staged.stdout.trim().split(/\r?\n/);

  // 5. Configure author (in case the user never set it globally)
  const authorName = process.env.GIT_AUTHOR_NAME || 'Daily Tarot Bot';
  const authorEmail = process.env.GIT_AUTHOR_EMAIL || 'bot@dailytarot.local';
  await runGit(['config', 'user.name', authorName], { cwd });
  await runGit(['config', 'user.email', authorEmail], { cwd });

  // 6. Commit
  const commitRes = await runGit(['commit', '-m', opts.message], { cwd });
  if (commitRes.code !== 0) {
    return { ok: false, committedFiles, commitSha: null, pushed: false, remoteUrl: null, durationMs: Date.now() - t0, error: `git commit failed: ${commitRes.stderr.trim() || commitRes.stdout.trim()}` };
  }

  // 7. Get SHA
  const shaRes = await runGit(['rev-parse', 'HEAD'], { cwd });
  const commitSha = shaRes.code === 0 ? shaRes.stdout.trim() : null;

  // 8. Push (if requested)
  let pushed = false;
  let remoteUrl: string | null = null;
  if (push) {
    const remoteRes = await runGit(['config', '--get', 'remote.origin.url'], { cwd });
    remoteUrl = remoteRes.code === 0 ? remoteRes.stdout.trim() : null;
    const pushRes = await runGit(['push', 'origin', branch], { cwd });
    pushed = pushRes.code === 0;
    if (!pushed) {
      return {
        ok: false,
        committedFiles,
        commitSha,
        pushed: false,
        remoteUrl,
        durationMs: Date.now() - t0,
        error: `git push failed: ${pushRes.stderr.trim() || pushRes.stdout.trim()}`,
      };
    }
  }

  return {
    ok: true,
    committedFiles,
    commitSha,
    pushed,
    remoteUrl,
    durationMs: Date.now() - t0,
  };
}

async function chatJson(args: {
  model: string;
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<{ parsed: any; usage?: any }> {
  const body = {
    model: args.model,
    temperature: args.temperature ?? 0.7,
    max_tokens: args.maxTokens ?? 4000,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: args.system },
      { role: 'user', content: args.user },
    ],
  };
  // 60s server-side cap. Free models (Nemotron, deepseek-v4-flash) routinely
  // take 30-50s for 700-word posts. Cloudflare's free-plan fetch limit is
  // 30s on Workers, so this only matters in dev — in production the
  // platform will cut us off around 30s and the client will get a 500.
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 60_000);
  let res: Response;
  try {
    res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getKey()}`,
        'HTTP-Referer': getSiteUrl(),
        'X-Title': 'Daily Tarot Admin',
      },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      throw new Error(`OpenRouter request timed out after 60s (model=${args.model}). Try a faster non-reasoning model like minimax/minimax-m2.7:free.`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    // Surface the actual OpenRouter error message so the user can see
    // "this model is unavailable for free" / "invalid API key" / etc.
    let msg = text;
    try {
      const j = JSON.parse(text);
      msg = j?.error?.message || text;
    } catch {
      // not JSON, keep raw
    }
    throw new Error(`OpenRouter HTTP ${res.status}: ${msg.slice(0, 400)}`);
  }
  const data: any = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  const finishReason = data?.choices?.[0]?.finish_reason;
  if (!content) {
    // Some reasoning-capable free models burn all tokens on chain-of-thought
    // and return content: null with finish_reason: "length". Surface that.
    throw new Error(
      `OpenRouter returned no content (model=${data?.model ?? args.model}, finish=${finishReason ?? 'unknown'}, ` +
      `usage=${JSON.stringify(data?.usage ?? {}).slice(0, 200)}). ` +
      `Try a different model, lower the system prompt size, or raise max_tokens.`,
    );
  }
  return { parsed: extractJson(content), usage: data.usage };
}

export async function generateEvergreenPost(input: {
  topic: string;
  category: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  model: string;
  image1Path: string | null;
  image2Path: string | null;
}): Promise<GeneratedPost> {
  const model = input.model || DEFAULT_MODEL;
  const system = buildEvergreenSystemPrompt();
  const user = buildEvergreenUserPrompt({
    topic: input.topic,
    primaryKeyword: input.primaryKeyword,
    secondaryKeywords: input.secondaryKeywords,
    category: input.category,
  });
  const { parsed, usage } = await chatJson({
    model,
    system,
    user,
    maxTokens: 4000,
  });
  const rawBody: string = parsed.body || '';
  const finalBody = weaveImages(rawBody, input.image1Path, input.image2Path, parsed.title || input.topic);
  const finalCategory = (input.category && (input.category as Category)) || (parsed.category as Category);
  const validation: ValidationReport = validatePost({
    kind: 'evergreen',
    title: parsed.title,
    description: parsed.description,
    body: finalBody,
    category: finalCategory,
  });
  return {
    title: parsed.title,
    description: parsed.description,
    category: finalCategory,
    body: finalBody,
    model,
    usage,
    validation,
  };
}

export async function suggestTopics(args: {
  seed?: string;
  recentTitles: string[];
  model?: string;
}): Promise<{ topics: Array<{ title: string; category: string; primaryKeyword: string; angle: string }> }> {
  const model = args.model || DEFAULT_MODEL;
  // The suggester output is small (5 short topics), but reasoning-capable
  // free models like Nemotron burn ~1500 tokens of thinking. We use 1500
  // to keep total latency under ~10s. If the model needs more, the error
  // message tells the user which model to swap to.
  const { parsed } = await chatJson({
    model,
    system: buildTopicSuggesterSystemPrompt(args.recentTitles.slice(0, 10)),
    user: buildTopicSuggesterUserPrompt(args.seed),
    maxTokens: 1500,
    temperature: 0.9,
  });
  return { topics: Array.isArray(parsed.topics) ? parsed.topics : [] };
}

// Tiny markdown → HTML renderer for the live preview pane.
// We avoid pulling in marked/markdown-it to keep the bundle clean; the body
// comes from the LLM so we keep this sandboxed and conservative.
export function renderMarkdownPreview(md: string): string {
  const escapeHtml = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const lines = (md || '').split(/\r?\n/);
  const out: string[] = [];
  let inList = false;
  for (const line of lines) {
    const trimmed = line.trimEnd();
    if (trimmed.startsWith('## ')) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<h2>${renderInline(escapeHtml(trimmed.slice(3)))}</h2>`);
    } else if (trimmed.startsWith('# ')) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<h1>${renderInline(escapeHtml(trimmed.slice(2)))}</h1>`);
    } else if (/^[-*]\s+/.test(trimmed)) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`<li>${renderInline(escapeHtml(trimmed.replace(/^[-*]\s+/, '')))}</li>`);
    } else if (trimmed === '') {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push('');
    } else {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<p>${renderInline(escapeHtml(trimmed))}</p>`);
    }
  }
  if (inList) out.push('</ul>');
  return out.join('\n');
}

function renderInline(escaped: string): string {
  // Images ![alt](src)
  let s = escaped.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt, src) => {
    return `<img alt="${alt}" src="${src}" loading="lazy" />`;
  });
  // Links [text](href) — only allow relative or http(s)
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text, href) => {
    if (!/^(\/|#|https?:\/\/)/.test(href)) return text;
    const safe = href.replace(/"/g, '%22');
    return `<a href="${safe}">${text}</a>`;
  });
  // Bold **x**
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Italic *x* (avoid matching ** which we already handled)
  s = s.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  return s;
}


