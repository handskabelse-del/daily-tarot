// Pure helpers shared by both CLI scripts. No side effects.

import fs from 'node:fs';
import path from 'node:path';
import { BLOCKLIST, BLOG_DIR, INTERNAL_LINKS, ROOT } from './blog-config.mjs';

// Load the canonical deck + image map directly from the JSON + filesystem so
// we never have to import the Astro/TS sources from Node.
const CARDS_JSON = path.join(ROOT, 'src', 'content', 'cards.json');
const CARDS_DIR = path.join(ROOT, 'public', 'assets', 'cards');
const _cardsData = JSON.parse(fs.readFileSync(CARDS_JSON, 'utf8'));
export const DECK = _cardsData.deck;

let _cardFilesCache = null;
function listCardFiles() {
  if (_cardFilesCache) return _cardFilesCache;
  try {
    _cardFilesCache = fs.readdirSync(CARDS_DIR);
  } catch {
    _cardFilesCache = [];
  }
  return _cardFilesCache;
}

function findCardFile(card) {
  const files = listCardFiles();
  const target = card.name.toLowerCase().replace(/^the\s+/, '').replace(/[^a-z0-9]+/g, '-');
  // Prefer a file that starts with the card number (e.g. "0-The-Fool.jfif" or "2c-Two of Cups.jfif").
  const candidates = files.filter((f) => {
    const base = f.toLowerCase().replace(/\.jfif$/, '');
    // For majors 0-9 the on-disk pattern is "N-the-name".
    if (card.arcana === 'major' && card.number <= 9) {
      return base.startsWith(`${card.number}-`) || base.includes(target);
    }
    // For minor number cards: "Nc-name".
    if (card.arcana === 'minor' && card.number >= 1 && card.number <= 10) {
      return base.startsWith(`${card.number}c-`) || base.includes(target);
    }
    // Court cards: just match the name.
    return base.includes(target);
  });
  // Prefer the more specific match.
  candidates.sort((a, b) => a.length - b.length);
  return candidates[0] || null;
}

export function cardAssetPath(card) {
  const f = findCardFile(card);
  if (!f) return '/assets/witch.png'; // safe fallback
  return `/assets/cards/${f}`;
}

// Local copy of the deterministic 9-card draw, ported from src/lib/draw.ts so
// the script doesn't have to import Astro/TS modules. Same algorithm.
const POSITIONS = [
  { index: 1, name: 'The Present' },
  { index: 2, name: 'The Challenge' },
  { index: 3, name: 'The Foundation' },
  { index: 4, name: 'The Recent Past' },
  { index: 5, name: 'The Crown' },
  { index: 6, name: 'The Near Future' },
  { index: 7, name: 'The Self' },
  { index: 8, name: 'The Environment' },
  { index: 9, name: 'The Outcome' },
];

export function deterministicDrawForDate(seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const rand = () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const idx = [...Array(DECK.length).keys()];
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx.slice(0, 9).map((deckIdx, i) => {
    const card = DECK[deckIdx];
    const reversed = rand() < 0.5;
    return {
      id: card.id,
      card,
      position: POSITIONS[i],
      orientation: reversed ? 'reversed' : 'upright',
    };
  });
}

export function cardMeaningSlug(card) {
  // tarot-card-meanings/[slug].astro uses the kebab-case name (without leading "the ").
  // Defensive match against the 78 known pages.
  return card.name
    .toLowerCase()
    .replace(/^the /, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function todayUtcDateStr() {
  const t = new Date();
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()))
    .toISOString()
    .slice(0, 10);
}

export function dateLabelEn(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);
}

export function wordCount(s) {
  return String(s || '').trim().split(/\s+/).filter(Boolean).length;
}

export function countInternalLinks(markdown) {
  if (!markdown) return 0;
  const matches = markdown.match(/\]\((\/[^)]+)\)/g) || [];
  const internal = matches
    .map((m) => m.slice(2, -1).split('#')[0]) // strip hash
    .filter((href) => href.startsWith('/'));
  // Only count allowed paths so the LLM can't pad the count with junk.
  return internal.filter((href) => INTERNAL_LINKS.allowed.includes(href)).length;
}

export function countExternalLinks(markdown) {
  if (!markdown) return 0;
  const matches = markdown.match(/\]\((https?:\/\/[^)]+)\)/g) || [];
  return matches.length;
}

/**
 * @returns {{ ok: true } | { ok: false, errors: string[] }}
 */
export function validateGeneratedPost({ kind, title, description, body, category }) {
  const errors = [];
  const min = kind === 'daily' ? 2 : 3;

  if (!title || title.length < 30 || title.length > 80) {
    errors.push(`title length out of range: ${(title || '').length} chars (want 30-80)`);
  }
  if (!description || description.length < 100 || description.length > 180) {
    errors.push(`description length out of range: ${(description || '').length} chars (want 100-180)`);
  }
  if (!category) {
    errors.push('category missing');
  }
  if (!body) {
    errors.push('body missing');
  } else {
    const wc = wordCount(body);
    if (kind === 'daily' && (wc < 450 || wc > 1000)) {
      errors.push(`daily body word count out of range: ${wc} (want 450-1000)`);
    }
    if (kind === 'evergreen' && (wc < 700 || wc > 1100)) {
      errors.push(`evergreen body word count out of range: ${wc} (want 700-1100)`);
    }
    if (countInternalLinks(body) < min) {
      errors.push(`not enough internal links: have ${countInternalLinks(body)}, need at least ${min}`);
    }
    if (countExternalLinks(body) > 0) {
      errors.push(`external links not allowed: ${countExternalLinks(body)} found`);
    }
    const lower = body.toLowerCase();
    for (const phrase of BLOCKLIST) {
      if (lower.includes(phrase)) {
        errors.push(`blocklist phrase found: "${phrase}"`);
      }
    }
  }
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

export function yamlEscape(s) {
  // Wrap in double quotes, escape backslashes and double quotes.
  return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

export function buildFrontmatter({ title, description, date, category, draft }) {
  return [
    '---',
    `title: ${yamlEscape(title)}`,
    `description: ${yamlEscape(description)}`,
    `date: ${date}`,
    `category: ${yamlEscape(category)}`,
    `author: "Daily Tarot"`,
    `draft: ${draft ? 'true' : 'false'}`,
    '---',
    '',
  ].join('\n');
}

export function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

export function fileExists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

export function readFile(p) {
  return fs.readFileSync(p, 'utf8');
}

export function writeFile(p, content) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, content, 'utf8');
}

export function listBlogSlugs() {
  if (!fs.existsSync(BLOG_DIR)) return [];
  return fs
    .readdirSync(BLOG_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.replace(/\.md$/, ''));
}
