// Shared helpers for the local admin API + UI.
// Used by /api/admin/* endpoints and the admin form. The actual generation
// reuses the same prompts and validators as the CLI scripts.

export type Category =
  | 'Card Meanings'
  | 'Spreads'
  | 'Daily Practice'
  | 'Tarot for Life'
  | 'Beginner';

export const CATEGORIES: Category[] = [
  'Card Meanings',
  'Spreads',
  'Daily Practice',
  'Tarot for Life',
  'Beginner',
];

// Curated OpenRouter models.
//
// Why the default is NOT Nemotron 3.5 Lightning (the model the live
// readings use): Nemotron is a reasoning model — it spends its entire
// max_tokens budget on chain-of-thought and then hits the cap before
// producing visible JSON output. That's fine for the reading API
// (user already saw the cards; the AI text appears later) but it's
// terrible for the admin (the user clicks a button and waits 30s+).
//
// minimex/minimax-m2.7:free is verified to return JSON directly in
// ~2-3 seconds at $0 cost. Use Nemotron for the live readings, use
// this for the admin.
//
// Free model availability on OpenRouter changes often. If a model
// returns 404 or "unavailable for free" at runtime, the error is
// surfaced to the admin UI so the user can pick another one.
export const MODELS: Array<{ id: string; label: string; group: 'Free' | 'Paid' }> = [
  { id: 'minimax/minimax-m2.7:free', label: 'MiniMax M2.7 (free, default, fast)', group: 'Free' },
  { id: 'google/gemma-4-31b-it:free', label: 'Google Gemma 4 31B (free)', group: 'Free' },
  { id: 'nvidia/nemotron-3-super-120b-a12b:free', label: 'NVIDIA Nemotron 3 Super 120B (free)', group: 'Free' },
  { id: 'nvidia/nemotron-3-ultra-550b-a55b:free', label: 'NVIDIA Nemotron 3 Ultra 550B (free)', group: 'Free' },
  { id: 'google/gemma-4-26b-a4b-it:free', label: 'Google Gemma 4 26B A4B (free)', group: 'Free' },
  { id: 'nvidia/nemotron-3.5-lightning:free', label: 'NVIDIA Nemotron 3.5 Lightning (free, slow, reasoning)', group: 'Free' },
  { id: 'openrouter/auto', label: 'OpenRouter Auto (routes by quality; may be paid)', group: 'Free' },
  { id: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet (paid)', group: 'Paid' },
  { id: 'openai/gpt-4o-mini', label: 'GPT-4o mini (paid)', group: 'Paid' },
  { id: 'anthropic/claude-3-haiku', label: 'Claude 3 Haiku (paid, cheap)', group: 'Paid' },
];

// Default model for the admin. Nemotron stays in the list for users who
// want it, but the default is a non-reasoning model for responsiveness.
export const DEFAULT_MODEL = 'minimax/minimax-m2.7:free';

export type GenerateRequest = {
  topic: string;
  category: Category | '';
  primaryKeyword: string;
  secondaryKeywords: string[];
  model: string;
  mode: 'draft' | 'publish';
  language: 'en' | 'es' | 'fr';
};

export type ValidationReport = {
  ok: boolean;
  wordCount: number;
  internalLinks: number;
  externalLinks: number;
  titleLength: number;
  descriptionLength: number;
  blocklistHits: string[];
  errors: string[];
};

export type GeneratedPost = {
  title: string;
  description: string;
  category: Category;
  body: string;
  model: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  validation: ValidationReport;
};

const BLOCKLIST = [
  'the universe ',
  'the universe.',
  'karmic',
  'soulmate',
  'destiny is calling',
  'your destiny',
  'you will meet ',
  'you will find ',
  'meant to be',
  'everything happens for a reason',
  'sign from the ',
];

const INTERNAL_PATHS = [
  '/',
  '/card-of-the-day',
  '/card-of-the-day/archive',
  '/blog',
  '/tarot-card-meanings',
  '/tarot-career-reading',
  '/tarot-love-reading',
  '/three-card-spread',
  '/how-tarot-works',
  '/daily-tarot-guide',
  '/disclaimer',
];

export function validatePost(input: {
  kind: 'evergreen';
  title: string;
  description: string;
  body: string;
  category: string;
}): ValidationReport {
  const errors: string[] = [];
  const titleLength = (input.title || '').length;
  const descriptionLength = (input.description || '').length;
  if (titleLength < 30 || titleLength > 80) {
    errors.push(`title length ${titleLength} (want 30-80)`);
  }
  if (descriptionLength < 100 || descriptionLength > 180) {
    errors.push(`description length ${descriptionLength} (want 100-180)`);
  }
  if (!input.category || !CATEGORIES.includes(input.category as Category)) {
    errors.push(`category missing or invalid: "${input.category}"`);
  }
  const wordCount = (input.body || '').trim().split(/\s+/).filter(Boolean).length;
  if (wordCount < 700 || wordCount > 1100) {
    errors.push(`body word count ${wordCount} (want 700-1100)`);
  }
  const links = (input.body || '').match(/\]\(([^)]+)\)/g) || [];
  const internalLinks = links
    .map((m) => m.slice(2, -1).split('#')[0])
    .filter((h) => h.startsWith('/') && INTERNAL_PATHS.includes(h)).length;
  const externalLinks = links.filter((m) => /\]\(https?:\/\//.test(m)).length;
  if (internalLinks < 3) errors.push(`only ${internalLinks} internal links (need 3+)`);
  if (externalLinks > 0) errors.push(`${externalLinks} external link(s) not allowed`);
  const lower = (input.body || '').toLowerCase();
  const blocklistHits = BLOCKLIST.filter((p) => lower.includes(p));
  for (const p of blocklistHits) errors.push(`blocklist phrase: "${p}"`);
  return {
    ok: errors.length === 0,
    wordCount,
    internalLinks,
    externalLinks,
    titleLength,
    descriptionLength,
    blocklistHits,
    errors,
  };
}

export function buildEvergreenSystemPrompt(): string {
  return `You write long-form SEO blog posts for a free tarot site.

Voice and specificity (NON-NEGOTIABLE):
- Calm, grounded, slightly poetic. Never florid, never generic.
- Address the reader as "you".
- Every sentence must add a concrete action, sensation, or decision. No abstract declarations.
- Be specific to the reader's actual life. Name what to do before nightfall, this week, in the next conversation, in the next hour. Concrete: "send the message tonight", "spend twenty minutes walking without your phone", "answer the email you have been postponing". Not: "transformation", "the universe", "new beginnings", "a place", "a person", "a journey".
- Reversed cards are NOT punishments. They are inward turns, slow combustions, refusals, hidden currents, an energy held back. Name it as such.
- Never reference the cards as symbols or archetypes. Treat them as named characters whose presence changes the room.
- Tarot is for entertainment and self-reflection. It is NOT medical, legal, or financial advice. Never claim to predict the future with certainty. Use "the cards point toward", "the energy suggests", "today's pull invites you to".
- Avoid mystical cliches: "the universe", "karmic", "soulmate", "destiny", "everything happens for a reason", "sign from the universe". Use plain language.
`;
}

export function buildEvergreenUserPrompt(input: {
  topic: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  category: string;
}): string {
  const allowed = INTERNAL_PATHS.map((p) => `- ${p}`).join('\n');
  return `Write the blog post now.

Topic: ${input.topic}
Primary keyword to target: ${input.primaryKeyword || input.topic}
Secondary keywords (use each at least once if natural): ${input.secondaryKeywords.join(', ') || 'n/a'}
Category: ${input.category}

Post structure (REQUIRED):
- Opening: a 2-3 sentence lead that states the question being answered in plain language.
- Then 3 to 5 H2 sections. Each section must have a descriptive, lowercase-friendly heading.
- One H2 must be titled "What this means in practice" and contain 2-3 concrete examples.
- One H2 must be titled "Common mistakes" and list 3 short pitfalls to avoid.
- A closing H2 titled "Try it yourself" with a link to / and to the relevant card meaning page.
- Total body word count: 700 to 1100 words.

Internal links (REQUIRED, minimum 3):
You MUST include at least 3 internal links using only these paths as href values:
${allowed}
Do not invent new internal paths. Do not link to external sites. You may repeat paths.

Respond with a JSON object using this exact shape, with REAL values (not placeholder text):
{
  "title": "Real SEO title 30-80 chars",
  "description": "Real meta description 100-180 chars",
  "category": "Card Meanings",
  "body": "Full markdown body with ## headings and 700-1100 words"
}

Rules:
- title: 30-80 characters, no quotes, no emoji
- description: 100-180 characters
- category: one of [${CATEGORIES.join(', ')}]
- body: markdown body that includes the ## headings

Output JSON only. No markdown fences. No prose. No commentary. Start your reply with { and end with }.`;
}

export function buildTopicSuggesterSystemPrompt(recentTitles: string[]): string {
  return `You propose 5 fresh evergreen tarot blog topics. Each must:
- Target a specific search query a beginner-to-intermediate tarot reader would actually type.
- Be answerable in 700-1100 words.
- Be framed as a question or a concrete problem, not a generic theme.
- Avoid duplicating any title listed under "RECENT POSTS" below.

RECENT POSTS (do not repeat):
${recentTitles.length > 0 ? recentTitles.map((t) => `- ${t}`).join('\n') : '(none yet)'}
`;
}

export function buildTopicSuggesterUserPrompt(seed?: string): string {
  return `Suggest 5 topics${seed ? ` on or near: ${seed}` : ''}.

Respond with a JSON object using this exact shape, with REAL values (not placeholder text):
{
  "topics": [
    {
      "title": "Real SEO question a human would type into Google",
      "category": "Card Meanings",
      "primaryKeyword": "actual seo keyword",
      "angle": "Real one-sentence summary of what the post would cover"
    }
  ]
}

Rules:
- title: a concrete question or problem a searcher would type (not a generic theme)
- category: exactly one of [${CATEGORIES.join(', ')}]
- primaryKeyword: the SEO keyword the post targets
- angle: one sentence describing the post's actual content

Output JSON only. No markdown fences. No prose. No commentary. No code block markers. Start your reply with { and end with }.`;
}

export function weaveImages(body: string, image1Path: string | null, image2Path: string | null, title: string): string {
  let out = body;
  if (image1Path) {
    const firstHeading = out.indexOf('\n## ');
    if (firstHeading !== -1) {
      out = out.slice(0, firstHeading) + `\n\n![${escapeAlt(title)}](${image1Path})\n` + out.slice(firstHeading);
    } else {
      out = `${out}\n\n![${escapeAlt(title)}](${image1Path})\n`;
    }
  }
  if (image2Path) {
    const mistakesIdx = out.indexOf('\n## Common mistakes');
    if (mistakesIdx !== -1) {
      out = out.slice(0, mistakesIdx) + `\n\n![Illustration](${image2Path})\n` + out.slice(mistakesIdx);
    } else {
      out = `${out}\n\n![Illustration](${image2Path})\n`;
    }
  }
  return out;
}

function escapeAlt(s: string): string {
  return s.replace(/[\[\]]/g, '');
}

// Parse model output: strip code fences, find the first balanced { ... }.
// Tolerant of trailing/leading prose, code fences, and reasoning text.
export function extractJson(raw: string): any {
  let cleaned = String(raw || '').trim();
  cleaned = cleaned
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  const first = cleaned.indexOf('{');
  if (first === -1) {
    throw new Error('Model did not return a JSON object');
  }
  // Walk forward from `first`, tracking depth, to find the matching `}`.
  // Stops at the first balanced close, ignoring any trailing junk.
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = first; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return JSON.parse(cleaned.slice(first, i + 1));
      }
    }
  }
  // Couldn't find a balanced close — fall back to lastIndexOf.
  const last = cleaned.lastIndexOf('}');
  if (last > first) {
    return JSON.parse(cleaned.slice(first, last + 1));
  }
  throw new Error('Model did not return a balanced JSON object');
}

