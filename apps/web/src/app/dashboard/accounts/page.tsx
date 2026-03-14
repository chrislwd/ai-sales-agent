'use client'
import { useState, useRef } from 'react'
import useSWR from 'swr'
import { fetcher, apiFetch } from '@/lib/api'
import type { Account } from '@ai-sales/types'

export default function AccountsPage() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [importing, setImporting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const { data, isLoading, mutate } = useSWR<{ data: Account[]; total: number }>(
    `/accounts?page=${page}&pageSize=20${search ? `&search=${encodeURIComponent(search)}` : ''}`,
    fetcher,
  )

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const token = localStorage.getItem('access_token')
      await fetch(`${process.env['NEXT_PUBLIC_API_URL']}/accounts/import`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      })
      mutate()
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const scoreColor = (s: number) => {
    if (s >= 80) return 'text-green-600 bg-green-50'
    if (s >= 50) return 'text-yellow-600 bg-yellow-50'
    return 'text-red-600 bg-red-50'
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Accounts</h1>
          <p className="text-gray-500 text-sm mt-1">{data?.total ?? 0} total</p>
        </div>
        <div className="flex gap-3">
          <input
            type="file"
            accept=".csv"
            ref={fileRef}
            onChange={handleImport}
            className="hidden"
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={importing}
            className="px-4 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            {importing ? 'Importing...' : 'Import CSV'}
          </button>
          <button className="px-4 py-2 bg-brand-600 text-white text-sm rounded-lg hover:bg-brand-700">
            + Add account
          </button>
        </div>
      </div>

      <div className="mb-4">
        <input
          type="text"
          placeholder="Search accounts..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          className="w-full max-w-sm px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-4 py-3 font-medium text-gray-600">Company</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Industry</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Country</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Size</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Score</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Source</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
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
                  No accounts yet. Import a CSV to get started.
                </td>
              </tr>
            ) : (
              data?.data.map((a) => (
                <tr key={a.id} className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer">
                  <td className="px-4 py-3 font-medium">
                    <div>{a.companyName}</div>
                    {a.domain && <div className="text-xs text-gray-400">{a.domain}</div>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{a.industry ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{a.country ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{a.employeeSize?.toLocaleString() ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${scoreColor(a.score)}`}>
                      {Math.round(a.score)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 capitalize">{a.source.replace('_', ' ')}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {data && data.total > 20 && (
        <div className="flex justify-end gap-2 mt-4">
          <button
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-40 hover:bg-gray-50"
          >
            Prev
          </button>
          <span className="px-3 py-1.5 text-sm text-gray-600">Page {page}</span>
          <button
            disabled={page * 20 >= data.total}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-40 hover:bg-gray-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
