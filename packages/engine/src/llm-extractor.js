// Hidden Catalyst — LLM Extraction Engine (CommonJS)
// Uses DeepSeek API to read and understand SEC filings.
// DeepSeek: OpenAI-compatible, $0.14/1M tokens

const DEEPSEEK_API = 'https://api.deepseek.com/v1/chat/completions';
const MODEL = 'deepseek-chat';

let API_KEY = process.env.DEEPSEEK_API_KEY || '';

function setApiKey(key) { API_KEY = key; }

const SYSTEM_PROMPT =
  'You are an expert financial analyst at Hidden Catalyst, a research platform that discovers material public developments for underfollowed public companies. ' +
  'Your task: read an SEC 8-K filing and extract structured intelligence. ' +
  'CRITICAL RULES: 1. Only extract information EXPLICITLY stated in the filing. Do not fabricate. ' +
  '2. Separate verified facts (direct quotes from filing) from inferences (your analysis). ' +
  '3. For dollar amounts, extract the exact figure. If unclear, note uncertainty. ' +
  '4. For parties, use legal names as stated. ' +
  '5. Materiality score 0-100: 90+ acquisition/major contract/CEO departure, 70-89 material agreement, 50-69 regulatory, 30-49 routine, 10-29 procedural. ' +
  '6. Overlooked reasons: be SPECIFIC and data-driven. Not "small company" but "Only 2 analysts cover this $300M company; filed 4:30 PM Friday; no press release." ' +
  '7. Scenarios: bull (best realistic), base (most likely), bear (worst realistic). Never claim guaranteed outcomes. ' +
  '8. Respond ONLY with valid JSON. No markdown, no explanation outside JSON.';

function buildPrompt(filingText, companyName, ticker, formType) {
  return 'Analyze this ' + formType + ' filing from ' + companyName + ' (' + ticker + '):\n\n---\n' +
    filingText.slice(0, 12000) + '\n---\n\n' +
    'Return a JSON object with these fields:\n' +
    '{\n' +
    '  "eventType": "string (e.g., material_agreement, acquisition, earnings, director_change, regulatory, other)",\n' +
    '  "eventSummary": "One paragraph plain English summary of what happened",\n' +
    '  "parties": [{"name": "Company or person", "role": "counterparty/acquirer/target/officer"}],\n' +
    '  "dollarAmounts": [{"amount": 42000000, "currency": "USD", "description": "Contract value"}],\n' +
    '  "materialityScore": 75,\n' +
    '  "materialityRationale": "Why this score",\n' +
    '  "overlookedReasons": ["Reason 1", "Reason 2", "Reason 3"],\n' +
    '  "bullCase": "Best realistic outcome scenario",\n' +
    '  "baseCase": "Most likely outcome",\n' +
    '  "bearCase": "Worst realistic outcome",\n' +
    '  "verifiedFacts": ["Direct quote or near-quote fact from the filing"],\n' +
    '  "inferences": [{"text": "Inference text", "confidence": 0.75}],\n' +
    '  "riskFlags": [{"type": "regulatory/execution/market/financial", "severity": "low/medium/high", "description": "Specific risk"}],\n' +
    '  "confidence": 0.85,\n' +
    '  "uncertaintyNotes": ["What you are unsure about"]\n' +
    '}';
}

async function extractFromFiling(filingText, companyName, ticker, formType) {
  formType = formType || '8-K';
  if (!API_KEY) {
    console.error('[LLM] No API key set.');
    return null;
  }

  try {
    const response = await fetch(DEEPSEEK_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + API_KEY,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildPrompt(filingText, companyName, ticker, formType) },
        ],
        temperature: 0.1,
        max_tokens: 4000,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const errText = await response.text().catch(function() { return ''; });
      console.error('[LLM] DeepSeek API error ' + response.status + ': ' + errText.slice(0, 200));
      return null;
    }

    const data = await response.json();
    const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;

    if (!content) {
      console.error('[LLM] Empty response');
      return null;
    }

    const parsed = JSON.parse(content);

    // Validate required
    if (!parsed.eventType || !parsed.eventSummary) {
      console.error('[LLM] Missing required fields');
      return null;
    }

    // Normalize
    const result = {
      eventType: String(parsed.eventType || 'other').toLowerCase().replace(/\s+/g, '_'),
      eventSummary: String(parsed.eventSummary || '').slice(0, 500),
      parties: Array.isArray(parsed.parties) ? parsed.parties.map(function(p) {
        return { name: String(p.name || '').slice(0, 100), role: String(p.role || '').slice(0, 50) };
      }) : [],
      dollarAmounts: Array.isArray(parsed.dollarAmounts) ? parsed.dollarAmounts.map(function(a) {
        return { amount: Number(a.amount) || 0, currency: String(a.currency || 'USD'), description: String(a.description || '').slice(0, 200) };
      }) : [],
      materialityScore: Math.max(10, Math.min(100, Number(parsed.materialityScore) || 50)),
      materialityRationale: String(parsed.materialityRationale || '').slice(0, 300),
      overlookedReasons: Array.isArray(parsed.overlookedReasons) ? parsed.overlookedReasons.map(String).slice(0, 3) : [],
      bullCase: String(parsed.bullCase || '').slice(0, 400),
      baseCase: String(parsed.baseCase || '').slice(0, 400),
      bearCase: String(parsed.bearCase || '').slice(0, 400),
      verifiedFacts: Array.isArray(parsed.verifiedFacts) ? parsed.verifiedFacts.map(String).slice(0, 8) : [],
      inferences: Array.isArray(parsed.inferences) ? parsed.inferences.map(function(i) {
        return { text: String(i.text || '').slice(0, 300), confidence: Math.max(0.1, Math.min(1.0, Number(i.confidence) || 0.5)) };
      }).slice(0, 4) : [],
      riskFlags: Array.isArray(parsed.riskFlags) ? parsed.riskFlags.map(function(r) {
        return {
          type: String(r.type || 'other'),
          severity: ['low','medium','high'].indexOf(r.severity) >= 0 ? r.severity : 'medium',
          description: String(r.description || '').slice(0, 200)
        };
      }).slice(0, 5) : [],
      confidence: Math.max(0.1, Math.min(1.0, Number(parsed.confidence) || 0.7)),
      uncertaintyNotes: Array.isArray(parsed.uncertaintyNotes) ? parsed.uncertaintyNotes.map(String).slice(0, 5) : [],
    };

    console.log('[LLM] Extracted: ' + result.eventType + ' (materiality: ' + result.materialityScore + ', confidence: ' + result.confidence + ')');
    return result;

  } catch (err) {
    console.error('[LLM] Error: ' + (err.message || err));
    return null;
  }
}

async function extractBatch(filings, concurrency) {
  concurrency = concurrency || 3;
  var results = [];
  for (var i = 0; i < filings.length; i += concurrency) {
    var batch = filings.slice(i, i + concurrency);
    var batchResults = await Promise.all(batch.map(function(f) {
      return extractFromFiling(f.text, f.companyName, f.ticker, f.formType);
    }));
    results = results.concat(batchResults);
    if (i + concurrency < filings.length) {
      await new Promise(function(r) { setTimeout(r, 1000); });
    }
  }
  return results;
}

module.exports = { extractFromFiling, extractBatch, setApiKey };
