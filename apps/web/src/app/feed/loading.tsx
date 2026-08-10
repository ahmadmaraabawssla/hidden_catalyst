export default function Loading() {
  return (
    <div className="page-container">
      <div className="animate-pulse space-y-6">
        <div className="h-8 bg-gray-200 rounded w-48 mb-4" />
        <div className="space-y-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="card">
              <div className="flex justify-between gap-4">
                <div className="flex-1 space-y-3">
                  <div className="flex gap-2">
                    <div className="h-4 bg-gray-200 rounded w-32" />
                    <div className="h-4 bg-gray-200 rounded w-20" />
                    <div className="h-4 bg-gray-200 rounded w-16" />
                  </div>
                  <div className="h-5 bg-gray-200 rounded w-3/4" />
                  <div className="h-4 bg-gray-200 rounded w-full" />
                  <div className="h-3 bg-gray-200 rounded w-48" />
                </div>
                <div className="text-right shrink-0">
                  <div className="h-8 w-12 bg-gray-200 rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
