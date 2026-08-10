# FMP API Reference & Known Limitations

> Financial Modeling Prep (FMP) — `https://financialmodelingprep.com/stable`
> Plan: **Starter** ($19/mo, 300 calls/min)

---

## Endpoints Used

### 1. Market Cap & Price (Bulk)

| Endpoint | Usage | Notes |
|---|---|---|
| `GET /company-screener` | All US stocks in ~9 pages (1000/page) | Used by `fmp-updater.js` Step 1 |
| `GET /historical-market-capitalization` | Per-ticker historical caps | Used by `fmp-enrich.js` |
| `GET /profile` | Per-ticker price, mktCap, IPO date, exchange | Used by `fmp-enrich.js`, `scoring.ts` |

**Screener query params:**
```
?marketCapLowerThan=100000000000000&country=US
 &isActivelyTrading=true&isEtf=false&isFund=false
 &limit=1000&page={0..8}
```

### 2. Analyst & Institutional Data

| Endpoint | Usage |
|---|---|
| `GET /analyst-estimates` | Analyst coverage count |
| `GET /institutional-ownership/symbol-positions-summary` | Institution investors, shares, change |
| `GET /grades-consensus` | Buy/hold/sell breakdown |
| `GET /stock-peers` | Peer companies by sector & cap |

### 3. Shares & Valuation

| Endpoint | What it returns | Caveat |
|---|---|---|
| `GET /shares-float` | `outstandingShares`, `floatShares`, `freeFloat` | **Only Class A** for dual-class stocks |
| `GET /enterprise-values` | `marketCapitalization`, `numberOfShares` | **Only Class A** |
| `GET /income-statement` | `weightedAverageShsOut`, `weightedAverageShsOutDil` | **Only Class A** |
| `GET /key-metrics-ttm` | `marketCap`, enterprise value ratios | **Only Class A** |

### 4. Historical Prices

| Endpoint | Usage |
|---|---|
| `GET /historical-price-eod/light` | 30-day prices for price-reaction scoring |

---

## 🚨 Known Limitations

### 1. Dual-Class / SPAC Market Cap Undercount (CRITICAL)

**Every FMP endpoint returns only Class A shares** for dual-class companies.

| Company | Ticker | FMP Market Cap | True Market Cap | Classes |
|---|---|---|---|---|
| X-Energy | XE | $452M (19.9M Class A) | ~$9.2B (406M total) | A + B |
| CoreWeave | CRWV | $49.5B (546M Class A) | Correct (single class) | A only |
| Zillow Group | ZG | $8.2B (241M Class A) | Correct (separate listing) | A |

**Detection pattern:** FMP's `company-screener` companyName includes `"Class A Common Stock"` for dual-class stocks. Our `fmp-updater.js` flags any ticker with this pattern + < 100M implied shares.

**Resolution:** `scripts/sec-shares-v2.js` attempts SEC EDGAR auto-resolution:
1. SEC XBRL `EntityCommonStockSharesOutstanding` (post-10-K, most reliable)
2. SEC S-1 filing text extraction (post-IPO)
3. FMP `shares-float` as fallback (only if `freeFloat` ≤ 100%)

**Companies that filed only 10-Q (not 10-K) after IPO will NOT have XBRL share data yet.** Example: X-Energy (IPO April 2026, no 10-K filed).

### 2. Foreign Currency Market Caps

FMP's `company-screener` with `country=US` includes ADRs. ADR market caps are in **local currency** (JPY, INR), not USD.

| Ticker | Screener Cap | Reality |
|---|---|---|
| MUFG | $39.6T | ~$145B USD (JPY) |
| TM | $34.5T | ~$330B USD (JPY) |
| HDB | $11.4T | ~$135B USD (INR) |

**Fix:** `fmp-updater.js` rejects caps > $3T (impossible for any US-listed company).

### 3. Screener Excludes Recent IPOs

FMP's `company-screener` has a delay before new IPOs appear. XE (IPO April 2026) was NOT in the screener but WAS in `historical-market-capitalization` and `profile`. This is why `fmp-enrich.js` uses the historical endpoint.

### 4. Free Float > 100%

Some stocks report `freeFloat` > 100% in `shares-float` (e.g., XE: 782%). This signals corrupted float data — our system rejects these.

---

## Our Pipeline Architecture

```
fmp-updater.js (daily)
  │
  ├─ Step 1: company-screener → index by symbol (~9 API calls)
  │     Filter: cap ≤ $3T (kill foreign currency), skip "mc_manual"
  │
  ├─ Step 2: Batch UPDATE valid caps
  │     ≤200 rows per SQL query (CASE-based)
  │     Dual-class detector: <1M implied shares OR "Class A" name + <100M shares
  │
  ├─ Step 2b: Auto-resolve flagged caps
  │     SEC XBRL → SEC S-1 text → FMP float
  │     Unresolved → NULL + mc_review flag
  │
  └─ Step 3: Enrich published opportunities
        analyst-estimates + institutional-ownership + consensus + peers
        Saved to securities.attributes JSONB

fmp-enrich.js (on-demand)
  └─ Per-opportunity: historical-market-capitalization + profile
     Only targets NULL or < $10K caps
     Skips mc_manual flagged

scoring.ts (per-opportunity)
  └─ DB-first: reads securities.attributes (analyst count, institution data)
     API fallback: analyst-estimates + institutional-ownership
     Price reaction: historical-price-eod/light near event date
```

---

## Manual Override

For stocks where auto-resolution fails, set manually via SQL:

```sql
UPDATE securities
SET market_cap = 9200000000,          -- $9.2B
    attributes = COALESCE(attributes, '{}'::jsonb) || '{"mc_manual": true}'::jsonb,
    updated_at = NOW()
WHERE ticker = 'XE';
```

The `mc_manual: true` flag permanently excludes the security from all FMP auto-updates.
