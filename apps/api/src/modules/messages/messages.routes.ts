import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { eq, and, desc, count } from 'drizzle-orm'
import { db, messages, replies } from '../../db/index.js'
import { dispatchMessage } from '../sequences/sequences.service.js'
import { classifyReply } from '../../ai/reply-classifier.js'
import { logActivity } from '../analytics/activity.js'

const approveSchema = z.object({
  subject: z.string().optional(),
  body: z.string().optional(),
})

const replyInboundSchema = z.object({
  messageId: z.string().uuid(),
  body: z.string().min(1),
  receivedAt: z.string().datetime().optional(),
})

export async function messagesRoutes(app: FastifyInstance) {
  const auth = { onRequest: [app.authenticate] }

  // GET /messages — pending approval queue
  app.get('/', auth, async (req) => {
    const { status, page = '1', pageSize = '20' } = req.query as Record<string, string>
    const offset = (parseInt(page) - 1) * parseInt(pageSize)

    const rows = await db.query.messages.findMany({
      where: status ? eq(messages.status, status as any) : undefined,
      orderBy: desc(messages.createdAt),
      limit: parseInt(pageSize),
      offset,
      with: { contact: true, sequenceStep: true },
    })

    return { data: rows }
  })

  // GET /messages/:id
  app.get('/:id', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const msg = await db.query.messages.findFirst({
      where: eq(messages.id, id),
      with: { contact: true, sequenceStep: true },
    })
    if (!msg) return reply.code(404).send({ error: 'Not found' })
    return { data: msg }
  })

  // POST /messages/:id/approve — approve and send
  app.post('/:id/approve', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = approveSchema.parse(req.body)

    const msg = await db.query.messages.findFirst({ where: eq(messages.id, id) })
    if (!msg) return reply.code(404).send({ error: 'Not found' })
    if (msg.status !== 'pending') return reply.code(400).send({ error: 'Message is not pending' })

    // apply any edits
    await db.update(messages).set({
      ...(body.subject ? { subject: body.subject } : {}),
      ...(body.body ? { body: body.body } : {}),
      approvedBy: req.user.sub,
      approvedAt: new Date(),
      status: 'scheduled',
    }).where(eq(messages.id, id))

    await dispatchMessage(id)
    return { data: { ok: true } }
  })

  // POST /messages/:id/reject — reject and skip step
  app.post('/:id/reject', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    await db.update(messages).set({ status: 'failed' }).where(eq(messages.id, id))

    await logActivity({
      workspaceId: req.user.workspaceId,
      objectType: 'message',
      objectId: id,
      activityType: 'message_rejected',
      actorType: 'user',
      actorId: req.user.sub,
      payload: {},
    })

    return { data: { ok: true } }
  })

  // POST /messages/replies/inbound — receive inbound reply (webhook from email provider)
  app.post('/replies/inbound', auth, async (req, reply) => {
    const body = replyInboundSchema.parse(req.body)

    const originalMsg = await db.query.messages.findFirst({
      where: eq(messages.id, body.messageId),
      with: { contact: true, enrollment: true },
    })
    if (!originalMsg) return reply.code(404).send({ error: 'Original message not found' })

    const classification = await classifyReply(body.body)

    const [replyRecord] = await db.insert(replies).values({
      messageId: body.messageId,
      contactId: originalMsg.contactId,
      enrollmentId: originalMsg.enrollmentId,
      body: body.body,
      intent: classification.intent,
      confidenceScore: classification.confidence,
      requiresHumanReview: classification.requiresHumanReview,
      receivedAt: body.receivedAt ? new Date(body.receivedAt) : new Date(),
    }).returning()

    // pause sequence if unsubscribe
    if (classification.intent === 'unsubscribe') {
      const { contacts } = await import('../../db/index.js')
      await db.update(contacts)
        .set({ unsubscribed: true, unsubscribedAt: new Date() })
        .where(eq(contacts.id, originalMsg.contactId))

      const { sequenceEnrollments } = await import('../../db/index.js')
      await db.update(sequenceEnrollments)
        .set({ status: 'unsubscribed' })
        .where(eq(sequenceEnrollments.id, originalMsg.enrollmentId))
    }

    await logActivity({
      workspaceId: req.user.workspaceId,
      objectType: 'contact',
      objectId: originalMsg.contactId,
      activityType: 'reply_received',
      actorType: 'system',
      payload: {
        replyId: replyRecord!.id,
        intent: classification.intent,
        suggestedAction: classification.suggestedAction,
      },
    })

    return reply.code(201).send({
      data: {
        reply: replyRecord,
        classification,
      },
    })
  })

  // GET /messages/replies/:id
  app.get('/replies/:id', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const replyRecord = await db.query.replies.findFirst({
      where: eq(replies.id, id),
      with: { contact: true, message: true },
    })
    if (!replyRecord) return reply.code(404).send({ error: 'Not found' })
    return { data: replyRecord }
  })

  // POST /messages/replies/:id/review — human review decision
  app.post('/replies/:id/review', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const { intent, action } = z.object({
      intent: z.string(),
      action: z.string(),
    }).parse(req.body)

    await db.update(replies)
      .set({
        intent: intent as any,
        actionTaken: action,
        humanReviewedBy: req.user.sub,
        humanReviewedAt: new Date(),
        requiresHumanReview: false,
      })
      .where(eq(replies.id, id))

    return { data: { ok: true } }
  })
}
