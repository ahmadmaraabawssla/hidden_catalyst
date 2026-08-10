/**
 * Catalyst Attention Measurement (v4e)
 * 
 * Measures how much attention a specific event is getting:
 * 1. Press release check: did the company issue a formal PR?
 * 2. Media coverage: how many financial news outlets covered it?
 * 3. Attention score: 0-100, inverted (higher = more overlooked/less attention)
 * 
 * The score is INVERTED for the Info Asymmetry metric:
 * - Low attention → high info asymmetry score → opportunity
 * - High attention → low info asymmetry score → already priced in
 */

const FMP_BASE = 'https://financialmodelingprep.com/api/v3';

/**
 * Check if the company issued a press release for a specific event.
 * Looks at FMP press releases endpoint for the ticker.
 * Returns { found: boolean, count: number, headlines: string[] }
 */
async function checkPressReleases(ticker, apiKey, keywords) {
  try {
    if (!apiKey) return { found: false, count: 0, headlines: [] };
    const res = await fetch(
      `${FMP_BASE}/press-releases/${ticker}?apikey=${apiKey}&limit=10`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return { found: false, count: 0, headlines: [] };
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return { found: false, count: 0, headlines: [] };

    // Check if any press release mentions our keywords
    var matches = [];
    for (var i = 0; i < data.length; i++) {
      var title = (data[i].title || '').toLowerCase();
      var textContent = (data[i].text || '').toLowerCase();
      var combined = title + ' ' + textContent;

      var matched = false;
      for (var k = 0; k < keywords.length; k++) {
        if (combined.indexOf(keywords[k].toLowerCase()) >= 0) {
          matched = true;
          break;
        }
      }
      if (matched) {
        matches.push(data[i].title);
      }
    }

    return { found: matches.length > 0, count: matches.length, headlines: matches };
  } catch (e) {
    return { found: false, count: 0, headlines: [] };
  }
}

/**
 * Count financial news articles mentioning the company in the last 7 days.
 * Returns { count: number, sentiment: number }
 */
async function countNewsMentions(ticker, apiKey) {
  try {
    if (!apiKey) return { count: 0, sentiment: 0 };
    const res = await fetch(
      `${FMP_BASE}/stock_news?tickers=${ticker}&limit=50&apikey=${apiKey}`,
      { signal: AbortSignal.timeout(6000) }
    );
    if (!res.ok) return { count: 0, sentiment: 0 };
    const data = await res.json();
    if (!Array.isArray(data)) return { count: 0, sentiment: 0 };

    // Filter to last 7 days
    var weekAgo = Date.now() - 7 * 86400000;
    var recent = [];
    var totalSentiment = 0;
    for (var i = 0; i < data.length; i++) {
      var publishedDate = data[i].publishedDate ? new Date(data[i].publishedDate).getTime() : 0;
      if (publishedDate > weekAgo) {
        recent.push(data[i]);
        totalSentiment += parseFloat(data[i].sentiment) || 0;
      }
    }

    return {
      count: recent.length,
      sentiment: recent.length > 0 ? totalSentiment / recent.length : 0,
    };
  } catch (e) {
    return { count: 0, sentiment: 0 };
  }
}

/**
 * Compute the catalyst attention score (inverted: high score = LOW attention = overlooked).
 * 
 * Input: market cap (smaller = less attention), press release found, news count
 * Output: 5-95 score where 95 = completely overlooked, 5 = heavily covered
 */
function computeAttentionScore(marketCap, pressReleaseFound, newsCount, ticker) {
  // Start with a base from market cap (smaller = less attention)
  var base;
  if (marketCap < 100e6) base = 85;
  else if (marketCap < 300e6) base = 75;
  else if (marketCap < 500e6) base = 65;
  else if (marketCap < 1e9) base = 55;
  else if (marketCap < 2e9) base = 45;
  else if (marketCap < 5e9) base = 35;
  else if (marketCap < 10e9) base = 25;
  else base = 15;

  // Penalize if company issued a press release (it IS getting attention)
  if (pressReleaseFound) base -= 20;

  // Penalize based on news article count
  if (newsCount > 20) base -= 20;
  else if (newsCount > 10) base -= 12;
  else if (newsCount > 5) base -= 8;
  else if (newsCount > 2) base -= 4;
  else base += 5; // Bonus for very few articles

  // Bonus for tickers with unusual characters (SPAC remnants, OTC graduates)
  if (ticker && ticker.length > 4) base += 5;

  return Math.max(5, Math.min(95, Math.round(base)));
}

/**
 * Full catalyst attention measurement for a company + event.
 * Runs all checks and returns a comprehensive attention profile.
 * 
 * @param {string} ticker - Stock ticker
 * @param {string} apiKey - FMP API key
 * @param {number} marketCap - Company market cap
 * @param {string[]} keywords - Keywords from the event to match against
 * @returns {object} Attention profile
 */
async function measureAttention(ticker, apiKey, marketCap, keywords) {
  if (!apiKey || !ticker) {
    return {
      attentionScore: computeAttentionScore(marketCap || 800000000, false, 0, ticker),
      pressRelease: { found: false, count: 0 },
      news: { count: 0, sentiment: 0 },
      source: 'estimate',
    };
  }

  var [pressRelease, news] = await Promise.all([
    checkPressReleases(ticker, apiKey, keywords || []),
    countNewsMentions(ticker, apiKey),
  ]);

  var score = computeAttentionScore(marketCap || 800000000, pressRelease.found, news.count, ticker);

  return {
    attentionScore: score,
    pressRelease: { found: pressRelease.found, count: pressRelease.count },
    news: { count: news.count, sentiment: news.sentiment },
    source: 'fmp',
  };
}

module.exports = { measureAttention, checkPressReleases, countNewsMentions, computeAttentionScore };
