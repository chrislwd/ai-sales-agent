import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { eq, and, desc, count, ilike } from 'drizzle-orm'
import { db, contacts, accounts } from '../../db/index.js'
import { requireMinRole } from '../auth/rbac.js'
import { scoreContact } from '../accounts/accounts.service.js'
import { logActivity } from '../analytics/activity.js'
import { parse as csvParse } from 'csv-parse/sync'

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

    const [rows, [countRow]] = await Promise.all([
      db.query.contacts.findMany({
        where,
        orderBy: desc(contacts.score),
        limit: parseInt(pageSize),
        offset,
      }),
      db.select({ total: count() }).from(contacts).where(where),
    ])

    return { data: rows, total: Number(countRow?.total ?? 0), page: parseInt(page), pageSize: parseInt(pageSize) }
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

  // POST /contacts/import — CSV upload
  app.post('/import', {
    onRequest: [app.authenticate],
  }, async (req, reply) => {
    const data = await req.file()
    if (!data) return reply.code(400).send({ error: 'No file provided' })

    const buffer = await data.toBuffer()
    const rows = csvParse(buffer, { columns: true, skip_empty_lines: true, trim: true }) as Record<string, string>[]

    if (rows.length === 0) return reply.code(400).send({ error: 'No rows found in CSV' })

    const workspaceId = req.user.workspaceId
    let imported = 0
    let skipped = 0
    let accountsCreated = 0

    // Cache account lookups to avoid repeated queries
    const accountCache = new Map<string, string>() // companyName -> accountId

    for (const row of rows) {
      const email = (row['email'] ?? row['Email'] ?? '').trim()
      if (!email) {
        skipped++
        continue
      }

      // Check for duplicate email in workspace
      const existing = await db.query.contacts.findFirst({
        where: and(eq(contacts.email, email), eq(contacts.workspaceId, workspaceId)),
        columns: { id: true },
      })
      if (existing) {
        skipped++
        continue
      }

      const firstName = (row['first_name'] ?? row['firstName'] ?? row['First Name'] ?? '').trim()
      const lastName = (row['last_name'] ?? row['lastName'] ?? row['Last Name'] ?? '').trim()
      const title = (row['title'] ?? row['Title'] ?? '').trim() || null
      const seniority = (row['seniority'] ?? row['Seniority'] ?? '').trim() || null
      const jobFunction = (row['job_function'] ?? row['jobFunction'] ?? row['Job Function'] ?? '').trim() || null
      const country = (row['country'] ?? row['Country'] ?? '').trim() || null
      const phone = (row['phone'] ?? row['Phone'] ?? '').trim() || null
      const linkedinUrl = (row['linkedin_url'] ?? row['linkedinUrl'] ?? row['LinkedIn URL'] ?? '').trim() || null
      const companyName = (row['company_name'] ?? row['account_name'] ?? row['Company'] ?? row['Account'] ?? '').trim()

      if (!firstName && !lastName) {
        skipped++
        continue
      }

      // Resolve accountId
      let accountId: string | null = null

      if (companyName) {
        // Check cache first
        const cached = accountCache.get(companyName.toLowerCase())
        if (cached) {
          accountId = cached
        } else {
          // Look up existing account by name in workspace
          const existingAccount = await db.query.accounts.findFirst({
            where: and(
              eq(accounts.workspaceId, workspaceId),
              ilike(accounts.companyName, companyName),
            ),
            columns: { id: true },
          })

          if (existingAccount) {
            accountId = existingAccount.id
          } else {
            // Auto-create account
            const [newAccount] = await db.insert(accounts).values({
              workspaceId,
              companyName,
              source: 'csv_import',
            }).returning()
            accountId = newAccount!.id
            accountsCreated++
          }
          accountCache.set(companyName.toLowerCase(), accountId)
        }
      }

      if (!accountId) {
        // Contacts require an accountId — create a placeholder account
        const placeholder = `[Unassigned] ${email.split('@')[1] ?? 'Unknown'}`
        const cached = accountCache.get(placeholder.toLowerCase())
        if (cached) {
          accountId = cached
        } else {
          const existingPlaceholder = await db.query.accounts.findFirst({
            where: and(
              eq(accounts.workspaceId, workspaceId),
              ilike(accounts.companyName, placeholder),
            ),
            columns: { id: true },
          })
          if (existingPlaceholder) {
            accountId = existingPlaceholder.id
          } else {
            const [newAccount] = await db.insert(accounts).values({
              workspaceId,
              companyName: placeholder,
              source: 'csv_import',
            }).returning()
            accountId = newAccount!.id
            accountsCreated++
          }
          accountCache.set(placeholder.toLowerCase(), accountId)
        }
      }

      // Insert contact
      const [contact] = await db.insert(contacts).values({
        workspaceId,
        accountId,
        firstName: firstName || email.split('@')[0]!,
        lastName,
        email,
        title,
        seniority,
        jobFunction,
        country,
        phone,
        linkedinUrl,
      }).returning()

      // Score the contact against ICP
      try {
        const score = await scoreContact(contact!.id, workspaceId)
        await db.update(contacts).set({ score }).where(eq(contacts.id, contact!.id))
      } catch {
        // Scoring failure should not block import
      }

      imported++
    }

    // Log activity
    await logActivity({
      workspaceId,
      objectType: 'contact',
      objectId: workspaceId,
      activityType: 'contacts_imported',
      actorType: 'user',
      actorId: req.user.sub,
      payload: { imported, skipped, accountsCreated },
    })

    return reply.code(201).send({ data: { imported, skipped, accountsCreated } })
  })
}
