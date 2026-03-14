'use client'
import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import useSWR from 'swr'
import { fetcher, apiFetch } from '@/lib/api'
import { SequenceEditor } from '@/components/ui/SequenceEditor'
import type { Sequence } from '@ai-sales/types'

export default function SequenceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [enrollTab, setEnrollTab] = useState(false)

  const { data, mutate } = useSWR<{ data: Sequence & { steps: any[] } }>(
    `/sequences/${id}`,
    fetcher,
  )
  const seq = data?.data

  const { data: enrollmentsData } = useSWR(
    enrollTab ? `/sequences/${id}/enrollments` : null,
    fetcher,
  )

  const handleSave = async (draft: any) => {
    setSaving(true)
    setError('')
    try {
      await apiFetch(`/sequences/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ ...draft, steps: draft.steps.map(({ id: _id, ...s }: any) => s) }),
      })
      mutate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async () => {
    if (!seq) return
    const newStatus = seq.status === 'active' ? 'paused' : 'active'
    await apiFetch(`/sequences/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status: newStatus }) })
    mutate()
  }

  if (!seq) return (
    <div className="p-8 animate-pulse">
      <div className="h-8 bg-gray-100 rounded w-48 mb-6" />
      <div className="h-64 bg-gray-100 rounded" />
    </div>
  )

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <a href="/dashboard/sequences" className="text-gray-400 hover:text-gray-600 text-sm">
            ← Sequences
          </a>
          <span className="text-gray-300">/</span>
          <h1 className="text-xl font-bold text-gray-900">{seq.name}</h1>
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
            seq.status === 'active' ? 'bg-green-100 text-green-700' :
            seq.status === 'paused' ? 'bg-yellow-100 text-yellow-700' :
            'bg-gray-100 text-gray-500'
          }`}>
            {seq.status}
          </span>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setEnrollTab((t) => !t)}
            className="px-3 py-1.5 border border-gray-200 text-sm rounded-lg hover:bg-gray-50"
          >
            {enrollTab ? 'Edit sequence' : 'View enrollments'}
          </button>
          {seq.status !== 'archived' && (
            <button
              onClick={toggleActive}
              className={`px-3 py-1.5 text-sm rounded-lg font-medium ${
                seq.status === 'active'
                  ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                  : 'bg-green-100 text-green-700 hover:bg-green-200'
              }`}
            >
              {seq.status === 'active' ? 'Pause' : 'Activate'}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}

      {!enrollTab ? (
        <SequenceEditor
          initial={{
            ...seq,
            steps: seq.steps?.map((s: any) => ({ ...s, id: s.id ?? crypto.randomUUID() })) ?? [],
          }}
          onSave={handleSave}
          saving={saving}
        />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Contact</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Step</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Next send</th>
              </tr>
            </thead>
            <tbody>
              {!enrollmentsData?.data?.length ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                    No enrollments yet
                  </td>
                </tr>
              ) : (
                enrollmentsData.data.map((e: any) => (
                  <tr key={e.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-medium">{e.contact?.firstName} {e.contact?.lastName}</p>
                      <p className="text-xs text-gray-400">{e.contact?.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        e.status === 'active' ? 'bg-green-100 text-green-700' :
                        e.status === 'completed' ? 'bg-blue-100 text-blue-700' :
                        e.status === 'replied' ? 'bg-purple-100 text-purple-700' :
                        'bg-gray-100 text-gray-500'
                      }`}>
                        {e.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{e.currentStepPosition + 1} / {seq.steps?.length ?? '?'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {e.nextSendAt ? new Date(e.nextSendAt).toLocaleString() : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
