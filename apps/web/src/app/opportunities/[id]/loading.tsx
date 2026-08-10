export default function Loading() {
  return (
    <div className="page-container animate-pulse">
      <div className="h-4 bg-gray-200 rounded w-64 mb-8" />
      <div className="flex gap-8 flex-col lg:flex-row">
        <div className="flex-1 space-y-6">
          <div className="card space-y-3">
            <div className="h-6 bg-gray-200 rounded w-48" />
            <div className="h-4 bg-gray-200 rounded w-full" />
            <div className="h-4 bg-gray-200 rounded w-3/4" />
          </div>
          <div className="card space-y-3">
            <div className="h-6 bg-gray-200 rounded w-32" />
            <div className="h-12 bg-gray-200 rounded w-full" />
            <div className="h-12 bg-gray-200 rounded w-full" />
          </div>
        </div>
        <aside className="w-80 space-y-4">
          <div className="card text-center">
            <div className="h-16 w-16 bg-gray-200 rounded mx-auto" />
            <div className="h-4 bg-gray-200 rounded w-24 mx-auto mt-3" />
            <div className="space-y-2 mt-4">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="h-3 bg-gray-200 rounded w-full" />
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
