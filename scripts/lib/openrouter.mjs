// Tiny OpenRouter chat client. We only need one endpoint and JSON output.
// Node 20+ has global fetch, so no external dependency.

import { OPENROUTER } from './blog-config.mjs';

function assertKey() {
  if (!OPENROUTER.apiKey) {
    throw new Error(
      'Missing OpenRouter API key. Set OPENROUTER_DEFAULT_KEY (or OPENROUTER_API_KEY) in your environment.',
    );
  }
}

function extractJson(raw) {
  // Some free models add prose around the JSON. Strip code fences and
  // grab the first balanced {...} block.
  let cleaned = String(raw || '').trim();
  cleaned = cleaned
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) {
    throw new Error('Model did not return a JSON object');
  }
  return JSON.parse(cleaned.slice(first, last + 1));
}

/**
 * Call OpenRouter with a strict JSON-mode prompt.
 * Returns the parsed object.
 *
 * @param {object} opts
 * @param {string} opts.model - OpenRouter model id
 * @param {string} opts.system - system prompt
 * @param {string} opts.user - user prompt
 * @param {number} [opts.maxTokens]
 * @param {number} [opts.temperature]
 */
export async function chatJson({ model, system, user, maxTokens, temperature }) {
  assertKey();

  const body = {
    model,
    temperature: temperature ?? OPENROUTER.temperature,
    max_tokens: maxTokens ?? OPENROUTER.maxTokens,
    // response_format: json_object is supported by most OpenRouter models and
    // is the strongest signal we can send. We still defensively parse.
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  };

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), OPENROUTER.timeoutMs);
  let res;
  try {
    res = await fetch(OPENROUTER.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENROUTER.apiKey}`,
        'HTTP-Referer': OPENROUTER.siteUrl,
        'X-Title': OPENROUTER.siteName,
      },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`OpenRouter HTTP ${res.status}: ${text.slice(0, 400)}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('OpenRouter returned no content');
  }

  return { raw: content, parsed: extractJson(content), usage: data.usage };
}
