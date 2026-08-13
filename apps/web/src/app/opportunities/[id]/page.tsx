import { notFound } from 'next/navigation';
import { getEngineOpportunity } from '@/lib/engine-data';
import { ThesisStatusBadge, CheckStatusBadge, LevelBadge, MeasuredTag } from '@/components/research/StatusBadges';
import { formatMC, formatPrice, formatPct, formatDate, formatMoney, cleanCompanyName, formatRatio } from '@/components/research/format';

export const dynamic = 'force-dynamic';

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

  const verifiedChecks = report?.researchChecks.filter((c) => c.status === 'verified').length ?? 0;
  const totalChecks = report?.researchChecks.length ?? 0;

  // Drive the verdict copy from the actual check states, not the stored
  // status string, so stale data (pre-measured/proxy fix) never overclaims.
  const attentionMeasured = report?.researchChecks.find((c) => c.id === 'attention')?.status === 'verified';
  const priceMeasured = report?.researchChecks.find((c) => c.id === 'price_reaction')?.status === 'verified';
  let verdictCopy: string;
  if (report?.thesisStatus === 'reject') {
    verdictCopy = 'Did not survive the epistemic checks.';
  } else if (report?.thesisStatus === 'verified') {
    verdictCopy = attentionMeasured && priceMeasured
      ? 'Passed all gates including measured attention and price reaction.'
      : 'Passed qualification, but attention or price reaction was only partially measured.';
  } else if (report?.thesisStatus === 'candidate') {
    verdictCopy = 'Strong signal, but not yet high-conviction.';
  } else {
    verdictCopy = 'Still missing critical verification inputs.';
  }

  return (
    <div className="page-container">
      {/* Breadcrumb */}
      <div className="mb-4 flex items-center gap-2 text-sm text-gray-500">
        <a href="/feed" className="hover:text-brand-700">← Feed</a>
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
          <ThesisStatusBadge status={opp.verificationStatus} />
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600">
          {opp.marketCap != null && <span className="tabular-nums">{formatMC(opp.marketCap)}</span>}
          {opp.latestPrice != null && <span className="font-mono tabular-nums">{formatPrice(opp.latestPrice)}</span>}
          {opp.sector && <span className="text-gray-400">{opp.sector}</span>}
          {opp.industry && <span className="hidden text-gray-400 sm:inline">{opp.industry}</span>}
        </div>
      </div>

      {/* ── VERDICT BANNER ── */}
      <section className="mb-8 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="grid gap-px bg-gray-100 sm:grid-cols-4">
          <div className="bg-white p-5">
            <div className="text-xs font-medium uppercase tracking-wide text-gray-400">Thesis status</div>
            <div className="mt-1.5"><ThesisStatusBadge status={report?.thesisStatus ?? opp.verificationStatus} /></div>
            <p className="mt-2 text-xs text-gray-500">{verdictCopy}</p>
          </div>
          <div className="bg-white p-5">
            <div className="text-xs font-medium uppercase tracking-wide text-gray-400">Completeness</div>
            <div className="mt-1.5 text-2xl font-bold tabular-nums text-gray-900">{completeness}%</div>
            <p className="mt-2 text-xs text-gray-500">
              {verifiedChecks} of {totalChecks} research checks verified
            </p>
          </div>
          <div className="bg-white p-5">
            <div className="text-xs font-medium uppercase tracking-wide text-gray-400">Confidence</div>
            <div className="mt-1.5 text-2xl font-bold tabular-nums text-gray-900">{confidence}%</div>
            <p className="mt-2 text-xs text-gray-500">
              {confidence >= 75 ? 'High' : confidence >= 50 ? 'Medium' : 'Low'} confidence estimate
            </p>
          </div>
          <div className="bg-white p-5">
            <div className="text-xs font-medium uppercase tracking-wide text-gray-400">Materiality</div>
            <div className="mt-1.5 flex items-center gap-2">
              <LevelBadge level={mat?.level} />
            </div>
            <p className="mt-2 text-xs text-gray-500">
              {mat?.metric ?? 'Materiality not yet computed'}
            </p>
          </div>
        </div>
      </section>

      {/* ── THESIS + SUMMARY ── */}
      <section className="mb-8 rounded-xl border-l-4 border-brand-500 bg-brand-50 p-5">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-brand-800">Thesis</h2>
        <p className="text-base font-medium leading-relaxed text-gray-900">
          {report?.thesis || report?.summary || opp.summary || 'No thesis synthesized yet.'}
        </p>
        {report?.summary && report.thesis && (
          <p className="mt-2 text-sm text-gray-600">{report.summary}</p>
        )}
      </section>

      {/* ── RESEARCH CHECKS ── */}
      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">Epistemic Checks</h2>
        <p className="mb-4 text-xs text-gray-500">
          Every check must be verified before a thesis advances. &quot;Partial&quot; and &quot;proxy/estimate&quot;
          states are intentionally not counted as fully verified.
        </p>
        <div className="grid gap-3 lg:grid-cols-2">
          {(report?.researchChecks ?? []).map((check) => (
            <div key={check.id} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-gray-900">{check.check}</div>
                  <div className="mt-0.5 text-xs text-gray-400">{check.source}</div>
                </div>
                <CheckStatusBadge status={check.status} />
              </div>
              <p className="mt-2 text-sm text-gray-700">{check.result}</p>
              <p className="mt-1 text-xs italic text-gray-400">{check.why}</p>
            </div>
          ))}
        </div>
        {totalChecks === 0 && (
          <p className="text-sm text-gray-500">No epistemic checks recorded for this opportunity.</p>
        )}
      </section>

      {/* ── CLAIMS ── */}
      <section className="mb-8 grid gap-4 lg:grid-cols-2">
        {/* Verified facts */}
        <div className="rounded-xl border border-emerald-200 bg-white p-5">
          <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-emerald-800">
            <span className="text-emerald-500">✓</span> Verified Facts
            <span className="ml-auto text-xs font-normal text-emerald-600">{report?.verifiedFacts.length ?? 0}</span>
          </h2>
          <ul className="space-y-3">
            {(report?.verifiedFacts ?? []).map((fact, i) => (
              <li key={i} className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-3">
                <p className="text-sm text-gray-800">{fact.text}</p>
                {fact.evidence && (
                  <a
                    href={fact.evidence.startsWith('http') ? fact.evidence : undefined}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 block truncate text-xs text-emerald-600 hover:underline"
                  >
                    {fact.evidence}
                  </a>
                )}
              </li>
            ))}
            {(report?.verifiedFacts.length ?? 0) === 0 && (
              <li className="text-sm text-gray-400">No verified facts recorded.</li>
            )}
          </ul>
        </div>

        {/* Unverified / rejected claims */}
        <div className="rounded-xl border border-amber-200 bg-white p-5">
          <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-amber-800">
            <span className="text-amber-500">⚠</span> Unverified & Rejected Claims
            <span className="ml-auto text-xs font-normal text-amber-600">
              {(report?.unverifiedClaims.length ?? 0) + (report?.rejectedClaims.length ?? 0)}
            </span>
          </h2>
          <ul className="space-y-3">
            {(report?.unverifiedClaims ?? []).map((claim, i) => (
              <li key={`u-${i}`} className="rounded-lg border border-amber-100 bg-amber-50/50 p-3">
                <div className="mb-1">
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-700">unverified</span>
                </div>
                <p className="text-sm text-gray-800">{claim.text}</p>
                {claim.reason && <p className="mt-1 text-xs text-amber-700">{claim.reason}</p>}
              </li>
            ))}
            {(report?.rejectedClaims ?? []).map((claim, i) => (
              <li key={`r-${i}`} className="rounded-lg border border-rose-100 bg-rose-50/50 p-3">
                <div className="mb-1">
                  <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-rose-700">rejected</span>
                </div>
                <p className="text-sm text-gray-800">{claim.text}</p>
                {claim.reason && <p className="mt-1 text-xs text-rose-700">{claim.reason}</p>}
              </li>
            ))}
            {((report?.unverifiedClaims.length ?? 0) + (report?.rejectedClaims.length ?? 0)) === 0 && (
              <li className="text-sm text-gray-400">No unverified or rejected claims.</li>
            )}
          </ul>
        </div>
      </section>

      {/* ── MARKET CONTEXT ── */}
      <section className="mb-8 grid gap-4 lg:grid-cols-3">
        {/* Materiality */}
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">Materiality</h2>
            <LevelBadge level={mat?.level} />
          </div>
          {mat ? (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Metric</span>
                <span className="font-mono text-gray-800">{mat.metric}</span>
              </div>
              {mat.numerator != null && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Amount</span>
                  <span className="font-mono text-gray-800">{formatMoney(mat.numerator)}</span>
                </div>
              )}
              {mat.denominator != null && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Denominator</span>
                  <span className="font-mono text-gray-800">{formatMoney(mat.denominator)}</span>
                </div>
              )}
              {mat.ratio != null && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Ratio</span>
                  <span className="font-mono text-gray-800">{formatRatio(mat.ratio)}</span>
                </div>
              )}
              <p className="pt-2 text-xs text-gray-500">{mat.explanation}</p>
            </div>
          ) : (
            <p className="text-sm text-gray-400">Materiality has not been computed.</p>
          )}
        </div>

        {/* Attention */}
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">Attention</h2>
            <MeasuredTag measured={attention?.measured} />
          </div>
          {attention ? (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Attention score</span>
                <span className="font-mono text-gray-800">{attention.attentionScore}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Press releases</span>
                <span className="font-mono text-gray-800">{attention.pressRelease.count}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">News mentions (7d)</span>
                <span className="font-mono text-gray-800">{attention.news.count}</span>
              </div>
              <p className="pt-2 text-xs text-gray-500">
                {attention.measured
                  ? 'Catalyst-specific coverage was observed — attention is measured.'
                  : 'No catalyst-specific coverage observed — score is a market-cap proxy, not a measurement.'}
              </p>
            </div>
          ) : (
            <p className="text-sm text-gray-400">Attention has not been measured.</p>
          )}
        </div>

        {/* Price reaction */}
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">Price Reaction</h2>
            <MeasuredTag measured={priceReaction?.measured} />
          </div>
          {priceReaction ? (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Reaction</span>
                <span className="font-medium text-gray-800">{priceReaction.marketReaction}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Event day</span>
                <span className="font-mono text-gray-800">{formatPct(priceReaction.returns.eventDay)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Post-event +1d</span>
                <span className="font-mono text-gray-800">{formatPct(priceReaction.returns.p1)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Post-event +5d</span>
                <span className="font-mono text-gray-800">{formatPct(priceReaction.returns.p5)}</span>
              </div>
              {priceReaction.pricedInScore != null && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Priced-in score</span>
                  <span className="font-mono text-gray-800">{priceReaction.pricedInScore}</span>
                </div>
              )}
              <p className="pt-2 text-xs text-gray-500">
                {priceReaction.measured
                  ? 'Post-event price data exists — reaction is measured.'
                  : 'No reliable post-event data — reaction is an estimate, not a measurement.'}
              </p>
            </div>
          ) : (
            <p className="text-sm text-gray-400">Price reaction has not been measured.</p>
          )}
        </div>
      </section>

      {/* ── ADVERSARIAL ── */}
      {adversarial && (
        <section className="mb-8 rounded-xl border border-rose-200 bg-rose-50/40 p-5">
          <h2 className="mb-3 text-base font-semibold text-rose-800">Adversarial Thesis Pass</h2>
          {adversarial.findings.length > 0 ? (
            <div className="space-y-2">
              {adversarial.findings.map((finding, i) => (
                <div key={i} className="rounded-lg border border-rose-100 bg-white p-3">
                  <div className="text-sm font-medium text-rose-800">{finding.title || finding.type || 'Limitation'}</div>
                  <p className="mt-0.5 text-xs text-rose-700">{finding.description || finding.evidence || 'Counter-evidence requires review.'}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-rose-700">
              No deterministic contradiction identified yet. This is not a substitute for human review.
            </p>
          )}
          {adversarial.fatalContradiction && (
            <div className="mt-3">
              <span className="rounded bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">Fatal invalidator detected</span>
            </div>
          )}
        </section>
      )}

      {/* ── SCENARIO TABLES ── */}
      {(report?.scenarioTables ?? []).map((table, i) => (
        <section key={i} className="mb-8 rounded-xl border border-gray-200 bg-white p-5">
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

      {/* ── MISSING INPUTS + OPEN QUESTIONS ── */}
      <section className="mb-8 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-3 text-base font-semibold text-gray-900">Missing Inputs</h2>
          {(report?.missingInputs ?? []).length > 0 ? (
            <ul className="space-y-2">
              {report!.missingInputs.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                  {item}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-400">No missing inputs recorded.</p>
          )}
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-3 text-base font-semibold text-gray-900">Open Questions</h2>
          {(report?.openQuestions ?? []).length > 0 ? (
            <ul className="space-y-2">
              {report!.openQuestions.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
                  {item}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-400">No open questions recorded.</p>
          )}
        </div>
      </section>

      {/* ── SIGNAL SOURCES ── */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-3 text-base font-semibold text-gray-900">
          Source Signals
          <span className="ml-2 text-xs font-normal text-gray-400">{opp.signals.length} linked</span>
        </h2>
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
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-gray-600">
                    {signal.sourceType.replace(/_/g, ' ')}
                  </span>
                  {signal.role === 'primary' && (
                    <span className="rounded bg-brand-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-brand-700">primary</span>
                  )}
                  <span className="text-xs text-gray-400">{formatDate(signal.publishedAt)}</span>
                </div>
                <p className="mt-1.5 text-sm text-gray-700">{signal.title}</p>
              </a>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400">No normalized source signals linked.</p>
        )}
      </section>
    </div>
  );
}
