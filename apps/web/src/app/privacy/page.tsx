export default function PrivacyPage() {
  return (
    <div className="page-container max-w-3xl">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Privacy Policy</h1>
      <div className="space-y-6 text-sm text-gray-700">
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">1. Information We Collect</h2>
          <p>We collect the minimum information necessary to provide the Service: email address (if you choose to sign in) and usage analytics. We do not track your investment decisions, portfolio holdings, or personal financial information.</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">2. How We Use Data</h2>
          <p>Usage data helps us improve the Service. We do not sell, share, or rent your personal information to third parties.</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">3. Cookies</h2>
          <p>We use essential cookies for session management. No third-party tracking or advertising cookies are deployed.</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">4. Data Security</h2>
          <p>All data is encrypted in transit and at rest. We use managed infrastructure with regular security updates.</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">5. Contact</h2>
          <p>For privacy-related inquiries, contact the platform administrator via the repository.</p>
        </section>
      </div>
    </div>
  );
}
