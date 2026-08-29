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

// Curated OpenRouter models. "openrouter/auto" is the default and routes
// to the best free model. "label" is what shows in the dropdown.
export const MODELS: Array<{ id: string; label: string; group: 'Free' | 'Paid' }> = [
  { id: 'openrouter/auto', label: 'OpenRouter Auto (free, recommended)', group: 'Free' },
  { id: 'nvidia/nemotron-3-5-lightning:free', label: 'Nemotron 3.5 Lightning (free)', group: 'Free' },
  { id: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B Instruct (free)', group: 'Free' },
  { id: 'qwen/qwen-2.5-72b-instruct:free', label: 'Qwen 2.5 72B Instruct (free)', group: 'Free' },
  { id: 'mistralai/mistral-small-3.2-24b-instruct:free', label: 'Mistral Small 3.2 24B (free)', group: 'Free' },
  { id: 'google/gemini-2.0-flash-exp:free', label: 'Gemini 2.0 Flash (free)', group: 'Free' },
  { id: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet (paid)', group: 'Paid' },
  { id: 'openai/gpt-4o-mini', label: 'GPT-4o mini (paid)', group: 'Paid' },
  { id: 'anthropic/claude-3-haiku', label: 'Claude 3 Haiku (paid, cheap)', group: 'Paid' },
];

export const DEFAULT_MODEL = 'openrouter/auto';

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
  return `You write long-form SEO blog posts for a free tarot site. The site's voice is calm, concrete, never mystical, never predictive. The reader is a beginner-to-intermediate tarot student searching for a specific answer.

Voice and specificity (NON-NEGOTIABLE):
- Calm, grounded, slightly poetic. Never florid, never generic.
- Address the reader as "you".
- Every sentence must add a concrete action, sensation, or decision. No abstract declarations.
- Be specific to today / to the reader's actual life. Name what to do before nightfall, this week, in the next conversation, in the next hour. Concrete: "send the message tonight", "spend twenty minutes walking without your phone", "answer the email you have been postponing". Not: "transformation", "the universe", "new beginnings", "a place", "a person", "a journey".
- Reversed cards are NOT punishments. They are inward turns, slow combustions, refusals, hidden currents, an energy held back. Name it as such.
- Never reference the cards as symbols or archetypes. Treat them as named characters whose presence changes the room.
- Tarot is for entertainment and self-reflection. It is NOT medical, legal, or financial advice. Never claim to predict the future with certainty. Use "the cards point toward", "the energy suggests", "today's pull invites you to".
- Avoid mystical cliches: "the universe", "karmic", "soulmate", "destiny", "everything happens for a reason", "sign from the universe". Use plain language.

Internal links (REQUIRED, minimum 3):
You MUST include at least 3 internal links using only these paths as href values:
${INTERNAL_PATHS.map((p) => `- ${p}`).join('\n')}
Do not invent new internal paths. Do not link to external sites. You may repeat paths.

Output format (STRICT):
Respond with a single JSON object and nothing else. No prose, no markdown fences, no explanation. Shape:
{
  "title": string,            // 30-80 characters, no quotes, no emoji
  "description": string,      // 100-180 characters, plain text
  "category": string,         // one of: ${CATEGORIES.join(', ')}
  "body": string              // markdown body, including the "## " headings
}

Post structure (REQUIRED):
- H1 is implied by the title. Do not include a # heading in the body.
- Opening: a 2-3 sentence lead that states the question being answered in plain language.
- Then 3 to 5 H2 sections. Each section must have a descriptive, lowercase-friendly heading.
- One H2 must be titled "What this means in practice" and contain 2-3 concrete examples of how to apply the reading.
- One H2 must be titled "Common mistakes" and list 3 short pitfalls to avoid.
- A closing H2 titled "Try it yourself" with a link to / and to the relevant card meaning page.
- Total body word count: 700 to 1100 words.
`;
}

export function buildEvergreenUserPrompt(input: {
  topic: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  category: string;
}): string {
  return `Write the blog post now.

Topic: ${input.topic}
Primary keyword to target: ${input.primaryKeyword || input.topic}
Secondary keywords (use each at least once if natural): ${input.secondaryKeywords.join(', ') || 'n/a'}
Category: ${input.category}

Output strict JSON only. No markdown fences. No prose before or after.`;
}

export function buildTopicSuggesterSystemPrompt(recentTitles: string[]): string {
  return `You are a content strategist for a free tarot site. The site publishes long-form SEO articles on tarot card meanings, spreads, and beginner practice. You propose 5 fresh evergreen topics that:
- Target a specific search query a beginner-to-intermediate tarot reader would actually type.
- Are not yet covered by the recent posts.
- Are answerable in 700-1100 words.
- Are framed as a question or a concrete problem, not a generic theme.

You respond with a single JSON object and nothing else. Shape:
{
  "topics": [
    { "title": string, "category": string, "primaryKeyword": string, "angle": string }
  ]
}
"angle" is one sentence on what the post would actually cover, so the user can pick fast.
"category" must be one of: ${CATEGORIES.join(', ')}.

The site already has these recent post titles (do NOT repeat them):
${recentTitles.length > 0 ? recentTitles.map((t) => `- ${t}`).join('\n') : '(none yet)'}
`;
}

export function buildTopicSuggesterUserPrompt(seed?: string): string {
  return seed
    ? `Suggest 5 topics. Seed/lean: ${seed}.`
    : 'Suggest 5 fresh evergreen topics.';
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

export function extractJson(raw: string): any {
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

