/**
 * Extract numeric defined terms from an agreement filing.
 * Returns { term_name: numeric_value } pairs.
 */
function extractDefinedTerms(text) {
  var terms = {};

  // 1. "$0.39912 (the Minimum Price)" — most common pattern in SEC filings
  var minPriceRe = /\$([\d.]+)\s*[^.]{0,80}?(?:minimum|nasdaq\s+minimum)\s*(?:price|bid\s+price)/gi;
  var m;
  while ((m = minPriceRe.exec(text)) !== null) {
    var v = parseFloat(m[1].replace(/,/g, ''));
    if (v > 0 && v < 10000) { terms['minimum_price'] = v; break; }
  }

  // 1b. Also try "Minimum Price" ... "$0.39912" (reverse order)
  if (!terms['minimum_price']) {
    var mpRe2 = /(?:minimum|nasdaq\s+minimum)\s*(?:price|bid\s+price)[^.]{0,80}?\$([\d.]+)/gi;
    while ((m = mpRe2.exec(text)) !== null) {
      var v1b = parseFloat(m[1].replace(/,/g, ''));
      if (v1b > 0 && v1b < 10000) { terms['minimum_price'] = v1b; break; }
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
