import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { db, icpConfigs } from '../../db/index.js'
import { requireMinRole } from '../auth/rbac.js'

const icpSchema = z.object({
  name: z.string().min(1),
  industries: z.array(z.string()).default([]),
  countries: z.array(z.string()).default([]),
  employeeSizeMin: z.number().int().optional(),
  employeeSizeMax: z.number().int().optional(),
  revenueSizeMin: z.number().int().optional(),
  revenueSizeMax: z.number().int().optional(),
  techStack: z.array(z.string()).default([]),
  seniorityLevels: z.array(z.string()).default([]),
  jobFunctions: z.array(z.string()).default([]),
  isDefault: z.boolean().default(false),
})

export async function icpRoutes(app: FastifyInstance) {
  const auth = { onRequest: [app.authenticate] }
  const adminAuth = { onRequest: [app.authenticate, requireMinRole('manager')] }

  app.get('/', auth, async (req) => {
    const configs = await db.query.icpConfigs.findMany({
      where: eq(icpConfigs.workspaceId, req.user.workspaceId),
    })
    return { data: configs }
  })

  app.post('/', adminAuth, async (req, reply) => {
    const body = icpSchema.parse(req.body)
    const [config] = await db.insert(icpConfigs).values({
      ...body,
      workspaceId: req.user.workspaceId,
    }).returning()
    return reply.code(201).send({ data: config })
  })

  app.patch('/:id', adminAuth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = icpSchema.partial().parse(req.body)
    const [updated] = await db
      .update(icpConfigs)
      .set(body)
      .where(and(eq(icpConfigs.id, id), eq(icpConfigs.workspaceId, req.user.workspaceId)))
      .returning()
    if (!updated) return reply.code(404).send({ error: 'Not found' })
    return { data: updated }
  })

  app.delete('/:id', adminAuth, async (req, reply) => {
    const { id } = req.params as { id: string }
    await db.delete(icpConfigs).where(
      and(eq(icpConfigs.id, id), eq(icpConfigs.workspaceId, req.user.workspaceId)),
    )
    return { data: { ok: true } }
  })
}
