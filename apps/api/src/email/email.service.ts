import { Resend } from 'resend'
import { eq, and } from 'drizzle-orm'
import { env } from '../config/env.js'
import { db, emailAccounts } from '../db/index.js'
import {
  sendViaGmail,
  refreshGoogleToken,
} from '../modules/email-accounts/google.client.js'

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null

interface SendEmailParams {
  to: string
  toName?: string
  subject: string
  body: string    // plain text or HTML
  workspaceId: string
  replyTo?: string
}

interface SendResult {
  success: boolean
  messageId?: string
  error?: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getActiveGoogleAccount(workspaceId: string) {
  return db.query.emailAccounts.findFirst({
    where: and(
      eq(emailAccounts.workspaceId, workspaceId),
      eq(emailAccounts.provider, 'google'),
      eq(emailAccounts.isActive, true),
    ),
  })
}

async function getValidAccessToken(account: {
  id: string
  accessToken: string | null
  refreshToken: string | null
  tokenExpiresAt: Date | null
}): Promise<string | null> {
  if (!account.accessToken) return null

  // If token is still valid, use it
  if (account.tokenExpiresAt && account.tokenExpiresAt > new Date()) {
    return account.accessToken
  }

  // Try to refresh
  if (!account.refreshToken) return null

  try {
    const refreshed = await refreshGoogleToken(account.refreshToken)
    const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000)
    await db
      .update(emailAccounts)
      .set({ accessToken: refreshed.access_token, tokenExpiresAt: expiresAt })
      .where(eq(emailAccounts.id, account.id))
    return refreshed.access_token
  } catch {
    return null
  }
}

// ─── Send email (Gmail preferred, Resend fallback) ───────────────────────────

export async function sendEmail(params: SendEmailParams): Promise<SendResult> {
  // Try sending via connected Google account first
  const googleAccount = await getActiveGoogleAccount(params.workspaceId)

  if (googleAccount) {
    const accessToken = await getValidAccessToken(googleAccount)

    if (accessToken) {
      try {
        const result = await sendViaGmail(accessToken, {
          to: params.toName ? `${params.toName} <${params.to}>` : params.to,
          subject: params.subject,
          body: params.body,
          from: googleAccount.displayName
            ? `${googleAccount.displayName} <${googleAccount.email}>`
            : googleAccount.email,
        })

        // Increment daily sent count
        await db
          .update(emailAccounts)
          .set({ dailySentCount: (googleAccount.dailySentCount ?? 0) + 1 })
          .where(eq(emailAccounts.id, googleAccount.id))

        return { success: true, messageId: result.messageId }
      } catch (err) {
        // Log the Gmail failure and fall through to Resend
        console.warn(
          `[email:gmail] Failed for workspace ${params.workspaceId}, falling back to Resend:`,
          err instanceof Error ? err.message : err,
        )
      }
    }
  }

  // Fall back to Resend
  if (!env.EMAIL_ENABLED || !resend) {
    console.log(`[email:mock] To: ${params.to} | Subject: ${params.subject}`)
    return { success: true, messageId: `mock-${Date.now()}` }
  }

  try {
    const { data, error } = await resend.emails.send({
      from: env.EMAIL_FROM,
      to: params.toName ? `${params.toName} <${params.to}>` : params.to,
      subject: params.subject,
      html: params.body.includes('<') ? params.body : `<pre style="font-family:sans-serif">${params.body}</pre>`,
      reply_to: params.replyTo,
    })

    if (error) return { success: false, error: error.message }
    return { success: true, messageId: data?.id }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: msg }
  }
}
