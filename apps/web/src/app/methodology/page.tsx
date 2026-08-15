export default function MethodologyPage() {
  return (
    <div className="page-container max-w-3xl">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Methodology</h1>
      <p className="text-gray-500 mb-8">
        How Hidden Catalyst researches, verifies, and presents opportunities. No black boxes, no fake scores.
      </p>

      <div className="space-y-10">
        {/* Epistemic framework */}
        <section>
          <h2 className="mb-4 text-xl font-semibold text-gray-900">The Research Report, Not a Score</h2>
          <p className="mb-4 text-sm text-gray-600">
            Every candidate goes through a source-agnostic research pipeline that produces an{' '}
            <span className="font-medium text-gray-800">epistemic report</span> — not a single
            weighted number. A thesis advances only when its evidence does, and each gap is labeled
            explicitly.
          </p>
          <div className="card">
            <h3 className="mb-3 font-semibold text-gray-900">The eight epistemic checks</h3>
            <ol className="space-y-3 text-sm text-gray-700">
              {[
                ['Source-specific deep research completed', 'A source-specific researcher (SEC, contracts, regulatory, patents) examines the normalized signal rather than relying on metadata alone.'],
                ['Primary public source reviewed', 'The catalyst must trace to a linked public document — not model-only inference.'],
                ['Economic mechanism identified', 'A testable economic mechanism or extracted dollar amount.'],
                ['Defined trigger variable checked', 'For contractual catalysts, the defined variable (e.g. Commitment Fee Price) is separated from spot price to avoid conflation.'],
                ['Materiality denominator checked', 'A dollar amount is only material relative to company scale (revenue, cash, assets, EV, or market cap).'],
                ['Catalyst attention measured', 'Attention is measured only from observed coverage (matching press releases or recent news) — never asserted from a market-cap proxy.'],
                ['Price reaction measured', 'A price reaction is measured only when post-event trading data exists; otherwise it is an estimate, not evidence.'],
                ['Counter-thesis evaluated', 'An adversarial pass actively tries to weaken the thesis before it can advance.'],
              ].map(([check, why], i) => (
                <li key={i} className="flex gap-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                    {i + 1}
                  </span>
                  <span>
                    <span className="font-medium text-gray-900">{check}.</span>{' '}
                    <span className="text-gray-600">{why}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Check states */}
        <section>
          <h2 className="mb-4 text-xl font-semibold text-gray-900">Check States</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="card">
              <h3 className="font-semibold text-emerald-700">Verified</h3>
              <p className="mt-1 text-sm text-gray-600">The check passed with real, measured data.</p>
            </div>
            <div className="card">
              <h3 className="font-semibold text-amber-700">Partial</h3>
              <p className="mt-1 text-sm text-gray-600">Partially satisfied — e.g. a denominator exists but the event amount is still missing, or only a proxy is available.</p>
            </div>
            <div className="card">
              <h3 className="font-semibold text-gray-700">Pending</h3>
              <p className="mt-1 text-sm text-gray-600">Not yet satisfied — the input is still being researched.</p>
            </div>
            <div className="card">
              <h3 className="font-semibold text-slate-500">Not Applicable</h3>
              <p className="mt-1 text-sm text-gray-600">The check does not apply to this catalyst type.</p>
            </div>
          </div>
        </section>

        {/* Direction — the economic sign */}
        <section>
          <h2 className="mb-4 text-xl font-semibold text-gray-900">What direction is it?</h2>
          <p className="mb-4 text-sm text-gray-600">
            &quot;Interesting&quot; is not the same as &quot;good.&quot; A catalyst can be material, underfollowed,
            and well-supported while being <span className="font-medium text-rose-700">bad</span> for the company.
            Every discovery carries a direction, independent of how interesting it is.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="card border-emerald-200 bg-emerald-50/40">
              <h3 className="font-semibold text-emerald-800">🟢 Positive</h3>
              <p className="mt-1 text-sm text-gray-600">Potentially good for the company — a contract, approval, or expansion.</p>
            </div>
            <div className="card border-rose-200 bg-rose-50/40">
              <h3 className="font-semibold text-rose-800">🔴 Negative</h3>
              <p className="mt-1 text-sm text-gray-600">Potentially harmful — a liability, default, warrant dilution, or deficiency. This is a risk thesis, not a tailwind.</p>
            </div>
            <div className="card border-amber-200 bg-amber-50/40">
              <h3 className="font-semibold text-amber-800">🟡 Mixed</h3>
              <p className="mt-1 text-sm text-gray-600">Both positive and negative mechanisms at play.</p>
            </div>
            <div className="card border-gray-200 bg-gray-50/40">
              <h3 className="font-semibold text-gray-700">⚪ Unclear</h3>
              <p className="mt-1 text-sm text-gray-600">An important development, but the direction isn't resolved yet.</p>
            </div>
          </div>
        </section>

        {/* Thesis statuses */}
        <section>
          <h2 className="mb-4 text-xl font-semibold text-gray-900">Thesis Statuses</h2>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 font-semibold text-gray-900">Status</th>
                  <th className="pb-2 font-semibold text-gray-900">Meaning</th>
                </tr>
              </thead>
              <tbody className="text-gray-600">
                <tr className="border-b">
                  <td className="py-2 font-medium text-emerald-700">Verified</td>
                  <td className="py-2">Passed all gates including measured attention and price reaction.</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2 font-medium text-blue-700">Candidate</td>
                  <td className="py-2">Strong signal, but not yet high-conviction.</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2 font-medium text-amber-700">Watch</td>
                  <td className="py-2">Still missing critical verification inputs — materiality, attention, or price reaction.</td>
                </tr>
                <tr>
                  <td className="py-2 font-medium text-rose-700">Rejected</td>
                  <td className="py-2">Did not survive the epistemic checks — or the researcher concluded it was routine.</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-gray-500">
            Only <span className="font-medium text-emerald-700">verified</span> and{' '}
            <span className="font-medium text-blue-700">candidate</span> theses appear in the Qualified feed.
            Everything else remains in the Research Queue until it matures or is rejected.
            A rejection is a successful result — we'd rather show nothing than show routine filings as if they mattered.
          </p>
        </section>

        {/* Measured vs proxy */}
        <section>
          <h2 className="mb-4 text-xl font-semibold text-gray-900">Measured vs. Proxy / Estimate</h2>
          <p className="mb-4 text-sm text-gray-600">
            A core discipline of the platform is never conflating measured data with proxies or
            estimates.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="card border-emerald-200 bg-emerald-50/40">
              <h3 className="font-semibold text-emerald-800">Measured</h3>
              <p className="mt-1 text-sm text-gray-600">
                Attention derived from observed coverage (a matching press release or recent news
                mention). Price reaction derived from real post-event trading data.
              </p>
            </div>
            <div className="card border-amber-200 bg-amber-50/40">
              <h3 className="font-semibold text-amber-800">Proxy / Estimate</h3>
              <p className="mt-1 text-sm text-gray-600">
                A market-cap-derived attention score with zero observed coverage, or a price
                &quot;reaction&quot; with no post-event trading day. Always labeled, never counted as verified.
              </p>
            </div>
          </div>
        </section>

        {/* Claim labels */}
        <section>
          <h2 className="mb-4 text-xl font-semibold text-gray-900">Claim Labels</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="card">
              <h3 className="font-semibold text-emerald-700">Verified Fact</h3>
              <p className="mt-1 text-sm text-gray-600">Extracted from a source document with a preserved evidence link.</p>
            </div>
            <div className="card">
              <h3 className="font-semibold text-purple-700">Inference</h3>
              <p className="mt-1 text-sm text-gray-600">Reasoning synthesized from one or more verified facts.</p>
            </div>
            <div className="card">
              <h3 className="font-semibold text-amber-700">Unverified Claim</h3>
              <p className="mt-1 text-sm text-gray-600">Not yet proven — shown with the reason it remains unverified.</p>
            </div>
            <div className="card">
              <h3 className="font-semibold text-rose-700">Rejected Claim</h3>
              <p className="mt-1 text-sm text-gray-600">Failed an evidence check and is explicitly flagged.</p>
            </div>
          </div>
        </section>

        {/* Data sources */}
        <section>
          <h2 className="mb-4 text-xl font-semibold text-gray-900">Data Sources</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { name: 'SEC EDGAR', desc: '8-K, 10-Q, 10-K, S-1, 13D/G filings — full-text parsing with per-company CIK lookups.' },
              { name: 'FMP (Financial Modeling Prep)', desc: 'Prices, market caps, revenue, cash, assets, shares — used for materiality denominators.' },
              { name: 'USPTO', desc: 'Patent grants and applications for tracked companies.' },
              { name: 'FDA (openFDA)', desc: 'Drug approvals, designations, and regulatory actions.' },
              { name: 'ClinicalTrials.gov', desc: 'Trial registrations, status updates, and results.' },
              { name: 'SAM.gov / USASpending', desc: 'Federal contract awards and modifications.' },
              { name: 'DeepSeek AI', desc: 'LLM extraction of event type, dollar amounts, and contract mechanics from filing text.' },
            ].map((src) => (
              <div key={src.name} className="card">
                <h3 className="text-sm font-semibold text-gray-900">{src.name}</h3>
                <p className="mt-1 text-xs text-gray-600">{src.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Limitations */}
        <section className="card border-amber-200 bg-amber-50">
          <h2 className="mb-3 text-xl font-semibold text-gray-900">Limitations & Disclaimers</h2>
          <ul className="list-inside list-disc space-y-2 text-sm text-gray-700">
            <li>Hidden Catalyst is informational research, not personalized investment advice.</li>
            <li>We do not guarantee that any catalyst will result in a specific price movement.</li>
            <li>Thesis statuses represent research maturity, not buy/sell recommendations.</li>
            <li>All data comes from public sources; we do not acquire or encourage material non-public information.</li>
            <li>Past catalyst outcomes do not predict future results.</li>
            <li>Low-liquidity and micro-cap securities carry additional risks.</li>
            <li>Model inferences and estimates carry uncertainty; always review underlying sources.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
