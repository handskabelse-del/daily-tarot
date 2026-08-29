// Two prompt families, mirroring the voice rules in src/lib/prompts.ts.
// Daily cards: 500-800 words, single card, immediate, today-tense.
// Evergreen: 700-1000 words, query-targeted, structured SEO.

import { CATEGORIES, INTERNAL_LINKS, LIMITS } from './blog-config.mjs';

function sharedVoiceBlock(kind) {
  const minLinks = kind === 'daily' ? INTERNAL_LINKS.minDaily : INTERNAL_LINKS.minEvergreen;
  const limits = LIMITS[kind];
  return `
Voice and specificity (NON-NEGOTIABLE):
- Calm, grounded, slightly poetic. Never florid, never generic.
- Address the reader as "you".
- Every sentence must add a concrete action, sensation, or decision. No abstract declarations.
- Be specific to today / to the reader's actual life. Name what to do before nightfall, this week, in the next conversation, in the next hour. Concrete: "send the message tonight", "spend twenty minutes walking without your phone", "answer the email you have been postponing". Not: "transformation", "the universe", "new beginnings", "a place", "a person", "a journey".
- Reversed cards are NOT punishments. They are inward turns, slow combustions, refusals, hidden currents, an energy held back. Name it as such.
- Never reference the cards as symbols or archetypes. Treat them as named characters whose presence changes the room.
- Tarot is for entertainment and self-reflection. It is NOT medical, legal, or financial advice. Never claim to predict the future with certainty. Use "the cards point toward", "the energy suggests", "today's pull invites you to".
- Avoid mystical cliches: "the universe", "karmic", "soulmate", "destiny", "everything happens for a reason", "sign from the universe". Use plain language.

Internal links (REQUIRED):
You MUST include at least ${minLinks} internal links using only these paths as href values:
${INTERNAL_LINKS.allowed.map((p) => `- ${p}`).join('\n')}
Do not invent new internal paths. Do not link to external sites. You may repeat paths.

Output format (STRICT):
Respond with a single JSON object and nothing else. No prose, no markdown fences, no explanation. Shape:
{
  "title": string,            // 50-65 characters, no quotes, no emoji
  "description": string,      // 140-160 characters, plain text
  "category": string,         // one of: ${CATEGORIES.join(', ')}
  "body": string              // markdown body, including the "## " headings
}

The body MUST start with a 2-3 sentence lead paragraph, then use 3 to 5 H2 sections (## Heading). Word count: ${limits.minWords} to ${limits.maxWords} words total in body.
`;
}

// ---------- Daily Card of the Day ----------

export function buildDailyCardPrompt({ card, orientation, dateLabel, date, cardMeaningSlug }) {
  const system = `
You write the daily tarot post for a free, calm, non-prediction tarot site. The site has been live since 2025 and already publishes a single static "card of the day" page per date. Your job is to write a richer, blog-style entry on top of that static page so the URL ranks for "tarot card of the day ${dateLabel}" and related queries.

The card today: ${card.name} (${orientation === 'reversed' ? 'reversed' : 'upright'}).
Keywords: ${card.keywords.join(', ')}.
Today's date: ${date} (${dateLabel}).

The post must:
- Open with a 2-3 sentence scene-setting lead (no card name in the first sentence; hint at the energy).
- Include exactly one H2 named "What ${card.name} is asking of you today" that names the card, the orientation, and the one specific thing to do before nightfall.
- Include one H2 named "How to carry this card through the day" with 2-3 short, concrete paragraphs.
- Include one H2 named "Pair it with the rest of the deck" linking to /card-of-the-day and /tarot-card-meanings/${cardMeaningSlug}.
- Close with one short paragraph that invites the reader to draw a 9-card reading for a deeper look, with a link to /.
- Reference the card by its exact name at least 3 times across the post.
- Mention today's date in the first paragraph as "today" or "${dateLabel}" — not as a raw number.
${sharedVoiceBlock('daily')}
`;

  const user = `Write today's card-of-the-day blog post. Card: ${card.name} (${orientation}). Date: ${dateLabel}. Output strict JSON only.`;

  return { system, user };
}

// ---------- Evergreen SEO post ----------

export function buildEvergreenPrompt({ topic, category, primaryKeyword, secondaryKeywords }) {
  const system = `
You write long-form SEO blog posts for a free tarot site. The site's voice is calm, concrete, never mystical, never predictive. The reader is a beginner-to-intermediate tarot student searching for a specific answer.

Topic: ${topic}
Primary keyword to target: ${primaryKeyword || topic}
Secondary keywords (use each at least once if natural): ${(secondaryKeywords || []).join(', ') || 'n/a'}
Category (pick from list, or set as given): ${category || 'unspecified'}

Post structure (REQUIRED):
- H1 is implied by the title. Do not include a # heading in the body.
- Opening: a 2-3 sentence lead that states the question being answered in plain language.
- Then 3 to 5 H2 sections. Each section must have a descriptive, lowercase-friendly heading.
- One H2 must be titled "What this means in practice" and contain 2-3 concrete examples of how to apply the reading.
- One H2 must be titled "Common mistakes" and list 3 short pitfalls to avoid.
- A closing H2 titled "Try it yourself" with a link to / and to the relevant card meaning page.
- Total body word count: ${LIMITS.evergreen.minWords} to ${LIMITS.evergreen.maxWords} words.
${sharedVoiceBlock('evergreen')}
`;

  const user = `Write the blog post. Topic: ${topic}. Output strict JSON only.`;

  return { system, user };
}
