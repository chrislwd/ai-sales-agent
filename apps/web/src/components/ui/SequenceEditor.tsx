'use client'
import { useState } from 'react'
import clsx from 'clsx'

export interface StepDraft {
  id: string   // local only
  position: number
  stepType: 'email' | 'wait'
  delayDays: number
  condition: { trigger: string; intentFilter?: string } | null
  templateSubject: string
  templateBody: string
  approvalMode: 'auto' | 'first_only' | 'all'
}

interface SequenceDraft {
  name: string
  description: string
  dailySendLimit: number
  sendWindowStart: string
  sendWindowEnd: string
  defaultApprovalMode: 'auto' | 'first_only' | 'all'
  steps: StepDraft[]
}

interface Props {
  initial?: Partial<SequenceDraft>
  onSave: (draft: SequenceDraft) => Promise<void>
  saving?: boolean
}

function newStep(position: number): StepDraft {
  return {
    id: crypto.randomUUID(),
    position,
    stepType: 'email',
    delayDays: position === 0 ? 0 : 3,
    condition: null,
    templateSubject: '',
    templateBody: '',
    approvalMode: 'auto',
  }
}

const TRIGGER_LABELS: Record<string, string> = {
  always: 'Always (no condition)',
  not_replied: 'If no reply to previous step',
  opened: 'If previous email was opened',
  clicked: 'If previous email link was clicked',
  replied_with: 'If replied with specific intent',
}

const APPROVAL_LABELS: Record<string, string> = {
  auto: 'Auto-send',
  first_only: 'Approve first email only',
  all: 'Approve every email',
}

export function SequenceEditor({ initial, onSave, saving }: Props) {
  const [draft, setDraft] = useState<SequenceDraft>({
    name: initial?.name ?? '',
    description: initial?.description ?? '',
    dailySendLimit: initial?.dailySendLimit ?? 50,
    sendWindowStart: initial?.sendWindowStart ?? '08:00',
    sendWindowEnd: initial?.sendWindowEnd ?? '18:00',
    defaultApprovalMode: initial?.defaultApprovalMode ?? 'auto',
    steps: initial?.steps ?? [newStep(0)],
  })
  const [activeStep, setActiveStep] = useState(0)

  const setField = <K extends keyof SequenceDraft>(k: K, v: SequenceDraft[K]) =>
    setDraft((d) => ({ ...d, [k]: v }))

  const setStep = (idx: number, patch: Partial<StepDraft>) =>
    setDraft((d) => {
      const steps = [...d.steps]
      steps[idx] = { ...steps[idx]!, ...patch }
      return { ...d, steps }
    })

  const addStep = () => {
    const position = draft.steps.length
    setDraft((d) => ({ ...d, steps: [...d.steps, newStep(position)] }))
    setActiveStep(position)
  }

  const removeStep = (idx: number) => {
    if (draft.steps.length === 1) return
    setDraft((d) => {
      const steps = d.steps.filter((_, i) => i !== idx).map((s, i) => ({ ...s, position: i }))
      return { ...d, steps }
    })
    setActiveStep(Math.max(0, idx - 1))
  }

  const step = draft.steps[activeStep]

  return (
    <div className="space-y-6">
      {/* Sequence settings */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-800 mb-4">Sequence settings</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none"
              value={draft.name}
              onChange={(e) => setField('name', e.target.value)}
              placeholder="e.g. Cold Outbound — SaaS VP Sales"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <input
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none"
              value={draft.description}
              onChange={(e) => setField('description', e.target.value)}
              placeholder="Optional description"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Daily send limit</label>
            <input
              type="number"
              min={1}
              max={500}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none"
              value={draft.dailySendLimit}
              onChange={(e) => setField('dailySendLimit', parseInt(e.target.value) || 50)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Default approval</label>
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none"
              value={draft.defaultApprovalMode}
              onChange={(e) => setField('defaultApprovalMode', e.target.value as any)}
            >
              {Object.entries(APPROVAL_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Send window start</label>
            <input
              type="time"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none"
              value={draft.sendWindowStart}
              onChange={(e) => setField('sendWindowStart', e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Send window end</label>
            <input
              type="time"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none"
              value={draft.sendWindowEnd}
              onChange={(e) => setField('sendWindowEnd', e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Step builder */}
      <div className="flex gap-6">
        {/* Step list */}
        <div className="w-56 flex-none">
          <div className="space-y-2">
            {draft.steps.map((s, i) => (
              <button
                key={s.id}
                onClick={() => setActiveStep(i)}
                className={clsx(
                  'w-full text-left px-3 py-2.5 rounded-lg border text-sm transition',
                  i === activeStep
                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                    : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50',
                )}
              >
                <div className="font-medium">Step {i + 1}</div>
                <div className="text-xs text-gray-400 mt-0.5 truncate">
                  {s.stepType === 'email'
                    ? s.templateSubject || 'Email (no subject)'
                    : `Wait ${s.delayDays}d`}
                </div>
              </button>
            ))}
            <button
              onClick={addStep}
              className="w-full text-left px-3 py-2 rounded-lg border border-dashed border-gray-300 text-sm text-gray-400 hover:border-brand-400 hover:text-brand-600 transition"
            >
              + Add step
            </button>
          </div>
        </div>

        {/* Step editor */}
        {step && (
          <div className="flex-1 bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-800">Step {activeStep + 1}</h3>
              {draft.steps.length > 1 && (
                <button
                  onClick={() => removeStep(activeStep)}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  Remove step
                </button>
              )}
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                  <select
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none"
                    value={step.stepType}
                    onChange={(e) => setStep(activeStep, { stepType: e.target.value as any })}
                  >
                    <option value="email">Email</option>
                    <option value="wait">Wait / delay</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Delay (days after previous)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={90}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none"
                    value={step.delayDays}
                    onChange={(e) => setStep(activeStep, { delayDays: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Approval</label>
                  <select
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none"
                    value={step.approvalMode}
                    onChange={(e) => setStep(activeStep, { approvalMode: e.target.value as any })}
                  >
                    {Object.entries(APPROVAL_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Condition to execute this step</label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none"
                  value={step.condition?.trigger ?? 'always'}
                  onChange={(e) => {
                    const v = e.target.value
                    setStep(activeStep, { condition: v === 'always' ? null : { trigger: v } })
                  }}
                >
                  {Object.entries(TRIGGER_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>

              {step.stepType === 'email' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Subject template
                      <span className="text-gray-400 font-normal ml-1 text-xs">
                        (use {'{{contact.firstName}}'}, {'{{account.companyName}}'})
                      </span>
                    </label>
                    <input
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none"
                      value={step.templateSubject}
                      onChange={(e) => setStep(activeStep, { templateSubject: e.target.value })}
                      placeholder="Quick question about {{account.companyName}}"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Body template
                      <span className="text-gray-400 font-normal ml-1 text-xs">
                        AI will personalize this further
                      </span>
                    </label>
                    <textarea
                      rows={8}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none font-mono resize-y"
                      value={step.templateBody}
                      onChange={(e) => setStep(activeStep, { templateBody: e.target.value })}
                      placeholder={`Hi {{contact.firstName}},\n\nI came across {{account.companyName}}...\n\n[Your name]`}
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Save button */}
      <div className="flex justify-end">
        <button
          onClick={() => onSave(draft)}
          disabled={!draft.name || saving}
          className="px-6 py-2.5 bg-brand-600 text-white rounded-lg font-semibold hover:bg-brand-700 disabled:opacity-50 transition"
        >
          {saving ? 'Saving...' : 'Save sequence'}
        </button>
      </div>
    </div>
  )
}
