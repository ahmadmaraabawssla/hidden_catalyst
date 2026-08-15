import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Hidden Catalyst — Discovery Platform',
  description:
    'Evidence-first public-market intelligence for underfollowed U.S.-listed companies.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50">
        <header className="sticky top-0 z-50 border-b border-gray-200 bg-white/90 backdrop-blur">
          <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
            <a href="/" className="flex items-center gap-2 shrink-0">
              <span className="text-lg sm:text-xl font-bold text-brand-900">Hidden Catalyst</span>
              <span className="hidden sm:inline rounded bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-700">
                Beta
              </span>
            </a>
            {/* Mobile hamburger — simple approach */}
            <input type="checkbox" id="mobile-menu" className="peer hidden" />
            <label htmlFor="mobile-menu" className="lg:hidden cursor-pointer p-2">
              <svg className="h-6 w-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </label>
            <div className="hidden lg:flex items-center gap-6 text-sm font-medium text-gray-600">
              <a href="/feed" className="hover:text-brand-700 transition-colors">Discoveries</a>
              <a href="/search" className="hover:text-brand-700 transition-colors">Search</a>
              <a href="/watchlists" className="hover:text-brand-700 transition-colors">Watchlists</a>
              <a href="/methodology" className="hover:text-brand-700 transition-colors">Methodology</a>
            </div>
            {/* Mobile dropdown */}
            <div className="peer-checked:flex hidden absolute top-16 left-0 right-0 bg-white border-b border-gray-200 flex-col p-4 gap-3 text-sm font-medium text-gray-600 lg:hidden shadow-lg">
              <a href="/feed" className="hover:text-brand-700 py-2">Discoveries</a>
              <a href="/search" className="hover:text-brand-700 py-2">Search</a>
              <a href="/watchlists" className="hover:text-brand-700 py-2">Watchlists</a>
              <a href="/methodology" className="hover:text-brand-700 py-2">Methodology</a>
            </div>
          </nav>
        </header>
        <main>{children}</main>
        <footer className="border-t border-gray-200 bg-white mt-16">
          <div className="mx-auto max-w-7xl px-4 py-8 text-center text-xs sm:text-sm text-gray-500 sm:px-6 lg:px-8">
            <p>
              Hidden Catalyst Discovery Platform — Informational research, not investment advice.
              All data from public sources. No guaranteed outcomes.
            </p>
            <p className="mt-1">
              <a href="/methodology" className="underline hover:text-brand-700">Methodology</a>
              {' · '}
              <a href="/terms" className="underline hover:text-brand-700">Terms</a>
              {' · '}
              <a href="/privacy" className="underline hover:text-brand-700">Privacy</a>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
