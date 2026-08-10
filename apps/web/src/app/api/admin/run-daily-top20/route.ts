import { NextResponse } from 'next/server';
import { prisma } from '@hidden-catalyst/db';

const DEEPSEEK_API = 'https://api.deepseek.com/v1/chat/completions';
const KEY = process.env.DEEPSEEK_API_KEY || '';
const UA = 'Hidden Catalyst contact@hiddencatalyst.com';
const TOP_N = 15;

export async function POST() {
  if (!KEY) return NextResponse.json({ error: 'DeepSeek API key not configured' }, { status: 500 });

  const steps: string[] = [];
  let published = 0;

  try {
    // 1. Get candidates
    steps.push('Scanning companies for recent 8-K filings...');
    const rows = await prisma.$queryRawUnsafe<Array<any>>(`
      SELECT c.id, c.cik, c.display_name, s.ticker, s.id as sec_id,
             COALESCE(NULLIF(s.market_cap, 0), 800000000)::float as mc
      FROM companies c JOIN securities s ON s.company_id=c.id
      WHERE c.cik IS NOT NULL AND s.active=true AND s.exchange IN ('NYSE','NASDAQ','NYSE American')
        AND NOT EXISTS (SELECT 1 FROM opportunities o WHERE o.security_id=s.id AND o.status='published')
      ORDER BY s.market_cap ASC NULLS FIRST LIMIT 200
    `);

    steps.push(`Found ${rows.length} candidates. Fetching SEC filing data...`);

    // 2. Find companies with recent 8-Ks
    const candidates: any[] = [];
    for (const co of rows) {
      try {
        const cik = String(co.cik).padStart(10, '0');
        const r = await fetch(`https://data.sec.gov/submissions/CIK${cik}.json`, {
          headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(4000)
        });
        if (!r.ok) continue;
        const d = await r.json();
        const f = d.filings?.recent;
        if (!f?.form) continue;
        for (let i = 0; i < Math.min(6, f.form.length); i++) {
          if ((f.form[i] || '').toUpperCase() !== '8-K') continue;
          const dt = f.filingDate[i]; if (!dt) continue;
          const days = (Date.now() - new Date(dt).getTime()) / 86400000;
          if (days > 14) continue;
          candidates.push({ ...co, dt, acc: f.accessionNumber[i] }); break;
        }
      } catch {}
    }

    candidates.sort((a, b) => a.mc - b.mc);
    const top = candidates.slice(0, TOP_N);
    steps.push(`Selected ${top.length} candidates. Running DeepSeek AI...`);

    // 3. Process each with DeepSeek
    for (const co of top) {
      const cik = String(co.cik).padStart(10, '0');
      let text = '';
      try {
        const nd = co.acc.replace(/-/g, '');
        const tr = await fetch(`https://www.sec.gov/Archives/edgar/data/${cik}/${nd}/${co.acc}.txt`, {
          headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000)
        });
        if (tr.ok) {
          text = await tr.text();
          const ts = text.indexOf('<TEXT>');
          text = (ts > 0 ? text.slice(ts + 6) : text.slice(0, 10000))
            .replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 8000);
        }
      } catch {}

      if (text.length < 100) { steps.push(`⚠ ${co.ticker}: no text available`); continue; }

      try {
        const ai = await fetch(DEEPSEEK_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${KEY}` },
          body: JSON.stringify({
            model: 'deepseek-chat', temperature: 0.1, max_tokens: 2500, response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: 'Analyze SEC 8-K. Return JSON: {eventType, eventSummary, verifiedFacts[], inferences[{text,confidence}], overlookedReasons[], materialityScore, riskFlags[]}' },
              { role: 'user', content: `8-K from ${co.display_name} (${co.ticker}): ${text}` },
            ],
          }),
          signal: AbortSignal.timeout(20000),
        });
        if (!ai.ok) { steps.push(`⚠ ${co.ticker}: AI API error ${ai.status}`); continue; }
        const ad = await ai.json();
        const ct = ad.choices?.[0]?.message?.content;
        if (!ct) { steps.push(`⚠ ${co.ticker}: empty AI response`); continue; }
        const p = JSON.parse(ct);

        const mc = co.mc;
        const ia = mc < 300e6 ? 88 : mc < 1e9 ? 78 : mc < 3e9 ? 62 : 48;
        const mat = Math.max(10, Math.min(100, Number(p.materialityScore) || 65));
        const sc = Math.round(0.20*ia + 0.20*70 + 0.20*92 + 0.15*mat + 0.10*62 + 0.10*65 - 0.10*45 - 0.05*(mc<1e9?15:5));

        const h = 'd20_' + cik + '_' + co.acc.replace(/-/g, '').slice(0, 12);
        const tl = `${co.display_name} (${co.ticker}): ${(p.eventSummary||'').slice(0, 80)}`;
        const sm = `[Daily Top 20] ${co.display_name} (${co.ticker}) filed 8-K on ${co.dt}. ${p.eventSummary||''}`;

        await prisma.document.create({ data: { id:'d_'+h, sourceId:'source_sec_edgar', canonicalUrl:`https://www.sec.gov/cgi-bin/browse-edgar?CIK=${cik}`, publishedAt:new Date(co.dt), retrievedAt:new Date(), contentHash:h, title:tl, text:sm } }).catch(()=>{});
        await prisma.evidenceItem.create({ data: { id:'e_'+h, documentId:'d_'+h, excerpt:(p.verifiedFacts?.[0]||sm).slice(0,500), evidenceType:'primary', qualityScore:92 } }).catch(()=>{});
        await prisma.opportunity.create({ data: { id:'o_'+h, securityId:co.sec_id, title:tl, summary:sm, status:'published', detectedAt:new Date(co.dt), publishedAt:new Date() } }).catch(()=>{});
        await prisma.claim.create({ data: { id:'cf_'+h, opportunityId:'o_'+h, claimType:'verified_fact', text:(p.verifiedFacts?.[0]||sm).slice(0,500), confidence:0.95, evidenceItemIds:['e_'+h] } }).catch(()=>{});

        const infs: Array<{text: string, confidence: number}> = p.inferences || [];
        for (let j=0;j<Math.min(infs.length,3);j++) {
          const inf = infs[j];
          if (inf) {
            await prisma.claim.create({ data: { id:`ci${j}_${h}`, opportunityId:'o_'+h, claimType:'inference', text:inf.text, confidence:inf.confidence||0.7, evidenceItemIds:['e_'+h] } }).catch(()=>{});
          }
        }

        for (const [t,v] of ([['opportunity',sc],['information_asymmetry',ia],['catalyst_strength',70],['evidence_quality',92],['financial_materiality',mat],['risk',45]] as [string,number][])) {
          await prisma.score.create({ data: { id:'s_'+t+'_'+h, opportunityId:'o_'+h, scoreType:t, value:v, factors:{mc,pipeline:'daily-top20'}, modelVersion:'3.0.0' } }).catch(()=>{});
        }

        const rs: string[] = p.overlookedReasons || [];
        for (let j=0;j<Math.min(rs.length,3);j++) {
          const r = rs[j];
          if (r) {
            await prisma.risk.create({ data: { id:`olr_${j}_${h}`, opportunityId:'o_'+h, riskType:`overlooked_reason_${j+1}`, severity:'low', description:r } }).catch(()=>{});
          }
        }
        const flags: Array<{type: string, severity: string, description: string}> = p.riskFlags || [];
        for (const rf of flags.slice(0,3)) {
          if (rf) {
            await prisma.risk.create({ data: { id:`rf_${rf.type}_${h}`, opportunityId:'o_'+h, riskType:rf.type, severity:rf.severity||'medium', description:rf.description } }).catch(()=>{});
          }
        }

        published++;
        steps.push(`✅ ${co.ticker} (${sc}): ${(p.eventSummary||'').slice(0, 50)}`);
      } catch (e: any) {
        steps.push(`⚠ ${co.ticker}: ${e.message.slice(0, 60)}`);
      }
      await new Promise(r => setTimeout(r, 1500));
    }

    return NextResponse.json({ success: true, published, steps });

  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message, steps }, { status: 500 });
  }
}
