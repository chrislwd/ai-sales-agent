import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { eq, and, desc } from 'drizzle-orm'
import { db, sequences, sequenceSteps, sequenceEnrollments, contacts } from '../../db/index.js'
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

  // DELETE /sequences/:id
  app.delete('/:id', managerAuth, async (req, reply) => {
    const { id } = req.params as { id: string }
    await db.delete(sequences).where(
      and(eq(sequences.id, id), eq(sequences.workspaceId, req.user.workspaceId)),
    )
    return { data: { ok: true } }
  })
}
