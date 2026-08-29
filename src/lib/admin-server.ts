// Server-only helpers for /api/admin/* endpoints.
// Mirrors scripts/lib/openrouter.mjs but is importable from Astro API routes
// without the script CLI deps. Uses Node 20+ built-in fetch.

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

function getKey(): string {
  // The dev server reads .dev.vars (loaded into process.env by Vite/Wrangler).
  // In production (Cloudflare Pages) the key is a secret.
  const key =
    process.env.OPENROUTER_DEFAULT_KEY ||
    process.env.OPENROUTER_API_KEY ||
    (import.meta as any).env?.OPENROUTER_DEFAULT_KEY ||
    '';
  if (!key) {
    throw new Error(
      'Missing OpenRouter API key. Set OPENROUTER_DEFAULT_KEY in .dev.vars (local) or in Cloudflare Pages secrets (prod).',
    );
  }
  return key;
}

function getSiteUrl(): string {
  return (
    process.env.SITE_URL ||
    (import.meta as any).env?.SITE_URL ||
    'https://dailytarot.example.com'
  );
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
    max_tokens: args.maxTokens ?? 1400,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: args.system },
      { role: 'user', content: args.user },
    ],
  };
  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getKey()}`,
      'HTTP-Referer': getSiteUrl(),
      'X-Title': 'Daily Tarot Admin',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`OpenRouter HTTP ${res.status}: ${text.slice(0, 400)}`);
  }
  const data: any = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenRouter returned no content');
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
    maxTokens: 1800,
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
  const { parsed } = await chatJson({
    model,
    system: buildTopicSuggesterSystemPrompt(args.recentTitles.slice(0, 30)),
    user: buildTopicSuggesterUserPrompt(args.seed),
    maxTokens: 800,
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


