// API: POST /api/companies/[ticker]/explore
// User-triggered on-demand AI analysis for a single company.
// Costs: ~$0.001 per call (DeepSeek), only when user clicks.
import { NextResponse } from 'next/server';
import { prisma } from '@hidden-catalyst/db';

const DEEPSEEK_API = 'https://api.deepseek.com/v1/chat/completions';
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY || '';
const UA = 'Hidden Catalyst (contact@hiddencatalyst.com)';

export async function POST(
  _request: Request,
  { params }: { params: { ticker: string } }
) {
  const ticker = params.ticker.toUpperCase();

  try {
    // Find company
    const security = await prisma.security.findFirst({
      where: { ticker, active: true },
      include: { company: true },
    });
    if (!security || !security.company.cik) {
      return NextResponse.json({ error: 'Company not found or no CIK' }, { status: 404 });
    }

    const cik = String(security.company.cik).padStart(10, '0');

    // Fetch latest filings
    const idxRes = await fetch(`https://data.sec.gov/submissions/CIK${cik}.json`, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(8000),
    });
    if (!idxRes.ok) {
      return NextResponse.json({ error: 'SEC API unavailable' }, { status: 502 });
    }

    const idx = await idxRes.json();
    const f = idx.filings?.recent;
    if (!f?.form || f.form.length === 0) {
      return NextResponse.json({ error: 'No recent filings' }, { status: 404 });
    }

    // Find latest 8-K
    let bestIdx = -1;
    for (let i = 0; i < Math.min(10, f.form.length); i++) {
      if ((f.form[i] || '').toUpperCase() === '8-K') { bestIdx = i; break; }
    }
    if (bestIdx < 0) bestIdx = 0;

    const formType = (f.form[bestIdx] || '').toUpperCase();
    const acc = f.accessionNumber[bestIdx] || '';
    const dt = f.filingDate[bestIdx] || '';

    // Download filing text
    let filingText = '';
    if (formType === '8-K' && acc) {
      const accNoDash = acc.replace(/-/g, '');
      const txtUrl = `https://www.sec.gov/Archives/edgar/data/${cik}/${accNoDash}/${acc}.txt`;
      const txtRes = await fetch(txtUrl, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(15000),
      });
      if (txtRes.ok) {
        filingText = await txtRes.text();
        const ts = filingText.indexOf('<TEXT>');
        filingText = ts > 0 ? filingText.slice(ts + 6) : filingText.slice(0, 12000);
        filingText = filingText.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 10000);
      }
    }

    // Run DeepSeek
    if (filingText.length < 200 || !DEEPSEEK_KEY) {
      return NextResponse.json({
        ticker,
        formType,
        filingDate: dt,
        summary: `${security.company.displayName} filed ${formType} on ${dt}. No text available for AI analysis.`,
        confidence: 0.5,
      });
    }

    const prompt = `Analyze this 8-K filing from ${security.company.displayName} (${ticker}). 
Return JSON with: eventType, eventSummary, verifiedFacts[], inferences[{text, confidence}], 
overlookedReasons[], materialityScore, bullCase, baseCase, bearCase, riskFlags[].

Filing text:
---
${filingText}
---`;

    const aiRes = await fetch(DEEPSEEK_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: 'You analyze SEC filings. Return ONLY valid JSON.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.1,
        max_tokens: 3000,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(25000),
    });

    if (!aiRes.ok) {
      return NextResponse.json({ error: 'AI service unavailable' }, { status: 502 });
    }

    const aiData = await aiRes.json();
    const content = aiData.choices?.[0]?.message?.content;
    if (!content) {
      return NextResponse.json({ error: 'Empty AI response' }, { status: 500 });
    }

    const parsed = JSON.parse(content);

    // Store in DB
    const hash = 'expl_' + cik + '_' + acc.replace(/-/g, '').slice(0, 14);
    const title = `${security.company.displayName} (${ticker}): ${(parsed.eventSummary || '').slice(0, 80)}`;
    const summary = `[AI Explore] ${security.company.displayName} (${ticker}) filed ${formType} on ${dt}. ${parsed.eventSummary || 'Material event.'}`;

    await prisma.document.create({
      data: {
        id: 'd_' + hash, sourceId: 'source_sec_edgar',
        canonicalUrl: `https://www.sec.gov/cgi-bin/browse-edgar?CIK=${cik}`,
        publishedAt: new Date(dt), retrievedAt: new Date(),
        contentHash: hash, title, text: summary,
      },
    }).catch(() => {});

    await prisma.evidenceItem.create({
      data: {
        id: 'e_' + hash, documentId: 'd_' + hash,
        excerpt: (parsed.verifiedFacts?.[0] || summary).slice(0, 500),
        evidenceType: 'primary', qualityScore: 92,
      },
    }).catch(() => {});

    const opp = await prisma.opportunity.create({
      data: {
        id: 'o_' + hash, securityId: security.id,
        title, summary, status: 'published',
        detectedAt: new Date(dt), publishedAt: new Date(),
      },
    }).catch(() => null);

    if (opp) {
      await prisma.claim.create({
        data: {
          id: 'cf_' + hash, opportunityId: opp.id, claimType: 'verified_fact',
          text: (parsed.verifiedFacts?.[0] || summary).slice(0, 500),
          confidence: 0.95, evidenceItemIds: ['e_' + hash],
        },
      }).catch(() => {});
    }

    return NextResponse.json({
      ticker,
      companyName: security.company.displayName,
      formType,
      filingDate: dt,
      ...parsed,
      opportunityId: opp?.id,
    });

  } catch (err) {
    console.error('Explore error:', err);
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 });
  }
}
