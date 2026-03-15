import { Resend } from 'resend'
import { env } from '../config/env.js'

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

export async function sendEmail(params: SendEmailParams): Promise<SendResult> {
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
