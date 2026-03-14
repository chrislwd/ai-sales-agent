'use client'
import useSWR from 'swr'
import { fetcher, apiFetch } from '@/lib/api'
import type { Meeting } from '@ai-sales/types'
import clsx from 'clsx'

const STATUS_COLORS: Record<string, string> = {
  proposed: 'bg-yellow-100 text-yellow-700',
  confirmed: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-gray-100 text-gray-500',
  no_show: 'bg-red-100 text-red-600',
}

export default function MeetingsPage() {
  const { data, isLoading, mutate } = useSWR<{ data: (Meeting & { contact: any; account: any })[] }>(
    '/meetings',
    fetcher,
  )

  const updateStatus = async (id: string, status: string) => {
    await apiFetch(`/meetings/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) })
    mutate()
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Meetings</h1>
        <p className="text-gray-500 text-sm mt-1">Scheduled and proposed meetings</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-4 py-3 font-medium text-gray-600">Contact</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Company</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Scheduled</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Duration</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i} className="border-b border-gray-50">
                  {Array.from({ length: 6 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 bg-gray-100 rounded animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))
            ) : data?.data.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                  No meetings yet
                </td>
              </tr>
            ) : (
              data?.data.map((m) => (
                <tr key={m.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium">{m.contact?.firstName} {m.contact?.lastName}</p>
                    <p className="text-xs text-gray-400">{m.contact?.title}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{m.account?.companyName ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {m.scheduledAt ? new Date(m.scheduledAt).toLocaleString() : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{m.durationMinutes}m</td>
                  <td className="px-4 py-3">
                    <span className={clsx('px-2 py-0.5 rounded-full text-xs font-medium', STATUS_COLORS[m.status])}>
                      {m.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      {m.status === 'confirmed' && (
                        <button
                          onClick={() => updateStatus(m.id, 'completed')}
                          className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200"
                        >
                          Complete
                        </button>
                      )}
                      {m.status === 'proposed' && (
                        <button
                          onClick={() => updateStatus(m.id, 'cancelled')}
                          className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
                        >
                          Cancel
                        </button>
                      )}
                      {m.preCallBrief && (
                        <a
                          href={`/dashboard/meetings/${m.id}`}
                          className="text-xs px-2 py-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100"
                        >
                          Brief
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
