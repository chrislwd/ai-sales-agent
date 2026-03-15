export default function DashboardLoading() {
  return (
    <div className="flex min-h-screen">
      {/* Sidebar skeleton */}
      <aside className="w-56 bg-brand-900 flex flex-col h-screen sticky top-0">
        {/* Workspace info */}
        <div className="px-4 py-5 border-b border-brand-700">
          <div className="h-4 w-32 rounded bg-brand-700 animate-pulse" />
          <div className="h-3 w-24 rounded bg-brand-700 animate-pulse mt-2" />
        </div>

        {/* Nav items */}
        <nav className="flex-1 py-4 px-2 space-y-1">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2">
              <div className="h-5 w-5 rounded bg-brand-700 animate-pulse" />
              <div
                className="h-4 rounded bg-brand-700 animate-pulse"
                style={{ width: `${60 + Math.random() * 40}%` }}
              />
            </div>
          ))}
        </nav>

        {/* Sign-out placeholder */}
        <div className="px-4 py-4 border-t border-brand-700">
          <div className="h-4 w-16 rounded bg-brand-700 animate-pulse" />
        </div>
      </aside>

      {/* Main content skeleton */}
      <main className="flex-1 overflow-auto p-6">
        {/* Page title */}
        <div className="h-8 w-48 rounded bg-gray-200 animate-pulse mb-6" />

        {/* Stat cards row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-gray-200 bg-white p-5">
              <div className="h-3 w-20 rounded bg-gray-200 animate-pulse mb-3" />
              <div className="h-7 w-24 rounded bg-gray-200 animate-pulse mb-2" />
              <div className="h-3 w-16 rounded bg-gray-100 animate-pulse" />
            </div>
          ))}
        </div>

        {/* Content cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-gray-200 bg-white p-5">
              <div className="h-5 w-36 rounded bg-gray-200 animate-pulse mb-4" />
              <div className="space-y-3">
                <div className="h-3 w-full rounded bg-gray-100 animate-pulse" />
                <div className="h-3 w-5/6 rounded bg-gray-100 animate-pulse" />
                <div className="h-3 w-4/6 rounded bg-gray-100 animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
