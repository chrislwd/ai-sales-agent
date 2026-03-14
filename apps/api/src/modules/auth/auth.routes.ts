import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db, users, workspaces, workspaceMembers, refreshTokens } from '../../db/index.js'
import { eq, and } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { env } from '../../config/env.js'
import { logActivity } from '../analytics/activity.js'

const registerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  workspaceName: z.string().min(1),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
})

const refreshSchema = z.object({
  refreshToken: z.string(),
})

export async function authRoutes(app: FastifyInstance) {
  // POST /auth/register — create user + workspace
  app.post('/register', async (req, reply) => {
    const body = registerSchema.parse(req.body)

    const existing = await db.query.users.findFirst({
      where: eq(users.email, body.email),
    })
    if (existing) return reply.code(409).send({ error: 'Email already in use' })

    const passwordHash = await bcrypt.hash(body.password, 12)
    const slug = body.workspaceName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-')

    const [user] = await db.insert(users).values({
      name: body.name,
      email: body.email,
      passwordHash,
    }).returning()

    const [workspace] = await db.insert(workspaces).values({
      name: body.workspaceName,
      slug: `${slug}-${Date.now()}`,
    }).returning()

    await db.insert(workspaceMembers).values({
      userId: user!.id,
      workspaceId: workspace!.id,
      role: 'owner',
    })

    const tokens = await issueTokens(app, user!.id, workspace!.id, 'owner')
    return reply.code(201).send({ data: { user: sanitizeUser(user!), workspace, tokens } })
  })

  // POST /auth/login
  app.post('/login', async (req, reply) => {
    const body = loginSchema.parse(req.body)

    const user = await db.query.users.findFirst({ where: eq(users.email, body.email) })
    if (!user?.passwordHash) return reply.code(401).send({ error: 'Invalid credentials' })

    const valid = await bcrypt.compare(body.password, user.passwordHash)
    if (!valid) return reply.code(401).send({ error: 'Invalid credentials' })

    // find first workspace membership
    const membership = await db.query.workspaceMembers.findFirst({
      where: eq(workspaceMembers.userId, user.id),
      with: { workspace: true },
    })
    if (!membership) return reply.code(403).send({ error: 'No workspace access' })

    const tokens = await issueTokens(app, user.id, membership.workspaceId, membership.role)
    return { data: { user: sanitizeUser(user), workspace: membership.workspace, tokens } }
  })

  // POST /auth/refresh
  app.post('/refresh', async (req, reply) => {
    const { refreshToken } = refreshSchema.parse(req.body)

    const stored = await db.query.refreshTokens.findFirst({
      where: eq(refreshTokens.token, refreshToken),
    })
    if (!stored || stored.expiresAt < new Date()) {
      return reply.code(401).send({ error: 'Invalid or expired refresh token' })
    }

    // delete used token (rotation)
    await db.delete(refreshTokens).where(eq(refreshTokens.token, refreshToken))

    const payload = app.jwt.decode<{ sub: string; workspaceId: string; role: string }>(refreshToken)
    if (!payload) return reply.code(401).send({ error: 'Invalid token' })

    const membership = await db.query.workspaceMembers.findFirst({
      where: and(
        eq(workspaceMembers.userId, payload.sub),
        eq(workspaceMembers.workspaceId, payload.workspaceId),
      ),
    })
    if (!membership) return reply.code(401).send({ error: 'No access' })

    const tokens = await issueTokens(app, payload.sub, payload.workspaceId, membership.role)
    return { data: { tokens } }
  })

  // POST /auth/logout
  app.post('/logout', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { refreshToken } = refreshSchema.parse(req.body)
    await db.delete(refreshTokens).where(eq(refreshTokens.token, refreshToken))
    return { data: { ok: true } }
  })

  // GET /auth/me
  app.get('/me', { onRequest: [app.authenticate] }, async (req) => {
    const user = await db.query.users.findFirst({ where: eq(users.id, req.user.sub) })
    if (!user) throw new Error('User not found')

    const memberships = await db.query.workspaceMembers.findMany({
      where: eq(workspaceMembers.userId, user.id),
      with: { workspace: true },
    })

    return { data: { user: sanitizeUser(user), memberships } }
  })
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function issueTokens(
  app: FastifyInstance,
  userId: string,
  workspaceId: string,
  role: string,
) {
  const accessToken = app.jwt.sign(
    { sub: userId, workspaceId, role },
    { expiresIn: env.JWT_EXPIRES_IN },
  )
  const rawRefresh = app.jwt.sign(
    { sub: userId, workspaceId, role },
    { expiresIn: env.JWT_REFRESH_EXPIRES_IN },
  )

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  await db.insert(refreshTokens).values({ userId, token: rawRefresh, expiresAt })

  return { accessToken, refreshToken: rawRefresh }
}

function sanitizeUser(user: { id: string; name: string; email: string; avatarUrl: string | null }) {
  return { id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl }
}
