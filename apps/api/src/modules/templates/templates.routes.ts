import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { eq, and, desc } from 'drizzle-orm'
import { db, emailTemplates } from '../../db/index.js'
import { requireMinRole } from '../auth/rbac.js'
import { env } from '../../config/env.js'

const CATEGORIES = [
  'cold_outbound', 'follow_up', 'breakup', 're_engagement', 'post_demo', 'referral', 'custom',
] as const

const templateSchema = z.object({
  name: z.string().min(1),
  category: z.enum(CATEGORIES).default('custom'),
  subject: z.string().min(1),
  body: z.string().min(1),
  variables: z.array(z.string()).default([]),
  isShared: z.boolean().default(true),
})

const generateSchema = z.object({
  category: z.enum(CATEGORIES),
  targetIndustry: z.string().min(1),
  targetRole: z.string().min(1),
  tone: z.string().min(1),
})

export async function templatesRoutes(app: FastifyInstance) {
  const auth = { onRequest: [app.authenticate] }
  const managerAuth = { onRequest: [app.authenticate, requireMinRole('manager')] }

  // GET /templates
  app.get('/', auth, async (req) => {
    const { category } = req.query as { category?: string }
    const conditions = [eq(emailTemplates.workspaceId, req.user.workspaceId)]
    if (category && CATEGORIES.includes(category as any)) {
      conditions.push(eq(emailTemplates.category, category as (typeof CATEGORIES)[number]))
    }

    const rows = await db.query.emailTemplates.findMany({
      where: and(...conditions),
      orderBy: desc(emailTemplates.createdAt),
    })
    return { data: rows }
  })

  // POST /templates
  app.post('/', auth, async (req, reply) => {
    const body = templateSchema.parse(req.body)

    const [template] = await db.insert(emailTemplates).values({
      ...body,
      workspaceId: req.user.workspaceId,
      createdBy: req.user.sub,
    }).returning()

    return reply.code(201).send({ data: template })
  })

  // GET /templates/:id
  app.get('/:id', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const template = await db.query.emailTemplates.findFirst({
      where: and(eq(emailTemplates.id, id), eq(emailTemplates.workspaceId, req.user.workspaceId)),
    })
    if (!template) return reply.code(404).send({ error: 'Not found' })
    return { data: template }
  })

  // PATCH /templates/:id
  app.patch('/:id', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = templateSchema.partial().parse(req.body)

    const [updated] = await db.update(emailTemplates)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(emailTemplates.id, id), eq(emailTemplates.workspaceId, req.user.workspaceId)))
      .returning()

    if (!updated) return reply.code(404).send({ error: 'Not found' })
    return { data: updated }
  })

  // DELETE /templates/:id
  app.delete('/:id', managerAuth, async (req, reply) => {
    const { id } = req.params as { id: string }
    await db.delete(emailTemplates).where(
      and(eq(emailTemplates.id, id), eq(emailTemplates.workspaceId, req.user.workspaceId)),
    )
    return { data: { ok: true } }
  })

  // POST /templates/generate
  app.post('/generate', auth, async (req, reply) => {
    const body = generateSchema.parse(req.body)

    if (!env.ANTHROPIC_API_KEY) {
      return reply.code(503).send({ error: 'AI generation is not configured' })
    }

    const categoryLabel = body.category.replace(/_/g, ' ')

    const prompt = `You are an expert B2B sales copywriter. Generate a professional ${categoryLabel} email template for the following:

Target Industry: ${body.targetIndustry}
Target Role: ${body.targetRole}
Tone: ${body.tone}

Requirements:
- Use template variables with double curly braces: {{contact.firstName}}, {{contact.lastName}}, {{account.companyName}}, {{contact.title}}
- Keep the subject line concise and compelling (under 60 characters)
- Body should be 3-5 short paragraphs
- Include a clear call to action
- Be conversational but professional

Respond in this exact JSON format only, no other text:
{"subject": "...", "body": "...", "variables": ["contact.firstName", ...]}`

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: env.AI_MODEL,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      app.log.error(`AI generation failed: ${err}`)
      return reply.code(502).send({ error: 'AI generation failed' })
    }

    const aiResponse = await res.json() as { content: { type: string; text: string }[] }
    const text = aiResponse.content?.[0]?.text ?? ''

    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('No JSON found in response')
      const generated = JSON.parse(jsonMatch[0]) as { subject: string; body: string; variables: string[] }
      return {
        data: {
          category: body.category,
          subject: generated.subject,
          body: generated.body,
          variables: generated.variables ?? [],
        },
      }
    } catch {
      app.log.error(`Failed to parse AI response: ${text}`)
      return reply.code(502).send({ error: 'Failed to parse AI response' })
    }
  })
}
