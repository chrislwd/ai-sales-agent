'use client'
import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import useSWR from 'swr'
import Link from 'next/link'
import { fetcher, apiFetch } from '@/lib/api'
import type { Account, Contact } from '@ai-sales/types'

interface ScoreBreakdown {
  industry: number
  size: number
  techStack: number
  geography: number
  engagement: number
  [key: string]: number
}

const BREAKDOWN_COLORS: Record<string, string> = {
  industry: 'bg-blue-500',
  size: 'bg-purple-500',
  techStack: 'bg-teal-500',
  geography: 'bg-orange-500',
  engagement: 'bg-pink-500',
}

const scoreColor = (s: number) => {
  if (s >= 80) return 'text-green-600 bg-green-50'
  if (s >= 50) return 'text-yellow-600 bg-yellow-50'
  return 'text-red-600 bg-red-50'
}

const contactScoreColor = (s: number) =>
  s >= 80 ? 'text-green-600' : s >= 50 ? 'text-yellow-600' : 'text-red-500'

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

export default function AccountDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [rescoring, setRescoring] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const { data: accountData, isLoading, error, mutate } = useSWR<{ data: Account & { scoreBreakdown?: ScoreBreakdown } }>(
    `/accounts/${id}`,
    fetcher,
  )

  const { data: contactsData, isLoading: contactsLoading } = useSWR<{ data: Contact[] }>(
    `/accounts/${id}/contacts`,
    fetcher,
  )

  const account = accountData?.data
  const contacts = contactsData?.data ?? []

  // Edit form state
  const [form, setForm] = useState<{
    companyName: string
    domain: string
    industry: string
    country: string
    employeeSize: string
    techStack: string
  } | null>(null)

  const startEdit = () => {
    if (!account) return
    setForm({
      companyName: account.companyName,
      domain: account.domain ?? '',
      industry: account.industry ?? '',
      country: account.country ?? '',
      employeeSize: account.employeeSize?.toString() ?? '',
      techStack: account.techStack?.join(', ') ?? '',
    })
    setEditing(true)
  }

  const saveEdit = async () => {
    if (!form) return
    try {
      await apiFetch(`/accounts/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          companyName: form.companyName,
          domain: form.domain || null,
          industry: form.industry || null,
          country: form.country || null,
          employeeSize: form.employeeSize ? parseInt(form.employeeSize, 10) : null,
          techStack: form.techStack ? form.techStack.split(',').map((s) => s.trim()).filter(Boolean) : [],
        }),
      })
      setEditing(false)
      setForm(null)
      mutate()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save')
    }
  }

  const handleRescore = async () => {
    setRescoring(true)
    try {
      await apiFetch(`/accounts/${id}/rescore`, { method: 'POST' })
      mutate()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to rescore')
    } finally {
      setRescoring(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await apiFetch(`/accounts/${id}`, { method: 'DELETE' })
      router.push('/dashboard/accounts')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete')
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-100 rounded w-64" />
          <div className="h-4 bg-gray-100 rounded w-48" />
          <div className="h-64 bg-gray-100 rounded" />
        </div>
      </div>
    )
  }

  if (error || !account) {
    return (
      <div className="p-8">
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <p className="text-gray-500">Account not found or failed to load.</p>
          <Link href="/dashboard/accounts" className="text-brand-600 text-sm mt-2 inline-block hover:underline">
            Back to accounts
          </Link>
        </div>
      </div>
    )
  }

  const breakdown = account.scoreBreakdown as ScoreBreakdown | undefined

  return (
    <div className="p-8 max-w-5xl">
      {/* Header */}
      <div className="mb-6">
        <Link href="/dashboard/accounts" className="text-sm text-gray-400 hover:text-gray-600 mb-2 inline-block">
          &larr; Back to accounts
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{account.companyName}</h1>
            {account.domain && <p className="text-sm text-gray-400 mt-0.5">{account.domain}</p>}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleRescore}
              disabled={rescoring}
              className="px-4 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              {rescoring ? 'Rescoring...' : 'Rescore'}
            </button>
            <button
              onClick={startEdit}
              className="px-4 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50"
            >
              Edit
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              className="px-4 py-2 border border-red-200 text-red-600 text-sm rounded-lg hover:bg-red-50"
            >
              Delete
            </button>
          </div>
        </div>
      </div>

      {/* Edit form */}
      {editing && form && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Edit Account</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-500 mb-1">Company Name</label>
              <input
                type="text"
                value={form.companyName}
                onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-500 mb-1">Domain</label>
              <input
                type="text"
                value={form.domain}
                onChange={(e) => setForm({ ...form, domain: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-500 mb-1">Industry</label>
              <input
                type="text"
                value={form.industry}
                onChange={(e) => setForm({ ...form, industry: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-500 mb-1">Country</label>
              <input
                type="text"
                value={form.country}
                onChange={(e) => setForm({ ...form, country: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-500 mb-1">Employee Size</label>
              <input
                type="number"
                value={form.employeeSize}
                onChange={(e) => setForm({ ...form, employeeSize: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-500 mb-1">Tech Stack (comma-separated)</label>
              <input
                type="text"
                value={form.techStack}
                onChange={(e) => setForm({ ...form, techStack: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>
          <div className="flex gap-3 mt-5">
            <button
              onClick={() => { setEditing(false); setForm(null) }}
              className="px-4 py-2 border border-gray-200 text-sm rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={saveEdit}
              className="px-4 py-2 bg-brand-600 text-white text-sm rounded-lg hover:bg-brand-700 font-medium"
            >
              Save changes
            </button>
          </div>
        </div>
      )}

      {/* Account info + ICP Score */}
      <div className="grid grid-cols-3 gap-6 mb-6">
        <div className="col-span-2 bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Account Information</h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
            <div>
              <dt className="text-gray-500">Industry</dt>
              <dd className="font-medium text-gray-900 mt-0.5">{account.industry ?? '---'}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Country</dt>
              <dd className="font-medium text-gray-900 mt-0.5">{account.country ?? '---'}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Employee Size</dt>
              <dd className="font-medium text-gray-900 mt-0.5">{account.employeeSize?.toLocaleString() ?? '---'}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Revenue Range</dt>
              <dd className="font-medium text-gray-900 mt-0.5">{account.revenueRange ?? '---'}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Funding Stage</dt>
              <dd className="font-medium text-gray-900 mt-0.5">{account.fundingStage ?? '---'}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Source</dt>
              <dd className="font-medium text-gray-900 mt-0.5 capitalize">{account.source.replace('_', ' ')}</dd>
            </div>
            {account.techStack && account.techStack.length > 0 && (
              <div className="col-span-2">
                <dt className="text-gray-500">Tech Stack</dt>
                <dd className="mt-1 flex flex-wrap gap-1.5">
                  {account.techStack.map((tech) => (
                    <span key={tech} className="px-2 py-0.5 bg-gray-100 rounded text-xs text-gray-700">
                      {tech}
                    </span>
                  ))}
                </dd>
              </div>
            )}
            {account.linkedinUrl && (
              <div>
                <dt className="text-gray-500">LinkedIn</dt>
                <dd className="mt-0.5">
                  <a href={account.linkedinUrl} target="_blank" rel="noreferrer" className="text-brand-600 text-sm hover:underline">
                    View profile
                  </a>
                </dd>
              </div>
            )}
          </dl>
        </div>

        {/* ICP Score Card */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">ICP Score</h2>
          <div className="text-center mb-5">
            <span className={`inline-block text-4xl font-bold px-4 py-2 rounded-xl ${scoreColor(account.score)}`}>
              {Math.round(account.score)}
            </span>
          </div>
          {breakdown && (
            <div className="space-y-3">
              {Object.entries(breakdown).map(([key, value]) => (
                <div key={key}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-500 capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
                    <span className="text-gray-700 font-medium">{Math.round(value)}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${BREAKDOWN_COLORS[key] ?? 'bg-gray-400'}`}
                      style={{ width: `${Math.min(value, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Contacts list */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Contacts</h2>
          <p className="text-sm text-gray-400">{contacts.length} contact(s) at this account</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Title</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Seniority</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Score</th>
            </tr>
          </thead>
          <tbody>
            {contactsLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i} className="border-b border-gray-50">
                  {Array.from({ length: 6 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 bg-gray-100 rounded animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))
            ) : contacts.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                  No contacts for this account.
                </td>
              </tr>
            ) : (
              contacts.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => router.push(`/dashboard/contacts/${c.id}`)}
                  className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer"
                >
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {c.firstName} {c.lastName}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{c.email}</td>
                  <td className="px-4 py-3 text-gray-600">{c.title ?? '---'}</td>
                  <td className="px-4 py-3 text-gray-600 capitalize">{c.seniority ?? '---'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${LIFECYCLE_COLORS[c.lifecycleStatus] ?? 'bg-gray-100 text-gray-500'}`}>
                      {c.lifecycleStatus.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`font-semibold text-sm ${contactScoreColor(c.score)}`}>
                      {Math.round(c.score)}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-2">Delete account?</h2>
            <p className="text-sm text-gray-500 mb-5">
              This will permanently delete <strong>{account.companyName}</strong> and all associated data. This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 px-4 py-2 border border-gray-200 text-sm rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 disabled:opacity-50 font-medium"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
