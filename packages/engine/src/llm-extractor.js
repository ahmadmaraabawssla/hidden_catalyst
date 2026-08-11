/**
 * Hidden Catalyst — LLM Extraction Engine v3
 * Two-pass: structured facts then hidden angle discovery.
 * "NO_HIDDEN_ANGLE" is a valid and frequent outcome.
 * 
 * v3: Cross-document resolution, cash/dilution separation, financial materiality,
 *     contradictions vs missing info, open questions, system-monitored signals.
 */
const DEEPSEEK_API = 'https://api.deepseek.com/v1/chat/completions';
const MODEL = 'deepseek-chat';
let API_KEY = process.env.DEEPSEEK_API_KEY || '';
function setApiKey(key) { API_KEY = key; }

const PROFILES = {
  bdc: { name:'BDC', metrics:['Total investment income','Net investment income','NII/share','NAV','NAV/share','Portfolio fair value','Portfolio companies','New investments','Repayments','Weighted avg portfolio yield','Non-accrual rate','PIK income','Realized gains/losses','Unrealized gains/losses','Total debt','Cost of debt','Leverage','Distribution declared','Distribution coverage'] },
  bank: { name:'Bank', metrics:['Total deposits','Net interest margin','CET1 ratio','Loan growth','Deposit costs','Credit loss provisions','Tangible book value/share','Efficiency ratio','NPL ratio'] },
  biotech: { name:'Biotech', metrics:['Cash','Cash runway','R&D expense','Trial phase','Patient enrollment','FDA milestone dates','Partnership revenue'] },
  saas: { name:'SaaS', metrics:['ARR','Net retention rate','Gross margin','Free cash flow','RPO','Customer count'] },
  industrial: { name:'Industrial', metrics:['Revenue','Backlog','Gross margin','Operating income','Capacity utilization','Customer concentration','CapEx'] },
  general: { name:'General', metrics:['Revenue','Revenue growth','EPS','Gross margin','Operating margin','Cash','Total debt','Free cash flow','Guidance'] },
};

function detectProfile(company, ticker, form, sector) {
  var n = (company+' '+sector+' '+form).toLowerCase();
  if (/bdc|business.?development|capital.?corp|capital.?inc/i.test(n)||ticker==='TRIN')return 'bdc';
  if (sector==='Financial Services'||/bancorp|bank|financial/i.test(n))return 'bank';
  if (sector==='Healthcare'&&(/therapeutics|pharma|bio[lt]|medicine/i.test(n)))return 'biotech';
  if (sector==='Technology'&&(/software|cloud|saas/i.test(n)))return 'saas';
  if (sector==='Industrials'||/manufacturing|industrial/i.test(n))return 'industrial';
  return 'general';
}

async function callAI(messages, timeout) {
  try {
    var r = await fetch(DEEPSEEK_API,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+API_KEY},body:JSON.stringify({model:MODEL,messages:messages,temperature:0.1,max_tokens:4000,response_format:{type:'json_object'}}),signal:AbortSignal.timeout(timeout||30000)});
    if(!r.ok)return null;
    var d = await r.json();
    var c = d&&d.choices&&d.choices[0]&&d.choices[0].message&&d.choices[0].message.content;
    return c ? JSON.parse(c) : null;
  }catch(e){return null}
}

function pass1Prompt(text, company, ticker, form, profile) {
  var metrics = profile.metrics.map(function(m){return '    "'+m+'": "value or null"';}).join(',\n');
  return [
    'Extract structured facts from '+form+' by '+company+' ('+ticker+'), '+profile.name+' sector.',
    'For financing/filing documents, also extract:',
    '  "maximumPaymentLiability": "amount",',
    '  "paymentFormula": "trigger conditions",',
    '  "contractualPriceThreshold": "Minimum Price, Floor Price if present",',
    '  "commitmentFee": "definition and amount",',
    '  "elocMaxCapacity": "equity line maximum",',
    '  "shareIssuanceLimits": "exchange cap, ownership limit",',
    '  "warrantTerms": "quantity, strike, expiration",',
    '  "counterpartyName": "counterparty",',
    '  "measurementDate": "date",',
    '  "referencedAgreementName": "name of any referenced agreement",',
    '  "referencedAgreementDate": "date of referenced agreement",',
    'Return JSON. Only extract EXPLICITLY stated values. Use null if absent. No estimates.',
    '',
    'Filing:',
    text.slice(0,14000)
  ].join('\n');
}

function pass2Prompt(text, company, ticker, form, profile, factsStr, companyContext) {
  var cc = companyContext ? '\nRECENT COMPANY CONTEXT (last 90 days):\n' + companyContext + '\n' : '';
  return [
    'You are Hidden Catalyst — an investigative financial intelligence system.',
    'Your job: determine if this '+form+' from '+company+' ('+ticker+') contains a HIDDEN opportunity.',
    '',
    'CRITICAL DEFAULT: "NO_HIDDEN_ANGLE" is the correct answer for most filings.',
    'Only flag concrete, evidence-backed, non-obvious insights.',
    '',
    profile.name+' sector. Extracted facts:',
    factsStr.slice(0,3000),
    cc,
    '',
    '=== CROSS-DOCUMENT RESOLUTION (MOST IMPORTANT) ===',
    'If this filing AMENDS or REFERENCES an earlier agreement, defined terms (Minimum Price,',
    'Commitment Fee Price, Effective Amount, etc.) are defined in the REFERENCED agreement,',
    'not this amendment. Do NOT stop at "this document does not disclose X". Instead:',
    '1. Identify which terms are referenced but not defined here',
    '2. Note the exact agreement name and date referenced',
    '3. In hiddenAngle, explain: "X is defined in the [Agreement] dated [Date] —',
    '   this value needs to be resolved from that filing"',
    '4. Include referenced terms in verifiedFacts with source "referenced_agreement"',
    'The goal is NEVER "this document lacked information."',
    'The goal is "the answer is in the evidence chain, here is where to find it."',
    '',
    '=== DEEP HIDDEN ANGLE ===',
    'Do NOT just summarize the amendment. Explain WHY this clause is interesting RIGHT NOW.',
    'Ask: Is the stock near the threshold? How likely is this to matter? Financial magnitude?',
    'How does this interact with existing financing? Has the market reacted?',
    'The hidden angle = the IMPLICATION combined with evidence, not the clause itself.',
    '',
    '=== SEPARATE CASH FROM DILUTION ===',
    'If the filing creates both cash obligations and dilution potential, separate them:',
    '- hiddenAngle.cashExposure: amount, trigger, likelihood',
    '- hiddenAngle.dilutionExposure: potential shares, % outstanding, terms',
    '- hiddenAngle.capitalOverhang: warrants, convertibles, future obligations',
    'Do NOT blur them into one vague statement like "cash liability and dilution risk."',
    '',
    '=== FINANCIAL MATERIALITY (CALCULATE, DO NOT ASSERT) ===',
    'Never just say "the liability is material." Calculate it. Provide:',
    '- financialMateriality.amount: specific dollar exposure',
    '- financialMateriality.level: "HIGH / MEDIUM / LOW"',
    '- financialMateriality.confidence: "HIGH / MEDIUM / LOW — reason"',
    'If inputs are stale: "Confidence LOW because latest balance sheet pre-dates the transaction."',
    'If unknown: say so. Do not fabricate numbers.',
    '',
    '=== CONTRADICTIONS vs MISSING INFORMATION ===',
    'contradictions: evidence that WEAKENS the thesis (e.g., "payment is conditional, not guaranteed")',
    'missingInfo: inputs needed to increase confidence (e.g., "current cash balance unknown")',
    'Missing data is NOT a contradiction. Do not put "filing does not disclose X" in contradictions.',
    'Provide TWO SEPARATE arrays.',
    '',
    '=== OPEN QUESTIONS ===',
    'List 3-8 specific, actionable unresolved questions. Reference exact values or events.',
    'Example: "What is the exact contractual Minimum Price?" NOT "What is the price?"',
    '',
    '=== WHAT-TO-WATCH (SYSTEM-MONITORED, NOT PASSIVE) ===',
    'Generate signals Hidden Catalyst can track automatically:',
    '- Price: "Stock drops below $X.XX (Minimum Price threshold)"',
    '- SEC filings: "Registration statement declared effective"',
    '- Shares: "New shares issued under facility (>Y% dilution)"',
    '- Cash: "Next 10-Q shows unrestricted cash below $Z"',
    '- Corporate: "Reverse split filed", "Warrant exercises on Form 4"',
    'Each needs a specific threshold or trigger event, NOT "company discloses X."',
    '',
    '=== WHY IT MATTERS ===',
    '2-3 sentence financial explanation. NOT a repetition of the filing metadata.',
    'Focus on: maximum exposure, current capacity to absorb it,',
    'why the market might not have priced it in.',
    'Example: "The $1M true-up would represent X% of latest reported cash of $Y.',
    'This adds another cost layer to an equity financing structure.',
    'The market may not have priced the interaction between the true-up and existing dilution."',
    '',
    '=== TITLE ===',
    'insightTitle: "TICKER: specific insight." NOT "[8-K] Company Name" or truncated text.',
    'Example: "Issuer filing adds a material financing obligation tied to a contractual price threshold"',
    '',
    '=== VERIFICATION GATE ===',
    'verificationConfidence >= 0.85: thresholds resolved, market data cross-referenced, cross-refs resolved → verified',
    'verificationConfidence 0.7-0.85: interesting but missing context → candidate',
    'verificationConfidence < 0.7: interesting direction, needs investigation → watch',
    'Most first-pass analyses should be candidate or watch.',
    'Only mark verified when ALL cross-references are resolved and current data integrated.',
    '',
    'Return JSON:',
    '{',
    '  "shouldQualify": true/false,',
    '  "isRoutine": true/false,',
    '  "insightTitle": "TICKER: one-line discovery",',
    '  "whyItMatters": "2-3 sentence financial explanation",',
    '  "hiddenAngle": {',
    '    "claim": "The non-obvious insight — implication, not summary",',
    '    "supporting_evidence": "Evidence from filing backing this claim",',
    '    "reasoning": "Why non-obvious and why it matters now",',
    '    "confidence": 0.0-1.0,',
    '    "cashExposure": {"amount":"$X","trigger":"description","likelihood":"low/medium/high"},',
    '    "dilutionExposure": {"potentialShares":"X","pctOfOutstanding":"X%","terms":"desc"},',
    '    "capitalOverhang": "warrants, convertibles, future obligations"',
    '  },',
    '  "financialMateriality": {',
    '    "amount": "$X",',
    '    "level": "HIGH/MEDIUM/LOW",',
    '    "confidence": "HIGH/MEDIUM/LOW — reason"',
    '  },',
    '  "verifiedFacts": [',
    '    {"fact":"fact text","value":"extracted value","source":"this_amendment or referenced_agreement","agreementRef":"if referenced"}',
    '  ],',
    '  "contradictions": ["evidence that weakens thesis"],',
    '  "missingInfo": ["inputs needed for confidence"],',
    '  "openQuestions": ["specific unresolved questions"],',
    '  "whatToWatch": ["system-monitored signals with thresholds"],',
    '  "verificationConfidence": 0.0-1.0,',
    '  "capitalStructureComplexity": "low/medium/high",',
    '  "materialityScore": 0-100,',
    '  "catalystAttentionScore": 0-100',
    '}'
  ].join('\n');
}

async function extractFromFiling(filingText, companyName, ticker, formType, sector, companyContext) {
  formType = formType||'8-K';
  if(!API_KEY||!filingText||filingText.length<100)return null;
  var profile = PROFILES[detectProfile(companyName,ticker,formType,sector||'')];
  console.log('  [LLM v3] '+ticker+': '+profile.name+' profile, Pass 1...');
  var facts = await callAI([{role:'system',content:'Extract structured financial facts. Return JSON only. Never fabricate.'},{role:'user',content:pass1Prompt(filingText,companyName,ticker,formType,profile)}],25000);
  if(!facts){return null}
  console.log('  [LLM v3] '+ticker+': Pass 2 — hidden angle...');
  var a = await callAI([{role:'system',content:'You are a critical financial researcher. Default answer: NO_HIDDEN_ANGLE. Only flag concrete evidence-backed insights. Follow the evidence chain — do not stop because one document lacks information.'},{role:'user',content:pass2Prompt(filingText,companyName,ticker,formType,profile,JSON.stringify(facts),companyContext)}],35000);
  if(!a){return null}
  var qualified = a.shouldQualify===true&&a.hiddenAngle!=null&&!a.isRoutine;
  var verConf = a.verificationConfidence||a.hiddenAngle?.confidence||0.7;
  var ha = a.hiddenAngle||null;
  var verification = qualified ? (verConf >= 0.85 ? 'verified' : 'candidate') : (a.isRoutine ? 'rejected' : 'watch');
  var title = a.insightTitle || (ha ? (ticker+': '+ha.claim.slice(0,80)) : ('['+formType+'] '+companyName));

  // Convert new structured facts format
  var factsArray = [];
  if(Array.isArray(a.verifiedFacts)) {
    for(var fi = 0; fi < a.verifiedFacts.length; fi++) {
      var f = a.verifiedFacts[fi];
      if(typeof f === 'string') {
        factsArray.push(f);
      } else if(f && f.fact) {
        var prefix = f.source === 'referenced_agreement' ? '[Ref: '+(f.agreementRef||'prior agreement')+'] ' : '';
        factsArray.push(prefix + f.fact + ': ' + (f.value || ''));
      }
    }
  }
  // Fallback: old format from Pass 1
  if(factsArray.length === 0) {
    factsArray = Object.entries(facts||{}).filter(function(e){return e[1]!=null&&e[1]!==''}).map(function(e){return e[0]+': '+e[1]});
  }

  console.log('  [LLM v3] '+ticker+': routine='+a.isRoutine+' hidden='+(ha!=null)+' qualify='+qualified+' verConf='+verConf.toFixed(2)+' → '+verification);
  return {
    eventType:'other',
    eventSummary:title,
    verifiedFacts:factsArray,
    inferences:ha?[{text:ha.claim,confidence:ha.confidence||0.7}]:[],
    materialityScore:a.materialityScore||50,
    overlookedReasons:ha?[ha.reasoning]:[],
    riskFlags:a.riskFlags||[],
    confidence:verConf,
    qualified:qualified,
    hiddenAngle:ha,
    isRoutine:a.isRoutine,
    contradictions:a.contradictions||[],
    missingInfo:a.missingInfo||[],
    openQuestions:a.openQuestions||[],
    whatToWatch:a.whatToWatch||[],
    whyItMatters:a.whyItMatters||'',
    financialMateriality:a.financialMateriality||null,
    catalystAttentionScore:a.catalystAttentionScore||50,
    extractedFacts:facts,
    industryProfile:profile.name,
    verificationConfidence:verConf,
    capitalStructureComplexity:a.capitalStructureComplexity||'unknown',
    verificationStatus:verification,
    insightTitle:a.insightTitle||null,
  };
}

module.exports = { setApiKey, extractFromFiling, detectProfile, PROFILES };
