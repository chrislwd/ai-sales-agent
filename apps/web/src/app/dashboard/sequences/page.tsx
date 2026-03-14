'use client'
import { useState } from 'react'
import useSWR from 'swr'
import { fetcher, apiFetch } from '@/lib/api'
import type { Sequence } from '@ai-sales/types'
import clsx from 'clsx'

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  active: 'bg-green-100 text-green-700',
  paused: 'bg-yellow-100 text-yellow-700',
  archived: 'bg-red-100 text-red-600',
}

export default function SequencesPage() {
  const { data, isLoading, mutate } = useSWR<{ data: Sequence[] }>('/sequences', fetcher)
  const [activating, setActivating] = useState<string | null>(null)

  const toggleStatus = async (seq: Sequence) => {
    const newStatus = seq.status === 'active' ? 'paused' : 'active'
    setActivating(seq.id)
    try {
      await apiFetch(`/sequences/${seq.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      })
      mutate()
    } finally {
      setActivating(null)
    }
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sequences</h1>
          <p className="text-gray-500 text-sm mt-1">Automated email outreach sequences</p>
        </div>
        <a
          href="/dashboard/sequences/new"
          className="px-4 py-2 bg-brand-600 text-white text-sm rounded-lg hover:bg-brand-700"
        >
          + New sequence
        </a>
      </div>

      <div className="space-y-3">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 h-24 animate-pulse" />
          ))
        ) : data?.data.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <p className="text-gray-400 mb-4">No sequences yet</p>
            <a href="/dashboard/sequences/new" className="text-brand-600 hover:underline text-sm font-medium">
              Create your first sequence
            </a>
          </div>
        ) : (
          data?.data.map((seq) => (
            <div key={seq.id} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold text-gray-900">{seq.name}</h3>
                    <span className={clsx('px-2 py-0.5 rounded-full text-xs font-medium', STATUS_COLORS[seq.status])}>
                      {seq.status}
                    </span>
                  </div>
                  {seq.description && <p className="text-sm text-gray-500 mt-1">{seq.description}</p>}
                  <div className="flex gap-4 mt-3 text-xs text-gray-400">
                    <span>{seq.steps?.length ?? 0} steps</span>
                    <span>Limit: {seq.dailySendLimit}/day</span>
                    <span>Window: {seq.sendWindowStart}–{seq.sendWindowEnd}</span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <a
                    href={`/dashboard/sequences/${seq.id}`}
                    className="px-3 py-1.5 border border-gray-200 text-sm rounded-lg hover:bg-gray-50"
                  >
                    Edit
                  </a>
                  {seq.status !== 'archived' && (
                    <button
                      onClick={() => toggleStatus(seq)}
                      disabled={activating === seq.id}
                      className={clsx(
                        'px-3 py-1.5 text-sm rounded-lg font-medium transition disabled:opacity-50',
                        seq.status === 'active'
                          ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                          : 'bg-green-100 text-green-700 hover:bg-green-200',
                      )}
                    >
                      {activating === seq.id ? '...' : seq.status === 'active' ? 'Pause' : 'Activate'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
