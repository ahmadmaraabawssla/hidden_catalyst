import Link from 'next/link';

export default function LandingPage() {
  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-brand-900 to-brand-700 text-white">
        <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
              Discover what the market hasn&apos;t priced in yet.
            </h1>
            <p className="mt-6 text-lg text-brand-100 leading-relaxed">
              Hidden Catalyst surfaces evidence-backed public developments connected to
              underfollowed U.S.-listed companies — so you can research before the crowd arrives.
            </p>
            <div className="mt-8 flex gap-4">
              <Link
                href="/feed"
                className="rounded-lg bg-white px-6 py-3 text-sm font-semibold text-brand-900 shadow hover:bg-brand-50 transition-colors"
              >
                Explore Opportunities
              </Link>
              <Link
                href="/methodology"
                className="rounded-lg border border-white/30 px-6 py-3 text-sm font-semibold text-white hover:bg-white/10 transition-colors"
              >
                How It Works
              </Link>
            </div>
          </div>
        </div>
        {/* Fade at bottom of hero */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-gray-50 to-transparent" />
      </section>

      {/* Value props */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="grid gap-8 md:grid-cols-3">
          <div className="card">
            <div className="mb-3 text-3xl">🔍</div>
            <h3 className="text-lg font-semibold text-gray-900">Evidence First</h3>
            <p className="mt-2 text-sm text-gray-600">
              Every surfaced opportunity is backed by primary-source documents with full
              traceability. Verified facts are separated from inferences, unverified claims,
              and rejected claims.
            </p>
          </div>
          <div className="card">
            <div className="mb-3 text-3xl">⚖️</div>
            <h3 className="text-lg font-semibold text-gray-900">Honest Epistemics</h3>
            <p className="mt-2 text-sm text-gray-600">
              Each thesis runs through eight named checks. &quot;Measured&quot; data is never
              conflated with market-cap proxies or estimates — the report tells you which is which.
            </p>
          </div>
          <div className="card">
            <div className="mb-3 text-3xl">🛡️</div>
            <h3 className="text-lg font-semibold text-gray-900">No Hype, No Promises</h3>
            <p className="mt-2 text-sm text-gray-600">
              We describe catalysts and scenarios — not guaranteed outcomes. An adversarial pass
              actively tries to weaken every thesis before it can advance.
            </p>
          </div>
        </div>
      </section>

      {/* How the report works */}
      <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
        <h2 className="mb-6 text-2xl font-bold text-gray-900">A Research Report, Not a Score</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="card">
            <h3 className="mb-3 font-semibold text-gray-900">The eight epistemic checks</h3>
            <ul className="space-y-2 text-sm text-gray-600">
              <li>· Source-specific deep research completed</li>
              <li>· Primary public source reviewed</li>
              <li>· Economic mechanism identified</li>
              <li>· Defined trigger variable checked</li>
              <li>· Materiality denominator checked</li>
              <li>· Catalyst attention measured (not proxied)</li>
              <li>· Price reaction measured (not estimated)</li>
              <li>· Counter-thesis evaluated</li>
            </ul>
          </div>
          <div className="card">
            <h3 className="mb-3 font-semibold text-gray-900">Measured vs. proxy, always labeled</h3>
            <p className="text-sm text-gray-600">
              Attention from actual news coverage is <span className="font-medium text-emerald-700">measured</span>.
              A market-cap-derived score with zero observed coverage is labeled a{' '}
              <span className="font-medium text-amber-700">proxy</span>. A price reaction with no
              post-event trading day is an <span className="font-medium text-amber-700">estimate</span> —
              never reported as if it were evidence.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
