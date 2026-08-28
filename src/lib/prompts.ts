import type { DrawCard } from './draw';
import { POSITIONS } from './draw';

export type ReadingJson = {
  summary: string;
  positionInterpretations: Array<{
    position: string;
    card: string;
    orientation: 'upright' | 'reversed';
    text: string;
  }>;
  advice: string;
};

export const SYSTEM_PROMPT = `You are a warm, grounded tarot reader. Your tone is calm, specific, and human — never generic. You give actionable, non-deterministic readings. For entertainment only. Do not give medical, legal, or financial advice.

You MUST respond with a single JSON object and nothing else. No prose, no markdown, no code fences, no explanation before or after.

Exact shape:
{
  "summary": string,
  "positionInterpretations": [
    { "position": string, "card": string, "orientation": "upright"|"reversed", "text": string }
  ],
  "advice": string
}

Rules:
- "positionInterpretations" must contain EXACTLY 9 items, in the same order as the positions you are given.
- "position" must match the position name exactly as provided.
- "card" must match the card name exactly as provided.
- "orientation" must be exactly "upright" or "reversed".
- Each "text" must be 2-4 sentences, grounded in the card's traditional meaning, the orientation, and the position's theme.
- Use second person ("you", "your").
- Reference the user's question if provided.
- Output ONLY the JSON object. Start with { and end with }.`;

export function buildUserPrompt(cards: DrawCard[], question?: string): string {
  const positionsText = POSITIONS.map((p) => `${p.index}. ${p.name} — ${p.prompt}`).join('\n');
  const cardsText = cards
    .map(
      (c, i) =>
        `${i + 1}. Position: ${c.position.name} | Card: ${c.card.name} (${c.card.arcana === 'major' ? 'Major Arcana' : `${c.card.suit} suit`}) | Orientation: ${c.orientation} | Keywords: ${c.card.keywords.join(', ')}`,
    )
    .join('\n');

  return `Positions (in order):
${positionsText}

Cards drawn (in order):
${cardsText}

${question ? `User's question: ${question}\n` : ''}Return only the JSON object now. Begin with { and end with }.`;
}

export function parseReadingJson(raw: string): ReadingJson {
  let cleaned = raw.trim();
  cleaned = cleaned
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  // Try to find the first { and the last } and extract that substring.
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e: any) {
    throw new Error(`Failed to parse reading JSON: ${e?.message || 'unknown'}`);
  }

  // Defensive shape normalization — accept partial / weird shapes and fill defaults.
  const summary: string =
    typeof parsed.summary === 'string' && parsed.summary.trim()
      ? parsed.summary.trim()
      : 'The cards invite you to pause and listen inward today.';

  let rawInterpretations: any[] = [];
  if (Array.isArray(parsed.positionInterpretations)) {
    rawInterpretations = parsed.positionInterpretations;
  } else if (Array.isArray(parsed.interpretations)) {
    rawInterpretations = parsed.interpretations;
  } else if (Array.isArray(parsed.cards)) {
    rawInterpretations = parsed.cards;
  }

  const positionInterpretations = rawInterpretations
    .filter((p) => p && typeof p === 'object')
    .map((p: any) => ({
      position: typeof p.position === 'string' ? p.position : '',
      card: typeof p.card === 'string' ? p.card : typeof p.name === 'string' ? p.name : '',
      orientation: (p.orientation === 'reversed' ? 'reversed' : 'upright') as 'upright' | 'reversed',
      text: typeof p.text === 'string' ? p.text : typeof p.interpretation === 'string' ? p.interpretation : '',
    }))
    .filter((p) => p.position && p.card && p.text);

  if (positionInterpretations.length === 0) {
    throw new Error('Reading JSON had no usable position interpretations');
  }

  const advice: string =
    typeof parsed.advice === 'string' && parsed.advice.trim()
      ? parsed.advice.trim()
      : 'Trust the small voice. One steady step is worth more than ten scattered ones.';

  return { summary, positionInterpretations, advice };
}

export function fallbackReading(cards: DrawCard[]): ReadingJson {
  return {
    summary: 'The cards invite you to pause and listen inward today. There is movement beneath the surface that wants your attention.',
    positionInterpretations: cards.map((c) => ({
      position: c.position.name,
      card: c.card.name,
      orientation: c.orientation,
      text: `${c.card.name} ${c.orientation === 'reversed' ? 'reversed' : 'upright'} in ${c.position.name} speaks to ${c.card.keywords.slice(0, 2).join(' and ')}. Notice where this shows up today, and let it guide a small, concrete choice.`,
    })),
    advice: 'Trust the small voice. The cards agree: one steady step is worth more than ten scattered ones.',
  };
}
