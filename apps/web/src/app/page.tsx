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
              traceability. Verified facts are clearly separated from inferences and estimates.
            </p>
          </div>
          <div className="card">
            <div className="mb-3 text-3xl">⚖️</div>
            <h3 className="text-lg font-semibold text-gray-900">Explainable Scoring</h3>
            <p className="mt-2 text-sm text-gray-600">
              No black boxes. Every score exposes its raw factors, weights, model version,
              and confidence level. You decide what matters.
            </p>
          </div>
          <div className="card">
            <div className="mb-3 text-3xl">🛡️</div>
            <h3 className="text-lg font-semibold text-gray-900">No Hype, No Promises</h3>
            <p className="mt-2 text-sm text-gray-600">
              We describe catalysts and scenarios — not guaranteed outcomes. Risk flags,
              invalidation conditions, and limitations are always shown.
            </p>
          </div>
        </div>
      </section>

      {/* Example opportunity card */}
      <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-8">See It In Action</h2>
        <div className="card max-w-2xl">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-semibold text-gray-900">Example Systems</span>
            <span className="text-sm text-gray-500">EXM · NASDAQ</span>
            <span className="text-xs text-gray-400">$780M Market Cap</span>
          </div>
          <h3 className="font-semibold text-brand-700">
            Federal contract modification expands program ceiling
          </h3>
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
              Verified Fact
            </span>
            <span className="text-sm text-gray-700">
              The agency published a contract modification increasing the ceiling by $42M.
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
              Inference
            </span>
            <span className="text-sm text-gray-600">
              The modification may expand addressable revenue by 12-18% over two years.
            </span>
          </div>
          <div className="mt-4 flex items-center gap-4 text-sm">
            <span className="font-semibold text-brand-700">Opportunity Score: 78</span>
            <span className="text-gray-500">Evidence: 4 items</span>
            <span className="text-gray-500">3 reasons it may be overlooked</span>
          </div>
        </div>
      </section>
    </div>
  );
}
