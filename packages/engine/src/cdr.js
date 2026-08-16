/**
 * Cross-Document Resolution Engine
 *
 * When an SEC amendment filing references terms defined in a prior agreement,
 * this engine fetches the referenced filing, extracts defined terms,
 * and enriches the analysis context.
 *
 * Key pattern: "as defined in the Purchase Agreement dated July 14, 2026"
 * → fetch that filing → extract Minimum Price, Commitment Fee Price, etc.
 */

const SEC_ARCH = 'https://www.sec.gov/Archives/edgar/data';
const SEC_SUB = 'https://data.sec.gov/submissions';
const UA = 'Hidden Catalyst contact@hiddencatalyst.com';

/**
 * Detect references to prior agreements in amendment text.
 * Returns array of { date, description, formType } references.
 */
function findAgreementReferences(text) {
  var refs = [];
  // Pattern: "as defined in the [Agreement Name] dated [Date]"
  // Pattern: "pursuant to the [Agreement] dated [Date]"
  // Pattern: "amends the [Agreement] dated [Date]"
  var patterns = [
    /(?:as\s+defined\s+in|pursuant\s+to|amends\s+the|referenced\s+in\s+the)\s+(?:the\s+)?["']?([^"']+(?:agreement|contract|plan|ELOC|equity\s*line|purchase\s*agreement|financing\s*agreement))["']?\s*(?:dated\s+|as\s+of\s+)(\w+\s+\d{1,2},?\s*\d{4})/gi,
    /(?:Purchase Agreement|Equity Line|ELOC|Settlement Agreement|Placement Agent Agreement|Registration Rights Agreement).{0,80}((?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s*\d{4})/gi,
  ];

  for (var pi = 0; pi < patterns.length; pi++) {
    var m;
    while ((m = patterns[pi].exec(text)) !== null) {
      var desc = (m[1] || '').replace(/\s+/g, ' ').trim();
      var dateStr = m[2] || m[1];
      if (m[1] && m[2]) refs.push({ description: desc, dateStr: dateStr });
      else if (m[1]) refs.push({ description: 'referenced agreement', dateStr: m[1] });
    }
  }
  return refs;
}

/**
 * Find a filing by date range in the company's SEC filing history.
 */
async function findFilingByDate(cik, startDate, endDate, formTypes) {
  try {
    var r = await fetch(SEC_SUB + '/CIK' + cik + '.json', {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null;
    var j = await r.json();
    var recent = j.filings && j.filings.recent;
    if (!recent || !recent.form) return null;

    for (var i = 0; i < Math.min(1000, recent.form.length); i++) {
      var form = (recent.form[i] || '').toUpperCase().replace(/\/A$/, '');
      var dt = recent.filingDate[i] || '';
      if (!dt) continue;

      // Check if this filing date is within our range
      var filingDate = new Date(dt).getTime();
      if (filingDate < startDate || filingDate > endDate) continue;

      // Check form type matches
      var formMatch = !formTypes || formTypes.length === 0;
      if (!formMatch) {
        for (var fi = 0; fi < formTypes.length; fi++) {
          if (form === formTypes[fi]) { formMatch = true; break; }
        }
      }
      if (!formMatch) continue;

      return {
        acc: recent.accessionNumber[i],
        date: dt,
        form: form,
      };
    }
    return null;
  } catch (e) {
    return null;
  }
}

/**
 * Load the FULL SEC filing history for a CIK (recent + archive files).
 * The submissions endpoint only returns ~1000 recent filings; older filings
 * live in `filings.files` archives. This walks those archives so a referenced
 * agreement filed more than a year ago can still be found. Bounded to a
 * handful of archive fetches to stay cheap.
 *
 * Returns an array of { form, filingDate, accessionNumber } sorted desc.
 */
async function loadFilingHistory(cik) {
  var all = [];
  try {
    var r = await fetch(SEC_SUB + '/CIK' + cik + '.json', {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return all;
    var j = await r.json();
    var filings = j.filings || {};
    var recent = filings.recent || {};
    if (recent.form) {
      for (var i = 0; i < recent.form.length; i++) {
        all.push({
          form: (recent.form[i] || '').toUpperCase().replace(/\/A$/, ''),
          filingDate: recent.filingDate[i] || '',
          accessionNumber: recent.accessionNumber[i] || '',
        });
      }
    }
    // Walk archive files (older than the recent window).
    var files = Array.isArray(filings.files) ? filings.files : [];
    for (var fi = 0; fi < Math.min(3, files.length); fi++) {
      var name = files[fi].name;
      if (!name) continue;
      try {
        var ar = await fetch(SEC_SUB + '/' + name, {
          headers: { 'User-Agent': UA },
          signal: AbortSignal.timeout(8000),
        });
        if (!ar.ok) continue;
        var aj = await ar.json();
        var arecent = aj.filings && aj.filings.recent;
        if (!arecent || !arecent.form) continue;
        for (var ai = 0; ai < arecent.form.length; ai++) {
          all.push({
            form: (arecent.form[ai] || '').toUpperCase().replace(/\/A$/, ''),
            filingDate: arecent.filingDate[ai] || '',
            accessionNumber: arecent.accessionNumber[ai] || '',
          });
        }
      } catch (ex) { /* skip archive */ }
    }
  } catch (e) { /* ignore */ }
  return all;
}

/**
 * Extract "incorporated by reference" / "filed as Exhibit X to the Form Y filed
 * on DATE" pointers from amendment text. These are direct citations to the
 * exact filing (accession) that holds the referenced agreement.
 */
function findIncorporationReferences(text) {
  var refs = [];
  // "incorporated by reference to Exhibit 10.1 of the Form 8-K filed on June 2, 2025"
  var re = /(?:incorporated\s+by\s+reference|filed\s+as\s+exhibit|filed\s+pursuant\s+to).{0,120}?(?:form\s+)?(8-?K|10-?Q|10-?K|S-?1|S-?3|S-?4|DEF\s*14A|424B\d?)\s+(?:filed\s+on|dated)\s+((?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+\d{1,2},?\s*\d{4})/gi;
  var m;
  while ((m = re.exec(text)) !== null) {
    refs.push({ formType: m[1].toUpperCase().replace(/\s+/g, ''), dateStr: m[2] });
  }
  return refs;
}

/**
 * Search the CURRENT amendment's exhibit index for an agreement name, and
 * return the exhibit URLs to fetch. The amendment often attaches the referenced
 * agreement as an exhibit (EX-10.1, EX-2.1, EX-4.1) even when it does not
 * reproduce its terms inline.
 */
function findExhibitLinks(fullFilingText, agreementName) {
  var links = [];
  var nameTokens = (agreementName || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter(function(w){ return w.length >= 4; });
  if (nameTokens.length === 0) return links;
  // Parse exhibit table entries: <FILENAME>ex10-1.htm</FILENAME> ... <DESCRIPTION>Purchase Agreement</DESCRIPTION>
  var entries = [];
  var fnRe = /<FILENAME>\s*([^<\s]+)\s*<\/FILENAME>/gi;
  var descRe = /<DESCRIPTION>\s*([^<]+)\s*<\/DESCRIPTION>/gi;
  var fns = [], descs = [];
  var m;
  while ((m = fnRe.exec(fullFilingText)) !== null) fns.push(m[1]);
  while ((m = descRe.exec(fullFilingText)) !== null) descs.push(m[1]);
  for (var i = 0; i < fns.length; i++) {
    var fn = fns[i].toLowerCase();
    if (!/ex(?:10|2|4|99)|\.htm|\.txt/i.test(fn)) continue;
    var desc = (descs[i] || fn).toLowerCase();
    var match = nameTokens.some(function(tok){ return desc.indexOf(tok) >= 0; });
    if (match) links.push(fns[i]);
  }
  return links;
}

/**
 * Download a filing and extract its text.
 * For 8-K filings, also try to download linked exhibits (EX-10.x, EX-4.x).
 */
async function downloadFilingText(cik, acc) {
  try {
    var accNoDash = acc.replace(/-/g, '');
    var url = SEC_ARCH + '/' + cik + '/' + accNoDash + '/' + acc + '.txt';
    var r = await fetch(url, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return null;
    var fullText = await r.text();

    // First, extract defined terms from the COMPLETE submission (includes exhibits)
    // The full .txt submission contains all exhibits concatenated
    var rawClean = fullText
      .replace(/<[^>]+>/g, ' ')
      .replace(/&#[0-9]+;/gi, ' ')
      .replace(/&[a-z]+;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Also try to find and download individual exhibits
    var exhibitText = await downloadExhibits(fullText, cik, accNoDash);

    // Combine: raw clean text (has exhibits) + any downloaded exhibits
    var combined = rawClean.slice(0, 50000);
    if (exhibitText) combined = combined + '\n\n===EXHIBIT DOWNLOAD===\n' + exhibitText;

    return combined;
  } catch (e) {
    return null;
  }
}

/**
 * Parse EX-10.x/EX-4.x exhibit filenames from full filing and download them.
 */
async function downloadExhibits(fullFilingText, cik, accNoDash) {
  try {
    // Find exhibit filenames: <FILENAME>ex10-4.htm</FILENAME> etc.
    var exhibitPattern = /<FILENAME>\s*(ex(?:10|4|2|99)[^<]*(?:\.htm|\.html|\.txt))\s*<\/FILENAME>/gi;
    var filenames = [];
    var m;
    while ((m = exhibitPattern.exec(fullFilingText)) !== null) {
      var fn = m[1].toLowerCase().trim();
      if (filenames.indexOf(fn) < 0) filenames.push(fn);
    }

    if (filenames.length === 0) return null;

    var allExhibitText = [];
    for (var ei = 0; ei < Math.min(5, filenames.length); ei++) {
      var exhibitUrl = SEC_ARCH + '/' + cik + '/' + accNoDash + '/' + filenames[ei];
      try {
        var er = await fetch(exhibitUrl, {
          headers: { 'User-Agent': UA },
          signal: AbortSignal.timeout(12000),
        });
        if (!er.ok) continue;
        var etext = await er.text();
        // Strip HTML tags
        etext = etext.replace(/<[^>]+>/g, ' ').replace(/&#[0-9]+;/gi, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();
        if (etext.length > 200) {
          allExhibitText.push('===EXHIBIT ' + filenames[ei] + '===\n' + etext.slice(0, 15000));
        }
      } catch (ex) {}
    }
    return allExhibitText.length > 0 ? allExhibitText.join('\n\n') : null;
  } catch (e) {
    return null;
  }
}

const { extractDefinedTerms } = require('./term-extractor');

/**
 * Normalize a natural-language month (incl. abbreviations) so Date.parse works.
 */
function normalizeDateStr(dateStr) {
  var monthMap = { 'jan': 'January', 'feb': 'February', 'mar': 'March', 'apr': 'April', 'may': 'May', 'jun': 'June', 'jul': 'July', 'aug': 'August', 'sep': 'September', 'oct': 'October', 'nov': 'November', 'dec': 'December' };
  var out = String(dateStr || '');
  for (var mk in monthMap) {
    out = out.replace(new RegExp('\\b' + mk + '\\.?\\b', 'i'), monthMap[mk]);
  }
  return out;
}

/**
 * Extract the full text of a referenced document, trying (in order):
 *   1. A date-lookup against the FULL filing history (±45 days, broad forms).
 *   2. An "incorporated by reference" direct pointer.
 *   3. An exhibit-index name match in the CURRENT amendment.
 * Returns { context, terms } or null if all fallbacks fail.
 */
async function resolveReferencedDocument(cik, amendmentText, ref) {
  var dateStr = normalizeDateStr(ref.dateStr);
  var parsed = new Date(dateStr);
  var dateValid = !isNaN(parsed.getTime());

  // ── 1. Date lookup across FULL history, ±45 days, broad forms ──
  if (dateValid) {
    var start = parsed.getTime() - 45 * 86400000;
    var end = parsed.getTime() + 45 * 86400000;
    var history = await loadFilingHistory(cik);
    var broadForms = ['8-K', '10-Q', '10-K', 'S-1', 'S-3', 'S-4', 'DEF 14A', '424B2', '424B3', '424B4', '424B5'];
    var matched = null;
    for (var hi = 0; hi < history.length; hi++) {
      var hf = history[hi];
      if (!hf.filingDate) continue;
      var t = new Date(hf.filingDate).getTime();
      if (t < start || t > end) continue;
      if (broadForms.indexOf(hf.form) < 0) continue;
      // Prefer an 8-K (most likely to attach the agreement as an exhibit) over periodic reports.
      if (!matched || (hf.form === '8-K' && matched.form !== '8-K')) matched = hf;
    }
    if (matched) {
      var text1 = await downloadFilingText(cik, matched.accessionNumber);
      if (text1) {
        var terms1 = extractDefinedTerms(text1.slice(0, 60000));
        if (Object.keys(terms1).length === 0) {
          var second1 = text1.slice(30000, 90000);
          if (second1.length > 1000) {
            var terms1b = extractDefinedTerms(second1);
            Object.keys(terms1b).forEach(function(k){ terms1[k] = terms1b[k]; });
          }
        }
        console.log('    [CDR] Matched: ' + matched.form + ' on ' + matched.filingDate + ' (' + matched.accessionNumber.slice(0, 15) + '...) terms=' + Object.keys(terms1).length);
        // Extract the DOCUMENT BODY, not the SEC header. The full .txt submission
        // starts with a header (accession number / submission type / item info),
        // then the actual agreement text. Skip the header to surface the terms.
        var ctx1;
        var exhibitMarker = text1.indexOf('===EXHIBIT DOWNLOAD===');
        if (exhibitMarker >= 0) {
          ctx1 = text1.slice(exhibitMarker, exhibitMarker + 5000);
        } else {
          var bodyMarker = text1.search(/ITEM\s+INFORMATION|Item\s+1\.01|Entry\s+into|Pursuant\s+to|WHEREAS|Agreement/i);
          if (bodyMarker >= 0) ctx1 = text1.slice(bodyMarker, bodyMarker + 5000);
          else ctx1 = text1.slice(1200, 6200); // fallback: skip the header
        }
        return { context: ctx1.replace(/\s+/g, ' ').trim(), terms: terms1, filing: matched };
      }
    }
  }

  // ── 2. "Incorporated by reference" direct pointer ──
  var incorpRefs = findIncorporationReferences(amendmentText);
  for (var ii = 0; ii < incorpRefs.length; ii++) {
    var ir = incorpRefs[ii];
    var irDate = new Date(normalizeDateStr(ir.dateStr));
    if (isNaN(irDate.getTime())) continue;
    var irHistory = await loadFilingHistory(cik);
    var irMatch = null;
    for (var ji = 0; ji < irHistory.length; ji++) {
      var jf = irHistory[ji];
      if (!jf.filingDate) continue;
      var jt = new Date(jf.filingDate).getTime();
      if (Math.abs(jt - irDate.getTime()) <= 45 * 86400000 && jf.form === ir.formType) { irMatch = jf; break; }
    }
    if (irMatch) {
      var text2 = await downloadFilingText(cik, irMatch.accessionNumber);
      if (text2) {
        var terms2 = extractDefinedTerms(text2.slice(0, 60000));
        console.log('    [CDR] Incorporated-by-reference: ' + irMatch.form + ' ' + irMatch.filingDate + ' terms=' + Object.keys(terms2).length);
        return { context: text2.slice(0, 3000).replace(/\s+/g, ' ').trim(), terms: terms2, filing: irMatch };
      }
    }
  }

  // ── 3. Exhibit-index name match in the CURRENT amendment ──
  var acc = null;
  var accMatch = amendmentText.match(/accession[^0-9]{0,20}([0-9-]{20})/i);
  if (accMatch) acc = accMatch[1];
  if (acc) {
    var accNoDash = acc.replace(/-/g, '');
    var exhibitLinks = findExhibitLinks(amendmentText, ref.description);
    for (var ei = 0; ei < exhibitLinks.length; ei++) {
      var exUrl = SEC_ARCH + '/' + cik + '/' + accNoDash + '/' + exhibitLinks[ei];
      try {
        var er = await fetch(exUrl, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(12000) });
        if (!er.ok) continue;
        var etext = await er.text();
        etext = etext.replace(/<[^>]+>/g, ' ').replace(/&#[0-9]+;/gi, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();
        if (etext.length < 200) continue;
        var terms3 = extractDefinedTerms(etext.slice(0, 60000));
        if (Object.keys(terms3).length > 0) {
          console.log('    [CDR] Exhibit match: ' + exhibitLinks[ei] + ' terms=' + Object.keys(terms3).length);
          return { context: etext.slice(0, 3000).replace(/\s+/g, ' ').trim(), terms: terms3, filing: { form: 'EXHIBIT', date: '', accessionNumber: acc, exhibit: exhibitLinks[ei] } };
        }
      } catch (ex) { /* skip exhibit */ }
    }
  }

  return null;
}

/**
 * Main resolver: given amendment text and company CIK,
 * resolve defined terms from referenced agreements.
 * Returns enriched context string for the LLM.
 */
async function resolveDefinedTerms(amendmentText, cik) {
  var refs = findAgreementReferences(amendmentText);
  if (refs.length === 0) return { context: '', terms: {} };

  console.log('    [CDR] Found ' + refs.length + ' agreement references');
  var allTerms = {};
  var contexts = [];

  for (var ri = 0; ri < refs.length; ri++) {
    var ref = refs[ri];
    console.log('    [CDR] Reference: "' + ref.description + '" dated ' + ref.dateStr);

    var resolved = await resolveReferencedDocument(cik, amendmentText, ref);
    if (!resolved) {
      console.log('    [CDR] No matching filing found near ' + ref.dateStr + ' (tried date / incorporated-by-reference / exhibit index)');
      continue;
    }

    // Merge terms
    Object.keys(resolved.terms).forEach(function(k) {
      if (!allTerms[k] || resolved.terms[k] < allTerms[k]) allTerms[k] = resolved.terms[k];
    });

    contexts.push('Referenced agreement (' + (resolved.filing.form || 'EXHIBIT') + '): ' + resolved.context.slice(0, 2000));
  }

  var contextStr = '';
  if (Object.keys(allTerms).length > 0) {
    contextStr += 'DEFINED TERMS FROM REFERENCED AGREEMENTS:\n';
    Object.keys(allTerms).forEach(function(k) {
      contextStr += '  ' + k + ' = ' + allTerms[k] + '\n';
    });
    contextStr += '\n';
  }
  if (contexts.length > 0) {
    contextStr += 'REFERENCED AGREEMENT EXCERPTS:\n' + contexts.join('\n\n');
  }

  return { context: contextStr, terms: allTerms };
}

module.exports = { resolveDefinedTerms, findAgreementReferences, findIncorporationReferences, loadFilingHistory, extractDefinedTerms };
