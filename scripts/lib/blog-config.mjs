// Single source of truth for the blog/card-of-the-day generator.
// Edit values here; both scripts and the GitHub Actions workflows read from this file.

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..', '..');

export const BLOG_DIR = path.join(ROOT, 'src', 'content', 'blog');
export const BLOG_ASSETS_DIR = path.join(ROOT, 'public', 'assets', 'blog');

// OpenRouter. Reuses the same secret the reading API uses (OPENROUTER_DEFAULT_KEY).
// Free default is "openrouter/auto" which routes to the best free model.
export const OPENROUTER = {
  url: 'https://openrouter.ai/api/v1/chat/completions',
  apiKey: process.env.OPENROUTER_DEFAULT_KEY || process.env.OPENROUTER_API_KEY || '',
  // Free defaults; override with OPENROUTER_MODEL env var.
  dailyModel: process.env.OPENROUTER_MODEL || 'openrouter/auto',
  evergreenModel: process.env.OPENROUTER_MODEL || 'openrouter/auto',
  // Site URL + title are required by OpenRouter for attribution.
  siteUrl: process.env.SITE_URL || 'https://dailytarot.example.com',
  siteName: 'Daily Tarot',
  // Keep the response cheap. Free models are rate-limited per minute.
  // 4000 leaves enough headroom for reasoning-capable models to both think
  // and produce visible content.
  maxTokens: 4000,
  temperature: 0.7,
  timeoutMs: 90_000,
};

// First N daily-card posts are queued as drafts. After that, auto-publish.
// Set to 0 in env to publish from day 1.
export const DAILY_DRAFT_COUNT = Number(process.env.DAILY_DRAFT_COUNT || 7);
// Evergreen posts always default to draft unless --publish is passed.
export const EVERGREEN_DRAFT_DEFAULT = true;

// Voice and content safety. Any generated post that contains a blocklisted
// phrase fails validation and is written to disk but NOT committed.
export const BLOCKLIST = [
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

// Word-count windows. Generator rejects outputs outside the band.
export const LIMITS = {
  daily: { minWords: 450, maxWords: 1000 },
  evergreen: { minWords: 700, maxWords: 1100 },
};

// Internal-link contracts. Every generated post MUST contain at least
// `minInternalLinks` of these anchors (we check the href, not the anchor text).
export const INTERNAL_LINKS = {
  minDaily: 2,
  minEvergreen: 3,
  // Allowed hosts/paths. The generator is told to use only these.
  allowed: [
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
  ],
};

// Daily card image plan. The first image is always the card art
// (already shipped in public/assets/cards/). The second is a hero.
export const DAILY_IMAGES = {
  cardAsset: (cardFile) => `/assets/cards/${cardFile}`,
  heroAsset: '/assets/witch.png',
};

// Allowed categories for evergreen posts. The LLM is told to choose one.
export const CATEGORIES = [
  'Card Meanings',
  'Spreads',
  'Daily Practice',
  'Tarot for Life',
  'Beginner',
];
