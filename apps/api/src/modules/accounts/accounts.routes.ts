import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { eq, and, ilike, desc, count, sql } from 'drizzle-orm'
import { db, accounts, contacts } from '../../db/index.js'
import { requireMinRole } from '../auth/rbac.js'
import { scoreAccount } from './accounts.service.js'
import { parse as csvParse } from 'csv-parse/sync'

const accountSchema = z.object({
  companyName: z.string().min(1),
  domain: z.string().optional(),
  industry: z.string().optional(),
  country: z.string().optional(),
  employeeSize: z.number().int().optional(),
  revenueRange: z.string().optional(),
  techStack: z.array(z.string()).default([]),
  fundingStage: z.string().optional(),
  linkedinUrl: z.string().optional(),
  ownerId: z.string().uuid().optional(),
  source: z.string().default('manual'),
})

export async function accountsRoutes(app: FastifyInstance) {
  const auth = { onRequest: [app.authenticate] }

  // GET /accounts
  app.get('/', auth, async (req) => {
    const { page = '1', pageSize = '20', search } = req.query as Record<string, string>
    const offset = (parseInt(page) - 1) * parseInt(pageSize)

    const where = search
      ? and(
          eq(accounts.workspaceId, req.user.workspaceId),
          ilike(accounts.companyName, `%${search}%`),
        )
      : eq(accounts.workspaceId, req.user.workspaceId)

    const [rows, [{ total }]] = await Promise.all([
      db.query.accounts.findMany({
        where,
        orderBy: desc(accounts.score),
        limit: parseInt(pageSize),
        offset,
      }),
      db.select({ total: count() }).from(accounts).where(where),
    ])

    return { data: rows, total: Number(total), page: parseInt(page), pageSize: parseInt(pageSize) }
  })

  // GET /accounts/:id
  app.get('/:id', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const account = await db.query.accounts.findFirst({
      where: and(eq(accounts.id, id), eq(accounts.workspaceId, req.user.workspaceId)),
    })
    if (!account) return reply.code(404).send({ error: 'Not found' })
    return { data: account }
  })

  // POST /accounts
  app.post('/', auth, async (req, reply) => {
    const body = accountSchema.parse(req.body)
    const [account] = await db.insert(accounts).values({
      ...body,
      workspaceId: req.user.workspaceId,
    }).returning()

    const { score, breakdown } = await scoreAccount(account!.id, req.user.workspaceId)
    const [scored] = await db.update(accounts)
      .set({ score, scoreBreakdown: breakdown })
      .where(eq(accounts.id, account!.id))
      .returning()

    return reply.code(201).send({ data: scored })
  })

  // PATCH /accounts/:id
  app.patch('/:id', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = accountSchema.partial().parse(req.body)
    const [updated] = await db.update(accounts)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(accounts.id, id), eq(accounts.workspaceId, req.user.workspaceId)))
      .returning()
    if (!updated) return reply.code(404).send({ error: 'Not found' })
    return { data: updated }
  })

  // DELETE /accounts/:id
  app.delete('/:id', { onRequest: [app.authenticate, requireMinRole('manager')] }, async (req, reply) => {
    const { id } = req.params as { id: string }
    await db.delete(accounts).where(
      and(eq(accounts.id, id), eq(accounts.workspaceId, req.user.workspaceId)),
    )
    return { data: { ok: true } }
  })

  // POST /accounts/:id/rescore
  app.post('/:id/rescore', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const { score, breakdown } = await scoreAccount(id, req.user.workspaceId)
    const [updated] = await db.update(accounts)
      .set({ score, scoreBreakdown: breakdown })
      .where(and(eq(accounts.id, id), eq(accounts.workspaceId, req.user.workspaceId)))
      .returning()
    return { data: updated }
  })

  // POST /accounts/import — CSV upload
  app.post('/import', {
    onRequest: [app.authenticate],
  }, async (req, reply) => {
    const data = await req.file()
    if (!data) return reply.code(400).send({ error: 'No file provided' })

    const buffer = await data.toBuffer()
    const rows = csvParse(buffer, { columns: true, skip_empty_lines: true }) as Record<string, string>[]

    const toInsert = rows.map((row) => ({
      workspaceId: req.user.workspaceId,
      companyName: row['company_name'] ?? row['Company'] ?? row['Name'] ?? '',
      domain: row['domain'] ?? row['Domain'] ?? null,
      industry: row['industry'] ?? row['Industry'] ?? null,
      country: row['country'] ?? row['Country'] ?? null,
      employeeSize: row['employee_size'] ? parseInt(row['employee_size']!) : null,
      source: 'csv_import',
    })).filter((r) => r.companyName)

    if (toInsert.length === 0) return reply.code(400).send({ error: 'No valid rows found' })

    const inserted = await db.insert(accounts).values(toInsert).returning()
    return reply.code(201).send({ data: { imported: inserted.length } })
  })

  // GET /accounts/:id/contacts
  app.get('/:id/contacts', auth, async (req) => {
    const { id } = req.params as { id: string }
    const rows = await db.query.contacts.findMany({
      where: and(eq(contacts.accountId, id), eq(contacts.workspaceId, req.user.workspaceId)),
      orderBy: desc(contacts.score),
    })
    return { data: rows }
  })
}
