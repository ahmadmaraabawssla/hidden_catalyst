# Hidden Catalyst — Project Status

> Last updated: 2026-08-11

**DeepSeek model:** `deepseek-chat`, key `sk-c5135050d24745d09b7c2829db101716`

---

## Architecture Overview

```
SEC EDGAR (filings) ──┐
FMP (market data) ────┼──► daily-top20.js ──► DeepSeek AI ──► PostgreSQL ──► Next.js (SSR)
GitHub Actions cron ──┘         │                                     │
                          00:01 Israel daily                    localhost:3000
```

**Tech stack:** Next.js 14 (App Router), PostgreSQL (Supabase), Prisma, pnpm monorepo, DeepSeek AI, FMP Starter ($19/mo), GitHub Actions

---

## What's Built

### Core Intelligence

| Feature | Status | Location |
|---|---|---|
| Two-pass LLM extraction (facts → hidden angle) | ✅ v2.1 | `packages/engine/src/llm-extractor.js` |
| Industry profiles (BDC, Bank, Biotech, SaaS, Industrial, General) | ✅ | `packages/engine/src/llm-extractor.js` |
| Qualification gate (REJECTED/WATCH/CANDIDATE/VERIFIED) | ✅ | `scripts/daily-top20.js` |
| Company Attention + Catalyst Attention scores | ✅ | `scripts/daily-top20.js` |
| Hidden angle storage with evidence/confidence | ✅ | `opportunities.hidden_angle` (JSONB) |
| Verification confidence: ≥0.85 verified, 0.7-0.85 candidate, <0.7 watch | ✅ | `llm-extractor.js` |
| Contradiction search | ✅ | LLM prompt + `risks` table (type: contradiction) |
| What-to-watch with specific thresholds & contract terms | ✅ v2.1 | LLM prompt + `invalidation_rules` table |
| Insight titles from LLM (one-line discovery summary) | ✅ v4d | `llm-extractor.js` |
| Company context enrichment (recent 8-K history) | ✅ v4b | `daily-top20.js` |
| Cross-Document Resolution engine (CDR) | ✅ v4a | `packages/engine/src/cdr.js` |
| Term extractor (minimum price, commitment fee, etc.) | ✅ v4a | `packages/engine/src/term-extractor.js` |
| Rejection rate ~60% (11/20 rejected in latest run) | ✅ | Pipeline verified |

### Market Data

| Feature | Status | Location |
|---|---|---|
| FMP screener ingestion (8,700+ stocks, 9 API calls) | ✅ | `scripts/fmp-updater.js` |
| Dual-class detection (Class A + < 100M shares) | ✅ | `scripts/fmp-updater.js` |
| SEC S-1 share resolver (Class A+B post-offering) | ✅ | `scripts/sec-shares-v2.js` |
| Post-merger stale cap correction (15-50% diff) | ✅ | `scripts/fmp-updater.js` Step 2 |
| Foreign currency filter (>$3T = non-USD) | ✅ | `scripts/fmp-updater.js` |
| Manual override protection (`mc_manual` flag) | ✅ | `securities.attributes` JSONB |
| FMP 1D/5D/20D returns on detail page | ✅ v4c | `apps/web/src/app/opportunities/[id]/page.tsx` |

### Frontend

| Feature | Status | Location |
|---|---|---|
| Opportunity Feed (21 opps, compact cards, 10s scan) | ✅ | `apps/web/src/app/feed/page.tsx` |
| Opportunity Detail (PRD hierarchy with market context) | ✅ v3 | `apps/web/src/app/opportunities/[id]/page.tsx` |
| ScoreDrilldown (expandable sub-scores) | ✅ | `packages/ui/src/ScoreDrilldown.tsx` |
| Admin Dashboard with Run Discovery button | ✅ | `apps/web/src/app/admin/` |
| Run Discovery with custom filters (POST /api/admin/run-discovery) | ✅ | `apps/web/src/app/api/admin/run-discovery/` |
| Company page | ✅ | `apps/web/src/app/companies/[ticker]/` |
| Methodology page | ✅ | `apps/web/src/app/methodology/` |

### Automation

| Feature | Status | Location |
|---|---|---|
| GitHub Actions daily cron (00:01 Israel) | ✅ | `.github/workflows/daily-pipeline.yml` |
| Autopilot v2 (local scheduler) | ✅ | `scripts/autopilot.js` |
| Market cap refresh (fmp-updater.js) | ✅ | Step in daily pipeline |
| Discovery pipeline (daily-top20.js) | ✅ | Step in daily pipeline |

---

## Gaps (Not Yet Built)

### P1 — High Priority

| Feature | Why it matters | Effort |
|---|---|---|
| CDR exhibit download (EX-10.x from 8-K) | CDR finds the filing but can't download actual agreement exhibits | Small — parse EX-10 refs, download linked files |
| Compute Price Reaction from FMP historical data | Currently uses LLM estimate or null, need real market data | Small — `fmpGet(/historical-price-eod/light)` exists |
| Hierarchical comparable matching (Level 1-4) | Better historical context for users | Medium — needs DB + matching engine |
| GitHub Actions DEEPSEEK_API_KEY secret | Daily cron won't work without correct key | Trivial — user action |

### P2 — Medium Priority

| Feature | Why it matters | Effort |
|---|---|---|
| Sector-adjusted returns | Better "Not Priced In" evidence | Medium — needs sector ETF data |
| Filing day price reaction auto-computation | Store actual 1D/5D/20D returns at opportunity creation | Small — wire FMP into daily-top20 |
| Relationship graph expansion | Supplier/customer/partner discovery | Large — needs LLM + SEC cross-referencing |
| Feed mobile optimization | Feed cards need responsive pass | Small |
| Empty states for rejected/watch opportunities | 40% of opps are rejected — should show in admin | Small |
| Score confidence penalties for missing data | Show users when scores are uncertain | Medium |

### P3 — Nice to Have

| Feature | Why it matters | Effort |
|---|---|---|
| Social/news attention APIs | Real "catalyst attention" measurement | Medium — needs API keys |
| Thesis monitoring alerts | Users get notified when thesis confirms/invalidates | Large — needs notification system |
| Second-order beneficiary detection | Find companies indirectly affected by catalysts | Large — needs complex LLM chains |
| Options/IV reaction data | Better "Not Priced In" signal | Medium — needs options data API |
| Export to PDF/research note | Users can save/share opportunities | Small |
| Email digests | Daily/weekly summary to subscribers | Medium — needs email service |

---

## Database Schema (Key Changes)

### Opportunities Table
```
verification_status: 'rejected' | 'watch' | 'candidate' | 'verified' | 'monitoring' | 'confirmed' | 'invalidated' | 'stale'
hidden_angle: JSONB { claim, supportingEvidence, reasoning, confidence }
```

### Score Types
```
company_attention  — How followed is the COMPANY generally? (market cap based)
catalyst_attention — How widely known is THIS EVENT? (LLM assessed, inverted)
information_asymmetry — Combined (company + catalyst + 5)
```

---

## Running the Pipeline

```bash
# Full pipeline (market caps + discovery)
node scripts/fmp-updater.js && node scripts/daily-top20.js

# Auto-pilot (scheduled)
node scripts/autopilot.js

# Manual discovery with filters (via admin UI)
http://localhost:3000/admin → "Run Discovery" button
```

## API Keys Required

| Service | Key | Status |
|---|---|---|
| DeepSeek AI | `sk-c5135050d24745d09b7c2829db101716` | ✅ in `.env` |
| FMP | `o2CG0TwWzkqWxU9hz0kb7fW6dCzYXAMx` | ✅ in `.env` |
| Supabase DB | Postgres connection string | ✅ in `.env` |
| GitHub Actions | Same as above, as repo secrets | 🔸 DEEPSEEK key needs update |

---

## Key Decisions Made

1. **Rejection is a feature.** The pipeline rejects routine filings. ~40% qualification rate is healthy.
2. **FMP screener is the default market cap source.** Diluted shares only used for 15-50% discrepancies.
3. **Two-pass LLM is better than one-pass.** Fact extraction and hidden angle assessment are separate concerns.
4. **No manual market cap overrides in code.** `mc_manual` flag in DB protects from script overwrites.
5. **SEC S-1 offering section parsing works** for dual-class IPO stocks (XE resolved to $8.95B).

## Known Data Limitations

1. FMP undercounts Class B shares for dual-class companies (detection exists, auto-resolution partial)
2. REIT OP units inflate diluted share counts (flagged as `mc_manual`)
3. Post-merger share counts can be stale for 30-45 days (auto-detected)
4. No SEC XBRL `EntityCommonStockSharesOutstanding` for recent IPOs (no 10-K filed yet)
5. DeepSeek API key rotation needed periodically
