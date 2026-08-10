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

    for (var i = 0; i < Math.min(100, recent.form.length); i++) {
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
 * Download a filing and extract its text.
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
    var textStart = fullText.indexOf('<TEXT>');
    if (textStart < 0) return null;
    return fullText
      .slice(textStart + 6)
      .replace(/<[^>]+>/g, ' ')
      .replace(/&#[0-9]+;/gi, ' ')
      .replace(/&[a-z]+;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  } catch (e) {
    return null;
  }
}

const { extractDefinedTerms } = require('./term-extractor');

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

    // Parse the date from natural language to a Date range
    // Handle "July 14, 2026", "Jul 14 2026", "14-Jul-2026" etc.
    var dateStr = ref.dateStr;
    // Normalize abbreviated months
    var monthMap = { 'jan': 'January', 'feb': 'February', 'mar': 'March', 'apr': 'April', 'may': 'May', 'jun': 'June', 'jul': 'July', 'aug': 'August', 'sep': 'September', 'oct': 'October', 'nov': 'November', 'dec': 'December' };
    for (var mk in monthMap) {
      var re = new RegExp('\\b' + mk + '\\b', 'i');
      dateStr = dateStr.replace(re, monthMap[mk]);
    }
    var parsed = new Date(dateStr);
    if (isNaN(parsed.getTime())) continue;

    // Search 3 days before and after the referenced date
    var start = parsed.getTime() - 3 * 86400000;
    var end = parsed.getTime() + 3 * 86400000;

    // Try to find the filing (8-K, 10-Q, or EX-10 exhibit)
    var filing = await findFilingByDate(cik, start, end, ['8-K', '10-Q', '10-K']);
    if (!filing) {
      console.log('    [CDR] No matching filing found near ' + ref.dateStr);
      continue;
    }

    console.log('    [CDR] Matched: ' + filing.form + ' on ' + filing.date + ' (' + filing.acc.slice(0, 15) + '...)');

    var text = await downloadFilingText(cik, filing.acc);
    if (!text) continue;

    var terms = extractDefinedTerms(text.slice(0, 20000));
    console.log('    [CDR] Extracted terms: ' + JSON.stringify(terms).slice(0, 200));

    // Merge terms
    Object.keys(terms).forEach(function(k) {
      if (!allTerms[k] || terms[k] < allTerms[k]) allTerms[k] = terms[k];
    });

    // Build context snippet
    var snippet = text.slice(0, 3000).replace(/\s+/g, ' ').trim();
    contexts.push('Referenced agreement (' + filing.form + ' filed ' + filing.date + '): ' + snippet.slice(0, 2000));
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

module.exports = { resolveDefinedTerms, findAgreementReferences, extractDefinedTerms };
