/**
 * Hidden Catalyst — LLM Extraction Engine v2
 * Two-pass: structured facts then hidden angle discovery.
 * "NO_HIDDEN_ANGLE" is a valid and frequent outcome.
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
  return 'Extract structured facts from '+form+' by '+company+' ('+ticker+'), '+profile.name+' sector.\nReturn JSON:\n{\n'+metrics+'\n}\nOnly extract EXPLICITLY stated values. Use null if absent. No estimates.\n\nFiling:\n'+text.slice(0,14000);
}

function pass2Prompt(text, company, ticker, form, profile, factsStr, companyContext) {
  var cc = companyContext ? '\nRECENT COMPANY CONTEXT (last 90 days):\n' + companyContext + '\n' : '';
  return 'You are Hidden Catalyst. Determine if this '+form+' from '+company+' ('+ticker+') contains a HIDDEN opportunity.\n\nCRITICAL: "NO_HIDDEN_ANGLE" is the DEFAULT answer. Most filings are routine.\n\n'+profile.name+' sector. Facts:\n'+factsStr.slice(0,3000)+'\n'+cc+'\nRULES:\n1. Routine earnings/dividends/reports do NOT qualify\n2. A hidden angle needs SPECIFIC evidence from the filing\n3. The angle must be NON-OBVIOUS (not in the press release title)\n4. Actively search for CONTRADICTIONS\n\nCROSS-DOCUMENT RESOLUTION:\n- If the filing AMENDS or REFERENCES an earlier agreement, note that defined terms (Minimum Price, Commitment Fee Price, etc.) are likely defined in the ORIGINAL filing, not this amendment.\n- When the amendment says "X is defined in the Purchase Agreement", explicitly note: "X is defined in the referenced agreement (not in this amendment)."\n- Do NOT claim "the filing does not disclose X" if X is simply defined in a referenced contract.\n\nVERIFICATION GATE:\n- confidence 0.9+: strong hidden angle, multiple facts confirmed → VERIFIED\n- confidence 0.7-0.9: interesting but missing context → CANDIDATE\n- confidence <0.7: interesting direction, needs investigation → WATCH\n- Do NOT mark as "Verified" unless ALL of: exact amendment text verified, key thresholds resolved, current market data cross-referenced, capital structure understood.\n\nTITLE GENERATION:\n- Generate an INSIGHT TITLE (not "[8-K] Company Name").\n- Format: "TICKER: specific insight about what was discovered"\n- Example: "GCTK trades near $0.39912 financing threshold as White Lion amendment adds potential $1M true-up"\n- The title should tell the reader WHY they should care in one line.\n\nWHAT-TO-WATCH:\n- Generate SPECIFIC monitoring signals with THRESHOLDS where applicable.\n- Example: "Monitor whether stock price drops below $0.39912 (Nasdaq Minimum Price)" NOT "Company discloses stock price"\n- Example: "Track registration statement effectiveness date (determines Commitment Fee Price measurement)"\n- Reference exact dollar amounts, dates, and contract terms from the filing.\n\nCAPITAL STRUCTURE:\n- If the company recently completed a merger, reverse split, or financing round, flag: "CAP TABLE COMPLEXITY: HIGH"\n- Do not rely on pre-merger share counts to calculate market cap or dilution.\n\nReturn JSON:\n{"isRoutine":true/false,"hiddenAngle":null or {"claim":"...","supportingEvidence":"direct quote","reasoning":"...","confidence":0.75},"contradictions":["..."],"whatToWatch":["..."],"insightTitle":"TICKER: one-line insight title","materialityScore":50,"catalystAttentionScore":50,"riskFlags":[],"capitalStructureComplexity":"low/medium/high","shouldQualify":true/false,"verificationConfidence":0.7}\n\nFiling:\n'+text.slice(0,10000);\n}
}

async function extractFromFiling(filingText, companyName, ticker, formType, sector, companyContext) {
  formType = formType||'8-K';
  if(!API_KEY||!filingText||filingText.length<100)return null;
  var profile = PROFILES[detectProfile(companyName,ticker,formType,sector||'')];
  console.log('  [LLM v2] '+ticker+': '+profile.name+' profile, Pass 1...');
  var facts = await callAI([{role:'system',content:'Extract structured financial facts. Return JSON only. Never fabricate.'},{role:'user',content:pass1Prompt(filingText,companyName,ticker,formType,profile)}],25000);
  if(!facts){return null}
  console.log('  [LLM v2] '+ticker+': Pass 2 — hidden angle...');
  var a = await callAI([{role:'system',content:'You are a critical researcher. Default answer: NO_HIDDEN_ANGLE. Only flag concrete evidence-backed insights.'},{role:'user',content:pass2Prompt(filingText,companyName,ticker,formType,profile,JSON.stringify(facts),companyContext)}],30000);
  if(!a){return null}
  var qualified = a.shouldQualify===true&&a.hiddenAngle!=null&&!a.isRoutine;
  var verConf = a.verificationConfidence||a.hiddenAngle?.confidence||0.7;
  var ha = a.hiddenAngle||null;
  var verification = qualified ? (verConf >= 0.85 ? 'verified' : 'candidate') : (a.isRoutine ? 'rejected' : 'watch');
  // Use LLM-generated insight title, fall back to old format
  var title = a.insightTitle || (ha ? (ticker+': '+ha.claim.slice(0,80)) : ('['+formType+'] '+companyName));
  console.log('  [LLM v2] '+ticker+': routine='+a.isRoutine+' hidden='+(ha!=null)+' qualify='+qualified+' verConf='+verConf.toFixed(2)+' → '+verification);
  return {eventType:'other',eventSummary:title,verifiedFacts:Object.entries(facts||{}).filter(function(e){return e[1]!=null&&e[1]!==''}).map(function(e){return e[0]+': '+e[1]}),inferences:ha?[{text:ha.claim,confidence:ha.confidence||0.7}]:[],materialityScore:a.materialityScore||50,overlookedReasons:ha?[ha.reasoning]:[],riskFlags:a.riskFlags||[],confidence:verConf,qualified:qualified,hiddenAngle:ha,isRoutine:a.isRoutine,contradictions:a.contradictions||[],whatToWatch:a.whatToWatch||[],catalystAttentionScore:a.catalystAttentionScore||50,extractedFacts:facts,industryProfile:profile.name,verificationConfidence:verConf,capitalStructureComplexity:a.capitalStructureComplexity||'unknown',verificationStatus:verification,insightTitle:a.insightTitle||null};
}

module.exports = { setApiKey, extractFromFiling, detectProfile, PROFILES };
