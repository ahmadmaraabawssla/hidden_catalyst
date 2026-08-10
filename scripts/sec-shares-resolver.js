/**
 * SEC S-1 Share Resolver
 * 
 * For dual-class / SPAC stocks where FMP undercounts (Class A only),
 * retrieves TOTAL diluted shares from the SEC EDGAR S-1 registration
 * statement and computes the correct market cap.
 * 
 * Strategy:
 * 1. Get CIK → fetch SEC submissions → find latest S-1/S-1/A
 * 2. Download S-1 filing text
 * 3. Extract total shares from offering table (regex-based)
 * 4. Return totalShares, or null if extraction fails
 */

const SEC_SUB = 'https://data.sec.gov/submissions';
const SEC_ARCH = 'https://www.sec.gov/Archives/edgar/data';
const UA = 'Hidden Catalyst contact@hiddencatalyst.com';

/**
 * Extract total shares outstanding from an S-1 filing text.
 * Looks for patterns like:
 *   "406,250,000 shares of Common Stock"
 *   "shares of Class A Common Stock, par value $0.0001 per share, and 386,250,000 shares of Class B"
 */
function extractTotalShares(text) {
  if (!text || text.length < 500) return null;

  // Strategy 1: Find the offering table. Usually structured as:
  // "Class A Common Stock ... 20,000,000 shares"
  // "Class B Common Stock ... 386,250,000 shares"
  // We sum ALL share class counts.
  const classPatterns = [
    // Match "NNN,NNN,NNN shares of Class X Common Stock"
    /(\d{1,3}(?:,\d{3})*)\s+shares\s+of\s+(?:Class\s+[A-Z]\s+)?[Cc]ommon\s*[Ss]tock/gi,
    // Match "NNNNNNNNN shares of common stock"
    /(\d{1,3}(?:,\d{3})*)\s+shares\s+of\s+common\s+stock/gi,
    // Match "outstanding: NNN,NNN,NNN" 
    /outstanding[:\s]*(\d{1,3}(?:,\d{3})*)/gi,
  ];

  let allShares = [];
  const seen = new Set();

  for (const pattern of classPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const num = parseInt(match[1].replace(/,/g, ''), 10);
      // Filter: anything > 100M shares is a plausible total, < 1M is noise
      if (num > 1_000_000 && !seen.has(num)) {
        seen.add(num);
        allShares.push(num);
      }
    }
  }

  if (allShares.length === 0) return null;

  // Sum all classes (if multiple classes detected) or take the max
  // (single-class companies might match "common stock" + "Class A")
  allShares.sort((a, b) => b - a);
  
  // If the largest is > 10x the second largest, it's likely the total already
  // Otherwise, sum all unique classes
  if (allShares.length > 1 && allShares[0] < allShares[1] * 10) {
    return allShares.reduce((s, v) => s + v, 0);
  }
  return allShares[0]; // Single-class or dominant
}

/**
 * Get CIK for a ticker from SEC submissions.
 */
async function resolveCik(ticker) {
  try {
    const r = await fetch(`${SEC_SUB}/CIK${ticker}.json`, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return null;
    const j = await r.json();
    return String(j.cik || '').padStart(10, '0');
  } catch {
    return null;
  }
}

/**
 * Find the latest S-1/S-1/A filing accession number.
 */
async function findS1Filing(cik) {
  try {
    const r = await fetch(`${SEC_SUB}/CIK${cik}.json`, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const recent = j.filings?.recent;
    if (!recent?.form) return null;

    for (let i = 0; i < Math.min(50, recent.form.length); i++) {
      const form = (recent.form[i] || '').toUpperCase();
      if (form === 'S-1' || form === 'S-1/A') {
        return {
          acc: recent.accessionNumber[i],
          date: recent.filingDate[i],
          form,
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Download and parse S-1 filing text.
 */
async function downloadS1(cik, acc) {
  try {
    const accNoDash = acc.replace(/-/g, '');
    const url = `${SEC_ARCH}/${cik}/${accNoDash}/${acc}.txt`;
    const r = await fetch(url, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return null;
    const fullText = await r.text();

    // Extract text between <TEXT> tags (actual filing body)
    const textStart = fullText.indexOf('<TEXT>');
    if (textStart < 0) return null;
    const filingBody = fullText.slice(textStart + 6)
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&\w+;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 40000); // First 40K chars is enough for the offering table

    return filingBody;
  } catch {
    return null;
  }
}

/**
 * Resolve total shares for a dual-class ticker using SEC S-1 filing.
 * Returns total shares or null if auto-resolution fails.
 */
async function resolveTotalShares(ticker) {
  // Try by CIK first (if known)
  const cik = await resolveCik(ticker);
  if (!cik) return null;

  const filing = await findS1Filing(cik);
  if (!filing) return null;

  const text = await downloadS1(cik, filing.acc);
  if (!text) return null;

  return extractTotalShares(text);
}

module.exports = { resolveTotalShares, extractTotalShares };
