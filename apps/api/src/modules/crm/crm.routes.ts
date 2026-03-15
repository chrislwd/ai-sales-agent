import type { FastifyInstance } from 'fastify'
import { eq, and } from 'drizzle-orm'
import { db, crmConnections } from '../../db/index.js'
import { HubSpotClient } from './hubspot.client.js'
import { syncContact } from './crm.service.js'
import { requireMinRole } from '../auth/rbac.js'
import { env } from '../../config/env.js'

export async function crmRoutes(app: FastifyInstance) {
  const adminAuth = { onRequest: [app.authenticate, requireMinRole('admin')] }
  const auth = { onRequest: [app.authenticate] }

  // GET /crm/connections — list active connections
  app.get('/connections', auth, async (req) => {
    const connections = await db.query.crmConnections.findMany({
      where: eq(crmConnections.workspaceId, req.user.workspaceId),
    })
    // strip tokens from response
    return {
      data: connections.map((c) => ({
        id: c.id,
        provider: c.provider,
        isActive: c.isActive,
        lastSyncAt: c.lastSyncAt,
        portalId: c.portalId,
        createdAt: c.createdAt,
      })),
    }
  })

  // GET /crm/hubspot/connect — redirect to HubSpot OAuth
  app.get('/hubspot/connect', adminAuth, async (req, reply) => {
    if (!env.HUBSPOT_CLIENT_ID) {
      return reply.code(503).send({ error: 'HubSpot integration not configured' })
    }
    const url = HubSpotClient.getAuthUrl()
    return reply.redirect(url)
  })

  // GET /crm/hubspot/callback — OAuth callback
  app.get('/hubspot/callback', async (req, reply) => {
    const { code, error } = req.query as { code?: string; error?: string }

    if (error || !code) {
      return reply.redirect(
        `${env.CORS_ORIGIN}/dashboard/settings?crm=error&reason=${error ?? 'no_code'}`,
      )
    }

    try {
      // exchange code — but we need workspaceId which isn't in this callback
      // In production: store state param with workspaceId; for now use a session cookie
      // This is a simplified version — state param pattern should be used in production
      const tokens = await HubSpotClient.exchangeCode(code)
      const expiresAt = new Date(Date.now() + tokens.expires_in * 1000)

      // Get portal info to identify workspace (simplified: use first workspace from token)
      // In production: encode workspaceId in OAuth state parameter
      const portalRes = await fetch('https://api.hubapi.com/oauth/v1/access-tokens/' + tokens.access_token)
      const portalInfo = portalRes.ok ? await portalRes.json() as Record<string, unknown> : {} as Record<string, unknown>

      return reply.redirect(
        `${env.CORS_ORIGIN}/dashboard/settings?crm=connected&portal=${portalInfo.hub_id ?? 'unknown'}`,
      )
    } catch (err) {
      return reply.redirect(
        `${env.CORS_ORIGIN}/dashboard/settings?crm=error&reason=token_exchange`,
      )
    }
  })

  // POST /crm/hubspot/connect-manual — connect with access token directly (for testing/dev)
  app.post('/hubspot/connect-manual', adminAuth, async (req, reply) => {
    const { accessToken, refreshToken, portalId } = req.body as {
      accessToken: string
      refreshToken?: string
      portalId?: string
    }

    const [connection] = await db
      .insert(crmConnections)
      .values({
        workspaceId: req.user.workspaceId,
        provider: 'hubspot',
        accessToken,
        refreshToken,
        portalId,
        isActive: true,
      })
      .onConflictDoUpdate({
        target: [crmConnections.workspaceId, crmConnections.provider],
        set: { accessToken, refreshToken, portalId, isActive: true },
      })
      .returning()

    return reply.code(201).send({
      data: {
        id: connection!.id,
        provider: connection!.provider,
        isActive: connection!.isActive,
        portalId: connection!.portalId,
      },
    })
  })

  // DELETE /crm/connections/:id — disconnect
  app.delete('/connections/:id', adminAuth, async (req, reply) => {
    const { id } = req.params as { id: string }
    await db.update(crmConnections)
      .set({ isActive: false })
      .where(and(eq(crmConnections.id, id), eq(crmConnections.workspaceId, req.user.workspaceId)))
    return { data: { ok: true } }
  })

  // POST /crm/sync/contact/:id — manually trigger sync for a contact
  app.post('/sync/contact/:id', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    await syncContact(id, req.user.workspaceId)
    return { data: { ok: true } }
  })
}
