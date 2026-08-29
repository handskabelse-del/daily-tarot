# Daily Tarot

A SEO-optimized, free daily tarot reading site. 9-card Celtic-cross-inspired spread, AI-generated interpretations via OpenRouter (server-funded), Google AdSense monetization, hosted on Cloudflare Pages with Git-based deployments.

## Features

- 9-card daily reading with full 78-card Rider–Waite–Smith deck
- Server-funded AI interpretation via OpenRouter (no user key required)
- Up to 2 rejections per day, enforced server-side via Cloudflare KV + signed cookie
- Lock + countdown to local midnight after 2 rejections
- 78 individual card-meaning pages (Major + Minor Arcana)
- /card-of-the-day static page + per-day archive since 2025-01-01
- MDX blog with RSS feed
- English + Spanish + French landing pages
- PWA (installable, offline shell)
- EU-compliant cookie consent banner
- Google AdSense slots (top banner + in-feed after reading)
- Sitemap, robots, hreflang, JSON-LD (WebSite, FAQPage, Article)
- Security headers via Cloudflare Pages `_headers`

## Stack

- **Astro 5** (static + islands)
- **Cloudflare Pages** for hosting + Functions for API
- **Cloudflare KV** for the daily-limit store
- **OpenRouter** for AI interpretations (server-funded key)
- **MDX** for blog
- **TypeScript** strict
- **GitHub Actions** for CI/CD

## Repository layout

```
src/
  components/      # Astro components
  content/         # cards.json + MDX blog
  layouts/         # BaseLayout
  lib/             # cards, draw, prompts, seo, i18n
  pages/           # routes (en + /es + /fr)
  styles/          # global.css
functions/api/     # Cloudflare Pages Functions
public/            # static assets (favicon, sw, manifest, robots, images)
.github/workflows/ # CI/CD
scripts/           # local dev orchestrator
```

## Local development

```bash
npm install
cp .env.example .env           # PUBLIC_GA_ID, PUBLIC_ADSENSE_CLIENT_ID
cp .env.example .dev.vars       # or edit .dev.vars directly with your OpenRouter key

# Build, start wrangler (8788), start astro dev (4321) with /api proxy
npm run dev:full
```

Open **http://localhost:4321** in your browser. Astro proxies `/api/*` to wrangler, so you only use port 4321.

`npm run dev:full` runs `astro build` first, then copies `functions/` into `dist/` so `wrangler pages dev` picks them up.

## Production deployment (one-time setup)

### 1. Create a GitHub repo and push

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USER/daily-tarot.git
git push -u origin main
```

### 2. Create Cloudflare Pages project

Option A — **Direct connect via Cloudflare dashboard** (recommended):
1. Go to https://dash.cloudflare.com → Workers & Pages → Create application → Pages → Connect to Git
2. Select the GitHub repo
3. Build settings:
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Root directory:** (leave blank)
   - **Node version:** 20
4. Save and deploy.

Option B — **Direct upload** (no GitHub needed):
```bash
npm run build
npx wrangler pages deploy ./dist --project-name=daily-tarot
```

### 3. Create the KV namespace

```bash
npx wrangler kv:namespace create DAILY_TAROT_KV
```

Copy the returned `id` into `wrangler.toml` → `[[kv_namespaces]].id`.

Then in the Cloudflare Pages dashboard → Settings → Functions → KV namespace bindings, bind `DAILY_TAROT_KV` to this Pages project.

### 4. Set production secrets

```bash
# Generate a strong cookie secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Set it
npx wrangler secret put COOKIE_SECRET
# paste the hex

npx wrangler secret put OPENROUTER_DEFAULT_KEY
# paste your sk-or-v1-... key (lock it to your domain in openrouter.ai/keys)
```

### 5. Set environment variables in the dashboard

Cloudflare Pages → Settings → Environment variables:
- `SITE_URL` = your production domain
- `READINGS_PAUSED` = `false`
- `OPENROUTER_MODEL` = `nvidia/nemotron-3-5-lightning:free`
- `PUBLIC_GA_ID` (optional)
- `PUBLIC_ADSENSE_CLIENT_ID` (optional)

### 6. Custom domain

Pages project → Custom domains → add your domain. Cloudflare provisions DNS automatically if the domain is on Cloudflare.

### 7. Search Console + AdSense

- Google Search Console: verify ownership, submit `https://yourdomain.com/sitemap-index.xml`.
- AdSense: after launch, request review. Replace placeholder ad-slot IDs in `src/components/AdSlot.astro` with real unit IDs.

## Continuous deployment

The repo includes `.github/workflows/deploy.yml`. On every push to `main`:

1. GitHub Actions runs `npm ci` → `npm run typecheck` → `npm run build`
2. The built `dist/` is deployed to Cloudflare Pages via the official action

To enable:
1. In the Cloudflare dashboard → My Profile → API Tokens → Create Token → template **Edit Cloudflare Pages** (or custom with Pages:Edit + Account:Read)
2. In your GitHub repo → Settings → Secrets and variables → Actions, add:
   - `CLOUDFLARE_API_TOKEN` = the token from step 1
   - `CLOUDFLARE_ACCOUNT_ID` = your account id (right sidebar of the Cloudflare dashboard home)
   - `OPENROUTER_DEFAULT_KEY` = your OpenRouter key (used by the daily-card and new-post workflows)
   - `SITE_URL` (variable) = your production domain (e.g. `https://dailytarot.com`)

## Content generation (LLM → Git → Cloudflare Pages)

Two scripts + two GitHub Actions workflows let the site publish new posts
automatically. The same `OPENROUTER_DEFAULT_KEY` secret the reading API uses
is reused here, so no new secrets are required.

### Daily Card of the Day (auto, 00:05 UTC)

`.github/workflows/daily-card.yml` runs `scripts/daily-card.mjs` every day. It
calls `deterministicDrawForDate(today)` (the same function the static page
uses), calls OpenRouter with a structured prompt, validates the output, and
writes `src/content/blog/daily-YYYY-MM-DD-<card>.md`. The first
`DAILY_DRAFT_COUNT` (default 7) daily posts are saved as `draft: true`; after
that, they auto-publish. The commit triggers the existing `deploy.yml`.

You can also run it locally:

```bash
export OPENROUTER_DEFAULT_KEY=sk-or-v1-...
npm run post:daily            # dry-run, file only
npm run post:daily:commit     # dry-run, but also commit + push
npm run post:daily -- --date 2026-02-14 --publish
```

### Evergreen SEO posts (manual, workflow_dispatch)

`.github/workflows/new-post.yml` exposes a "Run workflow" button in the GitHub
UI. Inputs: `topic` (required), `category`, `primary`, `secondary`,
`image1`, `image2`, `publish`. Locally:

```bash
export OPENROUTER_DEFAULT_KEY=sk-or-v1-...
npm run post:new -- \
  --topic "The Tower reversed in love" \
  --category "Card Meanings" \
  --primary "Tower reversed love meaning" \
  --secondary "tarot tower reversed relationships, tower as feelings" \
  --image1 ./photo1.jpg --image2 ./photo2.jpg \
  --commit
```

Images are copied to `public/assets/blog/<slug>/01.<ext>`, `02.<ext>` and the
markdown is rewritten to point at the new paths.

### Validation and safety rails

Both scripts validate every generated post against these rules before writing:

- `title` length 30–80 chars
- `description` length 100–180 chars
- `category` is one of the allowed list
- daily body 450–1000 words, evergreen body 700–1100 words
- minimum internal links (2 for daily, 3 for evergreen) using only the allowed paths
- zero external links
- no blocklisted mystical cliches ("the universe", "karmic", "soulmate", "destiny", etc.)

If validation fails, the file is still written (as a draft) for inspection, but
nothing is committed and nothing is pushed. The script exits with code 1.

### Tuning

All tunables live in `scripts/lib/blog-config.mjs`:
`OPENROUTER`, `DAILY_DRAFT_COUNT`, `EVERGREEN_DRAFT_DEFAULT`, `BLOCKLIST`,
`LIMITS`, `INTERNAL_LINKS`, `DAILY_IMAGES`, `CATEGORIES`. Override at runtime
with env vars (`OPENROUTER_MODEL`, `DAILY_DRAFT_COUNT`, etc.) without editing
the file.

## Local admin UI

A small browser-based admin lives at **`/admin`** while the dev server is
running. It is for local use only — it writes directly into your checkout
and never pushes to GitHub.

```bash
# In one terminal
export OPENROUTER_DEFAULT_KEY=sk-or-v1-...
npm run dev
# In your browser
open http://localhost:4321/admin
```

### What you can do

| Tab | What it does |
|---|---|
| **New post** | Pick a model from the dropdown (free + paid OpenRouter models, grouped). Type a topic or click ✨ **Suggest 5 topics** to have a fast model propose five. Drag-drop two images (lead + illustration). Hit **Generate post** (or `Ctrl+Enter` in the topic field). The live preview renders with a **validation panel** (word count, title/description length, internal link count, external link count, blocklist hits). Save as draft, publish now, or copy markdown. |
| **Browse & edit** | Lists all posts, filterable by `all` / `drafts` / `published`. Click any post to open a full editor (title / description / category / body / draft toggle). `Ctrl+S` saves. Server re-validates on every save. |
| **Settings** | Shows the live OpenRouter key status, default model, and keyboard shortcuts. |

### What it deliberately does not do

- It does not push to GitHub. You `git add` + `git push` yourself.
- It is not deployed to Cloudflare Pages. The page is `noindex,nofollow` and
  the API routes only run on the dev server (and on Cloudflare Pages if you
  explicitly opt in by setting `OPENROUTER_DEFAULT_KEY` in your Pages
  environment — but the route writes to the local `src/content/blog/` of
  whatever the function is attached to, so it's only useful locally).
- It does not auto-translate posts. The evergreen generator targets English.
- It does not generate images. You paste 2.

### Safety

- The server re-validates every post on save (frontmatter, word count,
  internal links, blocklist). Failed validation returns HTTP 422 and writes
  nothing.
- Image uploads accept `.jpg .jpeg .png .webp .gif .avif`, max 8 MB each.
- Topic suggestions and generated posts use the same voice and safety rules
  as the CLI scripts.

### Files added for the admin

```
src/lib/admin-shared.ts          # shared types, prompt builders, validator, model list
src/lib/admin-server.ts          # server-side OpenRouter client + markdown preview
src/pages/api/admin/generate.ts  # POST: generate a post (no file write)
src/pages/api/admin/suggest-topics.ts  # POST: suggest 5 topics  + GET config
src/pages/api/admin/save.ts      # POST: write MDX + 2 images to disk
src/pages/api/admin/list.ts      # GET: list posts (filterable)
src/pages/api/admin/read.ts      # GET: read raw markdown of a post
src/pages/api/admin/update.ts    # POST: update an existing post
src/pages/admin/index.astro      # the UI
src/styles/admin.css             # admin-only styles
public/admin.js                  # the SPA script
```

The site build adds `@astrojs/cloudflare` as a dev dependency so the build
can produce the on-demand server bundle for the admin routes. The public site
remains fully static.

## Daily rejects and rate limiting

1. `GET /api/limit` — server reads a signed cookie `dt_uid`, looks up `limit:<uid>` in KV, returns `{remaining, day, resetAtIso}`.
2. `POST /api/reading?action=draw` — draws 9 cards, calls OpenRouter with the server key, returns the reading.
3. `POST /api/reading?action=reject` — increments the counter, returns a new draw.
4. After 2 rejections, the server returns HTTP 429 and the UI locks with a countdown to local midnight.

## Operational commands

```bash
npm run typecheck         # astro check (TypeScript + Astro)
npm run build             # static build to dist/
npm run dev:full          # local dev with wrangler + astro
npm run deploy            # build + wrangler pages deploy (requires wrangler login)
```

## Privacy + ToS summary

- No user accounts, no personal data collected.
- The OpenRouter API key lives only in a server secret; users never see it.
- AI-generated interpretations are produced for entertainment and self-reflection only; not medical, legal, or financial advice.
- See `src/pages/privacy.astro` and `src/pages/disclaimer.astro` for full text.

## License

MIT — see `LICENSE`.
