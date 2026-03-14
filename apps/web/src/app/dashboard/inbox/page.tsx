'use client'
import { useState } from 'react'
import useSWR from 'swr'
import { fetcher, apiFetch } from '@/lib/api'
import type { Message, Reply } from '@ai-sales/types'
import clsx from 'clsx'

const INTENT_COLORS: Record<string, string> = {
  interested: 'bg-green-100 text-green-700',
  request_demo: 'bg-blue-100 text-blue-700',
  not_now: 'bg-yellow-100 text-yellow-700',
  unsubscribe: 'bg-red-100 text-red-600',
  unknown: 'bg-gray-100 text-gray-600',
  out_of_office: 'bg-gray-100 text-gray-600',
  using_competitor: 'bg-orange-100 text-orange-700',
  pricing_concern: 'bg-purple-100 text-purple-700',
  security_concern: 'bg-red-100 text-red-700',
}

export default function InboxPage() {
  const [tab, setTab] = useState<'pending' | 'replies'>('pending')
  const [approving, setApproving] = useState<string | null>(null)

  const { data: pendingData, mutate: mutatePending } = useSWR<{ data: (Message & { contact: any })[] }>(
    '/messages?status=pending',
    fetcher,
  )
  const { data: repliesData } = useSWR<{ data: (Reply & { contact: any; message: any })[] }>(
    '/messages/replies/list',
    fetcher,
  )

  const approve = async (id: string) => {
    setApproving(id)
    try {
      await apiFetch(`/messages/${id}/approve`, { method: 'POST', body: '{}' })
      mutatePending()
    } finally {
      setApproving(null)
    }
  }

  const reject = async (id: string) => {
    await apiFetch(`/messages/${id}/reject`, { method: 'POST', body: '{}' })
    mutatePending()
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Inbox</h1>
        <p className="text-gray-500 text-sm mt-1">Review AI-generated messages and incoming replies</p>
      </div>

      <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
        {(['pending', 'replies'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx(
              'px-4 py-2 text-sm rounded-md font-medium transition capitalize',
              tab === t ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700',
            )}
          >
            {t === 'pending' ? 'Pending approval' : 'Inbound replies'}
            {tab === t && t === 'pending' && pendingData?.data.length
              ? ` (${pendingData.data.length})`
              : ''}
          </button>
        ))}
      </div>

      {tab === 'pending' && (
        <div className="space-y-4">
          {!pendingData?.data.length ? (
            <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400">
              No messages pending approval
            </div>
          ) : (
            pendingData.data.map((msg) => (
              <div key={msg.id} className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <p className="font-medium text-gray-900">{msg.contact?.firstName} {msg.contact?.lastName}</p>
                    <p className="text-xs text-gray-400">{msg.contact?.email}</p>
                  </div>
                  <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">
                    AI generated
                  </span>
                </div>
                <p className="text-sm font-medium text-gray-800 mb-1">Subject: {msg.subject}</p>
                <p className="text-sm text-gray-600 whitespace-pre-wrap bg-gray-50 rounded-lg p-3 mb-4">
                  {msg.body}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => approve(msg.id)}
                    disabled={approving === msg.id}
                    className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50"
                  >
                    {approving === msg.id ? 'Sending...' : 'Approve & send'}
                  </button>
                  <button
                    onClick={() => reject(msg.id)}
                    className="px-4 py-2 border border-gray-200 text-sm rounded-lg hover:bg-gray-50 text-gray-600"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'replies' && (
        <div className="space-y-4">
          {!repliesData?.data.length ? (
            <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400">
              No replies yet
            </div>
          ) : (
            repliesData.data.map((reply) => (
              <div key={reply.id} className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <p className="font-medium text-gray-900">{reply.contact?.firstName} {reply.contact?.lastName}</p>
                    <p className="text-xs text-gray-400">{reply.contact?.email} · {new Date(reply.receivedAt).toLocaleDateString()}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={clsx('px-2 py-0.5 rounded-full text-xs font-medium', INTENT_COLORS[reply.intent] ?? 'bg-gray-100 text-gray-600')}>
                      {reply.intent.replace(/_/g, ' ')}
                    </span>
                    {reply.requiresHumanReview && (
                      <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs rounded-full font-medium">
                        Needs review
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3 mb-3 whitespace-pre-wrap">
                  {reply.body}
                </p>
                <p className="text-xs text-gray-400">
                  Confidence: {Math.round(reply.confidenceScore * 100)}% ·
                  Action: {reply.actionTaken ?? 'pending'}
                </p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
