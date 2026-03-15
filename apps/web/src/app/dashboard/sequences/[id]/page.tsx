'use client'
import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import useSWR from 'swr'
import { fetcher, apiFetch } from '@/lib/api'
import { SequenceEditor } from '@/components/ui/SequenceEditor'
import type { Sequence } from '@ai-sales/types'

type TabId = 'edit' | 'enrollments' | 'analytics'

interface AnalyticsData {
  totalEnrolled: number
  active: number
  completed: number
  paused: number
  bounced: number
  unsubscribed: number
  emailsSent: number
  opened: number
  clicked: number
  replied: number
  openRate: number
  clickRate: number
  replyRate: number
  meetingsBooked: number
  perStep: {
    stepPosition: number
    variantLabel: string | null
    sent: number
    opened: number
    replied: number
    openRate: number
    replyRate: number
  }[]
}

interface ABVariant {
  variantLabel: string
  stepPosition: number
  sent: number
  opened: number
  replied: number
  openRate: number
  replyRate: number
}

interface ABGroup {
  variantGroup: string
  variants: ABVariant[]
}

interface ABResults {
  groups: ABGroup[]
}

function FunnelBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-500 w-20 text-right">{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all duration-500`}
          style={{ width: `${Math.max(pct, 1)}%` }}
        />
      </div>
      <span className="text-sm font-medium text-gray-700 w-16">{value.toLocaleString()}</span>
    </div>
  )
}

function MetricCard({ label, value, suffix }: { label: string; value: number; suffix?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
      <p className="text-2xl font-bold text-gray-900">
        {typeof value === 'number' && suffix === '%' ? `${value}%` : value.toLocaleString()}
      </p>
      <p className="text-xs text-gray-500 mt-1">{label}</p>
    </div>
  )
}

function AnalyticsTab({ id }: { id: string }) {
  const { data: analyticsRes } = useSWR<{ data: AnalyticsData }>(
    `/sequences/${id}/analytics`,
    fetcher,
  )
  const { data: abRes } = useSWR<{ data: ABResults }>(
    `/sequences/${id}/ab-results`,
    fetcher,
  )

  const analytics = analyticsRes?.data
  const abResults = abRes?.data

  if (!analytics) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-32 bg-gray-100 rounded-xl" />
        <div className="h-48 bg-gray-100 rounded-xl" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Top-level metric cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard label="Enrolled" value={analytics.totalEnrolled} />
        <MetricCard label="Emails Sent" value={analytics.emailsSent} />
        <MetricCard label="Open Rate" value={analytics.openRate} suffix="%" />
        <MetricCard label="Reply Rate" value={analytics.replyRate} suffix="%" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard label="Active" value={analytics.active} />
        <MetricCard label="Completed" value={analytics.completed} />
        <MetricCard label="Click Rate" value={analytics.clickRate} suffix="%" />
        <MetricCard label="Meetings Booked" value={analytics.meetingsBooked} />
      </div>

      {/* Enrollment status breakdown */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-1">Enrollment Status</h3>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mt-3 text-center text-xs">
          {[
            { label: 'Active', value: analytics.active, cls: 'text-green-700 bg-green-50' },
            { label: 'Completed', value: analytics.completed, cls: 'text-blue-700 bg-blue-50' },
            { label: 'Paused', value: analytics.paused, cls: 'text-yellow-700 bg-yellow-50' },
            { label: 'Bounced', value: analytics.bounced, cls: 'text-red-700 bg-red-50' },
            { label: 'Unsub', value: analytics.unsubscribed, cls: 'text-gray-700 bg-gray-50' },
          ].map((s) => (
            <div key={s.label} className={`rounded-lg p-2 ${s.cls}`}>
              <p className="text-lg font-bold">{s.value}</p>
              <p>{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Funnel visualization */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Funnel</h3>
        <div className="space-y-2">
          <FunnelBar label="Enrolled" value={analytics.totalEnrolled} max={analytics.totalEnrolled} color="bg-brand-500" />
          <FunnelBar label="Sent" value={analytics.emailsSent} max={analytics.totalEnrolled} color="bg-blue-500" />
          <FunnelBar label="Opened" value={analytics.opened} max={analytics.totalEnrolled} color="bg-indigo-500" />
          <FunnelBar label="Replied" value={analytics.replied} max={analytics.totalEnrolled} color="bg-purple-500" />
          <FunnelBar label="Meeting" value={analytics.meetingsBooked} max={analytics.totalEnrolled} color="bg-green-500" />
        </div>
      </div>

      {/* Per-step table */}
      {analytics.perStep.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <h3 className="text-sm font-semibold text-gray-700 px-5 pt-4 pb-2">Per-Step Breakdown</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Step</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Variant</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Sent</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Opened</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Replied</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Open %</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Reply %</th>
              </tr>
            </thead>
            <tbody>
              {analytics.perStep.map((s, i) => (
                <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{s.stepPosition + 1}</td>
                  <td className="px-4 py-3 text-gray-500">{s.variantLabel ?? '--'}</td>
                  <td className="px-4 py-3 text-right">{s.sent}</td>
                  <td className="px-4 py-3 text-right">{s.opened}</td>
                  <td className="px-4 py-3 text-right">{s.replied}</td>
                  <td className="px-4 py-3 text-right">{s.openRate}%</td>
                  <td className="px-4 py-3 text-right">{s.replyRate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* A/B Test Results */}
      {abResults && abResults.groups.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">A/B Test Results</h3>
          <div className="space-y-6">
            {abResults.groups.map((group) => (
              <div key={group.variantGroup}>
                <p className="text-xs font-medium text-gray-500 mb-3 uppercase tracking-wide">
                  Group: {group.variantGroup}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {group.variants.map((v) => (
                    <div
                      key={v.variantLabel}
                      className="border border-gray-200 rounded-lg p-4"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-bold text-gray-900">
                          Variant {v.variantLabel}
                        </span>
                        <span className="text-xs text-gray-400">Step {v.stepPosition + 1}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        <div>
                          <p className="text-lg font-bold text-gray-800">{v.sent}</p>
                          <p className="text-gray-500">Sent</p>
                        </div>
                        <div>
                          <p className="text-lg font-bold text-gray-800">{v.openRate}%</p>
                          <p className="text-gray-500">Open Rate</p>
                        </div>
                        <div>
                          <p className="text-lg font-bold text-gray-800">{v.replyRate}%</p>
                          <p className="text-gray-500">Reply Rate</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function SequenceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<TabId>('edit')

  const { data, mutate } = useSWR<{ data: Sequence & { steps: any[] } }>(
    `/sequences/${id}`,
    fetcher,
  )
  const seq = data?.data

  const { data: enrollmentsData } = useSWR<{ data: any[] }>(
    activeTab === 'enrollments' ? `/sequences/${id}/enrollments` : null,
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

  const tabs: { id: TabId; label: string }[] = [
    { id: 'edit', label: 'Edit sequence' },
    { id: 'enrollments', label: 'Enrollments' },
    { id: 'analytics', label: 'Analytics' },
  ]

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <a href="/dashboard/sequences" className="text-gray-400 hover:text-gray-600 text-sm">
            &larr; Sequences
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

      {/* Tab navigation */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
              activeTab === tab.id
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}

      {activeTab === 'edit' && (
        <SequenceEditor
          initial={{
            ...seq,
            description: seq.description ?? undefined,
            steps: seq.steps?.map((s: any) => ({ ...s, id: s.id ?? crypto.randomUUID() })) ?? [],
          }}
          onSave={handleSave}
          saving={saving}
        />
      )}

      {activeTab === 'enrollments' && (
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
                      {e.nextSendAt ? new Date(e.nextSendAt).toLocaleString() : '--'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'analytics' && <AnalyticsTab id={id} />}
    </div>
  )
}
