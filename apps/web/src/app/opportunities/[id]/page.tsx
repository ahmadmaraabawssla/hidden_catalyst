import { notFound } from 'next/navigation';
import { getEngineOpportunity } from '@/lib/engine-data';
import { formatMC, formatPrice, formatPct, formatDate, formatMoney, cleanCompanyName, formatRatio, relativeTime, plainThesis, plainMateriality } from '@/components/research/format';

export const dynamic = 'force-dynamic';

const CHECK_PLAIN: Record<string, string> = {
  deep_research: 'Read the original document',
  primary_source: 'Found the source',
  amount_or_mechanism: 'Found the money / mechanics',
  defined_variable_guardrail: 'Checked the fine print',
  materiality_denominator: 'Sized it up',
  attention: 'Checked if anyone\'s talking about it',
  price_reaction: 'Checked how the market reacted',
  adversarial: 'Tried to poke holes in it',
};

function checkLabel(id: string): string {
  return CHECK_PLAIN[id] ?? id;
}

function checkStatusLabel(status: string): string {
  switch (status) {
    case 'verified': return 'Done';
    case 'partial': return 'Partly';
    case 'pending': return 'Not yet';
    case 'failed': return 'Failed';
    case 'not_applicable': return 'N/A';
    default: return status;
  }
}

function checkStatusCls(status: string): string {
  switch (status) {
    case 'verified': return 'bg-emerald-100 text-emerald-800';
    case 'partial': return 'bg-amber-100 text-amber-800';
    case 'pending': return 'bg-gray-100 text-gray-600';
    case 'failed': return 'bg-rose-100 text-rose-800';
    default: return 'bg-slate-100 text-slate-500';
  }
}

export default async function OpportunityDetailPage({ params }: { params: { id: string } }) {
  const opp = await getEngineOpportunity(params.id);
  if (!opp) notFound();

  const report = opp.report;
  const mat = opp.materiality;
  const attention = opp.attention;
  const priceReaction = opp.priceReaction;
  const adversarial = opp.adversarial;
  const completeness = opp.researchCompleteness ?? report?.completeness ?? 0;
  const confidence = opp.confidence ?? report?.confidence ?? 0;
  const thesis = plainThesis(opp.verificationStatus);
  const matPlain = plainMateriality(mat?.level);

  return (
    <div className="page-container">
      {/* Breadcrumb */}
      <div className="mb-4 flex items-center gap-2 text-sm text-gray-500">
        <a href="/feed" className="hover:text-brand-700">← Discoveries</a>
        <span>/</span>
        <span className="font-mono text-gray-700">{opp.ticker}</span>
      </div>

      {/* ── HEADER ── */}
      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-xl font-bold tracking-tight text-gray-900 sm:text-2xl">
            {cleanCompanyName(opp.companyName)}
          </h1>
          <span className="font-mono text-lg text-gray-500">{opp.ticker}</span>
          <span className="text-sm text-gray-400">{opp.exchange}</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600">
          {opp.marketCap != null && <span className="tabular-nums">{formatMC(opp.marketCap)}</span>}
          {opp.latestPrice != null && <span className="font-mono tabular-nums">{formatPrice(opp.latestPrice)}</span>}
          {opp.sector && <span className="text-gray-400">{opp.sector}</span>}
        </div>
      </div>

      {/* ── THE VERDICT ── */}
      <section className="mb-6 rounded-xl border-l-4 border-brand-500 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ${
            opp.verificationStatus === 'verified' ? 'bg-emerald-100 text-emerald-800'
            : opp.verificationStatus === 'candidate' ? 'bg-blue-100 text-blue-800'
            : 'bg-amber-100 text-amber-800'
          }`}>
            {thesis.label}
          </span>
          <span className="text-xs text-gray-400">detected {relativeTime(opp.detectedAt)}</span>
        </div>
        <p className="mt-3 text-sm text-gray-600">{thesis.meaning}</p>
      </section>

      {/* ── WHAT HAPPENED ── */}
      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-400">What happened</h2>
        <p className="text-base font-medium leading-relaxed text-gray-900">
          {report?.thesis || report?.summary || opp.summary || 'We haven\'t written a summary for this yet.'}
        </p>
      </section>

      {/* ── THE FACTS (plain English) ── */}
      <section className="mb-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-emerald-200 bg-white p-5">
          <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-emerald-800">
            <span>✓</span> What we know for sure
          </h2>
          <ul className="space-y-3">
            {(report?.verifiedFacts ?? []).map((fact, i) => (
              <li key={i} className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-3">
                <p className="text-sm text-gray-800">{fact.text}</p>
                {fact.evidence && fact.evidence.startsWith('http') && (
                  <a href={fact.evidence} target="_blank" rel="noreferrer" className="mt-1 block truncate text-xs text-emerald-600 hover:underline">
                    Source ↗
                  </a>
                )}
              </li>
            ))}
            {(report?.verifiedFacts.length ?? 0) === 0 && (
              <li className="text-sm text-gray-400">Nothing confirmed yet.</li>
            )}
          </ul>
        </div>

        <div className="rounded-xl border border-amber-200 bg-white p-5">
          <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-amber-800">
            <span>⚠</span> What we're not sure about
          </h2>
          <ul className="space-y-3">
            {(report?.unverifiedClaims ?? []).map((claim, i) => (
              <li key={`u-${i}`} className="rounded-lg border border-amber-100 bg-amber-50/50 p-3">
                <p className="text-sm text-gray-800">{claim.text}</p>
                {claim.reason && <p className="mt-1 text-xs text-amber-700">{claim.reason}</p>}
              </li>
            ))}
            {(report?.rejectedClaims ?? []).map((claim, i) => (
              <li key={`r-${i}`} className="rounded-lg border border-rose-100 bg-rose-50/50 p-3">
                <p className="text-sm text-gray-800">{claim.text}</p>
                {claim.reason && <p className="mt-1 text-xs text-rose-700">{claim.reason}</p>}
              </li>
            ))}
            {((report?.unverifiedClaims.length ?? 0) + (report?.rejectedClaims.length ?? 0)) === 0 && (
              <li className="text-sm text-gray-400">Nothing flagged as uncertain.</li>
            )}
          </ul>
        </div>
      </section>

      {/* ── HOW BIG IS THIS? ── */}
      {mat && (
        <section className="mb-6 rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-3 text-base font-semibold text-gray-900">How big is this for the company?</h2>
          {mat.level === 'UNKNOWN' ? (
            <p className="text-sm text-gray-500">
              We couldn't size this up yet — usually because the exact dollar amount or company financials aren't in the filing.
            </p>
          ) : (
            <div className="space-y-2 text-sm">
              <p className="text-gray-800">
                <span className="font-semibold">{matPlain.label}.</span> {matPlain.tone}
              </p>
              {mat.numerator != null && mat.denominator != null && (
                <p className="text-gray-500">
                  {formatMoney(mat.numerator)} vs. {formatMoney(mat.denominator)}{' '}
                  <span className="text-gray-400">({formatRatio(mat.ratio)})</span>
                </p>
              )}
            </div>
          )}
        </section>
      )}

      {/* ── MARKET CONTEXT (plain English) ── */}
      <section className="mb-6 grid gap-4 lg:grid-cols-2">
        {attention && (
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="mb-2 text-base font-semibold text-gray-900">Is anyone paying attention?</h2>
            <p className="text-sm text-gray-700">
              {attention.measured
                ? `Yes — we found ${attention.news.count} news mentions in the last week. This might already be on people's radar.`
                : 'No — we found little to no news coverage. This is exactly the kind of thing the market tends to miss.'}
            </p>
          </div>
        )}
        {priceReaction && (
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="mb-2 text-base font-semibold text-gray-900">Has the market reacted?</h2>
            <p className="text-sm text-gray-700">
              {priceReaction.measured
                ? `The stock moved ${formatPct(priceReaction.returns.eventDay)} on the day. It's ${priceReaction.marketReaction === 'minimal' ? 'barely' : priceReaction.marketReaction === 'moderate' ? 'somewhat' : 'strongly'} priced in.`
                : 'Not yet — the market hasn\'t had enough time to react. This could mean it\'s still under the radar.'}
            </p>
          </div>
        )}
      </section>

      {/* ── OUR CHECKS (human readable) ── */}
      <section className="mb-6">
        <h2 className="mb-3 text-base font-semibold text-gray-900">How we checked this</h2>
        <p className="mb-4 text-xs text-gray-500">
          We do each of these before deciding anything. &quot;Partly&quot; or &quot;Not yet&quot; means we're being honest that it's not done — not pretending it is.
        </p>
        <div className="grid gap-3 lg:grid-cols-2">
          {(report?.researchChecks ?? []).map((check) => (
            <div key={check.id} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="text-sm font-semibold text-gray-900">{checkLabel(check.id)}</div>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${checkStatusCls(check.status)}`}>
                  {checkStatusLabel(check.status)}
                </span>
              </div>
              <p className="mt-1.5 text-sm text-gray-700">{check.result}</p>
            </div>
          ))}
        </div>
        {completeness > 0 && (
          <p className="mt-3 text-xs text-gray-400">
            Overall, we're {completeness}% done checking this out.
          </p>
        )}
      </section>

      {/* ── WHY YOU MIGHT STILL BE WRONG (adversarial) ── */}
      {adversarial && (
        <section className="mb-6 rounded-xl border border-rose-200 bg-rose-50/40 p-5">
          <h2 className="mb-3 text-base font-semibold text-rose-800">The other side of the argument</h2>
          {adversarial.findings.length > 0 ? (
            <div className="space-y-2">
              {adversarial.findings.map((finding, i) => (
                <div key={i} className="rounded-lg border border-rose-100 bg-white p-3">
                  <div className="text-sm font-medium text-rose-800">{finding.title || finding.type || 'A caveat'}</div>
                  <p className="mt-0.5 text-xs text-rose-700">{finding.description || finding.evidence}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-rose-700">We didn't find a strong argument against this — but that doesn't mean there isn't one. Do your own homework.</p>
          )}
        </section>
      )}

      {/* ── SCENARIOS ── */}
      {(report?.scenarioTables ?? []).map((table, i) => (
        <section key={i} className="mb-6 rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-1 text-base font-semibold text-gray-900">{table.title}</h2>
          <p className="mb-3 text-xs text-gray-500">{table.note}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="pb-2 font-medium">{table.inputLabel}</th>
                  <th className="pb-2 font-medium">{table.outputLabel}</th>
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, j) => (
                  <tr key={j} className="border-b border-gray-50">
                    <td className="py-2 font-mono text-gray-800">{row.label}</td>
                    <td className="py-2 font-mono text-gray-800">{formatMoney(row.output)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      {/* ── WHAT WE STILL DON'T KNOW ── */}
      {(report?.openQuestions ?? []).length > 0 && (
        <section className="mb-6 rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-3 text-base font-semibold text-gray-900">What we still don't know</h2>
          <ul className="space-y-2">
            {report!.openQuestions.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
                {item}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── THE SOURCE ── */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-3 text-base font-semibold text-gray-900">Where this came from</h2>
        {opp.signals.length > 0 ? (
          <div className="space-y-2">
            {opp.signals.map((signal) => (
              <a
                key={signal.id}
                href={signal.sourceUrl || '#'}
                target={signal.sourceUrl ? '_blank' : undefined}
                rel="noreferrer"
                className="block rounded-lg border border-gray-100 p-3 hover:bg-gray-50"
              >
                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 font-semibold uppercase text-gray-600">
                    {signal.sourceType.replace(/_/g, ' ')}
                  </span>
                  <span>{formatDate(signal.publishedAt)}</span>
                </div>
                <p className="mt-1.5 text-sm text-gray-700">{signal.title}</p>
              </a>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400">No source documents linked.</p>
        )}
      </section>
    </div>
  );
}
