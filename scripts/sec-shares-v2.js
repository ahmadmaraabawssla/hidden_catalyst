/**
 * SEC S-1 Share Resolver v2
 * 
 * For dual‑class / SPAC stocks where FMP undercounts (Class A only),
 * retrieves the best available total diluted share count from SEC EDGAR.
 * 
 * Strategy (tried in order):
 *  1. SEC XBRL companyfacts → EntityCommonStockSharesOutstanding (best)
 *  2. S-1/S-1/A filing text → extract total post‑offering shares
 *  3. FMP shares‑float → use outstandingShares if freeFloat <= 100%
 *  4. Give up → return null
 */

const SEC_SUB = 'https://data.sec.gov/submissions';
const SEC_ARCH = 'https://www.sec.gov/Archives/edgar/data';
const SEC_XBRL = 'https://data.sec.gov/api/xbrl/companyfacts';
const FMP = 'https://financialmodelingprep.com/stable';
const UA = 'Hidden Catalyst contact@hiddencatalyst.com';

/**
 * Strategy 1: SEC XBRL companyfacts
 * Only works if company filed a 10-K (annual report).
 */
async function resolveFromXbrl(cik) {
  try {
    const r = await fetch(`${SEC_XBRL}/CIK${cik}.json`, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null;
    const j = await r.json();

    // Check all namespaces for EntityCommonStockSharesOutstanding
    for (const ns of Object.keys(j.facts || {})) {
      const tag = j.facts[ns] && j.facts[ns].EntityCommonStockSharesOutstanding;
      if (!tag || !tag.units) continue;

      // Prefer the most recent value
      var latest = null;
      var unitKeys = Object.keys(tag.units);
      for (var ui = 0; ui < unitKeys.length; ui++) {
        var arr = tag.units[unitKeys[ui]];
        for (var vi = 0; vi < arr.length; vi++) {
          var v = arr[vi];
          if (!latest || (v.filed && v.filed > (latest.filed || ''))) {
            latest = v;
          }
        }
      }
      if (latest && latest.val && latest.val > 100000) {
        return latest.val;
      }
    }
    return null;
  } catch (e) {
    return null;
  }
}

/**
 * Strategy 2: Parse S-1/S-1/A filing text for total shares.
 */
function extractFromS1Text(text) {
  if (!text || text.length < 500) return null;

  // Normalise HTML entities
  var clean = text
    .replace(/&#160;|&nbsp;|&#8201;|&#8203;/gi, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  var candidates = [];

  // Pattern A: "NNN,NNN,NNN shares of Class A/B/C Common"
  var classRe = /(\d{1,3}(?:,\d{3}){1,3})\s+shares\s+of\s+(?:Class\s+[A-C]\s+)?(?:[Cc]ommon)/g;
  var m;
  while ((m = classRe.exec(clean)) !== null) {
    var n = parseInt(m[1].replace(/,/g, ''), 10);
    if (n > 500000 && n < 10000000000) candidates.push(n);
  }

  // Pattern A2: "NNN shares" followed by "outstanding after" or "Class B" context
  // Catches phrases like "263,971,956 shares, or 270,400,527 shares if the underwriters..."
  var sharesRe = /(\d{1,3}(?:,\d{3}){1,3})\s+shares/gi;
  while ((m = sharesRe.exec(clean)) !== null) {
    var na = parseInt(m[1].replace(/,/g, ''), 10);
    if (na > 10000000 && na < 10000000000) candidates.push(na);
  }

  // Pattern B: "outstanding as of" followed by a large comma-separated number
  var outRe = /outstanding\s+as\s+of[^.]*?(\d{1,3}(?:,\d{3}){1,3})/gi;
  while ((m = outRe.exec(clean)) !== null) {
    var n2 = parseInt(m[1].replace(/,/g, ''), 10);
    if (n2 > 500000 && n2 < 10000000000) candidates.push(n2);
  }

  // Pattern B2: "total of NNN,NNN,NNN shares" — common in S-1 offering summaries
  var totalRe = /total\s+of\s+(\d{1,3}(?:,\d{3}){1,3})\s+shares/gi;
  while ((m = totalRe.exec(clean)) !== null) {
    var n2b = parseInt(m[1].replace(/,/g, ''), 10);
    if (n2b > 500000 && n2b < 10000000000) candidates.push(n2b);
  }

  // Pattern C: post-offering totals - after "giving effect" or "after this offering"
  var idx = Math.max(
    clean.indexOf('giving effect to'),
    clean.indexOf('after this offering'),
    clean.indexOf('as adjusted')
  );
  if (idx > 0) {
    var section = clean.slice(idx, idx + 3000);
    var postRe = /(\d{1,3}(?:,\d{3}){1,3})/g;
    while ((m = postRe.exec(section)) !== null) {
      var n3 = parseInt(m[1].replace(/,/g, ''), 10);
      if (n3 > 1000000 && n3 < 10000000000) candidates.push(n3);
    }
  }

  if (candidates.length === 0) return null;

  // Sort descending
  candidates.sort(function(a, b) { return b - a; });

  // Heuristic: if the largest is > 5x the second, it IS the total
  if (candidates.length === 1) return candidates[0];
  if (candidates[0] > candidates[1] * 5) return candidates[0];

  // Multiple plausible share classes -> sum them
  var total = 0;
  for (var i = 0; i < candidates.length; i++) {
    if (total === 0 || candidates[i] < total * 3) {
      total += candidates[i];
    }
  }
  return total > 1000000 ? total : candidates[0];
}

/**
 * Download and extract text from SEC filing.
 */
async function downloadFiling(cik, acc) {
  try {
    var accNoDash = acc.replace(/-/g, '');
    var url = SEC_ARCH + '/' + cik + '/' + accNoDash + '/' + acc + '.txt';
    var r = await fetch(url, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return null;
    var fullText = await r.text();

    var textStart = fullText.indexOf('<TEXT>');
    if (textStart < 0) return null;
    return fullText
      .slice(textStart + 6)
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60000);
  } catch (e) {
    return null;
  }
}

/**
 * Find the latest S-1 or S-1/A filing for a CIK.
 */
async function findS1Filings(cik) {
  try {
    var r = await fetch(SEC_SUB + '/CIK' + cik + '.json', {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return [];
    var j = await r.json();
    var recent = j.filings && j.filings.recent;
    if (!recent || !recent.form) return [];

    var results = [];
    for (var i = 0; i < Math.min(50, recent.form.length); i++) {
      var form = (recent.form[i] || '').toUpperCase();
      if (form === 'S-1' || form === 'S-1/A') {
        results.push({
          acc: recent.accessionNumber[i],
          date: recent.filingDate[i],
          form: form,
        });
      }
    }
    return results;
  } catch (e) {
    return [];
  }
}

/**
 * Strategy 2: Resolve from S-1 filings.
 */
async function resolveFromS1(cik) {
  var filings = await findS1Filings(cik);
  if (filings.length === 0) return null;

  // Try the latest filing first (S-1/A which has final numbers)
  for (var i = 0; i < Math.min(3, filings.length); i++) {
    var f = filings[i];
    var text = await downloadFiling(cik, f.acc);
    if (!text) continue;
    var shares = extractFromS1Text(text);
    if (shares) {
      console.log('    [SEC S-1] ' + f.form + ' from ' + f.date + ' -> ' + (shares / 1e6).toFixed(1) + 'M shares');
      return shares;
    }
  }
  return null;
}

/**
 * Strategy 3: FMP shares-float (fallback, less reliable for SPACs)
 */
async function resolveFromFmpFloat(ticker) {
  try {
    var key = process.env.FMP_API_KEY;
    if (!key) return null;
    var r = await fetch(FMP + '/shares-float?symbol=' + ticker + '&apikey=' + key, {
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return null;
    var data = await r.json();
    if (!Array.isArray(data) || data.length === 0) return null;

    var d = data[0];
    var freeFloat = d.freeFloat || 0;

    // Sanity: freeFloat > 100% means the data is corrupted
    if (freeFloat > 100) return null;

    // Use outstandingShares if available and reasonable
    var outstanding = d.outstandingShares || 0;
    if (outstanding > 500000) {
      console.log('    [FMP float] ' + (outstanding / 1e6).toFixed(1) + 'M shares');
      return outstanding;
    }
    return null;
  } catch (e) {
    return null;
  }
}

/**
 * Resolve total shares for a ticker.
 * Returns { shares: number, source: 'xbrl'|'s1'|'fmp_float'|null }
 * or null if all strategies fail.
 */
async function resolveTotalShares(ticker, cik) {
  // Strategy 1: XBRL (most reliable)
  var shares = await resolveFromXbrl(cik);
  if (shares) return { shares: shares, source: 'xbrl' };

  // Strategy 2: S-1 filing
  shares = await resolveFromS1(cik);
  if (shares) return { shares: shares, source: 's1' };

  // Strategy 3: FMP float (least reliable)
  shares = await resolveFromFmpFloat(ticker);
  if (shares) return { shares: shares, source: 'fmp_float' };

  return null;
}

module.exports = { resolveTotalShares, extractFromS1Text };
