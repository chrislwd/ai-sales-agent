'use client'
import useSWR from 'swr'
import { fetcher } from '@/lib/api'
import type { DashboardMetrics } from '@ai-sales/types'

interface MetricCardProps {
  label: string
  value: string | number
  sub?: string
}

function MetricCard({ label, value, sub }: MetricCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-3xl font-bold mt-1 text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

export default function DashboardPage() {
  const { data, isLoading } = useSWR<{ data: DashboardMetrics }>('/analytics/dashboard', fetcher)
  const m = data?.data

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">Last 30 days performance</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 h-24 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard label="Accounts covered" value={m?.accountsCovered ?? 0} />
          <MetricCard label="Contacts touched" value={m?.contactsTouched ?? 0} />
          <MetricCard label="Emails sent" value={m?.emailsSent ?? 0} sub="last 30 days" />
          <MetricCard label="Open rate" value={`${((m?.openRate ?? 0) * 100).toFixed(1)}%`} />
          <MetricCard label="Reply rate" value={`${((m?.replyRate ?? 0) * 100).toFixed(1)}%`} />
          <MetricCard label="Positive reply rate" value={`${((m?.positiveReplyRate ?? 0) * 100).toFixed(1)}%`} />
          <MetricCard label="Meetings booked" value={m?.meetingsBooked ?? 0} />
          <MetricCard label="CRM sync success" value={`${m?.crmSyncSuccess ?? 100}%`} />
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-800 mb-4">Quick actions</h2>
          <div className="space-y-2">
            <a href="/dashboard/accounts" className="block text-sm text-brand-600 hover:underline">+ Import accounts from CSV</a>
            <a href="/dashboard/sequences" className="block text-sm text-brand-600 hover:underline">+ Create new sequence</a>
            <a href="/dashboard/inbox" className="block text-sm text-brand-600 hover:underline">Review pending messages</a>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-800 mb-4">Getting started</h2>
          <ol className="space-y-2 text-sm text-gray-600 list-decimal list-inside">
            <li>Configure your ICP in Settings</li>
            <li>Import target accounts (CSV or CRM sync)</li>
            <li>Create a sequence with email steps</li>
            <li>Enroll contacts and activate the sequence</li>
            <li>Monitor replies in Inbox</li>
          </ol>
        </div>
      </div>
    </div>
  )
}
