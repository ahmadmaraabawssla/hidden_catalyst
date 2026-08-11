/**
 * Extract numeric defined terms from an agreement filing.
 * Returns { term_name: numeric_value } pairs.
 */
function extractDefinedTerms(text) {
  var terms = {};

  // 1. "$0.12345 (the Minimum Price)" — stock-price values in SEC filings
  // Prefer values with 2+ decimal places (stock prices: $0.12345, $12.50), not whole numbers
  var minPriceRe = /\$([\d]+\.[\d]{2,})\s*[^.]{0,80}?(?:minimum|nasdaq\s+minimum)\s*(?:price|bid\s+price)/gi;
  var m;
  while ((m = minPriceRe.exec(text)) !== null) {
    var v = parseFloat(m[1].replace(/,/g, ''));
    if (v > 0.01 && v < 10000) { terms['minimum_price'] = v; break; }
  }
  // Fallback: any $X pattern near minimum price
  if (!terms['minimum_price']) {
    var minPriceRe2 = /\$([\d.]+)\s*[^.]{0,80}?(?:minimum|nasdaq\s+minimum)\s*(?:price|bid\s+price)/gi;
    while ((m = minPriceRe2.exec(text)) !== null) {
      var v2 = parseFloat(m[1].replace(/,/g, ''));
      if (v2 > 0.001 && v2 < 100 && v2 !== Math.floor(v2)) { terms['minimum_price'] = v2; break; }
      if (v2 > 0.001 && v2 < 10000 && m[0].indexOf(',') < 0) { terms['minimum_price'] = v2; break; }
    }
  }
  // Last resort: no $ prefix (HTML entity stripping may separate it)
  if (!terms['minimum_price']) {
    var minPriceRe3 = /([\d]+\.[\d]{2,})\s*[^.]{0,80}?(?:minimum|nasdaq\s+minimum)\s*(?:price|bid\s+price)/gi;
    while ((m = minPriceRe3.exec(text)) !== null) {
      var v3 = parseFloat(m[1].replace(/,/g, ''));
      if (v3 > 0.01 && v3 < 1000) { terms['minimum_price'] = v3; break; }
    }
  }

  // 2. "$X commitment fee" or "Commitment Fee of $X"
  var feeRe = /commitment\s*fee.{0,20}?\$?([\d,.]+)/gi;
  while ((m = feeRe.exec(text)) !== null) {
    var v2 = parseFloat(m[1].replace(/,/g, ''));
    if (v2 >= 100000 && v2 < 100000000) { terms['commitment_fee'] = v2; break; }
  }

  // 3. "up to $50,000,000" ELOC / equity line
  var elocRe = /up\s+to\s+\$([\d,]+)\s*(?:of\s+)?(?:common\s+stock|equity|ELOC|line|shares)/gi;
  while ((m = elocRe.exec(text)) !== null) {
    var v3 = parseFloat(m[1].replace(/,/g, ''));
    if (v3 >= 1000000) { terms['eloc_capacity'] = v3; break; }
  }

  // 4. Warrant amount
  var warrantRe = /(?:commitment\s+)?warrants?\s+(?:to\s+purchase\s+)?(?:up\s+to\s+)?\$?([\d,.]+)\s*(?:of\s+)?(?:common\s+stock|shares|worth)/gi;
  while ((m = warrantRe.exec(text)) !== null) {
    var v4 = parseFloat(m[1].replace(/,/g, ''));
    if (v4 >= 500000) { terms['warrant_amount'] = v4; break; }
  }

  // 5. Share reserve
  var reserveRe = /(?:authorized\s+and\s+)?reserve\s+(?:for\s+issuance\s+)?(?:of\s+)?([\d,.]+)\s+(?:shares|million\s+shares)/gi;
  while ((m = reserveRe.exec(text)) !== null) {
    var v5 = parseFloat(m[1].replace(/,/g, ''));
    if (v5 >= 100000) { terms['share_reserve'] = v5; break; }
  }

  // 6. Commitment Fee Price (the measurement for the fee)
  var cfpRe = /commitment\s+fee\s+price.{0,40}?\$?([\d,.]+)/gi;
  while ((m = cfpRe.exec(text)) !== null) {
    var v6 = parseFloat(m[1].replace(/,/g, ''));
    if (v6 > 0 && v6 < 1000) { terms['commitment_fee_price'] = v6; break; }
  }

  return terms;
}

module.exports = { extractDefinedTerms };
