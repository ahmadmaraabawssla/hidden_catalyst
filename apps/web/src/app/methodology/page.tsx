export default function MethodologyPage() {
  return (
    <div className="page-container max-w-3xl">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Methodology</h1>
      <p className="text-gray-500 mb-8">
        How Hidden Catalyst scores, ranks, and presents opportunities. No black boxes.
      </p>

      <div className="space-y-10">
        {/* Opportunity Score */}
        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Opportunity Score Formula</h2>
          <div className="card overflow-x-auto">
            <pre className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
{`Opportunity Score (v2.0) =
  0.25 × Information Asymmetry
+ 0.20 × Catalyst Strength
+ 0.20 × Evidence Quality
+ 0.15 × Financial Materiality
+ 0.10 × Timing
+ 0.10 × Price-Reaction Score
− 0.10 × Risk Penalty
− 0.05 × Liquidity Penalty
− 0.05 × Dilution Penalty

Final output is clamped to 1-100.

Note: Valuation Context has been removed from v1.0.
Information Asymmetry weight increased to better
surface genuinely underfollowed companies.`}
            </pre>
          </div>
        </section>

        {/* Score definitions */}
        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Score Components</h2>
          <div className="space-y-4">
            {[
              {
                name: 'Information Asymmetry (1-100)',
                desc: 'Measures how underfollowed or difficult to discover the signal appears. Factors include analyst count, news article volume, social/search activity, source complexity, local-language barriers, institutional ownership, and price/volatility responsiveness.',
              },
              {
                name: 'Catalyst Strength (1-100)',
                desc: 'Evaluates potential business significance if the catalyst occurs or persists. Factors include revenue/profit potential, duration, recurrence, strategic importance, probability, regulatory significance, customer quality, and competitive advantage.',
              },
              {
                name: 'Evidence Quality (1-100)',
                desc: 'Assesses reliability, specificity, freshness, and independence of supporting evidence. Primary sources, official filings, independent confirmations, and recent documents score higher.',
              },
              {
                name: 'Financial Materiality (1-100)',
                desc: 'Estimates financial significance relative to company scale. Considers contract value, revenue/EBITDA impact, capex burden, balance-sheet effects, and company dependency.',
              },
              {
                name: 'Timing (1-100)',
                desc: 'Measures how actionable and time-bounded the catalyst is. Imminent decisions, known deadlines, and scheduled events score higher.',
              },
              {
                name: 'Price Reaction (1-100)',
                desc: 'Evaluates how little the market appears to have reacted after controlling for peer and sector movements. Lower reaction suggests the information may not be widely priced in.',
              },
              {
                name: 'Risk (1-100)',
                desc: 'Aggregate downside and uncertainty. Higher scores mean riskier. Includes liquidity, dilution, binary outcomes, legal uncertainty, customer concentration, and promotional history.',
              },
            ].map((item) => (
              <div key={item.name} className="card">
                <h3 className="font-semibold text-gray-900">{item.name}</h3>
                <p className="mt-1 text-sm text-gray-600">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Data Sources */}
        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Data Sources</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { name: 'SEC EDGAR', desc: '8-K, 10-Q, 10-K, S-1, 13D/G filings. Raw filing text downloaded and analyzed by DeepSeek AI.' },
              { name: 'FMP (Financial Modeling Prep)', desc: 'Real-time prices, market cap, analyst recommendations, institutional ownership.' },
              { name: 'USPTO', desc: 'Patent grants and applications for tracked companies.' },
              { name: 'FDA (openFDA)', desc: 'Drug approvals, designations, and regulatory actions.' },
              { name: 'ClinicalTrials.gov', desc: 'Trial registrations, status updates, and results.' },
              { name: 'SAM.gov / USASpending', desc: 'Federal contract awards and modifications.' },
              { name: 'DeepSeek AI', desc: 'LLM extraction of event type, materiality, dollar amounts, overlooked reasons, and risk flags from filing text.' },
            ].map((src) => (
              <div key={src.name} className="card">
                <h3 className="font-semibold text-gray-900 text-sm">{src.name}</h3>
                <p className="mt-1 text-xs text-gray-600">{src.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Publication gates */}
        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Publication Gates</h2>
          <p className="text-sm text-gray-600 mb-4">
            Opportunities must pass these gates before auto-publication. If any gate fails, the candidate
            goes to human review.
          </p>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 font-semibold text-gray-900">Gate</th>
                  <th className="pb-2 font-semibold text-gray-900">Auto-Publish Threshold</th>
                  <th className="pb-2 font-semibold text-gray-900">Otherwise</th>
                </tr>
              </thead>
              <tbody className="text-gray-600">
                <tr className="border-b">
                  <td className="py-2">Evidence</td>
                  <td className="py-2">Evidence Quality ≥ 70 + at least one primary source</td>
                  <td className="py-2">Manual review</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">Entity Mapping</td>
                  <td className="py-2">Security mapping confidence ≥ 0.95</td>
                  <td className="py-2">Manual review</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">Relationship</td>
                  <td className="py-2">Direct relationship confidence ≥ 0.85 or indirect reviewed</td>
                  <td className="py-2">Manual review</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">Risk</td>
                  <td className="py-2">Risk Score ≤ 65 and no prohibited-risk flag</td>
                  <td className="py-2">Hold or manual review</td>
                </tr>
                <tr>
                  <td className="py-2">Liquidity</td>
                  <td className="py-2">Above configured liquidity threshold</td>
                  <td className="py-2">Manual review or suppress</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Evidence labels */}
        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Claim Labels</h2>
          <p className="text-sm text-gray-600 mb-4">
            We clearly separate different types of claims so you know what is fact and what is interpretation.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="card">
              <h3 className="font-semibold text-green-700">Verified Fact</h3>
              <p className="mt-1 text-sm text-gray-600">
                Directly quoted or extracted from a source document with preserved locator.
              </p>
            </div>
            <div className="card">
              <h3 className="font-semibold text-purple-700">Inference</h3>
              <p className="mt-1 text-sm text-gray-600">
                Model or analyst reasoning based on one or more verified facts. Always includes confidence.
              </p>
            </div>
            <div className="card">
              <h3 className="font-semibold text-amber-700">Estimate</h3>
              <p className="mt-1 text-sm text-gray-600">
                Numerical approximation (revenue, cost, timeline) with stated assumptions.
              </p>
            </div>
            <div className="card">
              <h3 className="font-semibold text-gray-700">Assumption</h3>
              <p className="mt-1 text-sm text-gray-600">
                Explicit premise that underlies an inference or estimate.
              </p>
            </div>
          </div>
        </section>

        {/* Limitations */}
        <section className="card border-amber-200 bg-amber-50">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Limitations & Disclaimers</h2>
          <ul className="list-inside list-disc space-y-2 text-sm text-gray-700">
            <li>Hidden Catalyst is informational research, not personalized investment advice.</li>
            <li>We do not guarantee that any catalyst will result in a specific price movement.</li>
            <li>Scores represent relative research priority, not buy/sell recommendations.</li>
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
