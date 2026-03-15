'use client'
import { useState, useRef } from 'react'
import useSWR from 'swr'
import { fetcher, apiFetch } from '@/lib/api'
import type { Contact, Sequence } from '@ai-sales/types'
import clsx from 'clsx'

const SAMPLE_CSV = `first_name,last_name,email,title,seniority,job_function,country,phone,linkedin_url,company_name
Jane,Doe,jane.doe@example.com,VP of Sales,vp,sales,United States,+1-555-0100,https://linkedin.com/in/janedoe,Acme Inc
John,Smith,john.smith@example.com,Engineering Manager,manager,engineering,United Kingdom,+44-20-7946-0958,https://linkedin.com/in/johnsmith,Globex Corp`

interface ImportResult {
  imported: number
  skipped: number
  accountsCreated: number
}

const LIFECYCLE_COLORS: Record<string, string> = {
  new: 'bg-gray-100 text-gray-600',
  contacted: 'bg-blue-100 text-blue-700',
  replied: 'bg-purple-100 text-purple-700',
  meeting_scheduled: 'bg-green-100 text-green-700',
  meeting_completed: 'bg-teal-100 text-teal-700',
  qualified: 'bg-emerald-100 text-emerald-700',
  disqualified: 'bg-red-100 text-red-600',
  nurture: 'bg-yellow-100 text-yellow-700',
}

interface EnrollModalProps {
  contactIds: string[]
  onClose: () => void
  onDone: () => void
}

function EnrollModal({ contactIds, onClose, onDone }: EnrollModalProps) {
  const { data } = useSWR<{ data: Sequence[] }>('/sequences?status=active', fetcher)
  const [selectedSeq, setSelectedSeq] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ enrolled: number; skipped: number } | null>(null)

  const enroll = async () => {
    if (!selectedSeq) return
    setLoading(true)
    try {
      const { data: r } = await apiFetch<{ data: { enrolled: number; skipped: number } }>(
        `/sequences/${selectedSeq}/enroll`,
        { method: 'POST', body: JSON.stringify({ contactIds }) },
      )
      setResult(r)
    } finally {
      setLoading(false)
    }
  }

  const activeSeqs = data?.data.filter((s) => s.status === 'active') ?? []

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-1">Enroll in sequence</h2>
        <p className="text-sm text-gray-500 mb-5">{contactIds.length} contact(s) selected</p>

        {result ? (
          <div className="text-center py-4">
            <p className="text-3xl font-bold text-green-600">{result.enrolled}</p>
            <p className="text-gray-600 mt-1">contacts enrolled</p>
            {result.skipped > 0 && (
              <p className="text-sm text-gray-400 mt-1">{result.skipped} skipped (already enrolled or suppressed)</p>
            )}
            <button onClick={onDone} className="mt-6 px-6 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700">
              Done
            </button>
          </div>
        ) : (
          <>
            {activeSeqs.length === 0 ? (
              <p className="text-sm text-gray-500 mb-4">
                No active sequences. <a href="/dashboard/sequences/new" className="text-brand-600 underline">Create one first.</a>
              </p>
            ) : (
              <div className="space-y-2 mb-5">
                {activeSeqs.map((s) => (
                  <label
                    key={s.id}
                    className={clsx(
                      'flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition',
                      selectedSeq === s.id ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:bg-gray-50',
                    )}
                  >
                    <input
                      type="radio"
                      name="seq"
                      value={s.id}
                      checked={selectedSeq === s.id}
                      onChange={() => setSelectedSeq(s.id)}
                      className="text-brand-600"
                    />
                    <div>
                      <p className="font-medium text-sm text-gray-900">{s.name}</p>
                      <p className="text-xs text-gray-400">{s.steps?.length ?? 0} steps · {s.dailySendLimit}/day</p>
                    </div>
                  </label>
                ))}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-gray-200 text-sm rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={enroll}
                disabled={!selectedSeq || loading}
                className="flex-1 px-4 py-2 bg-brand-600 text-white text-sm rounded-lg hover:bg-brand-700 disabled:opacity-50 font-medium"
              >
                {loading ? 'Enrolling...' : 'Enroll'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function ImportCSVModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<ImportResult | null>(null)

  const downloadSample = () => {
    const blob = new Blob([SAMPLE_CSV], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'contacts_sample.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0]
    if (!file) return
    setLoading(true)
    setError('')
    try {
      const formData = new FormData()
      formData.append('file', file)
      const token = localStorage.getItem('access_token')
      const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001/api/v1'
      const res = await fetch(`${API_URL}/contacts/import`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }))
        throw new Error(err.error ?? res.statusText)
      }
      const json = await res.json()
      setResult(json.data)
    } catch (e: any) {
      setError(e.message ?? 'Import failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-1">Import contacts from CSV</h2>
        <p className="text-sm text-gray-500 mb-5">
          Upload a CSV file with contact data. Accounts will be matched or created automatically.
        </p>

        {result ? (
          <div className="text-center py-4">
            <p className="text-3xl font-bold text-green-600">{result.imported}</p>
            <p className="text-gray-600 mt-1">contacts imported</p>
            {result.skipped > 0 && (
              <p className="text-sm text-gray-400 mt-1">{result.skipped} skipped (duplicate or invalid)</p>
            )}
            {result.accountsCreated > 0 && (
              <p className="text-sm text-gray-400 mt-1">{result.accountsCreated} new accounts created</p>
            )}
            <button onClick={onDone} className="mt-6 px-6 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700">
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="mb-4">
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100"
              />
            </div>

            <button
              onClick={downloadSample}
              className="text-sm text-brand-600 hover:text-brand-700 underline mb-4 inline-block"
            >
              Download sample CSV template
            </button>

            {error && (
              <p className="text-sm text-red-600 mb-3">{error}</p>
            )}

            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-gray-200 text-sm rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleUpload}
                disabled={loading}
                className="flex-1 px-4 py-2 bg-brand-600 text-white text-sm rounded-lg hover:bg-brand-700 disabled:opacity-50 font-medium"
              >
                {loading ? 'Importing...' : 'Upload & Import'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default function ContactsPage() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showEnroll, setShowEnroll] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [statusFilter, setStatusFilter] = useState('')

  const { data, isLoading, mutate } = useSWR<{ data: Contact[]; total: number }>(
    `/contacts?page=${page}&pageSize=20${search ? `&search=${encodeURIComponent(search)}` : ''}${statusFilter ? `&status=${statusFilter}` : ''}`,
    fetcher,
  )

  const toggleSelect = (id: string) => {
    setSelected((s) => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  const selectAll = () => {
    if (!data?.data) return
    const ids = data.data.map((c) => c.id)
    setSelected((s) => s.size === ids.length ? new Set() : new Set(ids))
  }

  const scoreColor = (s: number) =>
    s >= 80 ? 'text-green-600' : s >= 50 ? 'text-yellow-600' : 'text-red-500'

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contacts</h1>
          <p className="text-gray-500 text-sm mt-1">{data?.total ?? 0} total</p>
        </div>
        <div className="flex gap-2">
          {selected.size > 0 && (
            <button
              onClick={() => setShowEnroll(true)}
              className="px-4 py-2 bg-brand-600 text-white text-sm rounded-lg hover:bg-brand-700 font-medium"
            >
              Enroll {selected.size} in sequence
            </button>
          )}
          <button
            onClick={() => setShowImport(true)}
            className="px-4 py-2 border border-gray-200 text-sm rounded-lg hover:bg-gray-50"
          >
            Import CSV
          </button>
          <button className="px-4 py-2 border border-gray-200 text-sm rounded-lg hover:bg-gray-50">
            + Add contact
          </button>
        </div>
      </div>

      <div className="flex gap-3 mb-4">
        <input
          type="text"
          placeholder="Search contacts..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          className="w-64 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">All statuses</option>
          {Object.keys(LIFECYCLE_COLORS).map((s) => (
            <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="px-4 py-3 w-10">
                <input
                  type="checkbox"
                  checked={!!data?.data.length && selected.size === data.data.length}
                  onChange={selectAll}
                  className="rounded text-brand-600"
                />
              </th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Title</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Score</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-gray-50">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 bg-gray-100 rounded animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))
            ) : data?.data.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-gray-400">
                  No contacts yet. Import accounts with contacts to get started.
                </td>
              </tr>
            ) : (
              data?.data.map((c) => (
                <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(c.id)}
                      onChange={() => toggleSelect(c.id)}
                      className="rounded text-brand-600"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{c.firstName} {c.lastName}</p>
                    <p className="text-xs text-gray-400">{c.email}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{c.title ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={clsx('px-2 py-0.5 rounded-full text-xs font-medium', LIFECYCLE_COLORS[c.lifecycleStatus] ?? 'bg-gray-100 text-gray-500')}>
                      {c.lifecycleStatus.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={clsx('font-semibold text-sm', scoreColor(c.score))}>
                      {Math.round(c.score)}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {data && data.total > 20 && (
        <div className="flex justify-end gap-2 mt-4">
          <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}
            className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-40 hover:bg-gray-50">Prev</button>
          <span className="px-3 py-1.5 text-sm text-gray-600">Page {page}</span>
          <button disabled={page * 20 >= data.total} onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-40 hover:bg-gray-50">Next</button>
        </div>
      )}

      {showEnroll && (
        <EnrollModal
          contactIds={Array.from(selected)}
          onClose={() => setShowEnroll(false)}
          onDone={() => { setShowEnroll(false); setSelected(new Set()); mutate() }}
        />
      )}

      {showImport && (
        <ImportCSVModal
          onClose={() => setShowImport(false)}
          onDone={() => { setShowImport(false); mutate() }}
        />
      )}
    </div>
  )
}
