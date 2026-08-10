import { getUserWatchlists } from '@hidden-catalyst/db';

export const dynamic = 'force-dynamic';
const MOCK_USER_ID = 'user_mock_001';

export default async function WatchlistsPage() {
  const watchlists = await getUserWatchlists(MOCK_USER_ID);

  return (
    <div className="page-container">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Watchlists</h1>
          <p className="mt-1 text-sm text-gray-500">Track securities, sectors, and catalyst types that matter to you.</p>
        </div>
        <form action={async () => { 'use server'; }}>
          <button type="submit" className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-900 transition-colors">
            + New Watchlist
          </button>
        </form>
      </div>

      {watchlists.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-500">No watchlists yet. Create one to start tracking.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {watchlists.map((wl) => (
            <div key={wl.id} className="card">
              <h3 className="font-semibold text-gray-900">{wl.name}</h3>
              <p className="text-sm text-gray-500 mt-1">
                {wl.items.length} {wl.items.length === 1 ? 'item' : 'items'}
              </p>
              <div className="mt-4 flex gap-2">
                <button className="text-sm text-brand-700 hover:underline">View</button>
                <button className="text-sm text-gray-500 hover:underline">Edit</button>
                <button className="text-sm text-red-500 hover:underline">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <section className="mt-12">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Alert Preferences</h2>
        <div className="card space-y-4 max-w-lg">
          <Toggle label="Daily Digest" desc="Summary of new opportunities matching your watchlists" defaultChecked />
          <Toggle label="High-Confidence Alerts" desc="Immediate email for opportunities scoring 80+" />
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">Digest Time</label>
            <select className="rounded-lg border border-gray-300 px-3 py-2 text-sm" defaultValue="08:00">
              <option value="06:00">6:00 AM ET</option>
              <option value="07:00">7:00 AM ET</option>
              <option value="08:00">8:00 AM ET</option>
              <option value="09:00">9:00 AM ET</option>
              <option value="17:00">5:00 PM ET</option>
            </select>
          </div>
        </div>
      </section>
    </div>
  );
}

function Toggle({ label, desc, defaultChecked = false }: { label: string; desc: string; defaultChecked?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="font-medium text-gray-900">{label}</p>
        <p className="text-sm text-gray-500">{desc}</p>
      </div>
      <label className="relative inline-flex items-center cursor-pointer shrink-0">
        <input type="checkbox" className="sr-only peer" defaultChecked={defaultChecked} />
        <div className="w-9 h-5 bg-gray-200 peer-focus:ring-2 peer-focus:ring-brand-300 rounded-full peer peer-checked:bg-brand-700 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all" />
      </label>
    </div>
  );
}
