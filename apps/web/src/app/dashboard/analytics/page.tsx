'use client'
import useSWR from 'swr'
import { fetcher } from '@/lib/api'

interface AuditEntry {
  id: string
  objectType: string
  objectId: string
  activityType: string
  actorType: string
  actorId: string | null
  payload: unknown
  createdAt: string
}

export default function AnalyticsPage() {
  const { data: auditData, isLoading } = useSWR<{ data: AuditEntry[] }>(
    '/analytics/audit-log',
    fetcher,
  )

  const ACTOR_ICON: Record<string, string> = {
    ai: '🤖',
    user: '👤',
    system: '⚙️',
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Analytics & Audit Log</h1>
        <p className="text-gray-500 text-sm mt-1">Full history of all AI and human actions</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
          <p className="text-sm font-medium text-gray-700">Audit log</p>
          <p className="text-xs text-gray-400">{auditData?.data.length ?? 0} entries</p>
        </div>

        <div className="divide-y divide-gray-50">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="px-4 py-3 flex gap-3 animate-pulse">
                <div className="w-6 h-6 bg-gray-100 rounded-full" />
                <div className="flex-1 space-y-1">
                  <div className="h-3 bg-gray-100 rounded w-1/3" />
                  <div className="h-3 bg-gray-100 rounded w-1/2" />
                </div>
              </div>
            ))
          ) : auditData?.data.length === 0 ? (
            <div className="px-4 py-10 text-center text-gray-400 text-sm">No activity yet</div>
          ) : (
            auditData?.data.map((entry) => (
              <div key={entry.id} className="px-4 py-3 flex gap-3 text-sm hover:bg-gray-50">
                <span className="text-base flex-none">{ACTOR_ICON[entry.actorType] ?? '⚙️'}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-800 capitalize">
                      {entry.activityType.replace(/_/g, ' ')}
                    </span>
                    <span className="text-xs text-gray-400 capitalize">
                      {entry.objectType}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5 font-mono truncate">
                    id: {entry.objectId}
                  </p>
                </div>
                <p className="text-xs text-gray-400 flex-none">
                  {new Date(entry.createdAt).toLocaleString()}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
