'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiFetch } from '@/lib/api'
import { SequenceEditor } from '@/components/ui/SequenceEditor'
import type { StepDraft } from '@/components/ui/SequenceEditor'

export default function NewSequencePage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async (draft: {
    name: string
    description: string
    dailySendLimit: number
    sendWindowStart: string
    sendWindowEnd: string
    defaultApprovalMode: string
    steps: StepDraft[]
  }) => {
    setSaving(true)
    setError('')
    try {
      const payload = {
        ...draft,
        steps: draft.steps.map(({ id: _id, ...s }) => s),
      }
      const { data } = await apiFetch<{ data: { id: string } }>('/sequences', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      router.push(`/dashboard/sequences/${data.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-6 flex items-center gap-3">
        <a href="/dashboard/sequences" className="text-gray-400 hover:text-gray-600 text-sm">
          ← Sequences
        </a>
        <span className="text-gray-300">/</span>
        <h1 className="text-xl font-bold text-gray-900">New sequence</h1>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}

      <SequenceEditor onSave={handleSave} saving={saving} />
    </div>
  )
}
