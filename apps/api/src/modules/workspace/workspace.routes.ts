import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { db, workspaces, workspaceMembers, users, invitations } from '../../db/index.js'
import { requireMinRole } from '../auth/rbac.js'
import { randomBytes } from 'node:crypto'

const updateWorkspaceSchema = z.object({
  name: z.string().min(1).optional(),
  timezone: z.string().optional(),
  brandVoice: z.string().optional(),
  companyDescription: z.string().optional(),
  dailySendLimit: z.number().int().min(1).max(1000).optional(),
  sendWindowStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  sendWindowEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
})

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'manager', 'sdr', 'ae', 'viewer']),
})

const updateMemberSchema = z.object({
  role: z.enum(['admin', 'manager', 'sdr', 'ae', 'viewer']),
})

export async function workspaceRoutes(app: FastifyInstance) {
  const auth = { onRequest: [app.authenticate] }

  // GET /workspace — current workspace info
  app.get('/', auth, async (req) => {
    const ws = await db.query.workspaces.findFirst({
      where: eq(workspaces.id, req.user.workspaceId),
    })
    return { data: ws }
  })

  // PATCH /workspace
  app.patch('/', { ...auth, onRequest: [app.authenticate, requireMinRole('admin')] }, async (req) => {
    const body = updateWorkspaceSchema.parse(req.body)
    const [updated] = await db
      .update(workspaces)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(workspaces.id, req.user.workspaceId))
      .returning()
    return { data: updated }
  })

  // GET /workspace/members
  app.get('/members', auth, async (req) => {
    const members = await db.query.workspaceMembers.findMany({
      where: eq(workspaceMembers.workspaceId, req.user.workspaceId),
      with: { user: true },
    })
    return {
      data: members.map((m) => ({
        userId: m.userId,
        workspaceId: m.workspaceId,
        role: m.role,
        joinedAt: m.joinedAt,
        user: { id: m.user.id, name: m.user.name, email: m.user.email, avatarUrl: m.user.avatarUrl },
      })),
    }
  })

  // POST /workspace/invitations
  app.post('/invitations', {
    onRequest: [app.authenticate, requireMinRole('admin')],
  }, async (req, reply) => {
    const body = inviteSchema.parse(req.body)
    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

    const [inv] = await db.insert(invitations).values({
      workspaceId: req.user.workspaceId,
      email: body.email,
      role: body.role,
      token,
      invitedBy: req.user.sub,
      expiresAt,
    }).returning()

    // In production: send invitation email
    return reply.code(201).send({ data: inv })
  })

  // POST /workspace/invitations/:token/accept
  app.post('/invitations/:token/accept', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { token } = req.params as { token: string }
    const inv = await db.query.invitations.findFirst({
      where: eq(invitations.token, token),
    })

    if (!inv) return reply.code(404).send({ error: 'Invitation not found' })
    if (inv.acceptedAt) return reply.code(409).send({ error: 'Already accepted' })
    if (inv.expiresAt < new Date()) return reply.code(410).send({ error: 'Invitation expired' })

    const user = await db.query.users.findFirst({ where: eq(users.id, req.user.sub) })
    if (!user || inv.email !== user.email) return reply.code(403).send({ error: 'Email mismatch' })

    await db.insert(workspaceMembers).values({
      userId: req.user.sub,
      workspaceId: inv.workspaceId,
      role: inv.role,
      invitedBy: inv.invitedBy,
    }).onConflictDoNothing()

    await db.update(invitations)
      .set({ acceptedAt: new Date() })
      .where(eq(invitations.token, token))

    return { data: { ok: true } }
  })

  // PATCH /workspace/members/:userId
  app.patch('/members/:userId', {
    onRequest: [app.authenticate, requireMinRole('admin')],
  }, async (req, reply) => {
    const { userId } = req.params as { userId: string }
    const { role } = updateMemberSchema.parse(req.body)

    const [updated] = await db
      .update(workspaceMembers)
      .set({ role })
      .where(
        and(
          eq(workspaceMembers.workspaceId, req.user.workspaceId),
          eq(workspaceMembers.userId, userId),
        ),
      )
      .returning()

    if (!updated) return reply.code(404).send({ error: 'Member not found' })
    return { data: updated }
  })

  // DELETE /workspace/members/:userId
  app.delete('/members/:userId', {
    onRequest: [app.authenticate, requireMinRole('admin')],
  }, async (req, reply) => {
    const { userId } = req.params as { userId: string }
    if (userId === req.user.sub) return reply.code(400).send({ error: 'Cannot remove yourself' })

    await db.delete(workspaceMembers).where(
      and(
        eq(workspaceMembers.workspaceId, req.user.workspaceId),
        eq(workspaceMembers.userId, userId),
      ),
    )
    return { data: { ok: true } }
  })
}
