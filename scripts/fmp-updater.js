/**
 * FMP Market Data Updater v3 — Screener + enrichment
 *
 * FMP Starter ($19/mo, 300 calls/min):
 *   company-screener → ALL US stocks (~8 calls)
 *   analyst-estimates → analyst count per opp
 *   institutional-ownership/symbol-positions-summary → institution data
 *   historical-price-eod/light → 30-day prices
 *   grades-consensus → buy/hold/sell breakdown
 *   price-target-consensus → target vs current
 *   stock-peers → peer companies
 *
 * Run: node scripts/fmp-updater.js
 */

const { Client } = require('pg');
const DB = process.env.DATABASE_URL;
const KEY = process.env.FMP_API_KEY;
const FMP = 'https://financialmodelingprep.com/stable';
const SLEEP = ms => new Promise(r => setTimeout(r, ms));
const { resolveTotalShares } = require('./sec-shares-v2');

if (!DB) { console.error('DATABASE_URL required'); process.exit(1); }
if (!KEY) { console.error('FMP_API_KEY required'); process.exit(1); }

async function fmpGet(path, timeout = 8000) {
  try {
    const sep = path.includes('?') ? '&' : '?';
    const res = await fetch(`${FMP}${path}${sep}apikey=${KEY}`, {
      signal: AbortSignal.timeout(timeout),
    });
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

async function main() {
  const client = new Client({ connectionString: DB });
  await client.connect();

  // ═══ STEP 1: COMPANY SCREENER — get ALL US stocks in ~8 calls ═══
  console.log('═══ Step 1: Company Screener (all US stocks) ═══');

  const allProfiles = [];
  for (let page = 0; page < 10; page++) {
    const data = await fmpGet(
      `/company-screener?marketCapLowerThan=100000000000000&country=US&isActivelyTrading=true&isEtf=false&isFund=false&limit=1000&page=${page}`
    );
    if (!data || !Array.isArray(data) || data.length === 0) break;
    allProfiles.push(...data);
    console.log(`  Page ${page}: ${data.length} companies`);
    await SLEEP(200);
  }

  console.log(`  Total: ${allProfiles.length} US stocks\n`);

  // Index by symbol. The screener's country filter is not enough to exclude
  // foreign ordinary shares, whose market cap can be denominated in a local
  // currency. Keep the existing upper-bound guard, but do not use it as a
  // substitute for refreshing previously stored values.
  const bySymbol = new Map();
  for (const p of allProfiles) {
    // Sanity: market caps > $3T are in foreign currency (yen, rupees, etc.)
    // The largest US company by market cap is ~$5T; >$3T for non-megacaps is
    // almost certainly non-USD. We cap at $3T to filter ADRs with JPY/INR caps.
    if (p.symbol && p.marketCap && p.marketCap <= 3_000_000_000_000) {
      bySymbol.set(p.symbol.toUpperCase(), p);
    }
  }

  // ═══ STEP 2: BATCH UPDATE MARKET CAPS ═══
  console.log('═══ Step 2: Update Market Caps ═══');

  const secs = await client.query(`
    SELECT s.id, s.ticker, s.market_cap as old_cap, s.company_id
    FROM securities s
    WHERE s.active = true AND s.exchange IN ('NYSE','NASDAQ','NYSE American')
      AND s.ticker NOT LIKE '%.%'
      AND (s.attributes->>'mc_manual' IS NULL OR s.attributes->>'mc_manual' != 'true')
  `);

  // Match securities against screener data, collect updates.
  // Split into valid (pass dual-class sanity check) and flagged (likely wrong).
  const validUpdates = [];
  const flaggedUpdates = [];

  for (const s of secs.rows) {
    const p = bySymbol.get(s.ticker.toUpperCase());
    if (!p || !p.marketCap) continue;

    // ── Dual‑class / SPAC under‑count detection ──
    // FMP only sees publicly traded Class‑A shares for dual‑class companies.
    // Two signals:
    //  1. Implied shares < 1M → impossible for any US‑listed stock → garbage
    //  2. "Class A" in companyName + < 100M implied shares → likely missing Class B/C
    //     (Contrast: ZG has "Class A" + 241M shares → separate class, cap is correct)
    const impliedShares = p.price > 0
      ? Math.round(p.marketCap / p.price)
      : 0;

    const hasClassAInName = (p.companyName || '').toLowerCase().includes('class a');
    const isSuspicious =
      impliedShares < 1_000_000
      || (hasClassAInName && impliedShares < 100_000_000);

    const entry = {
      id: s.id,
      ticker: s.ticker,
      companyName: p.companyName || '',
      marketCap: p.marketCap,
      price: p.price || 0,
      volume: (p.volume || 0) * (p.price || 0),
      sector: p.sector || null,
      industry: p.industry || null,
      companyId: s.company_id,
      impliedShares,
      flaggedReason: impliedShares < 1_000_000 ? '<1M shares' : 'Class A < 100M shares',
    };

    if (isSuspicious) {
      flaggedUpdates.push(entry);
    } else {
      validUpdates.push(entry);
    }
  }

  // ── Apply VALID market caps ──
  console.log(`  ${validUpdates.length} valid, ${flaggedUpdates.length} flagged (<1M implied shares)`);
  let updated = 0;

  if (flaggedUpdates.length > 0) {
    console.log('  ⚐ Flagged for review (mc_review):');
    flaggedUpdates.forEach(u => {
      console.log(`    ${u.ticker.padEnd(8)} ${u.flaggedReason.padEnd(22)} ${(u.companyName||'').slice(0,40).padEnd(42)} FMP=$${(u.marketCap/1e6).toFixed(0)}M  implied=${u.impliedShares.toLocaleString()} shares`);
    });

    // ── Auto‑resolve: try SEC EDGAR for correct total shares ──
    let resolved = 0;
    const stillFlagged = [];
    for (const u of flaggedUpdates) {
      const secResult = await resolveTotalShares(u.ticker, null);
      if (secResult && secResult.shares > u.impliedShares * 1.5) {
        // SEC found substantially more shares than FMP → auto‑correct
        const correctedMc = secResult.shares * u.price;
        await client.query(
          `UPDATE securities SET market_cap = $1, updated_at = NOW(),
               attributes = COALESCE(attributes,'{}'::jsonb) || $2::jsonb
           WHERE id = $3`,
          [correctedMc, JSON.stringify({ mc_auto: true, mc_source: secResult.source }), u.id]
        );
        console.log(`    ✓ ${u.ticker.padEnd(8)} auto‑resolved via ${secResult.source}: ${(secResult.shares/1e6).toFixed(1)}M shares → $${(correctedMc/1e9).toFixed(1)}B`);
        resolved++;
      } else {
        stillFlagged.push(u);
      }
      await SLEEP(300); // Rate limit SEC calls
    }

    // NULL remaining unresolved — don't write bad data
    if (stillFlagged.length > 0) {
      const flaggedIds = stillFlagged.map(u => `'${u.id}'`).join(',');
      await client.query(
        `UPDATE securities SET market_cap = NULL, updated_at = NOW(),
             attributes = COALESCE(attributes,'{}'::jsonb) || '{"mc_review":true}'::jsonb
         WHERE id IN (${flaggedIds})`
      );
      console.log(`    → Could not auto‑resolve ${stillFlagged.length}, flagged for review`);
    }
    // Update prices for all flagged (regardless of resolution)
    for (const u of flaggedUpdates) {
      await client.query(
        `UPDATE securities SET latest_price = $1, avg_dollar_volume = $2, updated_at = NOW() WHERE id = $3`,
        [u.price, u.volume, u.id]
      );
    }
    console.log(`  → ${resolved} auto‑resolved, ${stillFlagged.length} still flagged\n`);
  }

  // Batch UPDATE valid caps in chunks of 200
  const BATCH = 200;
  for (let i = 0; i < validUpdates.length; i += BATCH) {
    const chunk = validUpdates.slice(i, i + BATCH);
    const ids = chunk.map(u => `'${u.id}'`).join(',');
    let secSql = `UPDATE securities SET
      market_cap = CASE id `;
    for (const u of chunk) secSql += `WHEN '${u.id}' THEN ${u.marketCap} `;
    secSql += `END,
      latest_price = CASE id `;
    for (const u of chunk) secSql += `WHEN '${u.id}' THEN ${u.price} `;
    secSql += `END,
      avg_dollar_volume = CASE id `;
    for (const u of chunk) secSql += `WHEN '${u.id}' THEN ${u.volume} `;
    secSql += `END,
      attributes = COALESCE(attributes, '{}'::jsonb)
        || '{"mc_source":"fmp_company_screener","mc_review":false}'::jsonb,
      updated_at = NOW()
      WHERE id IN (${ids})`;
    await client.query(secSql);

    // Batch update sectors/industries on companies
    const sectorUpdates = chunk.filter(u => u.sector || u.industry);
    if (sectorUpdates.length > 0) {
      const cids = sectorUpdates.map(u => `'${u.companyId}'`).join(',');
      let coSql = `UPDATE companies SET `;
      const hasSectors = sectorUpdates.some(u => u.sector);
      const hasIndustries = sectorUpdates.some(u => u.industry);
      if (hasSectors) {
        coSql += `sector = CASE id `;
        for (const u of sectorUpdates) if (u.sector) coSql += `WHEN '${u.companyId}' THEN COALESCE(NULLIF('${u.sector.replace(/'/g, "''")}',''), sector) `;
        coSql += `ELSE sector END`;
        if (hasIndustries) coSql += `, `;
      }
      if (hasIndustries) {
        coSql += `industry = CASE id `;
        for (const u of sectorUpdates) if (u.industry) coSql += `WHEN '${u.companyId}' THEN COALESCE(NULLIF('${u.industry.replace(/'/g, "''")}',''), industry) `;
        coSql += `ELSE industry END`;
      }
      coSql += ` WHERE id IN (${cids})`;
      await client.query(coSql);
    }

    updated += chunk.length;
    console.log(`  ${updated}/${validUpdates.length} valid caps updated...`);
  }
  console.log(`  ${updated} valid caps written, ${flaggedUpdates.length} flagged (mc_review → NULL), ${secs.rows.length - validUpdates.length - flaggedUpdates.length} no screener match\n`);

  // ═══ STEP 2c: STALENESS CHECK — detect caps made stale by corporate actions ═══
  console.log('═══ Step 2c: Staleness Check (corporate actions) ═══');
  const staleCheck = await client.query(`
    SELECT s.ticker, s.id as sec_id, s.market_cap, s.latest_price, co.cik
    FROM securities s
    JOIN companies co ON co.id = s.company_id
    JOIN opportunities o ON o.security_id = s.id AND o.status = 'published'
    WHERE s.market_cap IS NOT NULL
      AND (s.attributes->>'mc_manual' IS NULL OR s.attributes->>'mc_manual' != 'true')
      AND (s.attributes->>'mc_auto' IS NULL OR s.attributes->>'mc_auto' != 'true')
    LIMIT 30
  `);

  let staleFound = 0;
  for (const sec of staleCheck.rows) {
    const incData = await fmpGet(`/income-statement?symbol=${sec.ticker}&period=quarter&limit=1`);
    if (!Array.isArray(incData) || incData.length === 0) continue;

    const inc = incData[0];
    const diluted = inc.weightedAverageShsOutDil || inc.weightedAverageShsOut || 0;
    const price = sec.latest_price || 0;
    if (diluted <= 0 || price <= 0) continue;

    const screenerShares = Math.round(sec.market_cap / price);
    const diff = Math.abs(screenerShares - diluted) / Math.max(screenerShares, diluted);
    const filingDate = new Date(inc.filingDate || inc.date || '1970-01-01');
    const daysSinceFiling = Math.round((Date.now() - filingDate) / 86400000);

    // Flag if screener shares differ from latest filed diluted shares by > 15%
    // AND the filing is more than 30 days old (corporate actions likely occurred since)
    if (diff > 0.15 && daysSinceFiling > 30) {
      // Auto-correct: use diluted shares × current price
      const correctedMc = diluted * price;
      await client.query(
        `UPDATE securities SET market_cap = $1, updated_at = NOW(),
             attributes = COALESCE(attributes,'{}'::jsonb) || $2::jsonb
         WHERE id = $3`,
        [correctedMc, JSON.stringify({ mc_auto: true, mc_note: `post-corp-action ${daysSinceFiling}d ago, screener ${Math.round(screenerShares / 1e6)}M → diluted ${Math.round(diluted / 1e6)}M` }), sec.sec_id]
      );
      console.log(`  ✏ ${sec.ticker.padEnd(6)} $${(sec.market_cap/1e9).toFixed(1)}B → $${(correctedMc/1e9).toFixed(1)}B (${Math.round(screenerShares/1e6)}M → ${Math.round(diluted/1e6)}M sh, ${daysSinceFiling}d since filing)`);
      staleFound++;
    }
    await SLEEP(250);
  }
  console.log(`  ${staleFound} stale caps auto-corrected\n`);

  // ═══ STEP 3: ENRICH PUBLISHED OPPORTUNITIES ═══
  console.log('═══ Step 3: Analyst + Institutional + Consensus + Peers ═══');

  const oppTickers = await client.query(`
    SELECT DISTINCT s.ticker, s.id as sec_id
    FROM opportunities o JOIN securities s ON s.id = o.security_id
    WHERE o.status = 'published' LIMIT 25
  `);

  for (const t of oppTickers.rows) {
    const [analystData, instData, consensusData, peersData] = await Promise.all([
      fmpGet(`/analyst-estimates?symbol=${t.ticker}&period=annual&limit=50`),
      fmpGet(`/institutional-ownership/symbol-positions-summary?symbol=${t.ticker}`),
      fmpGet(`/grades-consensus?symbol=${t.ticker}`),
      fmpGet(`/stock-peers?symbol=${t.ticker}`),
    ]);

    const attrs = {};

    // Analyst count — number of unique analysts covering this stock
    if (Array.isArray(analystData) && analystData.length > 0) {
      const names = new Set(analystData.map(e => e.analystName).filter(Boolean));
      attrs.analyst_count = names.size;
    }

    // Institutional ownership — how many institutions hold, shares, recent change
    if (Array.isArray(instData) && instData.length > 0) {
      const latest = instData[0];
      attrs.inst_investors = latest.investors || 0;
      attrs.inst_shares = latest.shares || 0;
      attrs.inst_shares_change = latest.sharesChange || 0;
    }

    // Analyst consensus — buy/hold/sell breakdown
    if (consensusData && !Array.isArray(consensusData)) {
      attrs.consensus_buy = consensusData.strongBuy || 0;
      attrs.consensus_hold = consensusData.hold || 0;
      attrs.consensus_sell = (consensusData.sell || 0) + (consensusData.strongSell || 0);
      attrs.consensus_rating = consensusData.consensus || null;
    }

    // Peers — similar companies by sector + market cap
    if (Array.isArray(peersData) && peersData.length > 0) {
      attrs.peers = peersData.slice(0, 8).map(p =>
        typeof p === 'string' ? p : (p.symbol || p.peersList || '')
      ).filter(Boolean);
    }

    if (Object.keys(attrs).length > 0) {
      await client.query(
        `UPDATE securities SET attributes = COALESCE(attributes,'{}'::jsonb) || $1::jsonb WHERE id = $2`,
        [JSON.stringify(attrs), t.sec_id]
      );
    }
    await SLEEP(150);
  }

  // ═══ Summary ═══
  const cnt = await client.query('SELECT COUNT(*) FROM securities WHERE market_cap IS NOT NULL');
  const ranges = await client.query(`
    SELECT
      COUNT(*) FILTER (WHERE market_cap < 100000000) as nano,
      COUNT(*) FILTER (WHERE market_cap BETWEEN 100000000 AND 300000000) as micro,
      COUNT(*) FILTER (WHERE market_cap BETWEEN 300000000 AND 2000000000) as small,
      COUNT(*) FILTER (WHERE market_cap BETWEEN 2000000000 AND 10000000000) as mid,
      COUNT(*) FILTER (WHERE market_cap > 10000000000) as large
    FROM securities WHERE market_cap IS NOT NULL
  `);
  const r = ranges.rows[0];

  console.log(`\n═══ Done ═══`);
  console.log(`Total with market caps: ${cnt.rows[0].count}`);
  console.log(`  Nano  (<$100M):   ${r.nano}`);
  console.log(`  Micro ($100-300M): ${r.micro}`);
  console.log(`  Small ($300M-2B):  ${r.small}`);
  console.log(`  Mid   ($2-10B):    ${r.mid}`);
  console.log(`  Large (>$10B):     ${r.large}`);

  await client.end();
  process.exit(0);
}

main().catch(e => { console.error(e.message); process.exit(1); });
