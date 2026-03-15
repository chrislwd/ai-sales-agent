'use client'
import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import useSWR from 'swr'
import Link from 'next/link'
import { fetcher, apiFetch } from '@/lib/api'
import type { Contact, Sequence, EnrollmentStatus } from '@ai-sales/types'
import clsx from 'clsx'

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

const LIFECYCLE_OPTIONS = [
  'new',
  'contacted',
  'replied',
  'meeting_scheduled',
  'meeting_completed',
  'qualified',
  'disqualified',
  'nurture',
] as const

const ENROLLMENT_STATUS_COLORS: Record<string, string> = {
  active: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  replied: 'bg-purple-100 text-purple-700',
  bounced: 'bg-red-100 text-red-600',
  unsubscribed: 'bg-gray-100 text-gray-600',
  paused: 'bg-yellow-100 text-yellow-700',
  error: 'bg-red-100 text-red-600',
}

interface Enrollment {
  id: string
  sequenceId: string
  contactId: string
  status: EnrollmentStatus
  currentStep: number
  enrolledAt: string
  completedAt: string | null
  sequence?: {
    id: string
    name: string
  }
}

interface AuditLogEntry {
  id: string
  action: string
  objectType: string
  objectId: string
  actorType: string
  actorId: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
}

const scoreColor = (s: number) =>
  s >= 80 ? 'text-green-600' : s >= 50 ? 'text-yellow-600' : 'text-red-500'

function EnrollModal({ contactId, onClose, onDone }: { contactId: string; onClose: () => void; onDone: () => void }) {
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
        { method: 'POST', body: JSON.stringify({ contactIds: [contactId] }) },
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
        <p className="text-sm text-gray-500 mb-5">Select a sequence for this contact</p>

        {result ? (
          <div className="text-center py-4">
            <p className="text-3xl font-bold text-green-600">{result.enrolled}</p>
            <p className="text-gray-600 mt-1">contact enrolled</p>
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

export default function ContactDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [showEnroll, setShowEnroll] = useState(false)
  const [confirmUnsub, setConfirmUnsub] = useState(false)
  const [unsubscribing, setUnsubscribing] = useState(false)
  const [changingStatus, setChangingStatus] = useState(false)

  const { data: contactData, isLoading, error, mutate } = useSWR<{ data: Contact }>(
    `/contacts/${id}`,
    fetcher,
  )

  const { data: enrollmentsData } = useSWR<{ data: Enrollment[] }>(
    `/contacts/${id}/enrollments`,
    fetcher,
  )

  const { data: auditData } = useSWR<{ data: AuditLogEntry[] }>(
    `/analytics/audit-log?objectType=contact&objectId=${id}`,
    fetcher,
  )

  const contact = contactData?.data
  const enrollments = enrollmentsData?.data ?? []
  const auditLog = auditData?.data ?? []

  const handleLifecycleChange = async (newStatus: string) => {
    setChangingStatus(true)
    try {
      await apiFetch(`/contacts/${id}/lifecycle`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      })
      mutate()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update status')
    } finally {
      setChangingStatus(false)
    }
  }

  const handleUnsubscribe = async () => {
    setUnsubscribing(true)
    try {
      await apiFetch(`/contacts/${id}/unsubscribe`, { method: 'POST' })
      mutate()
      setConfirmUnsub(false)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to unsubscribe')
    } finally {
      setUnsubscribing(false)
    }
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
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

  if (error || !contact) {
    return (
      <div className="p-8">
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <p className="text-gray-500">Contact not found or failed to load.</p>
          <Link href="/dashboard/contacts" className="text-brand-600 text-sm mt-2 inline-block hover:underline">
            Back to contacts
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-5xl">
      {/* Header */}
      <div className="mb-6">
        <Link href="/dashboard/contacts" className="text-sm text-gray-400 hover:text-gray-600 mb-2 inline-block">
          &larr; Back to contacts
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {contact.firstName} {contact.lastName}
            </h1>
            <p className="text-sm text-gray-400 mt-0.5">{contact.email}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowEnroll(true)}
              className="px-4 py-2 bg-brand-600 text-white text-sm rounded-lg hover:bg-brand-700 font-medium"
            >
              Enroll in Sequence
            </button>
            {!contact.unsubscribed && (
              <button
                onClick={() => setConfirmUnsub(true)}
                className="px-4 py-2 border border-red-200 text-red-600 text-sm rounded-lg hover:bg-red-50"
              >
                Unsubscribe
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Contact info + Score */}
      <div className="grid grid-cols-3 gap-6 mb-6">
        <div className="col-span-2 bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Contact Information</h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
            <div>
              <dt className="text-gray-500">Title</dt>
              <dd className="font-medium text-gray-900 mt-0.5">{contact.title ?? '---'}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Seniority</dt>
              <dd className="font-medium text-gray-900 mt-0.5 capitalize">{contact.seniority ?? '---'}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Job Function</dt>
              <dd className="font-medium text-gray-900 mt-0.5 capitalize">{contact.jobFunction ?? '---'}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Country</dt>
              <dd className="font-medium text-gray-900 mt-0.5">{contact.country ?? '---'}</dd>
            </div>
            {contact.linkedinUrl && (
              <div>
                <dt className="text-gray-500">LinkedIn</dt>
                <dd className="mt-0.5">
                  <a href={contact.linkedinUrl} target="_blank" rel="noreferrer" className="text-brand-600 text-sm hover:underline">
                    View profile
                  </a>
                </dd>
              </div>
            )}
            <div>
              <dt className="text-gray-500">Created</dt>
              <dd className="font-medium text-gray-900 mt-0.5">{formatDate(contact.createdAt)}</dd>
            </div>
          </dl>
        </div>

        {/* Score + Status */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Score</h2>
            <div className="text-center">
              <span className={clsx('text-4xl font-bold', scoreColor(contact.score))}>
                {Math.round(contact.score)}
              </span>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Lifecycle Status</h2>
            <div className="mb-3">
              <span className={clsx('px-3 py-1 rounded-full text-sm font-medium', LIFECYCLE_COLORS[contact.lifecycleStatus] ?? 'bg-gray-100 text-gray-500')}>
                {contact.lifecycleStatus.replace(/_/g, ' ')}
              </span>
            </div>
            <select
              value={contact.lifecycleStatus}
              onChange={(e) => handleLifecycleChange(e.target.value)}
              disabled={changingStatus}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50"
            >
              {LIFECYCLE_OPTIONS.map((s) => (
                <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
              ))}
            </select>
            {contact.unsubscribed && (
              <p className="mt-2 text-xs text-red-500 font-medium">This contact is unsubscribed</p>
            )}
          </div>
        </div>
      </div>

      {/* Enrollment history */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Enrollment History</h2>
          <p className="text-sm text-gray-400">{enrollments.length} enrollment(s)</p>
        </div>
        {enrollments.length === 0 ? (
          <div className="px-6 py-10 text-center text-gray-400 text-sm">
            Not enrolled in any sequences yet.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Sequence</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Step</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Enrolled</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Completed</th>
              </tr>
            </thead>
            <tbody>
              {enrollments.map((e) => (
                <tr key={e.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {e.sequence?.name ?? e.sequenceId}
                  </td>
                  <td className="px-4 py-3">
                    <span className={clsx('px-2 py-0.5 rounded-full text-xs font-medium', ENROLLMENT_STATUS_COLORS[e.status] ?? 'bg-gray-100 text-gray-500')}>
                      {e.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{e.currentStep}</td>
                  <td className="px-4 py-3 text-gray-500">{formatDate(e.enrolledAt)}</td>
                  <td className="px-4 py-3 text-gray-500">{e.completedAt ? formatDate(e.completedAt) : '---'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Activity timeline */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Activity Timeline</h2>
        </div>
        {auditLog.length === 0 ? (
          <div className="px-6 py-10 text-center text-gray-400 text-sm">
            No activity recorded yet.
          </div>
        ) : (
          <div className="px-6 py-4">
            <div className="space-y-0">
              {auditLog.map((entry, idx) => (
                <div key={entry.id} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-2.5 h-2.5 rounded-full bg-gray-300 mt-1.5 shrink-0" />
                    {idx < auditLog.length - 1 && <div className="w-px flex-1 bg-gray-200" />}
                  </div>
                  <div className="pb-5">
                    <p className="text-sm text-gray-900">
                      <span className="font-medium capitalize">{entry.action.replace(/_/g, ' ')}</span>
                      {entry.actorType && (
                        <span className="text-gray-400 ml-1.5 text-xs">by {entry.actorType}</span>
                      )}
                    </p>
                    {entry.metadata && Object.keys(entry.metadata).length > 0 && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        {Object.entries(entry.metadata)
                          .filter(([, v]) => v !== null && v !== undefined)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(' · ')}
                      </p>
                    )}
                    <p className="text-xs text-gray-300 mt-0.5">{formatDate(entry.createdAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Enroll modal */}
      {showEnroll && (
        <EnrollModal
          contactId={id}
          onClose={() => setShowEnroll(false)}
          onDone={() => { setShowEnroll(false); mutate() }}
        />
      )}

      {/* Unsubscribe confirmation modal */}
      {confirmUnsub && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-2">Unsubscribe contact?</h2>
            <p className="text-sm text-gray-500 mb-5">
              <strong>{contact.firstName} {contact.lastName}</strong> will be unsubscribed and will no longer receive automated emails. This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmUnsub(false)}
                className="flex-1 px-4 py-2 border border-gray-200 text-sm rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleUnsubscribe}
                disabled={unsubscribing}
                className="flex-1 px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 disabled:opacity-50 font-medium"
              >
                {unsubscribing ? 'Unsubscribing...' : 'Unsubscribe'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
