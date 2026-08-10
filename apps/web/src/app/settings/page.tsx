export default function SettingsPage() {
  return (
    <div className="page-container max-w-2xl">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Settings</h1>

      <div className="space-y-8">
        {/* Profile */}
        <section className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Profile</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                defaultValue="researcher@example.com"
                disabled
              />
              <p className="text-xs text-gray-500 mt-1">Authentication coming soon.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
              <select className="rounded-lg border border-gray-300 px-3 py-2 text-sm" defaultValue="America/New_York">
                <option value="America/New_York">Eastern (ET)</option>
                <option value="America/Chicago">Central (CT)</option>
                <option value="America/Denver">Mountain (MT)</option>
                <option value="America/Los_Angeles">Pacific (PT)</option>
              </select>
            </div>
          </div>
        </section>

        {/* Default Filters */}
        <section className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Default Feed Filters</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Market Cap Range</label>
              <select className="rounded-lg border border-gray-300 px-3 py-2 text-sm w-full" defaultValue="200-5000">
                <option value="100-500">$100M – $500M (Micro)</option>
                <option value="200-5000">$200M – $5B (Default)</option>
                <option value="500-2000">$500M – $2B</option>
                <option value="2000-10000">$2B – $10B</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Min Opportunity Score</label>
              <input
                type="range"
                min="0"
                max="100"
                defaultValue="50"
                className="w-full"
              />
              <div className="flex justify-between text-xs text-gray-500">
                <span>0</span>
                <span>50</span>
                <span>100</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Evidence Requirement</label>
              <select className="rounded-lg border border-gray-300 px-3 py-2 text-sm w-full" defaultValue="any">
                <option value="any">Any evidence</option>
                <option value="primary">Primary source only</option>
                <option value="high_quality">Evidence Quality 80+</option>
              </select>
            </div>
          </div>
        </section>

        {/* Notification Preferences */}
        <section className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Notifications</h2>
          <div className="space-y-3">
            {[
              { label: 'Daily digest email', desc: 'Summary of new opportunities matching your watchlists' },
              { label: 'High-confidence alerts', desc: 'Immediate email for opportunities scoring 80+' },
              { label: 'Invalidation alerts', desc: 'When a monitored catalyst is invalidated or confirmed' },
              { label: 'Watchlist activity', desc: 'New opportunities added to your tracked companies' },
            ].map((item) => (
              <div key={item.label} className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-sm text-gray-900">{item.label}</p>
                  <p className="text-xs text-gray-500">{item.desc}</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input type="checkbox" className="sr-only peer" defaultChecked />
                  <div className="w-9 h-5 bg-gray-200 peer-focus:ring-2 peer-focus:ring-brand-300 rounded-full peer peer-checked:bg-brand-700 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all"></div>
                </label>
              </div>
            ))}
          </div>
        </section>

        {/* Legal */}
        <section className="card border-amber-200 bg-amber-50">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Legal Preferences</h2>
          <div className="space-y-2 text-sm text-gray-700">
            <p>By using Hidden Catalyst, you acknowledge that:</p>
            <ul className="list-inside list-disc space-y-1">
              <li>This is informational research, not investment advice.</li>
              <li>We do not guarantee any investment outcome.</li>
              <li>All information is sourced from public documents.</li>
              <li>You are responsible for your own investment decisions.</li>
            </ul>
          </div>
        </section>

        <button className="rounded-lg bg-brand-700 px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-900 transition-colors">
          Save Settings
        </button>
      </div>
    </div>
  );
}
