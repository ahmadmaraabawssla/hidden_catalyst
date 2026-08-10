import { NextResponse } from 'next/server';
import { prisma } from '@hidden-catalyst/db';

const DEEPSEEK_API = 'https://api.deepseek.com/v1/chat/completions';
const KEY = process.env.DEEPSEEK_API_KEY || '';
const UA = 'Hidden Catalyst contact@hiddencatalyst.com';

const MATERIAL_FORMS = ['8-K', '10-Q', '10-K', 'S-1', '13D', '13G'];
const SKIP_FORMS = new Set(
  '3,4,5,3/A,4/A,144,N-PX,NPORT-P,N-CSR,N-CSRS,6-K,ARS,CERT,25,8-A12B,PX14A6G,S-8,424B2,FWP,25-NSE,SD'.split(',')
);

interface DiscoveryParams {
  batchSize: number;         // 5 | 10 | 20 | 50
  mcRange: 'micro' | 'small' | 'mid' | 'all';  // market cap filter
  formTypes: string[];       // ['8-K','10-Q',...]
  maxAgeDays: number;        // 1 | 3 | 7 | 14 | 30
}

function buildMcFilter(mcRange: DiscoveryParams['mcRange']): { min?: number; max?: number } {
  switch (mcRange) {
    case 'micro': return { max: 300_000_000 };
    case 'small': return { min: 300_000_000, max: 2_000_000_000 };
    case 'mid':   return { min: 2_000_000_000, max: 10_000_000_000 };
    default:      return {};
  }
}

export async function POST(req: Request) {
  if (!KEY) {
    return NextResponse.json({ success: false, error: 'DeepSeek API key not configured' }, { status: 500 });
  }

  let params: DiscoveryParams;
  try {
    const body = await req.json();
    params = {
      batchSize: Math.min(Math.max(1, body.batchSize || 20), 50),
      mcRange: body.mcRange || 'all',
      formTypes: Array.isArray(body.formTypes) && body.formTypes.length > 0
        ? body.formTypes.filter((f: string) => MATERIAL_FORMS.includes(f))
        : [...MATERIAL_FORMS],
      maxAgeDays: Math.min(Math.max(1, body.maxAgeDays || 7), 30),
    };
  } catch {
    params = { batchSize: 20, mcRange: 'all', formTypes: [...MATERIAL_FORMS], maxAgeDays: 7 };
  }

  const mcFilter = buildMcFilter(params.mcRange);
  const steps: string[] = [];
  let published = 0;

  try {
    // ── Step 1: Get candidates ──
    const formTypesList = params.formTypes.map(f => `'${f}'`).join(',');
    const mcMin = mcFilter.min ?? 0;
    const mcMax = mcFilter.max ?? 100_000_000_000_000;

    steps.push(`Scanning companies for ${params.formTypes.join('/')} filings (last ${params.maxAgeDays}d, ${params.mcRange} cap)...`);

    const rows = await prisma.$queryRawUnsafe<Array<any>>(`
      SELECT c.id, c.cik, c.display_name, s.ticker, s.id as sec_id,
             COALESCE(NULLIF(s.market_cap, 0), 800000000)::float as mc, c.sector
      FROM companies c
      JOIN securities s ON s.company_id = c.id
      WHERE c.cik IS NOT NULL
        AND s.active = true
        AND s.exchange IN ('NYSE','NASDAQ','NYSE American')
        AND s.market_cap IS NOT NULL
        AND s.market_cap > 10000
        AND s.market_cap BETWEEN ${mcMin} AND ${mcMax}
        AND NOT EXISTS (
          SELECT 1 FROM opportunities o
          WHERE o.security_id = s.id AND o.status = 'published'
        )
      ORDER BY s.market_cap ASC NULLS FIRST
      LIMIT 300
    `);

    steps.push(`Found ${rows.length} candidates. Fetching SEC filing data...`);

    // ── Step 2: Find companies with recent filings matching our filters ──
    const candidates: any[] = [];
    for (const co of rows) {
      try {
        const cik = String(co.cik).padStart(10, '0');
        const r = await fetch(`https://data.sec.gov/submissions/CIK${cik}.json`, {
          headers: { 'User-Agent': UA },
          signal: AbortSignal.timeout(5000),
        });
        if (!r.ok) continue;
        const d = await r.json();
        const f = d.filings?.recent;
        if (!f?.form) continue;

        for (let i = 0; i < Math.min(12, f.form.length); i++) {
          const fm = (f.form[i] || '').toUpperCase().replace(/\/A$/, '');
          if (!params.formTypes.includes(fm)) continue;
          if (SKIP_FORMS.has(fm) || SKIP_FORMS.has(f.form[i])) continue;
          const dt = f.filingDate[i];
          if (!dt) continue;
          const days = (Date.now() - new Date(dt).getTime()) / 86400000;
          if (days > params.maxAgeDays) continue;

          candidates.push({
            ...co,
            formType: fm,
            filingDate: dt,
            accessionNumber: f.accessionNumber[i],
            daysAgo: Math.round(days),
          });
          break; // one filing per company
        }
      } catch { /* skip */ }
    }

    // Sort by market cap (smallest first) then pick top N
    candidates.sort((a, b) => a.mc - b.mc);
    const top = candidates.slice(0, params.batchSize);

    if (top.length === 0) {
      steps.push('No candidates with matching filings found.');
      return NextResponse.json({ success: true, steps, published: 0, tickers: [] });
    }

    steps.push(`Selected ${top.length} candidates. Running DeepSeek AI...`);

    // ── Step 3: Process each with DeepSeek ──
    for (const co of top) {
      const cik = String(co.cik).padStart(10, '0');
      let text = '';

      // Try to download filing text (8-K gets priority)
      if (co.formType === '8-K') {
        try {
          const nd = co.accessionNumber.replace(/-/g, '');
          const tr = await fetch(
            `https://www.sec.gov/Archives/edgar/data/${cik}/${nd}/${co.accessionNumber}.txt`,
            { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10000) }
          );
          if (tr.ok) {
            text = await tr.text();
            const ts = text.indexOf('<TEXT>');
            text = (ts > 0 ? text.slice(ts + 6) : text.slice(0, 10000))
              .replace(/<[^>]+>/g, ' ')
              .replace(/&[a-z]+;/g, ' ')
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, 8000);
          }
        } catch { /* skip */ }
      }

      if (text.length < 100) {
        steps.push(`⚠ ${co.ticker}: insufficient filing text, skipping`);
        continue;
      }

      try {
        const ai = await fetch(DEEPSEEK_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
          body: JSON.stringify({
            model: 'deepseek-chat',
            temperature: 0.1,
            max_tokens: 2500,
            response_format: { type: 'json_object' },
            messages: [
              {
                role: 'system',
                content:
                  'Analyze SEC filing. Return JSON: {eventType, eventSummary, verifiedFacts[], inferences[{text,confidence}], overlookedReasons[], materialityScore, riskFlags[]}. Only extract explicitly stated information.',
              },
              {
                role: 'user',
                content: `${co.formType} from ${co.display_name} (${co.ticker}): ${text}`,
              },
            ],
          }),
          signal: AbortSignal.timeout(25000),
        });

        if (!ai.ok) {
          steps.push(`⚠ ${co.ticker}: AI API error ${ai.status}`);
          continue;
        }

        const ad = await ai.json();
        const ct = ad.choices?.[0]?.message?.content;
        if (!ct) {
          steps.push(`⚠ ${co.ticker}: empty AI response`);
          continue;
        }

        const p = JSON.parse(ct);
        const mc = co.mc;

        // Score
        const ia = mc < 300e6 ? 88 : mc < 1e9 ? 78 : mc < 3e9 ? 62 : 48;
        const mat = Math.max(10, Math.min(100, Number(p.materialityScore) || 65));
        const days = co.daysAgo || 0;
        const timing = days <= 1 ? 95 : days <= 3 ? 85 : days <= 7 ? 70 : days <= 14 ? 50 : 30;
        const riskScore = mc < 100e6 ? 60 : mc < 300e6 ? 50 : mc < 1e9 ? 40 : mc < 5e9 ? 30 : 20;
        const sc = Math.round(
          0.25 * ia + 0.20 * 70 + 0.20 * 92 + 0.15 * mat + 0.10 * timing +
          0.10 * 65 - 0.10 * riskScore - 0.05 * (mc < 1e9 ? 15 : 5)
        );

        const h = 'dsc_' + cik + '_' + co.accessionNumber.replace(/-/g, '').slice(0, 12);
        const tl = `${co.display_name} (${co.ticker}): ${(p.eventSummary || '').slice(0, 80)}`;
        const sm = `[Discovery] ${co.display_name} (${co.ticker}) filed ${co.formType} on ${co.filingDate}. ${p.eventSummary || ''}`;

        // Store document
        await prisma.document.create({
          data: {
            id: 'd_' + h,
            sourceId: 'source_sec_edgar',
            canonicalUrl: `https://www.sec.gov/cgi-bin/browse-edgar?CIK=${cik}`,
            publishedAt: new Date(co.filingDate),
            retrievedAt: new Date(),
            contentHash: h,
            title: tl,
            text: sm,
          },
        }).catch(() => {});

        // Evidence
        await prisma.evidenceItem.create({
          data: {
            id: 'e_' + h,
            documentId: 'd_' + h,
            excerpt: (p.verifiedFacts?.[0] || sm).slice(0, 500),
            evidenceType: 'primary',
            qualityScore: 92,
          },
        }).catch(() => {});

        // Opportunity — published immediately
        await prisma.opportunity.create({
          data: {
            id: 'o_' + h,
            securityId: co.sec_id,
            title: tl,
            summary: sm,
            status: 'published',
            detectedAt: new Date(co.filingDate),
            publishedAt: new Date(),
          },
        }).catch(() => {});

        // Verified fact claim
        await prisma.claim.create({
          data: {
            id: 'cf_' + h,
            opportunityId: 'o_' + h,
            claimType: 'verified_fact',
            text: (p.verifiedFacts?.[0] || sm).slice(0, 500),
            confidence: 0.95,
            evidenceItemIds: ['e_' + h],
          },
        }).catch(() => {});

        // Inference claims
        const infs: Array<{ text: string; confidence: number }> = p.inferences || [];
        for (let j = 0; j < Math.min(infs.length, 3); j++) {
          const inf = infs[j];
          if (inf) {
            await prisma.claim.create({
              data: {
                id: `ci${j}_${h}`,
                opportunityId: 'o_' + h,
                claimType: 'inference',
                text: inf.text,
                confidence: inf.confidence || 0.7,
                evidenceItemIds: ['e_' + h],
              },
            }).catch(() => {});
          }
        }

        // Scores
        const scoreRows: [string, number][] = [
          ['opportunity', sc],
          ['information_asymmetry', ia],
          ['catalyst_strength', 70],
          ['evidence_quality', 92],
          ['financial_materiality', mat],
          ['timing', timing],
          ['price_reaction', 65],
          ['risk', riskScore],
        ];
        for (const [t, v] of scoreRows) {
          await prisma.score.create({
            data: {
              id: 's_' + t + '_' + h,
              opportunityId: 'o_' + h,
              scoreType: t,
              value: v,
              factors: { mc, pipeline: 'discovery-button' },
              modelVersion: '3.0.0',
            },
          }).catch(() => {});
        }

        // Overlooked reasons → risks
        const reasons: string[] = p.overlookedReasons || [];
        for (let j = 0; j < Math.min(reasons.length, 3); j++) {
          await prisma.risk.create({
            data: {
              id: `olr_${j}_${h}`,
              opportunityId: 'o_' + h,
              riskType: `overlooked_reason_${j + 1}`,
              severity: 'low',
              description: reasons[j],
            },
          }).catch(() => {});
        }

        // Risk flags
        const flags: Array<{ type: string; severity: string; description: string }> = p.riskFlags || [];
        for (const rf of flags) {
          await prisma.risk.create({
            data: {
              id: `rf_${rf.type}_${h}`,
              opportunityId: 'o_' + h,
              riskType: rf.type,
              severity: rf.severity,
              description: rf.description,
            },
          }).catch(() => {});
        }

        steps.push(`✅ ${co.ticker}: score ${sc} — "${(p.eventSummary || '').slice(0, 50)}..."`);
        published++;
      } catch (e: any) {
        steps.push(`⚠ ${co.ticker}: ${e.message?.slice(0, 60) || 'processing error'}`);
      }
    }

    return NextResponse.json({
      success: true,
      steps,
      published,
      tickers: top.map((c: any) => c.ticker),
    });
  } catch (err: any) {
    steps.push(`Fatal: ${err.message?.slice(0, 100) || 'unknown error'}`);
    return NextResponse.json({ success: false, steps, error: err.message }, { status: 500 });
  }
}
