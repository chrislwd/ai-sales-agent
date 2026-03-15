import type { FastifyInstance } from 'fastify'
import { eq, and } from 'drizzle-orm'
import { db, emailAccounts } from '../../db/index.js'
import {
  getGoogleAuthUrl,
  exchangeGoogleCode,
  refreshGoogleToken,
  getGoogleUserEmail,
  sendViaGmail,
} from './google.client.js'
import { requireMinRole } from '../auth/rbac.js'
import { env } from '../../config/env.js'

export async function emailAccountsRoutes(app: FastifyInstance) {
  const auth = { onRequest: [app.authenticate] }
  const adminAuth = { onRequest: [app.authenticate, requireMinRole('admin')] }

  // ─── GET /email-accounts — list workspace email accounts ───────────────────

  app.get('/', auth, async (req) => {
    const accounts = await db.query.emailAccounts.findMany({
      where: eq(emailAccounts.workspaceId, req.user.workspaceId),
    })

    return {
      data: accounts.map((a) => ({
        id: a.id,
        email: a.email,
        displayName: a.displayName,
        provider: a.provider,
        isActive: a.isActive,
        dailySentCount: a.dailySentCount,
        createdAt: a.createdAt,
      })),
    }
  })

  // ─── GET /email-accounts/google/connect — redirect to Google OAuth ─────────

  app.get('/google/connect', adminAuth, async (req, reply) => {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
      return reply.code(503).send({ error: 'Google OAuth not configured' })
    }

    // Encode workspaceId and userId in state param
    const state = Buffer.from(
      JSON.stringify({ workspaceId: req.user.workspaceId, userId: req.user.sub }),
    ).toString('base64url')

    const url = getGoogleAuthUrl(state)
    return reply.redirect(url)
  })

  // ─── GET /email-accounts/google/callback — handle OAuth callback ───────────

  app.get('/google/callback', async (req, reply) => {
    const { code, error, state } = req.query as {
      code?: string
      error?: string
      state?: string
    }

    if (error || !code) {
      return reply.redirect(
        `${env.CORS_ORIGIN}/dashboard/settings?email_account=error&reason=${error ?? 'no_code'}`,
      )
    }

    if (!state) {
      return reply.redirect(
        `${env.CORS_ORIGIN}/dashboard/settings?email_account=error&reason=missing_state`,
      )
    }

    let stateData: { workspaceId: string; userId: string }
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64url').toString())
    } catch {
      return reply.redirect(
        `${env.CORS_ORIGIN}/dashboard/settings?email_account=error&reason=invalid_state`,
      )
    }

    try {
      const tokens = await exchangeGoogleCode(code)
      const userInfo = await getGoogleUserEmail(tokens.access_token)
      const expiresAt = new Date(Date.now() + tokens.expires_in * 1000)

      // Upsert email account — update tokens if same email already connected
      await db
        .insert(emailAccounts)
        .values({
          workspaceId: stateData.workspaceId,
          userId: stateData.userId,
          email: userInfo.email,
          displayName: userInfo.name ?? userInfo.email,
          provider: 'google',
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          tokenExpiresAt: expiresAt,
          isActive: true,
        })
        .onConflictDoNothing()
        // If a row with same email already exists we update it
        .then(async (result) => {
          // Check if the account already exists and update tokens
          const existing = await db.query.emailAccounts.findFirst({
            where: and(
              eq(emailAccounts.workspaceId, stateData.workspaceId),
              eq(emailAccounts.email, userInfo.email),
            ),
          })
          if (existing) {
            await db
              .update(emailAccounts)
              .set({
                accessToken: tokens.access_token,
                refreshToken: tokens.refresh_token,
                tokenExpiresAt: expiresAt,
                isActive: true,
              })
              .where(eq(emailAccounts.id, existing.id))
          }
        })

      return reply.redirect(
        `${env.CORS_ORIGIN}/dashboard/settings?email_account=connected&email=${encodeURIComponent(userInfo.email)}`,
      )
    } catch (err) {
      app.log.error(err, 'Google OAuth callback failed')
      return reply.redirect(
        `${env.CORS_ORIGIN}/dashboard/settings?email_account=error&reason=token_exchange`,
      )
    }
  })

  // ─── DELETE /email-accounts/:id — disconnect email account ─────────────────

  app.delete('/:id', adminAuth, async (req, reply) => {
    const { id } = req.params as { id: string }

    const [updated] = await db
      .update(emailAccounts)
      .set({ isActive: false, accessToken: null, refreshToken: null })
      .where(
        and(
          eq(emailAccounts.id, id),
          eq(emailAccounts.workspaceId, req.user.workspaceId),
        ),
      )
      .returning({ id: emailAccounts.id })

    if (!updated) {
      return reply.code(404).send({ error: 'Email account not found' })
    }

    return { data: { ok: true } }
  })

  // ─── POST /email-accounts/:id/test — send test email ──────────────────────

  app.post('/:id/test', adminAuth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const { to } = (req.body as { to?: string }) ?? {}

    const account = await db.query.emailAccounts.findFirst({
      where: and(
        eq(emailAccounts.id, id),
        eq(emailAccounts.workspaceId, req.user.workspaceId),
      ),
    })

    if (!account) {
      return reply.code(404).send({ error: 'Email account not found' })
    }

    if (!account.isActive || account.provider !== 'google') {
      return reply.code(400).send({ error: 'Email account is not active or not a Google account' })
    }

    // Refresh token if expired
    let accessToken = account.accessToken!
    if (account.tokenExpiresAt && account.tokenExpiresAt < new Date()) {
      if (!account.refreshToken) {
        return reply.code(400).send({ error: 'Refresh token missing — please reconnect the account' })
      }
      const refreshed = await refreshGoogleToken(account.refreshToken)
      accessToken = refreshed.access_token
      const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000)
      await db
        .update(emailAccounts)
        .set({ accessToken: refreshed.access_token, tokenExpiresAt: expiresAt })
        .where(eq(emailAccounts.id, id))
    }

    const recipient = to ?? req.user.email ?? account.email
    const result = await sendViaGmail(accessToken, {
      to: recipient,
      subject: 'Test email from AI Sales Agent',
      body: '<p>This is a test email to verify your Google email account connection.</p><p>If you received this, your connection is working correctly.</p>',
      from: account.displayName
        ? `${account.displayName} <${account.email}>`
        : account.email,
    })

    return { data: { ok: true, messageId: result.messageId, sentTo: recipient } }
  })
}
