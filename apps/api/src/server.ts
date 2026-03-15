import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import rateLimit from '@fastify/rate-limit'
import multipart from '@fastify/multipart'
import { env } from './config/env.js'
import { authRoutes } from './modules/auth/auth.routes.js'
import { workspaceRoutes } from './modules/workspace/workspace.routes.js'
import { icpRoutes } from './modules/icp/icp.routes.js'
import { accountsRoutes } from './modules/accounts/accounts.routes.js'
import { contactsRoutes } from './modules/contacts/contacts.routes.js'
import { sequencesRoutes } from './modules/sequences/sequences.routes.js'
import { messagesRoutes } from './modules/messages/messages.routes.js'
import { meetingsRoutes } from './modules/meetings/meetings.routes.js'
import { analyticsRoutes } from './modules/analytics/analytics.routes.js'
import { crmRoutes } from './modules/crm/crm.routes.js'
import { startWorkers } from './queues/worker.js'

const app = Fastify({ logger: { level: env.NODE_ENV === 'production' ? 'warn' : 'info' } })

// ─── Plugins ──────────────────────────────────────────────────────────────────

await app.register(cors, { origin: env.CORS_ORIGIN, credentials: true })
await app.register(jwt, {
  secret: env.JWT_SECRET,
  sign: { expiresIn: env.JWT_EXPIRES_IN },
})
await app.register(rateLimit, { max: 200, timeWindow: '1 minute' })
await app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024 } })

// ─── Auth decorator ───────────────────────────────────────────────────────────

app.decorate('authenticate', async function (req: any, reply: any) {
  try {
    await req.jwtVerify()
  } catch {
    return reply.code(401).send({ error: 'Unauthorized' })
  }
})

// Attach email to req.user from DB for invitation acceptance
app.addHook('onRequest', async (req) => {
  // noop – req.user is populated by jwtVerify
})

// ─── Routes ───────────────────────────────────────────────────────────────────

const V1 = '/api/v1'

await app.register(authRoutes, { prefix: `${V1}/auth` })
await app.register(workspaceRoutes, { prefix: `${V1}/workspace` })
await app.register(icpRoutes, { prefix: `${V1}/icp` })
await app.register(accountsRoutes, { prefix: `${V1}/accounts` })
await app.register(contactsRoutes, { prefix: `${V1}/contacts` })
await app.register(sequencesRoutes, { prefix: `${V1}/sequences` })
await app.register(messagesRoutes, { prefix: `${V1}/messages` })
await app.register(meetingsRoutes, { prefix: `${V1}/meetings` })
await app.register(analyticsRoutes, { prefix: `${V1}/analytics` })
await app.register(crmRoutes, { prefix: `${V1}/crm` })

// ─── Health ───────────────────────────────────────────────────────────────────

app.get('/api/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }))

// ─── Error handler ────────────────────────────────────────────────────────────

app.setErrorHandler((error, req, reply) => {
  if (error.name === 'ZodError') {
    return reply.code(400).send({ error: 'Validation error', details: error.message })
  }
  app.log.error(error)
  return reply.code(error.statusCode ?? 500).send({ error: error.message })
})

// ─── Start ────────────────────────────────────────────────────────────────────

await app.listen({ port: env.API_PORT, host: env.API_HOST })
console.log(`API listening on ${env.API_HOST}:${env.API_PORT}`)

if (env.NODE_ENV !== 'test') {
  startWorkers()
}

// ─── TypeScript augmentation ──────────────────────────────────────────────────

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      sub: string
      workspaceId: string
      role: string
      email?: string
    }
    user: {
      sub: string
      workspaceId: string
      role: string
      email?: string
    }
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
}
