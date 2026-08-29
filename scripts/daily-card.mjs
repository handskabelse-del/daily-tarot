#!/usr/bin/env node
// Daily Card of the Day blog-post generator.
//
// Usage:
//   node scripts/daily-card.mjs                     # generate for today (dry-run by default)
//   node scripts/daily-card.mjs --date 2026-02-14   # generate for a specific date
//   node scripts/daily-card.mjs --commit            # actually git add + commit + push
//   node scripts/daily-card.mjs --publish           # override draft mode for this run
//   node scripts/daily-card.mjs --draft             # force draft mode for this run

import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { chatJson } from './lib/openrouter.mjs';
import { buildDailyCardPrompt } from './lib/blog-prompts.mjs';
import {
  BLOG_DIR,
  OPENROUTER,
  DAILY_DRAFT_COUNT,
  DAILY_IMAGES,
} from './lib/blog-config.mjs';
import {
  buildFrontmatter,
  cardAssetPath,
  cardMeaningSlug,
  countExternalLinks,
  countInternalLinks,
  dateLabelEn,
  deterministicDrawForDate,
  fileExists,
  slugify,
  todayUtcDateStr,
  validateGeneratedPost,
  wordCount,
  writeFile,
} from './lib/blog-utils.mjs';

function parseArgs(argv) {
  const args = { date: null, commit: false, publish: false, draft: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--date') args.date = argv[++i];
    else if (a === '--commit') args.commit = true;
    else if (a === '--publish') args.publish = true;
    else if (a === '--draft') args.draft = true;
    else if (a === '--help' || a === '-h') {
      printHelp();
      process.exit(0);
    }
  }
  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/daily-card.mjs [options]

Options:
  --date YYYY-MM-DD   Generate for a specific date (default: today UTC)
  --commit            git add + commit + push (default: dry-run, file only)
  --publish           Override draft mode and publish immediately
  --draft             Force draft mode (post is saved as draft: true)
  -h, --help          Show this help

Environment:
  OPENROUTER_DEFAULT_KEY   required
  OPENROUTER_MODEL         override model id (default: openrouter/auto)
  DAILY_DRAFT_COUNT        days to keep as draft (default: 7)
  GIT_AUTHOR_NAME          used in the auto-commit (default: Daily Tarot Bot)
  GIT_AUTHOR_EMAIL         used in the auto-commit (default: bot@dailytarot.local)
`);
}

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (res.status !== 0) {
    throw new Error(`Command failed (${res.status}): ${cmd} ${args.join(' ')}`);
  }
  return res;
}

function isGitRepo() {
  const res = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { encoding: 'utf8' });
  return res.status === 0;
}

function gitCommitAndPush(message, files) {
  run('git', ['config', 'user.name', process.env.GIT_AUTHOR_NAME || 'Daily Tarot Bot']);
  run('git', ['config', 'user.email', process.env.GIT_AUTHOR_EMAIL || 'bot@dailytarot.local']);
  run('git', ['add', ...files]);
  const status = spawnSync('git', ['diff', '--cached', '--name-only'], { encoding: 'utf8' });
  if (!status.stdout || !status.stdout.trim()) {
    console.log('Nothing to commit (file already present).');
    return;
  }
  run('git', ['commit', '-m', message]);
  run('git', ['push']);
}

async function main() {
  const args = parseArgs(process.argv);
  const date = args.date || todayUtcDateStr();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Invalid --date: ${date}`);
  }
  const draw = deterministicDrawForDate(date);
  const first = draw[0];
  const card = first.card;
  const orientation = first.orientation;
  const dateLabel = dateLabelEn(date);
  const slug = `daily-${date}-${slugify(card.name)}`;
  const outPath = path.join(BLOG_DIR, `${slug}.md`);

  console.log(`→ Card of the day for ${dateLabel}: ${card.name} (${orientation})`);
  console.log(`→ Output: ${outPath}`);

  if (fileExists(outPath) && !args.commit) {
    console.log('File already exists. Pass --commit to re-run with overwrite, or pick another date.');
    return;
  }

  const { system, user } = buildDailyCardPrompt({
    card,
    orientation,
    dateLabel,
    date,
    cardMeaningSlug: cardMeaningSlug(card),
  });

  console.log(`→ Calling OpenRouter (${OPENROUTER.dailyModel})...`);
  const { parsed, usage } = await chatJson({
    model: OPENROUTER.dailyModel,
    system,
    user,
    maxTokens: OPENROUTER.maxTokens,
  });

  let draft;
  if (args.publish) draft = false;
  else if (args.draft) draft = true;
  else {
    const existing = fs.existsSync(BLOG_DIR)
      ? fs.readdirSync(BLOG_DIR).filter((f) => f.startsWith('daily-') && f.endsWith('.md'))
      : [];
    draft = existing.length < DAILY_DRAFT_COUNT;
  }

  const cardImg = cardAssetPath(card);
  const heroAssetPath = DAILY_IMAGES.heroAsset;

  const heroBlock = [
    `![${card.name} tarot card](${cardImg})`,
    '',
    `*Card of the day for ${dateLabel}.*`,
    '',
  ].join('\n');

  let body = parsed.body || '';
  if (!body.includes(heroAssetPath)) {
    body = `${heroBlock}${body}\n\n![Daily tarot — pull a card](${heroAssetPath})\n`;
  }

  const validation = validateGeneratedPost({
    kind: 'daily',
    title: parsed.title,
    description: parsed.description,
    body,
    category: parsed.category,
  });

  console.log(`→ Word count: ${wordCount(body)}`);
  console.log(`→ Internal links: ${countInternalLinks(body)}`);
  console.log(`→ External links: ${countExternalLinks(body)} (must be 0)`);
  console.log(`→ Draft: ${draft}`);
  if (usage) {
    console.log(`→ Token usage: prompt=${usage.prompt_tokens ?? '?'} completion=${usage.completion_tokens ?? '?'} total=${usage.total_tokens ?? '?'}`);
  }

  if (!validation.ok) {
    console.error('Validation FAILED:');
    for (const e of validation.errors) console.error('  - ' + e);
    writeFile(outPath, buildFrontmatter({
      title: parsed.title,
      description: parsed.description,
      date,
      category: parsed.category,
      draft: true,
    }) + body);
    console.error(`Wrote file (as draft) for inspection: ${outPath}`);
    process.exitCode = 1;
    return;
  }

  const file = buildFrontmatter({
    title: parsed.title,
    description: parsed.description,
    date,
    category: parsed.category,
    draft,
  }) + body;

  writeFile(outPath, file);
  console.log(`✓ Wrote ${outPath}`);

  if (args.commit) {
    if (!isGitRepo()) {
      throw new Error('--commit passed but this is not a git repository.');
    }
    const message = `chore(blog): daily card of the day for ${date} — ${card.name} ${orientation}`;
    gitCommitAndPush(message, [outPath]);
    console.log('✓ Committed and pushed. Cloudflare Pages will redeploy via the existing workflow.');
  } else {
    console.log('Dry run. Re-run with --commit to push, or edit the file then commit manually.');
  }
}

main().catch((err) => {
  console.error(err.stack || err.message || err);
  process.exit(1);
});

