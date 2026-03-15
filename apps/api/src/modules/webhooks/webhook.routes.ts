import type { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { db, messages, replies, contacts, sequenceEnrollments } from '../../db/index.js'
import { classifyReply } from '../../ai/reply-classifier.js'
import { logActivity } from '../analytics/activity.js'
import { env } from '../../config/env.js'
import crypto from 'node:crypto'

// ─── Signature verification ──────────────────────────────────────────────────

const RESEND_WEBHOOK_SECRET = process.env['RESEND_WEBHOOK_SECRET']

function verifyResendSignature(payload: string, signature: string | undefined): boolean {
  if (!RESEND_WEBHOOK_SECRET || !signature) return !RESEND_WEBHOOK_SECRET // skip if no secret configured
  try {
    const expected = crypto
      .createHmac('sha256', RESEND_WEBHOOK_SECRET)
      .update(payload)
      .digest('base64')
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  } catch {
    return false
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function findMessageByExternalId(externalMessageId: string) {
  return db.query.messages.findFirst({
    where: eq(messages.externalMessageId, externalMessageId),
    with: { contact: true, enrollment: { with: { sequence: true } } },
  })
}

// ─── Handlers ────────────────────────────────────────────────────────────────

async function handleOpen(externalMessageId: string) {
  const message = await findMessageByExternalId(externalMessageId)
  if (!message) return

  const now = new Date()
  await db.update(messages)
    .set({ openedAt: now })
    .where(eq(messages.id, message.id))

  await logActivity({
    workspaceId: message.enrollment.sequence.workspaceId,
    objectType: 'contact',
    objectId: message.contactId,
    activityType: 'email_opened',
    actorType: 'system',
    payload: { messageId: message.id, externalMessageId },
  })
}

async function handleClick(externalMessageId: string) {
  const message = await findMessageByExternalId(externalMessageId)
  if (!message) return

  const now = new Date()
  await db.update(messages)
    .set({ clickedAt: now })
    .where(eq(messages.id, message.id))

  await logActivity({
    workspaceId: message.enrollment.sequence.workspaceId,
    objectType: 'contact',
    objectId: message.contactId,
    activityType: 'email_clicked',
    actorType: 'system',
    payload: { messageId: message.id, externalMessageId },
  })
}

async function handleBounce(externalMessageId: string) {
  const message = await findMessageByExternalId(externalMessageId)
  if (!message) return

  const now = new Date()

  await db.update(messages)
    .set({ bouncedAt: now, status: 'bounced' })
    .where(eq(messages.id, message.id))

  await db.update(sequenceEnrollments)
    .set({ status: 'bounced' })
    .where(eq(sequenceEnrollments.id, message.enrollmentId))

  await logActivity({
    workspaceId: message.enrollment.sequence.workspaceId,
    objectType: 'contact',
    objectId: message.contactId,
    activityType: 'email_bounced',
    actorType: 'system',
    payload: { messageId: message.id, externalMessageId },
  })
}

async function handleReply(payload: {
  externalMessageId: string
  body: string
  rawEmail?: string
}) {
  const message = await findMessageByExternalId(payload.externalMessageId)
  if (!message) return

  const workspaceId = message.enrollment.sequence.workspaceId

  // Store reply
  const classification = await classifyReply(payload.body)

  const [replyRecord] = await db.insert(replies).values({
    messageId: message.id,
    contactId: message.contactId,
    enrollmentId: message.enrollmentId,
    body: payload.body,
    rawEmail: payload.rawEmail,
    intent: classification.intent,
    confidenceScore: classification.confidence,
    requiresHumanReview: classification.requiresHumanReview,
    receivedAt: new Date(),
  }).returning()

  // Handle unsubscribe intent
  if (classification.intent === 'unsubscribe') {
    await db.update(contacts)
      .set({ unsubscribed: true, unsubscribedAt: new Date() })
      .where(eq(contacts.id, message.contactId))

    await db.update(sequenceEnrollments)
      .set({ status: 'unsubscribed' })
      .where(eq(sequenceEnrollments.id, message.enrollmentId))
  }

  // Handle interested / request_demo intents
  if (classification.intent === 'interested' || classification.intent === 'request_demo') {
    await db.update(contacts)
      .set({ lifecycleStatus: 'replied' })
      .where(eq(contacts.id, message.contactId))
  }

  // Mark enrollment as replied
  await db.update(sequenceEnrollments)
    .set({ status: 'replied' })
    .where(eq(sequenceEnrollments.id, message.enrollmentId))

  await logActivity({
    workspaceId,
    objectType: 'contact',
    objectId: message.contactId,
    activityType: 'reply_received',
    actorType: 'system',
    payload: {
      replyId: replyRecord!.id,
      intent: classification.intent,
      confidence: classification.confidence,
      suggestedAction: classification.suggestedAction,
      requiresHumanReview: classification.requiresHumanReview,
    },
  })
}

// ─── Route definitions ───────────────────────────────────────────────────────

export async function webhookRoutes(app: FastifyInstance) {
  // Add raw body for signature verification
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (_req, body, done) => {
      try {
        done(null, JSON.parse(body as string))
      } catch (err) {
        done(err as Error, undefined)
      }
    },
  )

  // ── POST /webhooks/email/open ────────────────────────────────────────────

  app.post('/email/open', async (req, reply) => {
    try {
      const { messageId } = req.body as { messageId: string }
      if (!messageId) return reply.code(200).send({ ok: true, error: 'Missing messageId' })

      await handleOpen(messageId)
    } catch (err) {
      app.log.error(err, 'Error processing open webhook')
    }
    return reply.code(200).send({ ok: true })
  })

  // ── POST /webhooks/email/click ───────────────────────────────────────────

  app.post('/email/click', async (req, reply) => {
    try {
      const { messageId } = req.body as { messageId: string }
      if (!messageId) return reply.code(200).send({ ok: true, error: 'Missing messageId' })

      await handleClick(messageId)
    } catch (err) {
      app.log.error(err, 'Error processing click webhook')
    }
    return reply.code(200).send({ ok: true })
  })

  // ── POST /webhooks/email/bounce ──────────────────────────────────────────

  app.post('/email/bounce', async (req, reply) => {
    try {
      const { messageId } = req.body as { messageId: string }
      if (!messageId) return reply.code(200).send({ ok: true, error: 'Missing messageId' })

      await handleBounce(messageId)
    } catch (err) {
      app.log.error(err, 'Error processing bounce webhook')
    }
    return reply.code(200).send({ ok: true })
  })

  // ── POST /webhooks/email/reply ───────────────────────────────────────────

  app.post('/email/reply', async (req, reply) => {
    try {
      const { messageId, body, rawEmail } = req.body as {
        messageId: string
        body: string
        rawEmail?: string
      }
      if (!messageId || !body) {
        return reply.code(200).send({ ok: true, error: 'Missing messageId or body' })
      }

      await handleReply({ externalMessageId: messageId, body, rawEmail })
    } catch (err) {
      app.log.error(err, 'Error processing reply webhook')
    }
    return reply.code(200).send({ ok: true })
  })

  // ── POST /webhooks/resend — Unified Resend webhook ──────────────────────

  app.post('/resend', async (req, reply) => {
    try {
      // Verify signature if secret is configured
      const rawBody = JSON.stringify(req.body)
      const signature = (req.headers as Record<string, string>)['resend-signature']
      if (!verifyResendSignature(rawBody, signature)) {
        app.log.warn('Invalid Resend webhook signature')
        return reply.code(200).send({ ok: true, error: 'Invalid signature' })
      }

      const { type, data } = req.body as {
        type: string
        data: { email_id: string; to?: string[]; subject?: string; [key: string]: unknown }
      }

      if (!type || !data?.email_id) {
        return reply.code(200).send({ ok: true, error: 'Invalid payload' })
      }

      const externalMessageId = data.email_id

      switch (type) {
        case 'email.opened':
          await handleOpen(externalMessageId)
          break
        case 'email.clicked':
          await handleClick(externalMessageId)
          break
        case 'email.bounced':
          await handleBounce(externalMessageId)
          break
        case 'email.delivered':
          // Update message status to delivered
          const message = await findMessageByExternalId(externalMessageId)
          if (message) {
            await db.update(messages)
              .set({ status: 'delivered' })
              .where(eq(messages.id, message.id))
          }
          break
        default:
          app.log.info({ type }, 'Unhandled Resend webhook event type')
      }
    } catch (err) {
      app.log.error(err, 'Error processing Resend webhook')
    }
    return reply.code(200).send({ ok: true })
  })
}
