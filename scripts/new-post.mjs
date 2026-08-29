#!/usr/bin/env node
// Evergreen SEO blog-post generator.
//
// Usage:
//   node scripts/new-post.mjs --topic "The Tower reversed in love" \
//     --image1 ./photo1.jpg --image2 ./photo2.jpg --category "Card Meanings"
//
// Flags:
//   --topic "..."          (required) the post topic / primary keyword
//   --category "..."       (optional) one of CATEGORIES
//   --primary "..."        (optional) override the primary SEO keyword (default = topic)
//   --secondary "a, b, c"  (optional) comma-separated secondary keywords
//   --image1 <path>        (optional) first image; copied to public/assets/blog/<slug>/01.<ext>
//   --image2 <path>        (optional) second image; copied to public/assets/blog/<slug>/02.<ext>
//   --date YYYY-MM-DD      (optional) post date (default: today UTC)
//   --publish              (optional) skip draft mode
//   --commit               (optional) git add + commit + push
//   -h, --help

import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { chatJson } from './lib/openrouter.mjs';
import { buildEvergreenPrompt } from './lib/blog-prompts.mjs';
import {
  BLOG_DIR,
  BLOG_ASSETS_DIR,
  OPENROUTER,
  CATEGORIES,
  EVERGREEN_DRAFT_DEFAULT,
} from './lib/blog-config.mjs';
import {
  buildFrontmatter,
  countExternalLinks,
  countInternalLinks,
  ensureDir,
  fileExists,
  listBlogSlugs,
  slugify,
  todayUtcDateStr,
  validateGeneratedPost,
  wordCount,
  writeFile,
} from './lib/blog-utils.mjs';

function parseArgs(argv) {
  const args = {
    topic: null,
    category: null,
    primary: null,
    secondary: [],
    image1: null,
    image2: null,
    date: null,
    publish: false,
    commit: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--topic') args.topic = argv[++i];
    else if (a === '--category') args.category = argv[++i];
    else if (a === '--primary') args.primary = argv[++i];
    else if (a === '--secondary') args.secondary = String(argv[++i]).split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--image1') args.image1 = argv[++i];
    else if (a === '--image2') args.image2 = argv[++i];
    else if (a === '--date') args.date = argv[++i];
    else if (a === '--publish') args.publish = true;
    else if (a === '--commit') args.commit = true;
    else if (a === '--help' || a === '-h') {
      printHelp();
      process.exit(0);
    }
  }
  return args;
}

function printHelp() {
  console.log(`Usage:
  node scripts/new-post.mjs --topic "..." [--image1 ... --image2 ...] [--category ...]

Required:
  --topic "..."               the post topic / primary keyword

Optional:
  --category "..."            one of: ${CATEGORIES.join(' | ')}
  --primary "..."             override the primary SEO keyword
  --secondary "a, b, c"       comma-separated secondary keywords
  --image1 <path>             first image (copied into the post)
  --image2 <path>             second image
  --date YYYY-MM-DD           post date (default: today UTC)
  --publish                   skip draft mode
  --commit                    git add + commit + push
  -h, --help                  show this help
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

function copyImage(srcPath, destPath) {
  if (!fileExists(srcPath)) {
    throw new Error(`Image not found: ${srcPath}`);
  }
  ensureDir(path.dirname(destPath));
  fs.copyFileSync(srcPath, destPath);
  return path.relative(path.join(process.cwd(), 'public'), destPath).replace(/\\/g, '/');
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.topic) {
    printHelp();
    throw new Error('--topic is required');
  }
  if (args.category && !CATEGORIES.includes(args.category)) {
    throw new Error(`--category must be one of: ${CATEGORIES.join(', ')}`);
  }

  const date = args.date || todayUtcDateStr();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Invalid --date: ${date}`);
  }
  const slug = slugify(args.primary || args.topic);
  if (!slug) throw new Error('Could not derive a slug from the topic.');
  const outPath = path.join(BLOG_DIR, `${slug}.md`);

  console.log(`→ Topic: ${args.topic}`);
  console.log(`→ Slug: ${slug}`);
  console.log(`→ Date: ${date}`);
  console.log(`→ Output: ${outPath}`);

  if (fileExists(outPath)) {
    throw new Error(`File already exists: ${outPath}. Pick a different --primary or --topic.`);
  }

  // Copy images first so we can reference them.
  const imageRel = [];
  for (let i = 0; i < 2; i++) {
    const src = i === 0 ? args.image1 : args.image2;
    if (!src) continue;
    const ext = path.extname(src).toLowerCase() || '.jpg';
    const destAbs = path.join(BLOG_ASSETS_DIR, slug, `${String(i + 1).padStart(2, '0')}${ext}`);
    const rel = copyImage(src, destAbs);
    imageRel.push(rel);
    console.log(`✓ Copied ${src} → /${rel}`);
  }

  const { system, user } = buildEvergreenPrompt({
    topic: args.topic,
    category: args.category,
    primaryKeyword: args.primary || args.topic,
    secondaryKeywords: args.secondary,
  });

  console.log(`→ Calling OpenRouter (${OPENROUTER.evergreenModel})...`);
  const { parsed, usage } = await chatJson({
    model: OPENROUTER.evergreenModel,
    system,
    user,
    maxTokens: OPENROUTER.maxTokens + 400,
  });

  // Weave images in: place the first image after the lead, the second before "Common mistakes".
  let body = parsed.body || '';
  if (imageRel[0]) {
    const firstHeading = body.indexOf('\n## ');
    if (firstHeading !== -1) {
      body = body.slice(0, firstHeading) + `\n\n![${parsed.title}](/${imageRel[0]})\n` + body.slice(firstHeading);
    } else {
      body = `${body}\n\n![${parsed.title}](/${imageRel[0]})\n`;
    }
  }
  if (imageRel[1]) {
    const mistakesIdx = body.indexOf('\n## Common mistakes');
    if (mistakesIdx !== -1) {
      body = body.slice(0, mistakesIdx) + `\n\n![Illustration](/${imageRel[1]})\n` + body.slice(mistakesIdx);
    } else {
      body = `${body}\n\n![Illustration](/${imageRel[1]})\n`;
    }
  }

  const draft = args.publish ? false : EVERGREEN_DRAFT_DEFAULT;
  const category = args.category || parsed.category;

  const validation = validateGeneratedPost({
    kind: 'evergreen',
    title: parsed.title,
    description: parsed.description,
    body,
    category,
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
      category,
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
    category,
    draft,
  }) + body;

  writeFile(outPath, file);
  console.log(`✓ Wrote ${outPath}`);

  if (args.commit) {
    if (!isGitRepo()) {
      throw new Error('--commit passed but this is not a git repository.');
    }
    const files = [outPath, ...imageRel.map((p) => path.join('public', p))];
    const message = `chore(blog): ${parsed.title}`;
    gitCommitAndPush(message, files);
    console.log('✓ Committed and pushed. Cloudflare Pages will redeploy via the existing workflow.');
  } else {
    console.log('Dry run. Re-run with --commit to push, or edit the file then commit manually.');
  }
}

main().catch((err) => {
  console.error(err.stack || err.message || err);
  process.exit(1);
});

