'use client'
import { useState } from 'react'
import useSWR from 'swr'
import { fetcher, apiFetch } from '@/lib/api'
import clsx from 'clsx'

interface EmailTemplate {
  id: string
  workspaceId: string
  name: string
  category: string
  subject: string
  body: string
  variables: string[]
  isShared: boolean
  createdBy: string
  createdAt: string
  updatedAt: string
}

const CATEGORIES = [
  { value: 'all', label: 'All' },
  { value: 'cold_outbound', label: 'Cold Outbound' },
  { value: 'follow_up', label: 'Follow Up' },
  { value: 'breakup', label: 'Breakup' },
  { value: 're_engagement', label: 'Re-engagement' },
  { value: 'post_demo', label: 'Post Demo' },
  { value: 'referral', label: 'Referral' },
  { value: 'custom', label: 'Custom' },
] as const

const CATEGORY_COLORS: Record<string, string> = {
  cold_outbound: 'bg-blue-100 text-blue-700',
  follow_up: 'bg-green-100 text-green-700',
  breakup: 'bg-red-100 text-red-600',
  re_engagement: 'bg-purple-100 text-purple-700',
  post_demo: 'bg-yellow-100 text-yellow-700',
  referral: 'bg-teal-100 text-teal-700',
  custom: 'bg-gray-100 text-gray-600',
}

const TONES = ['Professional', 'Casual', 'Friendly', 'Urgent', 'Consultative'] as const

type ModalMode = 'create' | 'edit' | 'generate' | null

interface FormState {
  name: string
  category: string
  subject: string
  body: string
  variables: string[]
  isShared: boolean
}

const emptyForm: FormState = {
  name: '',
  category: 'custom',
  subject: '',
  body: '',
  variables: [],
  isShared: true,
}

interface GenerateForm {
  category: string
  targetIndustry: string
  targetRole: string
  tone: string
}

const emptyGenerate: GenerateForm = {
  category: 'cold_outbound',
  targetIndustry: '',
  targetRole: '',
  tone: 'Professional',
}

function extractVariables(subject: string, body: string): string[] {
  const matches = new Set<string>()
  const regex = /\{\{(\w+\.\w+)\}\}/g
  let m: RegExpExecArray | null
  for (const text of [subject, body]) {
    while ((m = regex.exec(text)) !== null) {
      matches.add(m[1]!)
    }
  }
  return [...matches]
}

export default function TemplatesPage() {
  const [activeCategory, setActiveCategory] = useState('all')
  const queryParam = activeCategory === 'all' ? '' : `?category=${activeCategory}`
  const { data, isLoading, mutate } = useSWR<{ data: EmailTemplate[] }>(`/templates${queryParam}`, fetcher)

  const [modal, setModal] = useState<ModalMode>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [genForm, setGenForm] = useState<GenerateForm>(emptyGenerate)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const openCreate = () => {
    setForm(emptyForm)
    setEditId(null)
    setModal('create')
  }

  const openEdit = (t: EmailTemplate) => {
    setForm({
      name: t.name,
      category: t.category,
      subject: t.subject,
      body: t.body,
      variables: t.variables,
      isShared: t.isShared,
    })
    setEditId(t.id)
    setModal('edit')
  }

  const openGenerate = () => {
    setGenForm(emptyGenerate)
    setModal('generate')
  }

  const closeModal = () => {
    setModal(null)
    setEditId(null)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const variables = extractVariables(form.subject, form.body)
      const payload = { ...form, variables }

      if (modal === 'edit' && editId) {
        await apiFetch(`/templates/${editId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        })
      } else {
        await apiFetch('/templates', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
      }
      mutate()
      closeModal()
    } finally {
      setSaving(false)
    }
  }

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const result = await apiFetch<{ data: { category: string; subject: string; body: string; variables: string[] } }>(
        '/templates/generate',
        { method: 'POST', body: JSON.stringify(genForm) },
      )
      setForm({
        name: `${genForm.targetRole} - ${genForm.targetIndustry}`,
        category: result.data.category,
        subject: result.data.subject,
        body: result.data.body,
        variables: result.data.variables,
        isShared: true,
      })
      setModal('create')
    } finally {
      setGenerating(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this template?')) return
    await apiFetch(`/templates/${id}`, { method: 'DELETE' })
    mutate()
  }

  const categoryLabel = (cat: string) =>
    CATEGORIES.find((c) => c.value === cat)?.label ?? cat

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Email Templates</h1>
          <p className="text-gray-500 text-sm mt-1">Reusable email templates for your sequences</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={openGenerate}
            className="px-4 py-2 border border-brand-600 text-brand-600 text-sm rounded-lg hover:bg-brand-50"
          >
            AI Generate
          </button>
          <button
            onClick={openCreate}
            className="px-4 py-2 bg-brand-600 text-white text-sm rounded-lg hover:bg-brand-700"
          >
            + Create Template
          </button>
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex gap-1 mb-6 overflow-x-auto pb-1">
        {CATEGORIES.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setActiveCategory(value)}
            className={clsx(
              'px-3 py-1.5 text-sm rounded-lg font-medium whitespace-nowrap transition',
              activeCategory === value
                ? 'bg-brand-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 h-40 animate-pulse" />
          ))}
        </div>
      ) : data?.data.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-400 mb-4">No templates yet</p>
          <button onClick={openCreate} className="text-brand-600 hover:underline text-sm font-medium">
            Create your first template
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data?.data.map((t) => (
            <div
              key={t.id}
              className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col cursor-pointer hover:border-brand-300 transition"
              onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
            >
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-semibold text-gray-900 text-sm truncate flex-1">{t.name}</h3>
                <span className={clsx('px-2 py-0.5 rounded-full text-xs font-medium ml-2 whitespace-nowrap', CATEGORY_COLORS[t.category])}>
                  {categoryLabel(t.category)}
                </span>
              </div>
              <p className="text-sm text-gray-500 truncate">{t.subject}</p>
              <div className="flex items-center gap-3 mt-3 text-xs text-gray-400">
                <span>{t.variables.length} variable{t.variables.length !== 1 ? 's' : ''}</span>
                {t.isShared && <span>Shared</span>}
              </div>

              {expandedId === t.id && (
                <div className="mt-4 pt-4 border-t border-gray-100" onClick={(e) => e.stopPropagation()}>
                  <p className="text-xs font-medium text-gray-500 mb-1">Subject</p>
                  <p className="text-sm text-gray-700 mb-3">{t.subject}</p>
                  <p className="text-xs font-medium text-gray-500 mb-1">Body</p>
                  <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans max-h-48 overflow-y-auto">{t.body}</pre>
                  {t.variables.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs font-medium text-gray-500 mb-1">Variables</p>
                      <div className="flex flex-wrap gap-1">
                        {t.variables.map((v) => (
                          <span key={v} className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs font-mono">{`{{${v}}}`}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={() => openEdit(t)}
                      className="px-3 py-1.5 border border-gray-200 text-sm rounded-lg hover:bg-gray-50"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(t.id)}
                      className="px-3 py-1.5 text-sm rounded-lg text-red-500 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      {(modal === 'create' || modal === 'edit') && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">
                {modal === 'edit' ? 'Edit Template' : 'Create Template'}
              </h2>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. SaaS VP Sales Cold Outreach"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                >
                  {CATEGORIES.filter((c) => c.value !== 'all').map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Subject *
                  <span className="text-gray-400 font-normal ml-1 text-xs">
                    (use {'{{contact.firstName}}'}, {'{{account.companyName}}'})
                  </span>
                </label>
                <input
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none"
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  placeholder="Quick question about {{account.companyName}}"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Body *
                  <span className="text-gray-400 font-normal ml-1 text-xs">
                    Supports template variables
                  </span>
                </label>
                <textarea
                  rows={10}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none font-mono resize-y"
                  value={form.body}
                  onChange={(e) => setForm({ ...form, body: e.target.value })}
                  placeholder={`Hi {{contact.firstName}},\n\nI noticed {{account.companyName}}...\n\nBest,\n[Your name]`}
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isShared"
                  checked={form.isShared}
                  onChange={(e) => setForm({ ...form, isShared: e.target.checked })}
                  className="rounded border-gray-300"
                />
                <label htmlFor="isShared" className="text-sm text-gray-700">Share with workspace</label>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!form.name || !form.subject || !form.body || saving}
                className="px-5 py-2 bg-brand-600 text-white text-sm rounded-lg font-semibold hover:bg-brand-700 disabled:opacity-50 transition"
              >
                {saving ? 'Saving...' : modal === 'edit' ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Generate Modal */}
      {modal === 'generate' && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">AI Generate Template</h2>
              <p className="text-sm text-gray-500 mt-1">Describe your target and we will generate a template</p>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none"
                  value={genForm.category}
                  onChange={(e) => setGenForm({ ...genForm, category: e.target.value })}
                >
                  {CATEGORIES.filter((c) => c.value !== 'all').map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Target Industry *</label>
                <input
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none"
                  value={genForm.targetIndustry}
                  onChange={(e) => setGenForm({ ...genForm, targetIndustry: e.target.value })}
                  placeholder="e.g. B2B SaaS, FinTech, Healthcare"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Target Role *</label>
                <input
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none"
                  value={genForm.targetRole}
                  onChange={(e) => setGenForm({ ...genForm, targetRole: e.target.value })}
                  placeholder="e.g. VP of Sales, CTO, Head of Marketing"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tone</label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none"
                  value={genForm.tone}
                  onChange={(e) => setGenForm({ ...genForm, tone: e.target.value })}
                >
                  {TONES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={handleGenerate}
                disabled={!genForm.targetIndustry || !genForm.targetRole || generating}
                className="px-5 py-2 bg-brand-600 text-white text-sm rounded-lg font-semibold hover:bg-brand-700 disabled:opacity-50 transition"
              >
                {generating ? 'Generating...' : 'Generate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
