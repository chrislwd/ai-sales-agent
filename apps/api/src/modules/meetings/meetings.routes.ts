import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { eq, and, desc } from 'drizzle-orm'
import { db, meetings, contacts, accounts, messages } from '../../db/index.js'
import { generatePreCallBrief } from '../../ai/reply-classifier.js'
import { logActivity } from '../analytics/activity.js'

const proposeMeetingSchema = z.object({
  contactId: z.string().uuid(),
  ownerId: z.string().uuid(),
  proposedSlots: z.array(z.string().datetime()).min(1).max(5),
  durationMinutes: z.number().int().default(30),
  enrollmentId: z.string().uuid().optional(),
})

const confirmMeetingSchema = z.object({
  scheduledAt: z.string().datetime(),
  meetingLink: z.string().optional(),
})

const updateMeetingSchema = z.object({
  status: z.enum(['proposed', 'confirmed', 'completed', 'cancelled', 'no_show']).optional(),
  notes: z.string().optional(),
  scheduledAt: z.string().datetime().optional(),
})

export async function meetingsRoutes(app: FastifyInstance) {
  const auth = { onRequest: [app.authenticate] }

  // GET /meetings
  app.get('/', auth, async (req) => {
    const { status, page = '1', pageSize = '20' } = req.query as Record<string, string>
    const offset = (parseInt(page) - 1) * parseInt(pageSize)

    const rows = await db.query.meetings.findMany({
      where: and(
        eq(meetings.workspaceId, req.user.workspaceId),
        status ? eq(meetings.status, status as any) : undefined,
      ),
      orderBy: desc(meetings.createdAt),
      limit: parseInt(pageSize),
      offset,
      with: { contact: true, account: true },
    })

    return { data: rows }
  })

  // GET /meetings/:id
  app.get('/:id', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const meeting = await db.query.meetings.findFirst({
      where: and(eq(meetings.id, id), eq(meetings.workspaceId, req.user.workspaceId)),
      with: { contact: true, account: true },
    })
    if (!meeting) return reply.code(404).send({ error: 'Not found' })
    return { data: meeting }
  })

  // POST /meetings — propose meeting
  app.post('/', auth, async (req, reply) => {
    const body = proposeMeetingSchema.parse(req.body)

    const contact = await db.query.contacts.findFirst({
      where: and(eq(contacts.id, body.contactId), eq(contacts.workspaceId, req.user.workspaceId)),
      with: { account: true },
    })
    if (!contact) return reply.code(404).send({ error: 'Contact not found' })

    const [meeting] = await db.insert(meetings).values({
      workspaceId: req.user.workspaceId,
      accountId: contact.accountId,
      contactId: body.contactId,
      ownerId: body.ownerId,
      durationMinutes: body.durationMinutes,
      status: 'proposed',
      source: 'auto',
      enrollmentId: body.enrollmentId,
    }).returning()

    await logActivity({
      workspaceId: req.user.workspaceId,
      objectType: 'meeting',
      objectId: meeting!.id,
      activityType: 'meeting_proposed',
      actorType: 'ai',
      payload: { contactId: body.contactId, proposedSlots: body.proposedSlots },
    })

    return reply.code(201).send({ data: meeting })
  })

  // POST /meetings/:id/confirm
  app.post('/:id/confirm', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const { scheduledAt, meetingLink } = confirmMeetingSchema.parse(req.body)

    const meeting = await db.query.meetings.findFirst({
      where: and(eq(meetings.id, id), eq(meetings.workspaceId, req.user.workspaceId)),
      with: {
        contact: { with: { account: true } },
      },
    })
    if (!meeting) return reply.code(404).send({ error: 'Not found' })

    // generate pre-call brief via AI
    const touchHistory = await db.query.messages.findMany({
      where: eq(messages.contactId, meeting.contactId),
      orderBy: desc(messages.sentAt),
      limit: 5,
    })

    const brief = await generatePreCallBrief({
      contactFirstName: meeting.contact.firstName,
      contactLastName: meeting.contact.lastName,
      contactTitle: meeting.contact.title,
      companyName: meeting.contact.account.companyName,
      industry: meeting.contact.account.industry,
      touchHistory: touchHistory.map((m) => `${m.subject} (${m.status})`),
      meetingContext: `Meeting confirmed for ${scheduledAt}`,
    })

    const [updated] = await db.update(meetings)
      .set({
        status: 'confirmed',
        scheduledAt: new Date(scheduledAt),
        meetingLink,
        preCallBrief: brief,
        updatedAt: new Date(),
      })
      .where(eq(meetings.id, id))
      .returning()

    // update contact lifecycle
    await db.update(contacts)
      .set({ lifecycleStatus: 'meeting_scheduled', updatedAt: new Date() })
      .where(eq(contacts.id, meeting.contactId))

    await logActivity({
      workspaceId: req.user.workspaceId,
      objectType: 'meeting',
      objectId: id,
      activityType: 'meeting_confirmed',
      actorType: 'user',
      actorId: req.user.sub,
      payload: { scheduledAt },
    })

    return { data: updated }
  })

  // PATCH /meetings/:id
  app.patch('/:id', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = updateMeetingSchema.parse(req.body)

    const [updated] = await db.update(meetings)
      .set({
        ...body,
        scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : undefined,
        updatedAt: new Date(),
      })
      .where(and(eq(meetings.id, id), eq(meetings.workspaceId, req.user.workspaceId)))
      .returning()

    if (!updated) return reply.code(404).send({ error: 'Not found' })

    if (body.status === 'completed') {
      await db.update(contacts)
        .set({ lifecycleStatus: 'meeting_completed', updatedAt: new Date() })
        .where(eq(contacts.id, updated.contactId))
    }

    return { data: updated }
  })

  // GET /meetings/:id/brief — get pre-call brief
  app.get('/:id/brief', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const meeting = await db.query.meetings.findFirst({
      where: and(eq(meetings.id, id), eq(meetings.workspaceId, req.user.workspaceId)),
    })
    if (!meeting) return reply.code(404).send({ error: 'Not found' })
    return { data: { brief: meeting.preCallBrief } }
  })
}
