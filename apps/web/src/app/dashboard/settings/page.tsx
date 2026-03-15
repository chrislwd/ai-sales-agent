'use client'
import { useState } from 'react'
import useSWR from 'swr'
import { apiFetch, fetcher } from '@/lib/api'
import { useAuth } from '@/context/auth'

interface CrmConnection {
  id: string
  provider: string
  isActive: boolean
  portalId: string | null
  lastSyncAt: string | null
  createdAt: string
}

interface WorkspaceMember {
  id: string
  userId: string
  role: string
  user?: { email: string; name: string }
}

export default function SettingsPage() {
  const { workspace } = useAuth()
  const [activeTab, setActiveTab] = useState<'general' | 'crm' | 'team' | 'icp'>('general')

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-2xl font-bold">Settings</h1>
      <p className="text-gray-500 mt-1 text-sm">Manage your workspace configuration</p>

      <div className="flex gap-1 mt-6 border-b">
        {(['general', 'crm', 'team', 'icp'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition ${
              activeTab === tab
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab === 'crm' ? 'CRM Integration' : tab === 'icp' ? 'ICP Config' : tab}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {activeTab === 'general' && <GeneralTab />}
        {activeTab === 'crm' && <CrmTab />}
        {activeTab === 'team' && <TeamTab />}
        {activeTab === 'icp' && <IcpTab />}
      </div>
    </div>
  )
}

function GeneralTab() {
  const { workspace } = useAuth()

  return (
    <div className="space-y-6">
      <div className="bg-white border rounded-lg p-6">
        <h3 className="font-semibold text-lg">Workspace</h3>
        <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div>
            <label className="text-gray-500">Name</label>
            <p className="font-medium">{workspace?.name ?? '-'}</p>
          </div>
          <div>
            <label className="text-gray-500">Plan</label>
            <p className="font-medium capitalize">{(workspace as any)?.plan ?? 'free'}</p>
          </div>
        </div>
      </div>

      <div className="bg-white border rounded-lg p-6">
        <h3 className="font-semibold text-lg">Email Configuration</h3>
        <p className="text-sm text-gray-500 mt-1">
          Configure your outbound email settings via environment variables.
        </p>
        <div className="mt-4 text-sm space-y-2 text-gray-600">
          <p><code className="bg-gray-100 px-1 rounded">EMAIL_ENABLED</code> - Enable email sending</p>
          <p><code className="bg-gray-100 px-1 rounded">RESEND_API_KEY</code> - Resend API key</p>
          <p><code className="bg-gray-100 px-1 rounded">EMAIL_FROM</code> - Sender address</p>
        </div>
      </div>
    </div>
  )
}

function CrmTab() {
  const { data, mutate } = useSWR<{ data: CrmConnection[] }>('/crm/connections', fetcher)
  const [connecting, setConnecting] = useState(false)
  const [manualToken, setManualToken] = useState('')

  const connections = data?.data ?? []
  const activeConnection = connections.find((c) => c.isActive)

  const handleConnect = () => {
    window.location.href = `${process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001/api/v1'}/crm/hubspot/connect`
  }

  const handleManualConnect = async () => {
    if (!manualToken.trim()) return
    setConnecting(true)
    try {
      await apiFetch('/crm/hubspot/connect-manual', {
        method: 'POST',
        body: JSON.stringify({ accessToken: manualToken }),
      })
      setManualToken('')
      mutate()
    } catch {
      alert('Failed to connect')
    } finally {
      setConnecting(false)
    }
  }

  const handleDisconnect = async (id: string) => {
    if (!confirm('Disconnect this CRM integration?')) return
    await apiFetch(`/crm/connections/${id}`, { method: 'DELETE' })
    mutate()
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border rounded-lg p-6">
        <h3 className="font-semibold text-lg">HubSpot CRM</h3>
        <p className="text-sm text-gray-500 mt-1">
          Sync contacts, companies, and activities with HubSpot.
        </p>

        {activeConnection ? (
          <div className="mt-4 flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-lg">
            <div>
              <p className="text-sm font-medium text-green-800">Connected</p>
              <p className="text-xs text-green-600 mt-0.5">
                Portal: {activeConnection.portalId ?? 'N/A'}
                {activeConnection.lastSyncAt && ` | Last sync: ${new Date(activeConnection.lastSyncAt).toLocaleString()}`}
              </p>
            </div>
            <button
              onClick={() => handleDisconnect(activeConnection.id)}
              className="px-3 py-1.5 text-sm text-red-600 border border-red-300 rounded-lg hover:bg-red-50"
            >
              Disconnect
            </button>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <button
              onClick={handleConnect}
              className="px-4 py-2 bg-[#ff7a59] text-white rounded-lg text-sm font-medium hover:bg-[#ff5c35] transition"
            >
              Connect with HubSpot OAuth
            </button>

            <div className="border-t pt-4">
              <p className="text-sm text-gray-500 mb-2">Or connect manually with an access token (for dev/testing):</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={manualToken}
                  onChange={(e) => setManualToken(e.target.value)}
                  placeholder="HubSpot access token"
                  className="flex-1 border rounded-lg px-3 py-2 text-sm"
                />
                <button
                  onClick={handleManualConnect}
                  disabled={connecting}
                  className="px-4 py-2 bg-gray-800 text-white rounded-lg text-sm disabled:opacity-50"
                >
                  {connecting ? '...' : 'Connect'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function TeamTab() {
  const { data } = useSWR<{ data: { members: WorkspaceMember[] } }>('/workspace/members', fetcher)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('sdr')
  const [inviting, setInviting] = useState(false)

  const members = data?.data?.members ?? []

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return
    setInviting(true)
    try {
      await apiFetch('/workspace/invite', {
        method: 'POST',
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      })
      setInviteEmail('')
      alert('Invitation sent!')
    } catch (err: any) {
      alert(err.message ?? 'Failed to invite')
    } finally {
      setInviting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border rounded-lg p-6">
        <h3 className="font-semibold text-lg">Team Members</h3>

        <div className="mt-4 border rounded-lg divide-y">
          {members.length === 0 && (
            <p className="p-4 text-sm text-gray-400">No members found</p>
          )}
          {members.map((m) => (
            <div key={m.id} className="flex items-center justify-between p-3 text-sm">
              <div>
                <p className="font-medium">{m.user?.name ?? m.user?.email ?? m.userId}</p>
                <p className="text-gray-500 text-xs">{m.user?.email}</p>
              </div>
              <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 capitalize">
                {m.role}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white border rounded-lg p-6">
        <h3 className="font-semibold text-lg">Invite Member</h3>
        <div className="mt-4 flex gap-2">
          <input
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="email@company.com"
            className="flex-1 border rounded-lg px-3 py-2 text-sm"
          />
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm"
          >
            <option value="viewer">Viewer</option>
            <option value="sdr">SDR</option>
            <option value="ae">AE</option>
            <option value="manager">Manager</option>
            <option value="admin">Admin</option>
          </select>
          <button
            onClick={handleInvite}
            disabled={inviting}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {inviting ? '...' : 'Invite'}
          </button>
        </div>
      </div>
    </div>
  )
}

function IcpTab() {
  const { data, mutate } = useSWR<{ data: any }>('/icp', fetcher)
  const [saving, setSaving] = useState(false)

  const icp = data?.data

  const [form, setForm] = useState({
    industries: '',
    countries: '',
    employeeSizeMin: '',
    employeeSizeMax: '',
    techStack: '',
    seniorityLevels: '',
    jobFunctions: '',
  })

  const loaded = icp !== undefined
  if (loaded && !form.industries && icp) {
    setForm({
      industries: (icp.industries ?? []).join(', '),
      countries: (icp.countries ?? []).join(', '),
      employeeSizeMin: icp.employeeSizeMin?.toString() ?? '',
      employeeSizeMax: icp.employeeSizeMax?.toString() ?? '',
      techStack: (icp.techStack ?? []).join(', '),
      seniorityLevels: (icp.seniorityLevels ?? []).join(', '),
      jobFunctions: (icp.jobFunctions ?? []).join(', '),
    })
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload = {
        industries: form.industries.split(',').map((s) => s.trim()).filter(Boolean),
        countries: form.countries.split(',').map((s) => s.trim()).filter(Boolean),
        employeeSizeMin: form.employeeSizeMin ? parseInt(form.employeeSizeMin) : null,
        employeeSizeMax: form.employeeSizeMax ? parseInt(form.employeeSizeMax) : null,
        techStack: form.techStack.split(',').map((s) => s.trim()).filter(Boolean),
        seniorityLevels: form.seniorityLevels.split(',').map((s) => s.trim()).filter(Boolean),
        jobFunctions: form.jobFunctions.split(',').map((s) => s.trim()).filter(Boolean),
      }
      await apiFetch('/icp', {
        method: icp ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      })
      mutate()
      alert('ICP configuration saved!')
    } catch (err: any) {
      alert(err.message ?? 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border rounded-lg p-6">
        <h3 className="font-semibold text-lg">Ideal Customer Profile</h3>
        <p className="text-sm text-gray-500 mt-1">
          Define your ICP to automatically score accounts and contacts.
        </p>

        <div className="mt-4 space-y-4">
          <Field label="Industries (comma-separated)" value={form.industries} onChange={(v) => setForm({ ...form, industries: v })} placeholder="SaaS, Software, FinTech" />
          <Field label="Countries (comma-separated)" value={form.countries} onChange={(v) => setForm({ ...form, countries: v })} placeholder="US, GB, DE" />
          <div className="grid grid-cols-2 gap-4">
            <Field label="Min Employee Size" value={form.employeeSizeMin} onChange={(v) => setForm({ ...form, employeeSizeMin: v })} placeholder="50" />
            <Field label="Max Employee Size" value={form.employeeSizeMax} onChange={(v) => setForm({ ...form, employeeSizeMax: v })} placeholder="500" />
          </div>
          <Field label="Tech Stack (comma-separated)" value={form.techStack} onChange={(v) => setForm({ ...form, techStack: v })} placeholder="Salesforce, HubSpot, Slack" />
          <Field label="Seniority Levels (comma-separated)" value={form.seniorityLevels} onChange={(v) => setForm({ ...form, seniorityLevels: v })} placeholder="vp, c_level, director" />
          <Field label="Job Functions (comma-separated)" value={form.jobFunctions} onChange={(v) => setForm({ ...form, jobFunctions: v })} placeholder="sales, marketing, product" />

          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save ICP Configuration'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder }: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border rounded-lg px-3 py-2 text-sm"
      />
    </div>
  )
}
