import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { eq, and, desc, sql, count } from 'drizzle-orm'
import { db, sequences, sequenceSteps, sequenceEnrollments, contacts, messages, replies, meetings } from '../../db/index.js'
import { requireMinRole } from '../auth/rbac.js'
import { enrollContact, pauseEnrollment, resumeEnrollment } from './sequences.service.js'

const stepSchema = z.object({
  position: z.number().int().min(0),
  stepType: z.enum(['email', 'wait', 'condition']).default('email'),
  delayDays: z.number().int().min(0).default(0),
  condition: z.object({
    trigger: z.enum(['opened', 'clicked', 'not_replied', 'replied_with', 'always']),
    intentFilter: z.string().optional(),
  }).nullable().default(null),
  templateSubject: z.string().optional(),
  templateBody: z.string().optional(),
  approvalMode: z.enum(['auto', 'first_only', 'all']).default('auto'),
  variantGroup: z.string().nullable().optional(),
  variantLabel: z.string().nullable().optional(),
})

const sequenceSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  icpConfigId: z.string().uuid().optional(),
  dailySendLimit: z.number().int().min(1).max(500).default(50),
  sendWindowStart: z.string().regex(/^\d{2}:\d{2}$/).default('08:00'),
  sendWindowEnd: z.string().regex(/^\d{2}:\d{2}$/).default('18:00'),
  timezone: z.string().default('UTC'),
  defaultApprovalMode: z.enum(['auto', 'first_only', 'all']).default('auto'),
  steps: z.array(stepSchema).default([]),
})

const enrollSchema = z.object({
  contactIds: z.array(z.string().uuid()).min(1),
})

export async function sequencesRoutes(app: FastifyInstance) {
  const auth = { onRequest: [app.authenticate] }
  const managerAuth = { onRequest: [app.authenticate, requireMinRole('manager')] }

  // GET /sequences
  app.get('/', auth, async (req) => {
    const rows = await db.query.sequences.findMany({
      where: eq(sequences.workspaceId, req.user.workspaceId),
      orderBy: desc(sequences.createdAt),
      with: { steps: { orderBy: (s, { asc }) => [asc(s.position)] } },
    })
    return { data: rows }
  })

  // GET /sequences/:id
  app.get('/:id', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const seq = await db.query.sequences.findFirst({
      where: and(eq(sequences.id, id), eq(sequences.workspaceId, req.user.workspaceId)),
      with: { steps: { orderBy: (s, { asc }) => [asc(s.position)] } },
    })
    if (!seq) return reply.code(404).send({ error: 'Not found' })
    return { data: seq }
  })

  // POST /sequences
  app.post('/', managerAuth, async (req, reply) => {
    const body = sequenceSchema.parse(req.body)
    const { steps, ...seqData } = body

    const [seq] = await db.insert(sequences).values({
      ...seqData,
      workspaceId: req.user.workspaceId,
      createdBy: req.user.sub,
    }).returning()

    if (steps.length > 0) {
      await db.insert(sequenceSteps).values(
        steps.map((s) => ({ ...s, sequenceId: seq!.id })),
      )
    }

    const created = await db.query.sequences.findFirst({
      where: eq(sequences.id, seq!.id),
      with: { steps: { orderBy: (s, { asc }) => [asc(s.position)] } },
    })
    return reply.code(201).send({ data: created })
  })

  // PATCH /sequences/:id
  app.patch('/:id', managerAuth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = sequenceSchema.partial().parse(req.body)
    const { steps, ...seqData } = body

    const [updated] = await db.update(sequences)
      .set({ ...seqData, updatedAt: new Date() })
      .where(and(eq(sequences.id, id), eq(sequences.workspaceId, req.user.workspaceId)))
      .returning()
    if (!updated) return reply.code(404).send({ error: 'Not found' })

    if (steps !== undefined) {
      await db.delete(sequenceSteps).where(eq(sequenceSteps.sequenceId, id))
      if (steps.length > 0) {
        await db.insert(sequenceSteps).values(steps.map((s) => ({ ...s, sequenceId: id })))
      }
    }

    const result = await db.query.sequences.findFirst({
      where: eq(sequences.id, id),
      with: { steps: { orderBy: (s, { asc }) => [asc(s.position)] } },
    })
    return { data: result }
  })

  // PATCH /sequences/:id/status
  app.patch('/:id/status', managerAuth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const { status } = z.object({
      status: z.enum(['draft', 'active', 'paused', 'archived']),
    }).parse(req.body)

    const [updated] = await db.update(sequences)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(sequences.id, id), eq(sequences.workspaceId, req.user.workspaceId)))
      .returning()
    return { data: updated }
  })

  // POST /sequences/:id/enroll
  app.post('/:id/enroll', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const { contactIds } = enrollSchema.parse(req.body)

    const seq = await db.query.sequences.findFirst({
      where: and(eq(sequences.id, id), eq(sequences.workspaceId, req.user.workspaceId)),
    })
    if (!seq) return reply.code(404).send({ error: 'Sequence not found' })
    if (seq.status !== 'active') return reply.code(400).send({ error: 'Sequence is not active' })

    const results = await Promise.allSettled(
      contactIds.map((cId) => enrollContact(id, cId, req.user.sub)),
    )

    const enrolled = results.filter((r) => r.status === 'fulfilled').length
    const skipped = results.length - enrolled
    return reply.code(201).send({ data: { enrolled, skipped } })
  })

  // GET /sequences/:id/enrollments
  app.get('/:id/enrollments', auth, async (req) => {
    const { id } = req.params as { id: string }
    const enrollments = await db.query.sequenceEnrollments.findMany({
      where: eq(sequenceEnrollments.sequenceId, id),
      with: { contact: true },
      orderBy: desc(sequenceEnrollments.createdAt),
    })
    return { data: enrollments }
  })

  // POST /sequences/enrollments/:enrollmentId/pause
  app.post('/enrollments/:enrollmentId/pause', auth, async (req) => {
    const { enrollmentId } = req.params as { enrollmentId: string }
    await pauseEnrollment(enrollmentId)
    return { data: { ok: true } }
  })

  // POST /sequences/enrollments/:enrollmentId/resume
  app.post('/enrollments/:enrollmentId/resume', auth, async (req) => {
    const { enrollmentId } = req.params as { enrollmentId: string }
    await resumeEnrollment(enrollmentId)
    return { data: { ok: true } }
  })

  // GET /sequences/:id/analytics — funnel metrics for a sequence
  app.get('/:id/analytics', auth, async (req, reply) => {
    const { id } = req.params as { id: string }

    // Verify the sequence belongs to this workspace
    const seq = await db.query.sequences.findFirst({
      where: and(eq(sequences.id, id), eq(sequences.workspaceId, req.user.workspaceId)),
      with: { steps: { orderBy: (s, { asc }) => [asc(s.position)] } },
    })
    if (!seq) return reply.code(404).send({ error: 'Not found' })

    // Enrollment status counts
    const enrollmentRows = await db
      .select({
        status: sequenceEnrollments.status,
        cnt: count(),
      })
      .from(sequenceEnrollments)
      .where(eq(sequenceEnrollments.sequenceId, id))
      .groupBy(sequenceEnrollments.status)

    const statusCounts: Record<string, number> = {}
    for (const r of enrollmentRows) {
      statusCounts[r.status] = Number(r.cnt)
    }

    const totalEnrolled = Object.values(statusCounts).reduce((a, b) => a + b, 0)
    const active = statusCounts['active'] ?? 0
    const completed = statusCounts['completed'] ?? 0
    const paused = statusCounts['paused'] ?? 0
    const bounced = statusCounts['bounced'] ?? 0
    const unsubscribed = statusCounts['unsubscribed'] ?? 0

    // Message-level metrics (only messages that belong to this sequence's enrollments)
    const [msgStats] = await db
      .select({
        emailsSent: sql<number>`count(*) filter (where ${messages.status} in ('sent', 'delivered'))`,
        opened: sql<number>`count(*) filter (where ${messages.openedAt} is not null)`,
        clicked: sql<number>`count(*) filter (where ${messages.clickedAt} is not null)`,
      })
      .from(messages)
      .innerJoin(sequenceEnrollments, eq(messages.enrollmentId, sequenceEnrollments.id))
      .where(eq(sequenceEnrollments.sequenceId, id))

    const emailsSent = Number(msgStats?.emailsSent ?? 0)
    const opened = Number(msgStats?.opened ?? 0)
    const clicked = Number(msgStats?.clicked ?? 0)

    // Reply count
    const [replyStats] = await db
      .select({ replied: count() })
      .from(replies)
      .innerJoin(sequenceEnrollments, eq(replies.enrollmentId, sequenceEnrollments.id))
      .where(eq(sequenceEnrollments.sequenceId, id))

    const replied = Number(replyStats?.replied ?? 0)

    // Meetings booked
    const [meetingStats] = await db
      .select({ meetingsBooked: count() })
      .from(meetings)
      .innerJoin(sequenceEnrollments, eq(meetings.enrollmentId, sequenceEnrollments.id))
      .where(eq(sequenceEnrollments.sequenceId, id))

    const meetingsBooked = Number(meetingStats?.meetingsBooked ?? 0)

    // Per-step breakdown
    const stepRows = await db
      .select({
        stepPosition: sequenceSteps.position,
        variantLabel: sequenceSteps.variantLabel,
        sent: sql<number>`count(*) filter (where ${messages.status} in ('sent', 'delivered'))`,
        opened: sql<number>`count(*) filter (where ${messages.openedAt} is not null)`,
      })
      .from(sequenceSteps)
      .leftJoin(messages, eq(messages.sequenceStepId, sequenceSteps.id))
      .where(eq(sequenceSteps.sequenceId, id))
      .groupBy(sequenceSteps.position, sequenceSteps.variantLabel)
      .orderBy(sequenceSteps.position)

    // Per-step reply counts (replies link through messages)
    const stepReplyRows = await db
      .select({
        stepPosition: sequenceSteps.position,
        variantLabel: sequenceSteps.variantLabel,
        replied: count(),
      })
      .from(replies)
      .innerJoin(messages, eq(replies.messageId, messages.id))
      .innerJoin(sequenceSteps, eq(messages.sequenceStepId, sequenceSteps.id))
      .where(eq(sequenceSteps.sequenceId, id))
      .groupBy(sequenceSteps.position, sequenceSteps.variantLabel)

    const replyMap: Record<string, number> = {}
    for (const r of stepReplyRows) {
      const key = `${r.stepPosition}-${r.variantLabel ?? ''}`
      replyMap[key] = Number(r.replied)
    }

    const perStep = stepRows.map((r) => {
      const sent = Number(r.sent)
      const stepOpened = Number(r.opened)
      const key = `${r.stepPosition}-${r.variantLabel ?? ''}`
      const stepReplied = replyMap[key] ?? 0
      return {
        stepPosition: r.stepPosition,
        variantLabel: r.variantLabel,
        sent,
        opened: stepOpened,
        replied: stepReplied,
        openRate: sent > 0 ? Math.round((stepOpened / sent) * 10000) / 100 : 0,
        replyRate: sent > 0 ? Math.round((stepReplied / sent) * 10000) / 100 : 0,
      }
    })

    return {
      data: {
        totalEnrolled,
        active,
        completed,
        paused,
        bounced,
        unsubscribed,
        emailsSent,
        opened,
        clicked,
        replied,
        openRate: emailsSent > 0 ? Math.round((opened / emailsSent) * 10000) / 100 : 0,
        clickRate: emailsSent > 0 ? Math.round((clicked / emailsSent) * 10000) / 100 : 0,
        replyRate: emailsSent > 0 ? Math.round((replied / emailsSent) * 10000) / 100 : 0,
        meetingsBooked,
        perStep,
      },
    }
  })

  // GET /sequences/:id/ab-results — compare A/B variants
  app.get('/:id/ab-results', auth, async (req, reply) => {
    const { id } = req.params as { id: string }

    const seq = await db.query.sequences.findFirst({
      where: and(eq(sequences.id, id), eq(sequences.workspaceId, req.user.workspaceId)),
    })
    if (!seq) return reply.code(404).send({ error: 'Not found' })

    // Get steps that have a variantGroup
    const variantSteps = await db.query.sequenceSteps.findMany({
      where: and(
        eq(sequenceSteps.sequenceId, id),
        sql`${sequenceSteps.variantGroup} IS NOT NULL`,
      ),
      orderBy: (s, { asc }) => [asc(s.position)],
    })

    if (variantSteps.length === 0) {
      return { data: { groups: [] } }
    }

    // Group by variantGroup
    const groupMap = new Map<string, typeof variantSteps>()
    for (const step of variantSteps) {
      const group = step.variantGroup!
      if (!groupMap.has(group)) groupMap.set(group, [])
      groupMap.get(group)!.push(step)
    }

    const groups = []
    for (const [groupName, steps] of groupMap) {
      const variants = []
      for (const step of steps) {
        // Sent / opened per variant step
        const [msgRow] = await db
          .select({
            sent: sql<number>`count(*) filter (where ${messages.status} in ('sent', 'delivered'))`,
            opened: sql<number>`count(*) filter (where ${messages.openedAt} is not null)`,
          })
          .from(messages)
          .where(eq(messages.sequenceStepId, step.id))

        const [replyRow] = await db
          .select({ replied: count() })
          .from(replies)
          .innerJoin(messages, eq(replies.messageId, messages.id))
          .where(eq(messages.sequenceStepId, step.id))

        const sent = Number(msgRow?.sent ?? 0)
        const opened = Number(msgRow?.opened ?? 0)
        const replied = Number(replyRow?.replied ?? 0)

        variants.push({
          variantLabel: step.variantLabel ?? step.id,
          stepPosition: step.position,
          sent,
          opened,
          replied,
          openRate: sent > 0 ? Math.round((opened / sent) * 10000) / 100 : 0,
          replyRate: sent > 0 ? Math.round((replied / sent) * 10000) / 100 : 0,
        })
      }
      groups.push({ variantGroup: groupName, variants })
    }

    return { data: { groups } }
  })

  // DELETE /sequences/:id
  app.delete('/:id', managerAuth, async (req, reply) => {
    const { id } = req.params as { id: string }
    await db.delete(sequences).where(
      and(eq(sequences.id, id), eq(sequences.workspaceId, req.user.workspaceId)),
    )
    return { data: { ok: true } }
  })
}
