# Hidden Catalyst — Production Deployment Guide

## Prerequisites

- [ ] **Vercel account** — https://vercel.com (free Hobby plan)
- [ ] **GitHub repository** — push this repo
- [ ] **Supabase project** — already running at `xrfoyckeohsuexoybbxm.supabase.co`
- [ ] **FMP API key** — already configured in `.env`

## Step 1: Push to GitHub

```bash
git add .
git commit -m "Production-ready deployment"
git push origin main
```

## Step 2: Deploy to Vercel

1. Go to https://vercel.com/new
2. Import your GitHub repository
3. Configure:
   - **Framework Preset**: Next.js
   - **Root Directory**: `apps/web`
   - **Build Command**: `cd ../.. && pnpm install --frozen-lockfile && npx prisma generate --schema=packages/db/prisma/schema.prisma && cd apps/web && npx next build`
   - **Output Directory**: `.next`
4. Add Environment Variables (copy from `.env`):
   ```
   DATABASE_URL=postgresql://postgres.xrfoyckeohsuexoybbxm:[PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:5432/postgres
   FMP_API_KEY=<your-fmp-key>
   CRON_SECRET=<your-random-cron-secret>
   ADMIN_SECRET=<your-random-admin-secret>
   NEXT_PUBLIC_APP_URL=https://hidden-catalyst.vercel.app
   ```
5. Click **Deploy**

## Step 3: Enable Cron Jobs

In `apps/web/vercel.json`, we already configured:
```json
"crons": [{ "path": "/api/cron", "schedule": "0 */2 * * *" }]
```

This auto-runs the SEC pipeline every 2 hours. Vercel Hobby includes 1 cron job for free.

## Step 4: Seed Database (one-time)

### Option A: Via Supabase SQL Editor (recommended)
1. Open https://xrfoyckeohsuexoybbxm.supabase.co → SQL Editor
2. Paste `docs/real-discovery-seed.sql` → Run
3. Paste `docs/update-caps.sql` → Run

### Option B: Via local command
```bash
node scripts/run-seed.js
node scripts/fmp-updater.js
```

## Post-Deployment

After deploy, the app is live at `https://hidden-catalyst.vercel.app` (or your custom domain).

### Keep market caps updated

Run locally once per day:
```bash
node scripts/fmp-updater.js
```

(Supabase SQL connection works from anywhere — this updates market caps in the cloud database)

### Admin access

Visit `/admin` — in production, set a real `ADMIN_SECRET` in Vercel env vars and visit with `?token=YOUR_SECRET` or set the cookie.

## Architecture

```
┌─────────────────────────────────────────────┐
│                  Vercel                      │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  │
│  │ Next.js  │  │ API Routes│  │ Cron Jobs │  │
│  │ (SSR)    │  │ /api/*    │  │ /api/cron │  │
│  └──────────┘  └──────────┘  └───────────┘  │
└──────────────────┬──────────────────────────┘
                   │
           ┌───────▼────────┐
           │   Supabase      │
           │  (Frankfurt)    │
           │  PostgreSQL     │
           └────────────────┘
                   │
     ┌─────────────┼─────────────┐
     ▼             ▼             ▼
  FMP           SEC EDGAR      FDA/USPTO
  (market      (filings)      (free APIs)
   caps)
```

## Monthly Cost: **$0**

| Service | Plan | Cost |
|---------|------|------|
| Vercel | Hobby | Free |
| Supabase | Free (500MB DB) | Free |
| FMP | Starter ($19/mo, 300 calls/min) | $19/mo |
| SEC EDGAR | Public API | Free |
| **Total** | | **$19/month** |

## Known Limitations

- **Market caps**: Updated via `fmp-updater.js` (FMP Starter, $19/mo). Run daily or use Vercel Cron.
- **Analyst coverage**: Not available on free APIs. Would need Polygon.io or Refinitiv.
- **Email alerts**: Not wired. Would need Resend (free: 100 emails/day).
- **Authentication**: Deferred. Users see public data only.
- **Database size**: 7,900 companies fit in Supabase free tier (500MB). Monitor and upgrade if needed.
