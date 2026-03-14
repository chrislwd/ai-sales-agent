import { describe, it, expect, vi } from 'vitest'
import { requireMinRole, canConfigurePlaybook, canViewAllProspects, canApproveMessages, canAccessCrmConfig } from '../rbac.js'
import type { WorkspaceRole } from '@ai-sales/types'

// Build a mock Fastify request/reply to test requireMinRole
function mockReq(role: WorkspaceRole) {
  return { user: { sub: 'user-1', workspaceId: 'ws-1', role } } as any
}

function mockReply() {
  const reply: any = {}
  reply.code = vi.fn().mockReturnValue(reply)
  reply.send = vi.fn().mockReturnValue(reply)
  return reply
}

describe('RBAC — requireMinRole middleware', () => {
  const ROLE_ORDER: WorkspaceRole[] = ['viewer', 'sdr', 'ae', 'manager', 'admin', 'owner']

  it('allows owner to do everything', async () => {
    for (const minRole of ROLE_ORDER) {
      const req = mockReq('owner')
      const reply = mockReply()
      await requireMinRole(minRole)(req, reply)
      expect(reply.code).not.toHaveBeenCalled()
    }
  })

  it('blocks viewer from manager-level actions', async () => {
    const req = mockReq('viewer')
    const reply = mockReply()
    await requireMinRole('manager')(req, reply)
    expect(reply.code).toHaveBeenCalledWith(403)
  })

  it('allows sdr to do sdr-level actions', async () => {
    const req = mockReq('sdr')
    const reply = mockReply()
    await requireMinRole('sdr')(req, reply)
    expect(reply.code).not.toHaveBeenCalled()
  })

  it('blocks sdr from admin-level actions', async () => {
    const req = mockReq('sdr')
    const reply = mockReply()
    await requireMinRole('admin')(req, reply)
    expect(reply.code).toHaveBeenCalledWith(403)
  })

  it('allows manager to do manager-level actions', async () => {
    const req = mockReq('manager')
    const reply = mockReply()
    await requireMinRole('manager')(req, reply)
    expect(reply.code).not.toHaveBeenCalled()
  })

  it('blocks manager from admin-level actions', async () => {
    const req = mockReq('manager')
    const reply = mockReply()
    await requireMinRole('admin')(req, reply)
    expect(reply.code).toHaveBeenCalledWith(403)
  })
})

describe('RBAC — capability helpers', () => {
  it('canConfigurePlaybook: manager and above', () => {
    expect(canConfigurePlaybook('owner')).toBe(true)
    expect(canConfigurePlaybook('admin')).toBe(true)
    expect(canConfigurePlaybook('manager')).toBe(true)
    expect(canConfigurePlaybook('sdr')).toBe(false)
    expect(canConfigurePlaybook('ae')).toBe(false)
    expect(canConfigurePlaybook('viewer')).toBe(false)
  })

  it('canApproveMessages: sdr and above', () => {
    expect(canApproveMessages('owner')).toBe(true)
    expect(canApproveMessages('admin')).toBe(true)
    expect(canApproveMessages('manager')).toBe(true)
    expect(canApproveMessages('sdr')).toBe(true)
    expect(canApproveMessages('ae')).toBe(true)
    expect(canApproveMessages('viewer')).toBe(false)
  })

  it('canAccessCrmConfig: admin and above', () => {
    expect(canAccessCrmConfig('owner')).toBe(true)
    expect(canAccessCrmConfig('admin')).toBe(true)
    expect(canAccessCrmConfig('manager')).toBe(false)
    expect(canAccessCrmConfig('sdr')).toBe(false)
  })

  it('canViewAllProspects: manager and above', () => {
    expect(canViewAllProspects('manager')).toBe(true)
    expect(canViewAllProspects('sdr')).toBe(false)
  })
})
