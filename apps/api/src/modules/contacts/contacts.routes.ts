import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { eq, and, desc, count, ilike } from 'drizzle-orm'
import { db, contacts } from '../../db/index.js'
import { requireMinRole } from '../auth/rbac.js'
import { scoreContact } from '../accounts/accounts.service.js'
import { logActivity } from '../analytics/activity.js'

const contactSchema = z.object({
  accountId: z.string().uuid(),
  firstName: z.string().min(1),
  lastName: z.string().default(''),
  email: z.string().email(),
  title: z.string().optional(),
  seniority: z.enum(['individual_contributor', 'manager', 'director', 'vp', 'c_level']).optional(),
  jobFunction: z.enum(['sales', 'marketing', 'product', 'engineering', 'it', 'finance', 'hr', 'operations', 'other']).optional(),
  linkedinUrl: z.string().optional(),
  country: z.string().optional(),
  phone: z.string().optional(),
  ownerId: z.string().uuid().optional(),
})

const lifecycleSchema = z.object({
  status: z.enum(['new', 'contacted', 'replied', 'meeting_scheduled', 'meeting_completed', 'qualified', 'disqualified', 'nurture']),
})

export async function contactsRoutes(app: FastifyInstance) {
  const auth = { onRequest: [app.authenticate] }

  // GET /contacts
  app.get('/', auth, async (req) => {
    const { page = '1', pageSize = '20', search, accountId, status } = req.query as Record<string, string>
    const offset = (parseInt(page) - 1) * parseInt(pageSize)

    const conditions = [eq(contacts.workspaceId, req.user.workspaceId)]
    if (accountId) conditions.push(eq(contacts.accountId, accountId))
    if (status) conditions.push(eq(contacts.lifecycleStatus, status as any))
    if (search) conditions.push(ilike(contacts.firstName, `%${search}%`))

    const where = and(...conditions)

    const [rows, [{ total }]] = await Promise.all([
      db.query.contacts.findMany({
        where,
        orderBy: desc(contacts.score),
        limit: parseInt(pageSize),
        offset,
      }),
      db.select({ total: count() }).from(contacts).where(where),
    ])

    return { data: rows, total: Number(total), page: parseInt(page), pageSize: parseInt(pageSize) }
  })

  // GET /contacts/:id
  app.get('/:id', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const contact = await db.query.contacts.findFirst({
      where: and(eq(contacts.id, id), eq(contacts.workspaceId, req.user.workspaceId)),
    })
    if (!contact) return reply.code(404).send({ error: 'Not found' })
    return { data: contact }
  })

  // POST /contacts
  app.post('/', auth, async (req, reply) => {
    const body = contactSchema.parse(req.body)
    const [contact] = await db.insert(contacts).values({
      ...body,
      workspaceId: req.user.workspaceId,
    }).returning()

    const score = await scoreContact(contact!.id, req.user.workspaceId)
    const [scored] = await db.update(contacts).set({ score }).where(eq(contacts.id, contact!.id)).returning()

    await logActivity({
      workspaceId: req.user.workspaceId,
      objectType: 'contact',
      objectId: contact!.id,
      activityType: 'contact_created',
      actorType: 'user',
      actorId: req.user.sub,
      payload: { email: body.email },
    })

    return reply.code(201).send({ data: scored })
  })

  // PATCH /contacts/:id
  app.patch('/:id', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = contactSchema.partial().parse(req.body)
    const [updated] = await db.update(contacts)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(contacts.id, id), eq(contacts.workspaceId, req.user.workspaceId)))
      .returning()
    if (!updated) return reply.code(404).send({ error: 'Not found' })
    return { data: updated }
  })

  // PATCH /contacts/:id/lifecycle
  app.patch('/:id/lifecycle', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const { status } = lifecycleSchema.parse(req.body)

    const [updated] = await db.update(contacts)
      .set({ lifecycleStatus: status, updatedAt: new Date() })
      .where(and(eq(contacts.id, id), eq(contacts.workspaceId, req.user.workspaceId)))
      .returning()

    await logActivity({
      workspaceId: req.user.workspaceId,
      objectType: 'contact',
      objectId: id,
      activityType: 'lifecycle_updated',
      actorType: 'user',
      actorId: req.user.sub,
      payload: { status },
    })

    return { data: updated }
  })

  // POST /contacts/:id/unsubscribe
  app.post('/:id/unsubscribe', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    await db.update(contacts)
      .set({ unsubscribed: true, unsubscribedAt: new Date() })
      .where(and(eq(contacts.id, id), eq(contacts.workspaceId, req.user.workspaceId)))
    return { data: { ok: true } }
  })

  // DELETE /contacts/:id
  app.delete('/:id', { onRequest: [app.authenticate, requireMinRole('manager')] }, async (req, reply) => {
    const { id } = req.params as { id: string }
    await db.delete(contacts).where(
      and(eq(contacts.id, id), eq(contacts.workspaceId, req.user.workspaceId)),
    )
    return { data: { ok: true } }
  })
}
