import type { FastifyRequest, FastifyReply } from 'fastify'
import type { WorkspaceRole } from '@ai-sales/types'

const ROLE_HIERARCHY: Record<WorkspaceRole, number> = {
  owner: 6,
  admin: 5,
  manager: 4,
  ae: 3,
  sdr: 2,
  viewer: 1,
}

export function requireRole(...roles: WorkspaceRole[]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const userRole = req.user.role as WorkspaceRole
    const allowed = roles.some((r) => ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[r])
    if (!allowed) {
      return reply.code(403).send({ error: 'Insufficient permissions' })
    }
  }
}

export function requireMinRole(minRole: WorkspaceRole) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const userRole = req.user.role as WorkspaceRole
    if (ROLE_HIERARCHY[userRole] < ROLE_HIERARCHY[minRole]) {
      return reply.code(403).send({ error: 'Insufficient permissions' })
    }
  }
}

export function canConfigurePlaybook(role: WorkspaceRole) {
  return ROLE_HIERARCHY[role] >= ROLE_HIERARCHY['manager']
}

export function canViewAllProspects(role: WorkspaceRole) {
  return ROLE_HIERARCHY[role] >= ROLE_HIERARCHY['manager']
}

export function canApproveMessages(role: WorkspaceRole) {
  return ROLE_HIERARCHY[role] >= ROLE_HIERARCHY['sdr']
}

export function canAccessCrmConfig(role: WorkspaceRole) {
  return ROLE_HIERARCHY[role] >= ROLE_HIERARCHY['admin']
}
