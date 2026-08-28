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
